//! What the page answered of each object, kept until the page says that
//! object changed. A build then asks the page only of what changed: a still
//! scene of a thousand models with one light moving asks of the light.
//!
//! The page follows each object on its own, and hands [`Answers::begin`] the
//! objects whose reads changed since the last build. Everything else is
//! answered from here. The same set is what a renderer that keeps its nodes
//! between builds would be told: which nodes to map again.
//!
//! What an object answers is kept in the order it was asked, and the next
//! build asks in the same order, so finding an answer is one comparison.

use std::cell::RefCell;
use std::collections::HashMap;
use std::hash::{BuildHasherDefault, Hasher};
use std::rc::Rc;

use crate::source::{NO_OBJECT, Passes, Snippets, Table, VIEW};

/// What is asked, with the member's number: the key of an answer.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Kind {
    Number,
    Boolean,
    Color,
    Vector,
    Quaternion,
    Url,
    Object,
    Objects,
    Slots,
    Authored,
    Matrices,
    Snippets,
    Passes,
    Table,
    Arrivals,
    PictureId,
    GeometryId,
    TableId,
}

/// One answer of the page, as it crossed.
#[derive(Clone)]
pub enum Answer {
    Number(Option<f64>),
    Boolean(Option<bool>),
    Color(Option<[f32; 4]>),
    Vector(Option<[f32; 3]>),
    Quaternion(Option<[f32; 4]>),
    Url(Option<String>),
    Object(Option<u32>),
    Objects(Rc<[u32]>),
    Slots(Rc<[u32]>),
    Authored(bool),
    Matrices(Rc<[f32]>),
    Snippets(Option<Rc<Snippets>>),
    Passes(Option<Rc<Passes>>),
    Table(Option<Table>),
    Arrivals,
    PictureId(Option<u32>),
    GeometryId(Option<u32>),
    TableId(Option<u32>),
}

/// Handles are small numbers the page counts up: multiplying spreads them.
#[derive(Default)]
pub struct Handles(u64);

impl Hasher for Handles {
    fn finish(&self) -> u64 {
        self.0
    }
    fn write(&mut self, bytes: &[u8]) {
        for byte in bytes {
            self.0 = (self.0.rotate_left(8) ^ u64::from(*byte)).wrapping_mul(0x9e37_79b9_7f4a_7c15);
        }
    }
    fn write_u32(&mut self, n: u32) {
        self.0 = u64::from(n).wrapping_mul(0x9e37_79b9_7f4a_7c15);
    }
}

/// One object's answers, and the build that last reached it.
#[derive(Default)]
struct Asked {
    seen: u32,
    /// Where the next answer in the order they were asked is.
    next: usize,
    answers: Vec<(u32, Answer)>,
}

impl Asked {
    fn find(&mut self, key: u32) -> Option<&Answer> {
        let at = if self.answers.get(self.next).is_some_and(|(k, _)| *k == key) {
            self.next
        } else {
            self.answers.iter().position(|(k, _)| *k == key)?
        };
        self.next = at + 1;
        Some(&self.answers[at].1)
    }
}

#[derive(Default)]
struct Inner {
    places: HashMap<u32, usize, BuildHasherDefault<Handles>>,
    asked: Vec<Asked>,
    free: Vec<usize>,
    /// The object asked of last and its place: most reads follow one another
    /// on one object.
    last: Option<(u32, usize)>,
    build: u32,
    crossed: u32,
}

impl Inner {
    fn place(&mut self, o: u32) -> usize {
        if let Some((last, at)) = self.last
            && last == o
        {
            return at;
        }
        let at = match self.places.get(&o) {
            Some(&at) => at,
            None => {
                let at = self.free.pop().unwrap_or_else(|| {
                    self.asked.push(Asked::default());
                    self.asked.len() - 1
                });
                self.places.insert(o, at);
                at
            }
        };
        self.last = Some((o, at));
        at
    }

    fn see(&mut self, o: u32) -> usize {
        let at = self.place(o);
        self.asked[at].seen = self.build;
        at
    }

    /// The objects an answer names are in the scene as long as it is.
    fn see_named(&mut self, answer: &Answer) {
        named(answer, |o| {
            self.see(o);
        });
    }
}

/// Each object `answer` names.
fn named(answer: &Answer, mut each: impl FnMut(u32)) {
    let mut each = |o: u32| {
        if o != NO_OBJECT {
            each(o);
        }
    };
    match answer {
        Answer::Object(Some(o)) => each(*o),
        Answer::Objects(all) | Answer::Slots(all) => all.iter().copied().for_each(each),
        Answer::Snippets(Some(s)) => s.textures.iter().for_each(|(_, o)| each(*o)),
        Answer::Passes(Some(p)) => p.textures.iter().for_each(|(_, o)| each(*o)),
        _ => {}
    }
}

/// The answers of a view's objects.
#[derive(Default)]
pub struct Answers {
    inner: RefCell<Inner>,
}

impl Answers {
    /// What `o` answered for `kind` of member `p`, asking the page with
    /// `read` where it has not answered since it last changed.
    pub fn answer(&self, o: u32, kind: Kind, p: u32, read: impl FnOnce() -> Answer) -> Answer {
        let key = (kind as u32) << 24 | p;
        {
            let mut inner = self.inner.borrow_mut();
            let at = inner.see(o);
            if let Some(found) = inner.asked[at].find(key) {
                let found = found.clone();
                inner.see_named(&found);
                return found;
            }
        }
        // Not borrowed while the page answers.
        let answer = read();
        let mut inner = self.inner.borrow_mut();
        inner.crossed += 1;
        let at = inner.place(o);
        let asked = &mut inner.asked[at];
        asked.answers.push((key, answer.clone()));
        asked.next = asked.answers.len();
        inner.see_named(&answer);
        answer
    }

    /// Forgets what `changed` answered: the next build asks them again.
    pub fn clear(&self, changed: &[u32]) {
        let mut inner = self.inner.borrow_mut();
        for o in changed {
            if let Some(&at) = inner.places.get(o) {
                let asked = &mut inner.asked[at];
                asked.answers.clear();
                asked.next = 0;
            }
        }
    }

    /// A build starts: what changed is asked again.
    pub fn begin(&self, changed: &[u32]) {
        self.clear(changed);
        let mut inner = self.inner.borrow_mut();
        inner.build = inner.build.wrapping_add(1);
        inner.crossed = 0;
    }

    /// A build ended: what no answer kept names any more, from the view
    /// down, has left the scene, and is forgotten here and returned, for the
    /// page and [`crate::source::Kept`] to let go of as well.
    ///
    /// What the build read is in the scene. What it passed by (the material
    /// of a model that draws nothing now) is too, where an answer of what it
    /// read still names it: so all is followed from those, when the build
    /// did not read everything.
    pub fn finish(&self) -> Vec<u32> {
        let mut inner = self.inner.borrow_mut();
        let build = inner.build;
        let Inner {
            places,
            asked,
            free,
            last,
            ..
        } = &mut *inner;
        let mut live: Vec<bool> = asked.iter().map(|a| a.seen == build).collect();
        if let Some(&at) = places.get(&VIEW) {
            live[at] = true;
        }
        if places.values().any(|&at| !live[at]) {
            let mut next: Vec<usize> = (0..live.len()).filter(|&at| live[at]).collect();
            while let Some(at) = next.pop() {
                for (_, answer) in &asked[at].answers {
                    named(answer, |o| {
                        if let Some(&to) = places.get(&o)
                            && !live[to]
                        {
                            live[to] = true;
                            next.push(to);
                        }
                    });
                }
            }
        }
        let mut gone = Vec::new();
        places.retain(|&o, &mut at| {
            if live[at] {
                return true;
            }
            gone.push(o);
            asked[at] = Asked::default();
            free.push(at);
            false
        });
        *last = None;
        gone
    }

    /// How many reads crossed to the page in this build so far.
    pub fn crossed(&self) -> u32 {
        self.inner.borrow().crossed
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_answer_is_asked_once_until_its_object_changes() {
        let answers = Answers::default();
        let asked = std::cell::Cell::new(0);
        let read = || {
            asked.set(asked.get() + 1);
            Answer::Number(Some(1.0))
        };
        for _ in 0..3 {
            answers.begin(&[]);
            answers.answer(1, Kind::Number, 4, read);
            answers.answer(1, Kind::Boolean, 4, || Answer::Boolean(None));
        }
        assert_eq!(asked.get(), 1);
        answers.begin(&[1]);
        answers.answer(1, Kind::Number, 4, read);
        assert_eq!(asked.get(), 2);
        assert_eq!(answers.crossed(), 1);
    }

    #[test]
    fn answers_asked_in_another_order_are_found() {
        let answers = Answers::default();
        answers.answer(1, Kind::Number, 1, || Answer::Number(Some(1.0)));
        answers.answer(1, Kind::Number, 2, || Answer::Number(Some(2.0)));
        answers.answer(2, Kind::Number, 1, || Answer::Number(Some(3.0)));
        let got = |p| match answers.answer(1, Kind::Number, p, || unreachable!()) {
            Answer::Number(n) => n,
            _ => None,
        };
        assert_eq!(got(2), Some(2.0));
        assert_eq!(got(1), Some(1.0));
        assert_eq!(got(2), Some(2.0));
    }

    #[test]
    fn what_no_answer_names_any_more_is_gone_but_the_view_stays() {
        let answers = Answers::default();
        let children = |all: &[u32]| {
            let all: Rc<[u32]> = all.into();
            move || Answer::Objects(all)
        };
        answers.begin(&[]);
        answers.answer(VIEW, Kind::Objects, 0, children(&[1, 2]));
        answers.answer(1, Kind::Object, 0, || Answer::Object(Some(3)));
        assert!(answers.finish().is_empty());
        // Nothing changed: the kept answers still name them all.
        answers.begin(&[]);
        answers.answer(VIEW, Kind::Objects, 0, || unreachable!());
        answers.answer(1, Kind::Object, 0, || unreachable!());
        assert!(answers.finish().is_empty());
        answers.begin(&[VIEW]);
        answers.answer(VIEW, Kind::Objects, 0, children(&[2]));
        let mut gone = answers.finish();
        gone.sort_unstable();
        assert_eq!(gone, [1, 3]);
        // A handle that is gone is never used again; its place is.
        answers.begin(&[]);
        answers.answer(VIEW, Kind::Objects, 0, || unreachable!());
        assert!(answers.finish().is_empty());
    }

    #[test]
    fn what_a_kept_answer_names_stays_though_this_build_did_not_read_it() {
        let answers = Answers::default();
        answers.begin(&[]);
        answers.answer(VIEW, Kind::Objects, 0, || Answer::Objects([1].into()));
        answers.answer(1, Kind::Objects, 0, || Answer::Objects([3].into()));
        answers.answer(3, Kind::Number, 0, || Answer::Number(None));
        assert!(answers.finish().is_empty());
        // A build that passes 1 by (it draws nothing now) reads none of it:
        // what 1 named is still 1's.
        answers.begin(&[]);
        answers.answer(VIEW, Kind::Objects, 0, || unreachable!());
        assert!(answers.finish().is_empty());
        answers.begin(&[]);
        answers.answer(VIEW, Kind::Objects, 0, || unreachable!());
        answers.answer(1, Kind::Objects, 0, || unreachable!());
        answers.answer(3, Kind::Number, 0, || unreachable!());
        assert!(answers.finish().is_empty());
        answers.begin(&[VIEW]);
        answers.answer(VIEW, Kind::Objects, 0, || Answer::Objects([].into()));
        let mut gone = answers.finish();
        gone.sort_unstable();
        assert_eq!(gone, [1, 3]);
    }
}

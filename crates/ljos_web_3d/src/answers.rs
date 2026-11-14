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
//!
//! A build reads the view in `ljos_3d`'s pieces ([`Piece`]): each object's
//! node, the view's own members, its environment. Each answer is noted as
//! read by the piece that asked for it, so an object that changed says which
//! pieces to read again: a material shared by a thousand models reads the
//! thousand, a model moved reads that model.

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::hash::{BuildHasherDefault, Hasher};
use std::rc::Rc;

use ljos_3d::qml::Piece;

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
    /// Each answer by its key; `None` where the page said that member
    /// changed, kept in its place to be asked again in the same order.
    answers: Vec<(u32, Option<Answer>)>,
    /// The pieces that asked for its answers since it last changed: what
    /// is read again when it does. One that no longer asks stays until
    /// then, and is read once more for nothing.
    readers: Vec<Piece<u32>>,
    /// How long `readers` grows before its repeats are let go: twice what
    /// was left the last time, so a long list of distinct readers is not
    /// gone through again for each one noted again. 0 until then.
    fold_at: usize,
    #[cfg(test)]
    folds: usize,
}

impl Asked {
    fn read_by(&mut self, piece: Piece<u32>) {
        // A piece asks for its answers one after another.
        if self.readers.last() == Some(&piece) {
            return;
        }
        self.readers.push(piece);
        // A piece read again after another asked is noted again: kept to
        // as many as there are, in a list a shared material makes long.
        let n = self.readers.len();
        if n >= self.fold_at.max(16) {
            let mut seen = HashSet::with_capacity(n);
            self.readers.retain(|p| seen.insert(*p));
            self.fold_at = self.readers.len() * 2;
            #[cfg(test)]
            {
                self.folds += 1;
            }
        }
    }
}

impl Asked {
    fn find(&mut self, key: u32) -> Option<usize> {
        let at = if self.answers.get(self.next).is_some_and(|(k, _)| *k == key) {
            self.next
        } else {
            self.answers.iter().position(|(k, _)| *k == key)?
        };
        self.next = at + 1;
        Some(at)
    }

    /// Whether what `key` answers now names each of `names`.
    fn still_names(&self, key: u32, names: &[u32]) -> bool {
        let Some((_, Some(answer))) = self.answers.iter().find(|(k, _)| *k == key) else {
            return false;
        };
        let mut now = HashSet::new();
        named(answer, |o| {
            now.insert(o);
        });
        names.iter().all(|o| now.contains(o))
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
    /// How many answers this build looked for, found or asked: the work a
    /// build does, which a build that reads what changed alone keeps small.
    looked: u32,
    /// The piece being read, which what is asked now is read by.
    reading: Option<Piece<u32>>,
    /// What the answers let go of since the last build ended named, by
    /// object and key: only where one asked again names less can an object
    /// have left.
    unnamed: Vec<(u32, u32, Vec<u32>)>,
    /// How many builds followed what the answers name, to find what left.
    walks: u32,
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

/// The key an answer is kept under: what was asked, of which member.
pub fn key(kind: Kind, p: u32) -> u32 {
    (kind as u32) << 24 | p
}

/// The key of what the page says changed, by its kind's number in the order
/// of [`Kind`] and its member; none where it names no kind there is.
pub fn said_key(kind: u32, p: u32) -> Option<u32> {
    (kind <= Kind::TableId as u32 && p < 1 << 24).then_some(kind << 24 | p)
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
        let key = key(kind, p);
        let changed = {
            let mut inner = self.inner.borrow_mut();
            inner.looked += 1;
            let at = inner.see(o);
            if let Some(piece) = inner.reading {
                inner.asked[at].read_by(piece);
            }
            let found = inner.asked[at].find(key);
            match found.map(|i| (i, inner.asked[at].answers[i].1.clone())) {
                Some((_, Some(found))) => {
                    inner.see_named(&found);
                    return found;
                }
                Some((i, None)) => Some(i),
                None => None,
            }
        };
        // Not borrowed while the page answers.
        let answer = read();
        let mut inner = self.inner.borrow_mut();
        inner.crossed += 1;
        let at = inner.place(o);
        let asked = &mut inner.asked[at];
        // Back in its place, unless what answered let go of it meanwhile.
        match changed
            .and_then(|i| asked.answers.get_mut(i))
            .filter(|(k, _)| *k == key)
        {
            Some(place) => place.1 = Some(answer.clone()),
            None => {
                asked.answers.push((key, Some(answer.clone())));
                asked.next = asked.answers.len();
            }
        }
        inner.see_named(&answer);
        answer
    }

    /// Forgets what `changed` answered: the next build asks them again.
    /// Returns the pieces that had read it, each once.
    pub fn clear(&self, changed: &[u32]) -> Vec<Piece<u32>> {
        self.clear_members(changed, &[])
    }

    /// Forgets what `changed` answered, and what each of `members` (an
    /// object and a [`key`]) did: a node that turned is asked its turn
    /// alone. Returns the pieces that had read any of it, each once.
    pub fn clear_members(&self, changed: &[u32], members: &[(u32, u32)]) -> Vec<Piece<u32>> {
        let mut inner = self.inner.borrow_mut();
        let Inner {
            places,
            asked,
            unnamed,
            ..
        } = &mut *inner;
        let mut pieces = Vec::new();
        let mut seen = HashSet::new();
        let mut forget = |o: u32, member: Option<u32>| {
            let Some(&at) = places.get(&o) else {
                return;
            };
            let asked = &mut asked[at];
            for (key, answer) in &mut asked.answers {
                if member.is_some_and(|m| m != *key) {
                    continue;
                }
                if let Some(answer) = answer.take() {
                    let mut names = Vec::new();
                    named(&answer, |n| names.push(n));
                    if !names.is_empty() {
                        unnamed.push((o, *key, names));
                    }
                }
            }
            // All of it is asked again, maybe in another order.
            if member.is_none() {
                asked.answers.clear();
            }
            asked.next = 0;
            // Read again, each piece notes itself again.
            pieces.extend(asked.readers.drain(..).filter(|p| seen.insert(*p)));
            asked.fold_at = 0;
        };
        for &o in changed {
            forget(o, None);
        }
        for &(o, key) in members {
            forget(o, Some(key));
        }
        pieces
    }

    /// A build starts: what changed is asked again. Returns the pieces
    /// that read what changed, for the build to read again.
    pub fn begin(&self, changed: &[u32]) -> Vec<Piece<u32>> {
        self.begin_members(changed, &[])
    }

    /// As [`Answers::begin`], with the members the page said changed of
    /// objects otherwise as they were.
    pub fn begin_members(&self, changed: &[u32], members: &[(u32, u32)]) -> Vec<Piece<u32>> {
        let pieces = self.clear_members(changed, members);
        let mut inner = self.inner.borrow_mut();
        inner.build = inner.build.wrapping_add(1);
        inner.crossed = 0;
        inner.looked = 0;
        pieces
    }

    /// What is asked from now on is read by `piece`; by none for `None`.
    pub fn reading(&self, piece: Option<Piece<u32>>) {
        self.inner.borrow_mut().reading = piece;
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
        inner.last = None;
        // Every object is named by an answer the view reaches, or was until
        // one of those was let go of: where each was asked again and names
        // what it named, none has left. A build that moved a model, which
        // names its materials again, follows nothing.
        let unnamed = std::mem::take(&mut inner.unnamed);
        let renamed = |(o, key, names): &(u32, u32, Vec<u32>)| {
            inner
                .places
                .get(o)
                .is_some_and(|&at| inner.asked[at].still_names(*key, names))
        };
        if unnamed.iter().all(renamed) {
            return Vec::new();
        }
        inner.walks += 1;
        let build = inner.build;
        let Inner {
            places,
            asked,
            free,
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
                    let Some(answer) = answer else { continue };
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
        gone
    }

    /// How many reads crossed to the page in this build so far.
    pub fn crossed(&self) -> u32 {
        self.inner.borrow().crossed
    }

    /// How many builds followed what the answers name, to find what left.
    #[cfg(test)]
    pub fn walks(&self) -> u32 {
        self.inner.borrow().walks
    }

    /// How many answers this build looked for so far, kept or not.
    pub fn looked(&self) -> u32 {
        self.inner.borrow().looked
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

    #[test]
    fn a_member_the_page_says_changed_is_asked_again_alone() {
        let answers = Answers::default();
        answers.begin(&[]);
        answers.answer(1, Kind::Number, 0, || Answer::Number(Some(1.0)));
        answers.answer(1, Kind::Quaternion, 3, || Answer::Quaternion(None));
        answers.answer(1, Kind::Boolean, 0, || Answer::Boolean(Some(true)));
        answers.finish();
        // A node turned: its turn crosses, what else it is is as it was, and
        // the piece that read it is read again.
        let pieces = answers.begin_members(&[], &[(1, key(Kind::Quaternion, 3))]);
        assert_eq!(pieces.len(), 0, "no piece read it");
        answers.answer(1, Kind::Number, 0, || unreachable!());
        let turned = answers.answer(1, Kind::Quaternion, 3, || {
            Answer::Quaternion(Some([0.0, 0.0, 0.0, 1.0]))
        });
        answers.answer(1, Kind::Boolean, 0, || unreachable!());
        assert!(matches!(turned, Answer::Quaternion(Some(_))));
        assert_eq!(answers.crossed(), 1);
        // Kept where it was asked: the next build finds each in turn.
        answers.finish();
        answers.begin(&[]);
        answers.answer(1, Kind::Number, 0, || unreachable!());
        answers.answer(1, Kind::Quaternion, 3, || unreachable!());
        assert_eq!(answers.looked(), 2);
    }

    #[test]
    fn many_readers_read_again_in_turn_are_not_gone_through_for_each() {
        // One fewer than a power of two: each noted again reaches one.
        const READERS: u32 = 1023;
        let mut asked = Asked::default();
        for _ in 0..4 {
            for n in 0..READERS {
                asked.read_by(Piece::Node(n));
            }
        }
        let distinct: HashSet<_> = asked.readers.iter().copied().collect();
        assert_eq!(distinct.len(), READERS as usize);
        assert!(asked.readers.len() < 2 * READERS as usize);
        // Up to 1024 while the list first grows, then about once a round.
        assert!(asked.folds <= 12, "{} folds", asked.folds);
    }

    #[test]
    fn the_pieces_that_read_a_changed_member_are_read_again() {
        let answers = Answers::default();
        let node = Piece::Node(1);
        answers.begin(&[]);
        answers.reading(Some(node));
        answers.answer(1, Kind::Number, 0, || Answer::Number(Some(1.0)));
        answers.reading(None);
        answers.finish();
        assert_eq!(
            answers.begin_members(&[], &[(1, key(Kind::Number, 0))]),
            [node]
        );
    }

    #[test]
    fn a_build_whose_answers_name_what_they_named_follows_nothing() {
        let answers = Answers::default();
        answers.begin(&[]);
        answers.answer(VIEW, Kind::Objects, 0, || Answer::Objects([1].into()));
        answers.answer(1, Kind::Objects, 0, || Answer::Objects([3].into()));
        answers.answer(1, Kind::Number, 0, || Answer::Number(None));
        assert!(answers.finish().is_empty());
        let walks = answers.walks();
        // A model that moved names its material again: nothing can have left.
        answers.begin(&[1]);
        answers.answer(VIEW, Kind::Objects, 0, || unreachable!());
        answers.answer(1, Kind::Objects, 0, || Answer::Objects([3].into()));
        answers.answer(1, Kind::Number, 0, || Answer::Number(Some(2.0)));
        assert!(answers.finish().is_empty());
        assert_eq!(answers.walks(), walks);
        // One that names another material lets go of the first.
        answers.begin(&[1]);
        answers.answer(VIEW, Kind::Objects, 0, || unreachable!());
        answers.answer(1, Kind::Objects, 0, || Answer::Objects([4].into()));
        answers.answer(1, Kind::Number, 0, || Answer::Number(Some(2.0)));
        assert_eq!(answers.finish(), [3]);
        assert_eq!(answers.walks(), walks + 1);
        // As does one said changed that this build does not read again.
        answers.begin_members(&[], &[(VIEW, key(Kind::Objects, 0))]);
        let mut gone = answers.finish();
        gone.sort_unstable();
        assert_eq!(gone, [1, 4]);
    }
}

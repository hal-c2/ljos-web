//! The kernel through the interface the page uses, with a stand-in page.

use std::{
    cell::{OnceCell, RefCell},
    collections::HashMap,
    rc::Rc,
};

use ljos_web_kernel::{Host, Kernel};

type Binding = Box<dyn Fn(&Kernel) -> i64>;

#[derive(Default)]
struct Page {
    kernel: OnceCell<&'static Kernel>,
    bindings: RefCell<HashMap<u32, (Binding, Option<i64>)>>,
    cells: RefCell<HashMap<u32, i64>>,
    told: RefCell<Vec<u32>>,
    runs: RefCell<Vec<u32>>,
}

struct Shared(Rc<Page>);

impl Host for Shared {
    fn evaluate(&self, node: u32) -> bool {
        self.0.runs.borrow_mut().push(node);
        let kernel = self.0.kernel.get().unwrap();
        // Out of the map while it runs: it reads other bindings.
        let (compute, had) = self.0.bindings.borrow_mut().remove(&node).unwrap();
        let value = compute(kernel);
        self.0
            .bindings
            .borrow_mut()
            .insert(node, (compute, Some(value)));
        had != Some(value)
    }
    fn changed(&self, node: u32) {
        self.0.told.borrow_mut().push(node);
    }
}

fn page() -> (Rc<Page>, &'static Kernel) {
    let page = Rc::new(Page::default());
    let kernel: &'static Kernel = Box::leak(Box::new(Kernel::new(Box::new(Shared(page.clone())))));
    page.kernel.set(kernel).ok();
    (page, kernel)
}

fn cell(page: &Page, kernel: &Kernel, value: i64) -> u32 {
    let index = kernel.cell();
    page.cells.borrow_mut().insert(index, value);
    index
}

fn get(page: &Rc<Page>, kernel: &Kernel, index: u32) -> i64 {
    kernel.read(index);
    if let Some(value) = page.cells.borrow().get(&index) {
        return *value;
    }
    page.bindings.borrow()[&index].1.unwrap()
}

fn bind(
    page: &Rc<Page>,
    kernel: &'static Kernel,
    compute: impl Fn(&Kernel) -> i64 + 'static,
) -> u32 {
    let index = kernel.binding();
    page.bindings
        .borrow_mut()
        .insert(index, (Box::new(compute), None));
    index
}

fn write(page: &Page, kernel: &Kernel, index: u32, value: i64) {
    page.cells.borrow_mut().insert(index, value);
    kernel.bump(index);
}

#[test]
fn a_binding_is_run_when_read_and_again_when_what_it_read_changes() {
    let (page, kernel) = page();
    let width = cell(&page, kernel, 3);
    let p = page.clone();
    let area = bind(&page, kernel, move |k| {
        get(&p, k, width) * get(&p, k, width)
    });
    assert!(page.runs.borrow().is_empty(), "lazy until read");
    assert_eq!(get(&page, kernel, area), 9);
    write(&page, kernel, width, 4);
    assert_eq!(get(&page, kernel, area), 16);
    assert_eq!(page.runs.borrow().len(), 2);
}

#[test]
fn what_solid_follows_is_told_before_the_write_returns_and_nothing_is_evaluated_for_it() {
    let (page, kernel) = page();
    let x = cell(&page, kernel, 5);
    let p = page.clone();
    let size = bind(&page, kernel, move |k| get(&p, k, x).abs());
    kernel.pull(size);
    kernel.follow(size);
    let runs = page.runs.borrow().len();
    // It may have changed: Solid reads it in its own flush, after whatever
    // the same change removes, so the binding is not run here.
    write(&page, kernel, x, -5);
    assert_eq!(*page.told.borrow(), vec![size]);
    assert_eq!(page.runs.borrow().len(), runs, "telling evaluates nothing");
    assert_eq!(get(&page, kernel, size), 5);
    write(&page, kernel, x, 7);
    assert_eq!(*page.told.borrow(), vec![size, size]);
    assert_eq!(get(&page, kernel, size), 7);
}

#[test]
fn what_solid_follows_and_does_not_read_again_is_told_once() {
    let (page, kernel) = page();
    let x = cell(&page, kernel, 1);
    let p = page.clone();
    let double = bind(&page, kernel, move |k| get(&p, k, x) * 2);
    kernel.pull(double);
    kernel.follow(double);
    write(&page, kernel, x, 2);
    write(&page, kernel, x, 3);
    // Unread, the binding is still out of date: nothing new has reached it.
    assert_eq!(*page.told.borrow(), vec![double]);
    assert_eq!(get(&page, kernel, double), 6);
    write(&page, kernel, x, 4);
    assert_eq!(*page.told.borrow(), vec![double, double]);
}

#[test]
fn a_disposed_node_is_read_as_nothing_and_its_number_comes_back() {
    let (page, kernel) = page();
    let a = cell(&page, kernel, 1);
    kernel.dispose(a);
    kernel.read(a);
    kernel.bump(a);
    assert_eq!(kernel.live(), 0);
    assert_eq!(kernel.cell(), a);
}

#[test]
fn what_solid_follows_is_told_in_the_order_the_change_reached_it() {
    // Qt runs a property's own handler before what a binding of it gives
    // is told: the page's computations hear in the order the change
    // spread, a source before what depends on it.
    let (page, kernel) = page();
    let a = cell(&page, kernel, 1);
    let b = bind(&page, kernel, move |k| {
        k.read(a);
        1
    });
    let c = bind(&page, kernel, move |k| {
        k.read(b);
        k.read(a);
        2
    });
    get(&page, kernel, c);
    kernel.follow(a);
    kernel.follow(b);
    kernel.follow(c);
    page.told.borrow_mut().clear();
    write(&page, kernel, a, 2);
    assert_eq!(*page.told.borrow(), [a, b, c]);
}

#[test]
fn what_solid_starts_to_follow_while_it_is_worked_out_is_told_once_it_is() {
    // An object a binding makes reads the binding before it has given
    // anything (a control's content item, made by its own binding, asks
    // which control it is the content of): what it read is not what the
    // binding ends up giving, so it is told.
    let (page, kernel) = page();
    let me = Rc::new(std::cell::Cell::new(u32::MAX));
    let within = me.clone();
    let content = bind(&page, kernel, move |_| {
        let me = within.get();
        kernel.pull(me);
        kernel.follow(me);
        3
    });
    me.set(content);
    get(&page, kernel, content);
    assert_eq!(*page.told.borrow(), [content]);
}

#[test]
fn what_solid_follows_of_a_binding_still_being_worked_out_is_told_when_it_is_out_of_date() {
    // A view made by a binding follows its path, whose point reads the
    // binding: the point gives what the binding had, and is out of date
    // once the binding gives the view. What follows the point hears it.
    let (page, kernel) = page();
    let me = Rc::new(std::cell::Cell::new(u32::MAX));
    let point = Rc::new(std::cell::Cell::new(u32::MAX));
    let (within, at) = (me.clone(), point.clone());
    let content = bind(&page, kernel, move |_| {
        kernel.pull(at.get());
        kernel.follow(at.get());
        3
    });
    let p = page.clone();
    point.set(bind(&page, kernel, move |k| {
        // What the binding had while it is worked out: nothing yet.
        let me = within.get();
        k.read(me);
        p.bindings
            .borrow()
            .get(&me)
            .and_then(|(_, had)| *had)
            .unwrap_or(0)
            * 2
    }));
    me.set(content);
    get(&page, kernel, content);
    assert_eq!(*page.told.borrow(), [point.get()]);
}

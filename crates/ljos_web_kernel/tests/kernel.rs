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
fn what_solid_follows_is_told_before_the_write_returns_and_only_on_a_change() {
    let (page, kernel) = page();
    let x = cell(&page, kernel, 5);
    let p = page.clone();
    // Gives the same whatever the sign of x: a change of sign stops here.
    let size = bind(&page, kernel, move |k| get(&p, k, x).abs());
    kernel.pull(size);
    kernel.follow(size);
    write(&page, kernel, x, -5);
    assert!(page.told.borrow().is_empty(), "an equal value is no change");
    write(&page, kernel, x, 7);
    assert_eq!(*page.told.borrow(), vec![size]);
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

//! The property and binding kernel of ljos-web: Ljós's own reactive graph
//! (`ljos_reactive`), compiled to wasm, under the runtime's `Slot`s.
//!
//! The graph owns what depends on what, when a binding is out of date, the
//! order a change is told in and where a loop ends. JavaScript keeps the
//! values: a property's value is whatever the page made of it (a string, a
//! colour, an object), so the graph's value per node is only a version that
//! moves when the value does, and nothing is marshalled across.
//!
//! The boundary is plain wasm imports and exports of `u32`s, no
//! wasm-bindgen: a read that is tracked is one call in, a binding's
//! evaluation one call out, and a value never crosses.

use std::cell::{Cell, RefCell};

use ljos_reactive::{Graph, NodeId, ScopeId};

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "ljos")]
unsafe extern "C" {
    /// Runs the JavaScript of binding `node`; non-zero when what it gave
    /// differs from what it had.
    fn evaluate(node: u32) -> u32;
    /// Node `node`, which Solid follows, changed.
    fn changed(node: u32);
}

/// What the page gives the kernel to call; natively, a test's stand-in.
pub trait Host {
    fn evaluate(&self, node: u32) -> bool;
    fn changed(&self, node: u32);
}

#[cfg(target_arch = "wasm32")]
struct Page;

#[cfg(target_arch = "wasm32")]
impl Host for Page {
    fn evaluate(&self, node: u32) -> bool {
        // SAFETY: an import of the page's, given only numbers.
        unsafe { evaluate(node) != 0 }
    }
    fn changed(&self, node: u32) {
        // SAFETY: as above.
        unsafe { changed(node) }
    }
}

/// The graph and the numbers the page knows its nodes by. A number is
/// reused once its node is gone, so the page holds small dense indices,
/// never a generational key.
pub struct Kernel {
    graph: Graph<u32>,
    root: ScopeId,
    nodes: RefCell<Vec<Option<NodeId>>>,
    free: RefCell<Vec<u32>>,
    host: Box<dyn Host>,
}

impl Kernel {
    pub fn new(host: Box<dyn Host>) -> Self {
        let graph = Graph::new();
        let root = graph.root();
        Self {
            graph,
            root,
            nodes: RefCell::new(Vec::new()),
            free: RefCell::new(Vec::new()),
            host,
        }
    }

    fn number(&self) -> u32 {
        if let Some(index) = self.free.borrow_mut().pop() {
            return index;
        }
        let mut nodes = self.nodes.borrow_mut();
        nodes.push(None);
        u32::try_from(nodes.len() - 1).expect("fewer than 2^32 nodes")
    }

    fn node(&self, index: u32) -> Option<NodeId> {
        self.nodes.borrow().get(index as usize).copied().flatten()
    }

    /// A value the page keeps: what it is changes when the page says so.
    pub fn cell(&self) -> u32 {
        let index = self.number();
        let node = self
            .graph
            .property(self.root, 0)
            .expect("the root scope lives");
        self.nodes.borrow_mut()[index as usize] = Some(node);
        index
    }

    /// A binding whose JavaScript the page runs when the graph asks.
    pub fn binding(&'static self) -> u32 {
        let index = self.number();
        // The version moves only when the page says the value did, so a
        // binding that gives what it gave stops the change there, as the
        // graph's equality cut-off does natively.
        let version = Cell::new(0u32);
        let node = self
            .graph
            .binding(self.root, 0, move |_| {
                if self.host.evaluate(index) {
                    version.set(version.get().wrapping_add(1));
                }
                version.get()
            })
            .expect("the root scope lives");
        self.nodes.borrow_mut()[index as usize] = Some(node);
        index
    }

    /// Brings `index` up to date and, inside a binding, records the read.
    pub fn read(&self, index: u32) {
        if let Some(node) = self.node(index) {
            self.graph.try_get(node);
        }
    }

    /// Brings `index` up to date without recording a read.
    pub fn pull(&self, index: u32) {
        if let Some(node) = self.node(index) {
            self.graph.untrack(|| self.graph.try_get(node));
        }
    }

    /// The page's value of `index` changed: what depends on it is told,
    /// and what follows it runs, before this returns.
    pub fn bump(&self, index: u32) {
        if let Some(node) = self.node(index) {
            // A cell is always written, never bound, so the write breaks
            // nothing; a binding is re-run in place.
            if self.graph.is_bound(node) {
                let _ = self.graph.refresh(node);
            } else if let Some(version) = self.graph.peek(node) {
                self.graph.set(node, version.wrapping_add(1));
            }
        }
    }

    /// Has the page told whenever `index` changes: what Solid follows.
    pub fn follow(&'static self, index: u32) -> u32 {
        let Some(node) = self.node(index) else {
            return u32::MAX;
        };
        let watcher = self.number();
        let effect = self
            .graph
            .watch(self.root, node, move |_, _| self.host.changed(index))
            .expect("the root scope lives");
        self.nodes.borrow_mut()[watcher as usize] = Some(effect);
        watcher
    }

    pub fn dispose(&self, index: u32) {
        let node = self
            .nodes
            .borrow_mut()
            .get_mut(index as usize)
            .and_then(Option::take);
        if let Some(node) = node {
            let _ = self.graph.dispose(node);
            self.free.borrow_mut().push(index);
        }
    }

    /// Defers telling until the outermost batch ends.
    pub fn batch<R>(&self, work: impl FnOnce() -> R) -> R {
        self.graph.batch(work)
    }

    pub fn live(&self) -> usize {
        self.nodes
            .borrow()
            .iter()
            .filter(|node| node.is_some())
            .count()
    }
}

#[cfg(target_arch = "wasm32")]
mod exports {
    use super::{Kernel, Page};

    // One page, one thread: the kernel lives as long as the instance.
    fn kernel() -> &'static Kernel {
        thread_local! {
            static KERNEL: &'static Kernel = Box::leak(Box::new(Kernel::new(Box::new(Page))));
        }
        KERNEL.with(|kernel| *kernel)
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn ljos_cell() -> u32 {
        kernel().cell()
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn ljos_binding() -> u32 {
        kernel().binding()
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn ljos_read(index: u32) {
        kernel().read(index);
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn ljos_pull(index: u32) {
        kernel().pull(index);
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn ljos_bump(index: u32) {
        kernel().bump(index);
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn ljos_follow(index: u32) -> u32 {
        kernel().follow(index)
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn ljos_dispose(index: u32) {
        kernel().dispose(index);
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn ljos_live() -> u32 {
        u32::try_from(kernel().live()).unwrap_or(u32::MAX)
    }
}

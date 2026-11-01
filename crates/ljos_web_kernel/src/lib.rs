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

use ljos_reactive::{Graph, NodeId, NodeState, ScopeId};

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
    /// What Solid follows that a change reached, with the node's height,
    /// held until the page's call into the graph returns.
    heard: RefCell<Vec<(u32, u32)>>,
    /// What Solid started to follow inside an evaluation, with the version
    /// it read.
    early: RefCell<Vec<(u32, NodeId, Option<u32>)>>,
    /// How deep the page's calls into the graph are nested (a binding the
    /// graph evaluates calls in again).
    depth: Cell<u32>,
}

/// Ends a call of the page's into the graph: the outermost one tells the
/// page what it heard.
struct Call<'k>(&'k Kernel);

impl Drop for Call<'_> {
    fn drop(&mut self) {
        let kernel = self.0;
        let depth = kernel.depth.get() - 1;
        kernel.depth.set(depth);
        if depth == 0 {
            kernel.deliver();
        }
    }
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
            heard: RefCell::new(Vec::new()),
            early: RefCell::new(Vec::new()),
            depth: Cell::new(0),
        }
    }

    fn call(&self) -> Call<'_> {
        self.depth.set(self.depth.get() + 1);
        Call(self)
    }

    // Kept in height order as it comes: a few at a time, so a place found
    // from the end costs less than a sort, and less code.
    fn hear(&self, index: u32, node: NodeId) {
        let height = self.graph.height(node).unwrap_or(0);
        let mut heard = self.heard.borrow_mut();
        let at = heard
            .iter()
            .rposition(|&(_, h)| h <= height)
            .map_or(0, |at| at + 1);
        heard.insert(at, (index, height));
    }

    // The graph tells in the order of its own queue, not the order the
    // change spread in; Qt runs a property's handlers before what a
    // binding of it gives is told, so a source is told before what
    // depends on it, and what is as high is told in the order it heard.
    fn deliver(&self) {
        let early = std::mem::take(&mut *self.early.borrow_mut());
        for (index, node, read) in early {
            let behind = self.graph.state(node) != Some(NodeState::Clean);
            if behind || self.graph.peek(node) != read {
                self.hear(index, node);
            }
        }
        loop {
            let heard = std::mem::take(&mut *self.heard.borrow_mut());
            if heard.is_empty() {
                return;
            }
            for (index, _) in heard {
                self.host.changed(index);
            }
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
        let _call = self.call();
        if let Some(node) = self.node(index) {
            self.graph.try_get(node);
        }
    }

    /// Brings `index` up to date without recording a read, and gives its
    /// version: what moves only when the page's value did.
    pub fn pull(&self, index: u32) -> u32 {
        let _call = self.call();
        self.node(index)
            .and_then(|node| self.graph.untrack(|| self.graph.try_get(node)))
            .unwrap_or(0)
    }

    /// The page's value of `index` changed: what depends on it is told,
    /// and what follows it runs, before this returns.
    pub fn bump(&self, index: u32) {
        let _call = self.call();
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

    /// Has the page told whenever `index` may have changed: what Solid
    /// follows. Nothing is evaluated for the telling; Solid reads the node
    /// in its own flush, in the order its computations were made, so an
    /// item a change removes is gone before what it showed is asked again,
    /// as on Solid's own signals.
    pub fn follow(&'static self, index: u32) -> u32 {
        let Some(node) = self.node(index) else {
            return u32::MAX;
        };
        let watcher = self.number();
        let _call = self.call();
        // Followed inside an evaluation (an object a binding makes), the
        // node may hang on what that binding is working out: the graph
        // tells what a binding's result reaches only through the mark that
        // made it out of date, which came before this follow. So the node
        // is looked at again once the page's call returns.
        if self.depth.get() > 1 {
            let read = self.graph.peek(node);
            self.early.borrow_mut().push((index, node, read));
        }
        // The first run links the node, and may be queued behind a change
        // that reached the node after the page read it: that is told. A
        // later run is the graph's own catching up (a scope thawed, a mark
        // while it ran) and is told as a change is.
        let read = Cell::new(Some(self.graph.peek(node)));
        let effect = self
            .graph
            .effect_told(
                self.root,
                move |graph| {
                    let now = graph.try_get(node);
                    if read.take().is_none_or(|read| read != now) {
                        self.hear(index, node);
                    }
                },
                move || self.hear(index, node),
            )
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
        let _call = self.call();
        if let Some(node) = node {
            let _ = self.graph.dispose(node);
            self.free.borrow_mut().push(index);
        }
    }

    /// Defers telling until the outermost batch ends.
    pub fn batch<R>(&self, work: impl FnOnce() -> R) -> R {
        let _call = self.call();
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
    pub extern "C" fn ljos_pull(index: u32) -> u32 {
        kernel().pull(index)
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

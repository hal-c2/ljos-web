//! A `Counter` as an application writes one for Ljós on the desktop
//! (`docs/MIGRATION.md` §6 of ljos-ui): a struct whose fields are
//! properties with change signals, and invokable methods beside them.
//!
//! On the desktop `#[derive(QmlObject)]` and `#[qml_impl]` generate a
//! `MetaObject` for it. Here the same shape is written by hand against
//! wasm-bindgen, which is what a `web` backend of that derive would
//! generate instead (`docs/LJOS_WEB.md` says exactly what, item by item).
//! The logic is plain Rust and tested as such; only the telling of
//! changes is JavaScript's, behind `#[cfg(target_arch = "wasm32")]`.

/// The counter itself: what the application owns, on every target.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Counter {
    count: i32,
    step: i32,
}

impl Counter {
    pub fn new() -> Self {
        Self { count: 0, step: 1 }
    }

    pub fn count(&self) -> i32 {
        self.count
    }

    pub fn step(&self) -> i32 {
        self.step
    }

    /// Whether the value changed: what a `notify` signal is emitted for,
    /// and only for that, as in Qt and in Ljós's graph.
    pub fn set_count(&mut self, count: i32) -> bool {
        if self.count == count {
            return false;
        }
        self.count = count;
        true
    }

    pub fn set_step(&mut self, step: i32) -> bool {
        if self.step == step {
            return false;
        }
        self.step = step;
        true
    }

    /// Adds `step` and gives the new count: the value its `bumped`
    /// signal carries.
    pub fn increment(&mut self) -> i32 {
        self.count += self.step;
        self.count
    }
}

#[cfg(target_arch = "wasm32")]
mod web {
    use js_sys::Function;
    use wasm_bindgen::prelude::*;

    use super::Counter;

    /// What compiled QML holds of a `Counter`, across the boundary.
    ///
    /// One of these is made per QML object. It owns the application's
    /// struct and the listeners JavaScript gave it: one list per change
    /// signal and per declared signal. Nothing polls: a change here
    /// calls its listeners at once, and they bump the Solid signal the
    /// object's slot reads by (`web/Counter.js`).
    #[wasm_bindgen(js_name = Counter)]
    pub struct WasmCounter {
        inner: Counter,
        count_changed: Vec<Function>,
        step_changed: Vec<Function>,
        bumped: Vec<Function>,
    }

    // A change is told with its new value, where QML's own notify
    // signal carries none: the listener runs while the call that
    // changed the value still holds this struct mutably, and asking
    // the struct for the value from inside it — `rust.count` in the
    // listener — is a second borrow, which wasm-bindgen refuses.
    // Carrying the value is one crossing fewer besides.
    fn tell(listeners: &[Function], value: i32) {
        for listener in listeners {
            // What a listener throws stops that listener, as a QML
            // handler's error does; it is not this call's to carry.
            let _ = listener.call1(&JsValue::NULL, &JsValue::from(value));
        }
    }

    #[wasm_bindgen(js_class = Counter)]
    impl WasmCounter {
        #[wasm_bindgen(constructor)]
        pub fn new() -> Self {
            Self {
                inner: Counter::new(),
                count_changed: Vec::new(),
                step_changed: Vec::new(),
                bumped: Vec::new(),
            }
        }

        #[wasm_bindgen(getter)]
        pub fn count(&self) -> i32 {
            self.inner.count()
        }

        #[wasm_bindgen(setter)]
        pub fn set_count(&mut self, count: i32) {
            if self.inner.set_count(count) {
                tell(&self.count_changed, count);
            }
        }

        #[wasm_bindgen(getter)]
        pub fn step(&self) -> i32 {
            self.inner.step()
        }

        #[wasm_bindgen(setter)]
        pub fn set_step(&mut self, step: i32) {
            if self.inner.set_step(step) {
                tell(&self.step_changed, step);
            }
        }

        pub fn increment(&mut self) {
            let count = self.inner.increment();
            // The property's change is told before the signal that
            // carries the same news, as Qt tells of a change before
            // what the change brings.
            tell(&self.count_changed, count);
            tell(&self.bumped, count);
        }

        pub fn on_count_changed(&mut self, listener: Function) {
            self.count_changed.push(listener);
        }

        pub fn on_step_changed(&mut self, listener: Function) {
            self.step_changed.push(listener);
        }

        pub fn on_bumped(&mut self, listener: Function) {
            self.bumped.push(listener);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::Counter;

    #[test]
    fn counts_by_one_until_told_otherwise() {
        let mut counter = Counter::new();
        assert_eq!(counter.count(), 0);
        assert_eq!(counter.step(), 1);
        assert_eq!(counter.increment(), 1);
        assert_eq!(counter.increment(), 2);
    }

    #[test]
    fn counts_by_its_step() {
        let mut counter = Counter::new();
        assert!(counter.set_step(3));
        assert_eq!(counter.increment(), 3);
        assert_eq!(counter.increment(), 6);
    }

    #[test]
    fn a_write_of_what_it_holds_is_no_change() {
        let mut counter = Counter::new();
        assert!(!counter.set_count(0));
        assert!(!counter.set_step(1));
        assert!(counter.set_count(-2));
        assert_eq!(counter.count(), -2);
        assert_eq!(counter.increment(), -1);
    }
}

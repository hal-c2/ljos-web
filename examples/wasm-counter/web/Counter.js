// `Counter`, the Rust type of `src/lib.rs`, as a type of the runtime's:
// what a `web` backend of `#[derive(QmlObject)]` would generate, written
// by hand (`docs/LJOS_WEB.md` lists the generated pieces against this).
//
// The wasm struct is the one owner of the values. The kernel's slots are
// its face to Solid: a read is served from the slot and tracked, a QML
// write or binding is pushed across (`onChange`), and a change made in
// Rust is told at once — the struct calls the listener it was given,
// which puts the new value in the slot (`provide`: a value the type
// gives, not an assignment, so a binding on the property stands) and
// settles, so what depends on it is up to date before the call that
// changed it returns. Nothing polls, and a read never crosses.
import { onCleanup, untrack } from "solid-js";
import { defineType, kinds, onChange, QtObject, settle, slot, typed } from "ljos-web/object";
import init, { Counter as RustCounter } from "../pkg/wasm_counter.js";

// The module is there before any object of it is: compiled QML makes
// objects synchronously, so the wasm is awaited as this module loads.
await init();

export const Counter = defineType("Counter", QtObject, {
  properties: {
    count: typed(kinds.int, 0),
    step: typed(kinds.int, 1),
  },
  signals: ["bumped"],
  methods: {
    increment() {
      this.$rust.increment();
      settle();
    },
  },
  setup(self) {
    const rust = new RustCounter();
    self.$rust = rust;
    onCleanup(() => rust.free());

    // What the struct holds, as this side last heard it. Asking the
    // struct instead would borrow it a second time while a call that
    // changes it holds it mutably — its listeners below run inside
    // such a call — which wasm-bindgen refuses (`src/lib.rs`). It is
    // also one crossing fewer per write.
    const known = { count: rust.count, step: rust.step };
    // Whether a telling from Rust is on: a write QML makes in answer
    // to one (a binding the change sets off) cannot cross until the
    // call that told of it has returned, for the same reason.
    let telling = false;
    const put = (name, value) => {
      known[name] = value;
      telling = true;
      try {
        slot(self, name).provide(value);
        settle();
      } finally {
        telling = false;
      }
    };
    rust.on_count_changed((value) => put("count", value));
    rust.on_step_changed((value) => put("step", value));
    rust.on_bumped((value) => self.bumped(value));

    // What QML gives a property — a value as the object is made (`first`),
    // a binding's new value, an assignment — goes across, unless the
    // struct has it already: what Rust changed and `put` above brings
    // back is not sent again.
    for (const name of ["count", "step"]) {
      const push = (value) => {
        if (known[name] === value) return;
        if (telling) {
          queueMicrotask(() => push(untrack(() => self[name])));
          return;
        }
        known[name] = value;
        rust[name] = value;
      };
      onChange(self, name, () => push(untrack(() => self[name])), push);
    }
  },
});

export default Counter;

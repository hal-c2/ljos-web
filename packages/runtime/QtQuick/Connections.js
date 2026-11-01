// Connections: handlers of another object's signals, declared from outside
// it. `function onFoo(a) {}` arrives as the prop `onFoo`; the object is
// `target`, the Connections' parent when it names none.
import { createEffect, createMemo, createRenderEffect, createRoot, onCleanup, runWithOwner } from "solid-js";
import { defineType, QtObject, slot, whenComplete, whenCompleted } from "../object.js";
import { Component } from "../QtQml/Component.js";
import { untrack } from "#kernel";

const SYNC = { sync: true };
const DEFER = { defer: true };
const HANDLER = /^on[A-Z]/;

const signalName = (handler) => handler[2].toLowerCase() + handler.slice(3);

// Runs `listener` when `target` emits `name`, or when the property a
// `fooChanged` is about has another value: reading it again is not a change.
// False when the target has neither.
function listen(target, name, listener) {
  const emitted = target[name];
  if (typeof emitted?.connect === "function") {
    emitted.connect(listener);
    onCleanup(() => emitted.disconnect(listener));
    return true;
  }
  const property = /^(\w+)Changed$/.exec(name)?.[1];
  if (property === undefined || !(property in target)) return false;
  createEffect(
    createMemo(() => target[property], SYNC),
    () => void listener(),
    DEFER,
  );
  return true;
}

export const Connections = defineType("Connections", QtObject, {
  properties: {
    target: undefined,
    enabled: true,
    ignoreUnknownSignals: false,
  },
  methods: {
    get target() {
      const given = slot(this, "target");
      const target = given.get();
      return this.$named || given.assigned ? target : this.$parent;
    },
    set target(target) {
      slot(this, "target").set(target);
    },
  },
  setup(self, props) {
    // `target: null` is no target; no `target` at all is the parent.
    self.$named = "target" in props;
    const handlers = Object.keys(props).filter((key) => HANDLER.test(key));
    if (!handlers.length) return;
    // A handler is a function of the object too, which a program may call
    // itself: to do at the start what it does at each change.
    for (const handler of handlers) Object.defineProperty(self, handler, { value: (...args) => props[handler]?.(...args), configurable: true });
    // `target: Component` is the Connections' own: what any object is told
    // of itself, of its completion and its end, this one hears as signals.
    const own = () => untrack(() => self.target) === Component;
    if (props.onCompleted) whenCompleted(() => own() && self.enabled && props.onCompleted());
    if (props.onDestruction) onCleanup(() => own() && untrack(() => self.enabled && props.onDestruction()));
    whenComplete(() => {
      let disconnect = null;
      createRenderEffect(
        () => {
          const target = self.target;
          // An object that is named and not made yet: again once it is.
          const pending = target != null && typeof target.$track === "function" && !target.$props;
          if (pending) target.$track();
          return [pending ? null : target];
        },
        ([target]) => {
          disconnect?.();
          disconnect = null;
          if (target == null || target === Component) return;
          disconnect = runWithOwner(self.$owner, () =>
            createRoot((dispose) => {
              untrack(() => {
                for (const handler of handlers) {
                  // A handler reads what it likes: it is run, not kept up to date.
                  const heard = listen(target, signalName(handler), (...args) =>
                    untrack(() => self.enabled && props[handler]?.(...args)),
                  );
                  if (heard || self.ignoreUnknownSignals) continue;
                  console.warn(
                    `QML Connections: Detected function "${handler}" in Connections element. This is probably intended to be a signal handler but no signal of the target matches the name.`,
                  );
                }
              });
              return dispose;
            }),
          );
        },
      );
    });
  },
});

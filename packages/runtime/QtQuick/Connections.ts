// Connections: handlers of another object's signals, declared from outside
// it. `function onFoo(a) {}` arrives as the prop `onFoo`; the object is
// `target`, the Connections' parent when it names none.
import { createRenderEffect, createRoot, onCleanup, runWithOwner } from "solid-js";
import { connect, defineType, QtObject, slot, whenComplete, whenCompleted } from "../object.ts";
import { Component } from "../QtQml/Component.ts";
import { untrack } from "#kernel";
import type { Dynamic, Handler, QObject, Signal } from "../object.ts";

// What a Connections is, beyond its properties: whether it was given a
// `target` at all.
interface Conn extends QObject {
  target: unknown;
  enabled: boolean;
  ignoreUnknownSignals: boolean;
  $named?: boolean;
}

const HANDLER = /^on[A-Z]/;

const signalName = (handler: string): string => handler[2]!.toLowerCase() + handler.slice(3);

// Runs `listener` when `target` emits `name`, or when the property a
// `fooChanged` is about has another value: reading it again is not a change.
// False when the target has neither. `connect` is what does it, as for a
// handler written on the object itself: a change of a property with no
// signal of its own (`children`) is found in Solid's flush, and told after
// it like any other, so what the handler writes is settled by a flush of its
// own and what it reads is up to date.
// False when the target has neither; otherwise what tells of a change the
// flush made to the target and has not told yet.
function listen(target: Dynamic, name: string, listener: Handler): (() => void) | false {
  const emitted = target[name] as Partial<Signal> | undefined;
  const isSignal = typeof emitted?.connect === "function" && typeof emitted.disconnect === "function";
  const property = /^(\w+)Changed$/.exec(name)?.[1];
  if (!isSignal && (property === undefined || !(property in target))) return false;
  return connect(target, name, listener);
}

export const Connections = defineType("Connections", QtObject, {
  properties: {
    target: undefined as unknown,
    enabled: true,
    ignoreUnknownSignals: false,
  },
  methods: {
    get target(): unknown {
      const self = this as Conn;
      const given = slot(self, "target")!;
      const target = given.get();
      return self.$named || given.assigned ? target : self.$parent;
    },
    set target(target: unknown) {
      slot(this as Conn, "target")!.set(target);
    },
  },
  setup(object, props) {
    const self = object as Conn;
    // `target: null` is no target; no `target` at all is the parent.
    self.$named = "target" in props;
    const handlers = Object.keys(props).filter((key) => HANDLER.test(key));
    if (!handlers.length) return;
    // A handler is a function of the object too, which a program may call
    // itself: to do at the start what it does at each change.
    for (const handler of handlers) Object.defineProperty(self, handler, { value: (...args: unknown[]) => (props[handler] as Handler | undefined)?.(...args), configurable: true });
    // `target: Component` is the Connections' own: what any object is told
    // of itself, of its completion and its end, this one hears as signals.
    const own = () => untrack(() => self.target) === Component;
    const { onCompleted, onDestruction } = props as { onCompleted?: Handler; onDestruction?: Handler };
    if (onCompleted) whenCompleted(() => own() && self.enabled && onCompleted());
    if (onDestruction) onCleanup(() => own() && untrack(() => self.enabled && onDestruction()));
    whenComplete(() => {
      let disconnect: (() => void) | null = null;
      let settles: (() => void)[] = [];
      createRenderEffect(
        () => {
          const target = self.target as Dynamic | null | undefined;
          // An object that is named and not made yet: again once it is.
          const pending = target != null && typeof target.$track === "function" && !target.$props;
          if (pending) target.$track();
          return [pending ? null : target] as const;
        },
        ([target]) => {
          // A change of the old target made in the write that moved the
          // target away (`target: item.parent === a ? b : a`, and `item`
          // moved into `a`) is the old target's: Qt tells it before the
          // binding of `target` runs again. A program's write outside a flush
          // (a handler's, a function's) has a flush of its own, so a target
          // it wrote before a change is switched with nothing left to tell.
          // Inside one flush (`gather`, an effect) the two are not told
          // apart: a change made there after the switch is heard from the
          // old target too, where Qt would not hear it. Only a property with
          // no signal of its own (`children`) has anything to tell here; a
          // signal is told as it is emitted.
          for (const settle of settles) settle();
          settles = [];
          disconnect?.();
          disconnect = null;
          if (target == null || (target as unknown) === Component) return;
          disconnect = runWithOwner(self.$owner, () =>
            createRoot((dispose): (() => void) => {
              untrack(() => {
                for (const handler of handlers) {
                  // A handler reads what it likes: it is run, not kept up to date.
                  const heard = listen(target, signalName(handler), (...args: unknown[]) =>
                    untrack(() => self.enabled && (props[handler] as Handler | undefined)?.(...args)),
                  );
                  if (heard) {
                    settles.push(heard);
                    continue;
                  }
                  if (self.ignoreUnknownSignals) continue;
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

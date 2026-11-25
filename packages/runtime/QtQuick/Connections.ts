// Connections: handlers of another object's signals, declared from outside
// it. `function onFoo(a) {}` arrives as the prop `onFoo`; the object is
// `target`, the Connections' parent when it names none.
import { createRenderEffect, createRoot, onCleanup, runWithOwner } from "solid-js";
import { connect, defineType, onEveryWrite, QtObject, slot, whenComplete, whenCompleted } from "../object.ts";
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
// `connect` is what does it, as for a
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
      let connected: unknown = undefined;
      let started = false;
      // Whether `target` was given a value since the listeners were last
      // moved.
      let written = false;
      let unstir: (() => void) | null = null;
      onCleanup(() => unstir?.());
      // The target as the effect below reads it, untracked: an object that
      // is named and not made yet is no target until it is.
      const current = (): Dynamic | null | undefined => {
        const target = untrack(() => self.target) as Dynamic | null | undefined;
        return target != null && typeof target.$track === "function" && !target.$props ? null : target;
      };
      // The listeners go to `target`, from now on: what it changes after
      // this is heard, what it changed before is not.
      const moveTo = (target: Dynamic | null | undefined): void => {
        if (started && Object.is(target, connected)) return;
        started = true;
        connected = target;
        settles = [];
        disconnect?.();
        disconnect = null;
        unstir?.();
        unstir = null;
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
        // Only what is told late has anything to tell at the write: a
        // signal is told as it is emitted, to whoever is connected then.
        if (settles.length) unstir = onEveryWrite(follow);
      };
      // A target given a value is the target from the write on, as in Qt,
      // which moves its connections the moment it is written and not once
      // the flush is done: what the old target changed before the write
      // (in a state's `explicit` change, applied where it is written) is
      // told as the old target's, what either changes after it in the same
      // flush is the new one's. A binding given to it (`Qt.binding`, a
      // state's change that is not `explicit`) has no value until it is
      // read again, as the effect below does: a target it moves there is
      // the binding's move. Only a property with no signal of its own
      // (`children`) has anything to tell here: a signal (`widthChanged`)
      // is the signal's to tell, connected or not when it is emitted, and
      // settles nothing.
      const given = slot(self, "target")!;
      // The target's own binding (`target: root.useOther ? other : box`,
      // or one given by `Qt.binding`), asked again at every write: one that
      // moves it moves the listeners there and then, as Qt evaluates it the
      // moment what it reads is written. What the old target changed before
      // that write is told first, as its own; what it changes after it, in
      // the same flush, no longer is. A binding a state gives (not
      // `explicit`) has no expression of its own to ask: Qt evaluates it
      // once the state is in, and so does the effect below.
      const follow = (): void => {
        if (given.assigned || given.layers?.length || !given.bound?.source) return;
        const target = (self.$named ? given.afresh() : untrack(() => self.$parent)) as Dynamic | null | undefined;
        // An object that is named and not made yet: the effect's to wait for.
        if (target != null && typeof target.$track === "function" && !target.$props) return;
        if (Object.is(target, connected)) return;
        for (const settle of settles) settle();
        moveTo(target);
      };
      given.written = () => {
        for (const settle of settles) settle();
        const top = given.layers?.at(-1);
        written = top ? !top.bound : given.assigned || !given.bound;
        if (written) moveTo(current());
      };
      createRenderEffect(
        () => {
          const target = self.target as Dynamic | null | undefined;
          // An object that is named and not made yet: again once it is.
          const pending = target != null && typeof target.$track === "function" && !target.$props;
          if (pending) target.$track();
          return [pending ? null : target] as const;
        },
        ([target]) => {
          // Not written, so moved by a binding (`target: item.parent === a
          // ? b : a`, and `item` moved into `a`): the change that moved it is
          // the old target's, as Qt tells it before the binding runs again.
          const moved = !written;
          written = false;
          // The same target: its listeners have what it changed since.
          if (started && Object.is(target, connected)) return;
          if (moved) for (const settle of settles) settle();
          moveTo(target);
        },
      );
    });
  },
});

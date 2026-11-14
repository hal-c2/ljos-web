// `Task` (Ljos.Core): async work run from its arguments, and where it got
// to, as ljos-ui's `features/components/task.feature` and docs/DIALECT.md
// §4.19 have it.
//
// `run` is called with the elements of `args` and then an `AbortSignal`, as
// the Task completes and again when an element of `args` changes. Runs are
// numbered: what a run a newer one replaced gives is dropped, and the run in
// progress is aborted through its signal. Where the Task got to is `state`,
// one value; `status`, `value` and `error` are its parts, so each changes
// once a step and a binding of two of them once. A Task is a Controller:
// when the item it is declared in goes, its run is aborted.
import { defineType, derived, effect, settle, slot } from "../../object.js";
import { Controller } from "./controller.js";
import { untrack } from "#kernel";

const hidden = (object, key, value) => Object.defineProperty(object, key, { value, writable: true, configurable: true });

const INITIAL = Object.freeze({ status: "initial" });

const listed = (args) => (Array.isArray(args) ? args : args == null ? [] : Array.from(args));
const same = (a, b) => a.length === b.length && a.every((element, index) => element === b[index]);

// Of a whole step: the parts are read from it, so none is told of before
// the others are there.
function become(self, state) {
  slot(self, "state").write(Object.freeze(state));
  settle();
}

// Pending keeps the value the last run gave; a Task that is pending already
// stays the state it is, so a superseded run is told of by nobody.
function pend(self) {
  const now = untrack(() => self.state);
  if (now.status === "pending") return;
  become(self, now.status === "initial" ? { status: "pending" } : { status: "pending", value: now.value });
}

// The run in progress is aborted: its signal says so, and nothing it gives
// is taken.
function stop(self) {
  const running = self.$running;
  if (!running) return null;
  self.$running = null;
  self.$number++;
  running.abort();
  return running;
}

function call(self, args) {
  self.$queued = false;
  if (self.$ended) return;
  stop(self);
  // What the aborted run's signal told may have started a run: it was
  // asked for after this one, so it is the Task's run, and this one is
  // superseded before it was called. Nothing is aborted again, so a
  // listener that starts a run each time cannot make this loop.
  if (self.$running) return;
  const number = ++self.$number;
  const control = new AbortController();
  self.$running = control;
  pend(self);
  let given;
  try {
    const run = untrack(() => self.run);
    if (typeof run !== "function") throw new TypeError("Task.run is not a function");
    given = untrack(() => run(...args, control.signal));
  } catch (error) {
    given = Promise.reject(error);
  }
  Promise.resolve(given).then(
    (value) => finish(self, number, { status: "done", value }, "done", value),
    (error) => finish(self, number, { status: "failed", error, value: untrack(() => self.state).value }, "failed", error),
  );
}

function finish(self, number, state, signal, told) {
  if (number !== self.$number || self.$ended) return;
  self.$running = null;
  become(self, state);
  self[signal](told);
}

// Two changes of `args` in one turn run once, with the last: the run
// superseded before it was called is never called. An assignment settles
// what depends on it as it returns, so the end of the turn, not of the
// batch, is where the last change is known.
function queue(self) {
  if (self.$queued) return;
  self.$queued = true;
  queueMicrotask(() => {
    if (self.$queued) call(self, self.$args);
  });
}

export const Task = defineType("Task", Controller, {
  properties: {
    args: [],
    run: null,
    autoRun: true,
    state: INITIAL,
    status: derived((self) => self.state.status),
    value: derived((self) => self.state.value ?? null),
    error: derived((self) => self.state.error ?? null),
  },
  signals: ["done", "failed"],
  methods: {
    // With what it is given, or with `args`.
    start(...given) {
      call(this, given.length > 0 ? given : listed(untrack(() => this.args)));
    },
    // Fails the run in progress at once, with its signal's reason.
    abort() {
      this.$queued = false;
      const running = stop(this);
      // A run its signal's listeners started is in progress now: the Task
      // has not failed.
      if (!running || this.$running) return;
      const reason = running.signal.reason;
      become(this, { status: "failed", error: reason, value: untrack(() => this.state).value });
      this.failed(reason);
    },
  },
  setup(self) {
    hidden(self, "$number", 0);
    hidden(self, "$running", null);
    hidden(self, "$queued", false);
    hidden(self, "$args", null);
    effect(
      () => listed(self.args),
      (args) => {
        const first = self.$args === null;
        if (!first && same(args, self.$args)) return;
        self.$args = [...args];
        if (untrack(() => self.autoRun)) queue(self);
      },
    );
  },
  // Its run goes with the item it is declared in: a Loader that unloads it,
  // a view whose row went.
  ended(self) {
    self.$queued = false;
    stop(self);
  },
});

// The property and binding kernel as Ljós's own reactive graph
// (`ljos_reactive`), compiled to wasm (`crates/ljos_web_kernel`).
//
// The graph decides what depends on what, when a binding is out of date and
// where a loop ends; the values stay here, so nothing but node numbers
// crosses. Solid still renders: what a Solid computation reads of the graph
// it follows through a signal of its own (a face), which the graph tells
// when the node changes.
import { createMemo, createSignal, getObserver, onCleanup, runWithOwner, untrack as unfollowed } from "solid-js";

export const WASM = true;

// Solid refuses a write from a computation; the graph tells from inside one.
const WRITABLE = { ownedWrite: true };

// What the graph runs, and the faces it tells, by node number.
const runs = [];
const faces = [];
const watchers = [];
// The graph reuses a disposed node's number, but a slot or a signal's
// closure may still hold it and read or touch it late. So the page's handle
// is the number plus how many times it was disposed, times 2^32: a stale
// handle is told apart from the live one and is nothing. Until a number is
// reused the handle is the number itself, a small integer.
const SPAN = 2 ** 32;
// The count wraps where the handle would pass 2^53 and stop being exact; a
// stale handle then has to lie unused through 2^21 reuses of its number to
// be taken for the live one.
const GENERATIONS = 2 ** 21;
const reused = [];
const handle = (index) => index + (reused[index] ?? 0) * SPAN;
// The node number of `of`, or undefined when that node is gone.
function number(of) {
  const index = of >>> 0;
  return handle(index) === of ? index : undefined;
}
// A throw cannot unwind through the graph's frames (it would leave a node
// computing for ever): it is kept, the graph finishes, and it is thrown
// again on this side once the call into the graph returns.
let thrown = null;
// Whether a binding of the graph's is being evaluated and has not since
// said `untrack`: a read then is the graph's to record. A Solid computation
// run inside the evaluation follows through its face instead.
let tracking = false;

const imports = {
  ljos: {
    evaluate(index) {
      const was = tracking;
      tracking = true;
      try {
        return runs[index]() ? 1 : 0;
      } catch (error) {
        thrown ??= { error };
        return 0;
      } finally {
        tracking = was;
      }
    },
    changed(index) {
      faces[index]?.[1]((version) => version + 1);
    },
  },
};

const url = new URL("./ljos_web_kernel.wasm", import.meta.url);
const { instance } = await WebAssembly.instantiateStreaming(fetch(url), imports);
const k = instance.exports;

function rethrow() {
  if (thrown === null) return;
  const { error } = thrown;
  thrown = null;
  throw error;
}

// Whether a read now is followed by anything: a binding of the graph's or
// a Solid computation.
export const followed = () => tracking || getObserver() !== null;

// Solid's `untrack` for both: what is read inside is followed neither by a
// Solid computation nor by the binding of the graph's being evaluated, as
// an object a binding makes reads what it is made of without the binding
// coming to depend on it.
export function untrack(work) {
  if (!tracking) return unfollowed(work);
  tracking = false;
  try {
    return unfollowed(work);
  } finally {
    tracking = true;
  }
}

function dispose(of) {
  const index = number(of);
  if (index === undefined) return;
  const watcher = watchers[index];
  if (watcher !== undefined) k.ljos_dispose(watcher);
  // Before the graph can hand the number out again.
  runs[index] = faces[index] = watchers[index] = undefined;
  reused[index] = ((reused[index] ?? 0) + 1) % GENERATIONS;
  k.ljos_dispose(index);
  // Disposing tells what depended on the node, which may evaluate. This
  // runs as an owner's cleanup, which a throw would cut short, so what an
  // evaluation threw is reported here rather than left for the next read.
  if (thrown !== null) {
    const { error } = thrown;
    thrown = null;
    reportError(error);
  }
}

function made(index, owner) {
  const of = handle(index);
  if (owner) runWithOwner(owner, () => onCleanup(() => dispose(of)));
  return of;
}

// A value kept here that the graph is told of when it changes.
export const cell = (owner) => made(k.ljos_cell(), owner);

// A binding: `run` evaluates it and says whether it gave something new.
export function binding(owner, run) {
  const index = k.ljos_binding();
  runs[index] = () => unfollowed(run);
  return made(index, owner);
}

// Brings the node up to date and has whoever is reading follow it. A node
// that is gone reads as nothing and is followed by no one.
export function read(of, owner) {
  const index = number(of);
  if (index === undefined) return;
  if (getObserver()) {
    let face = faces[index];
    if (!face) face = faces[index] = runWithOwner(owner ?? null, () => faced(index));
    face[0]();
    return;
  }
  if (tracking) k.ljos_read(index);
  else k.ljos_pull(index);
  rethrow();
}

// What a Solid computation follows a node through: told when a change may
// have reached the node, it asks the graph in Solid's own flush, and what
// gives the version it had stops there, as a memo of Solid's does.
function faced(index) {
  const [told, tell] = createSignal(0, WRITABLE);
  const seen = createMemo(() => {
    told();
    const version = k.ljos_pull(index);
    rethrow();
    return version;
  });
  watchers[index] = k.ljos_follow(index);
  return [seen, tell];
}

// The value kept for the node changed: what depends on it is told now.
export function touch(of) {
  const index = number(of);
  if (index === undefined) return;
  k.ljos_bump(index);
  rethrow();
}

// A version to follow and to move, for what keeps a value of its own
// outside a slot: Solid's `createSignal(0)` as the runtime uses it.
export function version(owner) {
  const index = cell(owner);
  return [() => read(index, owner), () => touch(index)];
}

// Solid's `createSignal` on the graph: a value kept here, as a cell the
// graph's bindings and Solid's computations both follow.
// `equals: false` tells of every write, the same value or not.
export function signal(value, owner = null, { equals } = {}) {
  const index = cell(owner);
  const same = equals === false ? () => false : Object.is;
  const get = () => {
    read(index, owner);
    return value;
  };
  const set = (next) => {
    if (typeof next === "function") next = next(value);
    if (same(next, value)) return value;
    value = next;
    touch(index);
    return value;
  };
  return [get, set];
}

// How many nodes the graph holds: for tests and measurements.
export const live = () => k.ljos_live();

// The property and binding kernel as Ljós's own reactive graph
// (`ljos_reactive`), compiled to wasm (`crates/ljos_web_kernel`).
//
// The graph decides what depends on what, when a binding is out of date and
// where a loop ends; the values stay here, so nothing but node numbers
// crosses. Solid still renders: what a Solid computation reads of the graph
// it follows through a signal of its own (a face), which the graph tells
// when the node changes.
import { createSignal, getObserver, onCleanup, runWithOwner, untrack } from "solid-js";

export const WASM = true;

// Solid refuses a write from a computation; the graph tells from inside one.
const WRITABLE = { ownedWrite: true };

// What the graph runs, and the faces it tells, by node number.
const runs = [];
const faces = [];
const watchers = [];
// A throw cannot unwind through the graph's frames (it would leave a node
// computing for ever): it is kept, the graph finishes, and it is thrown
// again on this side once the call into the graph returns.
let thrown = null;
// How many bindings of the graph's are being evaluated: a read then is the
// graph's to track.
let evaluating = 0;

const imports = {
  ljos: {
    evaluate(index) {
      evaluating++;
      try {
        return runs[index]() ? 1 : 0;
      } catch (error) {
        thrown ??= { error };
        return 0;
      } finally {
        evaluating--;
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
export const followed = () => evaluating > 0 || getObserver() !== null;

function dispose(index) {
  const watcher = watchers[index];
  if (watcher !== undefined) k.ljos_dispose(watcher);
  k.ljos_dispose(index);
  runs[index] = faces[index] = watchers[index] = undefined;
}

function owned(index, owner) {
  if (owner) runWithOwner(owner, () => onCleanup(() => dispose(index)));
  return index;
}

// A value kept here that the graph is told of when it changes.
export const cell = (owner) => owned(k.ljos_cell(), owner);

// A binding: `run` evaluates it and says whether it gave something new.
export function binding(owner, run) {
  const index = k.ljos_binding();
  runs[index] = () => untrack(run);
  return owned(index, owner);
}

// Brings `index` up to date and has whoever is reading follow it.
export function read(index, owner) {
  if (getObserver()) {
    let face = faces[index];
    if (!face) {
      face = faces[index] = runWithOwner(owner ?? null, () => createSignal(0, WRITABLE));
      watchers[index] = k.ljos_follow(index);
    }
    face[0]();
  }
  k.ljos_read(index);
  rethrow();
}

// The value kept for `index` changed: what depends on it is told now.
export function touch(index) {
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
export function signal(value, owner = null) {
  const index = cell(owner);
  const get = () => {
    read(index, owner);
    return value;
  };
  const set = (next) => {
    if (typeof next === "function") next = next(value);
    if (Object.is(next, value)) return value;
    value = next;
    touch(index);
    return value;
  };
  return [get, set];
}

// How many nodes the graph holds: for tests and measurements.
export const live = () => k.ljos_live();

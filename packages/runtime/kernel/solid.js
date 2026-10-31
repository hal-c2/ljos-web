// The property and binding kernel on Solid's own signals: the runtime as it
// has always been. `kernel/wasm.js` is the same interface over Ljós's graph.
import { createSignal, getObserver, untrack } from "solid-js";

export const WASM = false;

// Never called here: `object.js` asks for them only where `WASM` is true.
const absent = () => {
  throw new Error("ljos-web: the wasm kernel is not in this build");
};
export const cell = absent;
export const binding = absent;
export const read = absent;
export const touch = absent;
export const version = absent;

// Whether a read now is followed: by a Solid computation, the only kind.
export const followed = () => getObserver() !== null;

// Solid's own: there is nothing else to follow a read.
export { untrack };

// Without the graph a signal is Solid's own. `equals: false` tells of
// every write, the same value or not.
export const signal = (value, owner, { equals } = {}) =>
  createSignal(value, equals === undefined ? { ownedWrite: true } : { ownedWrite: true, equals });
export const live = absent;

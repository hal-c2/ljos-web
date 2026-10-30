// The property and binding kernel on Solid's own signals: the runtime as it
// has always been. `kernel/wasm.js` is the same interface over Ljós's graph.
import { createSignal } from "solid-js";

export const WASM = false;

// Never called here: `object.js` asks for them only where `WASM` is true.
const absent = () => {
  throw new Error("ljos-web: the wasm kernel is not in this build");
};
export const followed = absent;
export const cell = absent;
export const binding = absent;
export const read = absent;
export const touch = absent;
export const version = absent;

// Without the graph a signal is Solid's own.
export const signal = (value) => createSignal(value, { ownedWrite: true });
export const live = absent;

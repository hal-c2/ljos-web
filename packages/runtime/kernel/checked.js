// The wasm kernel a build opts into (`LJOS_KERNEL=wasm`, the
// `ljos-wasm-kernel` condition), behind a real check: Ljós's graph
// compiled to wasm (`kernel/wasm.js`) where the page can run WebAssembly
// and the wasm comes down, else Solid's signals (`kernel/solid.js`), the
// default every other build has. Each is its own chunk, imported once the
// answer is known, so a page on the wasm kernel never fetches Solid's.
import { wasmWorks } from "../wasm-check.js";
import { compile } from "./load.js";

async function choose() {
  if (wasmWorks()) {
    // Fetching the bytes while the chunk that uses them is fetched.
    try {
      compile().catch(() => {});
      return await import("./wasm.js");
    } catch (error) {
      console.warn(`ljos-web: the wasm kernel did not load (${error?.message ?? error}); running on Solid's signals`);
    }
  }
  return import("./solid.js");
}

const kernel = await choose();

export const { WASM, cell, binding, placed, read, touch, version, followed, untrack, signal, live } = kernel;

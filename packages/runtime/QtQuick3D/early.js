// The wgpu renderer's chunk, asked for while a page that draws in space on
// it is still loading, before its first view is made: the wasm is compiled
// as it arrives, while the page's document is being built. `wgpu.js` hands
// what is compiled here to the glue, so the wasm is fetched once however
// soon its first view asks; a fetch that fails here is only asked for again
// there.
//
// What asks is a compiled document that names a type drawn in space: the
// QML plugin calls `early()` first thing in such a module (`vite.js`). Not
// this module's being run, nor View3D's: the QtGraphs module carries View3D
// for its graphs in space, so a page of graphs in the plane would fetch it
// too. A document compiled in the browser asks as its first view is made.
import { guardedFetch } from "../guard.js";

const asked = new URLSearchParams(globalThis.location?.search ?? "").get("view3d");

// DECISION: which renderer a View3D has, until `render.js` goes: the page's
// `?view3d=`, else what the build said (`VITE_LJOS_VIEW3D`), else the
// JavaScript one, as long as that alone passes all of `quick3d.spec.js`.
export const renderer = () => asked ?? import.meta.env?.VITE_LJOS_VIEW3D ?? "js";

const glue = import.meta.glob("./wgpu/ljos_web_3d.js");
// Globs, as for the glue in `wgpu.js`: a build of JavaScript alone has not
// got these files. The address is had at once, so the fetch starts as this
// module is run and not a round trip later: a build writes it in here, and
// a dev server serves it as a module of its own.
const addresses = import.meta.glob("./wgpu/ljos_web_3d_bg.wasm", { query: "?url", import: "default", eager: true });

// What arrived, compiled: as it arrives where it is said to be wasm, else
// from its bytes once they are all here, as the glue does. Not a copy of
// the response streamed and the other kept for a failure, which would hold
// the renderer twice over.
async function compile(response) {
  if (!response.ok) return undefined;
  if (response.headers.get("content-type")?.split(";")[0].trim() === "application/wasm") return WebAssembly.compileStreaming(response);
  return WebAssembly.compile(await response.arrayBuffer());
}

let compiled = null;
export function early() {
  if (compiled || renderer() !== "wgpu") return;
  const load = glue["./wgpu/ljos_web_3d.js"];
  const address = addresses["./wgpu/ljos_web_3d_bg.wasm"];
  if (!load || !address) return;
  // `wgpu.js` fetches these with the chunk.
  load().catch(() => {});
  import("./Particles3D/drawn.js").catch(() => {});
  compiled = guardedFetch(address)
    .then(compile)
    .catch(() => undefined);
}

// The wasm compiled for the glue's `default()`, once it is: undefined when
// it was not asked for here or did not arrive, and the glue fetches its own.
export function made() {
  return compiled ?? Promise.resolve(undefined);
}

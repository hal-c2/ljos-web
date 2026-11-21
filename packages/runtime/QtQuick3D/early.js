// The wgpu renderer's chunk, asked for while a page that draws in space on
// it is still loading, before its first view is made: the wasm is compiled
// as it arrives, while the page's document is being built. `wgpu.js` hands
// what is compiled here to the glue, so the wasm is fetched once however
// soon its first view asks; a fetch that fails here is only asked for again
// there.
//
// What asks is a compiled document that names a type drawn in space: the
// QML plugin calls `early()` first thing as one is made (`vite.js`), from
// whichever of `early-at-once.js` and `early-held.js` holds the address. Not
// this module's being run, nor View3D's, nor the document's: the QtGraphs
// module carries View3D for its graphs in space, and an application has
// all its pages' documents at once, so a page that draws nothing in space
// would fetch it too. A document compiled in the browser asks as its first
// view is made.
import { guardedFetch } from "../guard.js";

const asked = new URLSearchParams(globalThis.location?.search ?? "").get("view3d");

const glue = import.meta.glob("./wgpu/ljos_web_3d.js");

// DECISION: which renderer a View3D has, until `render.js` goes: the page's
// `?view3d=`, else what the build said (`VITE_LJOS_VIEW3D`), else wgpu
// wherever the browser runs WebAssembly and the build has the renderer.
// wgpu draws on WebGPU where the page is given an adapter and on WebGL 2
// where it is not (ljos_3d's surface asks, `View3d.backend()` says which),
// as Qt's pictures are drawn on either (`quick3d.spec.js`, `graphs3d.spec.js`
// on `tests/wgpu.config.js`). The JavaScript renderer reads no model from a
// file, so a browser without WebGPU, or without an adapter for it, would
// draw a scene of glTF models without them: the site's watch had its light
// strips and no case. `js` still has the JavaScript one, as does a browser
// without WebAssembly, which cannot run the wgpu renderer, and a build
// without it (`mise run build:wasm-3d`): there a view is drawn by the
// JavaScript renderer instead of nothing.
const wasm = typeof WebAssembly === "object";
export const renderer = () => chosen() ?? (wasm && glue["./wgpu/ljos_web_3d.js"] ? "wgpu" : "js");

// The renderer the page or the build asked for, if either did. What the
// build said is a default a browser without WebAssembly passes over; a page
// that asks by its address gets what it asked.
const built = () => (wasm ? import.meta.env?.VITE_LJOS_VIEW3D : undefined);
export const chosen = () => asked ?? built();

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
// Asked for with the address, or what will have it: undefined where a
// build has not got the renderer. An address in hand is fetched at once, in
// the task that asks, before the view that document makes; one still to
// come is fetched as it comes.
export function asking(address) {
  if (compiled || renderer() !== "wgpu") return;
  const load = glue["./wgpu/ljos_web_3d.js"];
  if (!load || !address) return;
  const fetched = (url) => (url ? guardedFetch(url).then(compile) : undefined);
  const fetching = () => {
    // `wgpu.js` fetches these with the chunk.
    load().catch(() => {});
    import("./Particles3D/drawn.js").catch(() => {});
    return typeof address === "string" ? fetched(address) : address.then(fetched);
  };
  compiled = fetching().catch(() => undefined);
}

// The wasm compiled for the glue's `default()`, once it is: undefined when
// it was not asked for here or did not arrive, and the glue fetches its own.
export function made() {
  return compiled ?? Promise.resolve(undefined);
}

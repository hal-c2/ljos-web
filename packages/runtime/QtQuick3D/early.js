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

// DECISION: which renderer a View3D has, until `render.js` goes: the page's
// `?view3d=`, else what the build said (`VITE_LJOS_VIEW3D`), else wgpu where
// the browser has WebGPU, which draws Qt's pictures as the JavaScript one
// does (`quick3d.spec.js`, `graphs3d.spec.js` on `tests/wgpu.config.js`).
// `js` still has the JavaScript one, as does a browser without WebGPU, or
// without WebAssembly, which cannot run the wgpu renderer: there it draws
// with the JavaScript one instead of nothing.
//
// DECISION: where WebGPU is not, or gives no adapter, that stays so for a
// scene unless it shows models from files (a node's `$unread`), none of
// them is still on the way, one at least can be shown, and it shows nothing
// left to the JavaScript renderer (`View3D.js`, `scriptAlone`, `readable`). Such a view is drawn by wgpu on
// WebGL 2, and by the JavaScript renderer again if such a thing comes to
// it. Not every view: some of what that one draws as Qt does is not so on
// wgpu, or is not known to be, and a scene is to look no worse for this.
const wasm = typeof WebAssembly === "object";
export const renderer = () => chosen() ?? (wasm && globalThis.navigator?.gpu ? "wgpu" : "js");

// The renderer the page or the build asked for, if either did: a view on
// the one taken for want of an ask is drawn by the JavaScript renderer when
// WebGPU gives it no adapter (`adapted`), where one asked for says why not.
// What the build said is a default a browser without WebAssembly passes
// over; a page that asks by its address gets what it asked.
const built = () => (wasm ? import.meta.env?.VITE_LJOS_VIEW3D : undefined);
export const chosen = () => asked ?? built();

// Whether WebGPU has an adapter for this page, asked once: a browser may
// have WebGPU and no GPU it lets it use.
let adapter = null;
export function adapted() {
  adapter ??= Promise.resolve(globalThis.navigator?.gpu?.requestAdapter())
    .then((found) => !!found)
    .catch(() => false);
  return adapter;
}

const glue = import.meta.glob("./wgpu/ljos_web_3d.js");

// Whether wgpu can be turned to for what only it reads where WebGPU gives
// the page nothing: no one asked for a renderer, the build has wgpu's, and
// there is WebAssembly and WebGL 2 for it (a prerender has no WebGL 2).
export const readable = () => !chosen() && wasm && !!glue["./wgpu/ljos_web_3d.js"] && typeof globalThis.WebGL2RenderingContext === "function";

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
  // Taken for want of an ask, it is fetched only once WebGPU has an adapter
  // for the page: one without draws on the JavaScript renderer.
  const wanted = chosen() ? fetching() : adapted().then((found) => (found ? fetching() : undefined));
  compiled = wanted.catch(() => undefined);
}

// The wasm compiled for the glue's `default()`, once it is: undefined when
// it was not asked for here or did not arrive, and the glue fetches its own.
export function made() {
  return compiled ?? Promise.resolve(undefined);
}

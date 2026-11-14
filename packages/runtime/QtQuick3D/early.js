// The wgpu renderer's chunk, asked for while a page that draws a View3D on
// it is still loading, before its first view is made: the wasm is compiled
// as it arrives, while the page's document is being built. `wgpu.js` hands
// what is compiled here to the glue, so the wasm is fetched once however
// soon its first view asks; a fetch that fails here is only asked for again
// there.
import { guardedFetch } from "../guard.js";

const glue = import.meta.glob("./wgpu/ljos_web_3d.js");
// Globs, as for the glue in `wgpu.js`: a build of JavaScript alone has not
// got these files. The address is had at once, so the fetch starts as this
// module is run and not a round trip later: a build writes it in here, and
// a dev server serves it as a module of its own.
const addresses = import.meta.glob("./wgpu/ljos_web_3d_bg.wasm", { query: "?url", import: "default", eager: true });

let compiled = null;
export function early() {
  if (compiled) return;
  const load = glue["./wgpu/ljos_web_3d.js"];
  const address = addresses["./wgpu/ljos_web_3d_bg.wasm"];
  if (!load || !address) return;
  // `wgpu.js` fetches these with the chunk.
  load().catch(() => {});
  import("./Particles3D/drawn.js").catch(() => {});
  compiled = WebAssembly.compileStreaming(guardedFetch(address)).catch(() => undefined);
}

// The wasm compiled for the glue's `default()`, once it is: undefined when
// it was not asked for here or did not arrive, and the glue fetches its own.
export function made() {
  return compiled ?? Promise.resolve(undefined);
}

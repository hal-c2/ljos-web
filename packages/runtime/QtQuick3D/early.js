// The wgpu renderer's chunk, asked for while a page that draws a View3D on
// it is still loading, before its first view is made: the wasm is compiled
// as it arrives, while the page's document is being built, and the first
// view finds it made. `wgpu.js` asks for the chunk as before; its glue finds
// the instance made here and hands that over. Should it ask first, its own
// instance is the one kept and this one is let go, so there is one either
// way, and a fetch that fails here is only asked for again there.
import { guardedFetch } from "../guard.js";

const glue = import.meta.glob("./wgpu/ljos_web_3d.js");
// Globs, as for the glue in `wgpu.js`: a build of JavaScript alone has not
// got these files. The address is had at once, so the fetch starts as this
// module is run and not a round trip later: a build writes it in here, and
// a dev server serves it as a module of its own.
const addresses = import.meta.glob("./wgpu/ljos_web_3d_bg.wasm", { query: "?url", import: "default", eager: true });

let asked = false;
export function early() {
  if (asked) return;
  asked = true;
  const load = glue["./wgpu/ljos_web_3d.js"];
  const address = addresses["./wgpu/ljos_web_3d_bg.wasm"];
  if (!load || !address) return;
  // `wgpu.js` fetches these shaders with the chunk.
  import("./Particles3D/drawn.js").catch(() => {});
  const compiled = WebAssembly.compileStreaming(guardedFetch(address));
  Promise.all([load(), compiled])
    .then(([loaded, module]) => loaded.initSync({ module }))
    .catch(() => {});
}

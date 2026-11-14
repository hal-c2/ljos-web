// The early ask (`early.js`) in a build for the JavaScript renderer, whose
// page may still say wgpu (`?view3d=`). The wasm's address is a module of
// its own, asked for as this one is run when the page draws on wgpu: every
// page of an application has its documents' modules at once, and what
// holds the address names the wasm, so each page would name the renderer
// in what it loads before it runs. Asked for then, it is mostly here by
// the time a document that draws in space is made.
//
// A glob, as for the glue in `wgpu.js`: a build of JavaScript alone has not
// got the file.
import { asking, renderer } from "./early.js";

const addresses = import.meta.glob("./wgpu/ljos_web_3d_bg.wasm", { query: "?url", import: "default" });
const coming = renderer() === "wgpu" ? addresses["./wgpu/ljos_web_3d_bg.wasm"]?.().catch(() => undefined) : undefined;
// Once it has come, the address itself, so the fetch starts in the task
// that asks.
let address;
coming?.then((url) => (address = url));

export const early = () => asking(address ?? coming);

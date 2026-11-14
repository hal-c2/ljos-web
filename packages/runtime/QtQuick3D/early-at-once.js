// The early ask (`early.js`) where a view may draw on wgpu by default: on
// the dev server, whose page says which renderer with `?view3d=`, and in a
// build for wgpu. The wasm's address is had at once, so the fetch starts
// as the first document that draws in space is made and not a round trip
// later: a build writes it in here, and a dev server serves it as a module
// of its own.
//
// A glob, as for the glue in `wgpu.js`: a build of JavaScript alone has not
// got the file.
import { asking } from "./early.js";

const addresses = import.meta.glob("./wgpu/ljos_web_3d_bg.wasm", { query: "?url", import: "default", eager: true });
const address = addresses["./wgpu/ljos_web_3d_bg.wasm"];

export const early = () => asking(address);

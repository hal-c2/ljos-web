// Mounts `scenes/<name>.qml` for `?scene=<name>`, filling the page, as a
// production build of an application mounts its root: the 3D perf
// harness's page (`measure.bench.js`). `window.clock` is there for the
// harness to stop time, to measure the scene standing still.
import { mount } from "ljos-web/object";
import { clock } from "ljos-web/QtQuick";

const scenes = import.meta.glob("./scenes/*.qml");
const query = new URLSearchParams(location.search);
const name = query.get("scene");
const module = await scenes[`./scenes/${name}.qml`]();
// `?at=<ms>` shows the scene as it is that long after it starts, standing
// still: the same picture on every renderer, to compare them by.
const at = query.get("at");
if (at !== null) clock.stop();
const root = mount(module.default, document.getElementById("scene"));
if (at !== null) clock.advance(Number(at));
window.scene = root.object;
window.clock = clock;
performance.mark("ready");
window.ready = true;

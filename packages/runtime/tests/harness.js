// Mounts `scenes/<name>.js` for `?scene=<name>`. A scene's default export is
// a component; the object it makes is `window.scene`, and whatever else the
// module exports as `objects` is there for a test to read and assign to. A
// scene may be QML: then the objects are what its root has aliases for.
// With `&still` time stands still from the start, for `window.clock` to move.
import { flush, mount } from "ljos-web/object";
import { clock } from "ljos-web/QtQuick";

const scenes = import.meta.glob("./scenes/*.{js,qml}");
const asked = new URLSearchParams(location.search);
const name = asked.get("scene");
if (asked.has("still")) clock.stop();
const module = await (scenes[`./scenes/${name}.js`] ?? scenes[`./scenes/${name}.qml`])();
const { object } = mount(module.default, document.getElementById("scene"));
window.scene = object;
window.objects = module.objects ?? object;
window.flush = flush;
window.clock = clock;
window.ready = true;

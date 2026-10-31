// Mounts `scenes/<name>.js` for `?scene=<name>`. A scene's default export is
// a component; the object it makes is `window.scene`, and whatever else the
// module exports as `objects` is there for a test to read and assign to. A
// scene may be QML: then the objects are what its root has aliases for.
// With `&still` time stands still from the start, for `window.clock` to move.
// `window.reload(name)` reloads the mounted root with another scene's
// component, as a save does: it answers the error's message if there was one.
// With `&inspect` the root is `window.inspector`.
import { flush, mount } from "ljos-web/object";
import { reload } from "ljos-web/reload";
import { clock } from "ljos-web/QtQuick";

const scenes = import.meta.glob("./scenes/*.{js,qml}");
const asked = new URLSearchParams(location.search);
const name = asked.get("scene");
if (asked.has("still")) clock.stop();
const module = await (scenes[`./scenes/${name}.js`] ?? scenes[`./scenes/${name}.qml`])();
const handle = mount(module.default, document.getElementById("scene"));
// A reload puts a new root in the handle: these read the one there now.
Object.defineProperty(window, "scene", { get: () => handle.object });
Object.defineProperty(window, "objects", { get: () => module.objects ?? handle.object });
window.reload = async (other) => {
  const next = await (scenes[`./scenes/${other}.js`] ?? scenes[`./scenes/${other}.qml`])();
  try {
    reload(handle, next.default);
    return null;
  } catch (error) {
    return `${error.name}: ${error.message}`;
  }
};
window.flush = flush;
// `&inspect`: the scene's root, inspected (`ljos-web/inspect`).
if (asked.has("inspect")) {
  const { inspect } = await import("ljos-web/inspect");
  window.inspect = inspect;
  window.inspector = inspect(handle.object);
}
window.clock = clock;
window.ready = true;

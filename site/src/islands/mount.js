import "ljos-web/runtime.css";
import { mount } from "ljos-web/object";

// Feature detection for what a demo needs, never user-agent sniffing: a
// browser that cannot do the work keeps the server-rendered picture and
// description instead of a broken stage. Throws with the reason, which
// the caller turns into the figure's failed state.
export function capable(needs = []) {
  for (const need of needs) {
    if (need === "wasm" && typeof WebAssembly !== "object") {
      throw new Error("this browser has no WebAssembly");
    }
    if (need === "gpu") {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2");
      if (!navigator.gpu && !gl) throw new Error("this browser has neither WebGPU nor WebGL2");
    }
    if (need === "webgl") {
      const canvas = document.createElement("canvas");
      if (!canvas.getContext("webgl2") && !canvas.getContext("webgl")) {
        throw new Error("this browser has no WebGL");
      }
    }
  }
}

const calmQuery = () => matchMedia("(prefers-reduced-motion: reduce)");

// Every showcase demo's root declares two properties the page drives:
// `active` (run only while on screen, so an idle page costs 0 % CPU)
// and `calm` (the visitor asked for reduced motion: less movement, not
// a dead picture). Wiring lives here so each demo stays a plain QML app.
export function wireLifecycle(object, element) {
  if (!object) return;
  const set = (name, value) => {
    try {
      if (name in object) object[name] = value;
    } catch {
      // A demo without the property simply does not take part.
    }
  };
  const mq = calmQuery();
  set("calm", mq.matches);
  mq.addEventListener?.("change", () => set("calm", mq.matches));
  let visible = true;
  const apply = () => set("active", visible && !document.hidden);
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) visible = entry.isIntersecting;
      apply();
    },
    { rootMargin: "40px" },
  );
  io.observe(element);
  document.addEventListener("visibilitychange", apply);
  apply();
}

// Mounts a compiled demo component sized to its element. Returns the
// mount handle (its `object` is the QML root).
export function mountDemo(Component, el, { reloadable = false } = {}) {
  const handle = mount(Component, el, {}, { fill: true, reloadable });
  wireLifecycle(handle.object, el);
  return handle;
}

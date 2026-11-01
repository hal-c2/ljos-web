// A page that compiles QML in itself, for compiler.spec.js: it imports
// `ljos-web/compiler` and compiles only when a test asks.
import { compile, createCompiler, translate } from "ljos-web/compiler";
import { flush, mount } from "ljos-web/object";

// Compiles `request` and mounts what it made, as the harness mounts a
// scene: `window.scene` is the object, `window.objects` what its root has
// aliases for. Answers what the compile did, less the component.
window.show = async (request, compiler = { compile }) => {
  const made = await compiler.compile(request);
  if (made.diagnostics) return made;
  const { object } = mount(made.component, document.getElementById("scene"));
  window.scene = object;
  window.objects = object;
  return { mounted: true, warnings: made.warnings };
};
window.compiler = { compile, createCompiler, translate };
window.flush = flush;
window.ready = true;

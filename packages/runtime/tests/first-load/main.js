// An application whose root has a View3D among what it imports at once,
// as ljos.dev's pages all have its demos: `first-load.spec.js`.
import { mount } from "ljos-web/object";
import Scene from "../scenes/wgpu_named.qml";

mount(Scene, document.getElementById("scene"));

import "ljos-web/runtime.css";
import { mount } from "ljos-web/object";

const scenes = { Main: () => import("../qml/Main.qml"), Gauges: () => import("../qml/Gauges.qml"), Dials: () => import("../qml/Dials.qml"), Label: () => import("../qml/Label.qml"), Facets: () => import("../qml/Facets.qml") };
const name = new URLSearchParams(location.search).get("scene") ?? "Main";
const { default: Scene } = await scenes[name]();
const { object } = mount(Scene, document.getElementById("app"));

window.scene = object;
window.ready = true;

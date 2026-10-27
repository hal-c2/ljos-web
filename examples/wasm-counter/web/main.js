import "ljos-web/runtime.css";
import { mount } from "ljos-web/object";
import Main from "../qml/Main.qml";
import { Counter as RustCounter } from "../pkg/wasm_counter.js";

const { object } = mount(Main, document.getElementById("app"));

// For the test, and for poking at it from the console.
window.scene = object;
window.RustCounter = RustCounter;
window.ready = true;

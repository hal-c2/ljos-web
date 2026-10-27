import "ljos-web/runtime.css";
import { createComponent, render } from "@solidjs/web";
import Demo from "./qml/Demo.qml";
import { Shell, Theme, setTheme } from "./host.js";

render(() => createComponent(Demo, {}), document.getElementById("app"));

// For poking at the app from the console.
window.demo = { Shell, Theme, setTheme };

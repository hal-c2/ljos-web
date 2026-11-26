// A face of Ljos.Ui (index.js says what a face is), in a module of its own
// so that only a page that names it loads the type it faces.
import { DragHandler, HoverHandler, TapHandler, WheelHandler } from "../../QtQuick/handlers.js";
import { gesture } from "./face.js";

// `TapHandler`, called `Tap`: a gesture is a child of the item it acts
// on, and says what it recognises. The others likewise.
export const Tap = /* @__PURE__ */ gesture("Tap", TapHandler);
export const Hover = /* @__PURE__ */ gesture("Hover", HoverHandler);
export const Drag = /* @__PURE__ */ gesture("Drag", DragHandler);
export const Wheel = /* @__PURE__ */ gesture("Wheel", WheelHandler);
// Not here: `Pointer`, the face of Qt's PointHandler, which the runtime
// does not have in `QtQuick` either. A dialect file that names it says
// so at load, by the import it cannot make.

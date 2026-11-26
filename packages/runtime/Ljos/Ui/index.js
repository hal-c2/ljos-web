// `import Ljos.Ui`: the items of Ljós's own API, as Ljós has them
// natively (ljos-ui's `ljos_quick/src/ljos_ui.rs` and the `Ljos.Ui`
// module of its type table are the specification).
//
// A type Ljós renames, or whose members it renames, is a *face* of the
// runtime's type: the same object, made, painted and taking input the
// same, under the new names. A type it keeps as it is is the same type,
// exported from this module too. So a file in Ljós's API and the Qt file
// it was lowered from make the same objects, and what a scene does with
// an item it does with both.
//
// A face here is a type derived from the one it faces, in whose props
// the dialect's names are put under the names the type has, and on whose
// objects the dialect's names read and write the same slot. Neither the
// object nor its slot is made twice: `fill` and `color` are one slot, so
// a Behavior, a state or an animation that names `fill` moves what
// `color` reads. The dialect's font size, `font.size`, is a second name
// for `pixelSize` on every font (`QtQuick/font.ts`), as natively.
import { face } from "./face.js";
import { Accessible } from "../../QtQuick/Accessible.ts";
import { Animation, ParallelAnimation, PauseAnimation, ScriptAction, SequentialAnimation } from "../../QtQuick/animation/Animation.js";
import { Behavior } from "../../QtQuick/animation/Behavior.js";
import { Canvas } from "../../QtQuick/Canvas.js";
import { MultiEffect } from "../../QtQuick/Effects/MultiEffect.js";
import { RectangularShadow } from "../../QtQuick/Effects/RectangularShadow.js";
import { FrameAnimation } from "../../QtQuick/animation/Timer.js";
import { Easing } from "../../QtQuick/animation/easing.js";
import {
  ColorAnimation as ColorAnimationBase,
  NumberAnimation as NumberAnimationBase,
  PropertyAction,
  PropertyAnimation as PropertyAnimationBase,
  RotationAnimation as RotationAnimationBase,
  SmoothedAnimation as SmoothedAnimationBase,
  SpringAnimation as SpringAnimationBase,
} from "../../QtQuick/animation/PropertyAnimation.js";
import { calmed } from "./motion.js";
import { Flickable } from "../../QtQuick/Flickable.js";
import { font } from "../../QtQml/application.ts";
import { Font as FontEnums } from "../../QtQuick/font.ts";
import { DropArea } from "../../QtQuick/Drag.js";
import { PointerDevice } from "../../QtQuick/handlers.js";
import { Image } from "../../QtQuick/Image.js";
import { Item } from "../../QtQuick/Item.js";
import { KeyNavigation, Keys, Shortcut } from "../../QtQuick/Keys.js";
import { LayoutMirroring } from "../../QtQuick/LayoutMirroring.ts";
import { Loader as LoaderBase } from "../../QtQuick/Loader.js";
import { MouseArea } from "../../QtQuick/MouseArea.js";
import {
  Path,
  PathAngleArc,
  PathArc,
  PathAttribute,
  PathCubic,
  PathCurve,
  PathLine,
  PathMove,
  PathMultiline,
  PathPercent,
  PathPolyline,
  PathQuad,
  PathRectangle,
  PathSvg,
} from "../../QtQuick/Path.js";
import { PathView } from "../../QtQuick/PathView.js";
import { Gradient, GradientStop, Rectangle as RectangleBase } from "../../QtQuick/Rectangle.js";
import { Repeater } from "../../QtQuick/Repeater.js";
import { ConicalGradient, LinearGradient, RadialGradient, ShapeGradient } from "../../QtQuick/Shapes/gradients.js";
import { Shape, ShapePath } from "../../QtQuick/Shapes/Shape.js";
import { PropertyChanges, State, Transition } from "../../QtQuick/states.js";
import { Text as TextBase } from "../../QtQuick/Text.js";
import { TextEdit, TextInput } from "../../QtQuick/TextInput.js";
import { Rotation, Scale, Translate } from "../../QtQuick/transforms.ts";
import { FontMetrics, TextMetrics } from "../../QtQuick/TextMetrics.js";
import { DoubleValidator, IntValidator, RegularExpressionValidator } from "../../QtQuick/validators.ts";
import { Screen, Window } from "../../QtQuick/Window.js";

// `Rectangle`, with `color` called `fill`: what is inside the outline,
// beside the `border` around it, where a `color` of `Text` is the glyphs'.
// Asked for less motion, they move nothing and still fade (motion.js).
export const PropertyAnimation = /* @__PURE__ */ calmed("PropertyAnimation", PropertyAnimationBase);
export const NumberAnimation = /* @__PURE__ */ calmed("NumberAnimation", NumberAnimationBase);
export const ColorAnimation = /* @__PURE__ */ calmed("ColorAnimation", ColorAnimationBase);
export const RotationAnimation = /* @__PURE__ */ calmed("RotationAnimation", RotationAnimationBase);
export const SpringAnimation = /* @__PURE__ */ calmed("SpringAnimation", SpringAnimationBase);
export const SmoothedAnimation = /* @__PURE__ */ calmed("SmoothedAnimation", SmoothedAnimationBase);

export const Rectangle = /* @__PURE__ */ face("Rectangle", RectangleBase, { fill: "color" });

// `Text`, with its alignment, wrapping and format called `align`, `wrap`
// and `format`; `elide` keeps its name, and so does `color`, which is the
// glyphs'. Its font is the one font value, whose pixel size is `size`.
export const Text = /* @__PURE__ */ face("Text", TextBase, {
  align: "horizontalAlignment",
  wrap: "wrapMode",
  format: "textFormat",
});

// `MouseArea`, called `PointerArea`: it takes a pen and a finger as it
// takes a mouse, and the old name says only the one.
export const PointerArea = /* @__PURE__ */ face("PointerArea", MouseArea);

// `Loader`, with `sourceComponent` called `component`: what it shows is
// a component. A file named by a string, `source`, stays.
export const Loader = /* @__PURE__ */ face("Loader", LoaderBase, { component: "sourceComponent" });

// `Font.of({ family, size })` is Qt's `Qt.font`, and `Font.families()` its
// `Qt.fontFamilies()`, beside the enums of the font value (`Font.Bold`).
// A page is told only of the families it has loaded itself: the browser
// does not list what is installed.
export const Font = /* @__PURE__ */ Object.freeze({
  ...FontEnums,
  of: (given) => font(given, "Font.of()"),
  families: () => [...new Set([...(document.fonts ?? [])].map((face) => face.family.replace(/^["']|["']$/g, "")))].sort(),
});

// Each of these is a module of its own, so a page whose files name none
// of them loads none of the runtime types they face: a bundler keeps a
// module whole in one chunk, and one that has them all puts the views'
// and the pointer handlers' code in the chunk every page loads.
export { Drag, Hover, Tap, Wheel } from "./gestures.js";
export { GridView, ListView } from "./views.js";
export { DragSource } from "./drag-source.js";

export * from "./enums.js";

// The types Ljós's API keeps as they are: what a file names by them is
// what `QtQuick` has (`QtQuick.Effects`' for the two effects). What
// arranges children is `Ljos.Layout`'s.
export {
  Accessible,
  Animation,
  Behavior,
  Canvas,
  ConicalGradient,
  DoubleValidator,
  DropArea,
  Easing,
  Flickable,
  FontMetrics,
  FrameAnimation,
  Gradient,
  GradientStop,
  Image,
  IntValidator,
  Item,
  KeyNavigation,
  Keys,
  LayoutMirroring,
  LinearGradient,
  MultiEffect,
  ParallelAnimation,
  Path,
  PathAngleArc,
  PathArc,
  PathAttribute,
  PathCubic,
  PathCurve,
  PathLine,
  PathMove,
  PathMultiline,
  PathPercent,
  PathPolyline,
  PathQuad,
  PathRectangle,
  PathSvg,
  PathView,
  PauseAnimation,
  PointerDevice,
  PropertyAction,
  PropertyChanges,
  RadialGradient,
  RectangularShadow,
  RegularExpressionValidator,
  Repeater,
  Rotation,
  Scale,
  Screen,
  ScriptAction,
  SequentialAnimation,
  Shape,
  ShapeGradient,
  ShapePath,
  Shortcut,
  State,
  TextEdit,
  TextInput,
  TextMetrics,
  Transition,
  Translate,
  Window,
};

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
// for `pixelSize` on every font (`QtQuick/font.js`), as natively.
import { defineType, derived, QtObject, slot } from "../../object.ts";
import { destroying, hostOf, live } from "../Core/controller.js";
import { Accessible } from "../../QtQuick/Accessible.js";
import { Animation, ParallelAnimation, PauseAnimation, ScriptAction, SequentialAnimation } from "../../QtQuick/animation/Animation.js";
import { Behavior } from "../../QtQuick/animation/Behavior.js";
import { Easing } from "../../QtQuick/animation/easing.js";
import {
  ColorAnimation,
  NumberAnimation,
  PropertyAction,
  PropertyAnimation,
  RotationAnimation,
  SmoothedAnimation,
  SpringAnimation,
} from "../../QtQuick/animation/PropertyAnimation.js";
import { Drag as DragAttachedSource, DropArea } from "../../QtQuick/Drag.js";
import { Flickable } from "../../QtQuick/Flickable.js";
import { font } from "../../QtQml/application.ts";
import { Font as FontEnums } from "../../QtQuick/font.js";
import { DragHandler, HoverHandler, PointerDevice, TapHandler, WheelHandler } from "../../QtQuick/handlers.js";
import { Image } from "../../QtQuick/Image.js";
import { Item } from "../../QtQuick/Item.js";
import { Keys, Shortcut } from "../../QtQuick/Keys.js";
import { ListView as ListViewBase } from "../../QtQuick/ListView.js";
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
import { Gradient, GradientStop, Rectangle as RectangleBase } from "../../QtQuick/Rectangle.js";
import { Repeater } from "../../QtQuick/Repeater.js";
import { ConicalGradient, LinearGradient, RadialGradient, ShapeGradient } from "../../QtQuick/Shapes/gradients.js";
import { Shape, ShapePath } from "../../QtQuick/Shapes/Shape.js";
import { PropertyChanges, State, Transition } from "../../QtQuick/states.js";
import { Text as TextBase } from "../../QtQuick/Text.js";
import { TextEdit, TextInput } from "../../QtQuick/TextInput.js";
import { FontMetrics, TextMetrics } from "../../QtQuick/TextMetrics.js";
import { DoubleValidator, IntValidator, RegularExpressionValidator } from "../../QtQuick/validators.js";
import { Screen, Window } from "../../QtQuick/Window.js";

// Puts what `props` says by a dialect name under the name the type has,
// handler included, keeping the binding (the descriptor) as it is. Runs
// in the face's `setup`, before anything has read a property of the
// object, so the slot the value belongs to takes it under its own name.
function renamed(props, renames) {
  for (const [dialect, own] of Object.entries(renames)) {
    for (const [from, to] of [
      [dialect, own],
      [`on${dialect[0].toUpperCase()}${dialect.slice(1)}Changed`, `on${own[0].toUpperCase()}${own.slice(1)}Changed`],
    ]) {
      const descriptor = Object.getOwnPropertyDescriptor(props, from);
      if (!descriptor || Object.hasOwn(props, to)) continue;
      Object.defineProperty(props, to, descriptor);
      delete props[from];
    }
  }
}

// A face of `Base`, called `name`, with `renames` (Ljós's name: the
// type's) as its only difference. On its objects each of Ljós's names is
// the slot of the name it replaces, to read, to write, to hear of and to
// animate (`slot(item, "fill")` is `slot(item, "color")`).
function face(name, Base, renames = {}) {
  const Type = defineType(name, Base, {
    setup(self, props) {
      renamed(props, renames);
    },
  });
  for (const [dialect, own] of Object.entries(renames)) {
    if (!(own in Base.slots)) continue;
    Type.slots[dialect] = (self) => (self.$slots[dialect] = slot(self, own));
    Object.defineProperty(Type.proto, dialect, {
      get() {
        return this[own];
      },
      set(value) {
        this[own] = value;
      },
      enumerable: true,
      configurable: true,
    });
    const changed = `${dialect}Changed`;
    if (!Object.hasOwn(Type.proto, changed)) {
      Object.defineProperty(Type.proto, changed, {
        get() {
          return this[`${own}Changed`];
        },
        configurable: true,
      });
    }
  }
  if (Base.attached) Type.attached = Base.attached;
  return Type;
}

// What a pointer handler accepts is what a gesture takes: the buttons,
// modifiers, devices and kinds of pointer it answers.
const GESTURE = {
  buttons: "acceptedButtons",
  modifiers: "acceptedModifiers",
  devices: "acceptedDevices",
  pointerTypes: "acceptedPointerTypes",
};
//
// A gesture is a Controller: its `host` is the item it acts on, and it is
// `attached(host)` and `detached()` as one is. It stays the handler it
// faces, so it listens on the host's element as that handler does.
function gesture(name, Base) {
  const Face = face(
    name,
    Base,
    Object.fromEntries(Object.entries(GESTURE).filter(([, own]) => own in Base.slots)),
  );
  const Type = defineType(name, Face, {
    properties: { host: derived((self) => hostOf(self)) },
    signals: ["attached", "detached", "updated"],
    methods: { destroy: destroying(Face) },
    setup(self) {
      Object.defineProperty(self, "$gesture", { value: true });
      live(self);
    },
  });
  if (Face.attached) Type.attached = Face.attached;
  return Type;
}

// `Rectangle`, with `color` called `fill`: what is inside the outline,
// beside the `border` around it, where a `color` of `Text` is the glyphs'.
export const Rectangle = face("Rectangle", RectangleBase, { fill: "color" });

// `Text`, with its alignment, wrapping and format called `align`, `wrap`
// and `format`; `elide` keeps its name, and so does `color`, which is the
// glyphs'. Its font is the one font value, whose pixel size is `size`.
export const Text = face("Text", TextBase, {
  align: "horizontalAlignment",
  wrap: "wrapMode",
  format: "textFormat",
});

// `MouseArea`, called `PointerArea`: it takes a pen and a finger as it
// takes a mouse, and the old name says only the one.
export const PointerArea = face("PointerArea", MouseArea);

// `TapHandler`, called `Tap`: a gesture is a child of the item it acts
// on, and says what it recognises. The others likewise.
export const Tap = gesture("Tap", TapHandler);
export const Hover = gesture("Hover", HoverHandler);
export const Drag = gesture("Drag", DragHandler);
export const Wheel = gesture("Wheel", WheelHandler);
// Not here: `Pointer`, the face of Qt's PointHandler, which the runtime
// does not have in `QtQuick` either. A dialect file that names it says
// so at load, by the import it cannot make.

// `Loader`, with `sourceComponent` called `component`: what it shows is
// a component. A file named by a string, `source`, stays.
export const Loader = face("Loader", LoaderBase, { component: "sourceComponent" });

// `ListView` as it is. What natively calls its passages `enter` and
// `exit` (Qt's `add` and `remove` transitions) the runtime's views do
// not have in either name, so there is nothing here to rename.
export const ListView = face("ListView", ListViewBase);

// Qt's attached `Drag`, called `DragSource`: what carries data to a
// `DropArea`, where `Drag` above is the gesture that moves an item. It
// is the one attached object by both names: what a file says by
// `DragSource.` is put under `Drag.` before the object is made.
export const DragSource = defineType("DragSource", QtObject, { enums: DragAttachedSource.enums });
DragSource.attached = (self) => {
  const props = self?.$props;
  if (props) {
    for (const key of Object.keys(props)) {
      if (!key.startsWith("DragSource$")) continue;
      const own = `Drag$${key.slice("DragSource$".length)}`;
      if (!Object.hasOwn(props, own)) Object.defineProperty(props, own, Object.getOwnPropertyDescriptor(props, key));
      delete props[key];
    }
    if (props.$attach) props.$attach = props.$attach.map((type) => (type === DragSource ? DragAttachedSource : type));
  }
  return DragAttachedSource.attached(self);
};

// `Font.of({ family, size })` is Qt's `Qt.font`, and `Font.families()` its
// `Qt.fontFamilies()`, beside the enums of the font value (`Font.Bold`).
// A page is told only of the families it has loaded itself: the browser
// does not list what is installed.
export const Font = Object.freeze({
  ...FontEnums,
  of: (given) => font(given, "Font.of()"),
  families: () => [...new Set([...(document.fonts ?? [])].map((face) => face.family.replace(/^["']|["']$/g, "")))].sort(),
});

export * from "./enums.js";

// The types Ljós's API keeps as they are: what a file names by them is
// what `QtQuick` has. What arranges children is `Ljos.Layout`'s.
export {
  Accessible,
  Animation,
  Behavior,
  ColorAnimation,
  ConicalGradient,
  DoubleValidator,
  DropArea,
  Easing,
  Flickable,
  FontMetrics,
  Gradient,
  GradientStop,
  Image,
  IntValidator,
  Item,
  Keys,
  LinearGradient,
  NumberAnimation,
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
  PauseAnimation,
  PointerDevice,
  PropertyAction,
  PropertyAnimation,
  PropertyChanges,
  RadialGradient,
  RegularExpressionValidator,
  Repeater,
  RotationAnimation,
  Screen,
  ScriptAction,
  SequentialAnimation,
  Shape,
  ShapeGradient,
  ShapePath,
  Shortcut,
  SmoothedAnimation,
  SpringAnimation,
  State,
  TextEdit,
  TextInput,
  TextMetrics,
  Transition,
  Window,
};

// MultiEffect on sources that are shown and on ones that are not. What the
// test compares the colours with is what Qt 6 paints for the same.
//
// component Strips: Item { width: 30; height: 20; visible: false
//     Rectangle { width: 10; height: 20; color: "#336699" }
//     Rectangle { x: 10; width: 10; height: 20; color: "#ff8000" }
//     Rectangle { x: 20; width: 10; height: 20; color: "#202020" } }
// component Block: Rectangle { width: 40; height: 40; visible: false }
//
// Item {
//     id: root; width: 400; height: 300
//     property Item which: first
//     property bool on: true
//
//     Strips { id: s0 } MultiEffect { id: brighter; source: s0; x: 10; y: 10; width: 30; height: 20; brightness: 0.3 }
//     Strips { id: s1 } MultiEffect { id: contrasty; source: s1; x: 50; y: 10; width: 30; height: 20; contrast: 0.5 }
//     Strips { id: s2 } MultiEffect { id: grey; source: s2; x: 90; y: 10; width: 30; height: 20; saturation: -1 }
//     Strips { id: s3 } MultiEffect { id: vivid; source: s3; x: 130; y: 10; width: 30; height: 20; saturation: 1 }
//     Strips { id: s4 } MultiEffect { id: tinted; source: s4; x: 170; y: 10; width: 30; height: 20
//                                     colorization: 1; colorizationColor: "#00a0ff" }
//     Strips { id: s5 } MultiEffect { id: halfTinted; source: s5; x: 210; y: 10; width: 30; height: 20
//                                     colorization: 0.5; colorizationColor: "#8000ff00" }
//     Strips { id: s6 } MultiEffect { id: mixed; source: s6; x: 250; y: 10; width: 30; height: 20; brightness: 0.2
//                                     contrast: -0.3; saturation: 0.5; colorization: 0.6; colorizationColor: "blue" }
//     Strips { id: s7 } MultiEffect { id: plain; source: s7; x: 290; y: 10; width: 30; height: 20 }
//
//     Rectangle { id: card; x: 20; y: 60; width: 60; height: 40; radius: 6; color: "white" }
//     MultiEffect { id: cardShadow; source: card; anchors.fill: card; visible: root.on
//                   shadowEnabled: true; shadowColor: "black"; shadowOpacity: 0.5 }
//     Rectangle { id: icon; x: 110; y: 60; width: 40; height: 40; color: "white" }
//     MultiEffect { id: iconTint; source: icon; anchors.fill: icon; colorization: 1; colorizationColor: "#2CDE85" }
//     Rectangle { id: seen; x: 170; y: 60; width: 40; height: 40; color: "#336699" }
//     MultiEffect { id: half; source: seen; anchors.fill: seen; opacity: 0.5; colorization: 1; colorizationColor: "red" }
//     Rectangle { id: button; x: 230; y: 60; width: 40; height: 40; color: "#336699" }
//     MultiEffect { id: pressed; source: button; anchors.fill: button; opacity: 0.5
//                   shadowEnabled: true; blurEnabled: true; blur: 0.5 }
//
//     Strips { id: far
//         Rectangle { id: unseen; width: 10; height: 10; color: "red"; visible: false }
//         Rectangle { id: outside; x: 30; width: 10; height: 10; color: "red" } }
//     MultiEffect { id: moved; source: far; x: 20; y: 130; width: 60; height: 40 }
//     Block { id: dark; color: "black" }
//     MultiEffect { id: dim; source: dark; x: 120; y: 130; width: 40; height: 40; opacity: 0.5 }
//     Item { id: holder; x: 200; y: 120
//         Strips { id: inner; x: 10; y: 10 } }
//     MultiEffect { id: nested; source: inner; x: 300; y: 130; width: 30; height: 20 }
//     Block { id: first; color: "red" }
//     Block { id: second; color: "blue" }
//     MultiEffect { id: swap; source: root.which; x: 350; y: 130; width: 40; height: 40 }
//
//     Block { id: black; x: 30; y: 200; color: "black" }
//     MultiEffect { id: soft; source: black; anchors.fill: black; blurEnabled: true; blur: 1 }
//     Block { id: white; x: 110; y: 200; color: "white" }
//     MultiEffect { id: cast; source: white; anchors.fill: white; shadowEnabled: true; shadowBlur: 0
//                   shadowColor: "red"; shadowOpacity: 0.5; shadowHorizontalOffset: 10; shadowVerticalOffset: 5 }
//     Block { id: blue; x: 190; y: 200; color: "#336699" }
//     MultiEffect { id: both; source: blue; anchors.fill: blue; blurEnabled: true; blur: 0.5; shadowEnabled: true }
//     Block { id: black2; x: 270; y: 200; color: "black" }
//     MultiEffect { id: tight; source: black2; anchors.fill: black2; blurEnabled: true; blur: 1
//                   autoPaddingEnabled: false }
//     Block { id: black3; x: 340; y: 200; color: "black" }
//     MultiEffect { id: roomy; source: black3; anchors.fill: black3; blurEnabled: true; blur: 1
//                   autoPaddingEnabled: false; paddingRect: Qt.rect(20, 0, 0, 20) }
//     MultiEffect { id: none; x: 30; y: 40 }
// }
import { $object, $signal } from "ljos-web/object";
import { Qt } from "ljos-web/QtQml";
import { Item, Rectangle } from "ljos-web/QtQuick";
import { MultiEffect } from "ljos-web/QtQuick/Effects";
import { make } from "../scene.js";

export const objects = { MultiEffect };

const named = (name) => (objects[name] = $object());

const strips = (name, props = {}, more) =>
  make(Item, { $self: named(name), width: 30, height: 20, visible: false, ...props }, () => [
    make(Rectangle, { width: 10, height: 20, color: "#336699" }),
    make(Rectangle, { x: 10, width: 10, height: 20, color: "#ff8000" }),
    make(Rectangle, { x: 20, width: 10, height: 20, color: "#202020" }),
    ...(more ? more() : []),
  ]);

const block = (name, props) => make(Rectangle, { $self: named(name), width: 40, height: 40, visible: false, ...props });

// The props as they are, a binding still a binding.
const multi = (name, props) =>
  make(MultiEffect, Object.defineProperties({ $self: named(name) }, Object.getOwnPropertyDescriptors(props)));

export default function Effects() {
  const [which, setWhich] = $signal(null);
  const [on, setOn] = $signal(true);
  Object.assign(objects, { setWhich, setOn });
  const o = objects;
  const small = { y: 10, width: 30, height: 20 };
  const scene = make(Item, { $self: named("root"), width: 400, height: 300 }, () => [
    strips("s0"),
    multi("brighter", { source: o.s0, x: 10, ...small, brightness: 0.3 }),
    strips("s1"),
    multi("contrasty", { source: o.s1, x: 50, ...small, contrast: 0.5 }),
    strips("s2"),
    multi("grey", { source: o.s2, x: 90, ...small, saturation: -1 }),
    strips("s3"),
    multi("vivid", { source: o.s3, x: 130, ...small, saturation: 1 }),
    strips("s4"),
    multi("tinted", { source: o.s4, x: 170, ...small, colorization: 1, colorizationColor: "#00a0ff" }),
    strips("s5"),
    multi("halfTinted", { source: o.s5, x: 210, ...small, colorization: 0.5, colorizationColor: "#8000ff00" }),
    strips("s6"),
    multi("mixed", {
      source: o.s6,
      x: 250,
      ...small,
      brightness: 0.2,
      contrast: -0.3,
      saturation: 0.5,
      colorization: 0.6,
      colorizationColor: "blue",
    }),
    strips("s7"),
    multi("plain", { source: o.s7, x: 290, ...small }),

    make(Rectangle, { $self: named("card"), x: 20, y: 60, width: 60, height: 40, radius: 6, color: "white" }),
    multi("cardShadow", {
      source: o.card,
      anchors$fill: o.card,
      get visible() {
        return on();
      },
      shadowEnabled: true,
      shadowColor: "black",
      shadowOpacity: 0.5,
    }),
    make(Rectangle, { $self: named("icon"), x: 110, y: 60, width: 40, height: 40, color: "white" }),
    multi("iconTint", { source: o.icon, anchors$fill: o.icon, colorization: 1, colorizationColor: "#2CDE85" }),
    make(Rectangle, { $self: named("seen"), x: 170, y: 60, width: 40, height: 40, color: "#336699" }),
    multi("half", { source: o.seen, anchors$fill: o.seen, opacity: 0.5, colorization: 1, colorizationColor: "red" }),
    make(Rectangle, { $self: named("button"), x: 230, y: 60, width: 40, height: 40, color: "#336699" }),
    multi("pressed", {
      source: o.button,
      anchors$fill: o.button,
      opacity: 0.5,
      shadowEnabled: true,
      blurEnabled: true,
      blur: 0.5,
    }),

    strips("far", {}, () => [
      make(Rectangle, { $self: named("unseen"), width: 10, height: 10, color: "red", visible: false }),
      make(Rectangle, { $self: named("outside"), x: 30, width: 10, height: 10, color: "red" }),
    ]),
    multi("moved", { source: o.far, x: 20, y: 130, width: 60, height: 40 }),
    block("dark", { color: "black" }),
    multi("dim", { source: o.dark, x: 120, y: 130, width: 40, height: 40, opacity: 0.5 }),
    make(Item, { $self: named("holder"), x: 200, y: 120 }, () => strips("inner", { x: 10, y: 10 })),
    multi("nested", { source: o.inner, x: 300, y: 130, width: 30, height: 20 }),
    block("first", { color: "red" }),
    block("second", { color: "blue" }),
    multi("swap", {
      get source() {
        return which() ?? o.first;
      },
      x: 350,
      y: 130,
      width: 40,
      height: 40,
    }),

    block("black", { x: 30, y: 200, color: "black" }),
    multi("soft", { source: o.black, anchors$fill: o.black, blurEnabled: true, blur: 1 }),
    block("white", { x: 110, y: 200, color: "white" }),
    multi("cast", {
      source: o.white,
      anchors$fill: o.white,
      shadowEnabled: true,
      shadowBlur: 0,
      shadowColor: "red",
      shadowOpacity: 0.5,
      shadowHorizontalOffset: 10,
      shadowVerticalOffset: 5,
    }),
    block("blue", { x: 190, y: 200, color: "#336699" }),
    multi("both", { source: o.blue, anchors$fill: o.blue, blurEnabled: true, blur: 0.5, shadowEnabled: true }),
    block("black2", { x: 270, y: 200, color: "black" }),
    multi("tight", { source: o.black2, anchors$fill: o.black2, blurEnabled: true, blur: 1, autoPaddingEnabled: false }),
    block("black3", { x: 340, y: 200, color: "black" }),
    multi("roomy", {
      source: o.black3,
      anchors$fill: o.black3,
      blurEnabled: true,
      blur: 1,
      autoPaddingEnabled: false,
      get paddingRect() {
        return Qt.rect(20, 0, 0, 20);
      },
    }),
    multi("none", { x: 30, y: 40 }),
  ]);
  return scene;
}

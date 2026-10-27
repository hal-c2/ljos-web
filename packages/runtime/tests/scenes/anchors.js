// Item {
//     id: root; width: 400; height: 300
//     Rectangle { id: fill; anchors.fill: parent; anchors.margins: 10; anchors.leftMargin: 30 }
//     Rectangle { id: centre; width: 100; height: 50; anchors.centerIn: parent }
//     Rectangle { id: after; width: 40; anchors.left: later.right; anchors.top: later.bottom; height: later.height / 2 }
//     Rectangle { id: later; x: 20; y: 30; width: 60; height: 80 }
//     Rectangle { id: between; anchors.left: later.right; anchors.right: parent.right; anchors.rightMargin: 5
//                 anchors.verticalCenter: parent.verticalCenter; height: 20 }
//     Rectangle { id: half; width: parent.width / 2; height: 10; anchors.bottom: parent.bottom }
// }
import { $object } from "ljos-web/object";
import { Item, Rectangle } from "ljos-web/QtQuick";
import { make } from "../scene.js";

const names = ["root", "fill", "centre", "after", "later", "between", "half"];
export const objects = {};

export default function Anchors() {
  for (const name of names) objects[name] = $object();
  const { root, fill, centre, after, later, between, half } = objects;
  return make(Item, { $self: root, width: 400, height: 300 }, () => [
    make(Rectangle, {
      $self: fill,
      color: "#eee",
      get anchors$fill() {
        return fill.parent;
      },
      anchors$margins: 10,
      anchors$leftMargin: 30,
    }),
    make(Rectangle, {
      $self: centre,
      color: "red",
      width: 100,
      height: 50,
      get anchors$centerIn() {
        return centre.parent;
      },
    }),
    make(Rectangle, {
      $self: after,
      color: "green",
      width: 40,
      get anchors$left() {
        return later.right;
      },
      get anchors$top() {
        return later.bottom;
      },
      get height() {
        return later.height / 2;
      },
    }),
    make(Rectangle, { $self: later, color: "blue", x: 20, y: 30, width: 60, height: 80 }),
    make(Rectangle, {
      $self: between,
      color: "orange",
      height: 20,
      get anchors$left() {
        return later.right;
      },
      get anchors$right() {
        return between.parent.right;
      },
      anchors$rightMargin: 5,
      get anchors$verticalCenter() {
        return between.parent.verticalCenter;
      },
    }),
    make(Rectangle, {
      $self: half,
      color: "purple",
      height: 10,
      get width() {
        return half.parent.width / 2;
      },
      get anchors$bottom() {
        return half.parent.bottom;
      },
    }),
  ]);
}

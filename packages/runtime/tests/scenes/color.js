// Item {
//     width: 400; height: 300
//     Rectangle { id: named; width: 40; height: 40; color: "steelblue" }
//     Rectangle { id: made; x: 50; width: 40; height: 40; color: Qt.rgba(1, 0, 0, 0.5) }
//     Rectangle { id: lit; x: 100; width: 40; height: 40; color: Qt.lighter(named.color) }
//     Rectangle { id: long; x: 150; width: 40; height: 40; color: "#111122223333" }
//     Rectangle { id: clear; x: 200; width: 40; height: 40; color: "transparent"; border.color: "#80ff0000" }
//     Rectangle { id: hsl; x: 250; width: 40; height: 40; color: Qt.hsla(0.6, 0.5, 0.4, 1) }
// }
import { $object } from "ljos-web/object";
import { Qt } from "ljos-web/QtQml";
import { Item, Rectangle } from "ljos-web/QtQuick";
import { mix } from "../../QtQuick/color.js";
import { make } from "../scene.js";

export const objects = { Qt, mix };

export default function Colors() {
  const named = (objects.named = $object());
  const square = (name, x, props) =>
    make(Rectangle, Object.defineProperties({ $self: (objects[name] ??= $object()), x, width: 40, height: 40 }, Object.getOwnPropertyDescriptors(props)));
  return make(Item, { width: 400, height: 300 }, () => [
    square("named", 0, { color: "steelblue" }),
    square("made", 50, {
      get color() {
        return Qt.rgba(1, 0, 0, 0.5);
      },
    }),
    square("lit", 100, {
      get color() {
        return Qt.lighter(named.color);
      },
    }),
    square("long", 150, { color: "#111122223333" }),
    square("clear", 200, { color: "transparent", border$color: "#80ff0000" }),
    square("hsl", 250, {
      get color() {
        return Qt.hsla(0.6, 0.5, 0.4, 1);
      },
    }),
  ]);
}

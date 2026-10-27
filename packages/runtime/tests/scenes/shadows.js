// Item {
//     id: root; width: 400; height: 300
//     RectangularShadow { id: plain; x: 20; y: 20; width: 60; height: 40 }
//     RectangularShadow { id: hard; x: 110; y: 20; width: 60; height: 40; blur: 0; radius: 10
//                         offset: Qt.vector2d(10, 5); color: "#80ff0000" }
//     RectangularShadow { id: wide; x: 210; y: 30; width: 60; height: 40; blur: 0; radius: 10; spread: 10 }
//     RectangularShadow { id: corners; x: 310; y: 20; width: 60; height: 60; blur: 0; radius: 20
//                         topLeftRadius: 0; bottomRightRadius: 5 }
//     RectangularShadow { id: soft; x: 40; y: 150; width: 100; height: 100; blur: 20 }
//     RectangularShadow { id: square; x: 200; y: 150; width: 60; height: 60; blur: 0; spread: 10 }
//     RectangularShadow { id: big; x: 300; y: 150; width: 40; height: 40; blur: 0; radius: 80 }
//     RectangularShadow { id: none }
// }
import { $object } from "ljos-web/object";
import { Qt } from "ljos-web/QtQml";
import { Item } from "ljos-web/QtQuick";
import { RectangularShadow } from "ljos-web/QtQuick/Effects";
import { make } from "../scene.js";

export const objects = { Qt };

export default function Shadows() {
  const shadow = (name, props) => make(RectangularShadow, { $self: (objects[name] = $object()), ...props });
  return make(Item, { $self: (objects.root = $object()), width: 400, height: 300 }, () => [
    shadow("plain", { x: 20, y: 20, width: 60, height: 40 }),
    shadow("hard", {
      x: 110,
      y: 20,
      width: 60,
      height: 40,
      blur: 0,
      radius: 10,
      get offset() {
        return Qt.vector2d(10, 5);
      },
      color: "#80ff0000",
    }),
    shadow("wide", { x: 210, y: 30, width: 60, height: 40, blur: 0, radius: 10, spread: 10 }),
    shadow("corners", {
      x: 310,
      y: 20,
      width: 60,
      height: 60,
      blur: 0,
      radius: 20,
      topLeftRadius: 0,
      bottomRightRadius: 5,
    }),
    shadow("soft", { x: 40, y: 150, width: 100, height: 100, blur: 20 }),
    shadow("square", { x: 200, y: 150, width: 60, height: 60, blur: 0, spread: 10 }),
    shadow("big", { x: 300, y: 150, width: 40, height: 40, blur: 0, radius: 80 }),
    shadow("none", {}),
  ]);
}

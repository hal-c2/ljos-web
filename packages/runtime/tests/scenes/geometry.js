// Item {
//     id: root; width: 400; height: 300
//     Rectangle {
//         id: geo; x: 20; y: 30; width: 100; height: 50; rotation: 90; scale: 2; color: "#40008000"
//         Rectangle {
//             id: geoChild; x: 10; y: 5; width: 20; height: 10; transformOrigin: Item.TopLeft; rotation: 45
//             transform: [Scale { xScale: 2; origin.x: 5 }, Translate { x: 3; y: 4 }]
//             color: "navy"
//         }
//     }
//     Rectangle { id: other; x: 200; y: 150; width: 40; height: 40; scale: 0.5; color: "maroon" }
//     Rectangle { id: hidden; x: 300; y: 200; width: 40; height: 40; visible: false }
// }
import { $object } from "ljos-web/object";
import { Item, Rectangle, Scale, Translate } from "ljos-web/QtQuick";
import { make } from "../scene.js";

const names = ["root", "geo", "geoChild", "other", "hidden"];
export const objects = {};

export default function Geometry() {
  for (const name of names) objects[name] = $object();
  const { root, geo, geoChild, other, hidden } = objects;
  return make(Item, { $self: root, width: 400, height: 300 }, () => [
    make(
      Rectangle,
      { $self: geo, x: 20, y: 30, width: 100, height: 50, rotation: 90, scale: 2, color: "#40008000" },
      () => [
        make(Rectangle, {
          $self: geoChild,
          x: 10,
          y: 5,
          width: 20,
          height: 10,
          get transformOrigin() {
            return Item.TopLeft;
          },
          rotation: 45,
          get transform() {
            return [make(Scale, { xScale: 2, origin$x: 5 }), make(Translate, { x: 3, y: 4 })];
          },
          color: "navy",
        }),
      ],
    ),
    make(Rectangle, { $self: other, x: 200, y: 150, width: 40, height: 40, scale: 0.5, color: "maroon" }),
    make(Rectangle, { $self: hidden, x: 300, y: 200, width: 40, height: 40, visible: false }),
  ]);
}

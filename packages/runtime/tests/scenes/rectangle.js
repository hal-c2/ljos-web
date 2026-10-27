// Item {
//     width: 400; height: 300
//     Rectangle { id: plain; width: 50; height: 40 }
//     Rectangle { id: round; x: 60; width: 50; height: 40; color: "#80ff0000"; radius: 8
//                 border.width: 3; border.color: "navy"; opacity: 0.5; z: 2 }
//     Rectangle { id: hidden; visible: false; Rectangle { id: inside; width: 10; height: 10 } }
//     Rectangle { id: turned; x: 200; y: 100; width: 100; height: 20; rotation: 90; clip: true }
//     Rectangle { id: spun; x: 100; y: 200; width: 40; height: 40
//                 transform: Rotation { origin.x: 0; origin.y: 0; angle: 90 } }
//     Rectangle { id: shaded; y: 60; width: 50; height: 40
//                 gradient: Gradient { GradientStop { position: 0; color: "red" } GradientStop { position: 1; color: "blue" } } }
// }
import { $object } from "ljos-web/object";
import { Gradient, GradientStop, Item, Rectangle, Rotation } from "ljos-web/QtQuick";
import { make } from "../scene.js";

const names = ["root", "plain", "round", "hidden", "inside", "turned", "spun", "shaded"];
export const objects = {};

export default function Rectangles() {
  for (const name of names) objects[name] = $object();
  const { root, plain, round, hidden, inside, turned, spun, shaded } = objects;
  return make(Item, { $self: root, width: 400, height: 300 }, () => [
    make(Rectangle, { $self: plain, width: 50, height: 40 }),
    make(Rectangle, {
      $self: round,
      x: 60,
      width: 50,
      height: 40,
      color: "#80ff0000",
      radius: 8,
      border$width: 3,
      border$color: "navy",
      opacity: 0.5,
      z: 2,
    }),
    make(Rectangle, { $self: hidden, visible: false }, () => make(Rectangle, { $self: inside, width: 10, height: 10 })),
    make(Rectangle, { $self: turned, x: 200, y: 100, width: 100, height: 20, rotation: 90, clip: true }),
    make(Rectangle, {
      $self: spun,
      x: 100,
      y: 200,
      width: 40,
      height: 40,
      get transform() {
        return make(Rotation, { origin$x: 0, origin$y: 0, angle: 90 });
      },
    }),
    make(Rectangle, {
      $self: shaded,
      y: 60,
      width: 50,
      height: 40,
      get gradient() {
        return make(Gradient, {}, () => [
          make(GradientStop, { position: 0, color: "red" }),
          make(GradientStop, { position: 1, color: "blue" }),
        ]);
      },
    }),
  ]);
}

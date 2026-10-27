// Item {
//     id: root; width: 400; height: 300
//     property int where: 0
//     Rectangle {
//         id: box; x: root.where; width: 50; height: 50; color: "red"
//         Behavior on x {
//             id: follow
//             NumberAnimation { id: glide; duration: 100; onRunningChanged: log.push("glide " + running + " " + box.x) }
//         }
//         Behavior on color { ColorAnimation { duration: 100 } }
//     }
//     Rectangle { id: tail; x: box.x + 10; y: 60; width: 10; height: 10 }
//     Rectangle {
//         id: sprung; x: 200; width: 10; height: 10
//         Behavior on y { SpringAnimation { id: spring; spring: 2; damping: 0.2 } }
//     }
//     Rectangle {
//         id: eased; y: 200; width: 10; height: 10
//         Behavior on x { SmoothedAnimation { id: smooth; velocity: 100 } }
//     }
// }
import { $define, $object, $signal } from "ljos-web/object";
import {
  Behavior,
  clock,
  ColorAnimation,
  Item,
  NumberAnimation,
  Rectangle,
  SmoothedAnimation,
  SpringAnimation,
} from "ljos-web/QtQuick";
import { make } from "../scene.js";

const names = ["root", "box", "follow", "glide", "tail", "sprung", "spring", "eased", "smooth"];
export const objects = { log: [], clock };

export default function Behaviors() {
  clock.stop();
  for (const name of names) objects[name] = $object();
  const { log, root, box, follow, glide, tail, sprung, spring, eased, smooth } = objects;
  const [where, setWhere] = $signal(0);
  const made = make(Item, { $self: root, width: 400, height: 300 }, () => [
    make(
      Rectangle,
      {
        $self: box,
        get x() {
          return where();
        },
        width: 50,
        height: 50,
        color: "red",
      },
      () => [
        make(Behavior, { $self: follow, $target: box, $property: "x" }, () =>
          make(NumberAnimation, {
            $self: glide,
            duration: 100,
            onRunningChanged: () => log.push(`glide ${glide.running} ${box.x}`),
          }),
        ),
        make(Behavior, { $target: box, $property: "color" }, () => make(ColorAnimation, { duration: 100 })),
      ],
    ),
    make(Rectangle, {
      $self: tail,
      get x() {
        return box.x + 10;
      },
      y: 60,
      width: 10,
      height: 10,
    }),
    make(Rectangle, { $self: sprung, x: 200, width: 10, height: 10 }, () =>
      make(Behavior, { $target: sprung, $property: "y" }, () =>
        make(SpringAnimation, { $self: spring, spring: 2, damping: 0.2 }),
      ),
    ),
    make(Rectangle, { $self: eased, y: 200, width: 10, height: 10 }, () =>
      make(Behavior, { $target: eased, $property: "x" }, () => make(SmoothedAnimation, { $self: smooth, velocity: 100 })),
    ),
  ]);
  return $define(made, { where: [where, setWhere] });
}

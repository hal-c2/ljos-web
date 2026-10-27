// Item {
//     id: root; width: 400; height: 300
//     Rectangle {
//         id: box; width: 50; height: 50; color: "red"
//         Behavior on x { NumberAnimation { id: slide; duration: 200 } }
//         Behavior on y { NumberAnimation { id: drop; duration: 200 } }
//     }
//     states: [
//         State { name: "plain"; PropertyChanges { target: box; x: 100 } },
//         State { name: "taken"; PropertyChanges { target: box; x: 200; y: 100 } }
//     ]
//     transitions: Transition { id: via; to: "taken"; NumberAnimation { property: "x"; duration: 100 } }
// }
import { $object } from "ljos-web/object";
import {
  Behavior,
  clock,
  Item,
  NumberAnimation,
  PropertyChanges,
  Rectangle,
  State,
  Transition,
} from "ljos-web/QtQuick";
import { make } from "../scene.js";

const names = ["root", "box", "slide", "drop", "via"];
export const objects = { clock };

export default function StateBehavior() {
  clock.stop();
  for (const name of names) objects[name] = $object();
  const { root, box, slide, drop, via } = objects;
  const onBox = (changes) => ({
    get target() {
      return box;
    },
    $changes: changes,
  });
  return make(
    Item,
    {
      $self: root,
      width: 400,
      height: 300,
      get states() {
        return [
          make(State, { name: "plain" }, () => make(PropertyChanges, onBox([["x", () => 100]]))),
          make(State, { name: "taken" }, () =>
            make(
              PropertyChanges,
              onBox([
                ["x", () => 200],
                ["y", () => 100],
              ]),
            ),
          ),
        ];
      },
      get transitions() {
        return make(Transition, { $self: via, to: "taken" }, () =>
          make(NumberAnimation, { property: "x", duration: 100 }),
        );
      },
    },
    () =>
      make(Rectangle, { $self: box, width: 50, height: 50, color: "red" }, () => [
        make(Behavior, { $target: box, $property: "x" }, () =>
          make(NumberAnimation, { $self: slide, duration: 200 }),
        ),
        make(Behavior, { $target: box, $property: "y" }, () => make(NumberAnimation, { $self: drop, duration: 200 })),
      ]),
  );
}

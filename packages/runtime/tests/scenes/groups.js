// Item {
//     id: root; width: 400; height: 300
//     Rectangle { id: box; width: 50; height: 50; color: "red" }
//     SequentialAnimation {
//         id: sequence; loops: 2
//         onFinished: log.push("sequence finished " + box.width + " " + box.height)
//         NumberAnimation { target: box; property: "width"; to: 100; duration: 50 }
//         ScriptAction { script: log.push("script " + box.width) }
//         PauseAnimation { duration: 50 }
//         PropertyAction { target: box; property: "height"; value: 77 }
//         NumberAnimation { target: box; property: "width"; to: 50; duration: 50 }
//     }
//     ParallelAnimation {
//         id: together
//         NumberAnimation { target: box; property: "x"; to: 100; duration: 100 }
//         NumberAnimation { target: box; property: "y"; to: 50; duration: 200 }
//         SequentialAnimation {
//             PauseAnimation { duration: 100 }
//             ColorAnimation { target: box; property: "color"; to: "blue"; duration: 100 }
//         }
//     }
//     Rectangle {
//         id: other; y: 100; width: 20; height: 20; border.width: 2
//         SequentialAnimation on x {
//             id: bounce; running: false; loops: Animation.Infinite
//             NumberAnimation { to: 100; duration: 100 }
//             NumberAnimation { to: 0; duration: 100 }
//         }
//     }
//     RotationAnimation { id: turn; target: other; from: 350; to: 10; duration: 100; direction: RotationAnimation.Shortest }
//     NumberAnimation { id: thicken; target: other; property: "border.width"; to: 6; duration: 100 }
//     PropertyAnimation { id: jump; target: other; property: "visible"; to: false; duration: 100 }
// }
import { $object } from "ljos-web/object";
import {
  Animation,
  clock,
  ColorAnimation,
  Item,
  NumberAnimation,
  ParallelAnimation,
  PauseAnimation,
  PropertyAction,
  PropertyAnimation,
  Rectangle,
  RotationAnimation,
  ScriptAction,
  SequentialAnimation,
} from "ljos-web/QtQuick";
import { make } from "../scene.js";

const names = ["root", "box", "sequence", "together", "other", "bounce", "turn", "thicken", "jump"];
export const objects = { log: [], clock };

export default function Groups() {
  clock.stop();
  for (const name of names) objects[name] = $object();
  const { log, root, box, sequence, together, other, bounce, turn, thicken, jump } = objects;
  const onBox = (props) =>
    Object.defineProperty(props, "target", { get: () => box, enumerable: true, configurable: true });
  const onOther = (props) =>
    Object.defineProperty(props, "target", { get: () => other, enumerable: true, configurable: true });
  return make(Item, { $self: root, width: 400, height: 300 }, () => [
    make(Rectangle, { $self: box, width: 50, height: 50, color: "red" }),
    make(
      SequentialAnimation,
      {
        $self: sequence,
        loops: 2,
        onFinished: () => log.push(`sequence finished ${box.width} ${box.height}`),
      },
      () => [
        make(NumberAnimation, onBox({ property: "width", to: 100, duration: 50 })),
        make(ScriptAction, { script: () => log.push(`script ${box.width}`) }),
        make(PauseAnimation, { duration: 50 }),
        make(PropertyAction, onBox({ property: "height", value: 77 })),
        make(NumberAnimation, onBox({ property: "width", to: 50, duration: 50 })),
      ],
    ),
    make(ParallelAnimation, { $self: together }, () => [
      make(NumberAnimation, onBox({ property: "x", to: 100, duration: 100 })),
      make(NumberAnimation, onBox({ property: "y", to: 50, duration: 200 })),
      make(SequentialAnimation, {}, () => [
        make(PauseAnimation, { duration: 100 }),
        make(ColorAnimation, onBox({ property: "color", to: "blue", duration: 100 })),
      ]),
    ]),
    make(Rectangle, { $self: other, y: 100, width: 20, height: 20, border$width: 2 }, () => [
      make(
        SequentialAnimation,
        { $self: bounce, $target: other, $property: "x", running: false, loops: Animation.Infinite },
        () => [
          make(NumberAnimation, { to: 100, duration: 100 }),
          make(NumberAnimation, { to: 0, duration: 100 }),
        ],
      ),
    ]),
    make(
      RotationAnimation,
      onOther({ $self: turn, from: 350, to: 10, duration: 100, direction: RotationAnimation.Shortest }),
    ),
    make(NumberAnimation, onOther({ $self: thicken, property: "border.width", to: 6, duration: 100 })),
    make(PropertyAnimation, onOther({ $self: jump, property: "visible", to: false, duration: 100 })),
  ]);
}

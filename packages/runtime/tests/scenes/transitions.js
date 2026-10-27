// Item {
//     id: root; width: 400; height: 300
//     property real unit: 10
//     Rectangle { id: box; width: 50; height: 50; color: "red"; opacity: root.unit / 10 }
//     states: [
//         State {
//             name: "a"
//             PropertyChanges { target: box; x: 100; width: root.unit * 8 }
//             onCompleted: log.push("completed a " + box.x)
//         },
//         State {
//             name: "b"; extend: "a"
//             PropertyChanges { target: box; y: 60; x: 200 }
//             PropertyChanges { target: box; explicit: true; height: root.unit * 7 }
//             onCompleted: log.push("completed b " + box.x + " " + box.y)
//         },
//         State {
//             name: "c"
//             PropertyChanges { target: box; restoreEntryValues: false; opacity: 0.5 }
//             PropertyChanges { box.rotation: root.unit }
//         }
//     ]
//     transitions: [
//         Transition {
//             id: ab; from: ""; to: "a"; reversible: true
//             onRunningChanged: log.push("ab " + running)
//             SequentialAnimation {
//                 NumberAnimation { property: "x"; duration: 100 }
//                 NumberAnimation { property: "width"; duration: 100 }
//             }
//         },
//         Transition {
//             id: any
//             onRunningChanged: log.push("any " + running)
//             NumberAnimation { properties: "x,y"; duration: 100 }
//         }
//     ]
// }
import { $define, $object, $signal } from "ljos-web/object";
import {
  clock,
  Item,
  NumberAnimation,
  PropertyChanges,
  Rectangle,
  SequentialAnimation,
  State,
  Transition,
} from "ljos-web/QtQuick";
import { make } from "../scene.js";

const names = ["root", "box", "ab", "any"];
export const objects = { log: [], clock };

export default function Transitions() {
  clock.stop();
  for (const name of names) objects[name] = $object();
  const { log, root, box, ab, any } = objects;
  const [unit, setUnit] = $signal(10);
  const onBox = (props) => Object.defineProperty(props, "target", { get: () => box, enumerable: true });
  const made = make(
    Item,
    {
      $self: root,
      width: 400,
      height: 300,
      get states() {
        return [
          make(State, { name: "a", onCompleted: () => log.push(`completed a ${box.x}`) }, () =>
            make(
              PropertyChanges,
              onBox({
                $changes: [
                  ["x", () => 100],
                  ["width", () => unit() * 8],
                ],
              }),
            ),
          ),
          make(
            State,
            { name: "b", extend: "a", onCompleted: () => log.push(`completed b ${box.x} ${box.y}`) },
            () => [
              make(
                PropertyChanges,
                onBox({
                  $changes: [
                    ["y", () => 60],
                    ["x", () => 200],
                  ],
                }),
              ),
              make(PropertyChanges, onBox({ explicit: true, $changes: [["height", () => unit() * 7]] })),
            ],
          ),
          make(State, { name: "c" }, () => [
            make(PropertyChanges, onBox({ restoreEntryValues: false, $changes: [["opacity", () => 0.5]] })),
            make(PropertyChanges, { $changes: [["rotation", () => unit(), () => box]] }),
          ]),
        ];
      },
      get transitions() {
        return [
          make(
            Transition,
            { $self: ab, from: "", to: "a", reversible: true, onRunningChanged: () => log.push(`ab ${ab.running}`) },
            () =>
              make(SequentialAnimation, {}, () => [
                make(NumberAnimation, { property: "x", duration: 100 }),
                make(NumberAnimation, { property: "width", duration: 100 }),
              ]),
          ),
          make(Transition, { $self: any, onRunningChanged: () => log.push(`any ${any.running}`) }, () =>
            make(NumberAnimation, { properties: "x,y", duration: 100 }),
          ),
        ];
      },
    },
    () =>
      make(Rectangle, {
        $self: box,
        width: 50,
        height: 50,
        color: "red",
        get opacity() {
          return unit() / 10;
        },
      }),
  );
  return $define(made, { unit: [unit, setUnit] });
}

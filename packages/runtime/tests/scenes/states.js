// Item {
//     id: root; width: 400; height: 300
//     property bool flag: false
//     property real ratio: 1
//     onStateChanged: log.push("state " + state + " " + box.width + " " + box.x + " " + box.color)
//     Rectangle { id: box; width: 50; height: 50; color: "red" }
//     state: "start"
//     states: [
//         State {
//             name: "start"
//             PropertyChanges { target: box; x: 10 }
//             StateChangeScript { script: log.push("script start " + box.x) }
//             onCompleted: log.push("completed start " + box.x)
//         },
//         State {
//             name: "wide"
//             PropertyChanges { target: box; width: 200 * root.ratio; color: "blue" }
//             StateChangeScript { script: log.push("script wide " + box.width + " " + box.x + " " + box.color) }
//             onCompleted: log.push("completed wide " + box.width + " " + box.x + " " + move.running + " " + grow.running)
//         },
//         State {
//             name: "auto"; when: root.flag
//             PropertyChanges { target: box; y: 100 }
//             onCompleted: log.push("completed auto " + box.y)
//         }
//     ]
//     transitions: [
//         Transition {
//             id: move; to: "wide"
//             onRunningChanged: log.push("move " + running + " " + box.width)
//             NumberAnimation {
//                 id: grow; properties: "width,x"; duration: 100
//                 onStarted: log.push("grow started")
//                 onRunningChanged: log.push("grow " + running)
//             }
//         }
//     ]
//     Component.onCompleted: log.push("onCompleted " + state + " " + box.x)
// }
import { $define, $object, $signal } from "ljos-web/object";
import {
  clock,
  Item,
  NumberAnimation,
  PropertyChanges,
  Rectangle,
  State,
  StateChangeScript,
  Transition,
} from "ljos-web/QtQuick";
import { make } from "../scene.js";

const names = ["root", "box", "move", "grow"];
export const objects = { log: [], clock };

export default function States() {
  clock.stop();
  for (const name of names) objects[name] = $object();
  const { log, root, box, move, grow } = objects;
  const [flag, setFlag] = $signal(false);
  const [ratio, setRatio] = $signal(1);
  const onBox = (changes) => ({
    get target() {
      return box;
    },
    $changes: changes,
  });
  const made = make(
    Item,
    {
      $self: root,
      width: 400,
      height: 300,
      onStateChanged: () => log.push(`state ${root.state} ${box.width} ${box.x} ${box.color}`),
      state: "start",
      get states() {
        return [
          make(State, { name: "start", onCompleted: () => log.push(`completed start ${box.x}`) }, () => [
            make(PropertyChanges, onBox([["x", () => 10]])),
            make(StateChangeScript, { script: () => log.push(`script start ${box.x}`) }),
          ]),
          make(
            State,
            {
              name: "wide",
              onCompleted: () => log.push(`completed wide ${box.width} ${box.x} ${move.running} ${grow.running}`),
            },
            () => [
              make(
                PropertyChanges,
                onBox([
                  ["width", () => 200 * ratio()],
                  ["color", () => "blue"],
                ]),
              ),
              make(StateChangeScript, { script: () => log.push(`script wide ${box.width} ${box.x} ${box.color}`) }),
            ],
          ),
          make(
            State,
            {
              name: "auto",
              get when() {
                return flag();
              },
              onCompleted: () => log.push(`completed auto ${box.y}`),
            },
            () => make(PropertyChanges, onBox([["y", () => 100]])),
          ),
        ];
      },
      get transitions() {
        return [
          make(
            Transition,
            { $self: move, to: "wide", onRunningChanged: () => log.push(`move ${move.running} ${box.width}`) },
            () =>
              make(NumberAnimation, {
                $self: grow,
                properties: "width,x",
                duration: 100,
                onStarted: () => log.push("grow started"),
                onRunningChanged: () => log.push(`grow ${grow.running}`),
              }),
          ),
        ];
      },
      Component$onCompleted: () => log.push(`onCompleted ${root.state} ${box.x}`),
    },
    () => make(Rectangle, { $self: box, width: 50, height: 50, color: "red" }),
  );
  return $define(made, { flag: [flag, setFlag], ratio: [ratio, setRatio] });
}

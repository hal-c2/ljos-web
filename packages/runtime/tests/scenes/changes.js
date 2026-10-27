// Item {
//     id: root; width: 400; height: 300
//     function show(what) {
//         log.push([what, bar.x, bar.y, token.x, token.y, token.parent === right ? "right" : "left", group.state].join(" "))
//     }
//     Rectangle {
//         id: left; width: 100; height: 300; color: "#dddddd"
//         Rectangle { id: token; x: 10; y: 20; width: 20; height: 20; color: "red" }
//     }
//     Rectangle { id: right; x: 200; y: 50; width: 200; height: 200; color: "#eeeeee" }
//     Rectangle { id: bar; width: 40; height: 30; anchors.left: root.left; anchors.top: root.top; color: "blue" }
//     states: [
//         State {
//             name: "moved"
//             AnchorChanges {
//                 target: bar
//                 anchors.left: undefined; anchors.right: root.right
//                 anchors.top: undefined; anchors.verticalCenter: root.verticalCenter
//             }
//             ParentChange { target: token; parent: right; x: 5 }
//             StateChangeScript { name: "note"; script: root.show("script") }
//             onCompleted: root.show("completed")
//         }
//     ]
//     transitions: Transition {
//         SequentialAnimation {
//             AnchorAnimation { duration: 100 }
//             ScriptAction { scriptName: "note" }
//         }
//     }
//     StateGroup {
//         id: group
//         onStateChanged: log.push("group " + state)
//         states: [ State { name: "on"; when: bar.x > 300; PropertyChanges { target: right; opacity: 0.5 } } ]
//         transitions: Transition { id: fade; NumberAnimation { property: "opacity"; duration: 100 } }
//     }
// }
import { $define, $object } from "ljos-web/object";
import {
  AnchorAnimation,
  AnchorChanges,
  clock,
  Item,
  NumberAnimation,
  ParentChange,
  PropertyChanges,
  Rectangle,
  ScriptAction,
  SequentialAnimation,
  State,
  StateChangeScript,
  StateGroup,
  Transition,
} from "ljos-web/QtQuick";
import { make } from "../scene.js";

const names = ["root", "left", "token", "right", "bar", "group", "fade"];
export const objects = { log: [], clock };

export default function Changes() {
  clock.stop();
  for (const name of names) objects[name] = $object();
  const { log, root, left, token, right, bar, group, fade } = objects;
  const show = (what) =>
    log.push(
      [what, bar.x, bar.y, token.x, token.y, token.parent === right ? "right" : "left", group.state].join(" "),
    );
  const made = make(
    Item,
    {
      $self: root,
      width: 400,
      height: 300,
      get states() {
        return [
          make(State, { name: "moved", onCompleted: () => show("completed") }, () => [
            make(AnchorChanges, {
              get target() {
                return bar;
              },
              anchors$left: undefined,
              get anchors$right() {
                return root.right;
              },
              anchors$top: undefined,
              get anchors$verticalCenter() {
                return root.verticalCenter;
              },
            }),
            make(ParentChange, {
              get target() {
                return token;
              },
              get parent() {
                return right;
              },
              x: 5,
            }),
            make(StateChangeScript, { name: "note", script: () => show("script") }),
          ]),
        ];
      },
      get transitions() {
        return make(Transition, {}, () =>
          make(SequentialAnimation, {}, () => [
            make(AnchorAnimation, { duration: 100 }),
            make(ScriptAction, { scriptName: "note" }),
          ]),
        );
      },
    },
    () => [
      make(Rectangle, { $self: left, width: 100, height: 300, color: "#dddddd" }, () =>
        make(Rectangle, { $self: token, x: 10, y: 20, width: 20, height: 20, color: "red" }),
      ),
      make(Rectangle, { $self: right, x: 200, y: 50, width: 200, height: 200, color: "#eeeeee" }),
      make(Rectangle, {
        $self: bar,
        width: 40,
        height: 30,
        get anchors$left() {
          return root.left;
        },
        get anchors$top() {
          return root.top;
        },
        color: "blue",
      }),
      make(StateGroup, {
        $self: group,
        onStateChanged: () => log.push(`group ${group.state}`),
        get states() {
          return [
            make(
              State,
              {
                name: "on",
                get when() {
                  return bar.x > 300;
                },
              },
              () =>
                make(PropertyChanges, {
                  get target() {
                    return right;
                  },
                  $changes: [["opacity", () => 0.5]],
                }),
            ),
          ];
        },
        get transitions() {
          return make(Transition, { $self: fade }, () =>
            make(NumberAnimation, { property: "opacity", duration: 100 }),
          );
        },
      }),
    ],
  );
  return $define(made, { show });
}

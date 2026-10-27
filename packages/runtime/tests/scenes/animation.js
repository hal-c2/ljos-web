// Item {
//     id: root; width: 400; height: 300
//     Rectangle {
//         id: box; width: 50; height: 50; color: "red"
//         NumberAnimation on y { id: source; from: 0; to: 100; duration: 1000 }
//     }
//     NumberAnimation {
//         id: move; target: box; property: "x"; from: 10; to: 110; duration: 200
//         easing.type: Easing.InQuad
//         onStarted: log.push("started " + box.x + " " + running)
//         onStopped: log.push("stopped " + box.x + " " + running)
//         onFinished: log.push("finished " + box.x + " " + running)
//         onRunningChanged: log.push("running " + running)
//     }
//     NumberAnimation { id: grow; target: box; properties: "width,height"; to: 80; duration: 100 }
//     NumberAnimation { id: loop; target: box; property: "opacity"; from: 1; to: 0; duration: 100; loops: 3 }
//     NumberAnimation {
//         id: forever; target: box; property: "rotation"; from: 0; to: 360; duration: 100
//         loops: Animation.Infinite; alwaysRunToEnd: true
//         onStopped: log.push("forever stopped " + box.rotation)
//         onFinished: log.push("forever finished " + box.rotation)
//     }
//     NumberAnimation { id: instant; target: box; property: "z"; to: 5; duration: 0
//         onStarted: log.push("instant started"); onFinished: log.push("instant finished " + box.z) }
// }
import { $object } from "ljos-web/object";
import { Animation, clock, Easing, Item, NumberAnimation, Rectangle } from "ljos-web/QtQuick";
import { make } from "../scene.js";

const names = ["root", "box", "source", "move", "grow", "loop", "forever", "instant"];
export const objects = { log: [], clock };

export default function Animations() {
  clock.stop();
  for (const name of names) objects[name] = $object();
  const { log, root, box, source, move, grow, loop, forever, instant } = objects;
  return make(Item, { $self: root, width: 400, height: 300 }, () => [
    make(Rectangle, { $self: box, width: 50, height: 50, color: "red" }, () => [
      make(NumberAnimation, { $self: source, $target: box, $property: "y", from: 0, to: 100, duration: 1000 }),
    ]),
    make(NumberAnimation, {
      $self: move,
      get target() {
        return box;
      },
      property: "x",
      from: 10,
      to: 110,
      duration: 200,
      easing$type: Easing.InQuad,
      onStarted: () => log.push(`started ${box.x} ${move.running}`),
      onStopped: () => log.push(`stopped ${box.x} ${move.running}`),
      onFinished: () => log.push(`finished ${box.x} ${move.running}`),
      onRunningChanged: () => log.push(`running ${move.running}`),
    }),
    make(NumberAnimation, {
      $self: grow,
      get target() {
        return box;
      },
      properties: "width,height",
      to: 80,
      duration: 100,
    }),
    make(NumberAnimation, {
      $self: loop,
      get target() {
        return box;
      },
      property: "opacity",
      from: 1,
      to: 0,
      duration: 100,
      loops: 3,
    }),
    make(NumberAnimation, {
      $self: forever,
      get target() {
        return box;
      },
      property: "rotation",
      from: 0,
      to: 360,
      duration: 100,
      loops: Animation.Infinite,
      alwaysRunToEnd: true,
      onStopped: () => log.push(`forever stopped ${box.rotation}`),
      onFinished: () => log.push(`forever finished ${box.rotation}`),
    }),
    make(NumberAnimation, {
      $self: instant,
      get target() {
        return box;
      },
      property: "z",
      to: 5,
      duration: 0,
      onStarted: () => log.push("instant started"),
      onFinished: () => log.push(`instant finished ${box.z}`),
    }),
  ]);
}

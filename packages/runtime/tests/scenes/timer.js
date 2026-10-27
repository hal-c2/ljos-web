// Item {
//     id: root; width: 100; height: 100
//     property bool active: false
//     property int count: 0
//     Rectangle { id: box; width: 10; height: 10 }
//     Timer {
//         id: once; interval: 100
//         onTriggered: log.push("once " + running)
//         onRunningChanged: log.push("once running " + running)
//     }
//     Timer { id: tick; interval: 30; repeat: true; triggeredOnStart: true; onTriggered: log.push("tick") }
//     Timer { id: bound; interval: 50; repeat: true; running: root.active; onTriggered: root.count++ }
//     NumberAnimation { id: slide; target: box; property: "x"; to: 100; duration: 100; running: root.active }
//     FrameAnimation {
//         id: frames
//         onTriggered: log.push("frame " + currentFrame + " " + frameTime + " " + elapsedTime.toFixed(3))
//     }
// }
import { $define, $object, $signal } from "ljos-web/object";
import { clock, FrameAnimation, Item, NumberAnimation, Rectangle, Timer } from "ljos-web/QtQuick";
import { make } from "../scene.js";

const names = ["root", "box", "once", "tick", "bound", "slide", "frames"];
export const objects = { log: [], clock };

export default function Timers() {
  clock.stop();
  for (const name of names) objects[name] = $object();
  const { log, root, box, once, tick, bound, slide, frames } = objects;
  const [active, setActive] = $signal(false);
  const [count, setCount] = $signal(0);
  const made = make(Item, { $self: root, width: 100, height: 100 }, () => [
    make(Rectangle, { $self: box, width: 10, height: 10 }),
    make(Timer, {
      $self: once,
      interval: 100,
      onTriggered: () => log.push(`once ${once.running}`),
      onRunningChanged: () => log.push(`once running ${once.running}`),
    }),
    make(Timer, {
      $self: tick,
      interval: 30,
      repeat: true,
      triggeredOnStart: true,
      onTriggered: () => log.push("tick"),
    }),
    make(Timer, {
      $self: bound,
      interval: 50,
      repeat: true,
      get running() {
        return active();
      },
      onTriggered: () => setCount(count() + 1),
    }),
    make(NumberAnimation, {
      $self: slide,
      get target() {
        return box;
      },
      property: "x",
      to: 100,
      duration: 100,
      get running() {
        return active();
      },
    }),
    make(FrameAnimation, {
      $self: frames,
      onTriggered: () => log.push(`frame ${frames.currentFrame} ${frames.frameTime} ${frames.elapsedTime.toFixed(3)}`),
    }),
  ]);
  return $define(made, { active: [active, setActive], count: [count, setCount] });
}

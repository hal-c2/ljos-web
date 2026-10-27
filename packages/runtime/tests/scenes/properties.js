// Item {
//     id: root; width: 400; height: 300
//     property int count: 2
//     property int doubled: count * 2
//     signal poked(int by)
//     onPoked: (by) => log.push("poked " + by)
//     Rectangle { id: bar; width: root.doubled * 10; height: 10; onWidthChanged: log.push("width " + width) }
//     Rectangle { id: follower; y: 20; width: bar.width; height: 10 }
//     Component.onCompleted: log.push("completed " + follower.width)
// }
import { $define, $object, $signal, signal } from "ljos-web/object";
import { Item, Rectangle } from "ljos-web/QtQuick";
import { make } from "../scene.js";

export const objects = { log: [] };

export default function Properties() {
  const { log } = objects;
  const root = (objects.root = $object());
  const bar = (objects.bar = $object());
  const follower = (objects.follower = $object());
  const [count, setCount] = $signal(2);
  const [doubled, setDoubled] = $signal(() => count() * 2);
  const made = make(
    Item,
    {
      $self: root,
      width: 400,
      height: 300,
      Component$onCompleted: () => log.push(`completed ${follower.width}`),
    },
    () => [
      make(Rectangle, {
        $self: bar,
        height: 10,
        get width() {
          return doubled() * 10;
        },
        onWidthChanged: () => log.push(`width ${bar.width}`),
      }),
      make(Rectangle, {
        $self: follower,
        y: 20,
        height: 10,
        get width() {
          return bar.width;
        },
      }),
    ],
  );
  const poked = signal(() => (by) => log.push(`poked ${by}`));
  return $define(made, { count: [count, setCount], doubled: [doubled, setDoubled], poked });
}

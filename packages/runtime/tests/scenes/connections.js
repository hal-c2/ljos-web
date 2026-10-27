// Item {
//     id: root; width: 400; height: 300
//     property int count: 0
//     property bool on: false
//     property int size: 10
//     signal poked(string who, int n)
//     Rectangle { id: one; width: 50; height: 50 }
//     Rectangle { id: two; y: 60; width: root.size * 3; height: 20; property int tag: 7 }
//     Connections { id: own; function onPoked(who, n) { log.push("own " + who + " " + n) } }
//     Connections {
//         id: link; target: root.on ? two : one
//         function onWidthChanged() { log.push("width of " + (target === one ? "one " : "two ") + target.width) }
//     }
//     Connections {
//         id: gated; target: one; enabled: root.on
//         function onHeightChanged() { log.push("height " + one.height) }
//     }
//     Connections { id: quiet; target: one; ignoreUnknownSignals: true; function onNoSuchThing() { log.push("never") } }
//     Connections { id: none; target: null; function onWidthChanged() { log.push("never") } }
//     Binding { id: bind; target: two; property: "width"; value: root.count * 100; when: root.count > 0 }
//     Binding {
//         id: keep; target: two; property: "height"; value: 99; when: root.count === 1
//         restoreMode: Binding.RestoreNone
//     }
//     Binding { id: tagged; target: two; property: "tag"; value: root.count; when: root.count > 1 }
// }
import { $define, $object, $signal, signal } from "ljos-web/object";
import { Binding, Connections, Item, Rectangle } from "ljos-web/QtQuick";
import { make } from "../scene.js";

const names = ["root", "one", "two", "own", "link", "gated", "quiet", "none", "bind", "keep", "tagged"];
export const objects = { log: [] };

export default function Wiring() {
  for (const name of names) objects[name] = $object();
  const { log, root, one, two, own, link, gated, quiet, none, bind, keep, tagged } = objects;
  const [count, setCount] = $signal(0);
  const [on, setOn] = $signal(false);
  const [size, setSize] = $signal(10);
  const [tag, setTag] = $signal(7);
  const onTwo = (props) => Object.defineProperty(props, "target", { get: () => two, enumerable: true });
  const made = make(Item, { $self: root, width: 400, height: 300 }, () => [
    make(Rectangle, { $self: one, width: 50, height: 50 }),
    $define(
      make(Rectangle, {
        $self: two,
        y: 60,
        get width() {
          return size() * 3;
        },
        height: 20,
      }),
      { tag: [tag, setTag] },
    ),
    make(Connections, { $self: own, onPoked: (who, n) => log.push(`own ${who} ${n}`) }),
    make(Connections, {
      $self: link,
      get target() {
        return on() ? two : one;
      },
      onWidthChanged: () => log.push(`width of ${link.target === one ? "one" : "two"} ${link.target.width}`),
    }),
    make(Connections, {
      $self: gated,
      get target() {
        return one;
      },
      get enabled() {
        return on();
      },
      onHeightChanged: () => log.push(`height ${one.height}`),
    }),
    make(Connections, {
      $self: quiet,
      get target() {
        return one;
      },
      ignoreUnknownSignals: true,
      onNoSuchThing: () => log.push("never"),
    }),
    make(Connections, { $self: none, target: null, onWidthChanged: () => log.push("never") }),
    make(
      Binding,
      onTwo({
        $self: bind,
        property: "width",
        get value() {
          return count() * 100;
        },
        get when() {
          return count() > 0;
        },
      }),
    ),
    make(
      Binding,
      onTwo({
        $self: keep,
        property: "height",
        value: 99,
        get when() {
          return count() === 1;
        },
        restoreMode: Binding.RestoreNone,
      }),
    ),
    make(
      Binding,
      onTwo({
        $self: tagged,
        property: "tag",
        get value() {
          return count();
        },
        get when() {
          return count() > 1;
        },
      }),
    ),
  ]);
  return $define(made, { count: [count, setCount], on: [on, setOn], size: [size, setSize], poked: signal() });
}

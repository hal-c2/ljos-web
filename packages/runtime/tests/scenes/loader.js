// Item {
//     id: root; width: 400; height: 300
//     Component { id: rect; Rectangle { width: 60; height: 30 } }
//     Component { id: implicit; Rectangle { implicitWidth: 70; implicitHeight: 35 } }
//     Component { id: plain; QtObject { property int value: 3 } }
//     Loader { id: bare }
//     Loader {
//         id: natural; sourceComponent: rect
//         onItemChanged: log.push(item ? "item" : "item null"); onStatusChanged: log.push("status " + status)
//         onLoaded: log.push("loaded " + item.width)
//     }
//     Loader { id: sized; x: 100; width: 120; height: 80; sourceComponent: rect }
//     Loader { id: half; y: 100; width: 120; sourceComponent: implicit }
//     Item { x: 200; y: 100; width: 200; height: 100; Loader { id: filled; anchors.fill: parent; sourceComponent: rect } }
//     Loader { id: inactive; active: false; sourceComponent: rect }
//     Loader { id: object; sourceComponent: plain }
//     Loader { id: later; y: 200; asynchronous: true; sourceComponent: rect }
//     Loader { id: file; x: 100; y: 200; source: "parts/Card.qml"; onLoaded: log.push("file " + item.label) }
// }
import { $component, $define, $file, $object } from "ljos-web/object";
import { Item, Loader, QtObject, Rectangle } from "ljos-web/QtQuick";
import { make } from "../scene.js";

import Card from "./parts/card.js";

// `made` counts the objects the components made; `parts` are the components
// and the module a test gives a Loader.
export const objects = { log: [], made: { rect: 0, implicit: 0 }, parts: {} };

export default function Loaders() {
  const { log, made, parts } = objects;
  for (const name of ["root", "bare", "natural", "sized", "half", "filled", "inactive", "object", "later", "file"]) {
    objects[name] = $object();
  }
  const { root, bare, natural, sized, half, filled, inactive, object, later, file } = objects;
  const rect = (parts.rect = $component(() => {
    made.rect++;
    return make(Rectangle, { width: 60, height: 30 });
  }));
  const implicit = (parts.implicit = $component(() => {
    made.implicit++;
    return make(Rectangle, { implicitWidth: 70, implicitHeight: 35 });
  }));
  const plain = (parts.plain = $component(() => $define(make(QtObject, {}), { value: 3 })));
  // What the compiler makes of a file it can see.
  parts.card = $file(Card);
  // A module that is imported when it is asked for.
  parts.module = () => import("./parts/card.js");
  return make(Item, { $self: root, width: 400, height: 300 }, () => [
    make(Loader, { $self: bare }),
    make(Loader, {
      $self: natural,
      sourceComponent: rect,
      onItemChanged: () => log.push(natural.item ? "item" : "item null"),
      onStatusChanged: () => log.push(`status ${natural.status}`),
      onLoaded: () => log.push(`loaded ${natural.item.width}`),
    }),
    make(Loader, { $self: sized, x: 100, width: 120, height: 80, sourceComponent: rect }),
    make(Loader, { $self: half, y: 100, width: 120, sourceComponent: implicit }),
    make(Item, { x: 200, y: 100, width: 200, height: 100 }, () => [
      make(Loader, {
        $self: filled,
        get anchors$fill() {
          return filled.parent;
        },
        sourceComponent: rect,
      }),
    ]),
    make(Loader, { $self: inactive, active: false, sourceComponent: rect }),
    make(Loader, { $self: object, sourceComponent: plain }),
    make(Loader, { $self: later, y: 200, asynchronous: true, sourceComponent: rect }),
    make(Loader, {
      $self: file,
      x: 100,
      y: 200,
      source: parts.card,
      onLoaded: () => log.push(`file ${file.item.label}`),
    }),
  ]);
}

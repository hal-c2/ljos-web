// Item {
//     id: root; width: 400; height: 300
//     Flickable {
//         id: flick; width: 200; height: 100; contentWidth: 300; contentHeight: 400
//         onMovementStarted: log.push("started"); onMovementEnded: log.push("ended")
//         onFlickStarted: log.push("flick started"); onFlickEnded: log.push("flick ended")
//         Rectangle { id: inner; x: 10; y: 20; width: 50; height: 50; color: "teal" }
//         Repeater { id: marks; model: 4; Rectangle { y: index * 100; width: 5; height: 5 } }
//     }
//     Flickable {
//         id: margins; x: 200; width: 200; height: 100; contentWidth: 300; contentHeight: 400
//         leftMargin: 3; topMargin: 7; bottomMargin: 11
//         flickableDirection: Flickable.VerticalFlick; boundsBehavior: Flickable.StopAtBounds
//         Rectangle { id: corner; width: 10; height: 10 }
//     }
//     Flickable { id: plain; y: 150; width: 100; height: 80; interactive: false; Rectangle { id: lone; width: 30; height: 30 } }
//     Component { id: extra; Rectangle { width: 8; height: 8 } }
// }
import { $component, $object } from "ljos-web/object";
import { Flickable, Item, Rectangle, Repeater } from "ljos-web/QtQuick";
import { make } from "../scene.js";

export const objects = { log: [] };

export default function Flick() {
  const { log } = objects;
  for (const name of ["root", "flick", "inner", "marks", "margins", "corner", "plain", "lone"]) objects[name] = $object();
  const { root, flick, inner, marks, margins, corner, plain, lone } = objects;
  objects.extra = $component(() => make(Rectangle, { width: 8, height: 8 }));
  return make(Item, { $self: root, width: 400, height: 300 }, () => [
    make(
      Flickable,
      {
        $self: flick,
        width: 200,
        height: 100,
        contentWidth: 300,
        contentHeight: 400,
        onMovementStarted: () => log.push("started"),
        onMovementEnded: () => log.push("ended"),
        onFlickStarted: () => log.push("flick started"),
        onFlickEnded: () => log.push("flick ended"),
      },
      () => [
        make(Rectangle, { $self: inner, x: 10, y: 20, width: 50, height: 50, color: "teal" }),
        make(Repeater, {
          $self: marks,
          model: 4,
          delegate: $component(($data) =>
            make(Rectangle, {
              get y() {
                return $data.index * 100;
              },
              width: 5,
              height: 5,
            }),
          ),
        }),
      ],
    ),
    make(
      Flickable,
      {
        $self: margins,
        x: 200,
        width: 200,
        height: 100,
        contentWidth: 300,
        contentHeight: 400,
        leftMargin: 3,
        topMargin: 7,
        bottomMargin: 11,
        flickableDirection: Flickable.VerticalFlick,
        boundsBehavior: Flickable.StopAtBounds,
      },
      () => [make(Rectangle, { $self: corner, width: 10, height: 10 })],
    ),
    make(Flickable, { $self: plain, y: 150, width: 100, height: 80, interactive: false }, () => [
      make(Rectangle, { $self: lone, width: 30, height: 30 }),
    ]),
  ]);
}

// Gestures and the pointer area in Ljós's names (`Tap`, `Hover`, `Drag`,
// `Wheel`, `Pointer`, `PointerArea`), as `qmlc` emits them for
// `import Ljos.Ui`: what a handler accepts is `buttons`/`modifiers`/
// `devices`/`pointerTypes`, and a gesture is a child of its item.
//
// import Ljos.Ui
// Item {
//     width: 400; height: 300
//     Rectangle {
//         id: area; width: 100; height: 100; fill: "gold"
//         Tap { id: tap; buttons: Qt.RightButton; onTapped: log.push("right tapped") }
//         Hover { id: hover; onHoveredChanged: log.push("hover " + hovered) }
//     }
//     PointerArea {
//         id: pointer; x: 100; width: 100; height: 100
//         onClicked: log.push("pointer clicked")
//     }
//     Rectangle {
//         id: dragged; y: 100; width: 50; height: 50; fill: "navy"
//         Drag { id: drag }
//     }
// }
import { $object } from "ljos-web/object";
import { Drag, Hover, Item, PointerArea, Rectangle, Tap } from "ljos-web/Ljos/Ui";
import { clock } from "ljos-web/QtQuick";
import { make } from "../scene.js";

const names = ["root", "area", "tap", "hover", "pointer", "dragged", "drag"];
export const objects = { log: [], clock };

const RightButton = 2;

export default function LjosUiGestures() {
  for (const name of names) objects[name] = $object();
  const { log, root, area, tap, hover, pointer, dragged, drag } = objects;
  return make(Item, { $self: root, width: 400, height: 300 }, () => [
    make(Rectangle, { $self: area, width: 100, height: 100, fill: "gold" }, () => [
      make(Tap, {
        $self: tap,
        buttons: RightButton,
        onTapped: () => log.push("right tapped"),
        onButtonsChanged: () => log.push(`buttons ${tap.buttons}`),
      }),
      make(Hover, {
        $self: hover,
        onHoveredChanged: () => log.push(`hover ${hover.hovered}`),
      }),
    ]),
    make(PointerArea, {
      $self: pointer,
      x: 100,
      width: 100,
      height: 100,
      onClicked: () => log.push("pointer clicked"),
    }),
    make(Rectangle, { $self: dragged, y: 100, width: 50, height: 50, fill: "navy" }, () =>
      make(Drag, { $self: drag }),
    ),
  ]);
}

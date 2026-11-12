// A font as a value, by Ljós's name for its pixel size: `Qt.font`
// takes `size`, `Application.font` reads it back, and a font value
// with a `size` given to an item's `font` sets it at that size.
//
// import Ljos.Ui
// Item {
//     width: 400; height: 300
//     Text { id: label; text: "Hello"; font: Qt.font({ size: 20 }) }
//     Text { id: plain; y: 40; text: "Hello" }
// }
import { $object } from "ljos-web/object";
import { Qt } from "ljos-web/QtQml";
import { Application } from "ljos-web/QtQuick";
import { Item, Text } from "ljos-web/Ljos/Ui";
import { make } from "../scene.js";

export const objects = {
  made: Qt.font({ size: 20 }),
  // The three names together, two at a time and all at once.
  mixed: [Qt.font({ size: 20, pointSize: 30 }), Qt.font({ size: 20, pixelSize: 10 }), Qt.font({ size: 20, pixelSize: 10, pointSize: 30 })],
  app: Application,
};

export default function LjosUiFont() {
  for (const name of ["root", "label", "plain"]) objects[name] = $object();
  const { root, label, plain } = objects;
  return make(Item, { $self: root, width: 400, height: 300 }, () => [
    make(Text, {
      $self: label,
      text: "Hello",
      get font() {
        return Qt.font({ size: 20 });
      },
    }),
    make(Text, { $self: plain, y: 40, text: "Hello" }),
  ]);
}

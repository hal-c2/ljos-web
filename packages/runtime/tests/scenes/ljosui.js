// The dialect form of the scenes beside it, as `qmlc` emits it for
// `import Ljos.Ui` / `import Ljos.Layout` (ljos-ui's `ljos_ui.rs`):
//
// import Ljos.Ui
// import Ljos.Layout
// Item {
//     id: root; width: 400; height: 300
//     property bool blue: false
//     Column {
//         spacing: 5
//         Rectangle {
//             id: box; width: 100; height: 50; fill: "tomato"; radius: 4
//             onFillChanged: log.push("fill " + fill)
//             Tap { onTapped: log.push("tapped") }
//             Behavior on fill { ColorAnimation { duration: 100 } }
//         }
//         Text {
//             id: label; text: "Hello"; font.size: 20
//             align: Text.AlignHCenter; wrap: Text.WordWrap; format: Text.PlainText
//         }
//     }
//     states: State {
//         name: "blue"; when: root.blue
//         PropertyChanges { target: box; fill: "steelblue" }
//     }
// }
import { $define, $object, $signal } from "ljos-web/object";
import { Behavior, ColorAnimation, Item, PropertyChanges, Rectangle, State, Tap, Text } from "ljos-web/Ljos/Ui";
import { Column } from "ljos-web/Ljos/Layout";
import { clock } from "ljos-web/QtQuick";
import { make } from "../scene.js";

const names = ["root", "col", "box", "tap", "label", "small"];
export const objects = { log: [], clock };

export default function LjosUi() {
  clock.stop();
  for (const name of names) objects[name] = $object();
  const { log, root, col, box, tap, label } = objects;
  const [blue, setBlue] = $signal(false);
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
      get states() {
        return [
          make(
            State,
            {
              name: "blue",
              get when() {
                return blue();
              },
            },
            () => make(PropertyChanges, onBox([["fill", () => "steelblue"]])),
          ),
        ];
      },
    },
    () => [
      make(Column, { $self: col, spacing: 5 }, () => [
        make(
          Rectangle,
          {
            $self: box,
            width: 100,
            height: 50,
            fill: "tomato",
            radius: 4,
            onFillChanged: () => log.push(`fill ${box.fill}`),
          },
          () => [
            make(Tap, {
              $self: tap,
              onTapped: () => log.push("tapped"),
            }),
            make(Behavior, { $target: box, $property: "fill" }, () => make(ColorAnimation, { duration: 100 })),
          ],
        ),
        make(Rectangle, { $self: objects.small, width: 50, height: 10, fill: "seagreen" }),
      ]),
      // The label stands under the column, not in it: a Text in a layout
      // halts the wasm kernel today, in Qt's form too (a finding for the
      // kernel, not for these faces).
      make(Text, {
        $self: label,
        y: 70,
        text: "Hello",
        font$size: 20,
        align: Text.AlignHCenter,
        wrap: Text.WordWrap,
        format: Text.PlainText,
      }),
    ],
  );
  return $define(made, { blue: [blue, setBlue] });
}

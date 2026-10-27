// Item {
//     id: root; width: 640; height: 480
//     StackLayout {
//         id: stack; width: 120; height: 80
//         Rectangle { implicitWidth: 30; implicitHeight: 20 }
//         Rectangle { id: capped; Layout.maximumWidth: 60; Layout.minimumHeight: 90; implicitWidth: 50; implicitHeight: 10 }
//         Rectangle { id: fixed; Layout.fillWidth: false; Layout.fillHeight: false; implicitWidth: 40; implicitHeight: 25 }
//         Rectangle { id: sizeful; width: 20; height: 10 }
//     }
//     StackLayout {
//         id: stackLoose; y: 100; currentIndex: 1
//         Rectangle { implicitWidth: 30; implicitHeight: 20 }
//         Rectangle { implicitWidth: 50; implicitHeight: 10; Layout.minimumWidth: 12 }
//     }
//     ColumnLayout {
//         id: holder; x: 200; width: 100; height: 100
//         Rectangle { Layout.fillWidth: true; height: 10 }
//         StackLayout {
//             id: held
//             Rectangle { implicitWidth: 30; implicitHeight: 20 }
//             Rectangle { implicitWidth: 50; implicitHeight: 10 }
//         }
//     }
//     StackLayout { id: none; y: 300 }
//     Item { id: plain; Rectangle { id: outside; width: 5; height: 5 } }
// }
import { $object } from "ljos-web/object";
import { Item, Rectangle } from "ljos-web/QtQuick";
import { ColumnLayout, Layout, StackLayout } from "ljos-web/QtQuick/Layouts";
import { make } from "../scene.js";

const names = ["root", "stack", "capped", "fixed", "sizeful", "stackLoose", "holder", "held", "none", "outside"];
export const objects = {
  attached: (item) => Layout.attached(item),
  stacked: (item) => StackLayout.attached(item),
};

const COLORS = ["#c33", "#3a3", "#36c", "#c93", "#939"];
let painted = 0;
function cell(props) {
  props.color = COLORS[painted++ % COLORS.length];
  return make(Rectangle, props);
}

export default function LayoutsStack() {
  for (const name of names) objects[name] = $object();
  return make(Item, { $self: objects.root, width: 640, height: 480 }, () => [
    make(StackLayout, { $self: objects.stack, width: 120, height: 80 }, () => [
      cell({ implicitWidth: 30, implicitHeight: 20 }),
      cell({
        $self: objects.capped,
        Layout$maximumWidth: 60,
        Layout$minimumHeight: 90,
        implicitWidth: 50,
        implicitHeight: 10,
      }),
      cell({
        $self: objects.fixed,
        Layout$fillWidth: false,
        Layout$fillHeight: false,
        implicitWidth: 40,
        implicitHeight: 25,
      }),
      cell({ $self: objects.sizeful, width: 20, height: 10 }),
    ]),
    make(StackLayout, { $self: objects.stackLoose, y: 100, currentIndex: 1 }, () => [
      cell({ implicitWidth: 30, implicitHeight: 20 }),
      cell({ implicitWidth: 50, implicitHeight: 10, Layout$minimumWidth: 12 }),
    ]),
    make(ColumnLayout, { $self: objects.holder, x: 200, width: 100, height: 100 }, () => [
      cell({ Layout$fillWidth: true, height: 10 }),
      make(StackLayout, { $self: objects.held }, () => [
        cell({ implicitWidth: 30, implicitHeight: 20 }),
        cell({ implicitWidth: 50, implicitHeight: 10 }),
      ]),
    ]),
    make(StackLayout, { $self: objects.none, y: 300 }),
    make(Item, {}, () => [cell({ $self: objects.outside, width: 5, height: 5 })]),
  ]);
}

// Item {
//     id: root; width: 400; height: 300
//     GridView {
//         id: grid; width: 250; height: 150; model: 20; cellWidth: 80; cellHeight: 60
//         header: Rectangle { width: 250; height: 10 }
//         footer: Rectangle { width: 250; height: 5 }
//         highlight: Rectangle {}
//         delegate: Rectangle {
//             width: 70; height: 50
//             property int row: index
//             property bool current: GridView.isCurrentItem
//             property var view: GridView.view
//         }
//     }
//     GridView {
//         id: columns; x: 250; width: 150; height: 150; model: 20; cellWidth: 80; cellHeight: 60
//         flow: GridView.FlowTopToBottom
//         delegate: Rectangle { width: 70; height: 50; property int row: index }
//     }
//     GridView {
//         id: many; y: 150; width: 300; height: 150; model: 1000
//         delegate: Rectangle { width: 90; height: 90; property int row: index }
//     }
//     ListModel { id: names; ListElement { name: "a" } ListElement { name: "b" } ListElement { name: "c" } }
//     GridView {
//         id: named; x: 300; y: 150; width: 100; height: 150; model: names; cellWidth: 50; cellHeight: 50
//         delegate: Rectangle { required property string name; width: 40; height: 40 }
//     }
// }
import { $component, $define, $object } from "ljos-web/object";
import { GridView, Item, ListElement, ListModel, Rectangle } from "ljos-web/QtQuick";
import { make } from "../scene.js";

export const objects = { made: { grid: 0, columns: 0, many: 0, named: 0 } };

export default function Grids() {
  const { made } = objects;
  for (const name of ["root", "grid", "columns", "many", "names", "named"]) objects[name] = $object();
  const { root, grid, columns, many, names, named } = objects;
  const cell = (view, width, height) =>
    $component(($data) => {
      made[view]++;
      const self = $object();
      return $define(make(Rectangle, { $self: self, width, height }), {
        row: [() => $data.index],
        name: [() => $data.name],
        current: [() => GridView.attached(self).isCurrentItem],
        view: [() => GridView.attached(self).view],
      });
    });
  return make(Item, { $self: root, width: 400, height: 300 }, () => [
    make(GridView, {
      $self: grid,
      width: 250,
      height: 150,
      model: 20,
      cellWidth: 80,
      cellHeight: 60,
      header: $component(() => make(Rectangle, { width: 250, height: 10 })),
      footer: $component(() => make(Rectangle, { width: 250, height: 5 })),
      highlight: $component(() => make(Rectangle, {})),
      delegate: cell("grid", 70, 50),
    }),
    make(GridView, {
      $self: columns,
      x: 250,
      width: 150,
      height: 150,
      model: 20,
      cellWidth: 80,
      cellHeight: 60,
      flow: GridView.FlowTopToBottom,
      delegate: cell("columns", 70, 50),
    }),
    make(GridView, { $self: many, y: 150, width: 300, height: 150, model: 1000, delegate: cell("many", 90, 90) }),
    make(ListModel, { $self: names }, () => [
      make(ListElement, { name: "a" }),
      make(ListElement, { name: "b" }),
      make(ListElement, { name: "c" }),
    ]),
    make(GridView, {
      $self: named,
      x: 300,
      y: 150,
      width: 100,
      height: 150,
      cellWidth: 50,
      cellHeight: 50,
      get model() {
        return names;
      },
      delegate: cell("named", 40, 40),
    }),
  ]);
}

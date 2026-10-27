// Item {
//     id: root; width: 400; height: 300
//     Column {
//         id: outer; spacing: 6; anchors.centerIn: parent
//         Row {
//             id: first; spacing: 2
//             Rectangle { width: 30; height: 20 }
//             Rectangle { width: 50; height: 10 }
//         }
//         Rectangle { width: 20; height: 10; anchors.horizontalCenter: parent.horizontalCenter }
//         Row {
//             id: second
//             Rectangle { width: 10; height: 10 }
//             Column {
//                 id: inner
//                 Rectangle { width: 60; height: 5 }
//                 Rectangle { id: grows; width: 15; height: 5 }
//             }
//         }
//         Rectangle { width: parent.width; height: 4 }
//     }
//     Rectangle { id: beside; x: outer.x + outer.width; y: outer.y; width: first.implicitWidth; height: outer.height }
// }
import { $object } from "ljos-web/object";
import { Column, Item, Rectangle, Row } from "ljos-web/QtQuick";
import { make } from "../scene.js";

export const objects = {};

const cell = (color, props) => make(Rectangle, Object.assign(props, { color }));

export default function Nested() {
  for (const name of ["root", "outer", "first", "second", "inner", "grows", "beside"]) objects[name] = $object();
  const { root, outer, first, second, inner, grows, beside } = objects;
  return make(Item, { $self: root, width: 400, height: 300 }, () => [
    make(
      Column,
      {
        $self: outer,
        spacing: 6,
        get anchors$centerIn() {
          return root;
        },
      },
      () => [
        make(Row, { $self: first, spacing: 2 }, () => [
          cell("#c33", { width: 30, height: 20 }),
          cell("#3a3", { width: 50, height: 10 }),
        ]),
        cell("#36c", {
          width: 20,
          height: 10,
          get anchors$horizontalCenter() {
            return outer.horizontalCenter;
          },
        }),
        make(Row, { $self: second }, () => [
          cell("#c93", { width: 10, height: 10 }),
          make(Column, { $self: inner }, () => [
            cell("#939", { width: 60, height: 5 }),
            cell("#399", { $self: grows, width: 15, height: 5 }),
          ]),
        ]),
        cell("#666", {
          get width() {
            return outer.width;
          },
          height: 4,
        }),
      ],
    ),
    cell("#ddd", {
      $self: beside,
      get x() {
        return outer.x + outer.width;
      },
      get y() {
        return outer.y;
      },
      get width() {
        return first.implicitWidth;
      },
      get height() {
        return outer.height;
      },
    }),
  ]);
}

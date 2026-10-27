// Item {
//     id: root; width: 400; height: 300
//     Row {
//         id: row; spacing: 4; padding: 3; leftPadding: 10
//         onPositioningComplete: log.push("row")
//         Rectangle { width: 20; height: 10 }
//         Rectangle { width: 30; height: 25; y: 2 }
//         Rectangle { width: 30; height: 25; visible: false }
//         Rectangle { width: 0; height: 25 }
//         Rectangle { id: last; width: 15; height: 5 }
//     }
//     Row {
//         id: mirrored; y: 40; width: 200; layoutDirection: Qt.RightToLeft; spacing: 5; rightPadding: 7
//         Rectangle { width: 20; height: 10 }
//         Rectangle { width: 30; height: 20 }
//     }
//     Row {
//         id: mirroredLoose; y: 70; layoutDirection: Qt.RightToLeft; spacing: 5; leftPadding: 2
//         Rectangle { width: 20; height: 10 }
//         Rectangle { width: 30; height: 20 }
//     }
//     Column {
//         id: column; x: 250; spacing: 2; padding: 5; bottomPadding: 1
//         Rectangle { width: 20; height: 10; x: 3 }
//         Rectangle { width: 40; height: 20 }
//         Repeater { model: 2; Rectangle { width: 10; height: 8 } }
//         Rectangle { width: 12; height: 6 }
//     }
//     Column {
//         id: plain; x: 320
//         Rectangle { width: 20; height: 10; x: 3 }
//         Rectangle { width: 40; height: 20 }
//     }
//     Grid {
//         id: grid; y: 100; columns: 3; spacing: 2; rowSpacing: 6
//         horizontalItemAlignment: Grid.AlignHCenter; verticalItemAlignment: Grid.AlignBottom
//         Rectangle { width: 20; height: 10 }
//         Rectangle { width: 30; height: 14 }
//         Rectangle { width: 10; height: 12 }
//         Rectangle { width: 24; height: 20 }
//         Rectangle { width: 11; height: 7 }
//     }
//     Grid {
//         id: down; y: 150; rows: 2; flow: Grid.TopToBottom; columnSpacing: 3; padding: 1
//         verticalItemAlignment: Grid.AlignVCenter; horizontalItemAlignment: Grid.AlignRight
//         (the same five rectangles)
//     }
//     Grid {
//         id: gridMirrored; y: 200; width: 150.7; columns: 2; spacing: 4
//         layoutDirection: Qt.RightToLeft; rightPadding: 3
//         Rectangle { width: 20; height: 10 }
//         Rectangle { width: 30; height: 14 }
//         Rectangle { width: 10; height: 12 }
//     }
//     Grid {
//         id: four; y: 240
//         Rectangle { width: 5; height: 5 }
//         Rectangle { width: 6; height: 5 }
//         Rectangle { width: 7; height: 5 }
//         Rectangle { width: 8; height: 5 }
//         Rectangle { width: 9; height: 5 }
//     }
//     Flow {
//         id: flow; x: 200; y: 100; width: 100; spacing: 5; padding: 2
//         Rectangle { width: 40; height: 10 }
//         Rectangle { width: 40; height: 20 }
//         Rectangle { width: 40; height: 15 }
//         Rectangle { width: 70; height: 5 }
//         Rectangle { width: 20; height: 5 }
//     }
//     Flow {
//         id: flowDown; x: 200; y: 170; height: 40; flow: Flow.TopToBottom; spacing: 3
//         Rectangle { width: 40; height: 10 }
//         Rectangle { width: 20; height: 20 }
//         Rectangle { width: 30; height: 15 }
//         Rectangle { width: 10; height: 30 }
//     }
//     Flow {
//         id: flowMirrored; x: 200; y: 220; width: 100; layoutDirection: Qt.RightToLeft; spacing: 5; leftPadding: 4
//         Rectangle { width: 40; height: 10 }
//         Rectangle { width: 40; height: 20 }
//         Rectangle { width: 40; height: 15 }
//     }
//     Flow {
//         id: flowLoose; x: 200; y: 260; spacing: 5
//         Rectangle { width: 40; height: 10 }
//         Rectangle { width: 40; height: 20 }
//     }
// }
import { $object } from "ljos-web/object";
import { Column, Flow, Grid, Item, Positioner, Rectangle, Row } from "ljos-web/QtQuick";
import { make } from "../scene.js";

const names = [
  "root",
  "row",
  "last",
  "mirrored",
  "mirroredLoose",
  "column",
  "plain",
  "grid",
  "down",
  "gridMirrored",
  "four",
  "flow",
  "flowDown",
  "flowMirrored",
  "flowLoose",
];
export const objects = { log: [], attached: (item) => Positioner.attached(item) };

const COLORS = ["#c33", "#3a3", "#36c", "#c93", "#939"];
let painted = 0;
const cell = (width, height, more) =>
  make(Rectangle, { color: COLORS[painted++ % COLORS.length], width, height, ...more });

// Stands in for a Repeater, which is not this module's: no item itself, and
// the items it made are its parent's children, after it.
function repeated(count, delegate) {
  const items = Array.from({ length: count }, delegate);
  return { $siblings: () => items };
}

const five = () => [cell(20, 10), cell(30, 14), cell(10, 12), cell(24, 20), cell(11, 7)];

export default function Positioners() {
  for (const name of names) objects[name] = $object();
  const { log } = objects;
  return make(Item, { $self: objects.root, width: 400, height: 300 }, () => [
    make(
      Row,
      { $self: objects.row, spacing: 4, padding: 3, leftPadding: 10, onPositioningComplete: () => log.push("row") },
      () => [
        cell(20, 10),
        cell(30, 25, { y: 2 }),
        cell(30, 25, { visible: false }),
        cell(0, 25),
        cell(15, 5, { $self: objects.last }),
      ],
    ),
    make(Row, { $self: objects.mirrored, y: 40, width: 200, layoutDirection: 1, spacing: 5, rightPadding: 7 }, () => [
      cell(20, 10),
      cell(30, 20),
    ]),
    make(Row, { $self: objects.mirroredLoose, y: 70, layoutDirection: 1, spacing: 5, leftPadding: 2 }, () => [
      cell(20, 10),
      cell(30, 20),
    ]),
    make(Column, { $self: objects.column, x: 250, spacing: 2, padding: 5, bottomPadding: 1 }, () => [
      cell(20, 10, { x: 3 }),
      cell(40, 20),
      repeated(2, () => cell(10, 8)),
      cell(12, 6),
    ]),
    make(Column, { $self: objects.plain, x: 320 }, () => [cell(20, 10, { x: 3 }), cell(40, 20)]),
    make(
      Grid,
      {
        $self: objects.grid,
        y: 100,
        columns: 3,
        spacing: 2,
        rowSpacing: 6,
        horizontalItemAlignment: Grid.AlignHCenter,
        verticalItemAlignment: Grid.AlignBottom,
      },
      five,
    ),
    make(
      Grid,
      {
        $self: objects.down,
        y: 150,
        rows: 2,
        flow: Grid.TopToBottom,
        columnSpacing: 3,
        padding: 1,
        verticalItemAlignment: Grid.AlignVCenter,
        horizontalItemAlignment: Grid.AlignRight,
      },
      five,
    ),
    make(
      Grid,
      { $self: objects.gridMirrored, y: 200, width: 150.7, columns: 2, spacing: 4, layoutDirection: 1, rightPadding: 3 },
      () => [cell(20, 10), cell(30, 14), cell(10, 12)],
    ),
    make(Grid, { $self: objects.four, y: 240 }, () => [cell(5, 5), cell(6, 5), cell(7, 5), cell(8, 5), cell(9, 5)]),
    make(Flow, { $self: objects.flow, x: 200, y: 100, width: 100, spacing: 5, padding: 2 }, () => [
      cell(40, 10),
      cell(40, 20),
      cell(40, 15),
      cell(70, 5),
      cell(20, 5),
    ]),
    make(Flow, { $self: objects.flowDown, x: 200, y: 170, height: 40, flow: Flow.TopToBottom, spacing: 3 }, () => [
      cell(40, 10),
      cell(20, 20),
      cell(30, 15),
      cell(10, 30),
    ]),
    make(
      Flow,
      { $self: objects.flowMirrored, x: 200, y: 220, width: 100, layoutDirection: 1, spacing: 5, leftPadding: 4 },
      () => [cell(40, 10), cell(40, 20), cell(40, 15)],
    ),
    make(Flow, { $self: objects.flowLoose, x: 200, y: 260, spacing: 5 }, () => [cell(40, 10), cell(40, 20)]),
  ]);
}

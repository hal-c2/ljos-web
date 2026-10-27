// Item {
//     id: root; width: 640; height: 480
//     ColumnLayout {
//         id: outer; width: 200; height: 120; spacing: 4
//         RowLayout {
//             id: first
//             Rectangle { width: 20; height: 10 }
//             Rectangle { Layout.fillWidth: true; Layout.preferredWidth: 30; height: 12 }
//         }
//         RowLayout {
//             id: fixed; Layout.fillWidth: false; Layout.alignment: Qt.AlignRight
//             Rectangle { width: 20; height: 10 }
//             Rectangle { width: 30; height: 14 }
//         }
//         Rectangle { id: kept; width: 50; height: 10 }
//         Rectangle { Layout.fillWidth: true; Layout.fillHeight: true }
//     }
//     RowLayout {
//         id: outerLoose; y: 130
//         ColumnLayout {
//             id: inner
//             Rectangle { implicitWidth: 40; implicitHeight: 10 }
//             Rectangle { id: least; Layout.fillWidth: true; Layout.minimumWidth: 25; height: 10 }
//         }
//         Rectangle { width: 10; height: 10 }
//     }
//     RowLayout {
//         id: tight; y: 170; width: 30
//         ColumnLayout {
//             id: tightInner
//             Rectangle { Layout.fillWidth: true; Layout.minimumWidth: 25; Layout.preferredWidth: 60; height: 10 }
//         }
//         Rectangle { width: 10; height: 10 }
//     }
//     GridLayout {
//         id: grid; x: 220; width: 200; height: 100; columns: 3
//         Rectangle { width: 20; height: 10 }
//         Rectangle { Layout.fillWidth: true; height: 10; Layout.columnSpan: 2 }
//         Rectangle { width: 30; Layout.fillHeight: true; Layout.rowSpan: 2 }
//         Rectangle { width: 25; height: 12 }
//         Rectangle { id: gridHidden; width: 40; height: 10; visible: false }
//         Rectangle { implicitWidth: 15; implicitHeight: 8; Layout.alignment: Qt.AlignRight | Qt.AlignBottom }
//         Rectangle { width: 10; height: 10 }
//         Rectangle { height: 10; Layout.columnSpan: 2; Layout.fillWidth: true }
//     }
//     GridLayout {
//         id: down; x: 220; y: 110; rows: 2; flow: GridLayout.TopToBottom; rowSpacing: 2; columnSpacing: 7
//         Rectangle { width: 20; height: 10 }
//         Rectangle { width: 30; height: 14 }
//         Rectangle { width: 10; height: 12 }
//         Rectangle { width: 24; height: 20 }
//         Rectangle { width: 11; height: 7 }
//     }
//     GridLayout {
//         id: explicit; x: 220; y: 160; width: 150
//         Rectangle { Layout.row: 1; Layout.column: 2; width: 20; height: 10 }
//         Rectangle { Layout.row: 0; Layout.column: 0; width: 30; height: 14 }
//         Rectangle { Layout.column: 1; width: 10; height: 10 }
//         Rectangle { width: 12; height: 6 }
//         Rectangle { Layout.row: 2; width: 14; height: 6 }
//     }
//     GridLayout {
//         id: gridMirrored; x: 220; y: 210; width: 150; columns: 2; layoutDirection: Qt.RightToLeft
//         Rectangle { width: 20; height: 10 }
//         Rectangle { width: 30; height: 14; Layout.leftMargin: 6 }
//         Rectangle { height: 12; Layout.fillWidth: true }
//         Rectangle { width: 10; height: 10; Layout.alignment: Qt.AlignRight }
//     }
//     GridLayout {
//         id: even; x: 220; y: 260; width: 160; height: 60; columns: 2; uniformCellWidths: true; uniformCellHeights: true
//         Rectangle { width: 20; height: 10 }
//         Rectangle { width: 50; height: 14 }
//         Rectangle { width: 10; height: 22 }
//         Rectangle { Layout.fillWidth: true; Layout.fillHeight: true }
//     }
//     GridLayout {
//         id: gridLoose; x: 420; y: 0; columns: 2
//         Rectangle { width: 20; height: 10 }
//         Rectangle { width: 30; height: 14 }
//         Rectangle { width: 10; height: 12; Layout.columnSpan: 2; Layout.fillWidth: true }
//         Rectangle { width: 24; height: 20; Layout.rowSpan: 2 }
//         Rectangle { width: 11; height: 7 }
//         Rectangle { width: 12; height: 8 }
//     }
// }
import { $object } from "ljos-web/object";
import { Item, Rectangle } from "ljos-web/QtQuick";
import { ColumnLayout, GridLayout, Layout, RowLayout } from "ljos-web/QtQuick/Layouts";
import { make } from "../scene.js";

const names = [
  "root",
  "outer",
  "first",
  "fixed",
  "kept",
  "outerLoose",
  "inner",
  "least",
  "tight",
  "tightInner",
  "grid",
  "gridHidden",
  "down",
  "explicit",
  "gridMirrored",
  "even",
  "gridLoose",
];
export const objects = { attached: (item) => Layout.attached(item) };

const AlignRight = 0x2;
const AlignBottom = 0x40;
const RightToLeft = 1;

const COLORS = ["#c33", "#3a3", "#36c", "#c93", "#939"];
let painted = 0;
function cell(props) {
  props.color = COLORS[painted++ % COLORS.length];
  return make(Rectangle, props);
}

export default function LayoutsGrid() {
  for (const name of names) objects[name] = $object();
  return make(Item, { $self: objects.root, width: 640, height: 480 }, () => [
    make(ColumnLayout, { $self: objects.outer, width: 200, height: 120, spacing: 4 }, () => [
      make(RowLayout, { $self: objects.first }, () => [
        cell({ width: 20, height: 10 }),
        cell({ Layout$fillWidth: true, Layout$preferredWidth: 30, height: 12 }),
      ]),
      make(RowLayout, { $self: objects.fixed, Layout$fillWidth: false, Layout$alignment: AlignRight }, () => [
        cell({ width: 20, height: 10 }),
        cell({ width: 30, height: 14 }),
      ]),
      cell({ $self: objects.kept, width: 50, height: 10 }),
      cell({ Layout$fillWidth: true, Layout$fillHeight: true }),
    ]),
    make(RowLayout, { $self: objects.outerLoose, y: 130 }, () => [
      make(ColumnLayout, { $self: objects.inner }, () => [
        cell({ implicitWidth: 40, implicitHeight: 10 }),
        cell({ $self: objects.least, Layout$fillWidth: true, Layout$minimumWidth: 25, height: 10 }),
      ]),
      cell({ width: 10, height: 10 }),
    ]),
    make(RowLayout, { $self: objects.tight, y: 170, width: 30 }, () => [
      make(ColumnLayout, { $self: objects.tightInner }, () => [
        cell({ Layout$fillWidth: true, Layout$minimumWidth: 25, Layout$preferredWidth: 60, height: 10 }),
      ]),
      cell({ width: 10, height: 10 }),
    ]),
    make(GridLayout, { $self: objects.grid, x: 220, width: 200, height: 100, columns: 3 }, () => [
      cell({ width: 20, height: 10 }),
      cell({ Layout$fillWidth: true, height: 10, Layout$columnSpan: 2 }),
      cell({ width: 30, Layout$fillHeight: true, Layout$rowSpan: 2 }),
      cell({ width: 25, height: 12 }),
      cell({ $self: objects.gridHidden, width: 40, height: 10, visible: false }),
      cell({ implicitWidth: 15, implicitHeight: 8, Layout$alignment: AlignRight | AlignBottom }),
      cell({ width: 10, height: 10 }),
      cell({ height: 10, Layout$columnSpan: 2, Layout$fillWidth: true }),
    ]),
    make(
      GridLayout,
      { $self: objects.down, x: 220, y: 110, rows: 2, flow: GridLayout.TopToBottom, rowSpacing: 2, columnSpacing: 7 },
      () => [
        cell({ width: 20, height: 10 }),
        cell({ width: 30, height: 14 }),
        cell({ width: 10, height: 12 }),
        cell({ width: 24, height: 20 }),
        cell({ width: 11, height: 7 }),
      ],
    ),
    make(GridLayout, { $self: objects.explicit, x: 220, y: 160, width: 150 }, () => [
      cell({ Layout$row: 1, Layout$column: 2, width: 20, height: 10 }),
      cell({ Layout$row: 0, Layout$column: 0, width: 30, height: 14 }),
      cell({ Layout$column: 1, width: 10, height: 10 }),
      cell({ width: 12, height: 6 }),
      cell({ Layout$row: 2, width: 14, height: 6 }),
    ]),
    make(
      GridLayout,
      { $self: objects.gridMirrored, x: 220, y: 210, width: 150, columns: 2, layoutDirection: RightToLeft },
      () => [
        cell({ width: 20, height: 10 }),
        cell({ width: 30, height: 14, Layout$leftMargin: 6 }),
        cell({ height: 12, Layout$fillWidth: true }),
        cell({ width: 10, height: 10, Layout$alignment: AlignRight }),
      ],
    ),
    make(
      GridLayout,
      {
        $self: objects.even,
        x: 220,
        y: 260,
        width: 160,
        height: 60,
        columns: 2,
        uniformCellWidths: true,
        uniformCellHeights: true,
      },
      () => [
        cell({ width: 20, height: 10 }),
        cell({ width: 50, height: 14 }),
        cell({ width: 10, height: 22 }),
        cell({ Layout$fillWidth: true, Layout$fillHeight: true }),
      ],
    ),
    make(GridLayout, { $self: objects.gridLoose, x: 420, y: 0, columns: 2 }, () => [
      cell({ width: 20, height: 10 }),
      cell({ width: 30, height: 14 }),
      cell({ width: 10, height: 12, Layout$columnSpan: 2, Layout$fillWidth: true }),
      cell({ width: 24, height: 20, Layout$rowSpan: 2 }),
      cell({ width: 11, height: 7 }),
      cell({ width: 12, height: 8 }),
    ]),
  ]);
}

// Item {
//     id: root; width: 640; height: 480
//     RowLayout {
//         id: row; width: 300; height: 40
//         Rectangle { width: 20; height: 10 }
//         Rectangle { implicitWidth: 30; implicitHeight: 20; Layout.fillWidth: true }
//         Rectangle { id: capped; Layout.preferredWidth: 40; Layout.preferredHeight: 15; Layout.fillWidth: true; Layout.maximumWidth: 60 }
//         Rectangle { id: hidden; width: 30; height: 25; visible: false }
//         Rectangle { Layout.preferredWidth: 25; Layout.fillHeight: true; Layout.minimumHeight: 5 }
//     }
//     RowLayout {
//         id: squeezed; y: 50; width: 100; spacing: 4
//         Rectangle { Layout.fillWidth: true; Layout.minimumWidth: 10; Layout.preferredWidth: 60; height: 10 }
//         Rectangle { Layout.fillWidth: true; Layout.minimumWidth: 20; Layout.preferredWidth: 80; height: 10 }
//         Rectangle { width: 20; height: 10 }
//     }
//     RowLayout {
//         id: loose; y: 70
//         Rectangle { width: 20; height: 10 }
//         Rectangle { implicitWidth: 30.5; implicitHeight: 20.2 }
//         Rectangle { Layout.preferredWidth: 15; Layout.preferredHeight: 5; Layout.margins: 3; Layout.leftMargin: 7 }
//     }
//     RowLayout {
//         id: stretched; y: 110; width: 300; height: 20; spacing: 0
//         Rectangle { Layout.fillWidth: true; Layout.preferredWidth: 30; Layout.horizontalStretchFactor: 1; height: 10 }
//         Rectangle { Layout.fillWidth: true; Layout.preferredWidth: 30; Layout.horizontalStretchFactor: 2; height: 10 }
//         Rectangle { Layout.fillWidth: true; Layout.preferredWidth: 30; Layout.horizontalStretchFactor: 3; height: 10 }
//     }
//     RowLayout {
//         id: mixed; y: 135; width: 301; height: 20; spacing: 3
//         Rectangle { Layout.fillWidth: true; Layout.preferredWidth: 10; height: 10 }
//         Rectangle { Layout.fillWidth: true; Layout.preferredWidth: 50; height: 10 }
//         Rectangle { Layout.fillWidth: true; Layout.preferredWidth: 20; Layout.maximumWidth: 30; height: 10 }
//     }
//     RowLayout {
//         id: aligned; y: 160; width: 300; height: 60
//         Rectangle { width: 20; height: 10; Layout.alignment: Qt.AlignTop }
//         Rectangle { width: 20; height: 10; Layout.alignment: Qt.AlignBottom }
//         Rectangle { height: 10; Layout.fillWidth: true; Layout.maximumWidth: 50; Layout.alignment: Qt.AlignRight }
//         Rectangle { height: 15; Layout.fillWidth: true; Layout.maximumWidth: 31; Layout.alignment: Qt.AlignHCenter | Qt.AlignBottom }
//         Rectangle { width: 20; height: 30; baselineOffset: 22; Layout.alignment: Qt.AlignBaseline }
//         Rectangle { width: 20; height: 16; baselineOffset: 4; Layout.alignment: Qt.AlignBaseline }
//     }
//     RowLayout {
//         id: mirrored; y: 230; width: 200; layoutDirection: Qt.RightToLeft
//         Rectangle { width: 20; height: 10; Layout.leftMargin: 4; Layout.rightMargin: 9 }
//         Rectangle { height: 20; Layout.fillWidth: true; Layout.maximumWidth: 40; Layout.alignment: Qt.AlignLeft }
//         Rectangle { width: 30; height: 14; Layout.margins: 2 }
//     }
//     ColumnLayout {
//         id: column; x: 320; width: 100; height: 200
//         Rectangle { width: 20; height: 10 }
//         Rectangle { implicitHeight: 20; Layout.fillWidth: true; Layout.fillHeight: true }
//         Rectangle { width: 40; height: 30; Layout.alignment: Qt.AlignHCenter }
//         Rectangle { implicitWidth: 30; implicitHeight: 12; Layout.fillHeight: true; Layout.maximumHeight: 40; Layout.alignment: Qt.AlignRight }
//     }
//     ColumnLayout {
//         id: columnLoose; x: 430; spacing: 2
//         Rectangle { width: 20; height: 10 }
//         Rectangle { implicitWidth: 44; implicitHeight: 20; Layout.fillWidth: true }
//         Rectangle { Layout.preferredWidth: 30; Layout.preferredHeight: width / 2; Layout.fillWidth: true }
//     }
//     RowLayout {
//         id: uniform; y: 260; width: 200; uniformCellSizes: true
//         Rectangle { Layout.fillWidth: true; Layout.preferredWidth: 20; height: 10 }
//         Rectangle { Layout.fillWidth: true; Layout.preferredWidth: 50; height: 10 }
//         Rectangle { Layout.fillWidth: true; Layout.preferredWidth: 30; height: 10 }
//     }
//     RowLayout {
//         id: empty; y: 280
//     }
// }
import { $object } from "ljos-web/object";
import { Item, Rectangle } from "ljos-web/QtQuick";
import { ColumnLayout, Layout, RowLayout } from "ljos-web/QtQuick/Layouts";
import { make } from "../scene.js";

const names = [
  "root",
  "row",
  "capped",
  "hidden",
  "squeezed",
  "loose",
  "stretched",
  "mixed",
  "aligned",
  "mirrored",
  "column",
  "columnLoose",
  "half",
  "uniform",
  "empty",
];
export const objects = { attached: (item) => Layout.attached(item) };

const AlignRight = 0x2;
const AlignHCenter = 0x4;
const AlignTop = 0x20;
const AlignBottom = 0x40;
const AlignBaseline = 0x100;

const COLORS = ["#c33", "#3a3", "#36c", "#c93", "#939"];
let painted = 0;
// The colour is added to the props rather than the props spread: a binding
// is a getter, which spreading would read once.
function cell(props) {
  props.color = COLORS[painted++ % COLORS.length];
  return make(Rectangle, props);
}

export default function Layouts() {
  for (const name of names) objects[name] = $object();
  const { half } = objects;
  return make(Item, { $self: objects.root, width: 640, height: 480 }, () => [
    make(RowLayout, { $self: objects.row, width: 300, height: 40 }, () => [
      cell({ width: 20, height: 10 }),
      cell({ implicitWidth: 30, implicitHeight: 20, Layout$fillWidth: true }),
      cell({
        $self: objects.capped,
        Layout$preferredWidth: 40,
        Layout$preferredHeight: 15,
        Layout$fillWidth: true,
        Layout$maximumWidth: 60,
      }),
      cell({ $self: objects.hidden, width: 30, height: 25, visible: false }),
      cell({ Layout$preferredWidth: 25, Layout$fillHeight: true, Layout$minimumHeight: 5 }),
    ]),
    make(RowLayout, { $self: objects.squeezed, y: 50, width: 100, spacing: 4 }, () => [
      cell({ Layout$fillWidth: true, Layout$minimumWidth: 10, Layout$preferredWidth: 60, height: 10 }),
      cell({ Layout$fillWidth: true, Layout$minimumWidth: 20, Layout$preferredWidth: 80, height: 10 }),
      cell({ width: 20, height: 10 }),
    ]),
    make(RowLayout, { $self: objects.loose, y: 70 }, () => [
      cell({ width: 20, height: 10 }),
      cell({ implicitWidth: 30.5, implicitHeight: 20.2 }),
      cell({ Layout$preferredWidth: 15, Layout$preferredHeight: 5, Layout$margins: 3, Layout$leftMargin: 7 }),
    ]),
    make(RowLayout, { $self: objects.stretched, y: 110, width: 300, height: 20, spacing: 0 }, () => [
      cell({ Layout$fillWidth: true, Layout$preferredWidth: 30, Layout$horizontalStretchFactor: 1, height: 10 }),
      cell({ Layout$fillWidth: true, Layout$preferredWidth: 30, Layout$horizontalStretchFactor: 2, height: 10 }),
      cell({ Layout$fillWidth: true, Layout$preferredWidth: 30, Layout$horizontalStretchFactor: 3, height: 10 }),
    ]),
    make(RowLayout, { $self: objects.mixed, y: 135, width: 301, height: 20, spacing: 3 }, () => [
      cell({ Layout$fillWidth: true, Layout$preferredWidth: 10, height: 10 }),
      cell({ Layout$fillWidth: true, Layout$preferredWidth: 50, height: 10 }),
      cell({ Layout$fillWidth: true, Layout$preferredWidth: 20, Layout$maximumWidth: 30, height: 10 }),
    ]),
    make(RowLayout, { $self: objects.aligned, y: 160, width: 300, height: 60 }, () => [
      cell({ width: 20, height: 10, Layout$alignment: AlignTop }),
      cell({ width: 20, height: 10, Layout$alignment: AlignBottom }),
      cell({ height: 10, Layout$fillWidth: true, Layout$maximumWidth: 50, Layout$alignment: AlignRight }),
      cell({ height: 15, Layout$fillWidth: true, Layout$maximumWidth: 31, Layout$alignment: AlignHCenter | AlignBottom }),
      cell({ width: 20, height: 30, baselineOffset: 22, Layout$alignment: AlignBaseline }),
      cell({ width: 20, height: 16, baselineOffset: 4, Layout$alignment: AlignBaseline }),
    ]),
    make(RowLayout, { $self: objects.mirrored, y: 230, width: 200, layoutDirection: 1 }, () => [
      cell({ width: 20, height: 10, Layout$leftMargin: 4, Layout$rightMargin: 9 }),
      cell({ height: 20, Layout$fillWidth: true, Layout$maximumWidth: 40, Layout$alignment: 1 }),
      cell({ width: 30, height: 14, Layout$margins: 2 }),
    ]),
    make(ColumnLayout, { $self: objects.column, x: 320, width: 100, height: 200 }, () => [
      cell({ width: 20, height: 10 }),
      cell({ implicitHeight: 20, Layout$fillWidth: true, Layout$fillHeight: true }),
      cell({ width: 40, height: 30, Layout$alignment: AlignHCenter }),
      cell({
        implicitWidth: 30,
        implicitHeight: 12,
        Layout$fillHeight: true,
        Layout$maximumHeight: 40,
        Layout$alignment: AlignRight,
      }),
    ]),
    make(ColumnLayout, { $self: objects.columnLoose, x: 430, spacing: 2 }, () => [
      cell({ width: 20, height: 10 }),
      cell({ implicitWidth: 44, implicitHeight: 20, Layout$fillWidth: true }),
      cell({
        $self: half,
        Layout$preferredWidth: 30,
        get Layout$preferredHeight() {
          return half.width / 2;
        },
        Layout$fillWidth: true,
      }),
    ]),
    make(RowLayout, { $self: objects.uniform, y: 260, width: 200, uniformCellSizes: true }, () => [
      cell({ Layout$fillWidth: true, Layout$preferredWidth: 20, height: 10 }),
      cell({ Layout$fillWidth: true, Layout$preferredWidth: 50, height: 10 }),
      cell({ Layout$fillWidth: true, Layout$preferredWidth: 30, height: 10 }),
    ]),
    make(RowLayout, { $self: objects.empty, y: 280 }),
  ]);
}

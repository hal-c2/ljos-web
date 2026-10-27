// Paths that are not drawn, read by their points: what a PathView or a
// PathAnimation asks of one. The numbers the test compares them with are
// what Qt 6 says for the same paths.
//
// Item {
//     width: 300; height: 300
//     Path { id: lines; startX: 10; startY: 20; PathLine { x: 100; y: 20 } PathLine { x: 100; y: 120 } }
//     Path { id: unsaid; startX: 10; startY: 20; PathLine { x: 100 } PathLine { relativeY: 5 } PathLine { id: last } }
//     Path { id: arc; startX: 0; startY: 0; PathArc { x: 100; y: 0; radiusX: 50; radiusY: 50 } }
//     Path { id: lineArc; startX: 0; startY: 0; PathLine { x: 100; y: 0 }
//            PathArc { x: 100; y: 100; radiusX: 50; radiusY: 50 } }
//     Path { id: angleArc; PathAngleArc { centerX: 100; centerY: 100; radiusX: 50; radiusY: 50
//                                         startAngle: -240; sweepAngle: 330 } }
//     Path { id: joined; startX: 5; startY: 5; PathLine { x: 50; y: 5 }
//            PathAngleArc { centerX: 100; centerY: 100; radiusX: 50; radiusY: 50; startAngle: 0; sweepAngle: 90
//                           moveToStart: false }
//            PathLine { relativeX: 10; relativeY: 0 } }
//     Path { id: apart; startX: 5; startY: 5; PathLine { x: 50; y: 5 }
//            PathAngleArc { centerX: 100; centerY: 100; radiusX: 50; radiusY: 50; startAngle: 0; sweepAngle: 90 }
//            PathLine { relativeX: 10; relativeY: 0 } }
//     Path { id: quad; startX: 0; startY: 0; PathQuad { x: 100; y: 0; controlX: 50; controlY: 100 } }
//     Path { id: cubic; startX: 0; startY: 0
//            PathCubic { x: 100; y: 0; control1X: 0; control1Y: 100; control2X: 100; control2Y: 100 } }
//     Path { id: curve; startX: 0; startY: 0
//            PathCurve { x: 50; y: 50 } PathCurve { x: 100; y: 0 } PathCurve { x: 150; y: 50 } }
//     Path { id: moved; startX: 5; startY: 5; PathLine { x: 50; y: 5 } PathMove { x: 60; y: 60 }
//            PathLine { x: 70; y: 60 } }
//     Path { id: svg; startX: 5; startY: 5; PathSvg { path: "l 10 0 l 0 10 z" }
//            PathLine { relativeX: 10; relativeY: 0 } }
//     Path { id: polyline; startX: 5; startY: 5
//            PathPolyline { path: [Qt.point(10, 10), Qt.point(20, 10), Qt.point(20, 30)] }
//            PathLine { relativeX: 10; relativeY: 0 } }
//     Path { id: multiline; startX: 5; startY: 5
//            PathMultiline { paths: [[Qt.point(10, 10), Qt.point(20, 10)], [Qt.point(30, 30), Qt.point(40, 30)]] }
//            PathLine { relativeX: 10; relativeY: 0 } }
//     Path { id: rectangle; startX: 5; startY: 5; PathRectangle { x: 10; y: 10; width: 30; height: 20 }
//            PathLine { relativeX: 10; relativeY: 0 } }
//     Path { id: rounded; startX: 5; startY: 5; PathRectangle { x: 10; y: 10; width: 30; height: 20; radius: 5 } }
//     Path { id: scaled; scale: Qt.size(2, 0.5); startX: 10; startY: 20; PathLine { id: far; x: 110; y: 70 }
//            onChanged: log.push("changed") }
//     Path { id: round; startX: 10; startY: 10; PathLine { x: 50; y: 10 } PathLine { x: 10; y: 50 }
//            PathLine { x: 10; y: 10 } }
// }
import { $object } from "ljos-web/object";
import { Qt } from "ljos-web/QtQml";
import {
  Item,
  Path,
  PathAngleArc,
  PathArc,
  PathCubic,
  PathCurve,
  PathLine,
  PathMove,
  PathMultiline,
  PathPolyline,
  PathQuad,
  PathRectangle,
  PathSvg,
} from "ljos-web/QtQuick";
import { make } from "../scene.js";

const names = [
  "root",
  "lines",
  "unsaid",
  "last",
  "arc",
  "lineArc",
  "angleArc",
  "joined",
  "apart",
  "quad",
  "cubic",
  "curve",
  "moved",
  "svg",
  "polyline",
  "multiline",
  "rectangle",
  "rounded",
  "scaled",
  "far",
  "round",
];
export const objects = { log: [], PathLine, Qt };

export default function PathPoints() {
  for (const name of names) objects[name] = $object();
  const o = objects;
  const path = (self, props, children) => make(Path, { $self: self, ...props }, children);
  const corner = { centerX: 100, centerY: 100, radiusX: 50, radiusY: 50, startAngle: 0, sweepAngle: 90 };
  return make(Item, { $self: o.root, width: 300, height: 300 }, () => [
    path(o.lines, { startX: 10, startY: 20 }, () => [
      make(PathLine, { x: 100, y: 20 }),
      make(PathLine, { x: 100, y: 120 }),
    ]),
    path(o.unsaid, { startX: 10, startY: 20 }, () => [
      make(PathLine, { x: 100 }),
      make(PathLine, { relativeY: 5 }),
      make(PathLine, { $self: o.last }),
    ]),
    path(o.arc, { startX: 0, startY: 0 }, () => make(PathArc, { x: 100, y: 0, radiusX: 50, radiusY: 50 })),
    path(o.lineArc, { startX: 0, startY: 0 }, () => [
      make(PathLine, { x: 100, y: 0 }),
      make(PathArc, { x: 100, y: 100, radiusX: 50, radiusY: 50 }),
    ]),
    path(o.angleArc, {}, () => make(PathAngleArc, { ...corner, startAngle: -240, sweepAngle: 330 })),
    path(o.joined, { startX: 5, startY: 5 }, () => [
      make(PathLine, { x: 50, y: 5 }),
      make(PathAngleArc, { ...corner, moveToStart: false }),
      make(PathLine, { relativeX: 10, relativeY: 0 }),
    ]),
    path(o.apart, { startX: 5, startY: 5 }, () => [
      make(PathLine, { x: 50, y: 5 }),
      make(PathAngleArc, { ...corner }),
      make(PathLine, { relativeX: 10, relativeY: 0 }),
    ]),
    path(o.quad, { startX: 0, startY: 0 }, () => make(PathQuad, { x: 100, y: 0, controlX: 50, controlY: 100 })),
    path(o.cubic, { startX: 0, startY: 0 }, () =>
      make(PathCubic, { x: 100, y: 0, control1X: 0, control1Y: 100, control2X: 100, control2Y: 100 }),
    ),
    path(o.curve, { startX: 0, startY: 0 }, () => [
      make(PathCurve, { x: 50, y: 50 }),
      make(PathCurve, { x: 100, y: 0 }),
      make(PathCurve, { x: 150, y: 50 }),
    ]),
    path(o.moved, { startX: 5, startY: 5 }, () => [
      make(PathLine, { x: 50, y: 5 }),
      make(PathMove, { x: 60, y: 60 }),
      make(PathLine, { x: 70, y: 60 }),
    ]),
    path(o.svg, { startX: 5, startY: 5 }, () => [
      make(PathSvg, { path: "l 10 0 l 0 10 z" }),
      make(PathLine, { relativeX: 10, relativeY: 0 }),
    ]),
    path(o.polyline, { startX: 5, startY: 5 }, () => [
      make(PathPolyline, {
        get path() {
          return [Qt.point(10, 10), Qt.point(20, 10), Qt.point(20, 30)];
        },
      }),
      make(PathLine, { relativeX: 10, relativeY: 0 }),
    ]),
    path(o.multiline, { startX: 5, startY: 5 }, () => [
      make(PathMultiline, {
        get paths() {
          return [
            [Qt.point(10, 10), Qt.point(20, 10)],
            [Qt.point(30, 30), Qt.point(40, 30)],
          ];
        },
      }),
      make(PathLine, { relativeX: 10, relativeY: 0 }),
    ]),
    path(o.rectangle, { startX: 5, startY: 5 }, () => [
      make(PathRectangle, { x: 10, y: 10, width: 30, height: 20 }),
      make(PathLine, { relativeX: 10, relativeY: 0 }),
    ]),
    path(o.rounded, { startX: 5, startY: 5 }, () =>
      make(PathRectangle, { x: 10, y: 10, width: 30, height: 20, radius: 5 }),
    ),
    path(
      o.scaled,
      {
        get scale() {
          return Qt.size(2, 0.5);
        },
        startX: 10,
        startY: 20,
        onChanged: () => o.log.push("changed"),
      },
      () => make(PathLine, { $self: o.far, x: 110, y: 70 }),
    ),
    path(o.round, { startX: 10, startY: 10 }, () => [
      make(PathLine, { x: 50, y: 10 }),
      make(PathLine, { x: 10, y: 50 }),
      make(PathLine, { x: 10, y: 10 }),
    ]),
  ]);
}

// Item {
//     id: root; width: 400; height: 300
//     property real sweep: 90
//     Shape { id: line; ShapePath { id: linePath; startX: 10; startY: 20; PathLine { x: 110; y: 70 } } }
//     Shape { id: triangle; x: 150
//         ShapePath { id: trianglePath; strokeWidth: 10; strokeColor: "blue"; fillColor: "#80ff0000"
//                     joinStyle: ShapePath.MiterJoin; capStyle: ShapePath.RoundCap; startX: 10; startY: 20
//                     PathLine { x: 110; y: 20 } PathLine { x: 60; y: 70 } PathLine { x: 10; y: 20 } } }
//     Shape { id: dial; y: 100
//         ShapePath { id: dialPath; fillColor: "transparent"; strokeColor: "#2CDE85"; strokeWidth: 8
//                     PathAngleArc { centerX: 50; centerY: 50; radiusX: 40; radiusY: 40
//                                    startAngle: -242; sweepAngle: root.sweep + 140 } } }
//     Shape { id: dashed; x: 120; y: 100
//         ShapePath { id: dashedPath; strokeWidth: 4; strokeColor: "black"; capStyle: ShapePath.FlatCap
//                     strokeStyle: ShapePath.DashLine; dashPattern: [1, 3]; dashOffset: 2
//                     startX: 0; startY: 10; PathLine { x: 100; y: 10 } } }
//     Shape { id: holes; x: 250; y: 90
//         ShapePath { id: holesPath; strokeWidth: 0; fillColor: "orange"; fillRule: ShapePath.WindingFill
//                     PathSvg { path: "M 10 10 h 80 v 80 h -80 z M 30 30 h 40 v 40 h -40 z" } } }
//     Shape { id: fitted; y: 200; width: 200; height: 100; fillMode: Shape.PreserveAspectFit
//             horizontalAlignment: Shape.AlignHCenter; verticalAlignment: Shape.AlignVCenter
//         ShapePath { strokeWidth: 0; fillColor: "green"; startX: 10; startY: 10
//                     PathLine { x: 60; y: 10 } PathLine { x: 60; y: 60 } } }
//     Shape { id: shaded; x: 220; y: 200
//         ShapePath { id: linear; strokeWidth: 0
//             fillGradient: LinearGradient { id: linearFill; x1: 0; y1: 0; x2: 50; y2: 0
//                 GradientStop { position: 0; color: "red" } GradientStop { id: far; position: 1; color: "blue" } }
//             PathRectangle { width: 50; height: 50 } }
//         ShapePath { id: radial; strokeWidth: 0
//             fillGradient: RadialGradient { id: radialFill; centerX: 85; centerY: 25; centerRadius: 25
//                 focalX: 85; focalY: 25; spread: ShapeGradient.RepeatSpread
//                 GradientStop { position: 0; color: "white" } GradientStop { position: 1; color: "black" } }
//             PathRectangle { x: 60; width: 50; height: 50 } }
//         ShapePath { id: conical; strokeWidth: 0
//             fillGradient: ConicalGradient { id: conicalFill; centerX: 145; centerY: 25; angle: 0
//                 GradientStop { position: 0; color: "red" } GradientStop { position: 0.25; color: "lime" }
//                 GradientStop { position: 0.5; color: "blue" } GradientStop { position: 1; color: "black" } }
//             PathRectangle { x: 120; width: 50; height: 50; radius: 10 } }
//         Rectangle { id: inside; x: 172; width: 6; height: 10; color: "black" } }
//     Shape { id: empty }
// }
import { $object, $signal } from "ljos-web/object";
import { GradientStop, Item, PathAngleArc, PathLine, PathRectangle, PathSvg, Rectangle } from "ljos-web/QtQuick";
import { ConicalGradient, LinearGradient, RadialGradient, Shape, ShapePath } from "ljos-web/QtQuick/Shapes";
import { make } from "../scene.js";

const names = [
  "root",
  "line",
  "linePath",
  "triangle",
  "trianglePath",
  "dial",
  "dialPath",
  "dashed",
  "dashedPath",
  "holes",
  "holesPath",
  "fitted",
  "shaded",
  "linear",
  "linearFill",
  "far",
  "radial",
  "radialFill",
  "conical",
  "conicalFill",
  "inside",
  "empty",
];
export const objects = { Shape, ShapePath, LinearGradient };

export default function Shapes() {
  for (const name of names) objects[name] = $object();
  const o = objects;
  const [sweep, setSweep] = $signal(90);
  objects.setSweep = setSweep;
  return make(Item, { $self: o.root, width: 400, height: 300 }, () => [
    make(Shape, { $self: o.line }, () =>
      make(ShapePath, { $self: o.linePath, startX: 10, startY: 20 }, () => make(PathLine, { x: 110, y: 70 })),
    ),
    make(Shape, { $self: o.triangle, x: 150 }, () =>
      make(
        ShapePath,
        {
          $self: o.trianglePath,
          strokeWidth: 10,
          strokeColor: "blue",
          fillColor: "#80ff0000",
          joinStyle: ShapePath.MiterJoin,
          capStyle: ShapePath.RoundCap,
          startX: 10,
          startY: 20,
        },
        () => [make(PathLine, { x: 110, y: 20 }), make(PathLine, { x: 60, y: 70 }), make(PathLine, { x: 10, y: 20 })],
      ),
    ),
    make(Shape, { $self: o.dial, y: 100 }, () =>
      make(ShapePath, { $self: o.dialPath, fillColor: "transparent", strokeColor: "#2CDE85", strokeWidth: 8 }, () =>
        make(PathAngleArc, {
          centerX: 50,
          centerY: 50,
          radiusX: 40,
          radiusY: 40,
          startAngle: -242,
          get sweepAngle() {
            return sweep() + 140;
          },
        }),
      ),
    ),
    make(Shape, { $self: o.dashed, x: 120, y: 100 }, () =>
      make(
        ShapePath,
        {
          $self: o.dashedPath,
          strokeWidth: 4,
          strokeColor: "black",
          capStyle: ShapePath.FlatCap,
          strokeStyle: ShapePath.DashLine,
          get dashPattern() {
            return [1, 3];
          },
          dashOffset: 2,
          startX: 0,
          startY: 10,
        },
        () => make(PathLine, { x: 100, y: 10 }),
      ),
    ),
    make(Shape, { $self: o.holes, x: 250, y: 90 }, () =>
      make(
        ShapePath,
        { $self: o.holesPath, strokeWidth: 0, fillColor: "orange", fillRule: ShapePath.WindingFill },
        () => make(PathSvg, { path: "M 10 10 h 80 v 80 h -80 z M 30 30 h 40 v 40 h -40 z" }),
      ),
    ),
    make(
      Shape,
      {
        $self: o.fitted,
        y: 200,
        width: 200,
        height: 100,
        fillMode: Shape.PreserveAspectFit,
        horizontalAlignment: Shape.AlignHCenter,
        verticalAlignment: Shape.AlignVCenter,
      },
      () =>
        make(ShapePath, { strokeWidth: 0, fillColor: "green", startX: 10, startY: 10 }, () => [
          make(PathLine, { x: 60, y: 10 }),
          make(PathLine, { x: 60, y: 60 }),
        ]),
    ),
    make(Shape, { $self: o.shaded, x: 220, y: 200 }, () => [
      make(
        ShapePath,
        {
          $self: o.linear,
          strokeWidth: 0,
          get fillGradient() {
            return make(LinearGradient, { $self: o.linearFill, x1: 0, y1: 0, x2: 50, y2: 0 }, () => [
              make(GradientStop, { position: 0, color: "red" }),
              make(GradientStop, { $self: o.far, position: 1, color: "blue" }),
            ]);
          },
        },
        () => make(PathRectangle, { width: 50, height: 50 }),
      ),
      make(
        ShapePath,
        {
          $self: o.radial,
          strokeWidth: 0,
          get fillGradient() {
            return make(
              RadialGradient,
              {
                $self: o.radialFill,
                centerX: 85,
                centerY: 25,
                centerRadius: 25,
                focalX: 85,
                focalY: 25,
                spread: RadialGradient.RepeatSpread,
              },
              () => [
                make(GradientStop, { position: 0, color: "white" }),
                make(GradientStop, { position: 1, color: "black" }),
              ],
            );
          },
        },
        () => make(PathRectangle, { x: 60, width: 50, height: 50 }),
      ),
      make(
        ShapePath,
        {
          $self: o.conical,
          strokeWidth: 0,
          get fillGradient() {
            return make(ConicalGradient, { $self: o.conicalFill, centerX: 145, centerY: 25, angle: 0 }, () => [
              make(GradientStop, { position: 0, color: "red" }),
              make(GradientStop, { position: 0.25, color: "lime" }),
              make(GradientStop, { position: 0.5, color: "blue" }),
              make(GradientStop, { position: 1, color: "black" }),
            ]);
          },
        },
        () => make(PathRectangle, { x: 120, width: 50, height: 50, radius: 10 }),
      ),
      make(Rectangle, { $self: o.inside, x: 172, width: 6, height: 10, color: "black" }),
    ]),
    make(Shape, { $self: o.empty }),
  ]);
}

// Item {
//     id: root; width: 400; height: 300
//     function r(v) { return Math.round(v * 1000) / 1000 }
//     function pt(p) { return r(p.x) + "," + r(p.y) }
//     Rectangle {
//         id: pinched; x: 100; y: 100; width: 100; height: 100; color: "teal"
//         PinchHandler {
//             id: pinch; minimumScale: 0.5; maximumScale: 1.2
//             onActiveChanged: log.push(`active ${active} c=${pt(centroid.position)}`)
//             onScaleChanged: (delta) => log.push(`scale ${r(scale)} d=${r(delta)} as=${r(activeScale)} ps=${r(persistentScale)}`)
//             onRotationChanged: (delta) => log.push(`rot ${r(rotation)} d=${r(delta)}`)
//             onTranslationChanged: (delta) => log.push(`tr ${pt(translation)} d=${pt(delta)}`)
//             onUpdated: log.push("updated")
//             onCentroidChanged: log.push(`c ${pt(centroid.scenePosition)}`)
//             onGrabChanged: (transition, point) => log.push(`grab ${transition}`)
//         }
//     }
//     PinchArea {
//         id: area; x: 250; width: 150; height: 150
//         pinch.target: areaTarget; pinch.minimumScale: 0.5; pinch.maximumScale: 3; pinch.dragAxis: Pinch.XAndYAxis
//         pinch.minimumRotation: -90; pinch.maximumRotation: 90
//         onPinchStarted: (pinch) => log.push(`started s=${r(pinch.scale)} c=${pt(pinch.center)} a=${r(pinch.angle)} acc=${pinch.accepted} n=${pinch.pointCount} act=${area.pinch.active}`)
//         onPinchUpdated: (pinch) => log.push(`updated s=${r(pinch.scale)} ps=${r(pinch.previousScale)} c=${pt(pinch.center)} pc=${pt(pinch.previousCenter)} sc=${pt(pinch.startCenter)} a=${r(pinch.angle)} pa=${r(pinch.previousAngle)} rot=${r(pinch.rotation)} p1=${pt(pinch.point1)} p2=${pt(pinch.point2)} sp1=${pt(pinch.startPoint1)} n=${pinch.pointCount}`)
//         onPinchFinished: (pinch) => log.push(`finished s=${r(pinch.scale)} c=${pt(pinch.center)} n=${pinch.pointCount} act=${area.pinch.active}`)
//         Rectangle { id: areaTarget; width: 50; height: 50; color: "tomato" }
//         MouseArea {
//             id: inArea; y: 100; width: 150; height: 50
//             onPressed: log.push("inArea pressed"); onCanceled: log.push("inArea canceled")
//             onReleased: log.push("inArea released"); onClicked: log.push("inArea clicked")
//         }
//     }
//     Rectangle {
//         id: wheeled; width: 80; height: 80; color: "gold"
//         WheelHandler { id: wr; property: "rotation"; onWheel: (event) => log.push(`wr ${event.angleDelta.y}`) }
//     }
//     Rectangle {
//         id: scaled; y: 100; width: 80; height: 80; color: "khaki"
//         WheelHandler { id: ws; property: "scale" }
//     }
//     Rectangle {
//         id: slid; y: 200; width: 80; height: 80; color: "plum"
//         WheelHandler { id: wx; property: "x"; rotationScale: 0.5; onActiveChanged: log.push(`wx active ${active}`) }
//     }
//     Rectangle {
//         id: tapped; x: 100; y: 220; width: 60; height: 60; color: "navy"
//         TapHandler {
//             id: tt
//             onTapped: (point, button) => log.push(`tt tapped b=${button} pos=${pt(point.position)} count=${tapCount}`)
//             onPressedChanged: log.push(`tt pressed ${pressed}`)
//             onCanceled: log.push("tt canceled")
//             onGrabChanged: (transition, point) => log.push(`tt grab ${transition}`)
//         }
//     }
//     Rectangle {
//         id: tdrag; x: 180; y: 220; width: 60; height: 60; color: "olive"
//         DragHandler {
//             id: td
//             onActiveChanged: log.push(`td active ${active}`)
//             onGrabChanged: (transition, point) => log.push(`td grab ${transition}`)
//         }
//     }
//     Rectangle {
//         id: op; x: 250; y: 200; width: 80; height: 80; opacity: 0.5; color: "gray"
//         WheelHandler {
//             id: wo; property: "opacity"; rotationScale: 0.01; orientation: Qt.Horizontal
//             acceptedModifiers: Qt.AltModifier; blocking: false
//         }
//         WheelHandler {
//             id: wo2
//             onWheel: (event) => log.push(`wo2 ${event.angleDelta.x} ${event.angleDelta.y} ${event.x} ${event.y} ${event.modifiers}`)
//         }
//     }
// }
import { $object } from "ljos-web/object";
import {
  clock,
  DragHandler,
  Item,
  MouseArea,
  Pinch,
  PinchArea,
  PinchHandler,
  Rectangle,
  TapHandler,
  WheelHandler,
} from "ljos-web/QtQuick";
import { make } from "../scene.js";

const names = ["root", "pinched", "pinch", "area", "areaTarget", "inArea", "wheeled", "wr", "scaled", "ws", "slid", "wx"];
const more = ["tapped", "tt", "tdrag", "td", "op", "wo", "wo2"];

export const objects = { log: [], clock };

const r = (v) => Math.round(v * 1000) / 1000;
const pt = (p) => `${r(p.x)},${r(p.y)}`;

export default function HandlersTouch() {
  clock.stop();
  for (const name of [...names, ...more]) objects[name] = $object();
  const { log, root, pinched, pinch, area, areaTarget, inArea, wheeled, wr, scaled, ws, slid, wx } = objects;
  const { tapped, tt, tdrag, td, op, wo, wo2 } = objects;

  return make(Item, { $self: root, width: 400, height: 300 }, () => [
    make(Rectangle, { $self: pinched, x: 100, y: 100, width: 100, height: 100, color: "teal" }, () => [
      make(PinchHandler, {
        $self: pinch,
        minimumScale: 0.5,
        maximumScale: 1.2,
        onActiveChanged: () => log.push(`active ${pinch.active} c=${pt(pinch.centroid.position)}`),
        onScaleChanged: (delta) =>
          log.push(
            `scale ${r(pinch.scale)} d=${r(delta)} as=${r(pinch.activeScale)} ps=${r(pinch.persistentScale)}`,
          ),
        onRotationChanged: (delta) => log.push(`rot ${r(pinch.rotation)} d=${r(delta)}`),
        onTranslationChanged: (delta) => log.push(`tr ${pt(pinch.translation)} d=${pt(delta)}`),
        onUpdated: () => log.push("updated"),
        onCentroidChanged: () => log.push(`c ${pt(pinch.centroid.scenePosition)}`),
        onGrabChanged: (transition, point) => log.push(`grab ${transition}`),
      }),
    ]),
    make(
      PinchArea,
      {
        $self: area,
        x: 250,
        width: 150,
        height: 150,
        get pinch$target() {
          return areaTarget;
        },
        pinch$minimumScale: 0.5,
        pinch$maximumScale: 3,
        get pinch$dragAxis() {
          return Pinch.XAndYAxis;
        },
        pinch$minimumRotation: -90,
        pinch$maximumRotation: 90,
        onPinchStarted: (pinch) =>
          log.push(
            `started s=${r(pinch.scale)} c=${pt(pinch.center)} a=${r(pinch.angle)} acc=${pinch.accepted} n=${pinch.pointCount} act=${area.pinch.active}`,
          ),
        onPinchUpdated: (pinch) =>
          log.push(
            `updated s=${r(pinch.scale)} ps=${r(pinch.previousScale)} c=${pt(pinch.center)} pc=${pt(pinch.previousCenter)} sc=${pt(pinch.startCenter)} a=${r(pinch.angle)} pa=${r(pinch.previousAngle)} rot=${r(pinch.rotation)} p1=${pt(pinch.point1)} p2=${pt(pinch.point2)} sp1=${pt(pinch.startPoint1)} n=${pinch.pointCount}`,
          ),
        onPinchFinished: (pinch) =>
          log.push(
            `finished s=${r(pinch.scale)} c=${pt(pinch.center)} n=${pinch.pointCount} act=${area.pinch.active}`,
          ),
      },
      () => [
        make(Rectangle, { $self: areaTarget, width: 50, height: 50, color: "tomato" }),
        make(MouseArea, {
          $self: inArea,
          y: 100,
          width: 150,
          height: 50,
          onPressed: (mouse) => log.push("inArea pressed"),
          onCanceled: () => log.push("inArea canceled"),
          onReleased: (mouse) => log.push("inArea released"),
          onClicked: (mouse) => log.push("inArea clicked"),
        }),
      ],
    ),
    make(Rectangle, { $self: wheeled, width: 80, height: 80, color: "gold" }, () => [
      make(WheelHandler, { $self: wr, property: "rotation", onWheel: (event) => log.push(`wr ${event.angleDelta.y}`) }),
    ]),
    make(Rectangle, { $self: scaled, y: 100, width: 80, height: 80, color: "khaki" }, () => [
      make(WheelHandler, { $self: ws, property: "scale" }),
    ]),
    make(Rectangle, { $self: slid, y: 200, width: 80, height: 80, color: "plum" }, () => [
      make(WheelHandler, {
        $self: wx,
        property: "x",
        rotationScale: 0.5,
        onActiveChanged: () => log.push(`wx active ${wx.active}`),
      }),
    ]),
    make(Rectangle, { $self: tapped, x: 100, y: 220, width: 60, height: 60, color: "navy" }, () => [
      make(TapHandler, {
        $self: tt,
        onTapped: (point, button) => log.push(`tt tapped b=${button} pos=${pt(point.position)} count=${tt.tapCount}`),
        onPressedChanged: () => log.push(`tt pressed ${tt.pressed}`),
        onCanceled: () => log.push("tt canceled"),
        onGrabChanged: (transition, point) => log.push(`tt grab ${transition}`),
      }),
    ]),
    make(Rectangle, { $self: tdrag, x: 180, y: 220, width: 60, height: 60, color: "olive" }, () => [
      make(DragHandler, {
        $self: td,
        onActiveChanged: () => log.push(`td active ${td.active}`),
        onGrabChanged: (transition, point) => log.push(`td grab ${transition}`),
      }),
    ]),
    make(Rectangle, { $self: op, x: 250, y: 200, width: 80, height: 80, opacity: 0.5, color: "gray" }, () => [
      make(WheelHandler, {
        $self: wo,
        property: "opacity",
        rotationScale: 0.01,
        orientation: 1,
        acceptedModifiers: 0x08000000,
        blocking: false,
      }),
      make(WheelHandler, {
        $self: wo2,
        onWheel: (event) =>
          log.push(`wo2 ${event.angleDelta.x} ${event.angleDelta.y} ${event.x} ${event.y} ${event.modifiers}`),
      }),
    ]),
  ]);
}

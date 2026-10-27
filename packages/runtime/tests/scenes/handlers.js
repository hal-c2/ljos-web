// Item {
//     id: root; width: 400; height: 300
//     Rectangle {
//         id: tapItem; width: 100; height: 100; color: "tomato"
//         TapHandler {
//             id: tap
//             onTapped: (eventPoint, button) => log.push(`tapped b=${button} pos=${eventPoint.position.x},${eventPoint.position.y} count=${tapCount} pressed=${pressed}`)
//             onSingleTapped: (eventPoint, button) => log.push("singleTapped")
//             onDoubleTapped: (eventPoint, button) => log.push("doubleTapped")
//             onLongPressed: log.push("longPressed")
//             onPressedChanged: log.push(`pressedChanged ${pressed} point=${point.position.x},${point.position.y} pb=${point.pressedButtons}`)
//             onTapCountChanged: log.push(`tapCount ${tapCount}`)
//             onCanceled: log.push("canceled")
//             onGrabChanged: (transition, point) => log.push(`grab ${transition}`)
//             onPointChanged: log.push(`point ${point.position.x},${point.position.y}`)
//         }
//     }
//     Rectangle {
//         id: policyItem; x: 100; width: 100; height: 100; color: "gold"
//         TapHandler {
//             id: within; gesturePolicy: TapHandler.WithinBounds
//             onTapped: log.push("within tapped")
//             onPressedChanged: log.push(`within pressed ${pressed}`)
//             onCanceled: log.push("within canceled")
//         }
//     }
//     Rectangle {
//         id: releaseItem; x: 200; width: 100; height: 100; color: "khaki"
//         TapHandler {
//             id: releaseWithin; gesturePolicy: TapHandler.ReleaseWithinBounds
//             onTapped: log.push("rwb tapped")
//             onPressedChanged: log.push(`rwb pressed ${pressed}`)
//             onCanceled: log.push("rwb canceled")
//         }
//     }
//     Rectangle {
//         id: rightItem; x: 300; width: 100; height: 100; color: "plum"
//         TapHandler { acceptedButtons: Qt.RightButton; onTapped: (point, button) => log.push(`right tapped b=${button}`) }
//         TapHandler {
//             acceptedButtons: Qt.LeftButton; acceptedModifiers: Qt.ControlModifier
//             onTapped: log.push("ctrl tapped")
//         }
//     }
//     Rectangle {
//         id: outer; y: 100; width: 100; height: 100; color: "teal"
//         TapHandler { onTapped: log.push("outer tapped"); onPressedChanged: log.push(`outer pressed ${pressed}`) }
//         Rectangle {
//             id: inner; x: 25; y: 25; width: 50; height: 50; color: "aqua"
//             TapHandler { onTapped: log.push("inner tapped"); onPressedChanged: log.push(`inner pressed ${pressed}`) }
//         }
//     }
//     MouseArea {
//         id: ma; x: 100; y: 100; width: 100; height: 100
//         onPressed: log.push("ma pressed"); onClicked: log.push("ma clicked")
//         Rectangle {
//             id: inMa; anchors.fill: parent; color: "olive"
//             TapHandler { onTapped: log.push("tap in ma tapped") }
//         }
//     }
//     Rectangle {
//         id: tapParent; x: 200; y: 100; width: 100; height: 100; color: "silver"
//         TapHandler { onTapped: log.push("parent tap tapped") }
//         MouseArea { id: maChild; anchors.fill: parent; onClicked: log.push("child ma clicked") }
//     }
//     Rectangle {
//         id: dragItem; y: 200; width: 50; height: 50; color: "navy"
//         DragHandler {
//             id: drag
//             onActiveChanged: log.push(`active ${active} tr=${translation.x},${translation.y} c=${centroid.position.x},${centroid.position.y}`)
//             onTranslationChanged: (delta) => log.push(`tr ${translation.x},${translation.y} d=${delta.x},${delta.y} x=${dragItem.x}`)
//             xAxis.onActiveValueChanged: (delta) => log.push(`xAxis ${xAxis.activeValue} d=${delta}`)
//             onCentroidChanged: log.push(`centroid ${centroid.position.x},${centroid.position.y} sp=${centroid.scenePosition.x} pp=${centroid.pressPosition.x} pb=${centroid.pressedButtons}`)
//         }
//         TapHandler { onTapped: log.push("drag tap tapped"); onCanceled: log.push("drag tap canceled") }
//     }
//     Rectangle {
//         id: limited; x: 100; y: 200; width: 50; height: 50; color: "maroon"
//         DragHandler { id: lim; yAxis.enabled: false; xAxis.minimum: 90; xAxis.maximum: 150 }
//     }
//     Rectangle {
//         id: nullTarget; x: 200; y: 200; width: 50; height: 50; color: "gray"
//         DragHandler {
//             id: nt; target: null
//             onTranslationChanged: (delta) => log.push(`nt tr ${translation.x} d=${delta.x}`)
//             xAxis.onActiveValueChanged: log.push(`nt xAxis ${xAxis.activeValue}`)
//         }
//     }
//     Rectangle {
//         id: hoverItem; x: 300; y: 200; width: 100; height: 100; color: "pink"
//         HoverHandler {
//             id: hh; cursorShape: Qt.PointingHandCursor
//             onHoveredChanged: log.push(`hovered ${hovered} ${point.position.x},${point.position.y}`)
//             onPointChanged: log.push(`hp ${point.position.x}`)
//         }
//         Rectangle {
//             x: 50; width: 50; height: 50; color: "purple"
//             HoverHandler { id: hh2; onHoveredChanged: log.push(`child hovered ${hovered}`) }
//         }
//         WheelHandler {
//             id: wh
//             onWheel: (event) => log.push(`wheel ${event.angleDelta.y} x=${event.x} rot=${rotation} acc=${event.accepted} hr=${hoverItem.rotation}`)
//             onActiveChanged: log.push(`wheel active ${active}`)
//         }
//     }
// }
import { $object } from "ljos-web/object";
import {
  clock,
  DragHandler,
  HoverHandler,
  Item,
  MouseArea,
  Rectangle,
  TapHandler,
  WheelHandler,
} from "ljos-web/QtQuick";
import { make } from "../scene.js";

const names = [
  "root",
  "tapItem",
  "tap",
  "policyItem",
  "within",
  "releaseItem",
  "releaseWithin",
  "rightItem",
  "outer",
  "inner",
  "ma",
  "inMa",
  "tapParent",
  "maChild",
  "dragItem",
  "drag",
  "limited",
  "lim",
  "nullTarget",
  "nt",
  "hoverItem",
  "hh",
  "hh2",
  "wh",
];

export const objects = { log: [], clock };

export default function Handlers() {
  clock.stop();
  for (const name of names) objects[name] = $object();
  const { log, root, tap, within, releaseWithin, ma, inMa, tapParent, maChild, dragItem, drag, lim, nt, hoverItem } = objects;
  const { hh, hh2, wh } = objects;
  const at = (point) => `${point.position.x},${point.position.y}`;

  return make(Item, { $self: root, width: 400, height: 300 }, () => [
    make(Rectangle, { $self: objects.tapItem, width: 100, height: 100, color: "tomato" }, () => [
      make(TapHandler, {
        $self: tap,
        onTapped: (eventPoint, button) =>
          log.push(`tapped b=${button} pos=${at(eventPoint)} count=${tap.tapCount} pressed=${tap.pressed}`),
        onSingleTapped: (eventPoint, button) => log.push("singleTapped"),
        onDoubleTapped: (eventPoint, button) => log.push("doubleTapped"),
        onLongPressed: () => log.push("longPressed"),
        onPressedChanged: () =>
          log.push(`pressedChanged ${tap.pressed} point=${at(tap.point)} pb=${tap.point.pressedButtons}`),
        onTapCountChanged: () => log.push(`tapCount ${tap.tapCount}`),
        onCanceled: () => log.push("canceled"),
        onGrabChanged: (transition, point) => log.push(`grab ${transition}`),
        onPointChanged: () => log.push(`point ${at(tap.point)}`),
      }),
    ]),
    make(Rectangle, { $self: objects.policyItem, x: 100, width: 100, height: 100, color: "gold" }, () => [
      make(TapHandler, {
        $self: within,
        get gesturePolicy() {
          return TapHandler.WithinBounds;
        },
        onTapped: () => log.push("within tapped"),
        onPressedChanged: () => log.push(`within pressed ${within.pressed}`),
        onCanceled: () => log.push("within canceled"),
      }),
    ]),
    make(Rectangle, { $self: objects.releaseItem, x: 200, width: 100, height: 100, color: "khaki" }, () => [
      make(TapHandler, {
        $self: releaseWithin,
        get gesturePolicy() {
          return TapHandler.ReleaseWithinBounds;
        },
        onTapped: () => log.push("rwb tapped"),
        onPressedChanged: () => log.push(`rwb pressed ${releaseWithin.pressed}`),
        onCanceled: () => log.push("rwb canceled"),
      }),
    ]),
    make(Rectangle, { $self: objects.rightItem, x: 300, width: 100, height: 100, color: "plum" }, () => [
      make(TapHandler, { acceptedButtons: 2, onTapped: (point, button) => log.push(`right tapped b=${button}`) }),
      make(TapHandler, { acceptedButtons: 1, acceptedModifiers: 0x04000000, onTapped: () => log.push("ctrl tapped") }),
    ]),
    make(Rectangle, { $self: objects.outer, y: 100, width: 100, height: 100, color: "teal" }, () => {
      const handler = $object();
      const innerHandler = $object();
      return [
        make(TapHandler, {
          $self: handler,
          onTapped: () => log.push("outer tapped"),
          onPressedChanged: () => log.push(`outer pressed ${handler.pressed}`),
        }),
        make(Rectangle, { $self: objects.inner, x: 25, y: 25, width: 50, height: 50, color: "aqua" }, () => [
          make(TapHandler, {
            $self: innerHandler,
            onTapped: () => log.push("inner tapped"),
            onPressedChanged: () => log.push(`inner pressed ${innerHandler.pressed}`),
          }),
        ]),
      ];
    }),
    make(
      MouseArea,
      {
        $self: ma,
        x: 100,
        y: 100,
        width: 100,
        height: 100,
        onPressed: (mouse) => log.push("ma pressed"),
        onClicked: (mouse) => log.push("ma clicked"),
      },
      () => [
        make(
          Rectangle,
          {
            $self: inMa,
            get anchors$fill() {
              return inMa.parent;
            },
            color: "olive",
          },
          () => [make(TapHandler, { onTapped: () => log.push("tap in ma tapped") })],
        ),
      ],
    ),
    make(Rectangle, { $self: tapParent, x: 200, y: 100, width: 100, height: 100, color: "silver" }, () => [
      make(TapHandler, { onTapped: () => log.push("parent tap tapped") }),
      make(MouseArea, {
        $self: maChild,
        get anchors$fill() {
          return maChild.parent;
        },
        onClicked: (mouse) => log.push("child ma clicked"),
      }),
    ]),
    make(Rectangle, { $self: dragItem, y: 200, width: 50, height: 50, color: "navy" }, () => [
      make(DragHandler, {
        $self: drag,
        onActiveChanged: () =>
          log.push(`active ${drag.active} tr=${drag.translation.x},${drag.translation.y} c=${at(drag.centroid)}`),
        onTranslationChanged: (delta) =>
          log.push(`tr ${drag.translation.x},${drag.translation.y} d=${delta.x},${delta.y} x=${dragItem.x}`),
        xAxis$onActiveValueChanged: (delta) => log.push(`xAxis ${drag.xAxis.activeValue} d=${delta}`),
        onCentroidChanged: () =>
          log.push(
            `centroid ${at(drag.centroid)} sp=${drag.centroid.scenePosition.x} pp=${drag.centroid.pressPosition.x} pb=${drag.centroid.pressedButtons}`,
          ),
      }),
      make(TapHandler, {
        onTapped: () => log.push("drag tap tapped"),
        onCanceled: () => log.push("drag tap canceled"),
      }),
    ]),
    make(Rectangle, { $self: objects.limited, x: 100, y: 200, width: 50, height: 50, color: "maroon" }, () => [
      make(DragHandler, { $self: lim, yAxis$enabled: false, xAxis$minimum: 90, xAxis$maximum: 150 }),
    ]),
    make(Rectangle, { $self: objects.nullTarget, x: 200, y: 200, width: 50, height: 50, color: "gray" }, () => [
      make(DragHandler, {
        $self: nt,
        target: null,
        onTranslationChanged: (delta) => log.push(`nt tr ${nt.translation.x} d=${delta.x}`),
        get xAxis$onActiveValueChanged() {
          return log.push(`nt xAxis ${nt.xAxis.activeValue}`);
        },
      }),
    ]),
    make(Rectangle, { $self: hoverItem, x: 300, y: 200, width: 100, height: 100, color: "pink" }, () => [
      make(HoverHandler, {
        $self: hh,
        cursorShape: 13,
        onHoveredChanged: () => log.push(`hovered ${hh.hovered} ${at(hh.point)}`),
        onPointChanged: () => log.push(`hp ${hh.point.position.x}`),
      }),
      make(Rectangle, { x: 50, width: 50, height: 50, color: "purple" }, () => [
        make(HoverHandler, { $self: hh2, onHoveredChanged: () => log.push(`child hovered ${hh2.hovered}`) }),
      ]),
      make(WheelHandler, {
        $self: wh,
        onWheel: (event) =>
          log.push(
            `wheel ${event.angleDelta.y} x=${event.x} rot=${wh.rotation} acc=${event.accepted} hr=${hoverItem.rotation}`,
          ),
        onActiveChanged: () => log.push(`wheel active ${wh.active}`),
      }),
    ]),
  ]);
}

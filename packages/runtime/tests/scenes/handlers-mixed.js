// Item {
//     id: root; width: 400; height: 300
//     Rectangle {
//         id: dh; x: 100; width: 80; height: 80; color: "navy"
//         DragHandler { id: dhh; onActiveChanged: log.push(`dh active ${active}`) }
//         MouseArea {
//             anchors.fill: parent
//             onPressed: log.push("dhma pressed")
//             onReleased: log.push("dhma released")
//             onCanceled: log.push("dhma canceled")
//             onClicked: log.push("dhma clicked")
//             onPositionChanged: log.push("dhma pos")
//         }
//     }
//     Rectangle {
//         id: ex; x: 200; width: 80; height: 80; color: "teal"
//         TapHandler { onTapped: log.push("exouter tapped"); onPressedChanged: log.push(`exouter pressed ${pressed}`) }
//         Rectangle {
//             id: exin; width: 40; height: 40; color: "aqua"
//             TapHandler {
//                 gesturePolicy: TapHandler.WithinBounds
//                 onTapped: log.push("exinner tapped")
//                 onGrabChanged: (transition, point) => log.push(`exinner grab ${transition}`)
//             }
//         }
//     }
//     MouseArea {
//         id: both; x: 300; width: 80; height: 80
//         onClicked: log.push("both clicked"); onPressed: log.push("both pressed")
//         TapHandler { onTapped: log.push("both tapped") }
//     }
//     Rectangle {
//         id: hv; y: 100; width: 80; height: 80; color: "gold"
//         HoverHandler { onHoveredChanged: log.push(`hv hovered ${hovered}`) }
//         MouseArea {
//             id: hvma; anchors.fill: parent; hoverEnabled: true
//             onEntered: log.push("hvma entered"); onExited: log.push("hvma exited")
//         }
//     }
//     Rectangle {
//         id: hv2; x: 40; y: 100; width: 80; height: 80; z: -1; color: "khaki"
//         HoverHandler { onHoveredChanged: log.push(`hv2 hovered ${hovered}`) }
//     }
//     Rectangle {
//         id: two; x: 200; y: 100; width: 80; height: 80; color: "plum"
//         TapHandler { onPressedChanged: log.push(`first-declared pressed ${pressed}`) }
//         TapHandler { onPressedChanged: log.push(`second-declared pressed ${pressed}`) }
//     }
//     Rectangle {
//         id: late; x: 300; y: 100; width: 80; height: 80; color: "silver"
//         TapHandler {
//             id: lateTap; exclusiveSignals: TapHandler.SingleTap | TapHandler.DoubleTap
//             onTapped: log.push(`late tapped ${tapCount}`)
//             onSingleTapped: (eventPoint, button) => log.push(`late single ${eventPoint.position.x}`)
//             onDoubleTapped: log.push("late double")
//         }
//     }
//     Rectangle {
//         id: off; y: 200; width: 80; height: 80; color: "gray"
//         TapHandler { id: offTap; enabled: false; onTapped: log.push("off tapped") }
//         HoverHandler { id: offHover; enabled: false; onHoveredChanged: log.push(`off hovered ${hovered}`) }
//     }
//     Rectangle {
//         id: mouseOnly; x: 100; y: 200; width: 80; height: 80; color: "olive"
//         TapHandler { acceptedDevices: PointerDevice.Mouse; onTapped: log.push("mouse tapped") }
//         TapHandler { acceptedDevices: PointerDevice.TouchScreen; onTapped: (point, button) => log.push(`finger tapped b=${button}`) }
//     }
// }
import { $object } from "ljos-web/object";
import {
  clock,
  DragHandler,
  HoverHandler,
  Item,
  MouseArea,
  PointerDevice,
  Rectangle,
  TapHandler,
} from "ljos-web/QtQuick";
import { make } from "../scene.js";

const names = ["root", "dh", "dhh", "dhma", "ex", "exin", "both", "hv", "hvma", "hv2", "two", "late", "lateTap"];
const more = ["off", "offTap", "offHover", "mouseOnly"];

export const objects = { log: [], clock };

export default function HandlersMixed() {
  clock.stop();
  for (const name of [...names, ...more]) objects[name] = $object();
  const { log, root, dh, dhh, dhma, ex, exin, both, hv, hvma, hv2, two, late, lateTap, off, offTap, offHover } = objects;

  return make(Item, { $self: root, width: 400, height: 300 }, () => [
    make(Rectangle, { $self: dh, x: 100, width: 80, height: 80, color: "navy" }, () => [
      make(DragHandler, { $self: dhh, onActiveChanged: () => log.push(`dh active ${dhh.active}`) }),
      make(MouseArea, {
        $self: dhma,
        get anchors$fill() {
          return dhma.parent;
        },
        onPressed: (mouse) => log.push("dhma pressed"),
        onReleased: (mouse) => log.push("dhma released"),
        onCanceled: () => log.push("dhma canceled"),
        onClicked: (mouse) => log.push("dhma clicked"),
        onPositionChanged: (mouse) => log.push("dhma pos"),
      }),
    ]),
    make(Rectangle, { $self: ex, x: 200, width: 80, height: 80, color: "teal" }, () => {
      const outer = $object();
      return [
        make(TapHandler, {
          $self: outer,
          onTapped: () => log.push("exouter tapped"),
          onPressedChanged: () => log.push(`exouter pressed ${outer.pressed}`),
        }),
        make(Rectangle, { $self: exin, width: 40, height: 40, color: "aqua" }, () => [
          make(TapHandler, {
            get gesturePolicy() {
              return TapHandler.WithinBounds;
            },
            onTapped: () => log.push("exinner tapped"),
            onGrabChanged: (transition, point) => log.push(`exinner grab ${transition}`),
          }),
        ]),
      ];
    }),
    make(
      MouseArea,
      {
        $self: both,
        x: 300,
        width: 80,
        height: 80,
        onClicked: (mouse) => log.push("both clicked"),
        onPressed: (mouse) => log.push("both pressed"),
      },
      () => [make(TapHandler, { onTapped: () => log.push("both tapped") })],
    ),
    make(Rectangle, { $self: hv, y: 100, width: 80, height: 80, color: "gold" }, () => {
      const handler = $object();
      return [
        make(HoverHandler, { $self: handler, onHoveredChanged: () => log.push(`hv hovered ${handler.hovered}`) }),
        make(MouseArea, {
          $self: hvma,
          get anchors$fill() {
            return hvma.parent;
          },
          hoverEnabled: true,
          onEntered: () => log.push("hvma entered"),
          onExited: () => log.push("hvma exited"),
        }),
      ];
    }),
    make(Rectangle, { $self: hv2, x: 40, y: 100, width: 80, height: 80, z: -1, color: "khaki" }, () => {
      const handler = $object();
      return [make(HoverHandler, { $self: handler, onHoveredChanged: () => log.push(`hv2 hovered ${handler.hovered}`) })];
    }),
    make(Rectangle, { $self: two, x: 200, y: 100, width: 80, height: 80, color: "plum" }, () => {
      const first = $object();
      const second = $object();
      return [
        make(TapHandler, { $self: first, onPressedChanged: () => log.push(`first-declared pressed ${first.pressed}`) }),
        make(TapHandler, {
          $self: second,
          onPressedChanged: () => log.push(`second-declared pressed ${second.pressed}`),
        }),
      ];
    }),
    make(Rectangle, { $self: late, x: 300, y: 100, width: 80, height: 80, color: "silver" }, () => [
      make(TapHandler, {
        $self: lateTap,
        get exclusiveSignals() {
          return TapHandler.SingleTap | TapHandler.DoubleTap;
        },
        onTapped: () => log.push(`late tapped ${lateTap.tapCount}`),
        onSingleTapped: (eventPoint, button) => log.push(`late single ${eventPoint.position.x}`),
        onDoubleTapped: () => log.push("late double"),
      }),
    ]),
    make(Rectangle, { $self: off, y: 200, width: 80, height: 80, color: "gray" }, () => [
      make(TapHandler, { $self: offTap, enabled: false, onTapped: () => log.push("off tapped") }),
      make(HoverHandler, {
        $self: offHover,
        enabled: false,
        onHoveredChanged: () => log.push(`off hovered ${offHover.hovered}`),
      }),
    ]),
    make(Rectangle, { $self: objects.mouseOnly, x: 100, y: 200, width: 80, height: 80, color: "olive" }, () => [
      make(TapHandler, {
        get acceptedDevices() {
          return PointerDevice.Mouse;
        },
        onTapped: () => log.push("mouse tapped"),
      }),
      make(TapHandler, {
        get acceptedDevices() {
          return PointerDevice.TouchScreen;
        },
        onTapped: (point, button) => log.push(`finger tapped b=${button}`),
      }),
    ]),
  ]);
}

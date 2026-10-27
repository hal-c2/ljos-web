// Item {
//     id: root; width: 400; height: 300
//     property bool reject: false
//     MouseArea {
//         id: basic; width: 80; height: 60
//         onPressed: (mouse) => log.push(`basic pressed ${mouse.x},${mouse.y} b=${mouse.button} bs=${mouse.buttons} p=${pressed} cm=${containsMouse} cp=${containsPress} pb=${pressedButtons}`)
//         onReleased: (mouse) => log.push(`basic released b=${mouse.button} bs=${mouse.buttons} p=${pressed} cm=${containsMouse} held=${mouse.wasHeld}`)
//         onClicked: (mouse) => log.push(`basic clicked ${mouse.x},${mouse.y}`)
//         onPressAndHold: (mouse) => log.push(`basic pressAndHold held=${mouse.wasHeld}`)
//         onEntered: log.push("basic entered")
//         onExited: log.push("basic exited")
//         onPositionChanged: (mouse) => log.push(`basic position ${mouse.x},${mouse.y} bs=${mouse.buttons} ${mouseX},${mouseY}`)
//         onPressedChanged: log.push(`basic pressedChanged ${pressed}`)
//         onContainsMouseChanged: log.push(`basic containsMouseChanged ${containsMouse}`)
//         onContainsPressChanged: log.push(`basic containsPressChanged ${containsPress}`)
//     }
//     MouseArea {
//         id: dbl; x: 90; width: 60; height: 60
//         onPressed: log.push("dbl pressed")
//         onReleased: log.push("dbl released")
//         onClicked: log.push("dbl clicked")
//         onDoubleClicked: (mouse) => log.push(`dbl doubleClicked ${mouse.accepted}`)
//     }
//     MouseArea {
//         id: plain; x: 160; width: 60; height: 60
//         onPressed: log.push("plain pressed")
//         onReleased: log.push("plain released")
//         onClicked: log.push("plain clicked")
//         onCanceled: log.push("plain canceled")
//         onPressedChanged: log.push(`plain pressedChanged ${pressed}`)
//     }
//     MouseArea {
//         id: h1; x: 230; width: 100; height: 60; hoverEnabled: true
//         onEntered: log.push("h1 entered")
//         onExited: log.push("h1 exited")
//         onPressed: log.push(`h1 pressed cm=${containsMouse}`)
//         onReleased: log.push(`h1 released cm=${containsMouse}`)
//         onClicked: log.push("h1 clicked")
//         onPositionChanged: (mouse) => log.push(`h1 position ${mouse.x},${mouse.y} bs=${mouse.buttons}`)
//         MouseArea {
//             id: hc; x: 10; y: 10; width: 40; height: 40; hoverEnabled: true; cursorShape: Qt.PointingHandCursor
//             onEntered: log.push("hc entered")
//             onExited: log.push("hc exited")
//         }
//     }
//     MouseArea {
//         id: h2; x: 310; y: 30; width: 60; height: 60; hoverEnabled: true
//         onEntered: log.push("h2 entered")
//         onExited: log.push("h2 exited")
//     }
//     MouseArea {
//         id: below; y: 70; width: 80; height: 60
//         onPressed: log.push("below pressed")
//         onReleased: log.push("below released")
//         onClicked: log.push("below clicked")
//     }
//     MouseArea {
//         id: above; y: 70; width: 80; height: 60
//         onPressed: (mouse) => { log.push("above pressed"); mouse.accepted = !root.reject }
//         onReleased: log.push("above released")
//         onClicked: log.push("above clicked")
//         onPressedChanged: log.push(`above pressedChanged ${pressed}`)
//     }
//     MouseArea {
//         id: cbelow; x: 90; y: 70; width: 80; height: 60
//         onClicked: (mouse) => log.push(`cbelow clicked ${mouse.x},${mouse.y}`)
//         onDoubleClicked: log.push("cbelow doubleClicked")
//         onPressAndHold: log.push("cbelow pressAndHold")
//     }
//     MouseArea { id: cmiddle; x: 90; y: 70; width: 80; height: 60 }
//     MouseArea {
//         id: cabove; x: 100; y: 80; width: 70; height: 50; propagateComposedEvents: true
//         onPressed: log.push("cabove pressed")
//         onReleased: log.push("cabove released")
//         onClicked: (mouse) => { log.push("cabove clicked"); mouse.accepted = false }
//     }
//     MouseArea {
//         id: chord; x: 180; y: 70; width: 60; height: 60; acceptedButtons: Qt.LeftButton | Qt.RightButton
//         onPressed: (mouse) => log.push(`chord pressed b=${mouse.button} pb=${pressedButtons}`)
//         onReleased: (mouse) => log.push(`chord released b=${mouse.button} pb=${pressedButtons}`)
//         onClicked: (mouse) => log.push(`chord clicked b=${mouse.button}`)
//         onPressedChanged: log.push(`chord pressedChanged ${pressed}`)
//     }
//     MouseArea {
//         id: w1; x: 250; y: 100; width: 80; height: 50; hoverEnabled: true
//         onWheel: (wheel) => log.push(`w1 wheel ${wheel.angleDelta.y} ${wheel.angleDelta.x} ${wheel.pixelDelta.y} x=${wheel.x} acc=${wheel.accepted} b=${wheel.buttons} m=${wheel.modifiers}`)
//     }
//     MouseArea {
//         id: w2; x: 300; y: 120; width: 80; height: 50
//         onWheel: (wheel) => { log.push("w2 wheel"); wheel.accepted = false }
//     }
//     MouseArea { id: cover; x: 250; y: 100; width: 30; height: 50 }
//     Rectangle {
//         id: box; y: 140; width: 50; height: 50; color: "teal"
//         MouseArea {
//             id: drag; anchors.fill: parent
//             drag.target: box; drag.axis: Drag.XAxis; drag.minimumX: 0; drag.maximumX: 100
//             drag.onActiveChanged: log.push(`drag.active ${drag.active} x=${box.x}`)
//             onPositionChanged: (mouse) => log.push(`drag position ${mouse.x} x=${box.x}`)
//             onReleased: log.push(`drag released x=${box.x}`)
//             onClicked: log.push("drag clicked")
//         }
//     }
//     MouseArea {
//         id: outer; y: 200; width: 200; height: 80
//         drag.target: handle; drag.axis: Drag.XAxis; drag.filterChildren: true
//         drag.onActiveChanged: log.push(`outer drag.active ${drag.active}`)
//         onPressed: log.push("outer pressed")
//         onReleased: log.push("outer released")
//         onClicked: log.push("outer clicked")
//         Rectangle {
//             id: handle; width: 60; height: 40; color: "olive"
//             MouseArea {
//                 id: inner; anchors.fill: parent
//                 onPressed: log.push("inner pressed")
//                 onReleased: log.push("inner released")
//                 onClicked: log.push("inner clicked")
//                 onCanceled: log.push("inner canceled")
//             }
//         }
//     }
//     Rectangle {
//         id: puck; x: 220; y: 200; width: 30; height: 30; color: "navy"
//         MouseArea {
//             id: grip; anchors.fill: parent
//             drag.target: puck; drag.smoothed: false; drag.threshold: 4
//             drag.onActiveChanged: log.push(`grip drag.active ${drag.active} at=${puck.x},${puck.y}`)
//             onPositionChanged: (mouse) => log.push(`grip position ${mouse.x},${mouse.y} at=${puck.x},${puck.y}`)
//             onReleased: log.push("grip released")
//         }
//     }
//     MouseArea { id: covered; x: 300; y: 200; width: 60; height: 40; onClicked: log.push("covered clicked") }
//     Rectangle { x: 300; y: 200; width: 60; height: 40; color: "gray" }
// }
import { $define, $object, $signal } from "ljos-web/object";
import { clock, Item, MouseArea, Rectangle } from "ljos-web/QtQuick";
import { make } from "../scene.js";

const names = [
  "root",
  "basic",
  "dbl",
  "plain",
  "h1",
  "hc",
  "h2",
  "below",
  "above",
  "cbelow",
  "cmiddle",
  "cabove",
  "chord",
  "w1",
  "w2",
  "cover",
  "box",
  "drag",
  "outer",
  "handle",
  "inner",
  "puck",
  "grip",
  "covered",
];
export const objects = { log: [], clock };

export default function Mouse() {
  clock.stop();
  for (const name of names) objects[name] = $object();
  const { log, root, basic, dbl, plain, h1, hc, h2, below, above, cbelow, cmiddle, cabove, chord } = objects;
  const { w1, w2, cover, box, drag, outer, handle, inner, puck, grip, covered } = objects;
  const [reject, setReject] = $signal(false);
  const made = make(Item, { $self: root, width: 400, height: 300 }, () => [
    make(MouseArea, {
      $self: basic,
      width: 80,
      height: 60,
      onPressed: (mouse) =>
        log.push(
          `basic pressed ${mouse.x},${mouse.y} b=${mouse.button} bs=${mouse.buttons} p=${basic.pressed} cm=${basic.containsMouse} cp=${basic.containsPress} pb=${basic.pressedButtons}`,
        ),
      onReleased: (mouse) =>
        log.push(
          `basic released b=${mouse.button} bs=${mouse.buttons} p=${basic.pressed} cm=${basic.containsMouse} held=${mouse.wasHeld}`,
        ),
      onClicked: (mouse) => log.push(`basic clicked ${mouse.x},${mouse.y}`),
      onPressAndHold: (mouse) => log.push(`basic pressAndHold held=${mouse.wasHeld}`),
      onEntered: () => log.push("basic entered"),
      onExited: () => log.push("basic exited"),
      onPositionChanged: (mouse) =>
        log.push(`basic position ${mouse.x},${mouse.y} bs=${mouse.buttons} ${basic.mouseX},${basic.mouseY}`),
      onPressedChanged: () => log.push(`basic pressedChanged ${basic.pressed}`),
      onContainsMouseChanged: () => log.push(`basic containsMouseChanged ${basic.containsMouse}`),
      onContainsPressChanged: () => log.push(`basic containsPressChanged ${basic.containsPress}`),
    }),
    make(MouseArea, {
      $self: dbl,
      x: 90,
      width: 60,
      height: 60,
      onPressed: (mouse) => log.push("dbl pressed"),
      onReleased: (mouse) => log.push("dbl released"),
      onClicked: (mouse) => log.push("dbl clicked"),
      onDoubleClicked: (mouse) => log.push(`dbl doubleClicked ${mouse.accepted}`),
    }),
    make(MouseArea, {
      $self: plain,
      x: 160,
      width: 60,
      height: 60,
      onPressed: (mouse) => log.push("plain pressed"),
      onReleased: (mouse) => log.push("plain released"),
      onClicked: (mouse) => log.push("plain clicked"),
      onCanceled: () => log.push("plain canceled"),
      onPressedChanged: () => log.push(`plain pressedChanged ${plain.pressed}`),
    }),
    make(
      MouseArea,
      {
        $self: h1,
        x: 230,
        width: 100,
        height: 60,
        hoverEnabled: true,
        onEntered: () => log.push("h1 entered"),
        onExited: () => log.push("h1 exited"),
        onPressed: (mouse) => log.push(`h1 pressed cm=${h1.containsMouse}`),
        onReleased: (mouse) => log.push(`h1 released cm=${h1.containsMouse}`),
        onClicked: (mouse) => log.push("h1 clicked"),
        onPositionChanged: (mouse) => log.push(`h1 position ${mouse.x},${mouse.y} bs=${mouse.buttons}`),
      },
      () => [
        make(MouseArea, {
          $self: hc,
          x: 10,
          y: 10,
          width: 40,
          height: 40,
          hoverEnabled: true,
          // Qt.PointingHandCursor
          cursorShape: 13,
          onEntered: () => log.push("hc entered"),
          onExited: () => log.push("hc exited"),
        }),
      ],
    ),
    make(MouseArea, {
      $self: h2,
      x: 310,
      y: 30,
      width: 60,
      height: 60,
      hoverEnabled: true,
      onEntered: () => log.push("h2 entered"),
      onExited: () => log.push("h2 exited"),
    }),
    make(MouseArea, {
      $self: below,
      y: 70,
      width: 80,
      height: 60,
      onPressed: (mouse) => log.push("below pressed"),
      onReleased: (mouse) => log.push("below released"),
      onClicked: (mouse) => log.push("below clicked"),
    }),
    make(MouseArea, {
      $self: above,
      y: 70,
      width: 80,
      height: 60,
      onPressed: (mouse) => {
        log.push("above pressed");
        mouse.accepted = !root.reject;
      },
      onReleased: (mouse) => log.push("above released"),
      onClicked: (mouse) => log.push("above clicked"),
      onPressedChanged: () => log.push(`above pressedChanged ${above.pressed}`),
    }),
    make(MouseArea, {
      $self: cbelow,
      x: 90,
      y: 70,
      width: 80,
      height: 60,
      onClicked: (mouse) => log.push(`cbelow clicked ${mouse.x},${mouse.y}`),
      onDoubleClicked: (mouse) => log.push("cbelow doubleClicked"),
      onPressAndHold: (mouse) => log.push("cbelow pressAndHold"),
    }),
    make(MouseArea, { $self: cmiddle, x: 90, y: 70, width: 80, height: 60 }),
    make(MouseArea, {
      $self: cabove,
      x: 100,
      y: 80,
      width: 70,
      height: 50,
      propagateComposedEvents: true,
      onPressed: (mouse) => log.push("cabove pressed"),
      onReleased: (mouse) => log.push("cabove released"),
      onClicked: (mouse) => {
        log.push("cabove clicked");
        mouse.accepted = false;
      },
    }),
    make(MouseArea, {
      $self: chord,
      x: 180,
      y: 70,
      width: 60,
      height: 60,
      // Qt.LeftButton | Qt.RightButton
      acceptedButtons: 3,
      onPressed: (mouse) => log.push(`chord pressed b=${mouse.button} pb=${chord.pressedButtons}`),
      onReleased: (mouse) => log.push(`chord released b=${mouse.button} pb=${chord.pressedButtons}`),
      onClicked: (mouse) => log.push(`chord clicked b=${mouse.button}`),
      onPressedChanged: () => log.push(`chord pressedChanged ${chord.pressed}`),
    }),
    make(MouseArea, {
      $self: w1,
      x: 250,
      y: 100,
      width: 80,
      height: 50,
      hoverEnabled: true,
      onWheel: (wheel) =>
        log.push(
          `w1 wheel ${wheel.angleDelta.y} ${wheel.angleDelta.x} ${wheel.pixelDelta.y} x=${wheel.x} acc=${wheel.accepted} b=${wheel.buttons} m=${wheel.modifiers}`,
        ),
    }),
    make(MouseArea, {
      $self: w2,
      x: 300,
      y: 120,
      width: 80,
      height: 50,
      onWheel: (wheel) => {
        log.push("w2 wheel");
        wheel.accepted = false;
      },
    }),
    make(MouseArea, { $self: cover, x: 250, y: 100, width: 30, height: 50 }),
    make(Rectangle, { $self: box, y: 140, width: 50, height: 50, color: "teal" }, () => [
      make(MouseArea, {
        $self: drag,
        get anchors$fill() {
          return drag.parent;
        },
        drag$target: box,
        // Drag.XAxis
        drag$axis: 1,
        drag$minimumX: 0,
        drag$maximumX: 100,
        get drag$onActiveChanged() {
          return log.push(`drag.active ${drag.drag.active} x=${box.x}`);
        },
        onPositionChanged: (mouse) => log.push(`drag position ${mouse.x} x=${box.x}`),
        onReleased: (mouse) => log.push(`drag released x=${box.x}`),
        onClicked: (mouse) => log.push("drag clicked"),
      }),
    ]),
    make(
      MouseArea,
      {
        $self: outer,
        y: 200,
        width: 200,
        height: 80,
        drag$target: handle,
        drag$axis: 1,
        drag$filterChildren: true,
        get drag$onActiveChanged() {
          return log.push(`outer drag.active ${outer.drag.active}`);
        },
        onPressed: (mouse) => log.push("outer pressed"),
        onReleased: (mouse) => log.push("outer released"),
        onClicked: (mouse) => log.push("outer clicked"),
      },
      () => [
        make(Rectangle, { $self: handle, width: 60, height: 40, color: "olive" }, () => [
          make(MouseArea, {
            $self: inner,
            get anchors$fill() {
              return inner.parent;
            },
            onPressed: (mouse) => log.push("inner pressed"),
            onReleased: (mouse) => log.push("inner released"),
            onClicked: (mouse) => log.push("inner clicked"),
            onCanceled: () => log.push("inner canceled"),
          }),
        ]),
      ],
    ),
    make(Rectangle, { $self: puck, x: 220, y: 200, width: 30, height: 30, color: "navy" }, () => [
      make(MouseArea, {
        $self: grip,
        get anchors$fill() {
          return grip.parent;
        },
        drag$target: puck,
        drag$smoothed: false,
        drag$threshold: 4,
        get drag$onActiveChanged() {
          return log.push(`grip drag.active ${grip.drag.active} at=${puck.x},${puck.y}`);
        },
        onPositionChanged: (mouse) => log.push(`grip position ${mouse.x},${mouse.y} at=${puck.x},${puck.y}`),
        onReleased: (mouse) => log.push("grip released"),
      }),
    ]),
    make(MouseArea, {
      $self: covered,
      x: 300,
      y: 200,
      width: 60,
      height: 40,
      onClicked: (mouse) => log.push("covered clicked"),
    }),
    make(Rectangle, { x: 300, y: 200, width: 60, height: 40, color: "gray" }),
  ]);
  return $define(made, { reject: [reject, setReject] });
}

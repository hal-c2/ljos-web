// import QtQuick
// Window {
//     id: win
//     width: 320; height: 240
//     visible: true
//     title: "hello"
//     color: "steelblue"
//     Item {
//         id: child
//         anchors.fill: parent
//         Item { id: grand; width: Window.width / 4; height: Screen.height / 10 }
//     }
//     QtObject { id: obj }
//     Rectangle {
//         id: second
//         width: 10; height: 10
//         Screen.onPrimaryOrientationChanged: log.push("turned " + Screen.primaryOrientation)
//     }
//     Window {
//         id: nested
//         property bool stay: false
//         x: 20; y: 30; width: 100; height: 80
//         color: "#ff0000"
//         onClosing: (close) => { log.push("closing " + close.accepted); if (stay) close.accepted = false }
//         onVisibilityChanged: log.push("visibility " + visibility)
//         Item { id: nestedChild; anchors.fill: parent }
//     }
// }
//
// and, for a scene that takes its window's size rather than giving it one:
//
// Window {
//     id: own
//     width: 320; height: 240
//     visible: true
//     Component.onCompleted: log.push("own " + width + "x" + height)
//     Rectangle { id: filling; anchors.fill: parent }
// }
import { $define, $object, $signal, defineType, instantiate, mount, QtObject } from "ljos-web/object";
import { Qt } from "ljos-web/QtQml";
import { Application, Item, Rectangle, Screen } from "ljos-web/QtQuick";
import { Window } from "ljos-web/QtQuick/Window";
import { make } from "../scene.js";

export const objects = { Application, log: [], Qt, Screen, Window };

function Own() {
  const { log } = objects;
  const own = (objects.own = $object());
  const filling = (objects.filling = $object());
  return make(
    Window,
    {
      $self: own,
      width: 320,
      height: 240,
      visible: true,
      Component$onCompleted: () => log.push(`own ${own.width}x${own.height}`),
    },
    () => [
      make(Rectangle, {
        $self: filling,
        get anchors$fill() {
          return filling.parent;
        },
      }),
    ],
  );
}

// Mounts the second window in an element of no size, which is to take the
// window's.
objects.mountOwn = () => {
  const host = (objects.host = document.createElement("div"));
  document.body.append(host);
  mount(Own, host, {}, { fill: false });
};

// A window that is given nothing, and put nowhere.
objects.plain = () => instantiate(() => make(Window, {}), {}).object;

// A type of window, as ApplicationWindow is one: `Framed { width: 50; Item {} }`.
const Framed = defineType("Framed", Window, { properties: { header: null } });
objects.framed = () => instantiate(() => make(Framed, { width: 50 }, () => [make(Item, {})]), {}).object;

export default function Windows() {
  const { log } = objects;
  const win = (objects.win = $object());
  const child = (objects.child = $object());
  const grand = (objects.grand = $object());
  const obj = (objects.obj = $object());
  const second = (objects.second = $object());
  const nested = (objects.nested = $object());
  const nestedChild = (objects.nestedChild = $object());
  const [stay, setStay] = $signal(false);
  return make(
    Window,
    { $self: win, width: 320, height: 240, visible: true, title: "hello", color: "steelblue" },
    () => [
      make(
        Item,
        {
          $self: child,
          get anchors$fill() {
            return child.parent;
          },
        },
        () => [
          make(Item, {
            $self: grand,
            get width() {
              return Window.attached(grand).width / 4;
            },
            get height() {
              return Screen.attached(grand).height / 10;
            },
          }),
        ],
      ),
      make(QtObject, { $self: obj }),
      make(Rectangle, {
        $self: second,
        width: 10,
        height: 10,
        Screen$onPrimaryOrientationChanged: () => log.push(`turned ${Screen.attached(second).primaryOrientation}`),
      }),
      $define(
        make(
          Window,
          {
            $self: nested,
            x: 20,
            y: 30,
            width: 100,
            height: 80,
            color: "#ff0000",
            onClosing: (close) => {
              log.push(`closing ${close.accepted}`);
              if (stay()) close.accepted = false;
            },
            onVisibilityChanged: () => log.push(`visibility ${nested.visibility}`),
          },
          () => [
            make(Item, {
              $self: nestedChild,
              get anchors$fill() {
                return nestedChild.parent;
              },
            }),
          ],
        ),
        { stay: [stay, setStay] },
      ),
    ],
  );
}

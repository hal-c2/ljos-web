// Item {
//     id: root; width: 640; height: 480
//     Rectangle { id: a; implicitWidth: 30; implicitHeight: 20; Layout.fillWidth: true }
//     Rectangle { id: b; implicitWidth: 40; implicitHeight: 10; Layout.alignment: Qt.AlignBottom; Layout.margins: 3 }
//     RowLayout {
//         id: wide; width: 200; height: 40
//         LayoutItemProxy { id: pa1; target: a }
//         LayoutItemProxy { id: pb1; target: b }
//     }
//     ColumnLayout {
//         id: narrow; y: 60; width: 80; height: 100; visible: false
//         LayoutItemProxy { id: pb2; target: b; Layout.alignment: Qt.AlignRight }
//         LayoutItemProxy { id: pa2; target: a; Layout.fillHeight: true }
//     }
//     Loader {
//         id: loader; active: false; y: 200
//         sourceComponent: RowLayout { width: 60; height: 30; LayoutItemProxy { id: pa3; target: a } }
//     }
// }
//
// There is no Loader here: `load()` makes what it would, and returns what
// destroys it again.
import { $object, instantiate } from "ljos-web/object";
import { Item, Rectangle } from "ljos-web/QtQuick";
import { ColumnLayout, Layout, LayoutItemProxy, RowLayout } from "ljos-web/QtQuick/Layouts";
import { flush } from "solid-js";
import { make } from "../scene.js";

const names = ["root", "a", "b", "wide", "narrow", "pa1", "pb1", "pa2", "pb2"];
export const objects = { attached: (item) => Layout.attached(item) };

const AlignRight = 0x2;
const AlignBottom = 0x40;

export default function LayoutsProxy() {
  for (const name of names) objects[name] = $object();
  const { a, b } = objects;
  const proxy = (name, target, props = {}) => {
    props.$self = objects[name];
    Object.defineProperty(props, "target", { get: () => target, enumerable: true });
    return make(LayoutItemProxy, props);
  };
  objects.load = () => {
    objects.pa3 = $object();
    const loaded = instantiate(
      () => make(RowLayout, { y: 200, width: 60, height: 30 }, () => [proxy("pa3", a)]),
      undefined,
      objects.root,
    );
    objects.root.$add(loaded.object);
    flush();
    return () => {
      objects.root.$remove(loaded.object);
      loaded.dispose();
      flush();
    };
  };
  return make(Item, { $self: objects.root, width: 640, height: 480 }, () => [
    make(Rectangle, { $self: a, color: "#c33", implicitWidth: 30, implicitHeight: 20, Layout$fillWidth: true }),
    make(Rectangle, {
      $self: b,
      color: "#36c",
      implicitWidth: 40,
      implicitHeight: 10,
      Layout$alignment: AlignBottom,
      Layout$margins: 3,
    }),
    make(RowLayout, { $self: objects.wide, width: 200, height: 40 }, () => [proxy("pa1", a), proxy("pb1", b)]),
    make(ColumnLayout, { $self: objects.narrow, y: 60, width: 80, height: 100, visible: false }, () => [
      proxy("pb2", b, { Layout$alignment: AlignRight }),
      proxy("pa2", a, { Layout$fillHeight: true }),
    ]),
  ]);
}

// An application main() names Org/App before it loads:
//
// import QtCore
// Item {
//     id: root; width: 400; height: 300
//     Settings {
//         id: st
//         location: "moved"
//         category: "main"
//         property int count: 1
//     }
// }
import { $define, $object, $signal } from "ljos-web/object";
import { Settings } from "ljos-web/QtCore";
import { Application, Item } from "ljos-web/QtQuick";
import { make } from "../scene.js";

export const objects = { Application, Settings };

export default function Moved() {
  // Named before the Settings reads what it keeps, as an application that
  // names itself in main() is.
  Application.organization = "Org";
  Application.name = "App";
  const root = (objects.root = $object());
  const st = (objects.st = $object());
  const [count, setCount] = $signal(1);
  return make(Item, { $self: root, width: 400, height: 300 }, () => [
    $define(make(Settings, { $self: st, location: "moved", category: "main" }), { count: [count, setCount] }),
  ]);
}

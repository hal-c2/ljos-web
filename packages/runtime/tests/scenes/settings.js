// import QtCore
// Item {
//     id: root; width: 400; height: 300
//     Settings {
//         id: st
//         category: "main"
//         property int count: 1
//         property string name: "n"
//         property bool flag: true
//         property real ratio: 1.5
//         property var list: [1, 2]
//     }
//     Settings { id: other; property int count: 10 }
// }
import { $define, $object, $signal } from "ljos-web/object";
import { Settings as LabsSettings } from "ljos-web/Qt/labs/settings";
import { Settings, StandardPaths } from "ljos-web/QtCore";
import { Application, Item } from "ljos-web/QtQuick";
import { make } from "../scene.js";

export const objects = { Application, LabsSettings, Settings, StandardPaths };

export default function Stored() {
  const root = (objects.root = $object());
  const st = (objects.st = $object());
  const other = (objects.other = $object());
  const [count, setCount] = $signal(1);
  const [name, setName] = $signal("n");
  const [flag, setFlag] = $signal(true);
  const [ratio, setRatio] = $signal(1.5);
  const [list, setList] = $signal(() => [1, 2]);
  const [otherCount, setOtherCount] = $signal(10);
  return make(Item, { $self: root, width: 400, height: 300 }, () => [
    $define(make(Settings, { $self: st, category: "main" }), {
      count: [count, setCount],
      name: [name, setName],
      flag: [flag, setFlag],
      ratio: [ratio, setRatio],
      list: [list, setList],
    }),
    $define(make(Settings, { $self: other }), { count: [otherCount, setOtherCount] }),
  ]);
}

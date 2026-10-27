// Item {
//     id: root; width: 400; height: 300
//     property int rows: 3
//     property var names: ["a", "b", "c"]
//     property var people: [{ name: "ann", age: 30 }, { name: "bob", age: 40 }]
//     ListModel {
//         id: fruit
//         ListElement { name: "apple"; cost: 2 }
//         ListElement { name: "pear"; cost: 3; attributes: [ListElement { description: "green" }] }
//         ListElement { name: "plum" }
//     }
//     ListModel { id: single; ListElement { name: "only" } }
//     ListModel { id: loose; dynamicRoles: true }
//     Rectangle { id: before; width: 5; height: 5 }
//     Repeater {
//         id: byList; model: fruit
//         onItemAdded: (index, item) => log.push("added " + index + " " + item.label)
//         onItemRemoved: (index, item) => log.push("removed " + index + " " + item.label)
//         Rectangle {
//             required property int index; required property string name; required property int cost
//             required property var model
//             property string label: name
//             property var whole: modelData
//             x: index * 30; width: 20; height: 10 + cost * 10
//             Component.onDestruction: log.push("destroyed " + name)
//         }
//     }
//     Rectangle { id: after; width: 5; height: 5 }
//     Repeater { id: byNumber; model: root.rows; Rectangle { y: 100; x: index * 30; width: 20; height: 20; property int value: modelData } }
//     Repeater { id: byArray; model: root.names; Rectangle { y: 150; x: index * 30; width: 20; height: 20; property string value: modelData } }
//     Repeater { id: byObjects; model: root.people; Rectangle { required property string name; required property int age; y: 200; x: index * 30; width: age; height: 20 } }
//     Repeater { id: bySingle; model: single; Item { property string value: modelData } }
//     Instantiator {
//         id: things; model: root.rows
//         onObjectAdded: (index, object) => log.push("object " + index)
//         onObjectRemoved: (index, object) => log.push("no object " + index)
//         QtObject { objectName: "thing " + index }
//     }
// }
import { $component, $define, $object, $signal } from "ljos-web/object";
import { Instantiator, Item, ListElement, ListModel, QtObject, Rectangle, Repeater } from "ljos-web/QtQuick";
import { make } from "../scene.js";

// `made` counts the delegates created, by Repeater: a row that is kept is
// not made again.
export const objects = { log: [], made: { byList: 0, byNumber: 0, byArray: 0, byObjects: 0 } };

export default function Models() {
  const { log, made } = objects;
  const names = ["root", "fruit", "single", "loose", "before", "after", "byList", "byNumber", "byArray", "byObjects"];
  for (const name of [...names, "bySingle", "things"]) objects[name] = $object();
  const { root, fruit, single, loose, before, after, byList, byNumber, byArray, byObjects, bySingle, things } = objects;
  const [rows, setRows] = $signal(3);
  const [list, setList] = $signal(["a", "b", "c"]);
  const [people, setPeople] = $signal([
    { name: "ann", age: 30 },
    { name: "bob", age: 40 },
  ]);
  const scene = make(Item, { $self: root, width: 400, height: 300 }, () => [
    make(ListModel, { $self: fruit }, () => [
      make(ListElement, { name: "apple", cost: 2 }),
      make(ListElement, { name: "pear", cost: 3, attributes: [make(ListElement, { description: "green" })] }),
      make(ListElement, { name: "plum" }),
    ]),
    make(ListModel, { $self: single }, () => [make(ListElement, { name: "only" })]),
    make(ListModel, { $self: loose, dynamicRoles: true }),
    make(Rectangle, { $self: before, width: 5, height: 5 }),
    make(Repeater, {
      $self: byList,
      get model() {
        return fruit;
      },
      onItemAdded: (index, item) => log.push(`added ${index} ${item.label}`),
      onItemRemoved: (index, item) => log.push(`removed ${index} ${item.label}`),
      delegate: $component(($data) => {
        made.byList++;
        return $define(
          make(Rectangle, {
            get x() {
              return $data.index * 30;
            },
            width: 20,
            get height() {
              return 10 + $data.cost * 10;
            },
            Component$onDestruction: () => log.push(`destroyed ${$data.name}`),
          }),
          {
            index: [() => $data.index],
            name: [() => $data.name],
            cost: [() => $data.cost],
            model: [() => $data.model],
            label: [() => $data.name],
            whole: [() => $data.modelData],
            has: (name) => name in $data,
          },
        );
      }),
    }),
    make(Rectangle, { $self: after, width: 5, height: 5 }),
    make(Repeater, {
      $self: byNumber,
      get model() {
        return rows();
      },
      delegate: $component(($data) => {
        made.byNumber++;
        return $define(
          make(Rectangle, {
            y: 100,
            get x() {
              return $data.index * 30;
            },
            width: 20,
            height: 20,
          }),
          { value: [() => $data.modelData] },
        );
      }),
    }),
    make(Repeater, {
      $self: byArray,
      get model() {
        return list();
      },
      delegate: $component(($data) => {
        made.byArray++;
        return $define(
          make(Rectangle, {
            y: 150,
            get x() {
              return $data.index * 30;
            },
            width: 20,
            height: 20,
          }),
          { value: [() => $data.modelData] },
        );
      }),
    }),
    make(Repeater, {
      $self: byObjects,
      get model() {
        return people();
      },
      delegate: $component(($data) => {
        made.byObjects++;
        return $define(
          make(Rectangle, {
            y: 200,
            get x() {
              return $data.index * 30;
            },
            get width() {
              return $data.age;
            },
            height: 20,
          }),
          { name: [() => $data.name], whole: [() => $data.modelData] },
        );
      }),
    }),
    make(Repeater, {
      $self: bySingle,
      get model() {
        return single;
      },
      delegate: $component(($data) => $define(make(Item, {}), { value: [() => $data.modelData] })),
    }),
    make(Instantiator, {
      $self: things,
      get model() {
        return rows();
      },
      onObjectAdded: (index) => log.push(`object ${index}`),
      onObjectRemoved: (index) => log.push(`no object ${index}`),
      delegate: $component(($data) =>
        make(QtObject, {
          get objectName() {
            return `thing ${$data.index}`;
          },
        }),
      ),
    }),
  ]);
  return $define(scene, { rows: [rows, setRows], names: [list, setList], people: [people, setPeople] });
}

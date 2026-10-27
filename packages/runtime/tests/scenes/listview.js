// Item {
//     id: root; width: 400; height: 300
//     ListModel {
//         id: letters
//         ListElement { name: "a"; kind: "x" } ListElement { name: "b"; kind: "x" }
//         ListElement { name: "c"; kind: "y" } ListElement { name: "d"; kind: "y" }
//         ListElement { name: "e"; kind: "z" }
//     }
//     ListView {
//         id: sections; width: 200; height: 100; model: letters; spacing: 5
//         header: Rectangle { width: 200; height: 30 }
//         footer: Rectangle { width: 200; height: 20 }
//         highlight: Rectangle { color: "red" }
//         section.property: "kind"
//         section.delegate: Rectangle { required property string section; width: 200; height: 10 }
//         delegate: Rectangle {
//             required property string name
//             width: 180; height: 40
//             property string info: ListView.section + "|" + ListView.previousSection + "|" + ListView.nextSection
//                 + "|" + ListView.isCurrentItem + "|" + (ListView.view === sections)
//         }
//     }
//     ListView {
//         id: long; x: 200; width: 200; height: 100; model: root.rows
//         delegate: Rectangle { width: 200; height: 30; property int row: index }
//     }
//     ListView {
//         id: across; y: 100; width: 200; height: 100; orientation: ListView.Horizontal; spacing: 2; model: 30
//         delegate: Rectangle { width: 50; height: 30; property int row: index }
//     }
//     ListView {
//         id: ahead; x: 200; y: 100; width: 200; height: 100; model: 30; currentIndex: 20
//         delegate: Rectangle { width: 50; height: 30; property int row: index }
//     }
//     ListModel { id: names; ListElement { name: "a" } ListElement { name: "b" } ListElement { name: "c" } ListElement { name: "d" } }
//     ListView {
//         id: dynamic; y: 200; width: 200; height: 100; model: names; currentIndex: 1
//         onCurrentIndexChanged: log.push("cur " + currentIndex)
//         onCountChanged: if (root.follow) positionViewAtEnd()
//         delegate: Rectangle {
//             required property string name
//             width: 180; height: 40
//             ListView.onAdd: log.push("add " + name); ListView.onRemove: log.push("remove " + name)
//             Component.onDestruction: log.push("gone " + name)
//         }
//     }
//     ObjectModel {
//         id: things
//         Rectangle { id: thing; width: 30; height: 20 }
//         Rectangle { id: other; width: 30; height: 25; property int place: ObjectModel.index }
//     }
//     ListView { id: shown; x: 200; y: 200; width: 200; height: 100; model: things }
//     ListView {
//         id: sizes; x: 300; width: 100; height: 100; cacheBuffer: 0; model: root.heights
//         delegate: Rectangle { width: 100; height: modelData; property int row: index }
//     }
//     ListView { id: empty; width: 100; height: 100; delegate: Item {} }
// }
import { $component, $define, $object, $signal } from "ljos-web/object";
import { Item, ListElement, ListModel, ListView, ObjectModel, Rectangle } from "ljos-web/QtQuick";
import { make } from "../scene.js";

// `made` counts the delegates created, by view: scrolling makes those that
// come into view, and a row that is kept is not made again.
export const objects = { log: [], made: { sections: 0, long: 0, across: 0, ahead: 0, dynamic: 0, sizes: 0 } };

const element = (name, kind) => make(ListElement, kind ? { name, kind } : { name });

export default function Lists() {
  const { log, made } = objects;
  const ids = ["root", "letters", "sections", "long", "across", "ahead", "names", "dynamic", "things", "thing", "other"];
  for (const name of [...ids, "shown", "sizes", "empty"]) objects[name] = $object();
  const { root, letters, sections, long, across, ahead, names, dynamic, things, thing, other, shown, sizes, empty } = objects;
  const [rows, setRows] = $signal(1000);
  const [heights, setHeights] = $signal([]);
  const [follow, setFollow] = $signal(false);
  const plain = (view, width, height) =>
    $component(($data) => {
      made[view]++;
      return $define(make(Rectangle, { width, height }), { row: [() => $data.index] });
    });
  const scene = make(Item, { $self: root, width: 400, height: 300 }, () => [
    make(ListModel, { $self: letters }, () => [
      element("a", "x"),
      element("b", "x"),
      element("c", "y"),
      element("d", "y"),
      element("e", "z"),
    ]),
    make(ListView, {
      $self: sections,
      width: 200,
      height: 100,
      spacing: 5,
      get model() {
        return letters;
      },
      header: $component(() => make(Rectangle, { width: 200, height: 30 })),
      footer: $component(() => make(Rectangle, { width: 200, height: 20 })),
      highlight: $component(() => make(Rectangle, { color: "red" })),
      section$property: "kind",
      section$delegate: $component(($data) =>
        $define(make(Rectangle, { width: 200, height: 10 }), { section: [() => $data.section] }),
      ),
      delegate: $component(($data) => {
        made.sections++;
        const self = $object();
        const attached = () => ListView.attached(self);
        return $define(make(Rectangle, { $self: self, width: 180, height: 40 }), {
          name: [() => $data.name],
          info: [
            () =>
              [
                attached().section,
                attached().previousSection,
                attached().nextSection,
                attached().isCurrentItem,
                attached().view === sections,
              ].join("|"),
          ],
        });
      }),
    }),
    make(ListView, {
      $self: long,
      x: 200,
      width: 200,
      height: 100,
      get model() {
        return rows();
      },
      delegate: plain("long", 200, 30),
    }),
    make(ListView, {
      $self: across,
      y: 100,
      width: 200,
      height: 100,
      orientation: ListView.Horizontal,
      spacing: 2,
      model: 30,
      delegate: plain("across", 50, 30),
    }),
    make(ListView, {
      $self: ahead,
      x: 200,
      y: 100,
      width: 200,
      height: 100,
      model: 30,
      currentIndex: 20,
      delegate: plain("ahead", 50, 30),
    }),
    make(ListModel, { $self: names }, () => [element("a"), element("b"), element("c"), element("d")]),
    make(ListView, {
      $self: dynamic,
      y: 200,
      width: 200,
      height: 100,
      currentIndex: 1,
      get model() {
        return names;
      },
      onCurrentIndexChanged: () => log.push(`cur ${dynamic.currentIndex}`),
      onCountChanged: () => {
        if (root.follow) dynamic.positionViewAtEnd();
      },
      delegate: $component(($data) => {
        made.dynamic++;
        return $define(
          make(Rectangle, {
            width: 180,
            height: 40,
            ListView$onAdd: () => log.push(`add ${$data.name}`),
            ListView$onRemove: () => log.push(`remove ${$data.name}`),
            Component$onDestruction: () => log.push(`gone ${$data.name}`),
          }),
          { name: [() => $data.name] },
        );
      }),
    }),
    make(ObjectModel, { $self: things }, () => [
      make(Rectangle, { $self: thing, width: 30, height: 20 }),
      $define(make(Rectangle, { $self: other, width: 30, height: 25 }), {
        place: [() => ObjectModel.attached(other).index],
      }),
    ]),
    make(ListView, {
      $self: shown,
      x: 200,
      y: 200,
      width: 200,
      height: 100,
      get model() {
        return things;
      },
    }),
    make(ListView, {
      $self: sizes,
      x: 300,
      width: 100,
      height: 100,
      cacheBuffer: 0,
      get model() {
        return heights();
      },
      delegate: $component(($data) => {
        made.sizes++;
        const item = make(Rectangle, {
          width: 100,
          get height() {
            return $data.modelData;
          },
        });
        return $define(item, { row: [() => $data.index] });
      }),
    }),
    make(ListView, { $self: empty, width: 100, height: 100, delegate: $component(() => make(Item, {})) }),
  ]);
  return $define(scene, { rows: [rows, setRows], heights: [heights, setHeights], follow: [follow, setFollow] });
}

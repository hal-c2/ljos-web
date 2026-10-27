// `tabbar.qml`, as the compiler would emit it, but for TabButton: a TabBar
// takes only tab buttons for tabs, and what stands for one here is a control
// that can be checked, and unchecks the others beside it as an exclusive
// button does.
import { untrack } from "solid-js";
import { $component, $object, defineType, onChange } from "ljos-web/object";
import { Flickable, Item, ListView, Rectangle, Row } from "ljos-web/QtQuick";
import { Control, TabBar } from "ljos-web/QtQuick/Templates";
import { make } from "../scene.js";

const TabButton = defineType("TabButton", Control, {
  properties: { checked: false },
  setup(self) {
    onChange(self, "checked", () =>
      untrack(() => {
        if (!self.checked) return;
        for (const other of self.parent?.children ?? []) if (other !== self && other.checked) other.checked = false;
      }),
    );
  },
});

export const objects = {};

export default function Tabs() {
  for (const name of ["root", "bar", "list", "t0", "t1", "t2", "stray", "fixed", "row", "f0", "f1", "f2"]) objects[name] = $object();
  const { root, bar, list, t0, t1, t2, stray, fixed, row, f0, f1, f2 } = objects;
  const tab = $component(() => make(TabButton, { implicitWidth: 30, implicitHeight: 18 }));
  const button = (self, implicitWidth, implicitHeight, more) => make(TabButton, { $self: self, implicitWidth, implicitHeight, ...more });
  const box = (item) => {
    if (!item) return null;
    const within = item.parent === list.contentItem;
    return [Math.round((item.x - (within ? list.originX : 0)) * 1000) / 1000, item.y, item.width, item.height];
  };
  const attached = (item) => {
    if (!item) return null;
    const own = TabBar.attached(item);
    return [own.index, own.tabBar === bar, own.tabBar === fixed, own.position];
  };
  // What is destroyed in Qt is null there.
  let gone = false;
  const $functions = {
    step(index) {
      switch (index) {
        case 0:
          bar.setCurrentIndex(2);
          fixed.decrementCurrentIndex();
          break;
        case 1:
          t0.checked = true;
          f2.checked = true;
          break;
        case 2:
          bar.addItem(tab.createObject(null));
          bar.width = 400;
          break;
        case 3:
          bar.spacing = 6;
          t1.width = 100;
          fixed.position = TabBar.Header;
          break;
        case 4:
          bar.removeItem(t0);
          gone = true;
          fixed.moveItem(2, 0);
          break;
        case 5:
          bar.insertItem(0, stray);
          t2.implicitHeight = 30;
          break;
        case 6:
          bar.currentIndex = 0;
          fixed.takeItem(1);
          break;
      }
    },
    answers() {
      return [
        [bar.count, bar.currentIndex, list.currentIndex, bar.position, bar.currentItem ? bar.currentItem.checked : null],
        [bar.contentWidth, bar.contentHeight, bar.implicitWidth, bar.implicitHeight, bar.height],
        box(list),
        box(gone ? null : t0),
        box(t1),
        box(t2),
        box(bar.itemAt(bar.count - 1)),
        attached(gone ? null : t0),
        attached(t2),
        attached(stray),
        [stray.parent === null, stray.parent === bar, stray.parent === list.contentItem],
        [fixed.count, fixed.currentIndex, fixed.position, fixed.currentItem ? fixed.currentItem.checked : null],
        [fixed.contentWidth, fixed.contentHeight, fixed.implicitContentWidth, fixed.implicitContentHeight],
        [box(f0), box(f1), box(f2)],
        [attached(f0), attached(f1), attached(f2)],
      ];
    },
  };
  return make(Item, { $self: root, width: 400, height: 300, $functions }, () => [
    make(
      TabBar,
      {
        $self: bar,
        width: 300,
        spacing: 2,
        padding: 5,
        get implicitWidth() {
          return bar.contentWidth + bar.leftPadding + bar.rightPadding;
        },
        get implicitHeight() {
          return bar.contentHeight + bar.topPadding + bar.bottomPadding;
        },
        get contentItem() {
          return make(ListView, {
            $self: list,
            get model() {
              return bar.contentModel;
            },
            get currentIndex() {
              return bar.currentIndex;
            },
            get spacing() {
              return bar.spacing;
            },
            orientation: ListView.Horizontal,
            boundsBehavior: Flickable.StopAtBounds,
            flickableDirection: Flickable.AutoFlickIfNeeded,
            snapMode: ListView.SnapToItem,
            highlightMoveDuration: 0,
            highlightRangeMode: ListView.ApplyRange,
            preferredHighlightBegin: 40,
            get preferredHighlightEnd() {
              return list.width - 40;
            },
          });
        },
      },
      () => [
        button(t0, 40, 20),
        button(t1, 50, 24, { width: 80 }),
        button(t2, 60, 16, { height: 10 }),
        make(Rectangle, { $self: stray, width: 5, height: 5 }),
      ],
    ),
    make(
      TabBar,
      {
        $self: fixed,
        y: 100,
        width: 120,
        height: 30,
        position: TabBar.Footer,
        currentIndex: 1,
        contentWidth: 77,
        contentHeight: 22,
        wheelEnabled: true,
        get contentItem() {
          return make(Row, { $self: row });
        },
      },
      () => [button(f0, 10, 10), button(f1, 10, 10), button(f2, 10, 10)],
    ),
  ]);
}

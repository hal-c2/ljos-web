// The delegates a style has for the cells of a TableView and of its header
// views: an ItemDelegate that knows the view it is in and what the view's
// selection says of its cell.
import { defineType, derived, instantiate } from "../../object.js";
import { making } from "../cells.js";
import { TapHandler } from "../handlers.js";
import { ItemDelegate } from "./ItemDelegate.js";
import { untrack } from "#kernel";

const NOTHING = Object.freeze(Object.create(null));
const REQUIRED = ["row", "column", "model"];

const navigated = (self) => untrack(() => self.tableView?.pointerNavigationEnabled) === true;

export const TableViewDelegate = defineType("TableViewDelegate", ItemDelegate, {
  properties: {
    tableView: derived((self) => self.$cell?.$view ?? null),
    current: derived((self) => self.$cell?.current ?? false),
    selected: derived((self) => self.$cell?.selected ?? false),
    editing: derived((self) => self.$cell?.editing ?? false),
  },
  methods: {
    // The press is left to the handlers of the view, and to a
    // SelectionRectangle's: the button hears of it from a handler of its
    // own, as in Qt.
    $press(point) {
      return navigated(this) ? false : ItemDelegate.proto.$press.call(this, point);
    },
  },
  setup(self, props) {
    const cell = (self.$cell = making());
    // A style's delegate requires `row`, `column` and `model` of the view
    // in QML of Qt's own. The compiler binds them where the delegate of a
    // view is written; one made without them is bound here, to the same.
    for (const name of REQUIRED) {
      if (!cell || !(name in self.$type.slots) || name in props) continue;
      Object.defineProperty(props, name, { get: () => cell[name], enumerable: true, configurable: true });
    }
    const tap = instantiate(() => TapHandler({ acceptedModifiers: 0 }), NOTHING, self).object;
    // Heard as Qt's delegate hears it, once the handler has said it: what
    // the button says of the release comes after.
    tap.pressedChanged.connect(() => {
      if (!navigated(self)) return;
      const { x, y } = tap.point.position;
      if (tap.pressed) self.$handlePress(x, y, null);
      else if (tap.tapCount > 0) self.$handleRelease(x, y, null);
      else self.$handleUngrab();
      if (tap.tapCount > 1 && !tap.pressed) self.doubleClicked();
    });
  },
});

// `model` is the cell's data, which the style reads the header's text of.
export const HeaderViewDelegate = defineType("HeaderViewDelegate", TableViewDelegate, {
  properties: {
    headerView: derived((self) => self.tableView),
    model: derived((self) => self.$cell ?? null),
    orientation: derived((self) => self.headerView?.$header?.orientation ?? 1),
  },
});

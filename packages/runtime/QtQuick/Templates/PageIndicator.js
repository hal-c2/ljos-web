// PageIndicator: a dot for every page and which of them is the current one.
// The dots are the style's: a Repeater of `delegate` over `count`, in the
// content item. When `interactive`, a press of a dot makes its page current.
import { $component, defineType, settle } from "../../object.js";
import { LeftButton } from "../keycodes.js";
import { touch, track } from "../model.js";
import { Control, put, within } from "./Control.js";
import { untrack } from "#kernel";

// The dots: the children of the content item, less what repeats them.
const dots = (self) => untrack(() => (self.contentItem?.children ?? []).filter((child) => !child.$repeat));

// The dot at a point of the indicator, or the nearest to it.
function itemAt(self, x, y) {
  return untrack(() => {
    const content = self.contentItem;
    if (!content || !within(self, x, y)) return null;
    const at = self.mapToItem(content, x, y);
    let item = content.childAt(at.x, at.y);
    while (item && item.parent !== content) item = item.parent;
    if (item && !item.$repeat) return item;
    let nearest = null;
    let distance = Infinity;
    for (const child of dots(self)) {
      const point = content.mapToItem(child, at.x, at.y);
      const length = Math.hypot(point.x - child.width / 2, point.y - child.height / 2);
      if (length < distance) {
        distance = length;
        nearest = child;
      }
    }
    return nearest;
  });
}

// A delegate reads `pressed` as it reads `index`: its row says whether its
// dot is the one pressed.
function updatePressed(self, pressed, x, y) {
  const mine = self.$pages;
  const before = mine.pressed;
  mine.pressed = pressed ? itemAt(self, x, y) : null;
  if (before === mine.pressed) return;
  if (before?.$delegate) touch(before.$delegate, "pressed");
  if (mine.pressed?.$delegate) touch(mine.pressed.$delegate, "pressed");
  settle();
}

// The delegate as the style's Repeater is given it: the same one, its rows
// having `pressed`.
function pressable(self, given) {
  const mine = self.$pages;
  if (!given?.$component) return given;
  if (mine.given === given) return mine.delegate;
  mine.given = given;
  return (mine.delegate = $component((row) => {
    Object.defineProperty(row, "pressed", {
      get() {
        track(row, "pressed");
        return mine.pressed !== null && mine.pressed === row.$item;
      },
      configurable: true,
    });
    return given(row);
  }));
}

export const PageIndicator = defineType("PageIndicator", Control, {
  properties: {
    count: 0,
    currentIndex: 0,
    interactive: false,
    delegate: null,
  },
  resolve: { delegate: (self, own) => pressable(self, own()) },
  methods: {
    $accepts: LeftButton,
    $press(point) {
      return untrack(() => this.interactive) && Control.proto.$press.call(this, point);
    },
    $handlePress(x, y) {
      updatePressed(this, true, x, y);
    },
    $handleMove(x, y) {
      updatePressed(this, true, x, y);
    },
    $handleRelease() {
      const mine = this.$pages;
      const changed = mine.pressed && put(this, "currentIndex", dots(this).indexOf(mine.pressed));
      updatePressed(this, false);
      if (changed) settle();
    },
    $handleUngrab() {
      updatePressed(this, false);
    },
  },
  setup(self) {
    self.$pages = { pressed: null, given: null, delegate: null };
  },
});

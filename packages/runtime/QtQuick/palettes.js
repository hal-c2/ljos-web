// `palette` of an item and of a window: the colours it is painted with.
//
// A role somebody set is the item's and that of every item inside it. What
// nobody set is answered by what the item is: Qt's own colours for an item,
// a style's for a control (`$colours`).
import { runWithOwner } from "solid-js";
import { Item } from "./Item.js";
import { Palette } from "./Palette.js";
import { Window } from "./Window.js";
import { untrack } from "#kernel";

const PREFIX = "palette$";

function palette(self, from, group) {
  if (self.$palette) return self.$palette;
  // The object's `palette$button` is its palette's `button`.
  const props = {};
  for (const key of Object.keys(self.$props)) {
    if (key.startsWith(PREFIX)) {
      Object.defineProperty(props, key.slice(PREFIX.length), Object.getOwnPropertyDescriptor(self.$props, key));
    }
  }
  const made = runWithOwner(self.$owner, () => untrack(() => Palette(props)));
  made.$from = from;
  made.$group = group;
  made.$base = () => self.$colours?.();
  Object.defineProperty(self, "$palette", { value: made });
  return made;
}

Object.defineProperty(Item.proto, "palette", {
  get() {
    return palette(
      this,
      () => (this.parent ?? this.$window)?.palette,
      () => (this.enabled ? "active" : "disabled"),
    );
  },
  enumerable: true,
  configurable: true,
});

Object.defineProperty(Window.proto, "palette", {
  get() {
    return palette(this);
  },
  enumerable: true,
  configurable: true,
});

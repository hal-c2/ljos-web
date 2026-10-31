// WindowContainer: an item that holds a window, which is then where the item
// is, of its size, and shown when it is.
//
// What Qt holds this way is most often a window of another toolkit, made in
// C++. Here it is a Window of this runtime: its element goes inside the
// item's.
import { onCleanup } from "solid-js";
import { defineType, effect, slot } from "../object.js";
import { Item } from "./Item.js";
import { untrack } from "#kernel";

export const WindowContainer = defineType("WindowContainer", Item, {
  properties: {
    window: null,
  },
  signals: ["containedWindowChanged"],
  setup(self) {
    let held = null;
    let told;
    let lost = false;
    // The item is as large as its window asks to be, unless it is given a
    // size. Having lost a window it is of no size at all (Qt's -1).
    effect(
      () => [self.window, self.window?.$asked?.()],
      ([window, asked]) => {
        if (window !== held) {
          held?.$hold?.(null);
          lost = Boolean(held) && !window;
          held = window;
          window?.$hold?.(self);
        }
        const [width, height] = asked ?? (lost ? [-1, -1] : [0, 0]);
        slot(self, "implicitWidth").provide(width);
        slot(self, "implicitHeight").provide(height);
        // Not told of the window it was made with.
        if (told !== undefined && window !== told) untrack(() => self.containedWindowChanged(window));
        told = window;
      },
    );
    onCleanup(() => held?.$hold?.(null));
  },
});

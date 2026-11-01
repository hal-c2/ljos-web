// ProgressBar: how far something has come between `from` and `to`, or that
// it is under way at all (`indeterminate`). BusyIndicator says only the
// latter. What turns or fills is the style's.
import { defineType, derived, effect } from "../../object.js";
import { Control, loose } from "./Control.js";
import { bounded, close, fitted, keep } from "./Slider.js";
import { untrack } from "#kernel";
import { speaks } from "../Accessible.js";

export const ProgressBar = defineType("ProgressBar", Control, {
  properties: {
    from: 0,
    to: 1,
    value: 0,
    position: derived((self) => (close(self.from, self.to) ? 0 : (self.value - self.from) / (self.to - self.from))),
    visualPosition: derived((self) => (self.mirrored ? 1 - self.position : self.position)),
    indeterminate: false,
  },
  resolve: { value: (self, own) => fitted(self, self.$progress, own()) },
  setup(self) {
    const mine = (self.$progress = { value: 0, from: undefined, to: undefined });
    loose(self, "value");
    // A value out of range is the nearest end.
    effect(
      () => [self.value, self.from, self.to],
      ([value, from, to]) => {
        mine.from = from;
        mine.to = to;
        untrack(() => {
          value = bounded(self, value);
          if (!close(mine.value, value)) mine.value = value;
          keep(self, "value", mine.value);
        });
      },
    );
  },
});

export const BusyIndicator = defineType("BusyIndicator", Control, {
  properties: { running: true },
});

speaks(ProgressBar, "ProgressBar");
speaks(BusyIndicator, "Indicator");

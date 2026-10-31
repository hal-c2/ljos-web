// TextField: a line of text to edit, as a style dresses it: with a
// background, and a placeholder where there is no text yet.
import { defineType } from "../../object.js";
import { advance, capitalized, metrics } from "../font.js";
import { TextInput } from "../TextInput.js";
import { methods, properties, resolve, setup, signals } from "./field.js";
import { untrack } from "#kernel";

export const TextField = defineType("TextField", TextInput, {
  properties,
  resolve,
  signals,
  methods: {
    ...methods,
    // The middle of the cursor, which is where Qt asks a field for its menu.
    $cursor() {
      return untrack(() => {
        const { field, font } = this.$edit;
        const spec = font();
        const shown = capitalized(this.displayText, this.font.capitalization);
        const whole = advance(spec, shown);
        const before = advance(spec, shown.slice(0, this.cursorPosition));
        const room = field.offsetWidth - whole;
        const align = this.effectiveHorizontalAlignment;
        const start = align === 2 ? room : align === 4 ? room / 2 : 0;
        return {
          x: field.offsetLeft + Math.max(start, 0) - field.scrollLeft + before + 0.5,
          y: field.offsetTop + metrics(spec).height / 2,
        };
      });
    },
  },
  setup(self) {
    setup(self);
  },
});

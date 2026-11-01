// CheckLabel, MnemonicLabel, ClippedText, PlaceholderText: the texts a
// style's controls are written with.
import { defineType, effect, slot } from "../../../object.js";
import { lazy, rules } from "../../compute.js";
import { capitalized } from "../../font.js";
import { mightBeRichText } from "../../richtext.js";
import { RIGHT_TO_LEFT, Text } from "../../Text.js";

// The text beside a check box: on the left, in the middle, cut short.
export const CheckLabel = defineType("CheckLabel", Text, {
  properties: { horizontalAlignment: 1, verticalAlignment: 128, elide: 1 },
});

const SPACE = /\s/;

// `&Open`: the text without its ampersands and where the letters they mark
// are. `&&` is an ampersand; `(&O)` after a text that has no such letter is
// left out with the space before it when the letters are not shown.
function mnemonics(full, visible) {
  let text = "";
  const marks = [];
  let at = 0;
  let left = full.length;
  while (left) {
    if (full[at] === "&" && (left === 1 || full[at + 1] !== "&")) {
      if (visible && left > 1 && (at === 0 || full[at - 1] !== "&")) marks.push(text.length);
      at++;
      left--;
      if (left === 0) break;
    } else if (!visible && full[at] === "(" && left >= 4 && full[at + 1] === "&" && full[at + 2] !== "&" && full[at + 3] === ")") {
      let end = text.length;
      while (end > 0 && SPACE.test(text[end - 1])) end--;
      text = text.slice(0, end);
      at += 4;
      left -= 4;
      continue;
    }
    text += full[at];
    at++;
    left--;
  }
  return { text, marks };
}

export const MnemonicLabel = defineType("MnemonicLabel", Text, {
  properties: { mnemonicVisible: true },
  setup(self) {
    const state = self.$text;
    const content = self.$markup;
    const parts = lazy(self, () => mnemonics(String(self.text ?? ""), self.mnemonicVisible));
    // What is laid out and measured is the text without the ampersands;
    // `text` still reads as it was written.
    state.source = lazy(self, () => {
      const { text } = parts();
      const format = self.textFormat;
      const kind = format === 1 ? 2 : format === 4 || (format === 2 && mightBeRichText(text)) ? 1 : 0;
      return { kind, text: kind ? text : capitalized(text, self.font.capitalization) };
    });
    // The letters are underlined in what the text puts there, where they are
    // still in it: a text cut short may have lost them.
    state.marks = (made) => {
      const plain = state.source().text;
      const shown = made.text;
      return parts().marks.filter((at) => at < shown.length && shown.slice(0, at + 1) === plain.slice(0, at + 1));
    };
  },
});

// With `clip`, what is seen of the text is the rectangle these say, not the
// item's own.
rules(`
.qq.qq-clipped { overflow: visible !important; }
`);

export const ClippedText = defineType("ClippedText", Text, {
  properties: { clipX: 0, clipY: 0, clipWidth: 0, clipHeight: 0 },
  resolve: {
    clipWidth: (self, own) => own() || self.width,
    clipHeight: (self, own) => own() || self.height,
  },
  setup(self) {
    const node = self.$node;
    effect(
      () => (self.clip ? [self.clipX, self.clipY, self.clipWidth, self.clipHeight] : null),
      (clip) => {
        node.classList.toggle("qq-clipped", Boolean(clip));
        if (!clip) return void (node.style.clipPath = "");
        const [x, y, width, height] = clip;
        node.style.clipPath = `polygon(${x}px ${y}px, ${x + width}px ${y}px, ${x + width}px ${y + height}px, ${x}px ${y + height}px)`; // guarded: numbers
      },
    );
  },
});

const typed = (item) => item?.$type.chain.some((type) => type.typeName === "TextInput" || type.typeName === "TextEdit");

// The text shown in a field that has none: aligned as the field's own text
// is where the field was told how, and as its own direction has it where
// not. What it was told itself does not count: Qt takes that back.
export const PlaceholderText = defineType("PlaceholderText", Text, {
  properties: { horizontalAlignment: 1 },
  resolve: {
    horizontalAlignment(self) {
      const field = self.parent;
      if (typed(field) && slot(field, "horizontalAlignment").explicit()) return field.horizontalAlignment;
      return RIGHT_TO_LEFT.test(self.$text.source().text) ? 2 : 1;
    },
  },
});

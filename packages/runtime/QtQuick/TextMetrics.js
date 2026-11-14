// TextMetrics, FontMetrics: how big a string is in a font, for whoever lays
// something out around it.
import { $string, defineType, derived, QtObject } from "../object.ts";
import { lazy } from "./compute.js";
import { advance, describe, elided, font, fonts, inked, letters, metrics } from "./font.js";

// The font's own box around the string: from its ascent to its descent.
function bounds(spec, text) {
  const { ascent, descent } = metrics(spec);
  const ink = inked(spec, text);
  return { x: ink.left, y: -ascent, width: ink.right - ink.left, height: ascent + descent };
}

// The box of the ink alone.
function tight(spec, text) {
  const ink = inked(spec, text);
  return { x: ink.left, y: -ink.ascent, width: ink.right - ink.left, height: ink.ascent + ink.descent };
}

// The font, measured again when a web font arrives.
function face(self) {
  fonts();
  return self.$font();
}

const setup = (self) => void (self.$font = lazy(self, () => describe(self.font)));
const text = (self) => String(self.text ?? "");

export const TextMetrics = defineType("TextMetrics", QtObject, {
  properties: {
    font,
    text: $string,
    elide: 3,
    elideWidth: 0,
    advanceWidth: derived((self) => advance(face(self), text(self))),
    boundingRect: derived((self) => bounds(face(self), text(self))),
    tightBoundingRect: derived((self) => tight(face(self), text(self))),
    width: derived((self) => self.boundingRect.width),
    height: derived((self) => self.boundingRect.height),
    elidedText: derived((self) => elided(face(self), text(self), self.elide, self.elideWidth)),
  },
  setup,
});

const measured = (name) => derived((self) => metrics(face(self))[name]);

export const FontMetrics = defineType("FontMetrics", QtObject, {
  properties: {
    font,
    ascent: measured("ascent"),
    descent: measured("descent"),
    height: derived((self) => self.ascent + self.descent),
    // FreeType gives Qt no gap between lines for the fonts tried.
    leading: 0,
    lineSpacing: derived((self) => self.height + self.leading),
    xHeight: derived((self) => letters(face(self)).xHeight),
    capitalHeight: derived((self) => letters(face(self)).capitalHeight),
  },
  methods: {
    advanceWidth(string) {
      return advance(face(this), String(string));
    },
    boundingRect(string) {
      return bounds(face(this), String(string));
    },
    tightBoundingRect(string) {
      return tight(face(this), String(string));
    },
    elidedText(string, mode, width) {
      return elided(face(this), String(string), mode, width);
    },
  },
  setup,
});

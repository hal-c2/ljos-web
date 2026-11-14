// Color: the two things a style does to a colour.
import { color, rgba } from "../../color.ts";

const byte = (channel) => Math.round(channel * 255);
// Qt's qRound: a half goes up.
const between = (a, b, factor) => Math.floor(byte(a) * (1 - factor) + byte(b) * factor + 0.5) / 255;

export const Color = Object.freeze({
  // The colour as see-through as `opacity` says, whatever it was.
  transparent(value, opacity) {
    const { r, g, b } = color(value);
    return rgba(r, g, b, Math.trunc(Math.min(Math.max(opacity, 0), 1) * 255) / 255);
  },
  // The colour `factor` of the way from one to the other, opaque: but at
  // either end the colour itself, as see-through as it is.
  blend(a, b, factor) {
    const from = color(a);
    const to = color(b);
    if (!from.valid) return to;
    if (!to.valid || factor <= 0) return from;
    if (factor >= 1) return to;
    return rgba(between(from.r, to.r, factor), between(from.g, to.g, factor), between(from.b, to.b, factor));
  },
});

// `import QtQuick.Controls.Fusion`: what the Fusion style is in C++. Its
// colours and its font are Qt's own; `Fusion` makes of a palette the colours
// its controls are drawn in. The arithmetic is Qt's (`qquickfusionstyle.cpp`),
// on whole numbers as QColor does it, so that the colours are Qt's exactly.
import { styleHints } from "../../../QtQml/application.ts";
import { color as colour, hsva, rgba } from "../../color.js";
import { themed } from "../../Templates/theme.js";
import { preferred } from "../attached.js";
import { darker, degrees, eight, hsl, hsv, lighter } from "./shades.js";

themed("QtQuick.Controls.Fusion", {});

// `Qt::ContrastPreference::HighContrast`, `Qt::ColorScheme::Light`.
const HIGH = 1;
const LIGHT = 1;

const none = colour(null);

const scheme = () => styleHints().colorScheme;

export const Fusion = Object.freeze({
  lightShade: rgba(1, 1, 1, 90 / 255),
  darkShade: rgba(0, 0, 0, 60 / 255),
  topShadow: rgba(0, 0, 0, 18 / 255),
  innerContrastLine: rgba(1, 1, 1, 30 / 255),

  get highContrast() {
    return styleHints().accessibility.contrastPreference === HIGH;
  },

  highlight(palette) {
    return palette ? colour(palette.highlight) : none;
  },

  highlightedText(palette) {
    return palette ? colour(palette.highlightedText) : none;
  },

  outline(palette) {
    if (!palette) return none;
    return Fusion.highContrast ? colour(palette.windowText) : darker(colour(palette.window), 140);
  },

  highlightedOutline(palette) {
    if (!palette) return none;
    const highlight = Fusion.highlight(palette);
    if (Fusion.highContrast) {
      if (scheme() === LIGHT) return darker(highlight, 125);
      return hsv(degrees(highlight.hsvHue), eight(highlight.hsvSaturation), 255);
    }
    const made = darker(highlight, 125);
    const hue = degrees(made.hsvHue);
    const saturation = eight(made.hsvSaturation);
    if (eight(made.hsvValue) > 160) return hsl(hue, saturation, 160);
    return hsva(made.hsvHue, made.hsvSaturation, made.hsvValue, made.a);
  },

  tabFrameColor(palette) {
    return palette ? lighter(Fusion.buttonColor(palette), 104) : none;
  },

  buttonColor(palette, highlighted = false, down = false, hovered = false) {
    if (!palette) return none;
    const button = colour(palette.button);
    const grey = Math.trunc((eight(button.r) * 11 + eight(button.g) * 16 + eight(button.b) * 5) / 32);
    const lit = lighter(button, 100 + Math.max(1, Math.trunc((180 - grey) / 6)));
    let made = hsv(degrees(lit.hsvHue), Math.trunc(eight(lit.hsvSaturation) * 0.75), eight(lit.hsvValue));
    if (highlighted) made = Fusion.mergedColors(made, lighter(Fusion.highlightedOutline(palette), 130), 90);
    if (!hovered) made = darker(made, 104);
    if (down) made = darker(made, 110);
    return made;
  },

  buttonOutline(palette, highlighted = false, enabled = true) {
    if (!palette) return none;
    const outline = enabled && highlighted ? Fusion.highlightedOutline(palette) : Fusion.outline(palette);
    return enabled ? outline : lighter(outline, 115);
  },

  gradientStart(base) {
    return lighter(colour(base), 124);
  },

  gradientStop(base) {
    return lighter(colour(base), 102);
  },

  // `factor` hundredths of one colour and the rest of the other.
  mergedColors(a, b, factor = 50) {
    const one = colour(a);
    const other = colour(b);
    const merged = (name) => (Math.trunc((eight(one[name]) * factor) / 100) + Math.trunc((eight(other[name]) * (100 - factor)) / 100)) / 255;
    return rgba(merged("r"), merged("g"), merged("b"), one.a);
  },

  grooveColor(palette) {
    if (!palette) return none;
    const button = Fusion.buttonColor(palette);
    return hsv(degrees(button.hsvHue), Math.min(255, eight(button.hsvSaturation)), Math.min(255, Math.trunc(eight(button.hsvValue) * 0.9)));
  },
});

preferred("QtQuick.Controls.Fusion");

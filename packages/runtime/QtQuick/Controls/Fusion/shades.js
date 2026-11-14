// The arithmetic of the Fusion style's colours: QColor's, on whole numbers,
// so that a colour made here is the one Qt makes.
import { hsla, hsva } from "../../color.ts";

// A channel as QColor gives it from 0 to 255, and a hue in whole degrees
// (-1 for a grey, which has none).
export const eight = (channel) => {
  const value = Math.round(channel * 65535) + 128;
  return (value - (value >> 8)) >> 8;
};
export const degrees = (hue) => (hue < 0 ? -1 : Math.trunc(Math.round(hue * 36000) / 100));

// `QColor::setHsv` and `setHsl` with whole numbers: opaque, whatever it was.
export const hsv = (hue, saturation, value) => hsva(hue < 0 ? -1 : (hue % 360) / 360, saturation / 255, value / 255);
export const hsl = (hue, saturation, lightness) => hsla(hue < 0 ? -1 : (hue % 360) / 360, saturation / 255, lightness / 255);

export const lighter = (value, percent) => value.lighter(percent / 100);
export const darker = (value, percent) => value.darker(percent / 100);

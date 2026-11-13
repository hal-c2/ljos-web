// QML colours.
//
// A colour is usually a string that is only painted, and `css()` hands it to
// the DOM without looking inside: the names are CSS's (SVG's), the one
// difference is where the alpha goes, QML writing `#AARRGGBB`.
//
// Read back from a property it is a value with channels, as in QML:
// `color(value)` is that value, and it works out its channels when one is
// asked for. They are QColor's: sixteen bits each, in the model the colour
// was made in (`Qt.hsla` keeps its hue), converted with Qt's arithmetic in
// Qt's single precision, so that `Qt.lighter(c).r` is the number Qt gives.

import { allowedColour } from "../guard.js";

const INVALID = 0;
const RGB = 1;
const HSV = 2;
const HSL = 3;

const MAX = 0xffff;
// No hue: a grey.
const NONE = MAX;
const f = Math.fround;
// Qt's qRound, of a float that is never negative here.
const round = (value) => Math.trunc(f(value + 0.5));
const unit = (value) => f(value / MAX);
const scaled = (value) => round(f(value * MAX));
const clamp = (value) => (value > 1 ? 1 : value > 0 ? value : 0);

// The hue of a colour that has one, in hundredths of a degree. The channels
// are whole numbers, and `max` is one of them.
function hue(r, g, b, max, chroma) {
  let sixth;
  if (max === r) {
    sixth = f((g - b) / chroma);
    if (sixth < 0) sixth = f(sixth + 6);
  } else if (max === g) sixth = f(2 + f((b - r) / chroma));
  else sixth = f(4 + f((r - g) / chroma));
  return round(f(sixth * 6000));
}

function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const chroma = max - Math.min(r, g, b);
  if (chroma === 0) return [NONE, 0, max];
  return [hue(r, g, b, max, chroma), scaled(f(chroma / max)), max];
}

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  if (chroma === 0) return [NONE, 0, max];
  const lightness = f(0.5 * (max + min));
  const saturation = f(f(0.5 * chroma) / Math.min(lightness, f(MAX - lightness)));
  return [hue(r, g, b, max, chroma), scaled(saturation), round(lightness)];
}

function hsvToRgb(hue, saturation, value) {
  if (saturation === 0 || hue === NONE) return [value, value, value];
  const h = hue === 36000 ? 0 : f(hue / 6000);
  const s = unit(saturation);
  const v = unit(value);
  const sector = Math.trunc(h);
  const within = f(h - sector);
  const p = f(v * f(1 - s));
  // The channel between the other two: falling in an odd sector, rising in
  // an even one.
  const q = sector & 1 ? f(v * f(1 - f(s * within))) : f(v * f(1 - f(s * f(1 - within))));
  const [r, g, b] = [
    [v, q, p],
    [q, v, p],
    [p, v, q],
    [p, q, v],
    [q, p, v],
    [v, p, q],
  ][sector];
  return [scaled(r), scaled(g), scaled(b)];
}

function hslToRgb(hue, saturation, lightness) {
  if (saturation === 0 || hue === NONE) return [lightness, lightness, lightness];
  if (lightness === 0) return [0, 0, 0];
  const h = hue === 36000 ? 0 : f(hue / 36000);
  const s = unit(saturation);
  const l = unit(lightness);
  const high = l < 0.5 ? f(l * f(1 + s)) : f(f(l + s) - f(l * s));
  const low = f(f(2 * l) - high);
  const third = f(1 / 3);
  const channel = (turn) => {
    if (turn < 0) turn = f(turn + 1);
    else if (turn > 1) turn = f(turn - 1);
    const six = f(turn * 6);
    let value;
    if (six < 1) value = f(low + f(f(high - low) * six));
    else if (f(turn * 2) < 1) value = high;
    else if (f(turn * 3) < 2) value = f(low + f(f(f(high - low) * f(f(2 / 3) - turn)) * 6));
    else value = low;
    const whole = scaled(value);
    return whole === 1 ? 0 : whole;
  };
  return [channel(f(h + third)), channel(h), channel(f(h - third))];
}

// Qt's names: SVG 1.0's, read from Qt 6.11 (`Qt.color(name)`).
const TABLE =
  "aliceblue:f0f8ff,antiquewhite:faebd7,aqua:00ffff,aquamarine:7fffd4,azure:f0ffff,beige:f5f5dc," +
  "bisque:ffe4c4,black:000000,blanchedalmond:ffebcd,blue:0000ff,blueviolet:8a2be2,brown:a52a2a," +
  "burlywood:deb887,cadetblue:5f9ea0,chartreuse:7fff00,chocolate:d2691e,coral:ff7f50," +
  "cornflowerblue:6495ed,cornsilk:fff8dc,crimson:dc143c,cyan:00ffff,darkblue:00008b," +
  "darkcyan:008b8b,darkgoldenrod:b8860b,darkgray:a9a9a9,darkgreen:006400,darkgrey:a9a9a9," +
  "darkkhaki:bdb76b,darkmagenta:8b008b,darkolivegreen:556b2f,darkorange:ff8c00,darkorchid:9932cc," +
  "darkred:8b0000,darksalmon:e9967a,darkseagreen:8fbc8f,darkslateblue:483d8b,darkslategray:2f4f4f," +
  "darkslategrey:2f4f4f,darkturquoise:00ced1,darkviolet:9400d3,deeppink:ff1493,deepskyblue:00bfff," +
  "dimgray:696969,dimgrey:696969,dodgerblue:1e90ff,firebrick:b22222,floralwhite:fffaf0," +
  "forestgreen:228b22,fuchsia:ff00ff,gainsboro:dcdcdc,ghostwhite:f8f8ff,gold:ffd700," +
  "goldenrod:daa520,gray:808080,green:008000,greenyellow:adff2f,grey:808080,honeydew:f0fff0," +
  "hotpink:ff69b4,indianred:cd5c5c,indigo:4b0082,ivory:fffff0,khaki:f0e68c,lavender:e6e6fa," +
  "lavenderblush:fff0f5,lawngreen:7cfc00,lemonchiffon:fffacd,lightblue:add8e6,lightcoral:f08080," +
  "lightcyan:e0ffff,lightgoldenrodyellow:fafad2,lightgray:d3d3d3,lightgreen:90ee90," +
  "lightgrey:d3d3d3,lightpink:ffb6c1,lightsalmon:ffa07a,lightseagreen:20b2aa,lightskyblue:87cefa," +
  "lightslategray:778899,lightslategrey:778899,lightsteelblue:b0c4de,lightyellow:ffffe0," +
  "lime:00ff00,limegreen:32cd32,linen:faf0e6,magenta:ff00ff,maroon:800000,mediumaquamarine:66cdaa," +
  "mediumblue:0000cd,mediumorchid:ba55d3,mediumpurple:9370db,mediumseagreen:3cb371," +
  "mediumslateblue:7b68ee,mediumspringgreen:00fa9a,mediumturquoise:48d1cc,mediumvioletred:c71585," +
  "midnightblue:191970,mintcream:f5fffa,mistyrose:ffe4e1,moccasin:ffe4b5,navajowhite:ffdead," +
  "navy:000080,oldlace:fdf5e6,olive:808000,olivedrab:6b8e23,orange:ffa500,orangered:ff4500," +
  "orchid:da70d6,palegoldenrod:eee8aa,palegreen:98fb98,paleturquoise:afeeee,palevioletred:db7093," +
  "papayawhip:ffefd5,peachpuff:ffdab9,peru:cd853f,pink:ffc0cb,plum:dda0dd,powderblue:b0e0e6," +
  "purple:800080,red:ff0000,rosybrown:bc8f8f,royalblue:4169e1,saddlebrown:8b4513,salmon:fa8072," +
  "sandybrown:f4a460,seagreen:2e8b57,seashell:fff5ee,sienna:a0522d,silver:c0c0c0,skyblue:87ceeb," +
  "slateblue:6a5acd,slategray:708090,slategrey:708090,snow:fffafa,springgreen:00ff7f," +
  "steelblue:4682b4,tan:d2b48c,teal:008080,thistle:d8bfd8,tomato:ff6347,turquoise:40e0d0," +
  "violet:ee82ee,wheat:f5deb3,white:ffffff,whitesmoke:f5f5f5,yellow:ffff00,yellowgreen:9acd32";

let names = null;

function named(text) {
  if (!names) {
    names = new Map();
    for (const entry of TABLE.split(",")) names.set(entry.slice(0, -7), parseInt(entry.slice(-6), 16));
  }
  // Qt takes "Light Blue" for lightblue.
  return names.get(text) ?? names.get(text.replace(/\s+/g, "").toLowerCase());
}

// `digits` hexadecimal digits of `text` from `at`, as sixteen bits.
function hex(text, at, digits) {
  const value = parseInt(text.slice(at, at + digits), 16);
  switch (digits) {
    case 1:
      return value * 0x1111;
    case 2:
      return value * 0x101;
    case 3:
      return (value << 4) | (value >> 8);
    default:
      return value;
  }
}

// What a string says, in the colour it was kept in.
function parse(color) {
  const text = color.source;
  color.ca = MAX;
  color.c0 = color.c1 = color.c2 = 0;
  color.spec = INVALID;
  if (text[0] === "#") {
    const length = text.length - 1;
    if (!/^#[0-9a-f]+$/i.test(text)) return;
    const digits = length === 8 ? 2 : length / 3;
    if (length !== 8 && ![1, 2, 3, 4].includes(digits)) return;
    const start = length === 8 ? 3 : 1;
    if (length === 8) color.ca = hex(text, 1, 2);
    color.c0 = hex(text, start, digits);
    color.c1 = hex(text, start + digits, digits);
    color.c2 = hex(text, start + 2 * digits, digits);
    color.spec = RGB;
    return;
  }
  const rgb = named(text);
  if (rgb !== undefined) {
    color.c0 = (rgb >> 16) * 0x101;
    color.c1 = ((rgb >> 8) & 255) * 0x101;
    color.c2 = (rgb & 255) * 0x101;
    color.spec = RGB;
  } else if (text.trim().toLowerCase() === "transparent") {
    color.ca = 0;
    color.spec = RGB;
  }
}

const parsed = (color) => {
  if (color.spec === undefined) parse(color);
  return color;
};

// A colour's channels in one model, whatever model it is in. An invalid
// colour is black in each.
const ZERO = [0, 0, 0];
const own = (color) => [color.c0, color.c1, color.c2];

function rgb(color) {
  switch (parsed(color).spec) {
    case RGB:
      return own(color);
    case HSV:
      return hsvToRgb(color.c0, color.c1, color.c2);
    case HSL:
      return hslToRgb(color.c0, color.c1, color.c2);
    default:
      return ZERO;
  }
}

function hsv(color) {
  if (parsed(color).spec === HSV) return own(color);
  return color.spec === INVALID ? ZERO : rgbToHsv(...rgb(color));
}

function hsl(color) {
  if (parsed(color).spec === HSL) return own(color);
  return color.spec === INVALID ? ZERO : rgbToHsl(...rgb(color));
}

const turns = (hue) => (hue === NONE ? -1 : f(hue / 36000));

// Sixteen bits as eight: Qt's rounded division by 257.
const eight = (value) => (value + 128 - ((value + 128) >> 8)) >> 8;

// Eight bits of each channel in one number, `0xAARRGGBB`: what is painted.
function packed(color) {
  if (color.argb === undefined) {
    const [r, g, b] = rgb(color);
    color.argb = ((eight(color.ca) << 24) | (eight(r) << 16) | (eight(g) << 8) | eight(b)) >>> 0;
  }
  return color.argb;
}

const digits = (value, count) => value.toString(16).padStart(count, "0");

// An HSV colour in the model `spec`: what `lighter` and `darker` give back.
function fromHsv(spec, alpha, hue, saturation, value) {
  if (spec === HSV) return new Color(null, HSV, alpha, hue, saturation, value);
  const [r, g, b] = hsvToRgb(hue, saturation, value);
  if (spec === RGB) return new Color(null, RGB, alpha, r, g, b);
  return new Color(null, HSL, alpha, ...rgbToHsl(r, g, b));
}

export class Color {
  constructor(source, spec, alpha, c0, c1, c2) {
    this.source = source;
    // Undefined until a string is looked into.
    this.spec = spec;
    this.ca = alpha;
    this.c0 = c0;
    this.c1 = c1;
    this.c2 = c2;
    this.argb = undefined;
    this.painted = undefined;
  }

  get r() {
    return unit(rgb(this)[0]);
  }
  get g() {
    return unit(rgb(this)[1]);
  }
  get b() {
    return unit(rgb(this)[2]);
  }
  get a() {
    return unit(parsed(this).ca);
  }
  get hsvHue() {
    return turns(hsv(this)[0]);
  }
  get hsvSaturation() {
    return unit(hsv(this)[1]);
  }
  get hsvValue() {
    return unit(hsv(this)[2]);
  }
  get hslHue() {
    return turns(hsl(this)[0]);
  }
  get hslSaturation() {
    return unit(hsl(this)[1]);
  }
  get hslLightness() {
    return unit(hsl(this)[2]);
  }
  get valid() {
    return parsed(this).spec !== INVALID;
  }

  // `#rrggbb`, or `#aarrggbb` when it is not opaque. Comparing a colour
  // with a string compares this, as in QML: equal to "#ff0000", not to "red".
  toString() {
    const argb = packed(this);
    return argb >>> 24 === 255 ? `#${digits(argb & 0xffffff, 6)}` : `#${digits(argb, 8)}`;
  }

  toJSON() {
    const { r, g, b, a, hsvHue, hsvSaturation, hsvValue, hslHue, hslSaturation, hslLightness, valid } = this;
    return { r, g, b, a, hsvHue, hsvSaturation, hsvValue, hslHue, hslSaturation, hslLightness, valid };
  }

  // The CSS colour: the string it came from if it came from one. What this
  // worked out before a shell was shown is asked about as well, once one is.
  css() {
    return allowedColour(this.written());
  }

  written() {
    if (this.painted === undefined) {
      if (this.source !== null) this.painted = written(this.source);
      else {
        const argb = packed(this);
        const opaque = argb >>> 24 === 255;
        this.painted = `#${digits(argb & 0xffffff, 6)}${opaque ? "" : digits(argb >>> 24, 2)}`;
      }
    }
    return this.painted;
  }

  alpha(value) {
    parsed(this);
    return new Color(null, this.spec, scaled(clamp(f(value))), this.c0, this.c1, this.c2);
  }

  lighter(factor = 1.5) {
    return lighter(this, Math.floor(factor * 100 + 0.5));
  }

  darker(factor = 2) {
    return darker(this, Math.floor(factor * 100 + 0.5));
  }

  // `Color.of(c).equals("#ff0000")` (Ljos.Core): `Qt.colorEqual`.
  equals(other) {
    return equal(this, other);
  }

  // This colour seen through `over`, by how opaque that is.
  tint(over) {
    const tint = color(over);
    const cover = packed(tint) >>> 24;
    if (cover === 255) return tint;
    if (cover === 0) return this;
    const a = unit(tint.ca);
    const rest = 1 - a;
    const [r, g, b] = rgb(this);
    const [tr, tg, tb] = rgb(tint);
    return rgba(
      unit(tr) * a + unit(r) * rest,
      unit(tg) * a + unit(g) * rest,
      unit(tb) * a + unit(b) * rest,
      a + rest * unit(this.ca),
    );
  }
}

// QColor::lighter, by a percentage: the value is multiplied, and what does
// not fit comes out of the saturation.
function lighter(color, percent) {
  if (!color.valid || !(percent > 0)) return color;
  if (percent < 100) return darker(color, Math.trunc(10000 / percent));
  let [hue, saturation, value] = hsv(color);
  value = Math.trunc((percent * value) / 100);
  if (value > MAX) {
    saturation = Math.max(0, saturation - (value - MAX));
    value = MAX;
  }
  return fromHsv(color.spec, color.ca, hue, saturation, value);
}

function darker(color, percent) {
  if (!color.valid || !(percent > 0)) return color;
  if (percent < 100) return lighter(color, Math.trunc(10000 / percent));
  const [hue, saturation, value] = hsv(color);
  return fromHsv(color.spec, color.ca, hue, saturation, Math.trunc((value * 100) / percent));
}

const invalid = new Color("");
// A literal is looked up, not made again: the same string is the same value.
const interned = new Map();

// The colour value of what a `color` property was given: a string, or a
// colour already.
export function color(value) {
  if (value instanceof Color) return value;
  if (typeof value !== "string") return invalid;
  let made = interned.get(value);
  if (!made) {
    // Strings a program computes without end do not stay here for ever.
    if (interned.size >= 4096) interned.clear();
    interned.set(value, (made = new Color(value)));
  }
  return made;
}

// For a type's `resolve`: `resolve: { color: colorValue }` makes the
// property read as a colour value, whatever it was given.
export const colorValue = (self, own) => color(own());

// A QML colour as a CSS one. Most of what a shell can write ends up here, and
// `background` takes a picture as readily as a colour (docs/LJOS_WEB.md A9).
export const css = (value) => allowedColour(written(value));

function written(value) {
  if (value == null || value === "") return "transparent";
  if (typeof value !== "string") return value instanceof Color ? value.written() : String(value);
  if (value.charCodeAt(0) !== 35) return value;
  // `#AARRGGBB` is CSS's `#RRGGBBAA`.
  if (value.length === 9) return `#${value.slice(3)}${value.slice(1, 3)}`;
  // `#RRRGGGBBB` and `#RRRRGGGGBBBB` are nothing to CSS.
  if (value.length > 9) return `#${digits(packed(color(value)) & 0xffffff, 6)}`;
  return value;
}

// `Qt.rgba`: channels from 0 to 1, clamped.
export function rgba(r, g, b, a = 1) {
  return new Color(null, RGB, scaled(clamp(f(a))), scaled(clamp(f(r))), scaled(clamp(f(g))), scaled(clamp(f(b))));
}

// A hue of -1 is no hue; one full turn is the same hue as none.
const degrees = (h) => (h === -1 ? NONE : round(f(clamp(f(h)) * 36000)));

export function hsla(h, s, l, a = 1) {
  const hue = degrees(h);
  return new Color(null, HSL, scaled(clamp(f(a))), hue === 36000 ? 0 : hue, scaled(clamp(f(s))), scaled(clamp(f(l))));
}

export function hsva(h, s, v, a = 1) {
  return new Color(null, HSV, scaled(clamp(f(a))), degrees(h), scaled(clamp(f(s))), scaled(clamp(f(v))));
}

// Whether two colours are the same colour, as QColor compares them: in the
// same model, channel by channel. (`==` on two colour values compares the
// objects; against a string it compares `toString()`.)
export function equal(a, b) {
  const one = parsed(color(a));
  const other = parsed(color(b));
  if (one.spec !== other.spec || one.ca !== other.ca) return false;
  const first = one.spec === RGB ? one.c0 === other.c0 : one.c0 % 36000 === other.c0 % 36000;
  return first && one.c1 === other.c1 && one.c2 === other.c2;
}

const between = (from, to, shift, t) => {
  const start = (from >>> shift) & 255;
  const value = Math.trunc(start + (((to >>> shift) & 255) - start) * t);
  return (value > 255 ? 255 : value > 0 ? value : 0) * 0x101;
};

// The colour `t` of the way from one to another, as Qt's animations
// interpolate: each of the eight-bit channels on its own, alpha included.
export function mix(from, to, t) {
  const start = packed(color(from));
  const end = packed(color(to));
  return new Color(null, RGB, between(start, end, 24, t), between(start, end, 16, t), between(start, end, 8, t), between(start, end, 0, t));
}

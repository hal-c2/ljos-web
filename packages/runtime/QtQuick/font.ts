// Fonts: QML's `font` group as CSS, and how wide and how tall text set in
// one is. Text is measured here, on a canvas, and not by laying out
// elements: a binding reads `implicitWidth` before anything is in the page.
import { alone, derived, flush, group, kinds, typed } from "../object.ts";
import { given } from "./compute.ts";
import { signal } from "#kernel";
import type { QObject } from "../object.ts";

// What `describe` reads of a `font` group.
export interface FontValue {
  family?: unknown;
  styleName?: unknown;
  weight?: unknown;
  italic?: unknown;
  pixelSize?: unknown;
  capitalization?: unknown;
  underline?: unknown;
  overline?: unknown;
  strikeout?: unknown;
  letterSpacing?: unknown;
  wordSpacing?: unknown;
  kerning?: unknown;
  features?: unknown;
  variableAxes?: unknown;
}

// A font as CSS and the canvas need to know it: what `describe` makes.
// `tab` is how far apart the tab stops are, for text that says.
export interface FontSpec {
  css: string;
  family: string;
  size: number;
  weight: number;
  italic: boolean;
  smallCaps: boolean;
  letterSpacing: number;
  wordSpacing: number;
  kerning: boolean;
  features: string;
  variations: string;
  decoration: string;
  face?: string;
  metrics?: Metrics | null;
  tab?: number;
}

export interface Metrics {
  ascent: number;
  descent: number;
  height: number;
}

export interface Letters {
  xHeight: number;
  capitalHeight: number;
}

// A face's proportions to its size.
interface Face {
  ascent: number;
  descent: number;
  letters: Letters | null;
}

// A character's advance, loose and on Qt's grid, its overhang and its ink.
interface Glyph {
  loose: number;
  kept: number;
  hang: number;
  left: number;
  right: number;
}

// An object with a `font`, as the group's own bindings read it.
type Fonted = QObject & {
  font: { weight: number; bold: boolean; size: number; pixelSize: number; pointSize: number };
};

// `Font.Bold`, `Font.AllUppercase`: the enums of the `font` value type.
export const Font = Object.freeze({
  Thin: 100,
  ExtraLight: 200,
  Light: 300,
  Normal: 400,
  Medium: 500,
  DemiBold: 600,
  Bold: 700,
  ExtraBold: 800,
  Black: 900,
  MixedCase: 0,
  AllUppercase: 1,
  AllLowercase: 2,
  SmallCaps: 3,
  Capitalize: 4,
  PreferDefaultHinting: 0,
  PreferNoHinting: 1,
  PreferVerticalHinting: 2,
  PreferFullHinting: 3,
  StyleNormal: 0,
  StyleItalic: 1,
  StyleOblique: 2,
});

// The `font` property of a type that has one. Bold and weight say the same
// thing, and so do the two sizes: each is computed from the other when only
// the other was given. Qt's default font is 9 points, 12 pixels at 96 dpi,
// and it rounds a point size to whole pixels.
export const font = group({
  family: "Sans Serif",
  styleName: "",
  bold: derived((self: Fonted) => self.font.weight >= 600),
  weight: derived((self: Fonted) => (given(self, "font", "bold") && self.font.bold ? 700 : 400)),
  italic: false,
  underline: false,
  overline: false,
  strikeout: false,
  // Ljós's name for the pixel size, a second name for it on every font
  // (ljos-ui's type table has `size` in `QtQuick.font`): a file of either
  // API may say `font.size`, and what it says is the pixel size.
  size: alone(
    typed(
      kinds.pixels,
      derived((self: Fonted) => self.font.pixelSize),
    ),
  ),
  pixelSize: typed(
    kinds.pixels,
    derived((self: Fonted) =>
      given(self, "font", "size")
        ? self.font.size
        : given(self, "font", "pointSize")
          ? Math.round((self.font.pointSize * 96) / 72)
          : 12,
    ),
  ),
  pointSize: typed(
    kinds.points,
    derived((self: Fonted) => (given(self, "font", "pixelSize") || given(self, "font", "size") ? (self.font.pixelSize * 72) / 96 : 9)),
  ),
  capitalization: 0,
  letterSpacing: 0,
  wordSpacing: 0,
  kerning: true,
  features: undefined as unknown,
  variableAxes: undefined as unknown,
});

// Qt asks fontconfig for these; the browser has its own names for them. A
// family nobody has falls back to the default font, as it does in Qt.
const GENERIC: Readonly<Record<string, string | undefined>> = {
  "sans serif": "sans-serif",
  "sans-serif": "sans-serif",
  sans: "sans-serif",
  serif: "serif",
  monospace: "monospace",
  mono: "monospace",
  cursive: "cursive",
  fantasy: "fantasy",
  "system-ui": "system-ui",
};
const GENERICS = new Set<unknown>(Object.values(GENERIC));

const stacks = new Map<unknown, string>();

function families(names: unknown): string {
  let stack = stacks.get(names);
  if (stack) return stack;
  const list = String(names)
    .split(",")
    .map((name) => name.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean)
    .map((name) => GENERIC[name.toLowerCase()] ?? `"${name.replace(/["\\]/g, "")}"`);
  if (!list.some((name) => GENERICS.has(name))) list.push("sans-serif");
  stacks.set(names, (stack = list.join(", ")));
  return stack;
}

// `font.styleName: "Bold Italic"`: a face asked for by its name. CSS finds a
// face by weight and slant, so the name is read for those.
const WEIGHTS: readonly (readonly [RegExp, number])[] = [
  [/thin|hairline/, 100],
  [/(extra|ultra) ?light/, 200],
  [/light/, 300],
  [/regular|normal|book/, 400],
  [/medium/, 500],
  [/(demi|semi) ?bold/, 600],
  [/(extra|ultra) ?bold/, 800],
  [/bold/, 700],
  [/black|heavy/, 900],
];

// `{ liga: 0 }` as `"liga" 0`: font features and variable axes.
function settings(values: unknown): string {
  if (!values || typeof values !== "object") return "";
  return Object.entries(values)
    .map(([tag, value]) => `"${tag.replace(/["\\]/g, "")}" ${Number(value)}`)
    .join(", ");
}

const specs = new Map<string, FontSpec>();

function intern(spec: FontSpec): FontSpec {
  // What decides a string's width, and so what a measurement is kept under.
  spec.face = `${spec.css}|${spec.letterSpacing}|${spec.wordSpacing}|${spec.kerning}|${spec.features}|${spec.variations}`;
  const key = `${spec.face}|${spec.decoration}`;
  const known = specs.get(key);
  if (known) return known;
  spec.metrics = null;
  specs.set(key, spec);
  return spec;
}

// A font as what CSS and the canvas need to know. Equal fonts are the same
// object, so a memo that returns one does not disturb what depends on it.
export function describe(font: FontValue): FontSpec {
  // A font value names only what it sets: what it leaves out is Qt's
  // default font's, as `Font` fills it (QtQml/application.ts).
  let weight = font.weight === undefined ? 400 : Number(font.weight);
  let italic = Boolean(font.italic);
  const named = String(font.styleName ?? "").toLowerCase();
  if (named) {
    weight = WEIGHTS.find(([pattern]) => pattern.test(named))?.[1] ?? 400;
    italic = /italic|oblique/.test(named);
  }
  const size = Math.max(Number(font.pixelSize) || 0, 0);
  const family = families(font.family);
  const smallCaps = font.capitalization === 3;
  const lines: string[] = [];
  if (font.underline) lines.push("underline");
  if (font.overline) lines.push("overline");
  if (font.strikeout) lines.push("line-through");
  return intern({
    css: `${italic ? "italic " : ""}${smallCaps ? "small-caps " : ""}${weight} ${size}px ${family}`,
    family,
    size,
    weight,
    italic,
    smallCaps,
    letterSpacing: Number(font.letterSpacing) || 0,
    wordSpacing: Number(font.wordSpacing) || 0,
    kerning: font.kerning !== false,
    features: settings(font.features),
    variations: settings(font.variableAxes),
    decoration: lines.join(" "),
  });
}

// The same font at another size: what `fontSizeMode` tries.
export function resized(spec: FontSpec, size: number): FontSpec {
  if (size === spec.size) return spec;
  const { italic, smallCaps, weight, family } = spec;
  return intern({
    ...spec,
    size,
    css: `${italic ? "italic " : ""}${smallCaps ? "small-caps " : ""}${weight} ${size}px ${family}`,
  });
}

// Gives an element the font. The shorthand resets `line-height`: whoever
// wants one sets it afterwards.
export function dress(style: CSSStyleDeclaration, spec: FontSpec): void {
  style.font = spec.css;
  style.letterSpacing = spec.letterSpacing ? `${spec.letterSpacing}px` : "";
  style.wordSpacing = spec.wordSpacing ? `${spec.wordSpacing}px` : "";
  style.fontKerning = spec.kerning ? "" : "none";
  style.fontFeatureSettings = spec.features;
  style.fontVariationSettings = spec.variations;
  style.textDecorationLine = spec.decoration;
}

// `font.capitalization`, for text the runtime lays out itself.
export function capitalized(text: string, mode: unknown): string {
  if (mode === 1) return text.toUpperCase();
  if (mode === 2) return text.toLowerCase();
  if (mode === 4) return text.replace(/(^|\s)(\S)/g, (_: string, space: string, first: string) => space + first.toUpperCase());
  return text;
}

// Read by whatever measures: it is measured again when a web font arrives,
// since until then the text was set in the fallback.
const [version, setVersion] = signal(0);
export const fonts = version;

const widths = new Map<string, Map<string, number>>();
const glyphs = new Map<string, Map<string, Glyph>>();
const faces = new Map<string, Face>();
// What the canvas is set to, so that it is not set again for each string.
let selected: string | null = null;

export function fontsChanged() {
  widths.clear();
  glyphs.clear();
  faces.clear();
  selected = null;
  for (const spec of specs.values()) spec.metrics = null;
  setVersion((count: number) => count + 1);
}

document.fonts?.addEventListener("loadingdone", () => {
  fontsChanged();
  flush();
});

let context: CanvasRenderingContext2D | undefined;
// Features and axes are not something a canvas can be told: an element is.
let ruler: HTMLSpanElement | undefined;

function select(css: string, spec?: FontSpec): CanvasRenderingContext2D {
  context ??= document.createElement("canvas").getContext("2d")!;
  if (selected !== css) {
    context.font = css;
    selected = css;
  }
  if (spec) {
    context.fontKerning = spec.kerning ? "auto" : "none";
    context.fontVariantCaps = spec.smallCaps ? "small-caps" : "normal";
  }
  return context;
}

// Qt places glyphs on a grid of 64ths of a pixel: every advance is rounded
// down to it, and the kerning to the nearest. The canvas adds up advances
// that were not rounded, which over a line is the better part of a pixel,
// and a word that just fits in Qt would not here. So what each character
// loses is taken off what the canvas says.
const SUBPIXEL = 64;

function glyph(spec: FontSpec, char: string): Glyph {
  let known = glyphs.get(spec.css);
  if (!known) {
    if (glyphs.size > 256) glyphs.clear();
    glyphs.set(spec.css, (known = new Map()));
  }
  let found = known.get(char);
  if (!found) {
    const box = select(spec.css, spec).measureText(char);
    const kept = Math.floor(box.width * SUBPIXEL + 1e-3);
    // The glyph's box in whole pixels, as FreeType gives it to Qt, against
    // its advance in whole pixels: how far its ink reaches past where the
    // next glyph would start.
    const hang = Math.max(Math.ceil(box.actualBoundingBoxRight - 1e-3) - Math.round(kept / SUBPIXEL), 0);
    found = { loose: box.width, kept, hang, left: -box.actualBoundingBoxLeft, right: box.actualBoundingBoxRight };
    known.set(char, found);
  }
  return found;
}

function gridded(spec: FontSpec, text: string, total: number): number {
  let loose = 0;
  let kept = 0;
  for (const char of text) {
    const each = glyph(spec, char);
    loose += each.loose;
    kept += each.kept;
  }
  return (kept + Math.round((total - loose) * SUBPIXEL)) / SUBPIXEL;
}

// The last character of a text, both halves of it.
function final(text: string): string {
  const length = text.length;
  const code = text.charCodeAt(length - 1);
  return code >= 0xdc00 && code <= 0xdfff && length > 1 ? text.slice(-2) : text[length - 1]!;
}

// How far the last glyph of a line overhangs its advance: an `f`, a `k`,
// most of an italic. Qt counts it in the width of the line, so that a line
// that fits does not paint outside it.
export function overhang(spec: FontSpec, text: string): number {
  return text === "" ? 0 : glyph(spec, final(text)).hang;
}

// Where the ink of a string is, in whole pixels about the start of its
// baseline: what Qt's bounding rectangles are made of. The right edge is
// the last glyph's, placed as Qt places its box.
export function inked(spec: FontSpec, text: string): { left: number; right: number; ascent: number; descent: number } {
  if (text === "") return { left: 0, right: 0, ascent: 0, descent: 0 };
  const last = glyph(spec, final(text));
  const left = Math.floor(glyph(spec, String.fromCodePoint(text.codePointAt(0)!)).left + 1e-3);
  const start = measure(spec, text) - last.kept / SUBPIXEL;
  const box = select(spec.css, spec).measureText(text);
  return {
    left,
    right: Math.ceil(start + last.left - 1e-3) + last.right - last.left,
    ascent: Math.ceil(box.actualBoundingBoxAscent - 1e-3),
    descent: Math.ceil(box.actualBoundingBoxDescent - 1e-3),
  };
}

function measured(spec: FontSpec, text: string): number {
  if (!spec.features && !spec.variations) return gridded(spec, text, select(spec.css, spec).measureText(text).width);
  if (!ruler) {
    ruler = document.createElement("span");
    ruler.style.cssText = "position:fixed;left:0;top:0;visibility:hidden;white-space:pre;pointer-events:none";
    document.body.append(ruler);
  }
  ruler.style.font = spec.css;
  ruler.style.fontKerning = spec.kerning ? "" : "none";
  ruler.style.fontFeatureSettings = spec.features;
  ruler.style.fontVariationSettings = spec.variations;
  ruler.textContent = text;
  return ruler.getBoundingClientRect().width;
}

// How far `text` advances, without keeping the answer: for the pieces a line
// breaker or an elision tries. Qt adds the letter spacing after every
// character, the last one too, and the word spacing after every space.
export function measure(spec: FontSpec, text: string): number {
  if (text === "") return 0;
  if (text.includes("\t")) return tabbed(spec, text);
  let width = measured(spec, text);
  if (spec.letterSpacing) width += spec.letterSpacing * text.length;
  if (spec.wordSpacing) {
    for (let index = text.indexOf(" "); index >= 0; index = text.indexOf(" ", index + 1)) width += spec.wordSpacing;
  }
  return width;
}

// A tab goes on to the next of the stops there are along a line, every 80
// pixels unless the text says how far apart (`spec.tab`): from one it is on,
// to the one after. `text` is taken to start where its line does.
const TAB = 80;
function tabbed(spec: FontSpec, text: string): number {
  const apart = spec.tab !== undefined && spec.tab > 0 ? spec.tab : TAB;
  const pieces = text.split("\t");
  let at = 0;
  for (let index = 0; index < pieces.length; index++) {
    at += advance(spec, pieces[index]!);
    if (index + 1 < pieces.length) at = (Math.floor(at / apart) + 1) * apart;
  }
  return at;
}

// What `text` takes of the room there is when it is cut to fit: as Qt counts
// it, a tab is as wide as the stops are apart, wherever in the line it is.
function taking(spec: FontSpec, text: string): number {
  if (!text.includes("\t")) return measure(spec, text);
  const apart = spec.tab !== undefined && spec.tab > 0 ? spec.tab : TAB;
  let width = 0;
  for (const piece of text.split("\t")) width += advance(spec, piece) + apart;
  return width - apart;
}

// The same, kept: a label, a word. Long strings are few and each belongs to
// one object, which keeps its own layout.
export function advance(spec: FontSpec, text: string): number {
  if (text.length > 64 || text.includes("\t")) return measure(spec, text);
  let known = widths.get(spec.face!);
  if (!known) widths.set(spec.face!, (known = new Map()));
  let width = known.get(text);
  if (width === undefined) {
    if (known.size > 4096) known.clear();
    known.set(text, (width = measure(spec, text)));
  }
  return width;
}

// A face's ascent, descent and letter heights as fractions of its size. The
// browser rounds what it reports to whole pixels, so they are read at a size
// where that no longer matters: the largest of these the browser keeps.
// Firefox sets no font larger than 2000px, in a canvas or in CSS, so a face
// read at 10000px there was read at a fifth of it, and every line came out a
// fifth as tall as its text.
const SIZES = [10000, 2000, 1000];
let large: number | undefined;

function largest(): number {
  if (large === undefined) {
    const unit = select("1000px sans-serif").measureText("x").width / 1000;
    large =
      SIZES.find((size) => {
        const each = select(`${size}px sans-serif`).measureText("x").width / size;
        return Math.abs(each - unit) <= unit * 0.01;
      }) ?? 1000;
  }
  return large;
}

function proportions(spec: FontSpec): Face {
  const key = `${spec.italic ? "italic " : ""}${spec.weight} ${spec.family}`;
  let known = faces.get(key);
  if (!known) {
    const size = largest();
    const canvas = select(`${spec.italic ? "italic " : ""}${spec.weight} ${size}px ${spec.family}`);
    const box = canvas.measureText("x");
    known = { ascent: box.fontBoundingBoxAscent / size, descent: box.fontBoundingBoxDescent / size, letters: null };
    faces.set(key, known);
  }
  return known;
}

// FreeType gives Qt its metrics in 64ths of a pixel, rounded down.
const fixed = (value: number): number => Math.floor(value * 64 + 1e-6) / 64;

// The font's metrics at its size. A line is as tall as Qt makes it: the
// ascent and the descent, rounded up to a whole pixel.
export function metrics(spec: FontSpec): Metrics {
  if (spec.metrics) return spec.metrics;
  const face = proportions(spec);
  const ascent = fixed(face.ascent * spec.size);
  const descent = fixed(face.descent * spec.size);
  return (spec.metrics = {
    ascent,
    descent,
    height: Math.ceil(ascent + descent),
  });
}

// How tall the font says an x and a capital are. The canvas does not pass
// that on, but CSS has a unit for each, so an element is measured.
let gauge: HTMLDivElement | undefined;

export function letters(spec: FontSpec): Letters {
  const face = proportions(spec);
  if (!face.letters) {
    if (!gauge) {
      gauge = document.createElement("div");
      gauge.style.cssText = "position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;width:1ex;height:1cap";
      document.body.append(gauge);
    }
    const size = largest();
    gauge.style.font = `${spec.italic ? "italic " : ""}${spec.weight} ${size}px ${spec.family}`;
    const box = gauge.getBoundingClientRect();
    // A browser without the `cap` unit: the height of an H is the next best.
    const capital = box.height || select(gauge.style.font).measureText("H").actualBoundingBoxAscent;
    face.letters = { xHeight: box.width / size, capitalHeight: capital / size };
  }
  const { xHeight, capitalHeight } = face.letters;
  return { xHeight: Math.round(xHeight * spec.size * 64) / 64, capitalHeight: Math.round(capitalHeight * spec.size * 64) / 64 };
}

export const ELLIPSIS = "…";

// The largest count up to `most` for which `fits` holds, given that it holds
// for every smaller one.
function longest(most: number, fits: (count: number) => boolean): number {
  let low = 0;
  let high = most;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (fits(middle)) low = middle;
    else high = middle - 1;
  }
  return low;
}

// How many characters of `text`, from `start`, fit in `width`: one at least.
export function fitting(spec: FontSpec, text: string, start: number, width: number): number {
  return Math.max(
    longest(text.length - start, (count) => {
      const piece = text.slice(start, start + count);
      return measure(spec, piece) + overhang(spec, piece) <= width;
    }),
    1,
  );
}

// `text` cut to fit `width`, with an ellipsis where the cut is: `mode` is
// Text's `elide` (left 0, right 1, middle 2). As Qt does it: what is kept is
// strictly narrower than the room the ellipsis leaves, and the middle keeps
// as many characters from one end as from the other.
export function elided(spec: FontSpec, text: string, mode: number, width: number): string {
  if (mode === 3 || measure(spec, text) <= width) return text;
  const room = width - advance(spec, ELLIPSIS);
  if (room < 0) return "";
  const length = text.length;
  if (mode === 1) {
    const kept = longest(length - 1, (count) => taking(spec, text.slice(0, count)) < room);
    return text.slice(0, kept) + ELLIPSIS;
  }
  if (mode === 0) {
    const kept = longest(length - 1, (count) => taking(spec, text.slice(length - count)) < room);
    return ELLIPSIS + text.slice(length - kept);
  }
  const kept = longest(
    (length - 1) >> 1,
    (count) => taking(spec, text.slice(0, count)) + taking(spec, text.slice(length - count)) < room,
  );
  return text.slice(0, kept) + ELLIPSIS + text.slice(length - kept);
}

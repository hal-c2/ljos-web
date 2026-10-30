// Image, BorderImage: a picture, and how it fills the item.
//
// The browser loads and paints it. What QML reads of it is computed here as
// Qt computes it: the size it would have been loaded at, which is the item's
// implicit size, and the rectangle it is painted in.
import { signal } from "#kernel";
import { defineType, derived, effect, flush, group, located } from "../object.js";
import { given, lazy, rules, sized } from "./compute.js";
import { Rect } from "../QtQml/values.js";
import { Item } from "./Item.js";

rules(`
.qq-image { position: absolute; left: 0; top: 0; box-sizing: border-box; overflow: hidden; background-repeat: no-repeat; }
.qq-image > canvas { position: absolute; left: 0; top: 0; }
`);

const NULL = 0;
const READY = 1;
const LOADING = 2;
const ERROR = 3;
const NONE = Object.freeze({ width: 0, height: 0 });

// What Qt scales to any size asked for; other pictures it only scales down.
const SCALABLE = /\.svgz?(?:[?#]|$)|^data:image\/svg\+xml/i;

// A picture being loaded: how far it is, and its size once it is there.
export function picture(url) {
  const [status, setStatus] = signal(LOADING);
  const record = { url, status, width: 0, height: 0, scalable: SCALABLE.test(url), frames: null };
  record.settle = (state) => {
    setStatus(state);
    flush();
  };
  return record;
}

// `.svgz`: a drawing, compressed. A browser shows one only when what serves
// it says that it is compressed, which few do: it is opened here.
const PACKED = /\.svgz(?:[?#]|$)/i;

async function opened(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  // Already opened by the browser, where the server did say.
  const packed = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const drawing = packed ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).blob() : bytes;
  return URL.createObjectURL(new Blob([drawing], { type: "image/svg+xml" }));
}

// A picture named as a drawing that is none. Qt goes by what is in a file;
// a browser goes by what the file is served as, which goes by its name. It
// is handed to the browser again as nothing in particular, to look into.
async function unnamed(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return URL.createObjectURL(new Blob([await response.arrayBuffer()]));
}

// How many of QtSvg's units one of each is: it takes an inch for 90.
const UNITS = { "": 1, px: 1, pt: 1, pc: 1, mm: 3.543307, cm: 35.43307, in: 90, em: 0, ex: 0, "%": 1 };
const LENGTH = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(px|pt|pc|mm|cm|in|em|ex|%)?\s*$/i;

// A side of a drawing as the file says it: how long, and whether that is a
// percentage.
function side(text) {
  const [, number, unit = ""] = LENGTH.exec(text ?? "") ?? [];
  if (number === undefined) return [0, false];
  return [Math.trunc(Number(number) * UNITS[unit.toLowerCase()]), unit === "%"];
}

function box(text) {
  const numbers = (text ?? "").trim().split(/[\s,]+/).map(Number);
  return numbers.length === 4 && numbers.every(Number.isFinite) && numbers[2] > 0 && numbers[3] > 0 ? numbers : null;
}

// The size QtSvg makes of a drawing, which is not the browser's:
// - `width` and `height`, cut down to whole numbers. An inch is 90 of them,
//   and `mm` and `cm` go by that; `pt` and `pc` count as they are written.
//   A percentage is of the `viewBox`.
// - where either is missing, nothing, or in `em` or `ex`: the `viewBox`,
//   rounded.
// Nothing for a file that says neither a size nor a `viewBox`, which Qt
// gives the bounds of what it draws. `view` is the `viewBox` it has.
export function measured(root) {
  const view = box(root.getAttribute("viewBox"));
  const [wide, wideOf] = side(root.getAttribute("width"));
  const [tall, tallOf] = side(root.getAttribute("height"));
  const said = wide > 0 && tall > 0;
  if (!view && (!said || wideOf || tallOf)) return null;
  const width = !said ? Math.round(view[2]) : wideOf ? Math.round(0.01 * wide * view[2]) : wide;
  const height = !said ? Math.round(view[3]) : tallOf ? Math.round(0.01 * tall * view[3]) : tall;
  return { width, height, view };
}

// That size of the drawing at `url`, where it can be read.
async function drawing(url) {
  const parsed = new DOMParser().parseFromString(await (await fetch(url)).text(), "image/svg+xml");
  const root = parsed.documentElement;
  if (root.localName !== "svg" || parsed.querySelector("parsererror")) return null;
  const size = measured(root);
  return size && { width: size.width, height: size.height };
}

function fetched(url) {
  const record = picture(url);
  const element = document.createElement("img");
  let size = null;
  element.onload = () => {
    record.width = element.naturalWidth;
    record.height = element.naturalHeight;
    if (record.scalable && size) Object.assign(record, size);
    record.settle(READY);
  };
  // A drawing is as big as Qt makes it, where the file can be read; one
  // from somewhere that does not let a page read it, as the browser does.
  // It is read before the browser is given it: what shows the picture is
  // told of it as the browser has it, and paints it without waiting again.
  const show = (address) => {
    const shown = () => (element.src = address);
    if (record.scalable) drawing(address).then((found) => (size = found), () => {}).then(shown);
    else shown();
  };
  const failed = () => record.settle(ERROR);
  element.onerror = failed;
  if (record.scalable && !url.startsWith("data:")) {
    element.onerror = () => {
      element.onerror = failed;
      // No drawing, so nothing that is made at any size asked for.
      record.scalable = false;
      unnamed(url).then((address) => (element.src = record.url = address), failed);
    };
  }
  if (!PACKED.test(url)) show(url);
  // What is shown is what was opened.
  else opened(url).then((address) => show((record.url = address)), failed);
  return record;
}

// One load for every item that shows the same picture. `load` is how: an
// animation is decoded, a picture is not.
export function shared(known, url, load) {
  let record = known.get(url);
  if (!record) {
    known.set(url, (record = load(url)));
    // Not kept when it failed: the next item to ask tries again.
    const forget = () => known.get(url) === record && record.status() === ERROR && known.delete(url);
    record.settle = ((settle) => (state) => {
      settle(state);
      forget();
    })(record.settle);
  }
  return record;
}

const pictures = new Map();

// The picture at `url` once it is there, or is known not to come: for what
// has a file at hand. Qt shows such a picture as its Image is made, so what
// is written for one reads its size then; a browser has yet to look into
// it, unless it was asked to before.
export function ready(url) {
  const record = shared(pictures, url, fetched);
  if (record.status() !== LOADING) return Promise.resolve();
  return new Promise((resolve) => {
    record.settle = ((settle) => (state) => {
      settle(state);
      resolve();
    })(record.settle);
  });
}

// The picture once it is there, with its size; before that, no size.
function arrived(self) {
  const record = self.$image.record();
  return record && record.status() === READY ? record : NONE;
}

// The size Qt would load the picture at: its own, or the one `sourceSize`
// asks for. A drawing is loaded at exactly that when both sides are given;
// otherwise the picture keeps its shape, at the smaller of the two sizes the
// sides ask for, or the bigger where the fill mode keeps its shape too. And
// what is not a drawing is only made bigger for such a fill mode.
function loaded(self) {
  const record = arrived(self);
  const { width, height, scalable } = record;
  // Qt's size is in whole pixels.
  const wide = given(self, "sourceSize", "width") ? Math.round(Number(self.sourceSize.width)) || 0 : 0;
  const tall = given(self, "sourceSize", "height") ? Math.round(Number(self.sourceSize.height)) || 0 : 0;
  if ((wide <= 0 && tall <= 0) || !width || !height) return record;
  const keeps = self.$keeps();
  if (scalable && !keeps && wide > 0 && tall > 0) return { width: wide, height: tall };
  let ratio = 0;
  if (wide > 0 && (keeps || scalable || wide < width)) ratio = wide / width;
  if (tall > 0 && (keeps || scalable || tall < height)) {
    const other = tall / height;
    if (ratio === 0 || (keeps ? other > ratio : other < ratio)) ratio = other;
  }
  return ratio > 0 ? { width: Math.round(width * ratio), height: Math.round(height * ratio) } : record;
}

// The part of the picture `sourceClipRect` says is to be loaded, in the
// picture as big as it is loaded; nothing for a rectangle with nothing in
// it, which Qt takes no notice of.
function cut(self) {
  const rect = self.sourceClipRect;
  const [x, y, width, height] = [rect.x, rect.y, rect.width, rect.height].map((side) => Math.round(Number(side)) || 0);
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

// What the item has of the picture: all of it as it is loaded, or the part
// it is cut to, which is as big as it is said to be even where the picture
// ends before it does.
function held(self) {
  const whole = self.$image.whole();
  return (whole.width && whole.height && cut(self)) || whole;
}

const UNCUT = Object.freeze(new Rect(0, 0, 0, 0));

// What Image, BorderImage and AnimatedImage share: a source and its loading.
export const ImageBase = defineType("ImageBase", Item, {
  properties: {
    source: "",
    // The browser loads every picture off the main thread: there is nothing
    // for this one to choose.
    asynchronous: false,
    cache: true,
    mirror: false,
    mirrorVertically: false,
    // Reads as the picture's own size until one is asked for.
    sourceSize: group({
      width: derived((self) => (given(self, "sourceSize", "height") ? 0 : self.$image.size().width)),
      height: derived((self) => (given(self, "sourceSize", "width") ? 0 : self.$image.size().height)),
    }),
    sourceClipRect: UNCUT,
    status: derived((self) => self.$image.record()?.status() ?? NULL),
    progress: derived((self) => (self.status === READY ? 1 : 0)),
    implicitWidth: derived((self) => self.$image.size().width),
    implicitHeight: derived((self) => self.$image.size().height),
  },
  // `sourceClipRect = undefined` is all of the picture again.
  resolve: { sourceClipRect: (self, own) => own() ?? UNCUT },
  enums: { Null: NULL, Ready: READY, Loading: LOADING, Error: ERROR },
  methods: {
    // Whether the picture is loaded for a fill mode that keeps its shape.
    $keeps() {
      return false;
    },
  },
  setup(self) {
    self.$load = fetched;
    self.$pictures = pictures;
    self.$image = {
      record: lazy(self, () => {
        const url = located(String(self.source ?? ""));
        if (!url) return null;
        // `cache: false`: a load of its own, whatever the others have.
        return self.cache ? shared(self.$pictures, url, self.$load) : self.$load(url);
      }),
      whole: lazy(self, () => loaded(self), NONE),
      size: lazy(self, () => held(self), NONE),
    };
  },
});

const FIT = 1;
const CROP = 2;
const TILE = 3;
const TILE_VERTICALLY = 4;
const TILE_HORIZONTALLY = 5;
const PAD = 6;

// The size the picture is painted at, which for the modes that keep its
// shape is not the item's.
function painted(self) {
  const { width, height } = self.$image.size();
  const mode = self.fillMode;
  if (mode === PAD) return { width, height };
  if (mode !== FIT && mode !== CROP) return { width: self.width, height: self.height };
  if (!width || !height) return NONE;
  if (mode === CROP) {
    const scale = Math.max(self.width / width, self.height / height);
    return { width: width * scale, height: height * scale };
  }
  // A side nothing decides is the picture's, not the item's: the item's is
  // computed from this.
  const wide = sized(self, "width") ? self.width : width;
  const tall = sized(self, "height") ? self.height : height;
  return wide / width <= tall / height
    ? { width: wide, height: (wide / width) * height }
    : { width: (tall / height) * width, height: tall };
}

// Where in the room left over something starts: `Image.AlignLeft` and the
// like. Qt places on whole pixels.
function along(alignment, room, centre, far) {
  return alignment === centre ? Math.trunc(room / 2) : alignment === far ? Math.ceil(room) : 0;
}

// Where the picture goes: the part of the item it is painted in (`box`),
// and in that the rectangle one copy of it takes (`inner`).
export function geometry(self) {
  const pix = self.$image.size();
  const width = self.width;
  const height = self.height;
  const mode = self.fillMode;
  const shown = self.$image.painted();
  const wide = mode === FIT ? shown.width : pix.width;
  const tall = mode === FIT ? shown.height : pix.height;
  const x = along(self.horizontalAlignment, width - wide, 4, 2);
  const y = along(self.verticalAlignment, height - tall, 128, 64);
  switch (mode) {
    case FIT:
      return { box: [x, y, wide, tall], inner: [0, 0, wide, tall], repeat: "no-repeat" };
    case CROP:
      return {
        box: [0, 0, width, height],
        inner: [
          along(self.horizontalAlignment, width - shown.width, 4, 2),
          along(self.verticalAlignment, height - shown.height, 128, 64),
          shown.width,
          shown.height,
        ],
        repeat: "no-repeat",
      };
    case TILE:
      return { box: [0, 0, width, height], inner: [x, y, wide, tall], repeat: "repeat" };
    case TILE_VERTICALLY:
      return { box: [0, 0, width, height], inner: [0, y, width, tall], repeat: "repeat-y" };
    case TILE_HORIZONTALLY:
      return { box: [0, 0, width, height], inner: [x, 0, wide, height], repeat: "repeat-x" };
    case PAD:
      return {
        box: [Math.max(x, 0), Math.max(y, 0), Math.min(wide, width), Math.min(tall, height)],
        inner: [Math.min(x, 0), Math.min(y, 0), wide, tall],
        repeat: "no-repeat",
      };
    default:
      return { box: [0, 0, width, height], inner: [0, 0, width, height], repeat: "no-repeat" };
  }
}

const address = (url) => `url(${JSON.stringify(url)})`;
// A drawing fills what it is painted in, as the picture Qt makes of it does:
// left to itself the browser would keep its shape.
export const drawn = (record) =>
  record.scalable && !record.url.includes("#") ? `${record.url}#svgView(preserveAspectRatio(none))` : record.url;
// A mirrored picture is turned over where it is.
const flipped = (self) =>
  self.mirror || self.mirrorVertically ? `scale(${self.mirror ? -1 : 1}, ${self.mirrorVertically ? -1 : 1})` : "";
const rendering = (self) => (self.smooth ? "" : "pixelated");

function face(self) {
  const element = document.createElement("div");
  element.className = "qq-image";
  self.$node.append(element);
  return (self.$face = element);
}

export const Image = defineType("Image", ImageBase, {
  properties: {
    fillMode: 0,
    horizontalAlignment: 4,
    verticalAlignment: 128,
    paintedWidth: derived((self) => self.$image.painted().width),
    paintedHeight: derived((self) => self.$image.painted().height),
    // With `Image.PreserveAspectFit` and one side given, the other follows
    // from the picture's shape.
    implicitWidth: derived((self) =>
      self.fillMode === FIT && sized(self, "height") && !sized(self, "width")
        ? self.$image.painted().width
        : self.$image.size().width,
    ),
    implicitHeight: derived((self) =>
      self.fillMode === FIT && sized(self, "width") && !sized(self, "height")
        ? self.$image.painted().height
        : self.$image.size().height,
    ),
  },
  enums: {
    Stretch: 0,
    PreserveAspectFit: FIT,
    PreserveAspectCrop: CROP,
    Tile: TILE,
    TileVertically: TILE_VERTICALLY,
    TileHorizontally: TILE_HORIZONTALLY,
    Pad: PAD,
    AlignLeft: 1,
    AlignRight: 2,
    AlignHCenter: 4,
    AlignTop: 32,
    AlignBottom: 64,
    AlignVCenter: 128,
  },
  methods: {
    $keeps() {
      return this.fillMode === FIT || this.fillMode === CROP;
    },
  },
  setup(self) {
    const style = face(self).style;
    self.$image.painted = lazy(self, () => painted(self), NONE);
    effect(
      () => {
        const record = self.$image.record();
        if (!record || record.status() !== READY) return null;
        // An animation paints its frames itself, in the same place.
        const placed = { ...geometry(self), url: record.frames ? "" : drawn(record), flip: flipped(self), rendering: rendering(self) };
        // A picture cut to a part is all of it, drawn so much bigger and
        // further up and left that the part is where a picture would be:
        // what an element shows of its background ends where it does. (A
        // part cannot be repeated so: tiled, more of the picture shows.)
        const part = cut(self);
        const whole = self.$image.whole();
        if (part && whole.width && whole.height) {
          const [x, y, wide, tall] = placed.inner;
          const across = wide / part.width;
          const down = tall / part.height;
          placed.inner = [x - part.x * across, y - part.y * down, whole.width * across, whole.height * down];
        }
        return placed;
      },
      (next) => {
        style.display = next ? "" : "none";
        if (!next) return void (style.backgroundImage = "");
        const [left, top, width, height] = next.box;
        const [x, y, wide, tall] = next.inner;
        style.left = `${left}px`;
        style.top = `${top}px`;
        style.width = `${width}px`;
        style.height = `${height}px`;
        style.backgroundImage = next.url ? address(next.url) : "";
        style.backgroundSize = `${wide}px ${tall}px`;
        style.backgroundPosition = `${x}px ${y}px`;
        style.backgroundRepeat = next.repeat;
        style.transform = next.flip;
        style.imageRendering = next.rendering;
      },
    );
  },
});

const REPEATS = ["stretch", "repeat", "round"];

// BorderImage: a picture cut in nine, the corners kept as they are and the
// rest stretched or repeated. CSS has the same thing.
export const BorderImage = defineType("BorderImage", ImageBase, {
  properties: {
    border: group({ left: 0, top: 0, right: 0, bottom: 0 }),
    horizontalTileMode: 0,
    verticalTileMode: 0,
  },
  enums: { Stretch: 0, Repeat: 1, Round: 2 },
  setup(self) {
    const style = face(self).style;
    style.borderStyle = "solid";
    style.borderColor = "transparent";
    effect(
      () => {
        const record = self.$image.record();
        if (!record || record.status() !== READY) return null;
        const { left, top, right, bottom } = self.border;
        return {
          url: record.url,
          width: self.width,
          height: self.height,
          edges: [top, right, bottom, left].map((edge) => Math.max(Number(edge) || 0, 0)),
          repeat: `${REPEATS[self.horizontalTileMode] ?? "stretch"} ${REPEATS[self.verticalTileMode] ?? "stretch"}`,
          flip: flipped(self),
          rendering: rendering(self),
        };
      },
      (next) => {
        style.display = next ? "" : "none";
        if (!next) return void (style.borderImageSource = "");
        style.width = `${next.width}px`;
        style.height = `${next.height}px`;
        style.borderWidth = next.edges.map((edge) => `${edge}px`).join(" ");
        style.borderImageSource = address(next.url);
        style.borderImageSlice = `${next.edges.join(" ")} fill`;
        style.borderImageRepeat = next.repeat;
        style.transform = next.flip;
        style.imageRendering = next.rendering;
      },
    );
  },
});

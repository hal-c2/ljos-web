// NinePatchImage: a picture that says itself how it is stretched, as the
// Imagine style's are. One named `.9.png` has a frame a pixel wide around
// it that is not shown: the black marks at its top and left are over what
// stretches, those at its bottom and right over where what is put on the
// picture goes (the paddings), and the red ones there say how much of the
// picture is outside what it is the background of (the insets).
//
// The marks are read as Qt reads them (`qquickninepatchimage.cpp`), and
// the picture is painted on a canvas, piece by piece. Any other picture is
// an Image's.
import { defineType, derived, effect } from "../../../object.js";
import { lazy, rules } from "../../compute.js";
import { Image, picture } from "../../Image.js";
import { signal } from "#kernel";

// The picture is on the canvas: with its frame it is no background.
rules(`
.qq-image.qq-nine { background-image: none !important; }
`);

const READY = 1;
const ERROR = 3;

// A pixel as the four bytes a canvas has it in: all of black, all of red.
const BLACK = 0xff000000;
const RED = 0xff0000ff;

const NONE = Object.freeze({
  topPadding: 0,
  leftPadding: 0,
  rightPadding: 0,
  bottomPadding: 0,
  topInset: 0,
  leftInset: 0,
  rightInset: 0,
  bottomInset: 0,
});

// Where the marks of one colour start and end along a line of `count`
// pixels, `step` apart. A mark that reaches the end of the line is none.
function marks(pixels, from, count, step, colour) {
  const found = [];
  let start = -1;
  for (let index = 0; index < count; index++) {
    if (pixels[from + index * step] === colour) {
      if (start === -1) start = index;
    } else if (start !== -1) {
      found.push(start, index);
      start = -1;
    }
  }
  return found;
}

// The picture cut where the marks are, from 0 to its `size`: every other
// piece stretches, and `first` says whether the first one does.
function cut(found, size) {
  const first = found[0] === 0;
  return { first, at: first ? [...found, size] : [0, ...found, size] };
}

// The same cuts in a picture stretched to `size`: what stretches shares
// what is left over evenly.
function spread({ first, at }, size) {
  const stretching = Math.trunc((first ? at.length : at.length - 1) / 2);
  const each = (size - at.at(-1)) / stretching;
  const spread = [0];
  let stretches = first;
  for (let index = 1; index < at.length; index++) {
    spread.push(spread[index - 1] + at[index] - at[index - 1] + (stretches ? each : 0));
    stretches = !stretches;
  }
  return spread;
}

// An inset is a red mark at the start of the line, and one at its end.
function inset(found) {
  const near = found.length >= 2 && found[0] === 0 ? found[1] : 0;
  const far = found.length === 2 && found[0] > 0 ? found[1] - found[0] : found.length === 4 ? found[3] - found[2] : 0;
  return [near, far];
}

// The paddings are what is before the first black mark and after the last.
const padding = (found, size) => (found.length >= 2 ? [found[0], size - found.at(-1) - 2] : [0, 0]);

function read(pixels, width, height) {
  const [leftInset, rightInset] = inset(marks(pixels, (height - 1) * width + 1, width - 1, 1, RED));
  const [topInset, bottomInset] = inset(marks(pixels, 2 * width - 1, height - 1, width, RED));
  // The paddings are looked for in what the insets leave.
  const wide = width - leftInset - rightInset;
  const tall = height - topInset - bottomInset;
  const [leftPadding, rightPadding] = padding(marks(pixels, (height - 1) * width + leftInset + 1, wide - 2, 1, BLACK), wide);
  const [topPadding, bottomPadding] = padding(marks(pixels, (2 + topInset) * width - 1, tall - 2, width, BLACK), tall);
  return {
    across: cut(marks(pixels, 1, width - 1, 1, BLACK), width - 2),
    down: cut(marks(pixels, width, height - 1, width, BLACK), height - 2),
    topPadding,
    leftPadding,
    rightPadding,
    bottomPadding,
    topInset,
    leftInset,
    rightInset,
    bottomInset,
  };
}

// A picture with marks: its size is what is inside the frame.
function patched(url) {
  const record = picture(url);
  const element = document.createElement("img");
  element.onload = () => {
    const width = element.naturalWidth;
    const height = element.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(element, 0, 0);
    let pixels;
    try {
      pixels = new Uint32Array(context.getImageData(0, 0, width, height).data.buffer);
    } catch {
      // A picture from elsewhere that may be shown and not read.
      return record.settle(ERROR);
    }
    record.width = Math.max(width - 2, 0);
    record.height = Math.max(height - 2, 0);
    // What is painted is the picture without its frame, which is then
    // nothing a piece at its edge is smoothed with.
    const inside = document.createElement("canvas");
    inside.width = record.width;
    inside.height = record.height;
    if (record.width > 0 && record.height > 0) inside.getContext("2d").drawImage(element, -1, -1);
    record.nine = { ...read(pixels, width, height), picture: inside };
    record.settle(READY);
  };
  element.onerror = () => record.settle(ERROR);
  element.src = url;
  return record;
}

// Whether a source is one with marks: Qt goes by all that follows the first
// dot of the file's name.
function marked(source) {
  const file = String(source ?? "")
    .split(/[?#]/)[0]
    .split("/")
    .pop();
  const dot = file.indexOf(".");
  return dot !== -1 && file.slice(dot + 1).toLowerCase() === "9.png";
}

// The first pixel of the screen that is past an edge: a pixel is of what
// its middle is in. One whose middle is on the edge is of what is after
// the edge, unless it is `before`.
function past(edge, before) {
  const pixel = Math.ceil(edge - 0.5);
  return before && pixel + 0.5 === edge ? pixel + 1 : pixel;
}

// Whether a pixel whose middle is on the edge between two pieces is of the
// one before: Qt's painter (OpenGL's) reads the picture there at the cut
// as a part of it, in the single precision a graphics card counts in, and
// takes the pixel that falls in.
const before = (cut, size) => Math.fround(cut / size) * size < cut;

// The pixels of the screen each cut of a stretched picture is at. At its
// far edge OpenGL, which counts upwards, paints the pixel whose middle is
// on the bottom edge and not the one on the right edge.
function edges(cuts, size, ratio, down) {
  const last = cuts.at.length - 1;
  return spread(cuts, size).map((edge, index) => past(edge * ratio, index === last ? down : before(cuts.at[index], cuts.at[last])));
}

// Each piece where it is in the stretched picture, on whole pixels of the
// screen, so that two that meet leave no seam.
function draw(canvas, context, { nine, width, height, smooth }) {
  const ratio = window.devicePixelRatio || 1;
  const { across, down } = nine;
  const xs = edges(across, width, ratio, false);
  const ys = edges(down, height, ratio, true);
  canvas.width = Math.max(xs.at(-1), 0);
  canvas.height = Math.max(ys.at(-1), 0);
  canvas.style.width = `${canvas.width / ratio}px`;
  canvas.style.height = `${canvas.height / ratio}px`;
  if (!canvas.width || !canvas.height) return;
  context.imageSmoothingEnabled = smooth;
  for (let row = 0; row < ys.length - 1; row++) {
    const tall = down.at[row + 1] - down.at[row];
    if (tall <= 0 || ys[row + 1] <= ys[row]) continue;
    for (let column = 0; column < xs.length - 1; column++) {
      const wide = across.at[column + 1] - across.at[column];
      if (wide <= 0 || xs[column + 1] <= xs[column]) continue;
      context.drawImage(nine.picture, across.at[column], down.at[row], wide, tall, xs[column], ys[row], xs[column + 1] - xs[column], ys[row + 1] - ys[row]);
    }
  }
}

const patches = new Map();

const said = (name) => derived((self) => self.$marks()[name]);

export const NinePatchImage = defineType("NinePatchImage", Image, {
  properties: {
    // Qt paints these pixel for pixel unless it is told otherwise.
    smooth: false,
    topPadding: said("topPadding"),
    leftPadding: said("leftPadding"),
    rightPadding: said("rightPadding"),
    bottomPadding: said("bottomPadding"),
    topInset: said("topInset"),
    leftInset: said("leftInset"),
    rightInset: said("rightInset"),
    bottomInset: said("bottomInset"),
  },
  setup(self) {
    const plain = self.$load;
    self.$load = (url) => (marked(self.source) ? patched(url) : plain(url));
    // Its own: the same file is another picture to an Image.
    self.$pictures = patches;
    // What the last picture with marks said stays said, as in Qt, while the
    // next one loads and when that has none.
    let last = NONE;
    self.$marks = lazy(
      self,
      () => {
        const record = self.$image.record();
        if (record && record.status() === READY && record.nine) last = record.nine;
        return last;
      },
      NONE,
    );
    const canvas = document.createElement("canvas");
    self.$face.append(canvas);
    const context = canvas.getContext("2d");
    // What a shader that is given the item draws with: the canvas, as it
    // was last painted, and only while it is what the item shows.
    const [painted, paint] = signal(null, self.$owner, { equals: false });
    self.$canvas = {
      get element() {
        return painted();
      },
    };
    effect(
      () => {
        // The marks are read when the picture is there, asked for or not:
        // they are what a later picture with none leaves said.
        self.$marks();
        const record = self.$image.record();
        if (!record || record.status() !== READY || !record.nine) return null;
        return { nine: record.nine, width: self.width, height: self.height, smooth: Boolean(self.smooth) };
      },
      (next) => {
        self.$face.classList.toggle("qq-nine", Boolean(next));
        canvas.style.display = next ? "" : "none";
        if (next) draw(canvas, context, next);
        paint(next ? canvas : null);
      },
    );
  },
});

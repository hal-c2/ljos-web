// The part of an emitter's (or an affector's) rectangle that counts.
// `$extrude(x, y, width, height, random, out)` picks a point of it,
// `$contains(x, y, width, height, px, py)` says whether a point is in it.
// Without a shape it is the whole rectangle, which `extrude` and `contains`
// here answer for.
import { sourced } from "../../guard.js";
import { defineType, effect, QtObject } from "../../object.ts";

// QRectF's: the edges are inside, and a rectangle of no size has no inside.
const within = (x, y, width, height, px, py) =>
  width !== 0 && height !== 0 && px >= x && px <= x + width && py >= y && py <= y + height;

export function extrude(shape, x, y, width, height, random, out) {
  if (shape) return shape.$extrude(x, y, width, height, random, out);
  out.x = random() * width + x;
  out.y = random() * height + y;
}

export const contains = (shape, x, y, width, height, px, py) =>
  shape ? shape.$contains(x, y, width, height, px, py) : within(x, y, width, height, px, py);

export const RectangleShape = defineType("RectangleShape", QtObject, {
  properties: { fill: true },
  methods: {
    $extrude(x, y, width, height, random, out) {
      if (this.fill) {
        out.x = random() * width + x;
        out.y = random() * height + y;
        return;
      }
      // One of the four sides, then a point along it.
      const side = Math.floor(random() * 4);
      const along = random();
      out.x = side === 0 ? x : side === 1 ? x + width : along * width + x;
      out.y = side === 2 ? y : side === 3 ? y + height : along * height + y;
    },
    $contains: within,
  },
});

export const EllipseShape = defineType("EllipseShape", QtObject, {
  properties: { fill: true },
  methods: {
    $extrude(x, y, width, height, random, out) {
      const theta = random() * 2 * Math.PI;
      const magnitude = this.fill ? random() : 1;
      out.x = x + width / 2 + magnitude * (width / 2) * Math.cos(theta);
      out.y = y + height / 2 + magnitude * (height / 2) * Math.sin(theta);
    },
    $contains(x, y, width, height, px, py) {
      if (!within(x, y, width, height, px, py)) return false;
      const a = (x + width / 2 - px) / width;
      const b = (y + height / 2 - py) / height;
      return a * a + b * b < 0.25;
    },
  },
});

// A diagonal of the rectangle, from its top left corner, or with `mirrored`
// from its top right. Qt measures it from the rectangle's size alone.
export const LineShape = defineType("LineShape", QtObject, {
  properties: { mirrored: false },
  methods: {
    $extrude(x, y, width, height, random, out) {
      if (!height) {
        out.x = width * random();
        out.y = 0;
        return;
      }
      out.y = height * random();
      out.x = !width ? 0 : this.mirrored ? width - (width / height) * out.y : (width / height) * out.y;
    },
    $contains: within,
  },
});

let scratch;

// Which pixels of an image are not transparent, with the image stretched to
// `width` by `height`: one byte each, row after row.
function opaque(image, width, height) {
  scratch ??= document.createElement("canvas");
  scratch.width = width;
  scratch.height = height;
  const context = scratch.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, width, height);
  let pixels;
  try {
    pixels = context.getImageData(0, 0, width, height).data;
  } catch {
    // An image from somewhere else may be painted but not read: no mask.
    return null;
  }
  const alpha = new Uint8Array(width * height);
  for (let index = 0; index < alpha.length; index++) alpha[index] = pixels[index * 4 + 3];
  return alpha;
}

// The opaque part of an image, stretched over the rectangle.
export const MaskShape = defineType("MaskShape", QtObject, {
  properties: { source: "" },
  methods: {
    // The mask for a rectangle of this size, made when the size is new.
    $mask(width, height) {
      width = Math.round(width);
      height = Math.round(height);
      const image = this.$image;
      if (!image) return false;
      if (width === this.$width && height === this.$height) return this.$points.length > 0;
      this.$width = width;
      this.$height = height;
      this.$alpha = width > 0 && height > 0 ? opaque(image, width, height) : null;
      const alpha = this.$alpha;
      let count = 0;
      if (alpha) for (let index = 0; index < alpha.length; index++) if (alpha[index]) count++;
      const points = (this.$points = new Uint32Array(count));
      for (let index = 0, at = 0; at < count; index++) if (alpha[index]) points[at++] = index;
      return count > 0;
    },
    $extrude(x, y, width, height, random, out) {
      out.x = x;
      out.y = y;
      if (!this.$mask(width, height)) return;
      const point = this.$points[Math.floor(random() * this.$points.length)];
      out.x += point % this.$width;
      out.y += Math.floor(point / this.$width);
    },
    $contains(x, y, width, height, px, py) {
      if (!this.$mask(width, height)) return false;
      const column = Math.trunc(px - x);
      const row = Math.trunc(py - y);
      if (column < 0 || row < 0 || column >= this.$width || row >= this.$height) return false;
      return this.$alpha[row * this.$width + column] !== 0;
    },
  },
  setup(self) {
    self.$image = self.$loading = null;
    self.$from = undefined;
    self.$points = new Uint32Array(0);
    self.$alpha = null;
    self.$width = self.$height = -1;
    effect(
      () => self.source,
      (source) => {
        // Asked again whenever any of its properties is written.
        if (source === self.$from) return;
        self.$from = source;
        self.$image = self.$loading = null;
        self.$width = self.$height = -1;
        if (!source) return;
        const image = (self.$loading = new Image());
        image.onload = () => {
          // Unless the shape was given another source meanwhile.
          if (self.$loading === image) self.$image = image;
        };
        sourced(image, String(source));
      },
    );
  },
});

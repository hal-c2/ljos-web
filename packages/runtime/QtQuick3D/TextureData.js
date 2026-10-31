// TextureData: a picture handed over as its numbers rather than named as a
// file. In Qt it is a C++ class a program derives from, and what the
// derived class calls there it calls here: `setSize`, `setFormat`,
// `setHasTransparency`, `setDepth` and `setTextureData`, which takes the
// bytes as an ArrayBuffer or an array of numbers of the kind the format has.
// The first row of the numbers is the bottom one of the picture.
//
// A picture whose numbers are fractions (`RGBA16F`, `RGBA32F`) is in linear
// light where Qt takes it to be: where it lights a scene from all round,
// and where it is a PrincipledMaterial's colour. Anywhere else it is read
// as a screen shows it, as any other picture is.
//
// Also here is how a Radiance `.hdr` file is read, which gives the same.
//
// Not here: the formats that are packed (`BC1` and after), `RGBE8` and
// `R16`, of which nothing is drawn, and a picture with a depth.
import { defineType, flush } from "../object.js";
import { Object3D } from "./Node.js";
import { signal } from "#kernel";

const FORMATS = [
  "None",
  "RGBA8",
  "RGBA16F",
  "RGBA32F",
  "RGBE8",
  "R8",
  "R16",
  "R16F",
  "R32F",
  "BC1",
  "BC2",
  "BC3",
  "BC4",
  "BC5",
  "BC6H",
  "BC7",
  "DXT1_RGBA",
  "DXT1_RGB",
  "DXT3_RGBA",
  "DXT5_RGBA",
  "ETC2_RGB8",
  "ETC2_RGB8A1",
  "ETC2_RGBA8",
  "ASTC_4x4",
  "ASTC_5x4",
  "ASTC_5x5",
  "ASTC_6x5",
  "ASTC_6x6",
  "ASTC_8x5",
  "ASTC_8x6",
  "ASTC_8x8",
  "ASTC_10x5",
  "ASTC_10x6",
  "ASTC_10x8",
  "ASTC_10x10",
  "ASTC_12x10",
  "ASTC_12x12",
];
export const Format = Object.fromEntries(FORMATS.map((name, index) => [name, index]));

// The numbers of each format that is drawn: what kind they are, and how
// many of them a pixel has.
const KINDS = {
  [Format.RGBA8]: [Uint8Array, 4],
  [Format.RGBA16F]: [Uint16Array, 4],
  [Format.RGBA32F]: [Float32Array, 4],
  [Format.R8]: [Uint8Array, 1],
  [Format.R16F]: [Uint16Array, 1],
  [Format.R32F]: [Float32Array, 1],
};

const warned = new Set();

// The numbers as the renderer takes them, or null where there are too few
// of them for the size, or the format is one that is not drawn.
export function picture({ bytes, width, height, format, sheer }) {
  const kind = KINDS[format];
  if (!bytes || !(width > 0) || !(height > 0)) return null;
  if (!kind) {
    if (!warned.has(format)) console.warn(`TextureData: the format ${FORMATS[format] ?? format} is not drawn`);
    warned.add(format);
    return null;
  }
  const [Numbers, each] = kind;
  const buffer = bytes instanceof ArrayBuffer ? bytes : ArrayBuffer.isView(bytes) ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : Uint8Array.from(bytes).buffer;
  const count = width * height * each;
  if (buffer.byteLength < count * Numbers.BYTES_PER_ELEMENT) return null;
  return { pixels: new Numbers(buffer, 0, count), width, height, format: FORMATS[format], linear: format === Format.RGBA16F || format === Format.RGBA32F, sheer };
}

export const TextureData = defineType("TextureData", Object3D, {
  signals: ["textureDataNodeDirty"],
  enums: Format,
  methods: {
    textureData() {
      return this.$held().bytes;
    },
    setTextureData(bytes) {
      this.$hold({ bytes });
    },
    size() {
      const { width, height } = this.$held();
      return { width, height };
    },
    setSize(size) {
      this.$hold({ width: Number(size?.width) || 0, height: Number(size?.height) || 0 });
    },
    depth() {
      return this.$held().depth;
    },
    setDepth(depth) {
      this.$hold({ depth });
    },
    format() {
      return this.$held().format;
    },
    setFormat(format) {
      this.$hold({ format });
    },
    hasTransparency() {
      return this.$held().sheer;
    },
    setHasTransparency(sheer) {
      this.$hold({ sheer: Boolean(sheer) });
    },
  },
  setup(self) {
    const [held, setHeld] = signal({ bytes: null, width: 0, height: 0, depth: 0, format: Format.RGBA8, sheer: false }, self.$owner);
    let made = null;
    self.$held = held;
    // Qt says a picture has changed when it next takes it up to draw it:
    // once for all that was changed since.
    let told = false;
    self.$hold = (changed) => {
      setHeld({ ...held(), ...changed });
      made = null;
      flush();
      if (told) return;
      told = true;
      queueMicrotask(() => {
        told = false;
        self.textureDataNodeDirty();
      });
    };
    // One picture for as long as nothing of it changes, so that what the
    // renderer made of it is kept.
    self.$picture = () => {
      const now = held();
      if (made?.of !== now) made = { of: now, picture: picture(now) };
      return made.picture;
    };
  },
});

const HEADER = /^-Y (\d+) \+X (\d+)$/;
const BRIGHTEST = 65504;

// A Radiance picture (`.hdr`): text that ends at an empty line, the size,
// then each row of pixels from the top one down, a pixel being three
// numbers and the power of two they are all times. The rows may be packed,
// each channel on its own and its runs counted. What is made of it has the
// bottom row first, and is in linear light. Nothing in it is brighter than
// a half can say, which is what it is kept as.
//
// A row that is not packed that way has the red of its first pixel taken
// for 2, as Qt takes it.
export function radiance(buffer) {
  const bytes = new Uint8Array(buffer);
  let at = 0;
  const line = () => {
    let text = "";
    while (at < bytes.length && bytes[at] !== 10) text += String.fromCharCode(bytes[at++]);
    at++;
    return text;
  };
  if (line() !== "#?RADIANCE") return { error: "is not a Radiance picture" };
  for (let text = line(); text !== ""; text = line()) {
    if (at >= bytes.length) return { error: "ends before its picture begins" };
    if (text.startsWith("FORMAT=") && text.slice(7).trim() !== "32-bit_rle_rgbe") return { error: `is a Radiance picture of a kind that is not read (${text.slice(7).trim()})` };
  }
  const size = line().match(HEADER);
  if (!size) return { error: "is a Radiance picture that is not laid out from the top left" };
  const height = Number(size[1]);
  const width = Number(size[2]);
  const pixels = new Float32Array(width * height * 4);
  const row = new Uint8Array(width * 4);
  for (let y = 0; y < height; y++) {
    if (bytes.length - at < 4) return { error: "ends before its picture does" };
    row.set(bytes.subarray(at, at + 4));
    at += 4;
    if (row[0] === 2 && row[1] === 2 && row[2] < 128) {
      for (let channel = 0; channel < 4; channel++) {
        for (let x = 0; x < width && at < bytes.length; ) {
          let count = bytes[at++];
          if (count > 128) {
            const value = bytes[at++];
            for (count &= 127; count-- > 0 && x < width; ) row[x++ * 4 + channel] = value;
          } else while (count-- > 0 && at < bytes.length && x < width) row[x++ * 4 + channel] = bytes[at++];
        }
      }
    } else {
      // The older way: a pixel of ones says how often the one before it
      // comes again.
      row[0] = 2;
      let shift = 0;
      for (let x = 1; x < width && bytes.length - at >= 4; ) {
        const [r, g, b, e] = bytes.subarray(at, at + 4);
        at += 4;
        if (r === 1 && g === 1 && b === 1) {
          for (let count = e << shift; count-- > 0 && x < width; x++) row.copyWithin(x * 4, (x - 1) * 4, x * 4);
          shift += 8;
        } else {
          row.set([r, g, b, e], x++ * 4);
          shift = 0;
        }
      }
    }
    const to = (height - 1 - y) * width * 4;
    for (let x = 0; x < width; x++) {
      const by = 2 ** (row[x * 4 + 3] - 128) / 256;
      pixels[to + x * 4] = Math.min(row[x * 4] * by, BRIGHTEST);
      pixels[to + x * 4 + 1] = Math.min(row[x * 4 + 1] * by, BRIGHTEST);
      pixels[to + x * 4 + 2] = Math.min(row[x * 4 + 2] * by, BRIGHTEST);
      pixels[to + x * 4 + 3] = 1;
    }
  }
  return { pixels, width, height, format: "RGBA32F", linear: true, sheer: false };
}

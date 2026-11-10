// A `.tga` file, which Qt reads and a browser does not: a picture of bytes, in
// its own order, as is or by runs. What is read here is a picture of 24 or 32
// bits to a pixel; one with a palette, or of greys, is said to be not here.
//
// Reads one: `{ width, height, pixels, format, linear, sheer }` or what is
// wrong with it as `{ error }`. `pixels` are as a TextureData's numbers are,
// the bottom row first, as a material reads those.
export function tga(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 18) return { error: "it ends before it begins" };
  const kind = bytes[2];
  const width = bytes[12] | (bytes[13] << 8);
  const height = bytes[14] | (bytes[15] << 8);
  const depth = bytes[16];
  if ((kind !== 2 && kind !== 10) || (depth !== 24 && depth !== 32)) return { error: `it is kept in a way not read here (${kind}, ${depth} bits)` };
  if (!width || !height) return { error: "it has no pixels" };
  const size = depth / 8;
  let at = 18 + bytes[0] + (bytes[1] ? (bytes[5] | (bytes[6] << 8)) * Math.ceil(bytes[7] / 8) : 0);
  const pixels = new Uint8Array(width * height * 4);
  // The file's rows from the bottom up, unless it says it begins at the top.
  const fromTop = (bytes[17] & 0x20) !== 0;
  const fromRight = (bytes[17] & 0x10) !== 0;
  const put = (index, from) => {
    const across = index % width;
    const up = Math.floor(index / width);
    const to = ((fromTop ? height - 1 - up : up) * width + (fromRight ? width - 1 - across : across)) * 4;
    pixels[to] = bytes[from + 2];
    pixels[to + 1] = bytes[from + 1];
    pixels[to + 2] = bytes[from];
    pixels[to + 3] = size === 4 ? bytes[from + 3] : 255;
  };
  const count = width * height;
  for (let index = 0; index < count; ) {
    const run = kind === 10 ? bytes[at++] : 0x7f;
    const times = kind === 10 ? (run & 0x7f) + 1 : count - index;
    const repeated = kind === 10 && (run & 0x80) !== 0;
    if (at + (repeated ? 1 : times) * size > bytes.length || index + times > count) return { error: "it ends before its pixels do" };
    for (let each = 0; each < times; each++) {
      put(index++, at);
      if (!repeated) at += size;
    }
    if (repeated) at += size;
  }
  let sheer = false;
  for (let index = 3; index < pixels.length && !sheer; index += 4) sheer = pixels[index] !== 255;
  return { width, height, pixels, format: "RGBA8", linear: false, sheer };
}

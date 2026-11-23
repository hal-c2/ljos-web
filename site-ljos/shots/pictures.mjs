// What the capture and the comparison judge of a picture: whether it is
// blank (one colour, nothing drawn), and how much of it differs from the
// one before.
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export const readPng = (bytes) => PNG.sync.read(bytes);
export const writePng = (png) => PNG.sync.write(png);

// A picture is blank when one colour covers nearly all of it: a canvas
// that drew nothing, or a page that drew only its ground. The colour is
// the commonest one, and a pixel is of it when no channel is more than
// `near` from it, so a gradient's or a dither's last bits are the same
// ground wherever its value falls. Every pixel is read: anything drawn
// over one pixel in two hundred makes a picture drawn.
export function blank(png, { most = 0.995, near = 6 } = {}) {
  const { data, width, height } = png;
  if (width * height === 0) return true;
  const seen = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const colour = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    seen.set(colour, (seen.get(colour) ?? 0) + 1);
  }
  let top = 0;
  let count = -1;
  for (const [colour, times] of seen)
    if (times > count) {
      top = colour;
      count = times;
    }
  const [r, g, b] = [top >> 16, (top >> 8) & 255, top & 255];
  let ground = 0;
  for (let i = 0; i < data.length; i += 4) if (Math.abs(data[i] - r) <= near && Math.abs(data[i + 1] - g) <= near && Math.abs(data[i + 2] - b) <= near) ground += 1;
  return ground / (width * height) >= most;
}

// How much of `now` differs from `before`, and a picture of where: the
// share of pixels pixelmatch calls different (anti-aliasing left out),
// 1 when the two are not the same size, whose difference is `now` alone.
// `moving` are boxes of the picture that move on their own (a canvas
// drawing a new frame each moment): they are left out, and the share
// is of what is compared.
export function difference(before, now, moving = []) {
  if (before.width !== now.width || before.height !== now.height) return { ratio: 1, picture: null };
  const { width, height } = now;
  let left = 0;
  let was = before.data;
  if (moving.length > 0) {
    // Where it moves, the picture before is taken as the one now.
    was = Buffer.from(before.data);
    const out = new Uint8Array(width * height);
    for (const box of moving) {
      const x0 = Math.max(0, Math.floor(box.x));
      const y0 = Math.max(0, Math.floor(box.y));
      const x1 = Math.min(width, Math.ceil(box.x + box.width));
      const y1 = Math.min(height, Math.ceil(box.y + box.height));
      for (let y = y0; y < y1; y += 1)
        for (let x = x0; x < x1; x += 1) {
          const at = y * width + x;
          if (out[at] === 0) left += 1;
          out[at] = 1;
          now.data.copy(was, at * 4, at * 4, at * 4 + 4);
        }
    }
  }
  const out = new PNG({ width, height });
  const differing = pixelmatch(was, now.data, out.data, width, height, { threshold: 0.1, alpha: 0.25, diffColor: [255, 64, 0], aaColor: [255, 210, 0] });
  const compared = width * height - left;
  return { ratio: compared === 0 ? 0 : differing / compared, picture: out };
}

// The share of a picture's pixels that may differ, anti-aliasing left
// out, before it is called changed: what a font's hinting or a
// gradient's dither moves between two runs of the same commit stays
// under it, a moved control or a changed colour does not.
export const THRESHOLD = 0.002;

// shots/accepted.json: { "changes": [{ "ids": [...], "reason": "...", "pr": 123 }] },
// the pictures a pull request changes on purpose and why. An id may end
// in `*`, which takes every id it begins. A deploy keeps the list it was
// built with (its manifest's `declared`), and only what the list says
// since is taken: a reason given once is not a pass for every change
// after it.
const same = (one, other) => JSON.stringify(one.ids) === JSON.stringify(other.ids) && one.reason === other.reason;
export const sinceThen = (list, before) => list.filter((entry) => !before.some((old) => same(entry, old)));
const text = (value) => typeof value === "string" && value.trim() !== "";
// An entry with no reason is no declaration. Nor is one whose ids are a
// string: read letter by letter, its `*` would take every picture there is.
export const wellDeclared = (entry) =>
  Array.isArray(entry?.ids) && entry.ids.length > 0 && entry.ids.every(text) && text(entry.reason) && ((entry.pr ?? null) === null || (Number.isSafeInteger(entry.pr) && entry.pr > 0));

export function acceptedFor(list, id) {
  for (const entry of list)
    for (const said of entry.ids) if (said === id || (said.endsWith("*") && id.startsWith(said.slice(0, -1)))) return { reason: entry.reason, pr: entry.pr ?? null };
  return null;
}

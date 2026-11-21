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
export function difference(before, now) {
  if (before.width !== now.width || before.height !== now.height) return { ratio: 1, picture: null };
  const out = new PNG({ width: now.width, height: now.height });
  const differing = pixelmatch(before.data, now.data, out.data, now.width, now.height, { threshold: 0.1, alpha: 0.25, diffColor: [255, 64, 0], aaColor: [255, 210, 0] });
  return { ratio: differing / (now.width * now.height), picture: out };
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

export function acceptedFor(list, id) {
  for (const entry of list)
    for (const said of entry.ids) if (said === id || (said.endsWith("*") && id.startsWith(said.slice(0, -1)))) return { reason: entry.reason, pr: entry.pr ?? null };
  return null;
}

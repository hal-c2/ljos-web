// Drawing holds the page up, where Qt draws on a thread of its own: so
// where pictures take long, one is not drawn again until as long has gone
// by as the last took, and the page has half its time for everything else,
// what it fetches and what is pressed among it. What changes meanwhile is
// in the picture that is drawn then. Both renderers' views are paced so:
// the JavaScript renderer's by how long a picture held the page
// (View3D.js), wgpu's on WebGL 2 by how long its GPU took (wgpu.js).
//
// One slow picture is not pictures taking long: the first of a scene is
// slow for the programs that are made for it, and the next is drawn as
// soon as something changes, as every picture is of a scene that is quick
// to draw.
//
// `wait(now)` is how long a picture asked for at `now` waits, in
// milliseconds (0 to draw it now); `drew(from, to)` is told when each
// picture was drawn.
export function paced() {
  let rested = 0;
  let slow = false;
  return {
    // A timer may ring a little early.
    wait: (now) => (rested - now > 1 ? rested - now : 0),
    drew(from, to) {
      const took = to - from;
      rested = slow && took > SLOW ? to + Math.min(took, REST) : 0;
      slow = took > SLOW;
    },
  };
}
// A picture is slow that takes longer than this to draw, in milliseconds,
// and the longest the page is left to itself after one.
const SLOW = 50;
const REST = 1000;

// A picture on WebGL 2 is done when a fence says so, asked a few
// milliseconds apart: `POLL` apart, or later where something else held the
// page. The GPU was last seen at work at `busy`; one asked again later than
// `LATE` after that was held up by the page, not by the GPU, so the GPU is
// taken to have finished by `busy + LATE` (`done`). Unless it was seen at
// work once a frame of the page's was laid out: the browser waits there for
// the GPU, so the gap is the GPU's, until that frame was made (`madeBy`),
// where that was before `now`. A frame begun before the GPU was last seen at
// work may have begun before the picture was even drawn: the GPU was busy
// until `busy` at least.
export const POLL = 4;
const LATE = 8;
export const done = (busy, now, madeBy = null) =>
  Math.min(now, madeBy == null ? busy + LATE : Math.max(busy, madeBy));
// Whether a fence was seen done late: something held the page between the
// last two checks, the page or the browser waiting for the GPU.
export const late = (busy, now) => now - busy > LATE;

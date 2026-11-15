// Reduced motion reduces movement; it never snaps or freezes. A reader
// who asks for it (prefers-reduced-motion: reduce) still sees the
// motion demo's puck travel to where they pressed, in steps a person
// can follow, only without the spring's overshoot. Every other spec
// runs with no preference, which is full motion.
import { centre, expect, open, press, runButton, test } from "./fixtures.js";

test.use({ reducedMotion: "reduce" });

// Where the puck is, relative to its tray, read in the page on every
// animation frame: first until it rests, as [ms, x, y], then for a
// while after a press at the tray's left edge, as [ms, x]. Read in the page, not from
// the test, so a busy machine cannot make the test look away while the
// puck travels.
//
// The press is measured from where the puck rests, so `start` is read
// only once it has stayed within 0.5 px for STILL ms (a spring's turn
// is still for a frame or two, a rest is not), or once SETTLE ms have
// gone by, which `rest.still` then says.
const STILL = 100;
const SETTLE = 2_000;
async function pressAndWatch(page) {
  await open(page, "/demos/");
  const run = runButton(page, "Run the motion demo");
  await press(run);
  await expect(run).toBeHidden();
  const tray = page.getByRole("group", { name: /Spring tray/ });
  await centre(tray);
  const box = await tray.boundingBox();
  const PRESS = 20;
  const { rest, start, target } = await tray.evaluate(
    async (area, { press, still, settle }) => {
      const host = area.parentElement;
      const puck = () =>
        [...host.querySelectorAll("*")].find((element) => {
          const style = getComputedStyle(element);
          return Math.round(element.getBoundingClientRect().width) === 54 && parseFloat(style.borderTopLeftRadius) >= 26;
        });
      // Where the puck is in its tray: [x, y], or null where it is not drawn.
      const place = () => {
        const round = puck();
        if (!round) return null;
        const own = round.getBoundingClientRect();
        const tray = host.getBoundingClientRect();
        return [own.x - tray.x, own.y - tray.y];
      };
      const read = () => place()?.[0] ?? null;
      const rest = await new Promise((resolve) => {
        const seen = [];
        const t0 = performance.now();
        const frame = () => {
          const at = performance.now() - t0;
          const where = place();
          seen.push([Math.round(at), where?.[0] ?? null, where?.[1] ?? null]);
          // From the last reading at least `still` ago, so the readings
          // span the whole window however far apart the frames fall;
          // both ways, so a puck still across but moving down is not at rest.
          const from = seen.findLastIndex(([t]) => t <= at - still);
          const recent = from < 0 ? [] : seen.slice(from);
          const within = (axis) => {
            const values = recent.map((reading) => reading[axis]);
            return Math.max(...values) - Math.min(...values) <= 0.5;
          };
          const quiet = recent.length >= 2 && recent.every(([, x]) => x !== null) && within(1) && within(2);
          if (quiet || at >= settle) resolve({ still: quiet, after: Math.round(at), seen });
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      window.__puck = [];
      const t0 = performance.now();
      const frame = () => {
        window.__puck.push([Math.round(performance.now() - t0), read()]);
        if (performance.now() - t0 < 2_500) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      // Where the press sends it, as Motion.qml's lead() puts it: the
      // puck's middle under the pointer, kept inside the tray.
      const round = puck();
      const width = round ? round.getBoundingClientRect().width : 0;
      const own = host.getBoundingClientRect();
      const pointer = area.getBoundingClientRect().x - own.x + press;
      return { rest, start: read(), target: Math.max(0, Math.min(own.width - width, pointer - width / 2)) };
    },
    { press: PRESS, still: STILL, settle: SETTLE },
  );
  const trace = (samples) => JSON.stringify(samples.map(([t, ...place]) => [t, ...place.map((v) => (v === null ? null : Math.round(v * 10) / 10))]));
  const before = `${rest.still ? `at rest after ${rest.after} ms` : `not at rest after ${rest.after} ms`}; before the press [ms, x, y] ${trace(rest.seen)}`;
  expect(start, `the puck is drawn (${before})`).not.toBeNull();
  expect(rest.still, `the puck is at rest before the press (${before})`).toBe(true);
  await page.mouse.click(box.x + PRESS, box.y + box.height / 2);
  await page.waitForTimeout(2_700);
  const samples = await page.evaluate(() => window.__puck);
  const xs = samples.map(([, x]) => x);
  // Every failure says what was seen, for each frame read.
  const seen = `start ${start}, target ${target}; ${before}; after it [ms, x] ${trace(samples)}`;
  return { start, target, rest, samples, xs, end: xs.at(-1), seen };
}

test("with reduced motion the puck still travels; it does not jump", async ({ page, wasm }) => {
  test.skip(!wasm, "the same on both; held once");
  const { start, target, rest, samples, end, seen } = await pressAndWatch(page);
  // The puck goes where a reader sends it and nowhere else: as the demo
  // appears and takes its frame's size, it stays in the tray's middle.
  const drawnBefore = rest.seen.filter(([, x]) => x !== null);
  const spread = (axis) => Math.max(...drawnBefore.map((reading) => reading[axis])) - Math.min(...drawnBefore.map((reading) => reading[axis]));
  expect(Math.max(spread(1), spread(2)), `nothing moves the puck before a reader does (${seen})`).toBeLessThanOrEqual(0.5);
  expect(start - target, `the press is far enough away to watch it travel (${seen})`).toBeGreaterThan(50);
  expect(end, `the puck is still drawn when it arrives (${seen})`).not.toBeNull();
  expect(Math.abs(end - target), `it ends where the reader pressed (${seen})`).toBeLessThanOrEqual(3);
  // A jump goes there between one frame and the next; travel takes
  // time. Timed, not counted in frames: a busy machine draws fewer
  // frames of the same travel.
  // Only frames where the puck was found: a frame that lost it says
  // nothing about where it was. Timed from the last frame still at the
  // start, so sparse frames do not cut off the beginning of the travel.
  const drawn = samples.filter(([, x]) => x !== null);
  const moved = drawn.findIndex(([, x]) => x < start - 2);
  expect(moved, `it leaves where it was (${seen})`).toBeGreaterThan(0);
  const onset = drawn[moved - 1];
  const there = drawn.find(([t, x]) => t >= drawn[moved][0] && Math.abs(x - end) <= 2);
  expect(drawn.some(([, x]) => x < start - 2 && x > end + 2), `on its way it is seen between where it was and where it goes (${seen})`).toBe(true);
  expect(there[0] - onset[0], `it takes time to get there; it does not jump (${seen})`).toBeGreaterThanOrEqual(100);
});

test("with reduced motion the puck's travel is softened: no overshoot", async ({ page, wasm }) => {
  test.skip(!wasm, "the same on both; held once");
  const { xs, end, seen } = await pressAndWatch(page);
  expect(Math.min(...xs), `it never passes its goal (${seen})`).toBeGreaterThanOrEqual(end - 2);
});

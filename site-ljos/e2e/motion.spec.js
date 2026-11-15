// Reduced motion reduces movement; it never snaps or freezes. A reader
// who asks for it (prefers-reduced-motion: reduce) still sees the
// motion demo's puck travel to where they pressed, in steps a person
// can follow, only without the spring's overshoot. Every other spec
// runs with no preference, which is full motion.
import { centre, expect, open, test } from "./fixtures.js";
import { calmNotWired } from "./known.js";

test.use({ reducedMotion: "reduce" });

// Where the puck is, read in the page on every animation frame for a
// while after a press at the tray's left edge: when (ms after the
// first read) and its x, relative to the tray. Read in the page, not from the test, so a busy machine cannot
// make the test look away while the puck travels.
async function pressAndWatch(page) {
  await open(page, "/demos/");
  const tray = page.getByRole("slider", { name: /Spring tray/ });
  await centre(tray);
  const box = await tray.boundingBox();
  const PRESS = 20;
  const { start, target } = await tray.evaluate((area, press) => {
    const host = area.parentElement;
    const puck = () =>
      [...host.querySelectorAll("*")].find((element) => {
        const style = getComputedStyle(element);
        return Math.round(element.getBoundingClientRect().width) === 54 && parseFloat(style.borderTopLeftRadius) >= 26;
      });
    const read = () => {
      const round = puck();
      return round ? round.getBoundingClientRect().x - host.getBoundingClientRect().x : null;
    };
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
    return { start: read(), target: Math.max(0, Math.min(own.width - width, pointer - width / 2)) };
  }, PRESS);
  expect(start, "the puck is drawn").not.toBeNull();
  await page.mouse.click(box.x + PRESS, box.y + box.height / 2);
  await page.waitForTimeout(2_700);
  const samples = await page.evaluate(() => window.__puck);
  const xs = samples.map(([, x]) => x);
  return { start, target, samples, xs, end: xs.at(-1) };
}

test("with reduced motion the puck still travels; it does not jump", async ({ page, wasm }) => {
  test.skip(!wasm, "the same on both; held once");
  const { start, target, samples, end } = await pressAndWatch(page);
  // Every failure says what was seen: [ms, x] for each frame read.
  const seen = `start ${start}, target ${target}; seen ${JSON.stringify(samples.map(([t, x]) => [t, x === null ? null : Math.round(x)]))}`;
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
  test.fail(true, calmNotWired);
  const { xs, end } = await pressAndWatch(page);
  expect(Math.min(...xs), "it never passes its goal").toBeGreaterThanOrEqual(end - 2);
});

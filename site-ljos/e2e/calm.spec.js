// The demos' motion policy. Rich motion is the default; a reader who
// asks for less (prefers-reduced-motion: reduce) gets less movement,
// slower, and never a frozen scene or a snap. Orbit (the front page's
// 3D scene) and the shader effect (on /demos/) each run on a clock of
// their own, read here from the page: asked for less motion, the clock
// still goes on, and more slowly than with no preference. Hidden and
// shown again, the clock goes on from where it held, never back to its
// start.
import { centre, expect, open, test } from "./fixtures.js";

// How long a rate is read over: well under either clock's loop.
const WINDOW = 3_000;

const DEMOS = [
  {
    name: "Orbit",
    route: "/",
    heading: "See it run",
    canvas: "canvas.qq-view3d",
    // Orbit's `turn`, from the View3D the canvas draws: 55 to 415.
    clock: (canvas) => canvas.$view3d.view.parent.turn,
    frames: (canvas) => canvas.$view3d.frames,
    start: 55,
    period: 360,
  },
  {
    name: "the shader effect",
    route: "/demos/",
    heading: "A shader effect",
    canvas: "canvas.qq-shader",
    // The effect's `time` uniform: 0 to 4π.
    clock: (canvas) => canvas.$effect.time,
    frames: (canvas) => canvas.$effect.$shader.drawn(),
    start: 0,
    period: 4 * Math.PI,
  },
];

for (const demo of DEMOS) {
  test.describe(demo.name, () => {
    const canvas = (page) => page.locator(demo.canvas).first();
    const clockOf = (page) => canvas(page).evaluate(demo.clock);
    // How far the clock went on from `from` to `to`, round a wrap.
    const onFrom = (from, to) => (((to - from) % demo.period) + demo.period) % demo.period;

    async function reach(page) {
      await open(page, demo.route);
      await centre(page.locator("#app div.qq-text").filter({ hasText: new RegExp(`^${demo.heading}$`) }).first());
      await expect(canvas(page), "the demo is made once it is on screen").toBeAttached({ timeout: 30_000 });
      await expect.poll(() => canvas(page).evaluate(demo.frames), { message: "the demo draws", timeout: 30_000 }).toBeGreaterThan(0);
    }

    // The clock's pace, per second, and the frames drawn, over WINDOW,
    // read in the page while the test does nothing.
    function pace(page) {
      return canvas(page).evaluate(
        (element, [clock, frames, period, ms]) =>
          new Promise((resolve) => {
            const read = new Function("canvas", `return (${clock})(canvas)`);
            const count = new Function("canvas", `return (${frames})(canvas)`);
            const [v0, f0, t0] = [read(element), count(element), performance.now()];
            setTimeout(() => {
              const went = (((read(element) - v0) % period) + period) % period;
              resolve({ rate: (went * 1000) / (performance.now() - t0), frames: count(element) - f0 });
            }, ms);
          }),
        [demo.clock.toString(), demo.frames.toString(), demo.period, WINDOW],
      );
    }

    test("asked for less motion, it still moves, more slowly than with no preference", async ({ page }) => {
      await reach(page);
      const full = await pace(page);
      expect(full.frames, "with no preference, frames are drawn").toBeGreaterThan(0);
      expect(full.rate, "with no preference, the clock goes on").toBeGreaterThan(0);

      // A new load asking for less: the pace is set as the clock starts.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await reach(page);
      const calm = await pace(page);
      expect(calm.frames, "asked for less motion, frames are still drawn").toBeGreaterThan(0);
      expect(calm.rate, "asked for less motion, the clock still goes on").toBeGreaterThan(0);
      expect(calm.rate, "asked for less motion, it goes on more slowly").toBeLessThan(full.rate);

      // The preference changed while the demo runs is taken at once,
      // not at the end of a loop: a quick pace again, from where it is.
      await page.emulateMedia({ reducedMotion: "no-preference" });
      const again = await pace(page);
      expect(again.rate, "with no preference again, it goes on faster than calm").toBeGreaterThan(calm.rate);
    });

    test("in a hidden tab its clock holds, and shown again goes on from there", async ({ page }) => {
      await reach(page);
      await expect.poll(async () => onFrom(demo.start, await clockOf(page)), { message: "the clock leaves its start" }).toBeGreaterThan(demo.period / 18);
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      const held = await clockOf(page);
      await page.waitForTimeout(1_000);
      expect(await clockOf(page), "hidden, the clock holds still").toBe(held);
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
        Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await expect.poll(async () => onFrom(held, await clockOf(page)), { message: "shown again, the clock goes on" }).toBeGreaterThan(0);
      // A restart would put it back at its start, most of a loop round
      // from where it held.
      expect(onFrom(held, await clockOf(page)), "shown again, it goes on from where it held, not from its start").toBeLessThan(demo.period / 4);
    });
  });
}

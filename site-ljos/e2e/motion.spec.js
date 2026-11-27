// The motion demo: three springs chase one ring, each its own way. With
// no preference the bouncy one swings past the ring and back; a reader
// who asks for less motion (prefers-reduced-motion: reduce) still sees
// every ball travel to the ring, in steps a person can follow, only more
// slowly and without a swing past it. Reduced motion reduces movement;
// it never snaps or freezes.
import { centre, expect, open, press, runButton, test } from "./fixtures.js";

// How long the balls get to come to rest before the ring is moved, and
// how long they are watched after, at most: longer than the calmest
// travel takes.
const SETTLE = 6_000;
const WATCH = 4_000;
// At rest: every ball within 0.5 px for this long.
const STILL = 120;

// The reader holds the ring at the stage's left, waits for the balls to
// rest round it, and leads it across to the right. Where each ball is,
// across, is read in the page on every animation frame, so a busy
// machine cannot make the test look away while they travel, and timed
// by the scene's own clock (`ljos-web/clock`): a loaded machine draws
// fewer frames of the same motion, not a different motion.
async function chase(page) {
  await open(page, "/demos/");
  const run = runButton(page, "Run the motion demo");
  await press(run);
  await expect(run).toBeHidden();
  const stage = page.getByRole("group", { name: /Spring stage/ });
  await centre(stage);
  const box = await stage.boundingBox();
  // Held, the ring does not hop on its own.
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height / 2);
  await page.mouse.down();
  const rest = await stage.evaluate(
    (area, { still, settle, watch }) => {
      // The balls are the ones with their spring's initial on them.
      const balls = [...area.querySelectorAll("div.qq-text")].filter((text) => /^[SBL]$/.test(text.textContent.trim())).map((text) => [text.textContent.trim(), text.parentElement]);
      const read = () => balls.map(([, ball]) => {
        const own = ball.getBoundingClientRect();
        return own.width ? own.x + own.width / 2 - area.getBoundingClientRect().x : null;
      });
      const clock = globalThis[Symbol.for("ljos-web/clock")];
      window.__balls = { names: balls.map(([name]) => name), seen: [], moved: null, done: false };
      return new Promise((resolve) => {
        const seen = [];
        // The scene's clock stands still while nothing in it moves, so
        // this wait is timed by the page's: at rest, the scene has no job
        // left and its clock would never reach `settle`.
        const t0 = performance.now();
        const frame = () => {
          const at = performance.now() - t0;
          seen.push([at, ...read()]);
          const from = seen.findLastIndex(([t]) => t <= at - still);
          const recent = from < 0 ? [] : seen.slice(from);
          const drawn = seen.at(-1).slice(1).every((x) => x !== null);
          const quiet = (drawn && !clock.jobs && seen.length >= 2) || (recent.length >= 2 && balls.every((_, i) => {
            const xs = recent.map((reading) => reading[i + 1]);
            return xs.every((x) => x !== null) && Math.max(...xs) - Math.min(...xs) <= 0.5;
          }));
          if (!quiet && at < settle) return requestAnimationFrame(frame);
          // From here every frame is kept, timed from the move.
          const watching = () => {
            const state = window.__balls;
            const since = state.moved === null ? 0 : clock.time - state.moved;
            state.seen.push([Math.round(since), ...read()]);
            const last = state.seen.slice(-2);
            const resting = state.moved !== null && since > 200 && !clock.jobs && last.length === 2 && last[0].slice(1).every((x, i) => x === last[1][i + 1]);
            if (since >= watch || resting) state.done = true;
            else requestAnimationFrame(watching);
          };
          requestAnimationFrame(watching);
          resolve({ quiet, after: Math.round(at), names: balls.map(([name]) => name) });
        };
        requestAnimationFrame(frame);
      });
    },
    { still: STILL, settle: SETTLE, watch: WATCH },
  );
  expect(rest.names.sort(), "the three balls are drawn").toEqual(["B", "L", "S"]);
  expect(rest.quiet, `the balls are at rest round the held ring (after ${rest.after} ms)`).toBe(true);
  await page.evaluate(() => (window.__balls.moved = globalThis[Symbol.for("ljos-web/clock")].time));
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height / 2);
  await test.step("the balls are watched until they rest by the ring", () => page.waitForFunction(() => window.__balls.done, null, { timeout: 0, polling: "raf" }));
  const { names, seen } = await page.evaluate(() => window.__balls);
  await page.mouse.up();
  // Each ball's frames as [ms, x], only those where it was drawn.
  const ball = (name) => {
    const i = names.indexOf(name) + 1;
    const frames = seen.filter((reading) => reading[i] !== null).map((reading) => [reading[0], Math.round(reading[i] * 10) / 10]);
    return { frames, start: frames[0][1], end: frames.at(-1)[1], said: `${name} [ms, x] ${JSON.stringify(frames)}` };
  };
  return { snappy: ball("S"), bouncy: ball("B"), lazy: ball("L"), width: box.width };
}

// When a ball has come within 2 px of where it ends, for good.
function arrival({ frames, end }) {
  const away = frames.findLastIndex(([, x]) => Math.abs(x - end) > 2);
  return frames[Math.min(away + 1, frames.length - 1)][0];
}

test.describe("with no preference", () => {
  test("the bouncy spring swings past the ring, and the snappy one is there first", async ({ page, wasm }) => {
    test.skip(!wasm, "the same on both; held once");
    const { snappy, bouncy, lazy, width } = await chase(page);
    const travel = bouncy.end - bouncy.start;
    expect(travel, `the ring went far enough to watch (${bouncy.said})`).toBeGreaterThan(width * 0.5);
    const past = Math.max(...bouncy.frames.map(([, x]) => x)) - bouncy.end;
    expect(past, `the bouncy ball swings past the ring (${bouncy.said})`).toBeGreaterThan(travel * 0.2);
    expect(arrival(snappy), `the snappy ball arrives before the lazy one (${snappy.said}; ${lazy.said})`).toBeLessThan(arrival(lazy));
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("every ball still travels to the ring; none jumps", async ({ page, wasm }) => {
    test.skip(!wasm, "the same on both; held once");
    const run = await chase(page);
    for (const ball of [run.snappy, run.bouncy, run.lazy]) {
      expect(ball.end - ball.start, `it went across (${ball.said})`).toBeGreaterThan(run.width * 0.5);
      // A jump goes there between one frame and the next; travel takes time.
      const moved = ball.frames.findIndex(([, x]) => x > ball.start + 2);
      expect(moved, `it leaves where it was (${ball.said})`).toBeGreaterThan(0);
      expect(ball.frames.some(([, x]) => x > ball.start + 2 && x < ball.end - 2), `it is seen on its way (${ball.said})`).toBe(true);
      expect(arrival(ball) - ball.frames[moved - 1][0], `it takes time to get there (${ball.said})`).toBeGreaterThanOrEqual(150);
    }
  });

  test("no ball swings past the ring, and the calm ones take longer", async ({ page, wasm }) => {
    test.skip(!wasm, "the same on both; held once");
    const { snappy, bouncy, lazy } = await chase(page);
    for (const ball of [snappy, bouncy, lazy]) expect(Math.max(...ball.frames.map(([, x]) => x)), `it never passes where it ends (${ball.said})`).toBeLessThanOrEqual(ball.end + 2);
    // Lazy with no preference is there in about 1.3 s; calm, it is slower.
    expect(arrival(lazy), `the lazy ball takes its time (${lazy.said})`).toBeGreaterThan(1_500);
  });
});

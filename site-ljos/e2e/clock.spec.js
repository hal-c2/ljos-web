// What the e2e reads a running scene's motion by: the page's clock
// (`ljos-web/clock`). A scene whose clock has nothing left to run steps no
// frame, so a check that waits for frames would wait out the test's
// timeout and say only that it timed out. It must say at once that the
// clock stopped, and what the region showed when it did.
import { clockOf, expect, expectFramesAdvance, livePages, open, run, sceneRuns, test } from "./fixtures.js";

// The docs' example whose Timer counts to 30 and then stops, found by its
// code: its index among a page's live blocks depends on which blocks
// before it run. Were it changed, this test would need another scene that
// comes to rest.
const STOPS = /running:\s*root\.ticks\s*<\s*30/;
const found = livePages().flatMap(({ route, examples }) => examples.filter((example) => STOPS.test(example.code)).map((example) => ({ route, example })))[0];

test("a scene whose clock has stopped is told of at once, with what it shows", async ({ page, wasm }) => {
  test.skip(!wasm, "without WebAssembly a block does not run");
  test.setTimeout(60_000);
  expect(found, "a docs example whose Timer counts to 30 and stops").toBeTruthy();
  const { route, example } = found;
  await open(page, route);
  const block = await run(page, example.index);
  await sceneRuns(page, 60_000, "the Timer counts to 30");
  expect((await clockOf(page)).jobs, "the clock has nothing left to run").toBe(0);
  const asked = Date.now();
  const error = await expectFramesAdvance(block.running, { message: "a stopped scene" }).then(
    () => null,
    (thrown) => thrown,
  );
  expect(error?.message, "the check fails, and says why").toMatch(/the clock has nothing left to run/);
  expect(error.message, "and what the region shows").toContain("ticks 30");
  expect(Date.now() - asked, "at once, not at a timeout").toBeLessThan(15_000);
});

// A scene can draw its last change and stop in the same few frames, before
// the six the check waits for: it has moved, and the picture it stopped on
// is what says so. The page's clock is stood in for here, so its stop lands
// on the frame the region changes, as no real scene's can be timed to.
test("a scene that changes as its clock stops has moved", async ({ page }) => {
  await page.setContent(`<div id="scene" style="width: 200px; height: 60px; font: 24px sans-serif">before</div>`);
  await page.evaluate(() => {
    let frames = 100;
    let jobs = 1;
    let reads = 0;
    globalThis[Symbol.for("ljos-web/clock")] = {
      // Read first for where the round starts, then for where it is, then
      // by the wait for six more frames: there the scene changes and its
      // clock stops, four frames on.
      get frames() {
        if (++reads === 3) {
          document.getElementById("scene").textContent = "after";
          frames += 4;
          jobs = 0;
        }
        return frames;
      },
      get jobs() {
        return jobs;
      },
      time: 0,
    };
  });
  await expectFramesAdvance(page.locator("#scene"), { message: "a scene that stops on its last change", once: true });
});

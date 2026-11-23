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

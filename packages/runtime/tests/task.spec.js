// `Task` (Ljos.Core): async work run from its arguments, as ljos-ui's
// `features/components/task.feature` has it. `run` is called with the
// elements of `args` and an AbortSignal; a change of an element runs it
// again and aborts the stale run; `status`, `value` and `error` are where
// it got to.
import { expect, open, test } from "./open.js";

const log = (page) => page.evaluate(() => window.objects.log.splice(0));
const parts = (page, name) =>
  page.evaluate((name) => {
    const { status, value, error } = window.objects[name];
    return { status, value, error: error && `${error.name}: ${error.message}` };
  }, name);
const turn = (page) => page.evaluate(() => new Promise((done) => setTimeout(done, 0)));
// Settles the weather run the test was given `at`.
const settle = (page, at, how, what) =>
  page.evaluate(
    async ([at, how, what]) => {
      const run = window.objects.runs.filter((run) => run.name === "weather")[at];
      run[how](how === "reject" ? new Error(what) : what);
      await new Promise((done) => setTimeout(done, 0));
    },
    [at, how, what],
  );

test("a Task is pending on load, and done with what its run gave", async ({ page }) => {
  await open(page, "task");
  expect(await parts(page, "weather")).toEqual({ status: "pending", value: null, error: null });
  expect(await page.evaluate(() => window.objects.runs.map((run) => run.args))).toEqual([["Oslo"]]);
  await log(page);
  await settle(page, 0, "resolve", "Sunny in Oslo");
  expect(await parts(page, "weather")).toEqual({ status: "done", value: "Sunny in Oslo", error: null });
  // Each part changes once a step, and the signal is told after them.
  expect(await log(page)).toEqual(["status done", "value Sunny in Oslo", "weather done Sunny in Oslo"]);
});

test("a change of an argument runs it again and aborts the stale run", async ({ page }) => {
  await open(page, "task");
  await page.evaluate(() => {
    window.objects.root.city = "Bergen";
    window.flush();
  });
  const runs = await page.evaluate(() => window.objects.runs.map((run) => [run.args[0], run.signal.aborted]));
  expect(runs).toEqual([
    ["Oslo", true],
    ["Bergen", false],
  ]);
  // What the stale run gives after it was aborted is dropped.
  await settle(page, 0, "resolve", "Sunny in Oslo");
  expect((await parts(page, "weather")).status).toBe("pending");
  await settle(page, 1, "resolve", "Rain in Bergen");
  expect(await parts(page, "weather")).toEqual({ status: "done", value: "Rain in Bergen", error: null });
});

test("two changes in one turn run once, with the last", async ({ page }) => {
  await open(page, "task");
  await page.evaluate(() => {
    window.objects.root.city = "Bergen";
    window.objects.root.city = "Tromsø";
    window.flush();
  });
  await turn(page);
  expect(await page.evaluate(() => window.objects.runs.map((run) => run.args[0]))).toEqual(["Oslo", "Tromsø"]);
});

test("arguments with the same elements run nothing", async ({ page }) => {
  await open(page, "task");
  await page.evaluate(() => {
    window.objects.weather.args = ["Oslo"];
    window.flush();
  });
  await turn(page);
  expect(await page.evaluate(() => window.objects.runs.length)).toBe(1);
});

test("pending and failed keep the last value", async ({ page }) => {
  await open(page, "task");
  await settle(page, 0, "resolve", "Sunny in Oslo");
  await page.evaluate(() => {
    window.objects.root.city = "Bergen";
    window.flush();
  });
  expect(await parts(page, "weather")).toEqual({ status: "pending", value: "Sunny in Oslo", error: null });
  await log(page);
  await settle(page, 1, "reject", "Not Found");
  expect(await parts(page, "weather")).toEqual({ status: "failed", value: "Sunny in Oslo", error: "Error: Not Found" });
  expect(await log(page)).toEqual(["status failed", "weather failed Error: Not Found"]);
});

test("a run that changes its own arguments is aborted, and the newer one is what it gives", async ({ page }) => {
  await open(page, "task");
  await turn(page);
  expect(await page.evaluate(() => [window.objects.ran, window.objects.aborts, window.objects.moving.value])).toEqual([
    "Oslo;Bergen;",
    1,
    "Bergen",
  ]);
  // Set back, it does the same again: the run it begins is aborted by the
  // one that run began.
  await page.evaluate(() => {
    window.objects.root.place = "Oslo";
    window.flush();
  });
  await turn(page);
  expect(await page.evaluate(() => [window.objects.ran, window.objects.aborts, window.objects.moving.value])).toEqual([
    "Oslo;Bergen;Oslo;Bergen;",
    2,
    "Bergen",
  ]);
});

test("with autoRun false a Task waits for start, given or with its args", async ({ page }) => {
  await open(page, "task");
  await turn(page);
  expect((await parts(page, "manual")).status).toBe("initial");
  await page.evaluate(() => window.objects.manual.start());
  await turn(page);
  expect(await parts(page, "manual")).toEqual({ status: "done", value: "given", error: null });
  await page.evaluate(() => window.objects.manual.start("other"));
  await turn(page);
  expect((await parts(page, "manual")).value).toBe("other");
});

test("abort fails the run in progress with its signal's reason", async ({ page }) => {
  await open(page, "task");
  await log(page);
  await page.evaluate(() => window.objects.weather.abort());
  expect(await parts(page, "weather")).toEqual({
    status: "failed",
    value: null,
    error: "AbortError: signal is aborted without reason",
  });
  expect(await log(page)).toContain("weather failed AbortError: signal is aborted without reason");
  expect(await page.evaluate(() => window.objects.runs[0].signal.aborted)).toBe(true);
});

test("a run started by what the aborted run's signal told is the run, and the call it interrupted is not made", async ({ page }) => {
  await open(page, "task");
  await page.evaluate(() => {
    const { root, runs, weather } = window.objects;
    runs[0].signal.addEventListener("abort", () => weather.start("Tromsø"));
    root.city = "Bergen";
    window.flush();
  });
  await turn(page);
  // One run is in progress, and it is the one asked for last.
  const runs = await page.evaluate(() => window.objects.runs.map((run) => [run.args[0], run.signal.aborted]));
  expect(runs).toEqual([
    ["Oslo", true],
    ["Tromsø", false],
  ]);
  await settle(page, 1, "resolve", "Snow in Tromsø");
  expect(await parts(page, "weather")).toEqual({ status: "done", value: "Snow in Tromsø", error: null });
});

test("abort, when the aborted run's signal starts another, leaves that run in progress", async ({ page }) => {
  await open(page, "task");
  await log(page);
  await page.evaluate(() => {
    const { runs, weather } = window.objects;
    runs[0].signal.addEventListener("abort", () => weather.start("Tromsø"));
    weather.abort();
  });
  expect((await parts(page, "weather")).status).toBe("pending");
  expect(await log(page)).toEqual([]);
  await settle(page, 1, "resolve", "Snow in Tromsø");
  expect(await parts(page, "weather")).toEqual({ status: "done", value: "Snow in Tromsø", error: null });
});

test("a run that throws at once fails", async ({ page }) => {
  await open(page, "task");
  await turn(page);
  expect(await parts(page, "throws")).toEqual({ status: "failed", value: null, error: "Error: thrown" });
});

test("a Task a Loader unloads has its run aborted", async ({ page }) => {
  await open(page, "task");
  expect(await page.evaluate(() => window.objects.loadedSignal.aborted)).toBe(false);
  await page.evaluate(() => {
    window.objects.loader.active = false;
    window.flush();
  });
  expect(await page.evaluate(() => window.objects.loadedSignal.aborted)).toBe(true);
});

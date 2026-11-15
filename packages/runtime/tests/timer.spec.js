import { expect, open, test } from "./open.js";

const advance = (page, ms) => page.evaluate((ms) => window.objects.clock.advance(ms), ms);
const log = (page) => page.evaluate(() => window.objects.log.splice(0));

test("a timer triggers once when its interval has passed", async ({ page }) => {
  await open(page, "timer");
  await page.evaluate(() => window.objects.once.start());
  await advance(page, 99);
  expect(await log(page)).toEqual(["once running true"]);
  await advance(page, 1);
  // As Qt prints it: it has stopped by the time it says it triggered.
  expect(await log(page)).toEqual(["once false", "once running false"]);
  expect(await page.evaluate(() => window.objects.clock.running)).toBe(false);
});

test("a change to a running timer starts its wait again", async ({ page }) => {
  await open(page, "timer");
  await page.evaluate(() => window.objects.once.start());
  await advance(page, 50);
  await page.evaluate(() => (window.objects.once.interval = 80));
  await advance(page, 79);
  expect(await log(page)).toEqual(["once running true"]);
  await advance(page, 1);
  expect(await log(page)).toEqual(["once false", "once running false"]);
  const restarted = await page.evaluate(() => {
    const { once, clock, log } = window.objects;
    once.start();
    clock.advance(70);
    once.restart();
    clock.advance(70);
    return log.splice(0);
  });
  expect(restarted).toEqual(["once running true", "once running false", "once running true"]);
});

test("a repeating timer triggers at every interval, and at the start if told to", async ({ page }) => {
  await open(page, "timer");
  // Not from inside `start()`, as in Qt: right after.
  expect(await page.evaluate(() => (window.objects.tick.start(), [...window.objects.log]))).toEqual([]);
  expect(await log(page)).toEqual(["tick"]);
  await advance(page, 29);
  expect(await log(page)).toEqual([]);
  await advance(page, 61);
  expect(await log(page)).toEqual(["tick", "tick", "tick"]);
  await page.evaluate(() => window.objects.tick.stop());
  await advance(page, 100);
  expect(await log(page)).toEqual([]);
});

test("a timer and an animation run while what `running` is bound to says so", async ({ page }) => {
  await open(page, "timer");
  await page.evaluate(() => (window.objects.root.active = true));
  expect(await page.evaluate(() => [window.objects.bound.running, window.objects.slide.running])).toEqual([true, true]);
  await advance(page, 120);
  // What the timer's handler assigns is settled like any assignment.
  expect(await page.evaluate(() => [window.objects.root.count, window.objects.box.x])).toEqual([2, 100]);
  await page.evaluate(() => (window.objects.root.active = false));
  await advance(page, 100);
  expect(await page.evaluate(() => [window.objects.root.count, window.objects.clock.running])).toEqual([2, false]);
});

test("a frame animation tells the time of every frame", async ({ page }) => {
  await open(page, "timer");
  await page.evaluate(() => window.objects.frames.start());
  await advance(page, 48);
  expect(await log(page)).toEqual(["frame 1 0.016 0.016", "frame 2 0.016 0.032", "frame 3 0.016 0.048"]);
  await page.evaluate(() => window.objects.frames.pause());
  await advance(page, 48);
  expect(await log(page)).toEqual([]);
  await page.evaluate(() => window.objects.frames.resume());
  await advance(page, 16);
  expect(await log(page)).toEqual(["frame 4 0.016 0.064"]);
  // Started again it counts from nothing.
  await page.evaluate(() => window.objects.frames.restart());
  await advance(page, 16);
  expect(await log(page)).toEqual(["frame 0 0.016 0.016"]);
  await page.evaluate(() => window.objects.frames.stop());
  expect(await page.evaluate(() => window.objects.clock.running)).toBe(false);
});

test("a timer's parent is the object it is declared in", async ({ page }) => {
  await open(page, "timer");
  // A handler says `parent.x` of what the timer moves along.
  expect(await page.evaluate(() => window.objects.bound.parent === window.objects.root)).toBe(true);
});

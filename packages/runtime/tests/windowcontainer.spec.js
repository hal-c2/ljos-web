// What is expected of `scenes/windowcontainer.qml` is what Qt 6.11 answers
// for it (`qml6`), read a moment after each step.
import { expect, open, test } from "./open.js";
import { pixels } from "./pixels.js";

const RED = "255 0 0";
const LIME = "0 255 0";
const BLUE = "0 0 255";
const YELLOW = "255 255 0";
const WHITE = "255 255 255";

// In the red window and its square, in the blue one and right of where it
// first ends, where the late one comes, and where it is on its own.
const POINTS = [
  [15, 25],
  [55, 25],
  [110, 30],
  [190, 30],
  [205, 5],
  [260, 160],
];

const read = (page) => page.evaluate(() => window.scene.read());
const step = (page, index) => page.evaluate((index) => window.scene.step(index), index);

test("a window an item holds is where the item is, of its size, and shown when it is", async ({ page }) => {
  await open(page, "windowcontainer");
  expect(await read(page)).toEqual([
    [0, 0, null],
    [50, 30, 50, 10, 20, 50, 30, true, 0],
    [80, 60, 105, 26, 80, 60, true],
    [0, 0, 40, 40, false, false],
    "",
  ]);
  expect(await pixels(page, POINTS)).toEqual([RED, LIME, BLUE, WHITE, WHITE, WHITE]);

  await step(page, 0);
  expect(await read(page)).toEqual([
    [0, 0, null],
    [50, 30, 50, 10, 20, 50, 30, true, 0],
    [120, 60, 105, 26, 120, 60, true],
    [40, 40, 40, 40, false, true],
    "late true",
  ]);
  expect(await pixels(page, POINTS)).toEqual([RED, LIME, BLUE, BLUE, WHITE, WHITE]);

  // A held window keeps its holder's size whatever it is given.
  await step(page, 1);
  expect(await read(page)).toEqual([
    [0, 0, null],
    [50, 30, 50, 10, 20, 50, 30, false, 0],
    [120, 60, 105, 26, 120, 60, true],
    [40, 40, 40, 40, true, true],
    "late true",
  ]);
  expect(await pixels(page, POINTS)).toEqual([WHITE, WHITE, BLUE, BLUE, YELLOW, WHITE]);

  // Let go, it is a window of its own again, still shown.
  await step(page, 2);
  expect(await read(page)).toEqual([
    [0, 0, null],
    [50, 30, 50, 10, 20, 50, 30, false, 0],
    [120, 60, 105, 26, 120, 60, true],
    [-1, -1, 40, 40, true, false],
    "late true,late false",
  ]);
  expect(await pixels(page, POINTS)).toEqual([WHITE, WHITE, BLUE, BLUE, WHITE, YELLOW]);
});

// Qt ends a window with the item that holds it when the window is the
// item's own: nothing of it is left to be shown on its own.
test("a window ended with the item that holds it leaves nothing of itself on the page", async ({ page }) => {
  await open(page, "windowcontainergone");
  expect(await pixels(page, [[40, 30]])).toEqual([RED]);
  const windows = () => page.evaluate(() => document.querySelectorAll(".qq-window").length);
  expect(await windows()).toBe(2);
  await page.evaluate(() => window.scene.end());
  await expect.poll(windows).toBe(1);
  expect(await pixels(page, [[40, 30]])).toEqual([WHITE]);
});

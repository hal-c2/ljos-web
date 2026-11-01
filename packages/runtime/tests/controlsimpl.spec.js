// What is expected here is what Qt 6.11 answers and paints for the same
// QML: the scene is run by `qml6` too, asked the same and grabbed, and
// `fixtures/controlsimpl.json` is what it said, `controlsimpl-pixels.json`
// the colours of its picture at some points.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, open, test } from "./open.js";
import { pixels } from "./pixels.js";

const fixture = (name) => JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", name), "utf8"));
const expected = fixture("controlsimpl.json");
const painted = fixture("controlsimpl-pixels.json");

async function ready(page) {
  await open(page, "controlsimpl");
  await page.waitForFunction(() => window.scene.ready());
}

// A colour as near as the rounding of two painters allows.
const near = (colour, [red, green, blue]) => {
  const [r, g, b] = colour.split(" ").map(Number);
  return Math.abs(r - red) <= 3 && Math.abs(g - green) <= 3 && Math.abs(b - blue) <= 3;
};

test("the types of QtQuick.Controls.impl answer what Qt's do", async ({ page }) => {
  await ready(page);
  const answers = await page.evaluate(() => JSON.parse(JSON.stringify(window.scene.answers())));
  for (const [index, row] of expected.entries()) expect(answers[index], `row ${index}`).toEqual(row);
  expect(answers.length).toBe(expected.length);
});

test("the types of QtQuick.Controls.impl paint what Qt's do", async ({ page }) => {
  await ready(page);
  // A tint is a mask of the picture, which the browser reads a moment after
  // the picture itself.
  await expect(async () => {
    const colours = await pixels(page, painted.map(([point]) => point));
    const wrong = painted.flatMap(([point, colour], index) => (near(colours[index], colour) ? [] : [`${point}: ${colours[index]}, Qt ${colour}`]));
    expect(wrong).toEqual([]);
  }).toPass({ timeout: 5000 });
});

// Whether there is a line under the text of the mnemonics at `x`: where it
// is below the letters is the browser's to say, as it is for an underlined
// font, and a pixel or two from where Qt has it.
async function underlined(page, x) {
  const below = await pixels(page, [163, 164, 165, 166, 167, 168, 169, 170, 171, 172].map((y) => [x, y]));
  return below.includes("0 0 255");
}

test("the letter a mnemonic marks is underlined", async ({ page }) => {
  await ready(page);
  expect([await underlined(page, 10), await underlined(page, 30), await underlined(page, 80)]).toEqual([true, false, false]);
  expect([await underlined(page, 210), await underlined(page, 230)]).toEqual([false, false]);
  await page.evaluate(() => window.scene.change(1));
  // "a&b", and "ab (&c)" with its mnemonic shown.
  expect([await underlined(page, 10), await underlined(page, 30)]).toEqual([false, true]);
  expect([await underlined(page, 260), await underlined(page, 280), await underlined(page, 300)]).toEqual([false, true, false]);
  await page.evaluate(() => window.scene.change(2));
  expect([await underlined(page, 10), await underlined(page, 30)]).toEqual([false, false]);
  expect(await pixels(page, [[30, 150]])).toEqual(["0 0 255"]);
});

test("a padding stays clear with a child under the rectangle", async ({ page }) => {
  await open(page, "paddedlowered");
  await expect.poll(async () => (await pixels(page, [[50, 10]]))[0]).toBe("0 255 0");
  expect((await pixels(page, [[5, 65], [50, 75]]))).toEqual(["255 0 0", "255 0 0"]);
});

test("a tint and a padding follow what they are of", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.scene.change(1));
  expect(await pixels(page, [[85, 25], [145, 25], [235, 80], [255, 80], [260, 150]])).toEqual([
    "0 255 0",
    "0 0 255",
    "255 255 255",
    "255 0 0",
    "0 0 255",
  ]);
  await page.evaluate(() => window.scene.change(2));
  expect(await pixels(page, [[85, 25]])).toEqual(["255 255 255"]);
});

test("a blend is opaque, but for the colour at either end", async ({ page }) => {
  await open(page, "colorblend");
  expect(await page.evaluate(() => window.scene.read())).toEqual([
    "#00000000",
    "#5f5f5f",
    "#800000ff",
    "#800000ff",
    "#80ff0000",
    "#ff0000",
    "#cfcfcf",
    "#030405",
    "#58585a",
    "#e6e6e6",
    "#1058c3",
  ]);
});

// QtQuick.VectorImage. Every number and colour here is what Qt 6.11 gave for
// the same QML.
import { test as plain } from "@playwright/test";
import { expect, open, test } from "./open.js";
import { pixels } from "./pixels.js";

const GREEN = "44 222 133";
const WHITE = "255 255 255";
const BLACK = "0 0 0";
const RED = "255 0 0";
const BLUE = "0 0 255";

const DRAWN = ["mark", "disc", "packed", "box", "units", "wide", "part", "across", "down", "acrossFit", "empty", "kids", "later"];
const PLACED = ["stretch", "fit", "crop", "asItIs", "offset", "squashed"];

// The scene, once every file in it has been read and every drawing is
// painted. A size is known once the file is read; its picture is an <img>
// that decodes the file after that, so what is painted is waited for on
// the pictures themselves (decoded, then two frames), not on the sizes.
async function drawings(page) {
  await open(page, "vectorimage");
  await page.waitForFunction((names) => names.every((name) => window.objects[name].implicitWidth > 0), [...DRAWN, ...PLACED]);
  await page.evaluate(async () => {
    const pictures = [...document.querySelectorAll("img.qq-vector")].filter((image) => image.getAttribute("src"));
    await Promise.all(pictures.map((image) => image.decode().catch(() => {})));
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
}

const read = (page, names) =>
  page.evaluate((names) => Object.fromEntries(names.map((name) => [name, window.scene.read(window.objects[name])])), names);

// The VectorImage's implicit width and height, its width and height, how
// many children it has, and of the one the file is drawn in: x, y, width,
// height, and how much it is scaled across and down.
const QT = {
  none: [0, 0, 0, 0, 0],
  mark: [90, 60, 90, 60, 1, 0, 0, 90, 60, 1, 1],
  disc: [60, 30, 60, 30, 1, 0, 0, 60, 30, 1, 1],
  packed: [60, 30, 60, 30, 1, 0, 0, 60, 30, 1, 1],
  box: [41, 21, 41, 21, 1, 0, 0, 41, 21, 1, 1],
  units: [70, 10, 70, 10, 1, 0, 0, 70, 10, 1, 1],
  wide: [40, 20, 40, 20, 1, 0, 0, 40, 20, 1, 1],
  part: [14, 20, 14, 20, 1, 0, 0, 14, 20, 1, 1],
  across: [90, 60, 180, 60, 1, 0, 0, 90, 60, 2, 1],
  down: [90, 60, 90, 30, 1, 0, 0, 90, 60, 1, 0.5],
  acrossFit: [90, 60, 180, 60, 1, 0, 0, 90, 60, 1, 1],
  empty: [90, 60, 0, 100, 1, 0, 0, 90, 60, 0, 0],
  kids: [90, 60, 90, 60, 2, 0, 0, 90, 60, 1, 1],
  later: [90, 60, 180, 60, 1, 0, 0, 90, 60, 1, 1],
};

const QT_PLACED = {
  stretch: [90, 60, 200, 100, 1, 0, 0, 90, 60, 2.2222222222222223, 1.6666666666666667],
  fit: [90, 60, 200, 100, 1, 0, 0, 90, 60, 1.6666666666666667, 1.6666666666666667],
  crop: [90, 60, 100, 50, 1, 0, 0, 90, 60, 1.1111111111111112, 1.1111111111111112],
  asItIs: [90, 60, 200, 100, 1, 0, 0, 90, 60, 1, 1],
  offset: [100, 50, 100, 100, 1, 0, 0, 100, 50, 1, 2],
  squashed: [30, 20, 30, 20, 1, 0, 0, 30, 20, 1, 1],
};

test("a VectorImage is of the size Qt makes of its file", async ({ page }) => {
  await drawings(page);
  expect(await read(page, Object.keys(QT))).toEqual(QT);
  // The enumerations, and what a VectorImage is before it is told anything.
  expect(await page.evaluate(() => window.scene.said())).toEqual([0, 1, 2, 3, 0, 1, 3, 0, false, 1, false]);
  // What is declared in one comes before what it draws in.
  expect(await page.evaluate(() => window.objects.kids.children[0] === window.objects.kid)).toBe(true);
});

test("fillMode scales the drawing from its top left corner", async ({ page }) => {
  await drawings(page);
  expect(await read(page, PLACED)).toEqual(QT_PLACED);
  const points = {
    // Stretched over all of it, the disc an ellipse from (56, 17) to (144, 83).
    // Its edge is one pixel wide: it is drawn at this size, not enlarged.
    stretch: [
      [[2, 2], GREEN],
      [[197, 97], GREEN],
      [[100, 50], WHITE],
      [[56, 50], WHITE],
      [[54, 50], GREEN],
      [[100, 18], WHITE],
      [[100, 15], GREEN],
      [[203, 50], BLACK],
      [[100, 103], BLACK],
    ],
    // 150 by 100, at the left: nothing is centred.
    fit: [
      [[212, 2], GREEN],
      [[357, 97], GREEN],
      [[363, 50], BLACK],
      [[285, 50], WHITE],
      [[254, 50], WHITE],
      [[250, 50], GREEN],
      [[285, 18], WHITE],
      [[285, 15], GREEN],
    ],
    // 100 by 66.67 in an item 50 high: what is below the item shows.
    crop: [
      [[2, 152], GREEN],
      [[97, 214], GREEN],
      [[50, 202], WHITE],
      [[50, 218], BLACK],
      [[103, 180], BLACK],
      [[50, 183], WHITE],
      [[26, 183], GREEN],
      [[30, 183], WHITE],
    ],
    asItIs: [
      [[212, 152], GREEN],
      [[297, 207], GREEN],
      [[303, 180], BLACK],
      [[255, 213], BLACK],
      [[255, 180], WHITE],
      [[255, 162], WHITE],
      [[255, 158], GREEN],
    ],
    // The viewBox starts at (10, 10); it is 40 by 20, and here 100 by 100.
    offset: [
      [[107, 112], RED],
      [[203, 208], RED],
      [[132, 137], BLUE],
      [[128, 137], RED],
      [[132, 132], RED],
      [[153, 158], BLUE],
      [[157, 158], RED],
      [[153, 162], RED],
      [[207, 150], BLACK],
      [[150, 212], BLACK],
    ],
    // The viewBox is stretched over the size, each way on its own.
    squashed: [
      [[312, 152], BLUE],
      [[337, 167], RED],
      [[323, 158], BLUE],
      [[327, 158], RED],
      [[323, 162], RED],
      [[342, 160], BLACK],
      [[320, 172], BLACK],
    ],
  };
  const all = Object.values(points).flat();
  const seen = await pixels(
    page,
    all.map(([point]) => point),
  );
  expect(seen.map((colour, index) => [all[index][0], colour])).toEqual(all);
});

const later = (page) => page.evaluate(() => window.scene.read(window.objects.later));

test("a VectorImage shows another file when it is given one, and keeps the one it has when given none", async ({ page }) => {
  await drawings(page);
  const set = (change) =>
    page.evaluate((change) => {
      Object.assign(window.objects.later, change);
    }, change);
  await set({ source: "/assets/disc.svg" });
  await expect.poll(() => later(page)).toEqual([60, 30, 180, 30, 1, 0, 0, 60, 30, 1, 1]);
  await set({ source: "" });
  expect(await later(page)).toEqual([60, 30, 180, 30, 1, 0, 0, 60, 30, 1, 1]);
  await set({ fillMode: 3 });
  expect(await later(page)).toEqual([60, 30, 180, 30, 1, 0, 0, 60, 30, 3, 1]);
  await set({ height: 90 });
  expect(await later(page)).toEqual([60, 30, 180, 90, 1, 0, 0, 60, 30, 3, 3]);
});

// The sizes alone, and those of the item a file would be drawn in.
const sizes = (page) =>
  page.evaluate(() => {
    const { implicitWidth, implicitHeight, width, height, children } = window.objects.later;
    return [implicitWidth, implicitHeight, width, height, children.length, children[0].width, children[0].height];
  });

plain("a file that is not there or is no drawing leaves a VectorImage of no size, and Qt's warning", async ({ page }) => {
  const said = [];
  page.on("pageerror", (error) => said.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") said.push(message.text());
  });
  await page.route("**/assets/missing.svg*", (route) => route.fulfill({ status: 404, body: "no" }));
  await drawings(page);
  const show = (name) =>
    page.evaluate((address) => {
      window.objects.later.height = 90;
      window.objects.later.source = address;
    }, `/assets/${name}`);
  await show("missing.svg");
  await expect.poll(() => sizes(page)).toEqual([0, 0, 180, 90, 1, 0, 0]);
  await show("mark.svg");
  await expect.poll(() => later(page)).toEqual([90, 60, 180, 90, 1, 0, 0, 90, 60, 1.5, 1.5]);
  await show("flag.png");
  await expect.poll(() => sizes(page)).toEqual([0, 0, 180, 90, 1, 0, 0]);
  // The browser says of its own accord that it was refused a file.
  const warned = said.filter((text) => !text.startsWith("Failed to load resource"));
  expect(warned).toHaveLength(2);
  expect(warned[0]).toMatch(/^qt\.svg: Cannot open file '.*missing\.svg', because: No such file or directory$/);
  expect(warned[1]).toMatch(/^qt\.svg: Cannot read file '.*flag\.png', because: /);
});

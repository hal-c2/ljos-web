// Item's coordinate functions. The numbers are the ones Qt 6.11 gives for
// the same scene.
import { expect, open, test } from "./open.js";

const round = (value) => Math.round(value * 1000) / 1000 + 0;
const point = ({ x, y }) => [round(x), round(y)];
const box = ({ x, y, width, height }) => [round(x), round(y), round(width), round(height)];

test("a point maps through rotation, scale and the transform list", async ({ page }) => {
  await open(page, "geometry");
  const mapped = await page.evaluate(() => {
    const { root, geoChild, other } = window.objects;
    return [
      geoChild.mapToItem(root, 0, 0),
      geoChild.mapToItem(root, 20, 10),
      // No item is the scene.
      geoChild.mapToItem(null, 0, 0),
      geoChild.mapToItem(other, 4, 6),
      geoChild.mapFromItem(root, 100, 100),
      geoChild.mapToItem(root, { x: 20, y: 10 }),
    ];
  });
  expect(mapped.map(point)).toEqual([
    [102, -29],
    [59.574, -0.716],
    [102, -29],
    [-244.284, -389.314],
    [23.511, -22.097],
    [59.574, -0.716],
  ]);
  // Where an item is seen is where it maps to.
  const seen = await page.evaluate(() => {
    const { geoChild, root } = window.objects;
    const { x, y, width, height } = geoChild.$node.getBoundingClientRect();
    const mapped = geoChild.mapToItem(root, 0, 0, 20, 10);
    return [
      [x, y, width, height],
      [mapped.x, mapped.y, mapped.width, mapped.height],
    ];
  });
  expect(seen[0].map(round)).toEqual(seen[1].map(round));
});

test("a rectangle maps to the one around its corners", async ({ page }) => {
  await open(page, "geometry");
  const mapped = await page.evaluate(() => {
    const { root, geo, geoChild, other } = window.objects;
    return [geoChild.mapToItem(root, 0, 0, 20, 10), geo.mapFromItem(other, { x: 0, y: 0, width: 40, height: 40 })];
  });
  expect(mapped.map(box)).toEqual([
    [59.574, -57.284, 42.426, 84.853],
    [102.5, -55, 10, 10],
  ]);
});

test("global coordinates are the page's", async ({ page }) => {
  await open(page, "geometry");
  await page.evaluate(() => {
    const scene = document.getElementById("scene");
    scene.style.marginLeft = "30px";
    scene.style.marginTop = "20px";
  });
  const mapped = await page.evaluate(() => {
    const { other, geoChild } = window.objects;
    return [
      other.mapToGlobal(0, 0),
      other.mapToGlobal({ x: 40, y: 40 }),
      other.mapFromGlobal(240, 180),
      geoChild.mapToGlobal(0, 0),
      geoChild.mapFromGlobal(132, -9),
    ];
  });
  expect(mapped.map(point)).toEqual([
    [240, 180],
    [260, 200],
    [0, 0],
    [132, -9],
    [0, 0],
  ]);
});

test("an item contains the points inside it, and finds the child at one", async ({ page }) => {
  await open(page, "geometry");
  const answers = await page.evaluate(() => {
    const { root, geo, geoChild, other } = window.objects;
    return [
      geo.contains({ x: 0, y: 0 }),
      geo.contains({ x: 100, y: 50 }),
      geo.contains({ x: 99.5, y: 49.5 }),
      geo.contains({ x: -1, y: 0 }),
      root.childAt(210, 160) === other,
      root.childAt(201, 151),
      geo.childAt(12, 7) === geoChild,
      geo.childAt(0, 0),
      root.childAt(70, 55) === geo,
      // One that is not shown is not found.
      root.childAt(310, 210),
    ];
  });
  expect(answers).toEqual([true, false, true, false, true, null, false, null, true, null]);
});

// What is given where an item is taken need not be one a type made: a plain
// `{ x, y, scale, … }` is mapped by what it says.
test("a plain object is mapped as an item with its numbers", async ({ page }) => {
  await open(page, "geometry");
  const mapped = await page.evaluate(async () => {
    const address = performance.getEntriesByType("resource").find(({ name }) => /\/QtQuick\/geometry\.ts(\?|$)/.test(name)).name;
    const { origin, toScene } = await import(address);
    const plain = { x: 5, y: 7, width: 20, height: 10, scale: 2, rotation: 0, transformOrigin: 4, children: [] };
    return [origin(plain), toScene(plain)];
  });
  expect(mapped[0]).toEqual({ x: 10, y: 5 });
  // Scaled by 2 about its centre (10, 5), then moved to (5, 7).
  expect(mapped[1].map(round)).toEqual([2, 0, 0, 2, -5, 2]);
});

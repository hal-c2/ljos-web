// QtGraphs' graphs in space. What is expected is what Qt 6.11 says and draws
// for the same QML: each `graph3d*.qml` scene is run by `qml6` too, asked the
// same and grabbed after each step. `fixtures/graphs3d.json` is what it said
// and `fixtures/graphs3d/` its pictures. The labels are of the test font,
// whose letters are boxes.
//
// Two renderers do not draw a picture alike to the pixel. A pixel counts as
// another when it is more than 16 levels from Qt's: the light on a wall, a
// bar or a point is within that of Qt's, and what is left is edges. Qt's
// lines are smoothed and a pixel wide wherever they fall, and those here are
// on whole pixels, so a line that falls between two differs all along; the
// edges of labels, of walls and of what is plotted differ by a pixel, Qt's
// bars have their edges cut, and a surface that is shaded smoothly is lit a
// little otherwise. That is between 4000 and 17000 of a picture's 240000
// pixels, most where the lines are many, and each picture may differ by a
// tenth more than it does. A graph whose points alone are elsewhere differs
// by 12000 from a picture that is under 6000 from its own, and one that is
// turned or zoomed otherwise by more.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./open.js";
import { pixels } from "./pixels.js";
import { fixtures, read, ready, step, unlike } from "./plots.js";

const expected = JSON.parse(readFileSync(join(fixtures, "graphs3d.json"), "utf8"));

// The scene says what Qt's did after each step, and is its picture but for
// fewer pixels than `most` has for that step.
async function same(page, scene, most) {
  const clip = await ready(page, scene);
  const rows = expected[scene];
  for (const [index, row] of rows.entries()) {
    expect(await read(page), `row ${index}`).toEqual(row);
    if (most[index] !== undefined) expect(await unlike(page, clip, `graphs3d/${scene}-${index}`, 16), `picture ${index}`).toBeLessThan(most[index]);
    if (index + 1 < rows.length) await step(page, index);
  }
}

test("surfaces through the rows of list models", async ({ page }) => {
  await same(page, "graph3dsurface", [8000, 4600, 6100, 7900, 11400, 14500]);
});

test("bars in the rows and columns of a list model", async ({ page }) => {
  await same(page, "graph3dbars", [11300, 11500, 10100, 7900, 8300, 4200]);
});

// Qt colours a point that is selected from the program once the data next
// changes, and the page at once: the second picture has one more to differ.
test("points from a list model, and the one that is selected", async ({ page }) => {
  await same(page, "graph3dscatter", [6000, 6600, 6000, 18900, 12400, 12400]);
});

// The last picture is not compared: bars that are made to be seen without
// depth, and nothing of their camera with it, fill their item in Qt, which
// seems to size such a graph only as its camera or its size next changes.
test("graphs that were given nothing, and what their cameras, axes and series answer", async ({ page }) => {
  await same(page, "graph3dbare", [6200, 7700, 12000, 8600, 9200, 9200]);
});

// What a graph plots is a Geometry like a program's, so the wgpu renderer,
// which reads only what a Geometry holds, draws it too. Here on WebGL2,
// which a headless browser has: the bars stand where they do on the
// JavaScript renderer, each in its series' colour, and not only the walls
// behind them.
test("on the wgpu renderer, a graph's bars are drawn and not only its walls", async ({ page }) => {
  await page.addInitScript(() => delete Navigator.prototype.gpu);
  await page.goto("/?scene=graph3dbars&view3d=wgpu");
  await page.waitForFunction(() => window.ready);
  await page.waitForFunction(() => window.scene.loaded !== false);
  await page.waitForFunction(() => {
    const state = document.querySelector(".qq-view3d").$view3d;
    if (state.error) throw new Error(state.error);
    return state.frames > 0;
  });
  expect(await page.evaluate(() => document.querySelector(".qq-view3d").$view3d.renderer)).toBe("wgpu");
  // Which of red, green and blue a pixel is mostly, or "wall": the walls
  // and the frame are grey, and the green series is a muted green, 60
  // apart where its light shines on it as it does on Qt's.
  const most = (colour) => {
    const [r, g, b] = colour.split(" ").map(Number);
    const top = Math.max(r, g, b);
    if (top - Math.min(r, g, b) < 40) return "wall";
    return top === r ? "red" : top === g ? "green" : "blue";
  };
  const seen = await pixels(page, [
    [75, 280],
    [75, 225],
    [75, 170],
    [187, 200],
    [300, 85],
  ]);
  expect(seen.map(most)).toEqual(["red", "green", "blue", "red", "green"]);
});

// A view no wider or no taller than nothing has no picture to draw, and a
// scene is ready without one: the wait ends with the view that draws, on
// either renderer, and not as the test's timeout does.
for (const renderer of ["js", "wgpu"])
  test(`a scene is ready though a view in it has no size, on the ${renderer} renderer`, async ({ page }) => {
    if (renderer === "wgpu") await page.addInitScript(() => delete Navigator.prototype.gpu);
    const late = new Promise((_, fail) => setTimeout(() => fail(new Error("still waiting for a view with no size to draw")), 5000));
    const clip = await Promise.race([ready(page, `unsized3d&view3d=${renderer}`), late]);
    expect(clip).toEqual({ x: 0, y: 0, width: 300, height: 100 });
    expect(await page.evaluate(() => [...document.querySelectorAll(".qq-view3d")].at(-1).$view3d.frames)).toBeGreaterThan(0);
  });

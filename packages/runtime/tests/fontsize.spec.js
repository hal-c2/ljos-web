// A font that is told to be no size at all stays as big as it was. The
// answers are Qt's own, from the same scene run by `qml6`.
import { test as plain } from "@playwright/test";
import { expect, open } from "./open.js";

// The pixel size and how tall a line of it is.
const QT = [
  "12/14 12/14 12/14 20/23 24/27 31/35 30/34 30/34 12/14 22/25",
  18,
  "20/23",
  "20/23",
  "Error: Cannot assign double to int",
  "20/23",
  "16/18",
];

// Qt tells of each binding that came to no number, so the page's warnings
// are looked at here and not by `test`.
plain("a font takes no notice of a size that is none", async ({ page }) => {
  const problems = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") problems.push(message.text());
  });
  await open(page, "fontsize");
  const said = await page.evaluate(() => window.scene.read());
  // A line is as tall as the browser's font makes it: within a pixel of Qt's.
  const sizes = (line) => String(line).split(" ").map((size) => size.split("/").map(Number));
  said.forEach((line, index) => {
    if (!String(QT[index]).includes("/")) return expect(line).toEqual(QT[index]);
    const [ours, theirs] = [sizes(line), sizes(QT[index])];
    expect(ours.map(([size]) => size)).toEqual(theirs.map(([size]) => size));
    ours.forEach(([, height], at) => expect(Math.abs(height - theirs[at][1])).toBeLessThanOrEqual(1));
  });
  expect(said.length).toBe(QT.length);
  // `none`, `through`, `labelled` and, once it is asked to, `later`.
  expect(problems).toEqual(Array(4).fill("font.pixelSize: Unable to assign double to int"));
});

// A plain object handed in as a font, as a chart's `labelsFont` can be,
// names only what it sets. What it leaves out is Qt's default font's:
// weight 400 and upright, so the canvas is never given `undefined` as a
// weight (an invalid font string it would ignore).
plain("a font that names only its size is the default font at that size", async ({ page }) => {
  await open(page, "fontsize");
  const said = await page.evaluate(async () => {
    // The page's own instance of the module, by the address it was loaded from.
    const address = performance.getEntriesByType("resource").find(({ name }) => /\/QtQuick\/font\.ts/.test(name)).name;
    const { describe } = await import(address);
    const { css, weight, italic } = describe({ pixelSize: 12, family: "Ljos Test" });
    const named = describe({ pixelSize: 12, family: "Ljos Test", styleName: "Bold Italic" });
    return { css, weight, italic, named: named.css };
  });
  expect(said).toEqual({
    css: '400 12px "Ljos Test", sans-serif',
    weight: 400,
    italic: false,
    named: 'italic 700 12px "Ljos Test", sans-serif',
  });
});

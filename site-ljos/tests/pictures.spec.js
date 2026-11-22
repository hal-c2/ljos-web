// The rules the build draws a live example's pictures by
// (scripts/pictures.mjs), held to the browser that draws them.
import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { drawPictures, paperOnly, shipsDark, verdictKey } from "../scripts/pictures.mjs";

const source = readFileSync(new URL("../bundle/tokens.js", import.meta.url), "utf8").replace(/^\.pragma library$/m, "");
const { light, dark } = new Function(`${source}\nreturn { light, dark };`)();
const papers = { light: light.paper, dark: dark.paper };
const stageOf = (paper) => `<!doctype html><style>html,body{margin:0;background:${paper}}</style>`;
const stages = { light: stageOf(papers.light), dark: stageOf(papers.dark) };
const box = (colour) => `<div style="width:60px;height:40px;background:${colour}"></div>`;

async function drawn(page, info, html, htmlDark = html) {
  const to = { light: info.outputPath("light.png"), dark: info.outputPath("dark.png") };
  const { blank } = await drawPictures(page, { html, htmlDark, width: 60, height: 40, papers, stages, to });
  const read = (path) => (existsSync(path) ? readFileSync(path) : null);
  return { blank, html, htmlDark, light: read(to.light), dark: read(to.dark) };
}

test("white content is not blank: the dark paper shows it", async ({ page }, info) => {
  expect((await drawn(page, info, box("white"))).blank).toBe(false);
});

test("content only the dark render draws is not blank", async ({ page }, info) => {
  expect((await drawn(page, info, "", box("#808080"))).blank).toBe(false);
});

test("white content with no dark render is judged on the dark paper too", async ({ page }, info) => {
  expect((await drawn(page, info, box("white"), null)).blank).toBe(false);
});

test("nothing drawn in either scheme is blank", async ({ page }, info) => {
  expect((await drawn(page, info, "")).blank).toBe(true);
});

test("a picture the same in both schemes ships once", async ({ page }, info) => {
  expect(shipsDark(await drawn(page, info, box("#808080")))).toBe(false);
});

// The same markup is not the same picture: the paper shows through.
test("the same markup on two papers ships a picture for each", async ({ page }, info) => {
  expect(shipsDark(await drawn(page, info, '<div style="width:20px;height:20px;background:#808080"></div>'))).toBe(true);
});

test("a kept blank verdict is dropped when the check changes", () => {
  const picture = "0123456789abcdef-0123456789ab.png";
  expect(verdictKey(picture, paperOnly)).toBe(verdictKey(picture, paperOnly));
  expect(verdictKey(picture, paperOnly)).not.toBe(verdictKey(picture, async () => true));
});

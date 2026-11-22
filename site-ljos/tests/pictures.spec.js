// The rules the build draws a live example's pictures by
// (scripts/pictures.mjs), held to the browser that draws them.
import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { prerenderSize } from "ljos-web/codeblocks";
import { drawPictures, shipsDark, stagesOf, verdictKey } from "../scripts/pictures.mjs";

const source = readFileSync(new URL("../bundle/tokens.js", import.meta.url), "utf8").replace(/^\.pragma library$/m, "");
const { light, dark } = new Function(`${source}\nreturn { light, dark };`)();
const stages = stagesOf({ light, dark });
const box = (colour) => `<div style="width:60px;height:40px;background:${colour}"></div>`;
const square = (colour) => `<div style="width:20px;height:20px;background:${colour}"></div>`;
// A root window as it prerenders: its styles, then itself with its ground on it.
const windowOn = (ground, inner) =>
  `<style>.qq-window{position:absolute;left:0;top:0;width:100%;height:100%}</style><div class="qq-window" style="background:${ground}">${inner}</div>`;

async function drawn(page, info, html, htmlDark = html) {
  const to = { light: info.outputPath("light.png"), dark: info.outputPath("dark.png") };
  const { blank } = await drawPictures(page, { html, htmlDark, width: 60, height: 40, stages, to });
  const read = (path) => (existsSync(path) ? readFileSync(path) : null);
  return { blank, html, htmlDark, light: read(to.light), dark: read(to.dark) };
}

test("white content is not blank on either paper", async ({ page }, info) => {
  expect((await drawn(page, info, box("white"))).blank).toEqual({ light: false, dark: false });
});

test("content only the dark render draws is blank in light alone", async ({ page }, info) => {
  expect((await drawn(page, info, "", box("#808080"))).blank).toEqual({ light: true, dark: false });
});

test("content only the light render draws is blank in dark alone", async ({ page }, info) => {
  expect((await drawn(page, info, box("#808080"), "")).blank).toEqual({ light: false, dark: true });
});

test("white content with no dark render is judged on the dark paper too", async ({ page }, info) => {
  expect((await drawn(page, info, box("white"), null)).blank).toEqual({ light: false, dark: false });
});

// #eeeeee is 15, 13 and 8 off the light paper.
test("pale content is not blank in the scheme that draws it", async ({ page }, info) => {
  expect((await drawn(page, info, box("#eeeeee"), "")).blank).toEqual({ light: false, dark: true });
});

test("nothing drawn in either scheme is blank in both", async ({ page }, info) => {
  expect((await drawn(page, info, "")).blank).toEqual({ light: true, dark: true });
});

test("an item that paints nothing is blank", async ({ page }, info) => {
  expect((await drawn(page, info, box("transparent"))).blank).toEqual({ light: true, dark: true });
});

test("a window that shows only its own ground is blank", async ({ page }, info) => {
  const hidden = '<div style="width:20px;height:20px;background:red;opacity:0"></div>';
  const { blank } = await drawn(page, info, windowOn("white", hidden), windowOn("black", hidden));
  expect(blank).toEqual({ light: true, dark: true });
});

test("pale content on a window's ground is not blank", async ({ page }, info) => {
  const { blank } = await drawn(page, info, windowOn("white", square("#f7f7f7")), windowOn("black", square("#101010")));
  expect(blank).toEqual({ light: false, dark: false });
});

test("content the colour of its window's ground is blank in that scheme alone", async ({ page }, info) => {
  const { blank } = await drawn(page, info, windowOn("#efefef", square("#efefef")), windowOn("black", square("#2f2f2f")));
  expect(blank).toEqual({ light: true, dark: false });
});

// A root window fills what it is drawn in; the size it asked is its
// content item's. Its picture is that size, or what stands past the
// unsized stage (320 by 180) is cut off and the window reads as empty.
test("content past the unsized stage is in its window's picture", async ({ page }) => {
  const html = `<style>.qq-window{position:absolute;left:0;top:0}</style><div class="qq-window" data-hk="1:ApplicationWindow" style="top: 0; left: 0; height: 100%; width: 100%; background: #ffffff;"><div class="qq" data-hk="2:Item" style="position: absolute; width: 400px; height: 260px;"><div style="position:absolute;left:16px;top:204px;width:80px;height:30px;background:#bdbdbd"></div></div></div>`;
  const { width = 320, height = 180 } = prerenderSize(html);
  expect((await drawPictures(page, { html, width, height, stages })).blank).toEqual({ light: false, dark: false });
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
  expect(verdictKey(picture, drawPictures)).toBe(verdictKey(picture));
  expect(verdictKey(picture)).not.toBe(verdictKey(picture, async () => true));
});

// `mount(Component, element, props, { fill: true })`: a root that is not a
// Window, sized by the element it is in, as qml6 sizes a root with
// QQuickView's SizeRootObjectToView.
import { expect, test } from "./open.js";

const size = (page) => page.evaluate(() => [window.scene.width, window.scene.height, window.scene.half]);

test("without the option a root keeps the size its file gives it", async ({ page }) => {
  await page.goto("/?scene=mountfill");
  await page.waitForFunction(() => window.ready);
  expect(await size(page)).toEqual([120, 80, 60]);
});

test("with it the root is the element's size, and what reads its size follows", async ({ page }) => {
  await page.goto("/?scene=mountfill&fill");
  await page.waitForFunction(() => window.ready);
  const element = await page.evaluate(() => {
    const { clientWidth, clientHeight } = document.getElementById("scene");
    return [clientWidth, clientHeight, clientWidth / 2];
  });
  expect(await size(page)).toEqual(element);
});

test("the root follows the element when it changes size, with nothing asking", async ({ page }) => {
  await page.goto("/?scene=mountfill&fill");
  await page.waitForFunction(() => window.ready);
  await page.evaluate(() => {
    const element = document.getElementById("scene");
    element.style.width = "333px";
    element.style.height = "111px";
  });
  await expect.poll(() => size(page)).toEqual([333, 111, 166.5]);
});

test("a reload keeps following the element", async ({ page }) => {
  await page.goto("/?scene=mountfill&fill");
  await page.waitForFunction(() => window.ready);
  expect(await page.evaluate(() => window.reload("mountfill"))).toBe(null);
  await page.evaluate(() => {
    document.getElementById("scene").style.width = "222px";
  });
  await expect.poll(() => size(page).then(([width]) => width)).toBe(222);
});

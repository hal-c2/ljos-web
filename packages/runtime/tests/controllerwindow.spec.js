// A Controller declared in a Window, as ljos-ui's
// `features/components/controller.feature` has it: its host is the window,
// and a gesture in it acts on the window's content item.
import { expect, open, test } from "./open.js";

test("a Controller in a Window is attached to the window", async ({ page }) => {
  await open(page, "controllerwindow");
  expect(await page.evaluate(() => window.scene.onWindow)).toBe(true);
  expect(await page.evaluate(() => window.scene.controller.host === window.scene)).toBe(true);
});

test("a Tap in a Window acts on its content item", async ({ page }) => {
  await open(page, "controllerwindow");
  expect(await page.evaluate(() => window.scene.tap.host === window.scene.contentItem)).toBe(true);
  const box = await page.evaluate(() => {
    const { x, y } = window.scene.contentItem.$node.getBoundingClientRect();
    return { x, y };
  });
  await page.mouse.click(box.x + 50, box.y + 20);
  await expect.poll(() => page.evaluate(() => window.scene.taps)).toBe(1);
});

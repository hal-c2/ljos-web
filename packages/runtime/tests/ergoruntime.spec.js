// A Controller, a Tap, a Task and Ljos.Ui's font and enums in one file of
// Ljós's API, compiled by qmlc and run: what the other specs prove of each
// by itself, written as a person writes it.
import { expect, open, test } from "./open.js";

const SKIES = { Oslo: "clear", Bergen: "rain" };

const text = (page, name) => page.evaluate((name) => window.scene[`${name}Text`], name);

test.beforeEach(async ({ page }) => {
  await page.route("**/served/*.json", (route) => {
    const city = new URL(route.request().url()).pathname.split("/").pop().replace(".json", "");
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ sky: SKIES[city] }) });
  });
  await open(page, "ergoruntime");
});

test("the card's Controller, Tap and Task work as the file says", async ({ page }) => {
  await expect.poll(() => text(page, "size")).toBe("card 340×180");
  await expect.poll(() => text(page, "weather")).toBe("Oslo: clear");
  const box = await page.evaluate(() => {
    const { x, y } = window.scene.card.$node.getBoundingClientRect();
    return { x, y };
  });
  await page.mouse.click(box.x + 20, box.y + 20);
  await expect.poll(() => text(page, "taps")).toMatch(/^tapped 1 · /);
  await page.evaluate(() => {
    window.scene.city = "Bergen";
    window.scene.width = 400;
  });
  await expect.poll(() => text(page, "weather")).toBe("Bergen: rain");
  await expect.poll(() => text(page, "size")).toBe("card 380×180");
});

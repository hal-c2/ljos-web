// The browser's focus follows the keys. A screen reader says what the
// page's focus is on, not what the runtime draws a ring around: a stop
// reached with Tab has to be the page's focused element too, with the
// role and name the reader hears.
import { expect, open, test } from "./open.js";

const focused = (page) =>
  page.evaluate(() => {
    const at = document.activeElement;
    const owner = Object.keys(window.objects).find((name) => {
      const item = window.objects[name];
      return Boolean(item?.$node) && (item.$node === at || item.$node.contains(at));
    });
    return { owner: owner ?? null, tag: at?.tagName ?? null };
  });

test("Tab and Shift+Tab move the page's focus to the stop they reach", async ({ page }) => {
  await open(page, "tabdom");
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => window.objects.one.activeFocus)).toBe(true);
  expect(await focused(page)).toEqual({ owner: "one", tag: "DIV" });
  await expect(page.locator(":focus")).toHaveRole("button");
  await expect(page.locator(":focus")).toHaveAccessibleName("One");

  await page.keyboard.press("Tab");
  expect(await focused(page)).toEqual({ owner: "two", tag: "DIV" });
  await expect(page.locator(":focus")).toHaveAccessibleName("Two");

  // A field's own input is what a reader types in, and what is focused.
  await page.keyboard.press("Tab");
  expect(await focused(page)).toEqual({ owner: "field", tag: "INPUT" });
  await expect(page.locator(":focus")).toHaveAccessibleName("Your name");

  await page.keyboard.press("Shift+Tab");
  expect(await focused(page)).toEqual({ owner: "two", tag: "DIV" });
  expect(await page.evaluate(() => window.objects.two.activeFocus)).toBe(true);
});

test("the keys still reach the item, and the browser draws no ring of its own", async ({ page }) => {
  await open(page, "tabdom");
  await page.keyboard.press("Tab");
  expect(await focused(page)).toEqual({ owner: "one", tag: "DIV" });
  // The style draws focus as it wants to: the browser's outline on top of
  // it would be a second ring.
  expect(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)).toBe("none");
  await page.evaluate(() => {
    window.clicked = 0;
    window.objects.one.clicked.connect(() => window.clicked++);
  });
  await page.keyboard.press("Space");
  expect(await page.evaluate(() => window.clicked)).toBe(1);
});

test("focus given by the page's code takes the page's focus only from inside it", async ({ page }) => {
  await open(page, "tabdom");
  // Nothing in the scene has the page's focus: code moving the runtime's
  // focus does not take it, as a reader is somewhere else on the page.
  await page.evaluate(() => window.objects.two.forceActiveFocus());
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  // Once the reader is in the scene, it follows wherever focus goes.
  await page.keyboard.press("Tab");
  expect(await focused(page)).toEqual({ owner: "field", tag: "INPUT" });
  await page.evaluate(() => window.objects.one.forceActiveFocus());
  expect(await focused(page)).toEqual({ owner: "one", tag: "DIV" });
});

import { expect, open, test } from "./open.js";

// An object declared for an alias of another object's property is made
// once, as Qt makes it: its `Component.onCompleted` runs once. So is one
// given through an alias of an alias.
test("an object given an alias of an object's property is made once", async ({ page }) => {
  await open(page, "aliasobjectonce");
  expect(await page.evaluate(() => window.scene.read())).toEqual([1, true, 1, true]);
});

import { expect, open, test } from "./open.js";

// An object declared for an alias of another object's property is made
// once, as Qt makes it: its `Component.onCompleted` runs once. So is one
// given through an alias of an alias.
test("an object given an alias of an object's property is made once", async ({ page }) => {
  await open(page, "aliasobjectonce");
  expect(await page.evaluate(() => window.scene.read())).toEqual([1, true, 1, true]);
});

// Read before the target is given its binding (an object made earlier reads
// the alias as its own value completes): what that read made is handed to
// the target, not made again. Qt 6.12.0 gives `[1, true, true]`.
test("an object an alias is read for before it is bound is made once", async ({ page }) => {
  await open(page, "aliasobjectearly");
  expect(await page.evaluate(() => window.scene.read())).toEqual([1, true, true]);
});

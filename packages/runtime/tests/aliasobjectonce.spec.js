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

// An alias of an alias is assigned rather than bound, once the instance is
// complete: until that assignment reaches the target, a read gives what the
// instance was given. Here the read is the `Component.onCompleted` of an
// instance a binding makes (`createObject()`), which runs at once rather
// than once the scene settles. Qt 6.12.0 gives `[true, true]`.
test("an alias of an alias read as the instance a binding made completes is what it was given", async ({ page }) => {
  await open(page, "aliasobjectmade");
  expect(await page.evaluate(() => window.scene.read())).toEqual([true, true]);
});

// The same read by instances made in a state's flush, and in a script.
// Qt 6.12.0 gives `[true]` for each.
for (const made of ["inState", "inScript"]) {
  test(`an alias of an alias read as an instance made ${made === "inState" ? "in a state's flush" : "in a script"} completes is what it was given`, async ({ page }) => {
    await open(page, "aliasobjectflush");
    expect(await page.evaluate((made) => window.scene[made](), made)).toEqual([true]);
  });
}

// A state that overrides such an alias gives back the object declared as it
// ends, the one made, each time it ends. Qt 6.12.0 gives this.
test("an alias an object was declared for is given that object back each time a state ends", async ({ page }) => {
  await open(page, "aliasobjectrelease");
  const before = [1, true, false, 1, true, false];
  const during = [1, false, true, 1, false, true];
  expect(await page.evaluate(() => window.scene.read())).toEqual([before, during, before, during, before]);
});

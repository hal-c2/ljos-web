// What a non-visual native type says of itself, from its Rust, in a browser
// (docs/LJOS_WEB.md Part II §2, items 2, 4, 5, 6 and 11).
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  page.problems = [];
  page.on("pageerror", (error) => page.problems.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") page.problems.push(message.text());
  });
  await page.goto("/?scene=Facets");
  await page.waitForFunction(() => window.ready);
});

test.afterEach(async ({ page }) => {
  expect(page.problems).toEqual([]);
});

test("a field's write hook has every write, and what it kept is what QML reads", async ({ page }) => {
  expect(await page.evaluate(() => window.scene.shelf.level)).toBe(5);
  expect(await page.evaluate(() => { window.scene.shelf.level = -3; return window.scene.shelf.level; })).toBe(0);
  expect(await page.evaluate(() => { window.scene.shelf.level = 4; return window.scene.shelf.level; })).toBe(4);
  // What it keeps is what a binding on it sees, the moment it is written.
  expect(await page.evaluate(() => { window.scene.shelf.level = -8; return window.scene.seenLevel; })).toBe(0);
});

test("a method's return comes back and what it changed is told", async ({ page }) => {
  const told = await page.evaluate(() => {
    const shelf = window.scene.shelf;
    const first = shelf.add(2);
    const second = shelf.add(3);
    return [first, second, shelf.total];
  });
  expect(told).toEqual([2, 5, 5]);
});

test("what Rust changes is the property, over a value QML assigned", async ({ page }) => {
  const levels = await page.evaluate(() => {
    const shelf = window.scene.shelf;
    shelf.level = 6;
    const before = shelf.level;
    shelf.raise();
    return [before, shelf.level, window.scene.seenLevel];
  });
  expect(levels).toEqual([6, 7, 7]);
});

test("a read-only property has no setter across", async ({ page }) => {
  const rust = await page.evaluate(() => {
    const shelf = window.scene.shelf;
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(shelf.$rust), "total");
    return { get: typeof descriptor.get, set: typeof descriptor.set };
  });
  expect(rust).toEqual({ get: "function", set: "undefined" });
});

test("a group's member reaches the struct and reads back", async ({ page }) => {
  expect(await page.evaluate(() => window.scene.doubled)).toBe(18);
  expect(await page.evaluate(() => window.scene.shelf.maxOfLimits())).toBe(9);
  const after = await page.evaluate(() => {
    window.scene.shelf.limits.max = 11;
    return [window.scene.doubled, window.scene.shelf.maxOfLimits()];
  });
  expect(after).toEqual([22, 11]);
});

test("an enum's key reads as the Rust said", async ({ page }) => {
  expect(await page.evaluate(() => window.scene.right)).toBe(1);
});

// DECISION: through the object, not through QML's own `Shelf.weight` or
// `other.Shelf.weight`. Writing `Shelf.weight: 3` and `Shelf.onTallied:` compiles
// from the dump, but the compiler's read of an attached member asks Qt's type
// table, which a dumped type isn't in (crates/ljos_web/src/quick/names.rs), so
// such a read means the type's own member. A gap of the compiler's, not the face's.
test("an attached object is one per object, with its own struct and signals", async ({ page }) => {
  const seen = await page.evaluate(() => {
    const tag = window.scene.$attached.Shelf;
    tag.tally();
    tag.tally();
    return [tag.weight, window.scene.tallies, Boolean(window.scene.shelf.$attached?.Shelf)];
  });
  expect(seen).toEqual([3, 2, false]);
});

test("a singleton starts from its Default and is one object", async ({ page }) => {
  expect(await page.evaluate(() => window.scene.started)).toBe(7);
  expect(await page.evaluate(() => { window.scene.bumpStore(); return window.scene.started; })).toBe(8);
});

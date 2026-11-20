import { expect, open, test } from "./open.js";

// `property alias content: inner.data`: what an instance declares for it
// joins what the item already has (an item among its children, anything
// else among its resources), and a binding's list replaces it, leaving
// what the list no longer has without a parent, as Qt 6.12 does. So does
// a list a script writes to it.
test("objects given to an alias of an item's list are that item's", async ({ page }) => {
  await open(page, "aliaslist");
  const read = () => page.evaluate(() => window.scene.read());
  // Where `two` is before it is in the list is not this test's: an item a
  // property holds is the declaring item's here, and nobody's in Qt.
  expect(await read()).toMatchObject({ declared: "own,given", resources: "timer", given: "inner", bound: "one", one: "inner", written: "own" });
  await page.evaluate(() => (window.scene.flag = false));
  expect(await read()).toEqual({ declared: "own,given", resources: "timer", given: "inner", bound: "two", one: null, two: "inner", written: "own" });
  await page.evaluate(() => window.scene.write());
  expect((await read()).written, "a script's list is the whole of it").toBe("three");
});

// A list written to the alias is the whole of it in its order, as Qt 6.12
// has it: one with the same objects in another order is that order.
test("a list written to an alias of an item's list is in its order", async ({ page }) => {
  await open(page, "aliaslist");
  expect(await page.evaluate(() => window.scene.reorder())).toEqual(["alpha,beta,gamma", "gamma,alpha,beta"]);
});

// The write ends what was bound to the alias, as an assignment ends any
// property's binding (Qt 6.12), so what the binding then gives is not the
// item's.
test("a list written to an alias of an item's list ends what was bound to it", async ({ page }) => {
  await open(page, "aliaslist");
  await page.evaluate(() => window.scene.writeOverBinding());
  expect(await page.evaluate(() => window.scene.reboundNow())).toEqual({ children: "six", fiveInside: false });
  await page.evaluate(() => (window.scene.flag = false));
  expect(await page.evaluate(() => window.scene.reboundNow())).toEqual({ children: "six", fiveInside: false });
});

// `property alias kept: inner.resources`: what it is given is the item's
// without the item drawing it, so an item keeps the parent it has, and a
// declared one has none, as in Qt 6.12. A binding's list is the whole.
test("objects given to an alias of an item's resources are held, not drawn", async ({ page }) => {
  await open(page, "aliaslist");
  const object = await page.evaluateHandle(async () => {
    const address = performance.getEntriesByType("resource").find(({ name }) => /\/object\.ts(\?|$)/.test(name)).name;
    return await import(address);
  });
  const holders = () => page.evaluate((object) => [object.holdersOf(window.scene.heldOne()), object.holdersOf(window.scene.otherOne())], object);
  const [drawn, other] = await holders();
  const held = () => page.evaluate(() => window.scene.held());
  expect(await held()).toEqual({ kept: "made,kept timer", drawing: "own", made: null, holding: "drawn", drawn: "root", other: "root" });
  await page.evaluate(() => (window.scene.flag = false));
  expect(await held()).toEqual({ kept: "made,kept timer", drawing: "own", made: null, holding: "other", drawn: "root", other: "root" });
  // What the list no longer has is no longer held by the item.
  expect(await holders()).toEqual([drawn - 1, other + 1]);
});

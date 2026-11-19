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

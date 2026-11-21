import { expect, open, test } from "./open.js";

// An item's own `onChildrenChanged` runs when a child is moved into it, made
// into it or moved out, before the move returns, as qml6 tells it; the item
// it left hears it too. Children declared inside it as it is made, or
// the same parent given again, or a Timer made in it, change none of its
// children. A Connections on it hears the same moves, and writes from its
// handler as any handler does.
test("an item's own onChildrenChanged hears a child moved into it", async ({ page }) => {
  await open(page, "ownchildrenchanged");
  expect(await page.evaluate(() => window.scene.move())).toEqual([1, 1, 1, 2, 2, 3, 0, 3]);
});

// A binding that makes an object into an item: the item hears of it once,
// and by the time the write that set the binding off returns, as qml6 has
// it ([1, 1, 1]). The flush is the one already settling that binding; a
// second inside it would tell before the binding's work is done.
test("an item made into by a binding hears of its child once the binding has settled", async ({ page }) => {
  await open(page, "ownchildrenchanged");
  expect(await page.evaluate(() => window.scene.bound())).toEqual([1, 1, 1]);
});

// The same, where the item's handler changes what the binding goes on to
// read: read from outside, the binding is what it is once the handler ran,
// as qml6 has it ([2, 1, 1, 2]), and makes no second child.
test("a binding that made into an item is read as it is once the item heard of it", async ({ page }) => {
  await open(page, "ownchildrenchanged");
  expect(await page.evaluate(() => window.scene.reread())).toEqual([2, 1, 1, 2]);
});

// A type that declares a `children` of its own: the same list given again
// is a change, as qml6 tells it of a `var`: heard once more.
test("a children a type declares itself changes when given again", async ({ page }) => {
  await open(page, "ownchildrenchanged");
  expect(await page.evaluate(() => window.scene.overridden())).toBe(1);
});

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

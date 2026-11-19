import { expect, open, test } from "./open.js";

// What Qt 6.11 answers for the same scene.
test("an object is an instance of its type, of what that extends and of the component that made it", async ({ page }) => {
  await open(page, "kinds");
  expect(await page.evaluate(() => window.scene.kinds())).toEqual([
    // A Shape: a Shape, an Item, no Rectangle, a QtObject.
    true, true, false, true,
    // A Rectangle: one, an Item, no Tile.
    true, true, false,
    // A ShapePath is one and no Item; a Text is one.
    true, false, true,
    // A Tile: one, a Rectangle, no Text.
    true, true, false,
    // A QtObject is one and no Item; what is no object is neither.
    true, false, false, false, false, false,
  ]);
});

test("what an object has is its own, whether its type's or declared", async ({ page }) => {
  await open(page, "kinds");
  expect(await page.evaluate(() => window.scene.owns())).toEqual([
    // fillColor, nothing, extra, color, width, objectName, destroy, forceActiveFocus
    true, false, true, true, true, true, true, true,
    // hello, went, widthChanged, onWidthChanged, anchors, a Tile's kind
    true, true, true, true, true, true,
    // "color" in, "nothing" in
    true, false,
  ]);
});

test("an object that is destroyed is gone once what destroyed it is done", async ({ page }) => {
  await open(page, "kinds");
  const scene = (work) => page.evaluate(work);
  // One written in the file is destroyed as one made later is.
  const once = await scene(() => [
    window.scene.read(),
    window.scene.refuse(),
    window.scene.make(),
    window.scene.read(),
    window.scene.unmake(),
    window.scene.read(),
  ]);
  expect(once).toEqual([[4, []], "destroyed", 5, [5, []], 5, [5, []]]);
  await expect.poll(() => scene(() => window.scene.read())).toEqual([3, ["gone chip"]]);

  // With a delay it stays that long.
  // Read again by a page timer set after the delay's, so it runs first
  // however late a loaded page runs both; read from the test 100 ms on,
  // a slow round trip could come after the delay.
  expect(
    await scene(() => {
      const now = [window.scene.make(), window.scene.unmake(250), window.scene.read()];
      return new Promise((done) => setTimeout(() => done([...now, window.scene.read()]), 100));
    }),
  ).toEqual([4, 4, [4, ["gone chip"]], [4, ["gone chip"]]]);
  await expect.poll(() => scene(() => window.scene.read())).toEqual([3, ["gone chip", "gone chip"]]);

  // Destroyed twice it is destroyed once.
  await scene(() => {
    window.scene.make();
    window.scene.made.destroy();
    window.scene.made.destroy();
  });
  await expect.poll(() => scene(() => window.scene.read())).toEqual([3, ["gone chip", "gone chip", "gone chip"]]);
});

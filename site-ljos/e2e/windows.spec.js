// An example whose root is a Window or an ApplicationWindow runs in
// its block's frame, as every other example does: what it draws stays
// inside the stage its picture stood in, not over the site.
import { centreOf, classify, expect, livePages, open, run, test } from "./fixtures.js";
import { windowRoot } from "./known.js";

const windows = livePages().flatMap(({ route, examples }) => examples.filter((example) => classify(example.code).window).map((example) => ({ route, example })));

for (const { route, example } of windows) {
  test(`${route} #${example.index} (${example.hash}): the window stays in its frame`, async ({ page, wasm }) => {
    test.skip(!wasm, "without WebAssembly the example does not run");
    test.fixme(true, windowRoot);
    await open(page, route);
    const block = await run(page, example.index);
    const { box: stage } = await centreOf(block.stage);
    const layers = await page.locator(".qq-layer").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().toJSON()));
    expect(layers.length, "the window draws somewhere").toBeGreaterThan(0);
    for (const layer of layers) {
      expect(layer.x, "inside on the left").toBeGreaterThanOrEqual(stage.x - 1);
      expect(layer.y, "inside at the top").toBeGreaterThanOrEqual(stage.y - 1);
      expect(layer.x + layer.width, "inside on the right").toBeLessThanOrEqual(stage.x + stage.width + 1);
      expect(layer.y + layer.height, "inside at the bottom").toBeLessThanOrEqual(stage.y + stage.height + 1);
    }
  });
}

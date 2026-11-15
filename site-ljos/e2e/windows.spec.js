// An example whose root is a Window or an ApplicationWindow runs in
// its block's frame, as every other example does: what it draws stays
// inside the stage its picture stood in, not over the site.
import { centreOf, classify, expect, livePages, open, run, test, unexpected } from "./fixtures.js";

const windows = livePages().flatMap(({ route, examples }) => examples.filter((example) => classify(example.code).window).map((example) => ({ route, example })));

test("the docs have examples whose root is a window", () => {
  expect(windows.length).toBeGreaterThan(10);
});

for (const { route, example } of windows) {
  test(`${route} #${example.index} (${example.hash}): the window stays in its frame`, async ({ page, errors, wasm }) => {
    test.skip(!wasm, "without WebAssembly the example does not run");
    await open(page, route);
    const block = await run(page, example.index);
    const { box: stage } = await centreOf(block.stage);
    // Nothing floats over the site as a window of its own.
    await expect(page.locator(".qq-layer"), "no window floats over the page").toHaveCount(0);
    // The window is in the stage, and as large as it: it draws there.
    const window = block.stage.locator(".qq-window").first();
    await expect(window, "the window is in the block's stage").toBeVisible();
    const { box } = await centreOf(window);
    expect(box.width * box.height, "the window has a size").toBeGreaterThan(100);
    expect(box.x, "inside on the left").toBeGreaterThanOrEqual(stage.x - 1);
    expect(box.y, "inside at the top").toBeGreaterThanOrEqual(stage.y - 1);
    expect(box.x + box.width, "inside on the right").toBeLessThanOrEqual(stage.x + stage.width + 1);
    expect(box.y + box.height, "inside at the bottom").toBeLessThanOrEqual(stage.y + stage.height + 1);
    expect(await window.evaluate((element) => element.querySelectorAll("*").length), "the window holds what it draws").toBeGreaterThan(0);
    // The site's header, over the page, is still the site's.
    const covered = await block.stage.evaluate((element) => element.contains(document.elementFromPoint(innerWidth / 2, 20)));
    expect(covered, "the site's header is not covered").toBe(false);
    expect(unexpected(errors)).toEqual([]);
  });
}

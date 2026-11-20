import { expect, open, rect, test } from "./open.js";

const log = (page) => page.evaluate(() => window.objects.log.splice(0));

test("Connections hear the signals of their target", async ({ page }) => {
  await open(page, "connections");
  const first = await page.evaluate(() => {
    const { root, own, one } = window.objects;
    root.poked("me", 1);
    one.width = 60;
    // Not a change of the width, though it is read again for it.
    one.opacity = 0.5;
    return own.target === root;
  });
  expect(first).toBe(true);
  expect(await log(page)).toEqual(["own me 1", "width of one 60"]);
  // One that is not enabled hears nothing; one whose target changed hears
  // the new one only.
  await page.evaluate(() => {
    const { root, one } = window.objects;
    one.height = 51;
    root.on = true;
    one.height = 52;
    one.width = 70;
    root.size = 20;
  });
  expect(await log(page)).toEqual(["height 52", "width of two 60"]);
});

test("a Binding gives a property its value while `when` holds", async ({ page }) => {
  await open(page, "connections");
  const size = (page) =>
    page.evaluate(() => {
      const { two } = window.objects;
      return [two.width, two.height, two.tag];
    });
  await page.evaluate(() => void (window.objects.root.on = true));
  const bound = await page.evaluate(() => {
    const { root, two, bind } = window.objects;
    root.count = 1;
    return [two.width, two.height, bind.when];
  });
  expect(bound).toEqual([100, 99, true]);
  expect(await rect(page, "two")).toEqual({ x: 0, y: 60, width: 100, height: 99 });
  await page.evaluate(() => void (window.objects.root.count = 2));
  // `RestoreNone` leaves the height as it was made.
  expect(await size(page)).toEqual([200, 99, 2]);
  // The width has its binding again, and the declared property its value.
  await page.evaluate(() => void (window.objects.root.count = 0));
  expect(await size(page)).toEqual([30, 99, 7]);
  await page.evaluate(() => void (window.objects.root.size = 30));
  expect(await size(page)).toEqual([90, 99, 7]);
  // The handler heard each width once: none between two values.
  expect(await log(page)).toEqual(["width of two 100", "width of two 200", "width of two 30", "width of two 90"]);
});

test("a Connections' handler is a function it may call itself", async ({ page }) => {
  await open(page, "connectioncalled");
  expect(await page.evaluate(() => window.scene.heard)).toEqual([0]);
  await page.evaluate(() => (window.scene.count = 2));
  expect(await page.evaluate(() => window.scene.heard)).toEqual([0, 2]);
});

test("a Connections whose target is Component hears of its own completion", async ({ page }) => {
  await open(page, "connectionown");
  expect(await page.evaluate(() => window.scene.said)).toEqual(["own", "root"]);
});

// A change of a list that has no signal of its own (`children`) is told
// once what changed has settled, as every other change is: the handler
// reads bindings up to date, and its write asks for no flush inside the one
// that found the change (no FLUSH_IN_EFFECT_CALLBACK, which open.js fails).
// Nothing is heard as the scene is made: `children` is a new list each time
// it is read, and the same items in a new list are no change.
test("a Connections hears childrenChanged once the move has settled, and writes outside the flush", async ({ page }) => {
  await open(page, "connectionchildren");
  expect(await page.evaluate(() => window.scene.before()), "nothing heard as it is made").toBe(0);
  expect(await page.evaluate(() => window.scene.move())).toEqual([1, [2], 1]);
});

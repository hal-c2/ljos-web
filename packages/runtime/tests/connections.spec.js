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

// Only the effect's first read takes the same items as no change: once the
// scene is made, a list property given a new array with the same items in
// it has changed, and its own handler hears it once.
test("a list property given a new array with the same items is heard once the scene is made", async ({ page }) => {
  await open(page, "connectionchildren");
  expect(await page.evaluate(() => window.scene.copy())).toEqual([0, 1]);
});

// A change of a list with no signal of its own is told once its flush has
// settled, by when a handler may have given its Connections another
// target. A change made while an object was the target is heard, as Qt
// hears it the moment it is made: of the old target before the switch, of
// the new one after it; a change of the old one after the switch is not.
test("a Connections whose target is replaced in the flush hears what changed while it was the target", async ({ page }) => {
  await open(page, "connectionswitch");
  expect(await page.evaluate(() => window.scene.changed()), "box changed while it was the target").toEqual([0]);
  expect(await page.evaluate(() => window.scene.switched()), "other changed once box was again, then box").toEqual([0, 1]);
});

// The case above counts what was heard, which does not say of which
// target: each is changed alone here, on a scene of its own.
test("a Connections whose target is replaced in the flush does not hear the old target changed after it", async ({ page }) => {
  await open(page, "connectionswitch");
  expect(await page.evaluate(() => window.scene.switchedOld())).toEqual([]);
});

test("a Connections whose target is replaced in the flush hears the new target changed after it", async ({ page }) => {
  await open(page, "connectionswitch");
  expect(await page.evaluate(() => window.scene.switchedNew())).toEqual([0]);
});

// Qt 6.11: `box.childrenChanged` is told as `third` is added, before
// `third.parentChanged` gives the binding, and so the Connections, another
// target: the change was made while `box` was the target, and is heard.
// Ljós finds it once the flush settles, after the binding has replaced the
// target and let go of `box`'s listener (hal-c2/ljos-web#144).
test("a Connections whose target the same change replaces through a binding hears it of the old target", async ({ page }) => {
  test.fail(true, "hal-c2/ljos-web#144: the change is found after the target is replaced");
  await open(page, "connectionswitch");
  expect(await page.evaluate(() => window.scene.replaced())).toEqual([0]);
});

// A Connections whose target is switched around a change of `children`
// hears what its target was when the change was made (Qt 6.12.0, qml6
// offscreen, gives the same three results).
test("a Connections hears a change made before its target is switched, from the old target", async ({ page }) => {
  await open(page, "connectiontarget");
  expect(await page.evaluate(() => window.scene.changeThenSwitch())).toEqual(["box"]);
});

test("a Connections switched to another target no longer hears the old one", async ({ page }) => {
  await open(page, "connectiontarget");
  await page.evaluate(() => window.scene.changeThenSwitch());
  expect(await page.evaluate(() => window.scene.switchThenChange())).toEqual([]);
});

test("a Connections hears a move that switches its target away, from the old target", async ({ page }) => {
  await open(page, "connectiontarget");
  expect(await page.evaluate(() => window.scene.changeSwitches())).toEqual([["box3"], "other3"]);
});

// A move of the target through the very property it is told the change of
// is not heard (Qt 6.12.0 gives the same): the binding of `target` is told
// of `widthChanged` first, as it asked for it first, and the Connections no
// longer listens to `r`. A property with a signal is told as it is emitted,
// so nothing of it is left to tell when the target is switched.
test("a Connections whose target moves away through the property it hears does not hear that change", async ({ page }) => {
  await open(page, "connectiontarget");
  expect(await page.evaluate(() => window.scene.widthSwitches())).toEqual([[], "wide"]);
});

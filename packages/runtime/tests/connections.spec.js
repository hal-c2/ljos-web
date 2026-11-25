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
// target: what `box` changed is told as its listener is let go (#144).
test("a Connections whose target the same change replaces through a binding hears it of the old target", async ({ page }) => {
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
// longer listens to `r`. A property with a signal is the signal's to tell:
// the switch settles nothing of it.
test("a Connections whose target moves away through the property it hears does not hear that change", async ({ page }) => {
  await open(page, "connectiontarget");
  expect(await page.evaluate(() => window.scene.widthSwitches())).toEqual([[], "wide"]);
});

// So is one whose target watched that property before the Connections did,
// with a handler of its own (Qt 6.12.0 gives the same): the handler on the
// target is told, the Connections is not.
test("a Connections does not hear a move through a property its target already watched", async ({ page }) => {
  await open(page, "connectiontarget");
  expect(await page.evaluate(() => window.scene.watchedWidthSwitches())).toEqual([[], "wide2", 1]);
});

// The same switches inside one flush: a state's changes, in the order they
// are written. Qt 6.12.0 (qml6 offscreen) hears each of these, from the
// object named: box, nothing, other, box.
for (const [name, heard, about] of [
  ["changeThenSwitch", ["heard"], "a change of the old target before the switch is heard"],
  ["switchThenChange", [], "a change of the old target after the switch is not heard"],
  ["switchThenChangeNew", ["heard"], "a change of the new target after the switch is heard"],
  ["bindThenChange", ["heard"], "a binding given to the target is not evaluated before the change"],
]) {
  test(`a Connections switched in a state's flush: ${about}`, async ({ page }) => {
    await open(page, "connectionflush");
    expect(await page.evaluate((name) => window.scene.entered(name), name)).toEqual(heard);
  });
}

// A target given by a binding of its own (`root.useOther ? other : box`):
// what it reads is written, then the old target changes. Qt 6.12.0 (qml6
// offscreen) hears nothing, in a state's flush and in a script: the binding
// was evaluated at the write, so the change is the new target's.
test("a Connections whose target binding is moved in a state's flush does not hear the old target changed after it", async ({ page }) => {
  await open(page, "connectionflush");
  expect(await page.evaluate(() => window.scene.followedAfter("rebindThenChange"))).toEqual([]);
});

test("a Connections whose target binding is moved in a state's flush hears the new target changed after it", async ({ page }) => {
  await open(page, "connectionflush");
  expect(await page.evaluate(() => window.scene.followedAfter("rebindThenChangeNew"))).toEqual(["heard"]);
});

// Qt 6.12.0 (qml6 offscreen) gives each of these.
test("a Connections with a signal handler whose target binding is moved in a state's flush does not hear the old target's signal after it", async ({ page }) => {
  await open(page, "connectionflush");
  expect(await page.evaluate(() => window.scene.heardAfter("rebindThenWiden", "signalled"))).toEqual([]);
});

test("a Connections with a signal handler whose target binding is moved in a state's flush hears the new target's signal after it", async ({ page }) => {
  await open(page, "connectionflush");
  expect(await page.evaluate(() => window.scene.heardAfter("rebindThenWidenNew", "signalled"))).toEqual(["heard"]);
});

test("a Connections whose target binding moves from none in a state's flush hears the new target changed after it", async ({ page }) => {
  await open(page, "connectionflush");
  expect(await page.evaluate(() => window.scene.heardAfter("rebindFromNullThenChange", "fromNull"))).toEqual(["heard"]);
});

test("a Connections whose target binding moves through none in a state's flush hears the new target changed after it", async ({ page }) => {
  await open(page, "connectionflush");
  expect(await page.evaluate(() => window.scene.heardAfter("rebindThroughNullThenChange", "throughNull"))).toEqual(["heard"]);
});

test("a Connections whose target binding reads a binding moved in a state's flush does not hear the old target changed after it", async ({ page }) => {
  await open(page, "connectionflush");
  expect(await page.evaluate(() => window.scene.heardAfter("rebindThenChange", "throughSelected"))).toEqual([]);
});

test("a Connections whose target binding reads a binding moved in a state's flush hears the new target changed after it", async ({ page }) => {
  await open(page, "connectionflush");
  expect(await page.evaluate(() => window.scene.heardAfter("rebindThenChangeNew", "throughSelected"))).toEqual(["heard"]);
});

test("a Connections whose target binding gives undefined in a state's flush keeps the target it had", async ({ page }) => {
  await open(page, "connectionflush");
  expect(await page.evaluate(() => window.scene.heardAfter("rebindThenChange", "keptOld"))).toEqual(["heard"]);
});

test("a Connections whose target binding reads only a list moved in a state's flush hears the new target changed after it", async ({ page }) => {
  await open(page, "connectionflush");
  expect(await page.evaluate(() => window.scene.heardAfter("nestThenChange", "nested"))).toEqual(["heard"]);
});

test("a Connections whose target binding gives undefined keeps the target it had once the flush is done", async ({ page }) => {
  await open(page, "connectionflush");
  expect(await page.evaluate(() => window.scene.refusedThenChange())).toEqual(["heard", "heard"]);
});

// The target's binding is asked again at every write: what it throws is
// told of as the binding's own, and the write that asked it is made.
test.describe(() => {
  // The binding's effect throws as any binding's does with no boundary to
  // take it (object.ts `guarded`), and Solid halts there: that is every
  // binding's rule, not this write's to keep.
  test.use({ told: [/no target|REACTIVITY_HALTED/] });
  test("a write after a Connections' target binding threw is made", async ({ page }) => {
    const said = [];
    page.on("pageerror", (error) => said.push(error.message));
    page.on("console", (message) => message.type() === "error" && said.push(message.text()));
    await open(page, "connectionflush");
    // Written, and what is bound to it reads it.
    expect(await page.evaluate(() => window.scene.breakThenWrite())).toEqual([5, 5]);
    // What the binding throws is told of, once, as its own.
    expect(said.filter((text) => /no target/.test(text))).toHaveLength(1);
  });
});

// What one asker of every write throws is told of, and the write is made
// and the askers after it are asked all the same.
test.describe(() => {
  test.use({ told: [/an asker broke/] });
  test("a write is made when one asker of every write throws", async ({ page }) => {
    await open(page, "connectionstir");
    expect(
      await page.evaluate(() => {
        const before = window.objects.asked();
        window.scene.unrelated = 7;
        return [window.scene.unrelated, window.scene.seen, window.objects.asked() > before];
      }),
    ).toEqual([7, 7, true]);
  });
});

test("a Connections whose target binding is moved in a script does not hear the old target changed after it", async ({ page }) => {
  await open(page, "connectionflush");
  expect(await page.evaluate(() => window.scene.rebindThenChange())).toEqual([]);
});

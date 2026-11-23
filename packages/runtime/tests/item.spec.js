import { expect, open, rect, test } from "./open.js";
import { pixels } from "./pixels.js";

// What `qml6` answers for the scene: x, y, width and height of each item.
test("the middle an item is centred on is a whole pixel", async ({ page }) => {
  await open(page, "centred");
  const read = await page.evaluate(() => {
    const first = window.scene.read();
    window.scene.step(0);
    return [first, window.scene.read()[0]];
  });
  expect(read).toEqual([
    [
      [166, 133, 67, 33],
      [166, 133, 67.5, 33.5],
      [41, 21, 20, 10],
      [41.5, 20, 21, 11],
      // `anchors.alignWhenCentered: false`: its own half is not rounded, its parent's is.
      [40.5, 20.5, 21, 11],
      [45, 38, 31, 15],
      [61, 46, 30, 14],
      [31, 32, 30, 14],
      [61, 46, 339, 254],
      [45, 38, 31, 15],
      [95, 63, 31, 15],
    ],
    [166.5, 133.5, 67, 33],
  ]);
});

test("anchors place an item against its parent and its siblings", async ({ page }) => {
  await open(page, "anchors");
  expect(await rect(page, "root")).toEqual({ x: 0, y: 0, width: 400, height: 300 });
  expect(await rect(page, "fill")).toEqual({ x: 30, y: 10, width: 360, height: 280 });
  expect(await rect(page, "centre")).toEqual({ x: 150, y: 125, width: 100, height: 50 });
  // `later` is declared after the item that anchors to it.
  expect(await rect(page, "after")).toEqual({ x: 80, y: 110, width: 40, height: 40 });
  expect(await rect(page, "between")).toEqual({ x: 80, y: 140, width: 315, height: 20 });
  expect(await rect(page, "half")).toEqual({ x: 0, y: 290, width: 200, height: 10 });
});

test("what is anchored follows what it is anchored to", async ({ page }) => {
  await open(page, "anchors");
  await page.evaluate(() => {
    const { root, later } = window.objects;
    root.width = 500;
    later.x = 100;
    later.height = 40;
  });
  expect(await rect(page, "fill")).toEqual({ x: 30, y: 10, width: 460, height: 280 });
  expect(await rect(page, "centre")).toEqual({ x: 200, y: 125, width: 100, height: 50 });
  expect(await rect(page, "after")).toEqual({ x: 160, y: 70, width: 40, height: 20 });
  expect(await rect(page, "between")).toEqual({ x: 160, y: 140, width: 335, height: 20 });
  expect(await rect(page, "half")).toEqual({ x: 0, y: 290, width: 250, height: 10 });
});

test("a property reads as what was just assigned, and so does what is bound to it", async ({ page }) => {
  await open(page, "anchors");
  const read = await page.evaluate(() => {
    const { root, half, fill } = window.objects;
    root.width = 320;
    return [root.width, half.width, fill.width, fill.parent === root, root.children.length];
  });
  expect(read).toEqual([320, 160, 280, true, 6]);
});

test("an assignment replaces the binding", async ({ page }) => {
  await open(page, "anchors");
  const read = await page.evaluate(() => {
    const { root, half } = window.objects;
    half.width = 30;
    root.width = 100;
    return half.width;
  });
  expect(read).toBe(30);
  expect((await rect(page, "half")).width).toBe(30);
});

test("a rectangle is painted with its colour, radius, border and gradient", async ({ page }) => {
  await open(page, "rectangle");
  const style = (id) =>
    page.evaluate((id) => {
      const { backgroundColor, backgroundImage, borderRadius, boxShadow, opacity, zIndex, display, overflow } = getComputedStyle(
        window.objects[id].$node,
      );
      return { backgroundColor, backgroundImage, borderRadius, boxShadow, opacity, zIndex, display, overflow };
    }, id);
  expect(await style("plain")).toEqual({
    backgroundColor: "rgb(255, 255, 255)",
    backgroundImage: "none",
    borderRadius: "0px",
    boxShadow: "none",
    opacity: "1",
    zIndex: "auto",
    display: "block",
    overflow: "visible",
  });
  expect(await style("round")).toMatchObject({
    // QML's `#AARRGGBB`.
    backgroundColor: "rgba(255, 0, 0, 0.5)",
    borderRadius: "8px",
    boxShadow: "rgb(0, 0, 128) 0px 0px 0px 3px inset",
    opacity: "0.5",
    zIndex: "2",
  });
  expect(await style("hidden")).toMatchObject({ display: "none" });
  expect(await style("turned")).toMatchObject({ overflow: "hidden" });
  expect((await style("shaded")).backgroundImage).toBe("linear-gradient(rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)");
  // The border is inside: the size is the item's.
  expect(await rect(page, "round")).toEqual({ x: 60, y: 0, width: 50, height: 40 });
});

test("an item inside a hidden one is not visible", async ({ page }) => {
  await open(page, "rectangle");
  expect(await page.evaluate(() => [window.objects.inside.visible, window.objects.hidden.visible])).toEqual([false, false]);
  await page.evaluate(() => (window.objects.hidden.visible = true));
  expect(await page.evaluate(() => window.objects.inside.visible)).toBe(true);
});

test("rotation turns about the transform origin, a Rotation about its own", async ({ page }) => {
  await open(page, "rectangle");
  // 100x20 at (200, 100), a quarter turn about its centre (250, 110).
  expect(await rect(page, "turned")).toEqual({ x: 240, y: 60, width: 20, height: 100 });
  // 40x40 at (100, 200), a quarter turn about its top left corner.
  expect(await rect(page, "spun")).toEqual({ x: 60, y: 200, width: 40, height: 40 });
  await page.evaluate(() => (window.objects.spun.transform.angle = 180));
  expect(await rect(page, "spun")).toEqual({ x: 60, y: 160, width: 40, height: 40 });
});

test("declared properties, signals and change handlers", async ({ page }) => {
  await open(page, "properties");
  // A binding's first value is a change of what the property had.
  expect(await page.evaluate(() => window.objects.log)).toEqual(["width 40", "completed 40"]);
  expect((await rect(page, "follower")).width).toBe(40);
  const read = await page.evaluate(() => {
    const { root, follower } = window.objects;
    root.count = 5;
    const first = [root.doubled, follower.width];
    root.poked(3);
    return first;
  });
  expect(read).toEqual([10, 100]);
  expect(await page.evaluate(() => window.objects.log)).toEqual(["width 40", "completed 40", "width 100", "poked 3"]);
  expect((await rect(page, "follower")).width).toBe(100);
});

// What Qt 6.11 answers for the same scene, as it is and after each step.
test("an item or a node given another parent is among that one's children and placed in it", async ({ page }) => {
  await open(page, "reparent");
  const answers = () => page.evaluate(() => JSON.parse(JSON.stringify(window.scene.answers())));
  expect(await answers()).toEqual([["bound"], ["moved"], ["a", 15, 25], ["b", 230, 80], ["child"], [], "one", [100, 7, 0]]);
  const after = [
    [["bound", "moved"], [], ["a", 15, 25], ["a", 40, 50], ["child"], [], "one", [100, 7, 0]],
    [["moved"], ["bound"], ["b", 205, 55], ["a", 40, 50], ["child"], [], "one", [100, 7, 0]],
    [["moved"], ["bound"], ["b", 205, 55], ["a", 40, 50], [], ["child"], "two", [-57, 0, 0]],
    [[], ["bound"], ["b", 205, 55], [null, 30, 30], [], ["child"], "two", [-57, 0, 0]],
  ];
  for (const [index, expected] of after.entries()) {
    await page.evaluate((index) => window.scene.step(index), index);
    expect(await answers()).toEqual(expected);
  }
});

// Moving an element takes the browser's focus from it; the item keeps
// Qt's, so the reader's keys must go on reaching the field, at the caret.
test("a field moved to another parent while typed in keeps the keys and the caret", async ({ page }) => {
  await open(page, "reparentfocus");
  await page.click("input, textarea");
  await page.keyboard.type("ab");
  await page.keyboard.press("ArrowLeft");
  const state = () =>
    page.evaluate(() => {
      const { input, box } = window.scene;
      return [input.text, input.activeFocus, document.activeElement === input.$input, box.mapToItem(window.scene, 0, 0).y];
    });
  for (const [below, key, text, y] of [
    [true, "X", "aXb", 150],
    [false, "Y", "aXYb", 0],
  ]) {
    await page.evaluate((below) => (window.scene.below = below), below);
    await page.keyboard.type(key);
    expect(await state()).toEqual([text, true, true, y]);
  }
});

// What Qt 6.11 answers for the same scene, as it is and after each step: a
// Repeater is a child too, of no size and at the origin.
test("childrenRect is the rectangle an item's children take together", async ({ page }) => {
  await open(page, "childrenrect");
  const answers = () => page.evaluate(() => JSON.parse(JSON.stringify(window.scene.answers())));
  const fitted = [[0, 0, 25.984375, 14], 25.984375, 14];
  expect(await answers()).toEqual([[0, 0, 0, 0], [-5, 0, 90, 110], [0, 0, 44, 50], 50, ...fitted]);
  const after = [
    [[0, 0, 0, 0], [-5, 0, 90, 110], [0, 0, 44, 30], 30, ...fitted],
    [[0, 0, 0, 0], [0, 0, 110, 110], [0, 0, 44, 30], 30, ...fitted],
    [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 44, 30], 30, ...fitted],
  ];
  for (const [index, expected] of after.entries()) {
    await page.evaluate((index) => window.scene.step(index), index);
    expect(await answers()).toEqual(expected);
  }
});

// Qt 6.11: an item's `data` is its resources, then its children, and an
// item made into it later is among its children and its data.
test("an item's resources are the objects in it that are not items, its data all of them", async ({ page }) => {
  await open(page, "resources");
  expect(await page.evaluate(() => window.scene.read())).toEqual([
    ["a", "t"],
    ["a", "t", "i", "r"],
    ["i", "r"],
  ]);
  await page.evaluate(() => window.scene.add());
  expect(await page.evaluate(() => window.scene.read())).toEqual([
    ["a", "t"],
    ["a", "t", "i", "r", "drawn"],
    ["i", "r", "drawn"],
  ]);
});

// Qt 6.11: `resources: [...]` and `data: [...]` add to what is declared
// in the item, in the same two lists, and make each object once.
test("an item's resources and data given as lists are among its resources and data", async ({ page }) => {
  await open(page, "resourceslists");
  const [resources, data, children, made] = await page.evaluate(() => window.scene.read());
  expect(resources.sort()).toEqual(["q", "t"]);
  expect(data.sort()).toEqual(["d", "i", "q", "t"]);
  expect(children.sort()).toEqual(["d", "i"]);
  expect(made).toBe(4);
});

// Qt 6.11: a list a component and its instance both give holds what each
// does, and `resources` holds an object without drawing it.
// An item the holder also declares is still its child, once.
test("a component's resources and its instance's are both held, and a held item stays drawn where it was", async ({ page }) => {
  await open(page, "resourcesheld");
  expect(await page.evaluate(() => window.scene.read())).toEqual([["a", "b"], 2, true, ["shared"], [], ["", "shared", "other", "both", "kept"], ["inner"], ["inner"], true]);
});

// Qt 6.11 (qml6): an item made inline in a `resources` list is held, not
// drawn: it has no parent, a binding to its parent reads none, and it is
// a child of neither its holder nor what the holder is in.
test("an item made inline in another's resources has no parent", async ({ page }) => {
  await open(page, "resourcesinline");
  expect(await page.evaluate(() => window.scene.read())).toEqual(["none", "none", ["inline", "plain"], [], ["other"], ["outer"]]);
});

// The held marker is the list's own entries': what reading the list makes
// in another object's work (here an item property's item, made the first
// time it is read) is made as it would be read anywhere else.
test("an item property's item that a resources read makes first has the parent it has when read elsewhere", async ({ page }) => {
  await open(page, "resourcesreads");
  const [first, second] = await page.evaluate(() => window.scene.read());
  expect(first).toBe(second);
});

// A declared property's item is the property's, and in no visual list: Qt
// gives it no parent until something puts it in one.
test("an item made inline as a declared property's value has no parent until it is put in a visual list", async ({ page }) => {
  await open(page, "propertyitemparent");
  expect(await page.evaluate(() => window.scene.read())).toEqual([false, false, null, 1, null]);
  expect(await page.evaluate(() => window.scene.put())).toEqual([true, 1]);
});

// What an instance gives an alias of such a property is that property's
// too, and parentless: the alias's name is not what decides it.
test("an item given through an alias of a declared property has no parent", async ({ page }) => {
  await open(page, "propertyitemparent");
  expect(await page.evaluate(() => window.scene.throughAlias())).toEqual(["madeThrough", null, 0]);
});

// What an instance gives a property its component's root declares is
// that property's: the declaration and the value come from two files.
test("an item an instance gives a property its component declares has no parent", async ({ page }) => {
  await open(page, "propertyitemparent");
  expect(await page.evaluate(() => window.scene.cardHeader())).toEqual(["cardHeader", null, 0]);
});

// Made in no visual parent, the item still answers to its owner's error
// boundary (a ShellLoader's), not to the page.
test("an item made as a declared property's value has its owner's error boundary", async ({ page }) => {
  await open(page, "propertyitemparent");
  const answer = await page.evaluate(() => {
    const boundary = () => {};
    Object.defineProperty(window.scene.boundingItem(), "$fault", { value: boundary, configurable: true });
    return window.scene.ownLater();
  });
  expect(answer).toEqual([true, true, null]);
});

// An alias of an alias is assigned once all is made: what it is given is
// still the declared property's, parentless, under its owner's boundary.
test("an item given through an alias of an alias of a declared property has no parent and its owner's error boundary", async ({ page }) => {
  await open(page, "propertyitemparent");
  expect(await page.evaluate(() => window.scene.throughChain())).toEqual(["madeChain", null, 0]);
  const answer = await page.evaluate(() => {
    const boundary = () => {};
    Object.defineProperty(window.scene.boundingItem(), "$fault", { value: boundary, configurable: true });
    return window.scene.chainLater();
  });
  expect(answer).toEqual(["madeChainLater", true, null]);
});

test("what is destroyed is gone from the resources that held it", async ({ page }) => {
  await open(page, "resourcesheld");
  await page.evaluate(() => window.scene.drop());
  await expect.poll(() => page.evaluate(() => window.scene.dropped())).toEqual([["b"], [], ["held 1", "other 0"]]);
});

test("what an instance declares inside a component whose default property is named data is in that list only", async ({ page }) => {
  await open(page, "defaultlist");
  expect(await page.evaluate(() => window.scene.read())).toEqual([["given"], [], ["own"]]);
});

// A holder that is destroyed lets go of what it held: what outlives it
// does not keep it.
test("a destroyed holder is no longer held by what it held", async ({ page }) => {
  await open(page, "resourcesheld");
  const object = await page.evaluateHandle(async () => {
    const address = performance.getEntriesByType("resource").find(({ name }) => /\/object\.ts(\?|$)/.test(name)).name;
    return await import(address);
  });
  await page.evaluate(() => window.scene.holdAndLet(4));
  await expect.poll(() => page.evaluate((object) => object.holdersOf(window.scene.keptOne()), object)).toBe(0);
});

test("a child of negative z is under what its parent draws", async ({ page }) => {
  await open(page, "belowparent");
  expect(await pixels(page, [[15, 15], [50, 50], [70, 70]])).toEqual(["255 0 0", "0 255 0", "0 0 255"]);
});

// What the compiler makes of a QML file, on the runtime it is made for.
import { test as plain } from "@playwright/test";
import { expect, open, rect, test } from "./open.js";

test("an instance sets what its component declares", async ({ page }) => {
  await open(page, "components");
  const read = await page.evaluate(() => {
    const { first, second } = window.objects;
    return [first.title, first.padding, first.width, second.title, second.padding, second.width, second.x];
  });
  expect(read).toEqual(["first", 20, 200, "untitled", 10, 100, 200]);
  expect(await rect(page, "first")).toEqual({ x: 0, y: 0, width: 200, height: 80 });
  expect(await rect(page, "second")).toEqual({ x: 200, y: 0, width: 100, height: 80 });
});

test("what is written in an instance goes where the default alias says", async ({ page }) => {
  await open(page, "components");
  const read = await page.evaluate(() => {
    const { first, inner } = window.objects;
    return [inner.parent === first.body, first.children.length, first.body.children.length];
  });
  expect(read).toEqual([true, 1, 1]);
  // The body is the panel less its padding, and `parent` is the body.
  expect(await rect(page, "inner")).toEqual({ x: 20, y: 20, width: 10, height: 20 });
});

test("an alias is the property it names", async ({ page }) => {
  await open(page, "components");
  const colour = () => page.evaluate(() => getComputedStyle(window.objects.first.body.$node).backgroundColor);
  expect(await colour()).toBe("rgb(255, 0, 0)");
  await page.evaluate(() => {
    window.objects.first.bodyColor = "green";
  });
  expect(await colour()).toBe("rgb(0, 128, 0)");
  expect(await page.evaluate(() => String(window.objects.first.bodyColor) === String(window.objects.first.body.color))).toBe(true);
});

test("a function is the object's, and what it emits reaches the instance's handler", async ({ page }) => {
  await open(page, "components");
  const read = await page.evaluate(() => {
    const { scene, objects } = window;
    const { first, second } = objects;
    first.grow(15);
    return [first.width, scene.grown, second.x];
  });
  expect(read).toEqual([215, 215, 215]);
  expect(await rect(page, "second")).toEqual({ x: 215, y: 0, width: 100, height: 80 });
});

test("a signal runs the component's handler and the instance's", async ({ page }) => {
  await open(page, "components");
  const read = await page.evaluate(() => {
    const { scene, objects } = window;
    const { second } = objects;
    const before = second.notified;
    second.width = 60;
    window.flush();
    return [second.notified - before, scene.narrowed];
  });
  expect(read).toEqual([1, 60]);
});

test("a singleton is one object, and whoever names it reads the same one", async ({ page }) => {
  await open(page, "singletons");
  expect(await rect(page, "first")).toEqual({ x: 0, y: 0, width: 40, height: 10 });
  expect(await rect(page, "second")).toEqual({ x: 40, y: 0, width: 10, height: 20 });
  // What is assigned to it reaches every binding that reads it, its own too.
  await page.evaluate(() => {
    window.scene.theme.grid = 25;
    window.flush();
  });
  expect(await rect(page, "first")).toEqual({ x: 0, y: 0, width: 100, height: 25 });
  expect(await rect(page, "second")).toEqual({ x: 100, y: 0, width: 25, height: 50 });
});

test("an enum is keys of the type that declares it", async ({ page }) => {
  await open(page, "singletons");
  const read = await page.evaluate(() => {
    const { scene } = window;
    const before = scene.second.width;
    scene.mode = 0;
    window.flush();
    return [scene.plain, scene.raised, before, scene.second.width];
  });
  expect(read).toEqual([0, 2, 10, 20]);
});

test("a singleton's name has the keys of the type of its root", async ({ page }) => {
  await open(page, "singletonkeys");
  const read = await page.evaluate(() => {
    const { scene } = window;
    const seen = [scene.read()];
    for (let i = 0; i < 4; i++) {
      scene.step(i);
      window.flush();
      seen.push(scene.read().slice(0, 2));
    }
    return seen;
  });
  // Qt 6.11. November 2024, then past December into the next year and back,
  // as the calendar of Qt's Thermostat steps with `Calendar.December`.
  expect(read).toEqual([
    [2024, 10, 11, 2, 0, true, 7, 7, 1970],
    [2024, 11],
    [2025, 0],
    [2024, 11],
    [2024, 10],
  ]);
});

test("a name a component does not have is found in whatever made it", async ({ page }) => {
  await open(page, "scopes");
  expect(await rect(page, "dot")).toEqual({ x: 0, y: 0, width: 200, height: 8 });
  expect(await rect(page, "chip")).toEqual({ x: 0, y: 100, width: 100, height: 10 });
  // It is the object and the property themselves: what changes them is seen.
  await page.evaluate(() => {
    window.scene.width = 200;
    window.scene.__cell = 12;
    window.flush();
  });
  expect(await rect(page, "dot")).toEqual({ x: 0, y: 0, width: 100, height: 12 });
  expect(await rect(page, "chip")).toEqual({ x: 0, y: 100, width: 50, height: 10 });
});

// Qt 6.11's: a binding's `this` is its object (and its target, in what a
// state changes), a handler's the object it is written on.
test("this is the object a binding or a handler is written on", async ({ page }) => {
  await open(page, "thisobject");
  expect(await page.evaluate(() => JSON.parse(JSON.stringify(window.scene.read())))).toEqual([
    4,
    20,
    [11, 12],
    "nundefined:true",
    "nundefined:true",
    14,
    9,
    "#ff0000",
    10,
    [
      ["completed", true, 7],
      ["handler", true, 7, 21],
    ],
  ]);
});

// What Qt 6.11 says of `scenes/faults.qml`.
plain("a binding that cannot be evaluated leaves the property what it was, and says so", async ({ page }) => {
  const warnings = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
    if (message.type() === "error") errors.push(message.text());
  });
  await open(page, "faults");
  // A state is entered once what changed has settled, so each step is read
  // after it.
  const found = [];
  for (let step = 0; step < 4; step++) {
    await page.evaluate((step) => window.scene.step(step), step);
    found.push(await page.evaluate(() => window.scene.read()));
  }
  expect(found).toEqual([
    [false, 0, "", 0, true, ""],
    [true, 3, "xn", 7, false, "on"],
    [true, 3, "xn", 7, false, "on"],
    [false, 4, "xm", 8, true, ""],
  ]);
  expect(errors).toEqual([]);
  expect(warnings.length).toBeGreaterThan(0);
  for (const warning of warnings) expect(warning).toMatch(/^(on|n|label|width|visible|when): TypeError: /);
});

test("an enum's keys are on a type of the project and on a type of a namespace", async ({ page }) => {
  await open(page, "enumkeys");
  const read = await page.evaluate(() => window.scene.read());
  // Qt 6.11.
  expect(read).toEqual([
    // `Swatch.Mid`, `Swatch.Shade.Mid`, `Swatch.Deep`, and what it gives itself.
    1, 1, 9, 1, 9,
    // `Chart`, a `Swatch`: its keys, its own, and what an object is given.
    1, 9, 21, 21, 9, 21, 1,
    // The keys of `Text`, which both are.
    1, 1, 1, 1,
    // `T.Calendar.March`, `T.Calendar.Month.March`, and in a binding.
    2, 2, 2, 3,
    // `T.Label.ElideRight`, `T.Label.TextElideMode.ElideRight`, and given.
    1, 1, 2, 1,
    // No key at all is undefined.
    true, true,
  ]);
});

test("a type of a module, by their names, is a component of it", async ({ page }) => {
  await open(page, "created");
  // Qt 6.11.
  expect(await page.evaluate(() => window.scene.ofType())).toEqual([true, 30, true, "#ff0000"]);
});

test("a text of QML is the object it writes, a child of the one it is given", async ({ page }) => {
  await open(page, "created");
  // Qt 6.11: the second text was put together of what `shade` was.
  expect(await page.evaluate(() => window.scene.ofText())).toEqual([30, 60, true, "#ff0000", "it is blue", "#0000ff", true]);
});

test("a text of QML sees the ids, the properties and the types the file giving it sees", async ({ page }) => {
  await open(page, "created");
  // Qt 6.11: what the text names follows it, what it was put together of
  // does not.
  expect(await page.evaluate(() => window.scene.ofContext())).toEqual(["#008000", 7, 5, "it is blue", "tile", true]);
});

// This warns, as Qt does, which the scenes' `test` takes for a failure.
plain("a type a module has not is a component in error", async ({ page }) => {
  const warnings = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });
  await open(page, "created");
  // Qt 6.11.
  expect(await page.evaluate(() => window.scene.unknown())).toEqual([
    true,
    '<Unknown File>: Module "QtQuick" contains no type named "Nothing"\n',
    null,
  ]);
  expect(warnings).toEqual(['QQmlComponent: Component is not ready: <Unknown File>: Module "QtQuick" contains no type named "Nothing"']);
});

test("what createObject gives an object, it has before it is complete", async ({ page }) => {
  await open(page, "given");
  // Qt 6.11: the Behavior starts from where the object was put, and what
  // the object does on completion finds what it was given.
  expect(await page.evaluate(() => window.scene.make())).toEqual([-40, -40, 3, 40]);
  await expect.poll(() => page.evaluate(() => window.scene.where())).toBe(80);
});

// This throws, as Qt warns, which the scenes' `test` takes for a failure.
plain("what a handler throws is told of, and whoever emitted the signal goes on", async ({ page }) => {
  const thrown = [];
  page.on("pageerror", (error) => thrown.push(error.message));
  await open(page, "thrown");
  // Qt 6.11: the function connected to the signal hears of it, and the
  // function that emitted it does what comes after.
  expect(await page.evaluate(() => window.scene.poke())).toEqual([1, 2]);
  expect(thrown).toEqual([
    "Cannot read properties of null (reading 'gone')",
    "Cannot read properties of null (reading 'here')",
    "Cannot read properties of null (reading 'there')",
  ]);
});

test("a property a file declares again is the file's, and the item is drawn by its own", async ({ page }) => {
  await open(page, "shadowed");
  const read = () =>
    page.evaluate(() => {
      const { page, bar, scaled } = window.objects;
      return [page.scale, page.rotation, bar.width, page.$node.style.transform, scaled.$node.style.transform.includes("scale(2)")];
    });
  expect(await read()).toEqual([16667, 45, 16.667, "translate(0px, 0px)", true]);
  // Written by name, as a function of the file writes it: still the file's.
  await page.evaluate(() => window.objects.page.grow(20000));
  expect(await read()).toEqual([20000, 45, 20, "translate(0px, 0px)", true]);
  expect(await rect(page, "page")).toEqual({ x: 0, y: 0, width: 200, height: 50 });
});

test("an item in one whose file declares its own visible and opacity is shown, hit and mapped by the native ones", async ({ page }) => {
  await page.goto("/?scene=shadowed&inspect");
  await page.waitForFunction(() => window.ready);
  expect(await page.evaluate(() => [window.objects.panel.visible, window.objects.panel.opacity, window.objects.inner.visible])).toEqual([false, 0, true]);
  expect(await rect(page, "inner")).toEqual({ x: 0, y: 60, width: 100, height: 40 });
  // What is drawn at a point is picked, by the native visible and opacity.
  expect(await page.evaluate(() => window.inspector.pick(50, 80)?.object.objectName)).toBe("inner");
  // A point of a file's `scale` item is mapped by the item's own scale, 1.
  expect(await page.evaluate(() => {
    const { page, $root } = window.objects;
    const at = window.objects.page.mapToItem(null, 10, 10);
    void page;
    void $root;
    return [at.x, at.y];
  })).toEqual([10, 10]);
});

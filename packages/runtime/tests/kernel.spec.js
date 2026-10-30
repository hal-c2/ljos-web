import { test as plain } from "@playwright/test";
import { expect, open, test } from "./open.js";

// The steps are the ones Qt was taken through with the same scene, and the
// answers the ones it gave.
test("an object's properties and signals tell what Qt's do, when they do", async ({ page }) => {
  await open(page, "kernel");
  const read = await page.evaluate(() => {
    const { scene } = window;
    const seen = [scene.read()];
    for (let step = 0; step <= 12; step++) {
      scene.step(step);
      seen.push(scene.read());
    }
    // What two properties were given where the object was made, Qt tells of
    // last first: an order nothing is to lean on.
    const [made] = seen[0];
    seen[0][0] = [...made.slice(0, 2).sort(), ...made.slice(2)];
    return seen;
  });
  const rest = (a, b, c, word) => [a, b, c, word, "held", a, 3, "two"];
  expect(read).toEqual([
    // A literal next to its handler is where the property starts; one given
    // where the object is made, and what a binding first gives, are changes.
    [["given n 2", "given s two", "bound n 5", "bound s x"], ...rest(5, 6, 0, "x")],
    // A handler that assigns finds what depends on it up to date.
    [["bound n 7", "b 8"], ...rest(7, 8, 1, "x")],
    [["word y", "bound s y"], ...rest(7, 8, 1, "y")],
    // A change signal is one to emit and to connect to.
    [["word y"], ...rest(7, 8, 1, "y")],
    [["done 3", "wired 3"], ...rest(7, 8, 1, "y")],
    [["done 4", "wired 4", "heard 4"], ...rest(7, 8, 1, "y")],
    [["done 5", "wired 5"], ...rest(7, 8, 1, "y")],
    [["lone 4", "heard lone 4", "word z", "bound s z"], ...rest(7, 8, 1, "z")],
    [["lone 5", "word w", "bound s w"], ...rest(7, 8, 1, "w")],
    [["given n 3", "given s three"], ...rest(7, 8, 1, "w")],
    // A directory keeps the slash it ends with.
    [["/data/"], ...rest(7, 8, 1, "w")],
    // An element of a ListModel has its roles to list.
    [["n,name a1"], ...rest(7, 8, 1, "w")],
    [["1,b"], ...rest(7, 8, 1, "w")],
    [["given n 9", "given heard 9"], ...rest(7, 8, 1, "w")],
  ]);
});

test("a binding that comes back to its own property ends there", async ({ page }) => {
  await open(page, "bindingloop");
  // Qt's answers; where a loop of two ends is not for a program to lean on.
  expect(await page.evaluate(() => window.scene.read())).toEqual([20, 20, true, true, 5]);
});

test("a property bound again to what depends on it goes round once", async ({ page }) => {
  await open(page, "lateloop");
  const read = await page.evaluate(() => {
    const { scene } = window;
    const seen = [scene.read()];
    for (let step = 0; step < 3; step++) {
      scene.step(step);
      seen.push(scene.read());
    }
    return seen;
  });
  // Qt's answers: what changed first is left as it was when it changed.
  expect(read).toEqual([
    [[0, false, 484, 484], [1, true, 364, 364], [1, true, 364, 364], [4, 8]],
    [[0, false, 484, 484], [1, true, 364, 364], [1, true, 364, 600], [8, 16]],
    [[0, false, 484, 500], [1, true, 364, 500], [0, false, 484, 380], [61, 122]],
    [[0, false, 484, 484], [1, true, 364, 364], [1, true, 364, 484], [123, 246]],
  ]);
});

test("a picture as wide as its own height says is loaded once more, and no more", async ({ page }) => {
  await open(page, "imageloop");
  await page.waitForFunction(() => window.scene.ready);
  // Qt's answers.
  expect(await page.evaluate(() => window.scene.read())).toEqual([
    [90, 60, 90, 60, 90, 60],
    [30, 20, 30, 20, 30, 20],
    [60, 40, 60, 0, 60, 40],
    [60, 20, 60, 20, 60, 20],
  ]);
});

test("what is said of the object a property holds is that object's", async ({ page }) => {
  await open(page, "through");
  const read = await page.evaluate(() => {
    const scene = window.scene;
    const out = [scene.read()];
    for (let index = 0; index < 5; index++) {
      scene.step(index);
      out.push(scene.read());
    }
    return out;
  });
  // Qt's answers.
  expect(read).toEqual([
    ["wide", "#ff0000", 2, 10, 30, ""],
    ["wide", "#ff0000", 2, 10, 30, "back 2"],
    ["narrow", "#0000ff", 1, 10, 30, "back 2"],
    ["narrow", "#0000ff", 5, 4, 60, "back 2,width 4"],
    ["wide", "#ff0000", 5, 4, 80, "back 2,width 4"],
    ["wide", "#ff0000", 2, 10, 30, "back 2,width 4,width 10"],
  ]);
});

plain("a binding that cannot be evaluated is told of, unless what it met is not made yet", async ({ page }) => {
  const warnings = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });
  await open(page, "early");
  const read = await page.evaluate(() => {
    const { scene } = window;
    const seen = [scene.read()];
    for (let step = 0; step < 2; step++) {
      scene.step(step);
      seen.push(scene.read());
    }
    return seen;
  });
  // Qt's answers. An item may be beside one that is below it; what an alias
  // was given stays what it was when it cannot be evaluated again.
  expect(read).toEqual([
    [300, "", 32, 10, 7, 43],
    [300, "first", 32, 10, 7, 43],
    [300, "first", 32, 10, 7, 43],
  ]);
  // And Qt's complaints: none of `wide`, which asked an object made after it.
  expect(new Set(warnings)).toEqual(new Set(["title: TypeError: Cannot read properties of null (reading 'title')"]));
  expect(warnings.length).toBeGreaterThanOrEqual(2);
});

plain("a binding that cannot be evaluated while objects are made is told of when they are, if it still cannot", async ({ page }) => {
  const warnings = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });
  const told = (name) => `${name}: TypeError: Cannot read properties of null (reading 'title')`;
  await open(page, "mended");
  const read = () => page.evaluate(() => JSON.parse(JSON.stringify(window.scene.read())));
  // Qt's answers and complaints: nothing of what `Component.onCompleted` or
  // the stack's first item made whole, though they came after the binding
  // was first asked.
  expect(await read()).toEqual(["first", "", "first", "page"]);
  expect(warnings).toEqual([told("broken")]);
  // From then on, of each as it happens.
  await page.evaluate(() => window.scene.step(0));
  expect(await read()).toEqual(["first", "", "first", "page"]);
  expect(warnings.toSorted()).toEqual([told("broken"), told("mended"), told("title")]);
  await page.evaluate(() => window.scene.step(1));
  expect(await read()).toEqual(["second", "", "second", "page"]);
  expect(warnings).toHaveLength(3);
});

test("what an object is made with is not a change, unless it was a binding", async ({ page }) => {
  await open(page, "told");
  // Qt's answers: a number, a text and the key of an enum are what the object
  // is made with. (Qt tells of the bindings last made first; that order is
  // not kept here.)
  expect((await page.evaluate(() => window.scene.seen)).sort()).toEqual(["availability 1", "bound 2", "height 200"]);
});

test("what a type of a namespace attaches is asked of the object in a script", async ({ page }) => {
  await open(page, "attachedname");
  // Qt 6.11: the bar the Flickable was given, from itself and from an object
  // inside it, a quarter of the content in view, and no bar across.
  expect(await page.evaluate(() => window.scene.read())).toEqual([true, "bar", true, true, 0.25, null]);
});

test("Component.onCompleted is told of the object made last first, when all have made of each other what they make", async ({ page }) => {
  await open(page, "completion");
  // Qt 6.11: what a Loader loaded and the rows of a Repeater are complete
  // before those they are in, whose root then sees the rows laid out.
  expect(await page.evaluate(() => window.scene.answers())).toEqual([
    "loaded",
    "q inner",
    "q child",
    "row 0",
    "row child 0",
    "row 1",
    "row child 1",
    "root 2,30,24,4,true",
    "b",
    "b1",
    "loader",
    "repeater",
    "p inner",
    "p outer",
    "p child",
    "a",
    "a2",
    "a1",
  ]);
});

test("what reads a property is not asked again for what else becomes of the object", async ({ page }) => {
  await open(page, "followed");
  const said = await page.evaluate(() => [window.scene.said(), ...[0, 1, 2, 3, 4].map((index) => window.scene.step(index))]);
  expect(said).toEqual([
    [["fixed", "name"], 3, "page", 0],
    [[], 3, "page", 1],
    [[], 3, "page", 1],
    [["fixed"], 4, "page", 1],
    [[], 4, "page", 1],
    [["name"], 4, "leaf", 1],
  ]);
});

// Qt 6.11's answers. A size worked out from a picture that has yet to load
// is such a number, and an item placed by it must still be somewhere.
test("an item given NaN for where it is or how big stays as it was", async ({ page }) => {
  await open(page, "nanplace");
  expect(await page.evaluate(() => window.scene.read())).toEqual([
    [0, 0, 0, 0, 1, 0, 30, 40],
    [0, 0, 0, 0, 1, 5, 30, 40],
    [3, 2, 20, 30, 1, 5, 30, 40],
    [3, 2, 20, 30, 1, 5, 30, 40],
    [3, 2, 20, 30, 7, 5, 44, 40],
  ]);
  expect(await page.evaluate(() => window.scene.bound.$node.style.transform)).toBe("translate(3px, 2px)");
});

// samegame shows its "New Game" button by `opacity: over && (arcade || two)`:
// a yes-or-no for a number.
test("an item's own properties make what they are given the number or the yes-or-no they are", async ({ page }) => {
  await open(page, "itemkinds");
  const made = await page.evaluate(() => {
    const { scene } = window;
    return [false, true, 0, 3, 0.5, "0.5", "", "abc", null, NaN, -2].map((value) => {
      scene.given = value;
      return JSON.stringify([scene.read(scene.bound), scene.assigned(value)]);
    });
  });
  const no = [0, 0, 0, 0, false, false, false];
  const yes = [1, 1, 1, 1, true, true, true];
  const half = [0.5, 0.5, 0.5, 0.5, true, true, true];
  // No more than all of an opacity, and no less than none of it.
  const three = [1, 3, 3, 3, true, true, true];
  const less = [0, -2, -2, -2, true, true, true];
  const none = [null, null, null, null, true, true, true];
  const nan = [null, null, null, null, false, false, false];
  expect(made).toEqual([no, yes, no, three, half, half, no, none, no, nan, less].map((row) => JSON.stringify([row, row])));
  // Nothing is not theirs to be given.
  const double = "Cannot assign [undefined] to double";
  const bool = "Cannot assign [undefined] to bool";
  expect(await page.evaluate(() => window.scene.assigned(undefined))).toEqual([double, double, double, double, bool, bool, bool]);
  expect(await page.evaluate(() => window.scene.read(window.scene.plain))).toEqual(less);
  // And an item is drawn as what it is.
  await page.evaluate(() => (window.scene.given = false));
  expect(await page.evaluate(() => window.scene.bound.$node.style.opacity)).toBe("0");
});

test("a node's number handed out again is not followed through what held it before", async ({ page }) => {
  await open(page, "kernelreuse");
  const reuse = await page.evaluate(() => window.objects.reuse());
  test.skip(reuse === null, "only the wasm kernel numbers its nodes");
  // The number is the old node's, the handle is not; the reader is told of
  // the new node's change, and not of a touch through the old handle.
  expect(reuse).toEqual({ reused: true, distinct: true, seen: [1, 2, 2] });
});

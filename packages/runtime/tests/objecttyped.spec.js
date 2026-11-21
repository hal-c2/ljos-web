// A property typed with an object type takes an object of that type, or of
// one made from it, or null, and refuses anything else: an assignment
// throws, and a binding is told of and leaves the property as it was. The
// answers are Qt's own, from the same scene run by `qml6`.
import { expect, open, test } from "./open.js";

// Qt 6.11: a refusal names the type by its C++ class (`QQuickRectangle`),
// and a component's by a name it makes up (`ANON_QML_IC_Tile_0`). Ljós's
// compiler knows neither, and names each as it is written in QML.
const WRITTEN = { QQuickRectangle: "Rectangle", QQuickItem: "Item", ANON_QML_IC_Tile_0: "Tile" };
const QT = [
  "declared null null rect",
  "rect ok rect",
  "plain Cannot assign QObject* to QQuickRectangle* rect",
  "item Cannot assign QObject* to QQuickRectangle* rect",
  "tile ok made",
  "null ok null",
  "undefined Cannot assign [undefined] to QQuickRectangle* null",
  "number Cannot assign int to QQuickRectangle* null",
  "record Cannot assign QJSValue to QQuickRectangle* null",
  "any rect ok rect",
  "any timer Cannot assign QObject* to QQuickItem* rect",
  "loose timer ok timer",
  "loose rect ok rect",
  "tile made ok made",
  "tile rect Cannot assign QObject* to ANON_QML_IC_Tile_0* made",
  "alias plain Cannot assign QObject* to QQuickRectangle* null",
  "alias rect ok rect",
  "bound rect",
].map((line) => line.replace(/QQuickRectangle|QQuickItem|ANON_QML_IC_Tile_0/g, (name) => WRITTEN[name]));

// Qt 6.11 says `Unable to assign QObject to QQuickRectangle`.
const BOUND = /Unable to assign QObject to Rectangle$/;
// Qt 6.11 says `Unable to assign [undefined] to QQuickRectangle*`.
const UNDEFINED = /Unable to assign \[undefined\] to Rectangle\*$/;
const INITIAL = /Could not set initial property (thing|n)$/;
// Qt 6.11 says `Unable to assign QString to int`.
const TEXT = /level: Unable to assign QString to int$/;
test.use({ told: [[BOUND, UNDEFINED, INITIAL, TEXT], { option: true }] });

test("a property typed with an object type refuses an object of another type", async ({ page }) => {
  const warned = [];
  page.on("console", (message) => BOUND.test(message.text()) && warned.push(message.text()));
  await open(page, "objecttyped");
  expect(await page.evaluate(() => window.scene.run())).toEqual(QT);
  // `direct: plain` as it is made, and `chosen` once `k` makes it `plain`.
  expect(warned).toHaveLength(2);
});

// An object named before it is made is taken once it is; a binding given in
// place of an object keeps it when it is refused; an object made with a
// value it refuses, of any type, is not made, as `createObject` fails in qml6; a binding
// that becomes undefined leaves the object it had.
test("a property typed with an object type keeps what it had when refused", async ({ page }) => {
  const warned = [];
  page.on("console", (message) => [BOUND, UNDEFINED, INITIAL].some((told) => told.test(message.text())) && warned.push(message.text()));
  await open(page, "objecttyped");
  expect(await page.evaluate(() => window.scene.more())).toEqual(["selected later", "binding ok rect", "created none", "counted none", "fading rect", "faded rect"]);
  expect(warned.map((text) => [BOUND, UNDEFINED, INITIAL].findIndex((told) => told.test(text))).sort()).toEqual([0, 1, 2, 2]);
});

// The same where a Binding holds the property: a binding given it that is
// refused keeps what the Binding gave, and one that is not is taken, as qml6
// has it.
test("a property typed with an object type that a Binding holds keeps it when refused", async ({ page }) => {
  await open(page, "objecttyped");
  expect(await page.evaluate(() => window.scene.layers())).toEqual(["layered rect", "refused rect", "taken other"]);
});

// The same under something put over it (a theme's role, what a Block's use
// writes inside it), which qml6 has no counterpart of: a layer's binding that
// is refused keeps what the property had, the first time as after, and one
// that is not is taken.
test("a property typed with an object type under a layer keeps what it had when the layer's binding is refused", async ({ page }) => {
  const warned = [];
  page.on("console", (message) => BOUND.test(message.text()) && warned.push(message.text()));
  await open(page, "objectlayered");
  const said = await page.evaluate(() => {
    const root = window.scene;
    const { rect, other, plain } = root.named;
    const is = (value) => (value === null ? "null" : value === undefined ? "undefined" : value === rect ? "rect" : value === other ? "other" : typeof value);
    const read = () => (window.flush(), is(root.overlaid));
    const said = [`had ${read()}`];
    const over = window.override(root, "overlaid", { binding: () => (root.pick === 2 ? other : plain) });
    said.push(`refused ${read()}`);
    root.pick = 2;
    said.push(`taken ${read()}`);
    over.set({ binding: () => plain });
    said.push(`set refused ${read()}`);
    over.set({ value: rect });
    said.push(`set ${read()}`);
    // An assignment of a binding goes to the layer over the property.
    root.bindPlain();
    said.push(`bound refused ${read()}`);
    over.remove();
    said.push(`removed ${read()}`);
    return said;
  });
  expect(said).toEqual(["had rect", "refused rect", "taken other", "set refused other", "set rect", "bound refused rect", "removed rect"]);
  expect(warned).toHaveLength(3);
});

// A value-typed property under a layer keeps what it had the same way: a
// refused binding leaves the value, and one it takes is followed.
test("a property typed with a value type under a layer keeps what it had when the layer's binding is refused", async ({ page }) => {
  const warned = [];
  page.on("console", (message) => TEXT.test(message.text()) && warned.push(message.text()));
  await open(page, "objectlayered");
  const said = await page.evaluate(() => {
    const root = window.scene;
    const read = () => (window.flush(), String(root.level));
    const said = [`had ${read()}`];
    const over = window.override(root, "level", { binding: () => (root.pick === 7 ? 9 : "abc") });
    said.push(`refused ${read()}`);
    root.pick = 7;
    said.push(`taken ${read()}`);
    over.set({ binding: () => "abc" });
    said.push(`set refused ${read()}`);
    over.remove();
    said.push(`removed ${read()}`);
    return said;
  });
  expect(said).toEqual(["had 3", "refused 3", "taken 9", "set refused 9", "removed 3"]);
  expect(warned).toHaveLength(2);
});

// The object a layer's binding made stays alive while a binding put over it
// that is refused keeps it: it follows what it is bound to and is not
// destroyed, until the layer is given something of its own.
test("an object a layer's binding made stays alive while a refused binding keeps it", async ({ page }) => {
  await open(page, "objectlayered");
  const said = await page.evaluate(async () => {
    const root = window.scene;
    const { plain } = root.named;
    const over = window.override(root, "made", { binding: () => root.make() });
    window.flush();
    const first = root.made;
    const said = [`made ${first ? "rect" : String(first)}`];
    over.set({ binding: () => plain });
    root.pick = 5;
    window.flush();
    await new Promise((resolve) => setTimeout(resolve));
    said.push(`refused ${root.made === first ? "kept" : "lost"} n ${first.n} ended ${root.ended}`);
    over.set({ binding: () => plain });
    await new Promise((resolve) => setTimeout(resolve));
    said.push(`refused again ${root.made === first ? "kept" : "lost"} ended ${root.ended}`);
    over.set({ value: null });
    window.flush();
    said.push(`set null ${String(root.made)} ended ${root.ended}`);
    return said;
  });
  expect(said).toEqual(["made rect", "refused kept n 5 ended 0", "refused again kept ended 0", "set null null ended 1"]);
});

// A binding put over it that is refused ends the one before at once: a
// change to what that one read makes nothing again and ends nothing, while
// a layer's binding that gives something new ends what it made before (on
// the wasm kernel once its next evaluation is over, so it is counted after
// the refusal).
test("an object a layer's binding made outlives a change to what that binding read once a refused binding is put over it", async ({ page }) => {
  await open(page, "objectlayered");
  const said = await page.evaluate(async () => {
    const root = window.scene;
    const { plain } = root.named;
    const settle = async () => (window.flush(), await new Promise((resolve) => setTimeout(resolve)));
    const over = window.override(root, "made", { binding: () => (root.pick > 100 ? null : root.make()) });
    await settle();
    const first = root.made;
    root.pick = 6;
    await settle();
    const second = root.made;
    const said = [`again ${second !== first ? "new" : "same"}`];
    over.set({ binding: () => plain });
    await settle();
    root.pick = 7;
    await settle();
    root.pick = 8;
    await settle();
    said.push(`refused ${root.made === second ? "kept" : "lost"} n ${second.n} ended ${root.ended}`);
    over.remove();
    await settle();
    said.push(`removed ended ${root.ended}`);
    return said;
  });
  expect(said).toEqual(["again new", "refused kept n 8 ended 1", "removed ended 2"]);
});

// What a layer's binding made itself, and still holds when the binding that
// replaces it is refused, is not ended with that binding: it goes on following
// what it binds to, until a binding the property takes, or the layer's
// removal, lets go of it.
test("an object a layer's binding made outlives the binding that replaces it and is refused", async ({ page }) => {
  await open(page, "objectlayered");
  const said = await page.evaluate(async () => {
    const root = window.scene;
    const { plain, other } = root.named;
    const settle = async () => (window.flush(), await new Promise((resolve) => setTimeout(resolve)));
    const said = [];
    const over = window.override(root, "made", { binding: () => root.make() });
    await settle();
    const made = root.made;
    root.pick = 3;
    await settle();
    said.push(`made ${made.n} ended ${root.ended}`);
    over.set({ binding: () => plain });
    root.pick = 4;
    await settle();
    said.push(`refused ${root.made === made} ${made.n} ended ${root.ended}`);
    over.set({ binding: () => plain });
    root.pick = 5;
    await settle();
    said.push(`refused again ${root.made === made} ${made.n} ended ${root.ended}`);
    over.set({ binding: () => other });
    await settle();
    said.push(`taken ${root.made === other} ended ${root.ended}`);
    over.set({ binding: () => root.make() });
    await settle();
    const again = root.made;
    over.set({ binding: () => plain });
    await settle();
    said.push(`refused ${root.made === again} ended ${root.ended}`);
    over.remove();
    await settle();
    said.push(`removed ended ${root.ended}`);
    return said;
  });
  expect(said).toEqual(["made 3 ended 0", "refused true 4 ended 0", "refused again true 5 ended 0", "taken true ended 1", "refused true ended 1", "removed ended 2"]);
});

// The same binding evaluated again and refused, after it made what the
// property has, keeps that: it is not ended until the binding makes another.
test("a layer's binding refused once it has made what the property has keeps it", async ({ page }) => {
  await open(page, "objectlayered");
  const said = await page.evaluate(async () => {
    const root = window.scene;
    const { plain } = root.named;
    // A read, for a kernel that evaluates a binding when it is read.
    const settle = async () => (window.flush(), root.made, await new Promise((resolve) => setTimeout(resolve)));
    const said = [];
    const over = window.override(root, "made", { binding: () => (root.pick > 5 ? plain : root.make()) });
    await settle();
    const made = root.made;
    root.pick = 6;
    await settle();
    said.push(`refused ${root.made === made} ${made.n} ended ${root.ended}`);
    root.pick = 0;
    await settle();
    const again = root.made;
    said.push(`made again ${again !== made && again !== plain} ended ${root.ended}`);
    over.remove();
    await settle();
    said.push(`removed ended ${root.ended}`);
    return said;
  });
  expect(said).toEqual(["refused true 6 ended 0", "made again true ended 1", "removed ended 2"]);
});

// An object a layer's binding constructs itself, not through a component,
// is the layer's as one `createObject` made is: a refused evaluation after it
// leaves it alive, and the layer's removal ends it.
test("an object a layer's binding constructed itself stays alive while a refused evaluation keeps it", async ({ page }) => {
  await open(page, "objectlayered");
  const said = await page.evaluate(async () => {
    const root = window.scene;
    const { plain, rect } = root.named;
    const Rect = rect.$type;
    // A read, for a kernel that evaluates a binding when it is read.
    const settle = async () => (window.flush(), root.made, await new Promise((resolve) => setTimeout(resolve)));
    const over = window.override(root, "made", { binding: () => (root.pick > 5 ? plain : Rect({ Component$onDestruction: () => root.ended++ })) });
    await settle();
    const made = root.made;
    root.pick = 6;
    await settle();
    const said = [`refused ${root.made === made} ended ${root.ended}`];
    over.remove();
    await settle();
    said.push(`removed ended ${root.ended}`);
    return said;
  });
  expect(said).toEqual(["refused true ended 0", "removed ended 1"]);
});

// Only the binding now on the layer is followed: one that a later binding
// replaced is told of no more, so each change warns once, for the current one.
test("a refused binding a layer gave up is no longer followed", async ({ page }) => {
  const warned = [];
  page.on("console", (message) => BOUND.test(message.text()) && warned.push(message.text()));
  await open(page, "objectlayered");
  const counts = await page.evaluate(async () => {
    const root = window.scene;
    const { plain } = root.named;
    // A read, for a kernel that evaluates a binding when it is read.
    const settle = async () => (window.flush(), root.made, await new Promise((resolve) => setTimeout(resolve)));
    const over = window.override(root, "made", { binding: () => (root.pick, root.make()) });
    await settle();
    root.pick = 1;
    await settle();
    over.set({ binding: () => (root.pick, plain) });
    await settle();
    root.pick = 2;
    await settle();
    root.pick = 3;
    await settle();
    over.set({ binding: () => (root.pick, plain) });
    await settle();
    root.pick = 4;
    await settle();
    over.remove();
    await settle();
    return root.ended;
  });
  expect(counts).toBe(2);
  expect(warned).toHaveLength(5);
});

// The object a layer's binding made, put back over the property as a plain
// value, is the property's again: it is not ended under it, and ends once
// the layer is taken off.
test("an object a layer's binding made stays alive when it is put over the property as a plain value", async ({ page }) => {
  await open(page, "objectlayered");
  const said = await page.evaluate(async () => {
    const root = window.scene;
    // Read, as the wasm kernel runs a binding when what it gives is read.
    const settle = async () => (window.flush(), root.made, await new Promise((resolve) => setTimeout(resolve)));
    const over = window.override(root, "made", { binding: () => root.make() });
    await settle();
    const first = root.made;
    over.set({ value: first });
    await settle();
    root.pick = 4;
    await settle();
    const said = [`plain ${root.made === first ? "kept" : "lost"} n ${first.n} ended ${root.ended}`];
    over.remove();
    await settle();
    said.push(`removed ended ${root.ended}`);
    return said;
  });
  expect(said).toEqual(["plain kept n 4 ended 0", "removed ended 1"]);
});

// What an evaluation the type refuses made is no one's: it ends after that
// evaluation, each time, and what the property has stays.
test("an object a refused evaluation of a layer's binding made ends after it", async ({ page }) => {
  await open(page, "objectlayered");
  const said = await page.evaluate(async () => {
    const root = window.scene;
    const { plain } = root.named;
    // Read, as the wasm kernel runs a binding when what it gives is read.
    const settle = async () => (window.flush(), root.made, await new Promise((resolve) => setTimeout(resolve)));
    const over = window.override(root, "made", { binding: () => root.make() });
    await settle();
    const first = root.made;
    over.set({ binding: () => (root.pick, root.make(), plain) });
    await settle();
    const said = [`refused ${root.made === first ? "kept" : "lost"} ended ${root.ended}`];
    root.pick = 9;
    await settle();
    said.push(`again ${root.made === first ? "kept" : "lost"} ended ${root.ended}`);
    over.remove();
    await settle();
    said.push(`removed ended ${root.ended}`);
    return said;
  });
  expect(said).toEqual(["refused kept ended 1", "again kept ended 2", "removed ended 3"]);
});

// Taking the layer off ends its binding before the object that binding made,
// so a change the object makes as it ends runs no binding that keeps anew.
test("an object a layer's binding made ends with the layer when its ending changes what that binding read", async ({ page }) => {
  await open(page, "objectlayered");
  const said = await page.evaluate(async () => {
    const root = window.scene;
    // Read, as the wasm kernel runs a binding when what it gives is read.
    const settle = async () => (window.flush(), root.made, await new Promise((resolve) => setTimeout(resolve)));
    let made = 0;
    const over = window.override(root, "made", { binding: () => (root.k, made++, root.make()) });
    await settle();
    root.bump = true;
    over.remove();
    await settle();
    root.k++;
    await settle();
    return [`removed made ${made} ended ${root.ended}`];
  });
  expect(said).toEqual(["removed made 1 ended 1"]);
});

// A binding whose first evaluation the type refuses, with nothing under it to
// keep, leaves the property with nothing: what that evaluation made ends.
test("an object a layer's binding made ends when its first evaluation is refused and the property is left with nothing", async ({ page }) => {
  await open(page, "objectlayered");
  const said = await page.evaluate(async () => {
    const root = window.scene;
    const { plain } = root.named;
    // Read, as the wasm kernel runs a binding when what it gives is read.
    const settle = async () => (window.flush(), root.made, await new Promise((resolve) => setTimeout(resolve)));
    const over = window.override(root, "made", { binding: () => (root.make(), plain) });
    await settle();
    const said = [`refused ${root.made == null ? "nothing" : "something"} ended ${root.ended}`];
    over.remove();
    await settle();
    said.push(`removed ended ${root.ended}`);
    return said;
  });
  expect(said).toEqual(["refused nothing ended 1", "removed ended 1"]);
});

// A binding that takes its own layer off as it runs keeps nothing: the layer
// is gone, and what that evaluation made ends with it.
test("an object a layer's binding made ends when that binding takes its layer off", async ({ page }) => {
  await open(page, "objectlayered");
  const said = await page.evaluate(async () => {
    const root = window.scene;
    // Read, as the wasm kernel runs a binding when what it gives is read.
    const settle = async () => (window.flush(), root.made, await new Promise((resolve) => setTimeout(resolve)));
    const over = window.override(root, "made", { value: null });
    over.set({
      binding: () => {
        const made = root.make();
        over.remove();
        return made;
      },
    });
    await settle();
    return [`removed ended ${root.ended}`];
  });
  expect(said).toEqual(["removed ended 1"]);
});

// An object the binding moved off is ended after the evaluation; put back as a
// plain value before then, it is the layer's again and stays.
test("an object a layer's binding moved off stays alive when it is put back as a plain value before it ends", async ({ page }) => {
  await open(page, "objectlayered");
  const said = await page.evaluate(async () => {
    const root = window.scene;
    const { other } = root.named;
    // Read, as the wasm kernel runs a binding when what it gives is read.
    const settle = async () => (window.flush(), root.made, await new Promise((resolve) => setTimeout(resolve)));
    const over = window.override(root, "made", { binding: () => (root.pick > 0 ? other : root.make()) });
    await settle();
    const first = root.made;
    root.pick = 1;
    window.flush();
    const moved = root.made === other;
    over.set({ value: first });
    await settle();
    const said = [`moved ${moved} back ${root.made === first} ended ${root.ended}`];
    over.remove();
    await settle();
    said.push(`removed ended ${root.ended}`);
    return said;
  });
  expect(said).toEqual(["moved true back true ended 0", "removed ended 1"]);
});

// Made with a parent, what a refused evaluation made is still that
// evaluation's, not the parent's: it ends after it, each time.
test("an object a refused evaluation of a layer's binding made with a parent ends after it", async ({ page }) => {
  await open(page, "objectlayered");
  const said = await page.evaluate(async () => {
    const root = window.scene;
    const { plain } = root.named;
    // Read, as the wasm kernel runs a binding when what it gives is read.
    const settle = async () => (window.flush(), root.made, await new Promise((resolve) => setTimeout(resolve)));
    const over = window.override(root, "made", { binding: () => root.makeIn() });
    await settle();
    const first = root.made;
    over.set({ binding: () => (root.pick, root.makeIn(), plain) });
    await settle();
    const said = [`refused ${root.made === first ? "kept" : "lost"} ended ${root.ended}`];
    root.pick = 9;
    await settle();
    said.push(`again ${root.made === first ? "kept" : "lost"} ended ${root.ended}`);
    over.remove();
    await settle();
    said.push(`removed ended ${root.ended}`);
    return said;
  });
  expect(said).toEqual(["refused kept ended 1", "again kept ended 2", "removed ended 3"]);
});

// Unlike a plain binding's, an object a layer's binding made with a parent is
// the layer's: once the binding moves off it, it ends and leaves the parent.
test("an object a layer's binding made with a parent ends and leaves the parent once the binding moves off it", async ({ page }) => {
  await open(page, "objectlayered");
  const said = await page.evaluate(async () => {
    const root = window.scene;
    const { other } = root.named;
    // Read, as the wasm kernel runs a binding when what it gives is read.
    const settle = async () => (window.flush(), root.made, await new Promise((resolve) => setTimeout(resolve)));
    const under = (object) => Array.from(root.children).includes(object);
    const over = window.override(root, "made", { binding: () => (root.pick > 0 ? other : root.makeIn()) });
    await settle();
    const first = root.made;
    const said = [`made under ${under(first)} ended ${root.ended}`];
    root.pick = 1;
    await settle();
    said.push(`moved ${root.made === other} under ${under(first)} ended ${root.ended}`);
    over.remove();
    await settle();
    said.push(`removed ended ${root.ended}`);
    return said;
  });
  expect(said).toEqual(["made under true ended 0", "moved true under false ended 1", "removed ended 1"]);
});

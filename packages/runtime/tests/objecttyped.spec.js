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
test.use({ told: [[BOUND, UNDEFINED, INITIAL], { option: true }] });

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

// What a layer's binding made itself, and still holds when the binding that
// replaces it is refused, is not ended with that binding: it goes on following
// what it binds to, until a binding the property takes, or the layer's
// removal, lets go of it.
test("an object a layer's binding made outlives the binding that replaces it and is refused", async ({ page }) => {
  await open(page, "objectlayered");
  const said = await page.evaluate(() => {
    const root = window.scene;
    const { plain, other } = root.named;
    const read = () => (window.flush(), root.overlaid);
    const said = [];
    const over = window.override(root, "overlaid", { binding: () => root.makeRect() });
    const made = read();
    root.k = 3;
    said.push(`made ${made.n} ended ${root.ended}`);
    over.set({ binding: () => plain });
    root.k = 4;
    said.push(`refused ${read() === made} ${made.n} ended ${root.ended}`);
    over.set({ binding: () => plain });
    root.k = 5;
    said.push(`refused again ${read() === made} ${made.n} ended ${root.ended}`);
    over.set({ binding: () => other });
    said.push(`taken ${read() === other} ended ${root.ended}`);
    const again = (over.set({ binding: () => root.makeRect() }), read());
    over.set({ binding: () => plain });
    said.push(`refused ${read() === again} ended ${root.ended}`);
    over.remove();
    said.push(`removed ended ${root.ended}`);
    return said;
  });
  expect(said).toEqual(["made 3 ended 0", "refused true 4 ended 0", "refused again true 5 ended 0", "taken true ended 1", "refused true ended 1", "removed ended 2"]);
});

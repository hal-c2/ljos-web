// `inspect(root)`: a mounted root read, written, clicked and listed by what
// its QML says, as Ljós's own inspector answers of the same file: ids, the
// object tree, the object at a point and where it is written, and the
// logged lines with their file and line. The scenes are compiled with
// `--inspect` (the Vite plugin's `inspect`), which is what puts the places
// in. What qml6 says of the same files is in the comments.
import { expect, open, test } from "./open.js";

const opened = async (page, scene) => {
  await page.goto(`/?scene=${scene}&inspect`);
  await page.waitForFunction(() => window.ready);
};
const ask = (page, call, arg) => page.evaluate(call, arg);

test("a property is read by the id it is written with", async ({ page }) => {
  await opened(page, "inspected");
  expect(await ask(page, () => window.inspector.read("root", ["count", "doubled", "objectName"]))).toEqual({
    count: 0,
    doubled: 0,
    objectName: "main",
  });
  // A binding's value, of an object inside another.
  expect(await ask(page, () => window.inspector.read("label", ["text", "objectName"]))).toEqual({ text: "n=0", objectName: "label" });
  expect(await ask(page, () => window.inspector.read("dot", ["width"]))).toEqual({ width: 4 });
  // An instance of a component is named by the id it has where it is used.
  expect(await ask(page, () => window.inspector.read("card", ["x", "width"]))).toEqual({ x: 300, width: 50 });
});

test("an id inside a component's file is that file's, not the root's", async ({ page }) => {
  await opened(page, "inspected");
  // `label` in Card.qml is Card's: the root's `label` is its Text.
  expect(await ask(page, () => window.inspector.read("label", ["objectName"]))).toEqual({ objectName: "label" });
  expect(await ask(page, () => window.inspector.find("inner"))).toBe(null);
  expect(await ask(page, () => window.inspector.read("inner", ["x"]))).toEqual(null);
  // Card's own ids are read through the card.
  expect(await ask(page, () => window.inspect(window.inspector.find("card")).read("label", ["objectName"]))).toEqual({
    objectName: "cardLabel",
  });
});

test("a property written by id is what the bindings that read it follow", async ({ page }) => {
  await opened(page, "inspected");
  expect(await ask(page, () => window.inspector.write("root", "count", 4))).toBe(true);
  expect(await ask(page, () => window.inspector.read("root", ["doubled"]))).toEqual({ doubled: 8 });
  expect(await ask(page, () => window.inspector.read("label", ["text"]))).toEqual({ text: "n=4" });
  // An id nobody has is no object, and nothing is written.
  expect(await ask(page, () => window.inspector.write("nobody", "count", 1))).toBe(false);
});

test("a property written by id loses its binding, as an assignment does in Qt", async ({ page }) => {
  await opened(page, "inspected");
  await ask(page, () => window.inspector.write("label", "text", "fixed"));
  await ask(page, () => window.inspector.write("root", "count", 2));
  expect(await ask(page, () => window.inspector.read("label", ["text"]))).toEqual({ text: "fixed" });
  // What reads it follows what was written: `doubled` still has its own.
  await ask(page, () => window.inspector.write("root", "doubled", 1));
  await ask(page, () => window.inspector.write("root", "count", 3));
  expect(await ask(page, () => window.inspector.read("root", ["doubled"]))).toEqual({ doubled: 1 });
});

test("a click on an object by its id is a click at its centre, as a real one", async ({ page }) => {
  await opened(page, "inspected");
  expect(await ask(page, () => window.inspector.click("area"))).toEqual({ at: [50, 75] });
  expect(await ask(page, () => window.inspector.read("root", ["count"]))).toEqual({ count: 1 });
  // A TapHandler and a Button take it as they take the mouse's.
  await ask(page, () => window.inspector.click("tapped"));
  expect(await ask(page, () => window.inspector.read("tapped", ["taps"]))).toEqual({ taps: 1 });
  await ask(page, () => window.inspector.click("button"));
  expect(await ask(page, () => window.inspector.read("root", ["presses"]))).toEqual({ presses: 1 });
});

test("a click at a point lands on what is drawn there", async ({ page }) => {
  await opened(page, "inspected");
  await ask(page, () => window.inspector.click({ at: [10, 60] }));
  expect(await ask(page, () => window.inspector.read("root", ["count"]))).toEqual({ count: 1 });
  // Where two overlap, the one on top has it.
  await ask(page, () => window.inspector.click({ at: [220, 140] }));
  expect(await ask(page, () => window.inspector.read("over", ["hits"]))).toEqual({ hits: 1 });
  expect(await ask(page, () => window.inspector.read("under", ["hits"]))).toEqual({ hits: 0 });
  // A click by id aims at the centre, and the centre of `under` is under `over`.
  await ask(page, () => window.inspector.click("under"));
  expect(await ask(page, () => window.inspector.read("under", ["hits"]))).toEqual({ hits: 0 });
  expect(await ask(page, () => window.inspector.read("over", ["hits"]))).toEqual({ hits: 2 });
  // Where nothing takes it, nothing changes.
  await ask(page, () => window.inspector.click({ at: [390, 290] }));
  expect(await ask(page, () => window.inspector.read("root", ["count", "presses"]))).toEqual({ count: 1, presses: 0 });
});

test("a click outside the root, or at its right or bottom edge, is not actionable", async ({ page }) => {
  await opened(page, "inspected");
  for (const at of [[400, 10], [10, 300], [-1, 10]]) {
    expect(await ask(page, (at) => window.inspector.click({ at }).error, at)).toBe("not_actionable");
  }
  expect(await ask(page, () => window.inspector.click("nobody").error)).toBe("not_found");
});

test("the outline is the object tree: types, ids, objectNames, children in order", async ({ page }) => {
  await opened(page, "inspected");
  // What qml6 lists as the root's `data`: the Timer first, then the
  // children, the rows a Repeater made before the Repeater, and what a
  // Loader made inside it.
  expect(await ask(page, () => window.inspector.outline().text)).toBe(
    [
      'Rectangle#root "main"',
      "  Timer#timer",
      '  Text#label "label"',
      "    Rectangle#dot",
      "  Card#card",
      '    Rectangle#label "cardLabel"',
      '  MouseArea#area "area"',
      "  Rectangle#tapped",
      "    TapHandler",
      "  Button#button",
      "  MouseArea#under",
      "  MouseArea#over",
      '  Rectangle "row0"',
      '  Rectangle "row1"',
      "  Repeater#rows",
      "  Loader#loader",
      '    Text "loaded"',
    ].join("\n"),
  );
  const rows = await ask(page, () => window.inspector.outline().objects.map(({ object, ...row }) => row));
  expect(rows[0]).toEqual({ depth: 0, type: "Rectangle", id: "root", object_name: "main", item: true, children: 12 });
  expect(rows[1]).toEqual({ depth: 1, type: "Timer", id: "timer", object_name: "", item: false, children: 0 });
  // An object is listed with the id written at its own place, in whichever
  // file: Card's `label` is Card's, beside the root's.
  expect(rows[5]).toEqual({ depth: 2, type: "Rectangle", id: "label", object_name: "cardLabel", item: true, children: 0 });
});

test("the object at a point names its file, line and column", async ({ page }) => {
  await opened(page, "inspected");
  const pick = (at) => page.evaluate((at) => {
    const { object, ...rest } = window.inspector.pick(...at) ?? {};
    return object ? rest : null;
  }, at);
  expect(await pick([10, 60])).toEqual({ type: "MouseArea", id: "area", source: { file: "scenes/inspected.qml", line: 22, column: 5 } });
  expect(await pick([220, 140])).toEqual({ type: "MouseArea", id: "over", source: { file: "scenes/inspected.qml", line: 46, column: 5 } });
  // Inside a component, the file it is written in; the component's root
  // is where it is used.
  expect(await pick([310, 10])).toEqual({ type: "Rectangle", id: "label", source: { file: "scenes/inspected/Card.qml", line: 7, column: 5 } });
  // A Repeater's rows are where their delegate is written.
  expect(await pick([22, 202])).toEqual({ type: "Rectangle", id: "", source: { file: "scenes/inspected.qml", line: 55, column: 9 } });
  // Nothing but the root is drawn there.
  expect(await pick([390, 290])).toEqual({ type: "Rectangle", id: "root", source: { file: "scenes/inspected.qml", line: 5, column: 1 } });
  expect(await pick([400, 10])).toBe(null);
});

test.describe("a logged line", () => {
  test.use({ told: [/loud 0/] });
  test("carries the file and line it is written at", async ({ page }) => {
    await opened(page, "inspected");
    // qml6: `inspected.qml:62 … ready 0`, as `debug`.
    const first = await ask(page, () => window.inspector.logs());
    expect(first.entries).toEqual([{ level: "debug", category: "qml", message: "ready 0", file: "scenes/inspected.qml", line: 62 }]);
    await ask(page, () => window.inspector.find("root").shout());
    // Only what is newer than the last answer.
    const next = await ask(page, (since) => window.inspector.logs(since), first.next_since);
    expect(next.entries).toEqual([{ level: "warning", category: "qml", message: "loud 0", file: "scenes/inspected.qml", line: 63 }]);
    expect(await ask(page, (since) => window.inspector.logs(since).entries, next.next_since)).toEqual([]);
  });
});

test.describe("a runtime warning", () => {
  test.use({ told: [/wide: TypeError/] });
  test("carries the file and line of the binding it is of", async ({ page }) => {
    await opened(page, "inspectwarn");
    // qml6: `inspectwarn.qml:6: TypeError: Cannot read property 'width' of null`.
    await page.waitForFunction(() => window.inspector.logs().entries.length > 0);
    const [entry] = (await ask(page, () => window.inspector.logs())).entries;
    expect(entry).toMatchObject({ level: "warning", category: "qml", file: "scenes/inspectwarn.qml", line: 6 });
    expect(entry.message).toMatch(/^wide: TypeError: /);
  });
});

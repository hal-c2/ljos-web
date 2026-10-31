// A reload keeps the state of a mounted root where it can, as a save does
// in `ljos run --watch` (ljos-ui ARCHITECTURE.md §12.1): each object of the
// new text that is one of the old (by id, objectName, else its place among
// its siblings of its type) keeps what the running program gave it, unless
// the text for that property was edited; one whose type changed, and
// everything below it, is made anew; bindings are the new text's.
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, open, test } from "./open.js";

const reload = (page, scene) => page.evaluate((scene) => window.reload(scene), scene);
const read = (page, what) => page.evaluate(what);

test("a changed colour keeps the text typed into a TextField, with the keyboard", async ({ page }) => {
  await open(page, "reloadfield");
  await page.evaluate(() => window.objects.field.forceActiveFocus());
  await page.keyboard.type("hello");
  expect(await reload(page, "reloadfieldred")).toBe(null);
  expect(await read(page, () => window.objects.field.text)).toBe("hello");
  expect(await read(page, () => String(window.objects.field.color))).toBe("#ff0000");
  expect(await read(page, () => window.objects.field.activeFocus)).toBe(true);
  await page.keyboard.type("!");
  expect(await read(page, () => window.objects.field.text)).toBe("hello!");
});

test("an added item keeps its siblings' state", async ({ page }) => {
  await open(page, "reloadrow");
  await page.evaluate(() => {
    const [red, green] = window.scene.children;
    red.width = 50;
    green.width = 60;
  });
  expect(await reload(page, "reloadrowadded")).toBe(null);
  const widths = () => window.scene.children.filter((child) => child.height === 10).map((child) => [child.x, child.width]);
  expect(await read(page, widths)).toEqual([
    [0, 50],
    [20, 60],
    [40, 10],
  ]);
});

test("a removed item goes, and the rest keeps its state", async ({ page }) => {
  await open(page, "reloadrow");
  await page.evaluate(() => {
    window.scene.children[0].width = 50;
    window.gone = window.scene.children[1].$node;
  });
  expect(await reload(page, "reloadrowremoved")).toBe(null);
  expect(await read(page, () => window.scene.children.map((child) => child.width))).toEqual([50]);
  expect(await read(page, () => window.gone.isConnected)).toBe(false);
});

test("an item whose type changed is made anew, with everything in it, and the rest keeps its state", async ({ page }) => {
  await open(page, "reloadkind");
  await page.evaluate(() => {
    const { box, inner, other } = window.objects;
    box.width = 50;
    inner.width = 7;
    other.width = 60;
  });
  expect(await reload(page, "reloadkindchanged")).toBe(null);
  expect(await read(page, () => [window.objects.box.width, window.objects.inner.width, window.objects.other.width])).toEqual([10, 5, 60]);
});

test("a binding changed in the file takes effect, over the state it reads", async ({ page }) => {
  await open(page, "reloadbind");
  await page.evaluate(() => (window.scene.base = 3));
  expect(await read(page, () => window.objects.box.width)).toBe(30);
  expect(await reload(page, "reloadbindchanged")).toBe(null);
  expect(await read(page, () => window.objects.box.width)).toBe(60);
  await page.evaluate(() => (window.scene.base = 4));
  expect(await read(page, () => window.objects.box.width)).toBe(80);
});

test("a binding the program replaced by a value stays replaced when its text did not change", async ({ page }) => {
  await open(page, "reloadbind");
  await page.evaluate(() => (window.objects.box.height = 5));
  expect(await reload(page, "reloadbindchanged")).toBe(null);
  expect(await read(page, () => window.objects.box.height)).toBe(5);
});

test("an id renamed is a new object", async ({ page }) => {
  await open(page, "reloadname");
  await page.evaluate(() => (window.scene.thing.width = 50));
  expect(await reload(page, "reloadnamed")).toBe(null);
  expect(await read(page, () => window.scene.thing.width)).toBe(10);
});

test("an object with an id keeps its state when it moves to another parent", async ({ page }) => {
  await open(page, "reloadmove");
  await page.evaluate(() => (window.objects.box.width = 50));
  expect(await reload(page, "reloadmoved")).toBe(null);
  expect(await read(page, () => [window.objects.box.width, window.objects.box.parent.x])).toEqual([50, 100]);
});

test("a property a handler set keeps its value when the file's text for it did not change", async ({ page }) => {
  await open(page, "reloadhandler");
  await page.evaluate(() => window.scene.grow());
  expect(await reload(page, "reloadhandlercolour")).toBe(null);
  expect(await read(page, () => [window.objects.box.width, window.objects.box.height, String(window.objects.box.color)])).toEqual([80, 90, "#0000ff"]);
});

test("an edited declaration wins over the value a handler set", async ({ page }) => {
  await open(page, "reloadhandler");
  await page.evaluate(() => window.scene.grow());
  expect(await reload(page, "reloadhandlerwidth")).toBe(null);
  expect(await read(page, () => [window.objects.box.width, window.objects.box.height])).toEqual([20, 90]);
});

test("a view's rows keep their state, row by row", async ({ page }) => {
  await open(page, "reloadrows");
  await page.evaluate(() => {
    const [first, , third] = window.scene.children.filter((child) => child.height === 10);
    first.width = 15;
    third.width = 17;
  });
  expect(await reload(page, "reloadrowsblue")).toBe(null);
  expect(await read(page, () => window.scene.children.filter((child) => child.height === 10).map((child) => [child.width, String(child.color)]))).toEqual([
    [15, "#0000ff"],
    [10, "#0000ff"],
    [17, "#0000ff"],
  ]);
});

test("a reload whose component cannot be made keeps the last good mount", async ({ page }) => {
  await open(page, "reloadfield");
  await page.evaluate(() => window.objects.field.forceActiveFocus());
  await page.keyboard.type("kept");
  const node = await page.evaluateHandle(() => window.scene.$node);
  expect(await reload(page, "reloadthrows")).toBe("ReloadError: the reload was not applied: this component throws");
  expect(await read(page, () => window.objects.field.text)).toBe("kept");
  expect(await node.evaluate((node) => node.isConnected && node === window.scene.$node)).toBe(true);
  expect(await reload(page, "reloadfieldred")).toBe(null);
  expect(await read(page, () => window.objects.field.text)).toBe("kept");
});

test.describe("on a save in the dev server", () => {
  // Vite says what it could not compile: the server's 500, and which file.
  test.use({ told: [/status of 500 \(Internal Server Error\)|\[vite\] Failed to reload \/scenes\/saved\/Saved\.qml/] });
  test.describe.configure({ mode: "serial" });
  const file = join(import.meta.dirname, "scenes/saved/Saved.qml");
  // As an editor saves: the watcher sees the whole new text at once, never
  // the empty file a write in place starts with.
  const save = (text) => {
    writeFileSync(`${file}.next`, text);
    renameSync(`${file}.next`, file);
  };

  test("the dev server keeps the state, and keeps the last good mount over a file that does not compile", async ({ page }) => {
    const text = readFileSync(file, "utf8");
    // What Vite's client says of each save: a save it never heard of fails
    // as that, not as a page that did not change.
    const heard = (pattern, what) =>
      page.waitForEvent("console", { predicate: (message) => pattern.test(message.text()), timeout: 15000 }).catch(() => {
        throw new Error(`the dev server said nothing of ${what}`);
      });
    try {
      await open(page, "reloadsaved");
      await page.evaluate(() => {
        window.first = window.scene;
        window.objects.field.forceActiveFocus();
      });
      await page.keyboard.type("typed");
      let said = heard(/\[vite\] hot updated: \/scenes\/saved\/Saved\.qml/, "the save of a new colour");
      save(text.replace('color: "black"', 'color: "red"'));
      await said;
      expect(await read(page, () => [window.scene !== window.first, String(window.objects.field.color)])).toEqual([true, "#ff0000"]);
      expect(await read(page, () => [window.objects.field.text, window.objects.field.activeFocus])).toEqual(["typed", true]);

      await page.evaluate(() => (window.second = window.scene));
      said = heard(/\[vite\] Failed to reload \/scenes\/saved\/Saved\.qml/, "the save that does not compile");
      save(text.replace('color: "black"', 'color: "red"\n        width:'));
      await said;
      expect(await read(page, () => [window.scene === window.second, window.scene.$node.isConnected, window.objects.field.text])).toEqual([true, true, "typed"]);

      said = heard(/\[vite\] hot updated: \/scenes\/saved\/Saved\.qml/, "the save that compiles again");
      save(text.replace('color: "black"', 'color: "blue"'));
      await said;
      expect(await read(page, () => [String(window.objects.field.color), window.objects.field.text])).toEqual(["#0000ff", "typed"]);
    } finally {
      save(text);
    }
  });
});

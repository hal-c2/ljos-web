// `import Ljos.Models`: Ljós's JsonListModel, as ljos-ui's
// features/models/json-list-model.feature says it behaves. Each test is one
// of its scenarios (or one Rule's table) on the same QML.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, open, test } from "./open.js";

const read = (page, names) => page.evaluate((names) => Object.fromEntries(names.map((name) => [name, window.objects[name]])), names);
// What a model said of itself.
const model = (page, name, keys = ["status", "count", "error"]) =>
  page.evaluate(([name, keys]) => Object.fromEntries(keys.map((key) => [key, window.objects[name][key]])), [name, keys]);

test("the objects of an array become rows, their keys the roles in first-seen order", async ({ page }) => {
  await open(page, "jsonrows");
  expect(await model(page, "m", ["count"])).toEqual({ count: 2 });
  expect(await read(page, ["names"])).toEqual({ names: "name,n,tag" });
});

test("JsonListModel's statuses are Null, Ready, Loading and Error", async ({ page }) => {
  await open(page, "jsonrows");
  expect(await read(page, ["enums"])).toEqual({ enums: [0, 1, 2, 3] });
});

test("a model given nothing is empty and has loaded nothing", async ({ page }) => {
  await open(page, "jsonrows");
  expect(await model(page, "empty")).toEqual({ status: 0, count: 0, error: "" });
});

test("get gives a row as a plain object, undefined beyond the rows", async ({ page }) => {
  await open(page, "jsonrows");
  expect(await read(page, ["first", "second", "beyond", "before", "between"])).toEqual({
    first: '{"name":"a","tags":["x","y"],"at":{"line":3}}',
    second: '{"name":"b","gone":null}',
    beyond: "undefined",
    before: "undefined",
    between: "undefined",
  });
});

test("a key a row does not have is undefined, a JSON null is null", async ({ page }) => {
  await open(page, "jsonrows");
  expect(await read(page, ["nulls"])).toEqual({ nulls: "null;undefined;" });
});

test("numbers, truth, text, arrays and objects reach a delegate as what they are", async ({ page }) => {
  await open(page, "jsonrows");
  expect(await read(page, ["typed"])).toEqual({ typed: "4,1,true,2,2,v" });
});

test("a key said twice in an object is the last one said, as JSON.parse takes it", async ({ page }) => {
  await open(page, "jsonrows");
  expect(await read(page, ["a"])).toEqual({ a: 2 });
});

test("a Repeater, a ListView and a GridView show one delegate for each row", async ({ page }) => {
  await open(page, "jsonviews");
  expect(await read(page, ["repeated", "listed", "gridded"])).toEqual({ repeated: "0a;1b;", listed: "0a;1b;", gridded: "0a;1b;" });
});

test("a model with one role gives its delegates modelData", async ({ page }) => {
  await open(page, "jsonviews");
  expect(await read(page, ["single"])).toEqual({ single: "a" });
});

test("a TableView shows the rows in one column", async ({ page }) => {
  await open(page, "jsonviews");
  await page.waitForFunction(() => window.objects.tabled === "0a;1b;");
  expect(await page.evaluate(() => [window.objects.table.rows, window.objects.table.columns])).toEqual([2, 1]);
});

test.describe("a change says only what differs", () => {
  const OLD = [{ n: 1, s: "a" }, { n: 2, s: "b" }, { n: 3, s: "c" }];
  const CHANGES = [
    ["the same data", '[{"n": 1, "s": "a"}, {"n": 2, "s": "b"}, {"n": 3, "s": "c"}]', ""],
    ["the same data respaced", '[ {"s":"a","n":1}, {"n":2,"s":"b"}, {"n":3,"s":"c"} ]', ""],
    ["one value of a row", '[{"n": 1, "s": "a"}, {"n": 2, "s": "B"}, {"n": 3, "s": "c"}]', "data1-1[1]"],
    ["a row added at the end", '[{"n": 1, "s": "a"}, {"n": 2, "s": "b"}, {"n": 3, "s": "c"}, {"n": 4, "s": "d"}]', "+3-3 count4"],
    ["a row added between", '[{"n": 1, "s": "a"}, {"n": 9, "s": "z"}, {"n": 2, "s": "b"}, {"n": 3, "s": "c"}]', "+1-1 count4"],
    ["a row taken from the end", '[{"n": 1, "s": "a"}, {"n": 2, "s": "b"}]', "x2-2 count2"],
    ["a row taken from between", '[{"n": 1, "s": "a"}, {"n": 3, "s": "c"}]', "x1-1 count2"],
    ["the first and last row", '[{"n": 9, "s": "a"}, {"n": 2, "s": "b"}, {"n": 3, "s": "z"}]', "data0-0[0] data2-2[1]"],
    ["two neighbours alike", '[{"n": 8, "s": "a"}, {"n": 9, "s": "b"}, {"n": 3, "s": "c"}]', "data0-1[0]"],
    ["fewer and different", '[{"n": 9, "s": "z"}]', "data0-0[0,1] x1-2 count1"],
    ["no rows at all", "[]", "x0-2 count0"],
  ];
  for (const [what, text, seen] of CHANGES) {
    test(`${what} is said as "${seen}"`, async ({ page }) => {
      await open(page, "jsonchanges");
      expect(await page.evaluate(() => [0, 1, 2].map((index) => window.objects.m.get(index)))).toEqual(OLD);
      expect(await page.evaluate((text) => window.objects.next(text), text)).toBe(seen);
      expect(await page.evaluate(() => JSON.stringify(Array.from({ length: window.objects.m.count }, (_, index) => window.objects.m.get(index))))).toBe(
        JSON.stringify(JSON.parse(text)),
      );
    });
  }

  test("the delegates of the rows that stayed are kept", async ({ page }) => {
    await open(page, "jsonchanges");
    expect(await read(page, ["made"])).toEqual({ made: 3 });
    await page.evaluate(() => window.objects.keep());
    expect(await read(page, ["made", "shown"])).toEqual({ made: 4, shown: "z" });
  });

  test("a new key adds a role and says so, and the rows that have it change", async ({ page }) => {
    await open(page, "jsonchanges");
    expect(await page.evaluate(() => window.objects.grow())).toBe("roles data1-1[1]");
    expect(await read(page, ["grownNames"])).toEqual({ grownNames: "a,b" });
  });

  test("a key no row has any more is a reset, and the roles are read afresh", async ({ page }) => {
    await open(page, "jsonchanges");
    expect(await page.evaluate(() => window.objects.shrink())).toBe("roles reset count2");
    expect(await read(page, ["shrunkNames"])).toEqual({ shrunkNames: "b,c" });
  });

  test("the first rows are said as rows that came, after the roles", async ({ page }) => {
    await open(page, "jsonchanges");
    expect(await read(page, ["firstSeen"])).toEqual({ firstSeen: "roles +0-0 count1" });
  });
});

test.describe("JSON that cannot be used leaves the rows as they were", () => {
  test.use({ told: [[/^QML JsonListModel: /], { option: true }] });
  const BAD = [
    ["text that is not JSON", '[{"a": 1', "line 1"],
    ["a top level no array", '{"a": 1}', "an array of objects"],
    ["a row no object", '[{"a": 1}, 2]', "row 1"],
  ];
  for (const [what, text, says] of BAD) {
    test(`${what} keeps the rows and says why`, async ({ page }) => {
      const warned = [];
      page.on("console", (message) => message.type() === "warning" && warned.push(message.text()));
      await open(page, "jsonbad");
      await page.evaluate((text) => window.objects.next(text), text);
      expect(await model(page, "m", ["status", "count"])).toEqual({ status: 3, count: 2 });
      expect(await page.evaluate(() => [window.objects.kept, window.objects.rec.seen])).toEqual([2, ""]);
      expect(await page.evaluate(() => window.objects.m.error)).toContain(says);
      expect(warned.some((line) => line.startsWith("QML JsonListModel: ") && line.includes(says))).toBe(true);
    });
  }

  test("good JSON after bad takes the error away", async ({ page }) => {
    await open(page, "jsonbad");
    await page.evaluate(() => window.objects.next("nope"));
    await page.evaluate(() => window.objects.next('[{"a": 1}, {"a": 2}]'));
    expect(await model(page, "m")).toEqual({ status: 1, count: 2, error: "" });
  });

  test("an empty text is no rows and no error", async ({ page }) => {
    await open(page, "jsonbad");
    await page.evaluate(() => window.objects.next(""));
    expect(await model(page, "m", ["status", "count"])).toEqual({ status: 0, count: 0 });
  });

  test("broken JSON says where, as Ljós says it", async ({ page }) => {
    await open(page, "jsonbad");
    await page.evaluate(() => window.objects.next('[{"a": 1},\n {"a": }]'));
    expect(await page.evaluate(() => window.objects.m.error)).toMatch(/^json:2:\d+: .* at line 2 column \d+$/);
  });
});

test.describe("a source is read in the background", () => {
  test.use({ told: [[/^QML JsonListModel: /, /Failed to load resource/], { option: true }] });
  const ready = (name) => (page) => page.waitForFunction((name) => [1, 3].includes(window.objects[name].status), name);

  test("a file beside the QML is read, Loading then Ready", async ({ page }) => {
    await open(page, "jsonsource");
    expect(await read(page, ["statusAtFirst"])).toEqual({ statusAtFirst: 2 });
    await ready("m")(page);
    expect(await model(page, "m", ["status"])).toEqual({ status: 1 });
    expect(await read(page, ["seen"])).toEqual({ seen: "status 2;a;b;count 2;status 1;" });
  });

  test("a source wins over the text", async ({ page }) => {
    await open(page, "jsonsource");
    await ready("both")(page);
    expect(await read(page, ["bothFirst"])).toEqual({ bothFirst: "file" });
  });

  test("a file that is not there is an error that names it", async ({ page }) => {
    const warned = [];
    page.on("console", (message) => message.type() === "warning" && warned.push(message.text()));
    await open(page, "jsonsource");
    await ready("missing")(page);
    expect(await model(page, "missing", ["status", "count"])).toEqual({ status: 3, count: 0 });
    expect(await read(page, ["missingSays"])).toEqual({ missingSays: true });
    expect(warned.some((line) => /^QML JsonListModel: .*missing\.json/.test(line))).toBe(true);
  });

  test("a file of broken JSON says the file, the line and the column", async ({ page }) => {
    await open(page, "jsonsource");
    await ready("broken")(page);
    expect(await model(page, "broken", ["status"])).toEqual({ status: 3 });
    expect(await read(page, ["brokenSays"])).toEqual({ brokenSays: true });
    expect(await page.evaluate(() => window.objects.broken.error)).toMatch(/broken\.json:2:\d+: /);
  });

  test("reload reads the file again, and says nothing of rows that did not change", async ({ page }) => {
    await open(page, "jsonsource");
    await ready("again")(page);
    await page.evaluate(() => window.objects.again.reload());
    await page.waitForFunction(() => window.objects.reloads === "2;1;2;1;");
    expect(await read(page, ["reloads", "againSeen"])).toEqual({ reloads: "2;1;2;1;", againSeen: "roles +0-0 count1" });
  });

  test("a new source replaces the rows of the old one by what differs", async ({ page }) => {
    await open(page, "jsonsource");
    await ready("swapped")(page);
    await page.evaluate(() => window.objects.swap());
    await page.waitForFunction(() => window.objects.swapped.count === 3 && window.objects.swapped.status === 1);
    expect(await read(page, ["swappedSeen"])).toEqual({ swappedSeen: "roles +0-1 count2 data1-1[0] +2-2 count3" });
  });

  test("a file served from another address is read", async ({ page }) => {
    await page.route("https://data.example/rows.json", (route) =>
      route.fulfill({ body: '[{"name": "a"}]', contentType: "application/json", headers: { "access-control-allow-origin": "*" } }),
    );
    await open(page, "jsonsaved");
    await page.evaluate(() => (window.objects.m.source = "https://data.example/rows.json"));
    await page.waitForFunction(() => window.objects.m.status === 1);
    expect(await model(page, "m", ["status", "count"])).toEqual({ status: 1, count: 1 });
  });
});

test.describe("a relative source in a component file", () => {
  const settled = (page) => page.waitForFunction(() => window.objects.inside && window.objects.onRoot && window.objects.resolved);

  test("is read beside that file", async ({ page }) => {
    await open(page, "jsonbeside");
    await settled(page);
    expect(await read(page, ["inside"])).toEqual({ inside: "beside the component" });
  });

  test("with Qt.resolvedUrl on its root is read beside that file", async ({ page }) => {
    await open(page, "jsonbeside");
    await settled(page);
    expect(await read(page, ["resolved"])).toEqual({ resolved: "beside the component" });
  });

  // DIVERGENCE: Ljós reads a relative url on the root of a component file
  // beside the file that uses the component (it resolves at run time,
  // against the context the object is made in). qmlc resolves a url literal
  // when it compiles, against the file it is written in, so on the web it is
  // read beside the component, as Qt.resolvedUrl would.
  test("on its root is read beside the component, where qmlc resolves it", async ({ page }) => {
    await open(page, "jsonbeside");
    await settled(page);
    expect(await read(page, ["onRoot"])).toEqual({ onRoot: "beside the component" });
  });
});

// The watched-file rule, on a dev server: each test saves a file of its own
// under `scenes/saved/`, which no module imports, and the plugin says when
// it changed.
test.describe("a file served by a dev server is read again when saved", () => {
  test.use({ told: [[/^QML JsonListModel: /, /Failed to load resource/], { option: true }] });
  const saved = join(import.meta.dirname, "scenes/saved");

  async function watched(page, name, text) {
    mkdirSync(saved, { recursive: true });
    const file = join(saved, `${name}.json`);
    writeFileSync(file, text);
    await open(page, "jsonsaved");
    await page.evaluate((name) => (window.objects.m.source = `${location.origin}/scenes/saved/${name}.json`), name);
    await page.waitForFunction(() => window.objects.m.status === 1);
    return file;
  }
  const named = (info) => `${info.project.name || "p"}-${info.title.replace(/\W+/g, "-")}-${info.workerIndex}`;

  test("a saved file changes only its rows, and nothing else is made again", async ({ page }, info) => {
    const file = await watched(page, named(info), '[{"name": "a"}, {"name": "b"}]');
    try {
      expect(await read(page, ["made"])).toEqual({ made: 2 });
      await page.evaluate(() => {
        window.objects.taps = 3;
        window.objects.statuses = "";
      });
      writeFileSync(file, '[{"name": "z"}, {"name": "b"}, {"name": "c"}]');
      await page.waitForFunction(() => window.objects.m.count === 3);
      expect(await read(page, ["first", "made", "taps"])).toEqual({ first: "z", made: 3, taps: 3 });
      // A save does not show Loading.
      expect(await read(page, ["statuses"])).toEqual({ statuses: "" });
    } finally {
      rmSync(file, { force: true });
    }
  });

  test("a file saved broken keeps the rows until it is saved whole", async ({ page }, info) => {
    const file = await watched(page, named(info), '[{"name": "a"}, {"name": "b"}]');
    try {
      writeFileSync(file, '[{"name":');
      await page.waitForFunction(() => window.objects.m.status === 3);
      expect(await model(page, "m", ["status", "count"])).toEqual({ status: 3, count: 2 });
      expect(await page.evaluate(() => window.objects.m.error)).toMatch(/\.json:\d+:\d+: /);
      writeFileSync(file, '[{"name": "a"}]');
      await page.waitForFunction(() => window.objects.m.status === 1);
      expect(await model(page, "m")).toEqual({ status: 1, count: 1, error: "" });
    } finally {
      rmSync(file, { force: true });
    }
  });

  test("a file removed keeps the rows, and is read again when it comes back", async ({ page }, info) => {
    const file = await watched(page, named(info), '[{"name": "a"}, {"name": "b"}]');
    try {
      rmSync(file);
      await page.waitForFunction(() => window.objects.m.status === 3);
      expect(await model(page, "m", ["status", "count"])).toEqual({ status: 3, count: 2 });
      writeFileSync(file, '[{"name": "a"}, {"name": "b"}, {"name": "c"}]');
      await page.waitForFunction(() => window.objects.m.status === 1 && window.objects.m.count === 3);
    } finally {
      rmSync(file, { force: true });
    }
  });
});

// `ljos-web/compiler` is given a project's files as texts: a model's source
// among them is read as given, and a compile given another text of it is a
// save of it.
test.describe("in a page that compiles QML, a source among the files given", () => {
  const MAIN = `import QtQuick
import Ljos.Models

Item {
    id: root
    property int made: 0
    property alias m: m
    JsonListModel { id: m; source: "data/rows.json" }
    Repeater {
        model: m
        delegate: Item {
            required property string name
            Component.onCompleted: root.made += 1
        }
    }
    property string first: m.count ? m.get(0).name : ""
}
`;
  const files = (rows) => ({ "Main.qml": MAIN, "data/rows.json": rows });

  test("is read as it was given, and not fetched", async ({ page }) => {
    const asked = [];
    page.on("request", (request) => request.url().includes("/data/rows.json") && asked.push(request.url()));
    await page.goto("/compiler.html");
    await page.waitForFunction(() => window.ready);
    const made = await page.evaluate((request) => window.show(request), { files: files('[{"name": "given"}, {"name": "b"}]'), entry: "Main.qml" });
    expect(made).toMatchObject({ mounted: true });
    await page.waitForFunction(() => window.objects.m.status === 1);
    expect(await read(page, ["first", "made"])).toEqual({ first: "given", made: 2 });
    expect(asked).toEqual([]);
  });

  test("given another text by a compile changes only its rows", async ({ page }) => {
    await page.goto("/compiler.html");
    await page.waitForFunction(() => window.ready);
    await page.evaluate((request) => window.show(request), { files: files('[{"name": "a"}, {"name": "b"}]'), entry: "Main.qml" });
    await page.waitForFunction(() => window.objects.m.status === 1);
    // Compiled again, not mounted again: what is mounted reads the new text.
    const again = await page.evaluate((request) => window.compiler.compile(request).then((made) => !made.diagnostics), {
      files: files('[{"name": "z"}, {"name": "b"}, {"name": "c"}]'),
      entry: "Main.qml",
    });
    expect(again).toBe(true);
    await page.waitForFunction(() => window.objects.m.count === 3);
    expect(await read(page, ["first", "made"])).toEqual({ first: "z", made: 3 });
  });
});

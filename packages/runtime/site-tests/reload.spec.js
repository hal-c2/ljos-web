// What a reload keeps of what was assigned (site-ljos/features/reload.feature),
// through `reload` as a page calls it, between compiled versions of one file:
// built with no places, and with the places `inspect` reads, minified as a
// site is and not, as a dev server's are.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { build } from "vite";
import qml from "../vite.js";
import { qmlc } from "./bundle.js";
import { expect, part, serve, shared, test } from "./served.js";

const runtime = join(import.meta.dirname, "..");

const BOARD = `import QtQuick
import "../../parts"

Item {
    id: root
    property var items: []
    property var lookup: ({})
    property var nested: ({ rows: [{ id: 1, tags: ["a"] }], limit: 2 })
    property var seeded: []
    property int count: 1
    property int total: count + 1
    function pair(place, make) { return make() }
    property var paired: pair(["Board.qml", 1, 2], () => 1)
    property alias part: part
    Component.onCompleted: if (seeded.length === 0) seeded.push("made")

    Part {
        id: part
        given: ["given"]
    }
}
`;

function edited(text, ...edits) {
  for (const [from, to] of edits) {
    if (text.split(from).length !== 2) throw new Error(`the board says "${from}" other than once`);
    text = text.replace(from, () => to);
  }
  return text;
}

const shifted = (text) => edited(text, ["Item {\n    id: root", "// A line above.\n// And another.\nItem {\n    id: root"]);
const changed = edited(
  BOARD,
  ["items: []", 'items: ["edited"]'],
  ["lookup: ({})", "lookup: ({ edited: true })"],
  ['tags: ["a"]', 'tags: ["z"]'],
  ["total: count + 1", "total: count + 2"],
  ['given: ["given"]', 'given: ["given again"]'],
);
// One file's saves: each is a module of its own, as each save is.
const VERSIONS = {
  base: BOARD,
  same: BOARD,
  again: BOARD,
  edited: changed,
  shifted: shifted(BOARD),
  shiftedEdited: shifted(changed),
  mutated: edited(BOARD, ["items: []", 'items: ["b"]'], ["lookup: ({})", "lookup: ({ b: 1 })"]),
  keys: edited(BOARD, ["lookup: ({})", "lookup: ({ gone: undefined })"]),
  seeded: edited(BOARD, ["seeded: []", 'seeded: ["made"]']),
  paired: edited(BOARD, ['["Board.qml", 1, 2]', '["Board.qml", 1, 3]']),
};

const FILES = {
  "index.html": '<!doctype html><script type="module" src="/main.js"></script>',
  "parts/Part.qml": 'import QtQuick\nItem {\n    property var own: ["own"]\n    property var given: []\n}\n',
  "parts/Subject.qml": "import QtQuick\nItem {\n    property var value\n}\n",
  ...Object.fromEntries(Object.entries(VERSIONS).map(([name, text]) => [`versions/${name}/Board.qml`, text])),
  "main.js": [
    `import { mount } from ${JSON.stringify(join(runtime, "object.ts"))};`,
    `import { reload } from ${JSON.stringify(join(runtime, "reload.js"))};`,
    'import Subject from "./parts/Subject.qml";',
    ...Object.keys(VERSIONS).map((name) => `import ${name} from "./versions/${name}/Board.qml";`),
    `const boards = { ${Object.keys(VERSIONS).join(", ")} };`,
    "const opened = (Component) => {",
    '  const host = document.body.appendChild(document.createElement("div"));',
    "  const handle = mount(Component, host, {}, { reloadable: true });",
    "  return { get root() { return handle.object; }, to: (next) => reload(handle, next) };",
    "};",
    "window.board = (name) => {",
    "  const app = opened(boards[name]);",
    "  return { get root() { return app.root; }, save: (next) => app.to(boards[next]) };",
    "};",
    "// Whether what was assigned stays when one declared value gives way to another.",
    "window.stays = (before, after, between = () => {}) => {",
    "  const app = opened((props) => Subject({ ...props, value: before() }));",
    '  app.root.value = "mine";',
    "  between();",
    "  app.to((props) => Subject({ ...props, value: after() }));",
    '  return app.root.value === "mine";',
    "};",
    "",
  ].join("\n"),
};

const BUILDS = [
  { name: "with no places", inspect: false, minify: true },
  { name: "with places, minified", inspect: true, minify: true },
  { name: "with places, not minified", inspect: true, minify: false },
];

for (const built of BUILDS) {
  test.describe(`a reload, built ${built.name}`, () => {
    test.describe.configure({ mode: "default" });
    let place;
    let server;

    test.beforeAll(shared("build the page and serve it", async () => {
      place = realpathSync(mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-reload-")));
      const app = join(place, "app");
      for (const [name, text] of Object.entries(FILES)) {
        const file = join(app, name);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, text);
      }
      // Each version of the board is the same file to whoever is told of it.
      const inspect = built.inspect && ((file) => (basename(file) === "Board.qml" ? "Board.qml" : true));
      await part("build the page", () =>
        build({
          configFile: false,
          root: app,
          base: "./",
          logLevel: "error",
          plugins: [qml({ qmlc, root: app, inspect })],
          build: { outDir: join(place, "out"), target: "esnext", minify: built.minify, chunkSizeWarningLimit: 4000 },
        }),
      );
      server = await part("serve it", () => serve(join(place, "out")));
    }));

    test.afterAll(shared("stop serving it and remove the page", async () => {
      await part("stop serving it", () => server?.stop());
      if (place) rmSync(place, { recursive: true, force: true });
    }));

    test.beforeEach(async ({ page }) => {
      await page.goto(`${server.origin}/`);
      await page.waitForFunction(() => typeof window.board === "function");
    });

    test("an assigned list or object survives an unchanged declaration", async ({ page }) => {
      const got = await page.evaluate(() => {
        const app = window.board("base");
        app.root.items = ["mine"];
        app.root.lookup = { mine: true };
        app.root.nested = "mine";
        app.root.part.own = ["mine"];
        app.root.part.given = ["mine"];
        app.save("same");
        const read = () => ({ items: app.root.items, lookup: app.root.lookup, nested: app.root.nested, own: app.root.part.own, given: app.root.part.given });
        const once = read();
        app.save("again");
        return { once, twice: read() };
      });
      const mine = { items: ["mine"], lookup: { mine: true }, nested: "mine", own: ["mine"], given: ["mine"] };
      expect.soft(got.once).toEqual(mine);
      expect.soft(got.twice).toEqual(mine);
    });

    test("an assigned list or object that holds an old object holds the new one", async ({ page }) => {
      const got = await page.evaluate(() => {
        const app = window.board("base");
        const old = app.root.part;
        const ring = [old];
        ring.push(ring);
        app.root.items = ring;
        app.root.lookup = { deep: { part: old }, rows: [old] };
        app.save("same");
        const items = app.root.items;
        const lookup = app.root.lookup;
        const part = app.root.part;
        return {
          ring: items[0] === part && items[1] === items,
          deep: lookup.deep.part === part,
          rows: lookup.rows[0] === part,
        };
      });
      expect(got).toEqual({ ring: true, deep: true, rows: true });
    });

    test("an assignment survives the app changing the declared value in place", async ({ page }) => {
      const got = await page.evaluate(() => {
        const other = window.board("base");
        other.root.items.push("b");
        other.root.items = ["mine"];
        other.root.seeded = ["mine"];
        other.save("same");
        const itself = window.board("base");
        const items = itself.root.items;
        items.push("b");
        itself.root.items = items;
        itself.save("same");
        return { other: other.root.items, seeded: other.root.seeded, itself: itself.root.items };
      });
      expect.soft(got.other, "another value").toEqual(["mine"]);
      expect.soft(got.seeded, "changed as it was made").toEqual(["mine"]);
      expect.soft(got.itself, "the declared value itself").toEqual(["b"]);
    });

    test("an edited declaration wins", async ({ page }) => {
      const got = await page.evaluate(() => {
        const app = window.board("base");
        app.root.items = ["mine"];
        app.root.lookup = { mine: true };
        app.root.nested = "mine";
        app.root.total = 41;
        app.root.part.given = ["mine"];
        app.save("edited");
        const keys = window.board("base");
        keys.root.lookup = { mine: true };
        keys.save("keys");
        const paired = window.board("base");
        paired.root.paired = "mine";
        paired.save("paired");
        const { root } = app;
        return {
          items: root.items,
          lookup: root.lookup,
          tags: root.nested.rows?.[0].tags,
          total: root.total,
          given: root.part.given,
          keys: Object.keys(keys.root.lookup),
          paired: paired.root.paired,
        };
      });
      expect.soft(got.items).toEqual(["edited"]);
      expect.soft(got.lookup).toEqual({ edited: true });
      expect.soft(got.tags).toEqual(["z"]);
      expect.soft(got.total).toBe(3);
      expect.soft(got.given).toEqual(["given again"]);
      expect.soft(got.keys, "a key with nothing in it").toEqual(["gone"]);
      expect.soft(got.paired, "numbers in the app's own call").toBe(1);
    });

    test("an edit to what the app made of the declared value wins", async ({ page }) => {
      const got = await page.evaluate(() => {
        const other = window.board("base");
        other.root.items.push("b");
        other.root.lookup.b = 1;
        other.root.items = ["mine"];
        other.root.lookup = { mine: true };
        other.save("mutated");
        const itself = window.board("base");
        const items = itself.root.items;
        items.push("b");
        itself.root.items = items;
        itself.save("mutated");
        const asMade = window.board("base");
        asMade.root.seeded = ["mine"];
        asMade.save("seeded");
        return {
          items: other.root.items,
          lookup: other.root.lookup,
          itself: itself.root.items,
          anew: itself.root.items !== items,
          seeded: asMade.root.seeded,
        };
      });
      expect.soft(got.items).toEqual(["b"]);
      expect.soft(got.lookup).toEqual({ b: 1 });
      expect.soft(got.itself).toEqual(["b"]);
      expect.soft(got.anew, "the file's own list, not the old one").toBe(true);
      expect.soft(got.seeded, "changed as it was made").toEqual(["made"]);
    });

    test("an unchanged declaration with no assignment is the new object's own", async ({ page }) => {
      const got = await page.evaluate(() => {
        const app = window.board("base");
        const { items, lookup } = app.root;
        items.push("b");
        lookup.b = 1;
        app.save("same");
        return {
          items: app.root.items,
          lookup: app.root.lookup,
          apart: app.root.items !== items && app.root.lookup !== lookup,
        };
      });
      expect.soft(got.items).toEqual([]);
      expect.soft(got.lookup).toEqual({});
      expect.soft(got.apart, "no object of the old tree's").toBe(true);
    });

    test("an edit that only shifts a line keeps what was assigned", async ({ page }) => {
      const got = await page.evaluate(() => {
        const app = window.board("base");
        app.root.items = ["mine"];
        app.root.lookup = { mine: true };
        app.root.count = 7;
        app.root.total = 41;
        app.root.part.given = ["mine"];
        app.save("shifted");
        const { root } = app;
        return { items: root.items, lookup: root.lookup, count: root.count, total: root.total, given: root.part.given };
      });
      expect.soft(got.items).toEqual(["mine"]);
      expect.soft(got.lookup).toEqual({ mine: true });
      expect.soft(got.count).toBe(7);
      expect.soft(got.total).toBe(41);
      expect.soft(got.given).toEqual(["mine"]);
    });

    test("an edit in a save that shifts lines still wins", async ({ page }) => {
      const got = await page.evaluate(() => {
        const app = window.board("base");
        app.root.items = ["mine"];
        app.root.total = 41;
        app.root.part.given = ["mine"];
        app.save("shiftedEdited");
        return { items: app.root.items, total: app.root.total, given: app.root.part.given };
      });
      expect.soft(got.items).toEqual(["edited"]);
      expect.soft(got.total).toBe(3);
      expect.soft(got.given).toEqual(["given again"]);
    });

    // Values handed to a component as they are, which no build rewrites.
    if (built.inspect) return;

    test("plain values that are equal are the same declaration", async ({ page }) => {
      const got = await page.evaluate(() => {
        const { stays } = window;
        const instance = new (class Point { x = 1; })();
        const run = () => 1;
        // Each level holds the one below twice: 2^28 ways down, 28 objects.
        const diamond = () => {
          let value = { end: true };
          for (let level = 0; level < 28; level++) value = { left: value, right: value };
          return value;
        };
        return {
          nested: stays(() => [1, { a: [2, NaN] }], () => [1, { a: [2, NaN] }]),
          noPrototype: stays(() => Object.assign(Object.create(null), { a: 1 }), () => Object.assign(Object.create(null), { a: 1 })),
          sharedInside: stays(() => diamond(), () => diamond()),
          instanceInside: stays(() => ({ at: instance }), () => ({ at: instance })),
          functionInside: stays(() => [run], () => [run]),
        };
      });
      for (const [name, kept] of Object.entries(got)) expect.soft(kept, name).toBe(true);
    });

    test("plain values that differ are an edit", async ({ page }) => {
      const got = await page.evaluate(() => {
        const { stays } = window;
        return {
          keys: stays(() => ({ a: undefined }), () => ({ b: undefined })),
          fewerKeys: stays(() => ({ a: undefined }), () => ({})),
          keyOrder: stays(() => ({ a: 1, b: 2 }), () => ({ b: 2, a: 1 })),
          symbolKey: stays(() => ({ [Symbol()]: 1 }), () => ({})),
          hole: stays(() => new Array(1), () => [undefined]),
          zero: stays(() => [0], () => [-0]),
          arrayOrText: stays(() => [1, 2], () => "1,2"),
          arrayOrObject: stays(() => [], () => ({})),
          prototype: stays(() => ({}), () => Object.create(null)),
        };
      });
      for (const [name, kept] of Object.entries(got)) expect.soft(kept, name).toBe(false);
    });

    test("what is not plain data is the same only as itself", async ({ page }) => {
      const got = await page.evaluate(() => {
        const { stays } = window;
        class Point { x = 1; }
        const cycle = () => {
          const value = { name: "cycle" };
          value.self = value;
          return value;
        };
        const deep = () => {
          let value = [];
          for (let level = 0; level < 100_000; level++) value = [value];
          return value;
        };
        let reads = 0;
        const accessor = () => ({ get read() { return ++reads; } });
        const instance = new Point();
        const round = cycle();
        const changed = { a: 1 };
        return {
          other: {
            cycle: stays(cycle, cycle),
            cycleInside: stays(() => [cycle()], () => [cycle()]),
            instance: stays(() => new Point(), () => new Point()),
            date: stays(() => new Date(0), () => new Date(0)),
            map: stays(() => new Map(), () => new Map()),
            bytes: stays(() => new Uint8Array(2), () => new Uint8Array(2)),
            functionInside: stays(() => [() => 1], () => [() => 1]),
            accessor: stays(accessor, accessor),
            tooDeep: stays(deep, deep),
            functionEdited: stays(() => () => 1, () => () => 2),
          },
          itself: {
            instance: stays(() => instance, () => instance),
            cycle: stays(() => round, () => round),
            changedBetween: stays(() => changed, () => changed, () => (changed.a = 2)),
            functionText: stays(() => () => 1, () => () => 1),
          },
          reads,
        };
      });
      for (const [name, kept] of Object.entries(got.other)) expect.soft(kept, `another ${name}`).toBe(false);
      for (const [name, kept] of Object.entries(got.itself)) expect.soft(kept, `the same ${name}`).toBe(true);
      expect.soft(got.reads, "an accessor run").toBe(0);
    });
  });
}

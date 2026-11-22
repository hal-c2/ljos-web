// A reload leaves out where a binding is written only where the compiler
// wrote it (site-ljos/features/reload.feature): a call of the app's own at
// the head of a getter, shaped like a place, is read whole. Each is built
// with no places, and with places both minified and not.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { build } from "vite";
import qml from "../vite.js";
import { qmlc } from "./bundle.js";
import { expect, part, serve, shared, test } from "./served.js";

const runtime = join(import.meta.dirname, "..");

// Where the app's own call says: the base, an edit to the line alone and
// one to the column alone.
const SAID = { base: [1, 2], same: [1, 2], line: [7, 2], column: [1, 9] };

// A placed file around one that is not: what `Plain` binds is the head of
// its own getter, with no `$bound` before it. An attached property's value
// is not wrapped either, though its file is placed and the call names it.
const board = ([line, column]) => `import QtQuick
import QtQuick.Layouts

ColumnLayout {
    property alias plain: plain

    function wideWidth() {
        return wide.Layout.preferredWidth
    }

    function setWide(width) {
        wide.Layout.preferredWidth = width
    }

    Plain {
        id: plain
    }

    Item {
        id: wide
        Layout.preferredWidth: Number(["Board.qml", ${line}, ${column}], () => 1)
    }
}
`;
const plain = ([line, column]) => `import QtQuick

Item {
    property var head: String(["Board.qml", ${line}, ${column}], () => 1)
}
`;

const FILES = {
  "index.html": '<!doctype html><script type="module" src="/main.js"></script>',
  "parts/Subject.qml": "import QtQuick\nItem {\n    property var value\n}\n",
  ...Object.fromEntries(
    Object.entries(SAID).flatMap(([name, at]) => [
      [`versions/${name}/Board.qml`, board(at)],
      [`versions/${name}/Plain.qml`, plain(at)],
    ]),
  ),
  "main.js": [
    `import { mount } from ${JSON.stringify(join(runtime, "object.ts"))};`,
    `import { reload } from ${JSON.stringify(join(runtime, "reload.js"))};`,
    'import Subject from "./parts/Subject.qml";',
    ...Object.keys(SAID).map((name) => `import ${name} from "./versions/${name}/Board.qml";`),
    `const boards = { ${Object.keys(SAID).join(", ")} };`,
    "// Props written by hand with a place of their own, naming another file",
    "// than the call at their getter's head says. The numbers are written",
    "// out, as a compiler's would be.",
    "const handed = {",
    ...Object.entries(SAID).map(
      ([name, [line, column]]) =>
        `  ${name}: (props) => Subject({ ...props, $at: ["Board.qml", 1, 1, "Item"], get value() { return String(["Other.qml", ${line}, ${column}], () => 1); } }),`,
    ),
    "};",
    "const opened = (Component) => {",
    '  const host = document.body.appendChild(document.createElement("div"));',
    "  const handle = mount(Component, host, {}, { reloadable: true });",
    "  return { get root() { return handle.object; }, to: (next) => reload(handle, next) };",
    "};",
    "// What an assignment is after a save of `next`.",
    "window.plainAfter = (next) => {",
    "  const app = opened(boards.base);",
    '  app.root.plain.head = "mine";',
    "  app.to(boards[next]);",
    "  return app.root.plain.head;",
    "};",
    "window.attachedAfter = (next) => {",
    "  const app = opened(boards.base);",
    "  app.root.setWide(42);",
    "  app.to(boards[next]);",
    "  return String(app.root.wideWidth());",
    "};",
    "window.handedAfter = (next) => {",
    "  const app = opened(handed.base);",
    '  app.root.value = "mine";',
    "  app.to(handed[next]);",
    "  return app.root.value;",
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
  test.describe(`a reload and a call shaped like a place, built ${built.name}`, () => {
    test.describe.configure({ mode: "default" });
    let place;
    let server;

    test.beforeAll(shared("build the page and serve it", async () => {
      place = realpathSync(mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-reload-places-")));
      const app = join(place, "app");
      for (const [name, text] of Object.entries(FILES)) {
        const file = join(app, name);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, text);
      }
      // Each version of the board is the same file to whoever is told of
      // it, and `Plain` is compiled without places.
      const inspect =
        built.inspect &&
        ((file) => {
          if (basename(file) === "Plain.qml") return false;
          return basename(file) === "Board.qml" ? "Board.qml" : true;
        });
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
      await page.waitForFunction(() => typeof window.plainAfter === "function");
    });

    test("an unchanged call at a getter's head keeps what was assigned", async ({ page }) => {
      const got = await page.evaluate(() => ({
        plain: window.plainAfter("same"),
        attached: window.attachedAfter("same"),
        handed: window.handedAfter("same"),
      }));
      expect.soft(got.plain, "in a file compiled without places").toBe("mine");
      expect.soft(got.attached, "an attached property's value").toBe("42");
      expect.soft(got.handed, "in props written by hand").toBe("mine");
    });

    test("an edit to the line or the column alone of such a call wins", async ({ page }) => {
      const got = await page.evaluate(() => ({
        plainLine: window.plainAfter("line"),
        plainColumn: window.plainAfter("column"),
        attachedLine: window.attachedAfter("line"),
        attachedColumn: window.attachedAfter("column"),
        handedLine: window.handedAfter("line"),
        handedColumn: window.handedAfter("column"),
      }));
      expect.soft(got.plainLine, "the line, in a file compiled without places").toBe("Board.qml,7,2");
      expect.soft(got.plainColumn, "the column, in a file compiled without places").toBe("Board.qml,1,9");
      // `Number` of the call is NaN whatever it says: the file's value is
      // told from the assigned 42 by being it.
      expect.soft(got.attachedLine, "the line, of an attached property's value").toBe("NaN");
      expect.soft(got.attachedColumn, "the column, of an attached property's value").toBe("NaN");
      expect.soft(got.handedLine, "the line, in props written by hand").toBe("Other.qml,7,2");
      expect.soft(got.handedColumn, "the column, in props written by hand").toBe("Other.qml,1,9");
    });
  });
}

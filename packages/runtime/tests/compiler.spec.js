// QML compiled in the page (`ljos-web/compiler`): what `qmlc` makes of a
// project, from its files as texts, run against the modules the page has.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test as plain } from "@playwright/test";
import { modules } from "../compiler/modules.js";
import { expect, rect, test } from "./open.js";

const scenes = join(import.meta.dirname, "scenes");
const qmlc = process.env.QMLC ?? join(import.meta.dirname, "../../../target/debug/qmlc");
const COMPILER = /ljos_web_compiler\.wasm|\/compiler\/link\.js/;

// The scenes' directory as a project's files: its texts by path.
function project() {
  const files = {};
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(qml|js|mjs|json|conf)$|^qmldir$/.test(name)) files[relative(scenes, path)] = readFileSync(path, "utf8");
    }
  };
  walk(scenes);
  return files;
}

// What `qmlc --root scenes` prints for `file`, with no Qt installed.
function native(file) {
  const env = { ...process.env, QT_INSTALL_QML: join(scenes, "no-qt-here") };
  delete env.QML_IMPORT_PATH;
  return execFileSync(qmlc, ["--root", scenes, join(scenes, file)], { env, encoding: "utf8" }).replace(/\n$/, "");
}

// The compiler's requests a page made.
function fetched(page) {
  const seen = [];
  page.on("request", (request) => COMPILER.test(request.url()) && seen.push(request.url()));
  return seen;
}

async function opened(page) {
  await page.goto("/compiler.html");
  await page.waitForFunction(() => window.ready);
}

const show = (page, request) => page.evaluate((request) => window.show(request), request);

plain("compiled QML may import every module the runtime package exports", () => {
  const { exports } = JSON.parse(readFileSync(join(import.meta.dirname, "../package.json"), "utf8"));
  const kept = Object.entries(exports)
    // Host-only modules are no part of what compiled QML imports: the
    // build plugin, the site builder, the compiler itself, the faces'
    // seam, the prerender's server side, the Markdown content source a
    // site's build reads, and the code blocks' build and page halves (an
    // editor a page mounts, not a QML module).
    .filter(
      ([, file]) =>
        file.endsWith(".js") &&
        !["./vite.js", "./site.js", "./server.js", "./compiler/index.js", "./compiler/modules.js", "./web/faces.js", "./markdown.js"].includes(file) &&
        !file.startsWith("./codeblocks/"),
    )
    .map(([name]) => name.replace(/^\./, "ljos-web"));
  expect(Object.keys(modules).sort()).toEqual(["solid-js", ...kept].sort());
});

test("a page that never compiles fetches no compiler", async ({ page }) => {
  const seen = fetched(page);
  // One that never imports it, and one that does and has not compiled yet.
  await page.goto("/?scene=components");
  await page.waitForFunction(() => window.ready);
  await opened(page);
  await page.waitForLoadState("networkidle");
  expect(seen).toEqual([]);
});

test("a compile in the page is what qmlc makes of the same files", async ({ page }) => {
  await opened(page);
  const files = project();
  for (const entry of ["components.qml", "singletons.qml", "through.qml", "kinds.qml"]) {
    const made = await page.evaluate((request) => window.compiler.translate(request), { files, entry });
    expect(made.diagnostics, entry).toBeUndefined();
    expect(made.modules.length, `${entry} compiles with the files it imports`).toBeGreaterThan(1);
    for (const { file, code } of made.modules) expect(code, file).toBe(native(file));
  }
});

test("QML compiled in the page mounts on the modules the page has", async ({ page }) => {
  await opened(page);
  expect(await show(page, { files: project(), entry: "components.qml" })).toMatchObject({ mounted: true });
  const read = await page.evaluate(() => {
    const { first, second } = window.objects;
    return [first.title, first.padding, first.width, second.title, second.padding, second.width, second.x];
  });
  expect(read).toEqual(["first", 20, 200, "untitled", 10, 100, 200]);
  expect(await rect(page, "first")).toEqual({ x: 0, y: 0, width: 200, height: 80 });
});

// The page's `flush` is the kernel the compiled bindings are in.
test("a singleton compiled in the page is one object for every file", async ({ page }) => {
  await opened(page);
  expect(await show(page, { files: project(), entry: "singletons.qml" })).toMatchObject({ mounted: true });
  expect(await rect(page, "first")).toEqual({ x: 0, y: 0, width: 40, height: 10 });
  await page.evaluate(() => {
    window.scene.theme.grid = 25;
    window.flush();
  });
  expect(await rect(page, "first")).toEqual({ x: 0, y: 0, width: 100, height: 25 });
  expect(await rect(page, "second")).toEqual({ x: 100, y: 0, width: 25, height: 50 });
});

test("a syntax error is a diagnostic with its file, line and column", async ({ page }) => {
  await opened(page);
  const files = {
    "Main.qml": "import QtQuick\nItem { Panel { } }\n",
    "Panel.qml": "import QtQuick\nRectangle {\n    width: 10 +\n}\n",
  };
  const made = await show(page, { files, entry: "Main.qml" });
  expect(made.diagnostics[0]).toEqual({
    file: "Panel.qml",
    line: 4,
    column: 1,
    endLine: 4,
    endColumn: 2,
    message: expect.any(String),
    severity: "error",
    code: "syntax",
  });
});

// features/language/lts-modules.feature, and match.feature: the sugar a
// match is lowered to is the page's, and a match no arm fits says so as
// `ljos run` does.
test("a match in an .lts module compiled in the page runs on the page's sugar", async ({ page }) => {
  await opened(page);
  const files = {
    "Main.qml": 'import QtQuick\nimport "size.lts" as Size\nItem {\n    property int big: Size.size("big")\n    function sized(name) { return Size.size(name) }\n}\n',
    "size.lts": 'export function size(name: string): number {\n  return match (name) {\n    when "big": 2;\n    when "small": 1;\n  } |> % * 10\n}\n',
  };
  expect(await show(page, { files, entry: "Main.qml" })).toMatchObject({ mounted: true });
  expect(await page.evaluate(() => [window.scene.big, window.scene.sized("small")])).toEqual([20, 10]);
  expect(await page.evaluate(() => {
    try {
      return window.scene.sized("huge");
    } catch (error) {
      return `${error.name}: ${error.message}`;
    }
  })).toBe('TypeError: no arm of the `match` matches "huge"');
});

test("an export a module reassigns is read as it is now, by a file and by a module that import it", async ({ page }) => {
  await opened(page);
  const files = {
    "Main.qml": 'import QtQuick\nimport "count.lts" as Count\nimport "tally.ts" as Tally\nItem {\n    function bump() { return Tally.bumped() }\n    function now() { return Count.count }\n}\n',
    "count.lts": "export let count: number = 0;\nexport function inc(): void {\n  count += 1;\n}\n",
    "tally.ts": 'import { count, inc } from "./count.lts";\nexport function bumped(): number {\n  inc();\n  return count;\n}\n',
  };
  expect(await show(page, { files, entry: "Main.qml" })).toMatchObject({ mounted: true });
  expect(await page.evaluate(() => [window.scene.bump(), window.scene.bump(), window.scene.now()])).toEqual([1, 2, 2]);
});

test("modules that import each other run, each with the other's names", async ({ page }) => {
  await opened(page);
  const files = {
    "Main.qml": 'import QtQuick\nimport "even.lts" as Even\nItem {\n    function parities() { return [Even.even(4), Even.even(7)] }\n}\n',
    "even.lts": 'import { odd } from "./odd.lts";\nexport function even(n: number): boolean {\n  return n === 0 ? true : odd(n - 1);\n}\n',
    "odd.lts": 'import { even } from "./even.lts";\nexport function odd(n: number): boolean {\n  return n === 0 ? false : even(n - 1);\n}\n',
  };
  expect(await show(page, { files, entry: "Main.qml" })).toMatchObject({ mounted: true });
  expect(await page.evaluate(() => window.scene.parities())).toEqual([true, false]);
});

test("the new syntax in a .ts module is a diagnostic that names the rename", async ({ page }) => {
  await opened(page);
  const files = {
    "Main.qml": 'import QtQuick\nimport "size.ts" as Size\nItem { property int big: Size.size("big") }\n',
    "size.ts": 'export function size(name: string): number {\n  return match (name) {\n    when "big": 2;\n    default: 1;\n  }\n}\n',
  };
  expect((await show(page, { files, entry: "Main.qml" })).diagnostics).toEqual([
    {
      file: "size.ts",
      line: 2,
      column: 10,
      endLine: 2,
      endColumn: 15,
      message: "`match` is Ljós syntax, which stock TypeScript tools cannot read in a `.ts` file; rename `size.ts` to `size.lts`",
      severity: "error",
      code: "ts-lts-syntax",
    },
  ]);
});

test("an unknown module is a diagnostic where it is imported", async ({ page }) => {
  await opened(page);
  const files = { "Main.qml": "import QtQuick\nimport No.Such.Module\n\nItem { }\n" };
  const made = await show(page, { files, entry: "Main.qml" });
  expect(made.diagnostics).toEqual([
    { file: "Main.qml", line: 2, column: 1, endLine: 2, endColumn: 22, message: 'module "No.Such.Module" is not installed', severity: "error" },
  ]);
});

test("Qt Quick Controls a page was not built with is a diagnostic naming requests 13 and 36", async ({ page }) => {
  await opened(page);
  const files = { "Main.qml": "import QtQuick\nimport QtQuick.Controls\nItem { Button { } }\n" };
  const made = await show(page, { files, entry: "Main.qml" });
  expect(made.diagnostics).toEqual([
    {
      file: "Main.qml",
      line: 2,
      column: 1,
      endLine: 2,
      endColumn: 24,
      message: expect.stringMatching(/QtQuick\.Controls.*requests 13 and 36/),
      severity: "error",
    },
  ]);
});

test("an aliased module is the directory it names", async ({ page }) => {
  await opened(page);
  const files = {
    "Main.qml": "import QtQuick\nimport App.Media\nItem {\n    property alias player: player\n    Player { id: player }\n}\n",
    "src/media/qmldir": "module App.Media\nPlayer 1.0 Player.qml\n",
    "src/media/Player.qml": 'import QtQuick\nRectangle { width: 30; height: 20; color: "blue" }\n',
  };
  const made = await show(page, { files, entry: "Main.qml", aliases: [{ module: "App.Media", dir: "src/media" }] });
  expect(made).toMatchObject({ mounted: true });
  expect(await rect(page, "player")).toEqual({ x: 0, y: 0, width: 30, height: 20 });
});

test("a second compile reuses the compiler the first loaded", async ({ page }) => {
  const seen = fetched(page);
  await opened(page);
  const files = { "Main.qml": "import QtQuick\nRectangle { width: 10; height: 10 }\n" };
  expect(await show(page, { files, entry: "Main.qml" })).toMatchObject({ mounted: true });
  expect(await show(page, { files: { ...files, "Main.qml": files["Main.qml"].replace("10;", "20;") }, entry: "Main.qml" })).toMatchObject({
    mounted: true,
  });
  expect(await page.evaluate(() => window.scene.width)).toBe(20);
  expect(seen.filter((url) => url.endsWith(".wasm"))).toHaveLength(1);
  expect(seen.filter((url) => url.endsWith("link.js"))).toHaveLength(1);
});

// A project whose types are written in Rust, as its `ljostypes.json`
// files describe them (`scenes/dumped`).
const dumped = (more = {}) => {
  const files = Object.fromEntries(
    Object.entries(project())
      .filter(([path]) => path.startsWith("dumped/"))
      .map(([path, text]) => [path.slice("dumped/".length), text]),
  );
  return { ...files, ...more };
};

test("a type the project's dump describes stands in, compiled in the page", async ({ page }) => {
  await opened(page);
  expect(await show(page, { files: dumped(), entry: "Main.qml" })).toMatchObject({ mounted: true });
  expect(await page.evaluate(() => window.scene.read())).toEqual(["Volume 3", 3, "", 1, undefined, []]);
  await page.evaluate(() => {
    window.scene.give(7);
    window.flush();
  });
  expect(await page.evaluate(() => window.scene.read()[0])).toBe("Volume 7");
});

test("the dumps of a project run as one, compiled in the page", async ({ page }) => {
  await opened(page);
  expect(await show(page, { files: dumped(), entry: "Both.qml" })).toMatchObject({ mounted: true });
  expect(await page.evaluate(() => window.scene.read())).toBe("Volume 4, level 9, its volume 2");
});

test("a dump that does not read is a diagnostic naming it", async ({ page }) => {
  await opened(page);
  const made = await show(page, { files: dumped({ "native/ljostypes.json": '{"format": 2, "modules": [\n' }), entry: "Main.qml" });
  expect(made.diagnostics).toEqual([
    { file: "native/ljostypes.json", line: 2, column: 1, endLine: 2, endColumn: 1, message: "EOF while parsing a list", severity: "error" },
  ]);
});

test("the dumps a compile is given are the ones it reads", async ({ page }) => {
  await opened(page);
  const files = dumped();
  const one = { ...files, "rust/player.json": files["native/ljostypes.json"] };
  delete one["native/ljostypes.json"];
  delete one["sensors/ljostypes.json"];
  expect(await show(page, { files: one, entry: "Main.qml", types: ["rust/player.json"] })).toMatchObject({ mounted: true });
  const none = await show(page, { files, entry: "Main.qml", types: [] });
  expect(none.diagnostics).toEqual([
    { file: "Main.qml", line: 2, column: 1, endLine: 2, endColumn: 17, message: 'module "App.Media" is not installed', severity: "error" },
  ]);
});

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
    .filter(([, file]) => file.endsWith(".js") && !["./vite.js", "./site.js", "./compiler/index.js"].includes(file))
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
  expect(made.diagnostics[0]).toEqual({ file: "Panel.qml", line: 4, column: expect.any(Number), message: expect.any(String) });
});

test("an unknown module is a diagnostic where it is imported", async ({ page }) => {
  await opened(page);
  const files = { "Main.qml": "import QtQuick\nimport No.Such.Module\n\nItem { }\n" };
  const made = await show(page, { files, entry: "Main.qml" });
  expect(made.diagnostics).toEqual([{ file: "Main.qml", line: 2, column: 1, message: 'module "No.Such.Module" is not installed' }]);
});

test("Qt Quick Controls a page was not built with is a diagnostic naming requests 13 and 36", async ({ page }) => {
  await opened(page);
  const files = { "Main.qml": "import QtQuick\nimport QtQuick.Controls\nItem { Button { } }\n" };
  const made = await show(page, { files, entry: "Main.qml" });
  expect(made.diagnostics).toEqual([
    { file: "Main.qml", line: 2, column: 1, message: expect.stringMatching(/QtQuick\.Controls.*requests 13 and 36/) },
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

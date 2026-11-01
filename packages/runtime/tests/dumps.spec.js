// The types a program registers from Rust, as its `ljostypes.json` describes
// them, standing in on the page as `ljos run --types` makes them natively
// (`scenes/dumped`, whose root is its own project).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test as plain } from "@playwright/test";
import { createServer } from "vite";
import qml from "../vite.js";
import { expect, open, test } from "./open.js";

const qmlc = process.env.QMLC ?? join(import.meta.dirname, "../../../target/debug/qmlc");
const read = (page) => page.evaluate(() => window.scene.read());

test("a type the project's dump describes stands in", async ({ page }) => {
  await open(page, "dumped");
  // What it is given, what it says it has, its enum, and a method that
  // does nothing.
  expect(await read(page)).toEqual(["Volume 3", 3, "", 1, undefined, []]);
  await page.evaluate(() => window.scene.finish(42));
  expect((await read(page))[5]).toEqual([42]);
});

test("an edit to what is given the stand-in shows at once", async ({ page }) => {
  await open(page, "dumped");
  await page.evaluate(() => {
    window.scene.give(7);
    window.flush();
  });
  expect((await read(page))[0]).toBe("Volume 7");
});

test("the dumps of a project run as one", async ({ page }) => {
  await open(page, "dumpedboth");
  expect(await read(page)).toBe("Volume 4, level 9, its volume 2");
});

// A project of its own, as a preview server writes one, compiled by a dev
// server the way such a server asks for it.
async function compiling(files, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ljos-web-dumps-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  const server = await createServer({
    configFile: false,
    root: dir,
    logLevel: "silent",
    server: { middlewareMode: true, hmr: false, watch: null },
    plugins: [qml({ qmlc, qt: [join(import.meta.dirname, "qt")], root: dir, ...options })],
  });
  return {
    transform: (path) => server.transformRequest(`/${path}`),
    close: async () => {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const MAIN = "import QtQuick\nimport App.Media\n\nColumn {\n    Player { volume: 3 }\n}\n";
const PLAYER = JSON.stringify({
  format: 2,
  modules: [{ uri: "App.Media", versions: ["1.0"], types: [{ name: "Player", since: "1.0", base: "QtObject", baseModule: "QtQml", properties: [{ name: "volume", type: "int", kind: "value", notify: "volumeChanged" }] }] }],
});

plain("a dump that does not read stops the compile with the reason", async () => {
  const project = await compiling({ "Main.qml": MAIN, "native/ljostypes.json": '{"format": 2, "modules": [\n' });
  try {
    await expect(project.transform("Main.qml")).rejects.toThrow(/native\/ljostypes\.json:2:1: EOF while parsing a list/);
  } finally {
    await project.close();
  }
});

plain("the dumps a build is given are the ones it reads", async () => {
  // One named however it is, and none at all.
  const files = { "Main.qml": MAIN, "rust/player.json": PLAYER };
  const named = await compiling(files, { types: ["rust/player.json"] });
  try {
    expect((await named.transform("Main.qml")).code).toContain(".ljostypes/App/Media/Player.qml");
  } finally {
    await named.close();
  }
  const none = await compiling({ "Main.qml": MAIN, "native/ljostypes.json": PLAYER }, { types: [] });
  try {
    await expect(none.transform("Main.qml")).rejects.toThrow(/module "App.Media" is not installed/);
  } finally {
    await none.close();
  }
});

plain("a member the dump does not describe is an error where it is written", async () => {
  const main = MAIN.replace("volume: 3", "volum: 3");
  const project = await compiling({ "Main.qml": main, "native/ljostypes.json": PLAYER });
  try {
    await expect(project.transform("Main.qml")).rejects.toThrow(/Main\.qml:5:14: `volum` is not a property of `Player`/);
  } finally {
    await project.close();
  }
});

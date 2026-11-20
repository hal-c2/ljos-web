// Sites that import Qt Quick Controls: built with Ljós's own style, which
// needs no Qt, and with an installed Qt's style only where one is asked for.
// The sizes are what Ljós's native engine gives the same controls (ljos-ui's
// features/controls at the commit `controls/` is copied from).
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { buildSite } from "../site.js";
import { check, DRAWN, qmldirs, source } from "../controls.js";
import qml, { installed } from "../vite.js";
import { bundle, compilerFile as qmlc, fixtures } from "./bundle.js";
import { expect, serve, test } from "./served.js";

// A stand-in for an installed Qt with Qt Quick Controls (`qt-styles/README.md`).
const standin = join(fixtures, "qt-styles");
// What the Basic style of Ljós makes of the fixture: Button, CheckBox,
// Slider, TextField and ComboBox, each width and height.
const LJOS = "100 40 46 40 200 40 200 40 140 40";

// Each part of a test is a step with a time of its own, so that one that
// stops says which part it stopped in, and the report times each part:
// a test timeout alone says only that the whole ran out. Together they
// come to less than the test's own time (`playwright.config.js`), so a
// step's time always runs out first.
const BUILD = 60_000;
const PART = 15_000;

// Opens the site built at `out`, and fails on anything it logs as an error.
async function opened(page, out, check) {
  const server = await serve(out);
  try {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
    await test.step("open the site", () => page.goto(`${server.origin}/`), { timeout: PART });
    await test.step("check the page", check, { timeout: PART });
    expect(errors).toEqual([]);
  } finally {
    await test.step("stop serving it", () => server.stop(), { timeout: PART });
  }
}

// The environment as a machine with no Qt 6 has it: a PATH of only `tools`
// (none, by default), no Qt named by QT_INSTALL_QML or QML_IMPORT_PATH.
async function withoutQt(run, tools = {}) {
  const saved = { PATH: process.env.PATH, QT_INSTALL_QML: process.env.QT_INSTALL_QML, QML_IMPORT_PATH: process.env.QML_IMPORT_PATH };
  const bin = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-no-qt-"));
  for (const [name, script] of Object.entries(tools)) {
    writeFileSync(join(bin, name), script);
    chmodSync(join(bin, name), 0o755);
  }
  process.env.PATH = bin;
  delete process.env.QT_INSTALL_QML;
  delete process.env.QML_IMPORT_PATH;
  try {
    return await run(bin);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(bin, { recursive: true, force: true });
  }
}

// What Qt 5's tools say: its `qtpaths` knows no `--query`, and its `qmake`
// names a Qt 5 whose QML directory has Qt Quick Controls 1.
function qt5(root) {
  const qml = join(root, "qt5-qml");
  mkdirSync(join(qml, "QtQuick/Controls"), { recursive: true });
  writeFileSync(join(qml, "QtQuick/Controls/qmldir"), "module QtQuick.Controls\nButton 1.0 Button.qml\n");
  writeFileSync(join(qml, "QtQuick/Controls/Button.qml"), "import QtQuick 2.0\nThis is not QML a Qt 6 reads {\n");
  return {
    qtpaths: `#!/bin/sh\necho "qtpaths: Unknown option 'query'." >&2\nexit 1\n`,
    qmake: `#!/bin/sh\ncase "$2" in\n  QT_VERSION) echo 5.15.2 ;;\n  QT_INSTALL_QML) echo ${qml} ;;\n  QT_INSTALL_BINS) echo ${root} ;;\nesac\n`,
  };
}

test("a site that imports QtQuick.Controls builds where no Qt is installed, with Ljós's controls at Ljós's sizes", async ({ page }) => {
  const made = bundle("controls");
  try {
    await test.step("build the site", () => withoutQt(() => buildSite({ dir: made.dir, out: made.out, qmlc })), { timeout: BUILD });
    await opened(page, made.out, async () => {
      await expect(page.getByText(LJOS, { exact: true })).toBeVisible();
      const go = page.getByRole("button", { name: "Go" });
      expect(await go.boundingBox()).toMatchObject({ width: 100, height: 40 });
      await go.click();
      await expect(page.getByText("clicked 1", { exact: true })).toBeVisible();
      await expect(page.getByRole("slider")).toHaveCount(1);
      await expect(page.getByRole("checkbox")).toHaveCount(1);
      await expect(page.getByRole("combobox")).toHaveCount(1);
    });
  } finally {
    made.remove();
  }
});

test("a site that imports Ljos.Controls and Ljos.Design builds where no Qt is installed, with nothing given besides", async ({ page }) => {
  const made = bundle("ljos-controls");
  try {
    await test.step("build the site", () => withoutQt(() => buildSite({ dir: made.dir, out: made.out, qmlc })), { timeout: BUILD });
    await opened(page, made.out, async () => {
      await expect(page.getByText("spacing 16 fits true bar true", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Go" }).click();
      await expect(page.getByText("clicked 1", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Plain" })).toBeVisible();
      await expect(page.getByRole("progressbar")).toHaveCount(1);
    });
  } finally {
    made.remove();
  }
});

test("Qt 5's qtpaths and qmake on the path are told apart from a Qt 6, and do not break the build", async ({ page }) => {
  const made = bundle("controls");
  try {
    await withoutQt(async () => {
      expect(installed()).toEqual({});
      await buildSite({ dir: made.dir, out: made.out, qmlc });
    }, qt5(made.root));
    await opened(page, made.out, () => expect(page.getByText(LJOS, { exact: true })).toBeVisible());
  } finally {
    made.remove();
  }
});

test("a Qt 6 on the path is found by its version, past a Qt 5's qtpaths", async () => {
  const root = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-qt6-"));
  try {
    const tools = {
      ...qt5(root),
      qtpaths6: `#!/bin/sh\ncase "$2" in\n  QT_VERSION) echo 6.11.2 ;;\n  QT_INSTALL_QML) echo ${standin} ;;\n  QT_INSTALL_BINS) echo ${root} ;;\nesac\n`,
    };
    await withoutQt(() => expect(installed()).toEqual({ qml: standin, bins: root, version: "6.11.2" }), tools);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a site is built with Ljós's controls where a Qt is installed too, so it draws as the native application does", async ({ page }) => {
  const made = bundle("controls");
  try {
    await buildSite({ dir: made.dir, out: made.out, qmlc, qt: [standin] });
    await opened(page, made.out, () => expect(page.getByText(LJOS, { exact: true })).toBeVisible());
  } finally {
    made.remove();
  }
});

test("a site that asks for Qt's styles gets the installed Qt's controls", async ({ page }) => {
  const made = bundle("button");
  try {
    await buildSite({ dir: made.dir, out: made.out, qmlc, qt: [standin], styles: "qt" });
    await opened(page, made.out, () => expect(page.getByText("button 123 45", { exact: true })).toBeVisible());
  } finally {
    made.remove();
  }
});

test("a site that imports a style Ljós has none of takes it from the installed Qt", async ({ page }) => {
  const made = bundle("imagine");
  try {
    await buildSite({ dir: made.dir, out: made.out, qmlc, qt: [standin] });
    await opened(page, made.out, () => expect(page.getByText("imagine 77 33", { exact: true })).toBeVisible());
  } finally {
    made.remove();
  }
});

test("a site that imports a style Ljós has none of is refused where there is no Qt, and the error says Qt is missing", async () => {
  const made = bundle("imagine");
  try {
    await withoutQt(() =>
      expect(buildSite({ dir: made.dir, out: made.out, qmlc })).rejects.toThrow(
        /it imports QtQuick.Controls.Imagine, which is compiled from an installed Qt 6's own QML \(Ljós has no style of it\), and there is no Qt 6 here/,
      ),
    );
    expect(existsSync(made.out)).toBe(false);
  } finally {
    made.remove();
  }
});

// The Vite plugin, unlike a site, takes the installed Qt's controls where
// there is one: a program of Qt's draws as qml6 draws it.
test("the Vite plugin takes an installed Qt's controls where there is one, and Ljós's where there is none", async () => {
  const stage = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-plugin-"));
  const built = async (options) => {
    const out = join(stage, "dist");
    await build({
      configFile: false,
      root: join(fixtures, "button"),
      logLevel: "silent",
      plugins: [qml({ qmlc, ...options })],
      build: { outDir: out, emptyOutDir: true, target: "esnext", lib: { entry: join(fixtures, "button/Shell.qml"), formats: ["es"], fileName: "page" } },
    });
    return readdirSync(out).map((file) => readFileSync(join(out, file), "utf8")).join("\n");
  };
  try {
    expect(await built({ qt: [standin] })).toContain("stand-in Qt Basic");
    const none = join(stage, "none");
    mkdirSync(none);
    expect(await built({ qt: [none] })).not.toContain("stand-in Qt Basic");
    expect(await built({ qt: [standin], styles: "ljos" })).not.toContain("stand-in Qt Basic");
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
});

test("Ljós's controls are ljos-ui's QML as it is at the commit Ljos.Design is pinned at, each file as copied", () => {
  expect(check()).toEqual([]);
  const cargo = readFileSync(join(import.meta.dirname, "../../../crates/ljos_web/Cargo.toml"), "utf8");
  const pinned = cargo.match(/^ljos_design = .*rev = "([0-9a-f]{40})"/m)?.[1];
  expect(source().rev).toBe(pinned);
  expect(Object.keys(source().files)).toContain("QtQuick/Controls/Basic/Button.qml");
});

// Ljós's own modules are made as its engine makes them (ljos-ui's
// `ljos_controls::ljos_style` and `ljos_controls::ljos`): Ljos.Controls is
// its own files, and Basic's of each drawn control it has none of;
// Ljos.Controls.Basic is Basic's drawn controls with its own twins in their
// place; a singleton is one because its file says so.
test("Ljós's own modules name Basic's file of each control they have no file of, and their singletons as singletons", () => {
  const singleton = "pragma Singleton\nimport QtQuick\nQtObject {}\n";
  const files = {
    "QtQuick/Controls/Basic/Button.qml": "",
    "QtQuick/Controls/Basic/CheckBox.qml": "",
    "QtQuick/Controls/Basic/TabButton.qml": "",
    "QtQuick/Controls/Basic/RangeSlider.qml": "",
    "Ljos/Controls/Button.qml": "",
    "Ljos/Controls/Card.qml": "",
    "Ljos/Controls/Theme.qml": singleton,
    "Ljos/Controls/impl/PopupShade.qml": "",
    "Ljos/Controls/Basic/Card.qml": "",
    "Ljos/Controls/Basic/TabButton.qml": "",
    "Ljos/Design/Colors.qml": singleton,
    "Ljos/Design/PressBehavior.qml": "",
  };
  const made = qmldirs(Object.keys(files), (file) => files[file] ?? "");
  const header = "# Written by ljos-web (packages/runtime/controls.js) for Ljós's own QML: not Qt's.";
  const qmldir = (...lines) => [header, ...lines].join("\n") + "\n";
  expect(made.get("Ljos/Controls/qmldir")).toBe(
    qmldir(
      "module Ljos.Controls",
      "Button 1.0 Button.qml",
      "Card 1.0 Card.qml",
      "singleton Theme 1.0 Theme.qml",
      "CheckBox 1.0 ../../QtQuick/Controls/Basic/CheckBox.qml",
      "TabButton 1.0 ../../QtQuick/Controls/Basic/TabButton.qml",
    ),
  );
  expect(made.get("Ljos/Controls/Basic/qmldir")).toBe(
    qmldir(
      "module Ljos.Controls.Basic",
      "Button 1.0 ../../../QtQuick/Controls/Basic/Button.qml",
      "Card 1.0 Card.qml",
      "CheckBox 1.0 ../../../QtQuick/Controls/Basic/CheckBox.qml",
      "TabButton 1.0 TabButton.qml",
    ),
  );
  expect(made.get("Ljos/Controls/impl/qmldir")).toBe(qmldir("module Ljos.Controls.impl", "PopupShade 1.0 PopupShade.qml"));
  expect(made.get("Ljos/Design/qmldir")).toBe(qmldir("module Ljos.Design", "singleton Colors 1.0 Colors.qml", "PressBehavior 1.0 PressBehavior.qml"));
  // RangeSlider is not a control of Ljós's API, so neither of its modules has it.
  expect(DRAWN).not.toContain("RangeSlider");
});

test("Ljós's own modules, Ljos.Design and the Observer are copied with its controls, and their qmldirs are as the engine makes them", () => {
  const files = Object.keys(source().files);
  for (const file of ["Ljos/Controls/Button.qml", "Ljos/Controls/Theme.qml", "Ljos/Controls/impl/PopupShade.qml", "Ljos/Controls/Basic/TabButton.qml", "Ljos/Design/Colors.qml", "Ljos/Observer/Observer.qml"]) {
    expect(files).toContain(file);
  }
  expect(source().paths).toEqual({
    "crates/ljos_controls/qml": ["QtQuick/Controls/", "Ljos/Controls/"],
    "crates/ljos_design_qml/qml": ["Ljos/Design/"],
    "crates/ljos_cli/src/observe": ["Ljos/Observer/"],
  });
  // The window `ljos observe` opens, as a type of the module its client is.
  const observer = qmldirs(["Ljos/Observer/Observer.qml"]).get("Ljos/Observer/qmldir");
  expect(observer).toContain("\nObserver 1.0 Observer.qml\n");
  // And the web's own QML of the module, kept with the runtime's code of it.
  for (const name of ["Inspector", "InspectorClient"]) {
    expect(observer).toContain(`\n${name} 1.0 ../../../Ljos/Observer/${name}.qml\n`);
    expect(existsSync(new URL(`../Ljos/Observer/${name}.qml`, import.meta.url))).toBe(true);
  }
});

// The site's QML is written in Ljós's dialect (docs/DIALECT.md): Ljos.Ui,
// Ljos.Layout and Ljos.Core, t`` for words a reader sees, the styled
// Ljos.Controls. A file still on a Qt module is named below with what
// keeps it there, so the list is the record of what Ljós does not cover
// yet, and a file that moves on drops off it.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const roots = ["site-ljos/bundle", "site/src/demos"];

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const files = roots
  .flatMap((root) => walk(join(repo, root)))
  .filter((path) => path.endsWith(".qml"))
  .map((path) => ({ file: relative(repo, path), text: readFileSync(path, "utf8") }));

// The first load: every page loads the site's shell and the Pantry demo
// before a reader does anything, and Ljos.Ui and Ljos.Layout are each one
// module a bundler keeps whole (about 23 kB gzip more), which takes
// /data/models/ over the 405 kB ceiling (payload.spec.js).
const firstLoad = "on every page's first load; Ljos.Ui and Ljos.Layout cost about 23 kB gzip there, over the 405 kB ceiling";
// A copy of hal-c2/ljos-ui's examples, pinned to the commit it names
// (pro.spec.js): it changes there and comes over by scripts/sync-demo.mjs.
const synced = "a copy of hal-c2/ljos-ui's examples: it moves there";

const site = (names, reason) => Object.fromEntries(names.map((name) => [`site-ljos/bundle/${name}.qml`, reason]));

// Files that import QtQuick itself, and why.
const qtQuick = {
  ...site(["Main", "Shells/Elegant", "Demos/PantryDemo", "Demos/PantryShell", "Pantry/Basket", "Pantry/Note", "Pantry/StatusSlot"], firstLoad),
  ...site(
    [
      "Brand", "CodeBlock", "CodeEditor", "ControlsHost", "DemoFrame", "DemoSection", "DemosPage", "DocPage", "DocsMap", "Footer",
      "GitHubMark", "Heading", "IconButton", "LinkButton", "MenuButton", "MotionToggle", "NavLink", "ObserverButton", "ObserverDock",
      "PageSource", "PageTree", "PageView", "Preferences", "ProDemoPage", "ReplayFrame", "Rise", "Router", "Runner", "Running",
      "Search", "ShellSwitcher", "StageButton", "ThemeToggle", "Toc", "Wordmark",
    ].map((name) => `Site/${name}`),
    firstLoad,
  ),
  ...site(["Site/Theme"], `${firstLoad}; and Ljos.Ui has no MotionPreference to compare styleHints.accessibility.motionPreference with`),
  ...site(["Cockpit/CarModel", "Cockpit/CarScene", "Cockpit/ChaseView", "Cockpit/Strip", "Cockpit/WallClock", "Watch/Strip", "Watch/WallClock", "Watch/WatchScene"].map((name) => `Demos/${name}`), synced),
  // By name only (`import QtQuick as Q`), for the one type Ljos.Ui lacks.
  ...site(["Demos/Orbit", "Shells/Cyberpunk"], "Ljos.Ui has no FrameAnimation"),
  ...site(["Demos/Shader"], "Ljos.Ui has no ShaderEffect or FrameAnimation"),
  "site/src/demos/shader/Shader.qml": "Ljos.Ui has no ShaderEffect",
};

// Files that import a module of QtQuick's other than QtQuick3D's, and why.
const qtQuickModules = {
  "QtQuick.Controls": {
    ...site(["Site/ControlsHost"], "it builds the page with Qt Quick Controls, which readers' in-page compiles import"),
    ...site(["Pantry/Note"], "a reader's edit compiles in the page against QtQuick.Controls; Ljos.Controls would bring QtQuick.Shapes and Binding into the first load"),
    "site/src/demos/pantry/Pantry/Note.qml": "the Pantry demo's in-page compile maps QtQuick.Controls; Ljos.Controls would bring QtQuick.Shapes and Binding with it",
  },
  "QtQuick.Effects": {
    ...site(["Site/CodeBlock", "Site/FeatureCard", "Site/Panel"], "no Ljós module has RectangularShadow or MultiEffect"),
    ...site(["Demos/Cockpit/Neon", "Demos/Watch/Neon"], synced),
  },
};

const imports = (text, module) => new RegExp(`^import ${module.replace(".", "\\.")}(\\s+as\\s+\\w+)?\\s*$`, "m").test(text);

test("no QML file imports QtQuick but those named with what keeps them there", () => {
  expect(files.length).toBeGreaterThan(100);
  const on = files.filter(({ text }) => imports(text, "QtQuick")).map(({ file }) => file).sort();
  expect(on).toEqual(Object.keys(qtQuick).sort());
});

for (const [module, allowed] of Object.entries(qtQuickModules)) {
  test(`no QML file imports ${module} but those named with what keeps them there`, () => {
    const on = files.filter(({ text }) => imports(text, module)).map(({ file }) => file).sort();
    expect(on).toEqual(Object.keys(allowed).sort());
  });
}

test("no QML file imports QtQuick.Layouts, QtQuick.Shapes or QtQml", () => {
  const on = files.filter(({ text }) => /^import (QtQuick\.Layouts|QtQuick\.Shapes|QtQml)\b/m.test(text)).map(({ file }) => file);
  expect(on).toEqual([]);
});

test("no QML file says qsTr: words a reader sees are t``", () => {
  expect(files.filter(({ text }) => /\bqsTr\s*\(/.test(text)).map(({ file }) => file)).toEqual([]);
});

test("no QML file imports Ljos.Controls.Basic: the site's controls are the styled Ljos.Controls", () => {
  expect(files.filter(({ text }) => /^import Ljos\.Controls\.Basic\b/m.test(text)).map(({ file }) => file)).toEqual([]);
});

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
// What a visitor sees or remixes: the site's own QML, the Astro reference's
// and the showcase's, and the text of a QML file shown as a `.qml.txt`.
const roots = ["site-ljos/bundle", "site/src"];
const qml = (path) => path.endsWith(".qml") || path.endsWith(".qml.txt");

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const files = roots
  .flatMap((root) => walk(join(repo, root)))
  .filter(qml)
  .map((path) => ({ file: relative(repo, path), text: readFileSync(path, "utf8") }));

// The first load: every page loads the site's shell before a reader does
// anything, and Ljos.Ui and Ljos.Layout are each one module a bundler keeps
// whole, about 23 kB gzip a docs page does not load yet (payload.spec.js
// holds every page to 405 kB). The chrome moves over in a change of its own.
const firstLoad = "on every page's first load, where Ljos.Ui and Ljos.Layout add about 23 kB gzip to a docs page; it moves over on its own";
// A copy of hal-c2/ljos-ui's examples, pinned to the commit it names
// (pro.spec.js): it changes there and comes over by scripts/sync-demo.mjs.
const synced = "a copy of hal-c2/ljos-ui's examples: it moves there";

const site = (names, reason) => Object.fromEntries(names.map((name) => [`site-ljos/bundle/${name}.qml`, reason]));

// Files that import QtQuick itself, and why.
const qtQuick = {
  ...site(["Main", "Shells/Elegant"], firstLoad),
  ...site(
    [
      "Brand", "CodeBlock", "CodeEditor", "ControlsHost", "DemoFrame", "DemoSection", "DemosPage", "DocPage", "DocsMap", "Footer",
      "GitHubMark", "Heading", "IconButton", "LanguageSwitcher", "LinkButton", "MenuButton", "MotionToggle", "NavLink", "ObserverButton", "ObserverDock",
      "PageSource", "PageTree", "PageView", "Preferences", "ProDemoPage", "ReplayFrame", "Rise", "Router", "Runner", "Running",
      "Search", "SearchResults", "ShellSwitcher", "StageButton", "ThemeToggle", "Toc",
    ].map((name) => `Site/${name}`),
    firstLoad,
  ),
  ...site(["Site/Theme"], `${firstLoad}; and Ljos.Ui has no MotionPreference to compare styleHints.accessibility.motionPreference with`),
  ...site(["Cockpit/CarModel", "Cockpit/CarScene", "Cockpit/ChaseView", "Cockpit/Strip", "Cockpit/WallClock", "Watch/Strip", "Watch/WallClock", "Watch/WatchScene"].map((name) => `Demos/${name}`), synced),
  // By name only (`import QtQuick as Q`), for the types Ljos.Ui lacks.
  ...site(["Demos/Orbit"], "Ljos.Ui has no FrameAnimation"),
  ...site(["Demos/Lottie"], "Ljos.Ui has no Item.TopLeft for the transformOrigin its avatars scale about"),
  ...site(["Shells/Cyberpunk"], "Ljos.Ui has no FrameAnimation or LayoutMirroring"),
  // A right-to-left page reads LayoutMirroring.enabled to set from the
  // right what these place from the left; Ljos.Ui has no LayoutMirroring.
  ...site(
    [
      "Demos/AgentLogRow", "Demos/AgentView", "Demos/DispatchCard", "Demos/FieldGuide", "Demos/WatchDemo", "Shells/Desktop", "Shells/Workbench",
    ],
    "Ljos.Ui has no LayoutMirroring",
  ),
  ...site(["Demos/Shader"], "Ljos.Ui has no ShaderEffect or FrameAnimation"),
  // ShowcaseApp's recording, loaded when a reader asks (Loader.source given
  // an import), with what it sets on the item loaded and reads of it;
  // Ljos.Ui's Loader takes a url only and its item is a QtObject with none
  // of those.
  ...site(["Site/ShowcasePlayer"], "Ljos.Ui's Loader takes a url, not a lazy import, and its item is untyped"),
  // The rest of the site's loading is typed; these three hold what is not,
  // each one Qt type given an untyped value, so the files that use them
  // are typed throughout.
  ...site(["Demos/ModuleLoader"], "Ljos.Ui's Loader takes a url, not a lazy import or a live module, and a component that is never missing"),
  ...site(["Demos/HeldBinding"], "Ljos.Core's Binding takes a QtObject target, not an object a loaded app names"),
  ...site(["Demos/DispatchShell"], "Ljos.Blocks' ShellLoader takes a url source and fallback, not a lazy import or a component, and its item is untyped"),
  ...site(["Demos/PantryStage"], "Ljos.Blocks' ShellLoader takes a url source and fallback, not a shell compiled in the page or a component"),
  // What the build writes (Content, ShowcaseApps, DispatchSource, PantryProject)
  // is not in a checkout until it runs, and CI's ljos check runs before it: these
  // read those singletons by name for the typed files that use them.
  ...site(["Site/Built", "Demos/DispatchBuilt", "Demos/PantryBuilt"], "they read singletons the build writes, which a checkout has not got when ljos check runs"),
  "site/src/demos/shader/Shader.qml": "Ljos.Ui has no ShaderEffect",
  "site/src/islands/ControlsHost.qml": "it builds the Astro reference's page with Qt Quick Controls, which readers' in-page compiles import",
  // A visitor's edit to it is compiled in the page and run by
  // Ljos/Blocks/shell.js, which makes QtQuick's types only.
  "site/src/demos/pantry/Shell.qml": "a visitor's edit runs in the page's shell runner, which makes QtQuick's types only",
  // The Motion demo calms its own motion (a softer spring, shorter glides)
  // when a reader asks for less; Ljos.Ui's animations would put what moves
  // at its end at once (e2e/motion.spec.js holds that the puck travels).
  ...site(["Demos/Motion"], "its animations calm themselves; Ljos.Ui's put what moves at its end under reduced motion"),
  "site/src/demos/motion/Motion.qml": "its animations calm themselves; Ljos.Ui's put what moves at its end under reduced motion",
};

// Files that import a module of QtQuick's other than QtQuick3D's, and why.
const qtQuickModules = {
  "QtQuick.Controls": {
    ...site(["Site/ControlsHost"], "it builds the page with Qt Quick Controls, which readers' in-page compiles import"),
    "site/src/islands/ControlsHost.qml": "it builds the Astro reference's page with Qt Quick Controls, which readers' in-page compiles import",
    "site/src/demos/pantry/Pantry/Note.qml": "the Pantry demo's in-page compile maps QtQuick.Controls; Ljos.Controls would bring QtQuick.Shapes and Binding with it",
  },
  "QtQuick.Effects": {
    ...site(["Site/CodeBlock"], "no Ljós module has RectangularShadow or MultiEffect"),
    ...site(["Site/FeatureCard", "Site/Panel"], "needs RectangularShadow: in ljos-ui PR launch-dialect2-ui, reaches ljos-web with the crates pin bump"),
    ...site(["Demos/Cockpit/Neon", "Demos/Watch/Neon"], synced),
  },
};

// `import QtQuick`, with a version, a qualifier or a comment after it.
const imports = (text, module) =>
  new RegExp(`^import ${module.replaceAll(".", "\\.")}(\\s+\\d+(\\.\\d+)*)?(\\s+as\\s+\\w+)?\\s*(//.*)?$`, "m").test(text);

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

// QtQuick3D stays (the 3D demos have no Ljós module to move to); any other
// module of QtQuick's is one of those above, each named with its reason.
test("no QML file imports a module of QtQuick's the lists above do not name", () => {
  const named = new Set(["QtQuick", ...Object.keys(qtQuickModules)]);
  const other = files.flatMap(({ file, text }) =>
    [...text.matchAll(/^import (QtQuick[\w.]*)/gm)]
      .map(([, module]) => module)
      .filter((module) => !named.has(module) && module !== "QtQuick3D" && !module.startsWith("QtQuick3D."))
      .map((module) => `${file}: ${module}`),
  );
  expect(other).toEqual([]);
});

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

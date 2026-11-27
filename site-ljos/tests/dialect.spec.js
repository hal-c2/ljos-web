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
// A copy of hal-c2/ljos-play, its engine and the showcase's example,
// pinned to the commit it names (showcase.spec.js): it changes there and
// comes over by scripts/sync-play.mjs.
const played = "a copy of hal-c2/ljos-play: it moves there";

const site = (names, reason) => Object.fromEntries(names.map((name) => [`site-ljos/bundle/${name}.qml`, reason]));

// Files that import QtQuick itself, and why.
const qtQuick = {
  ...site(["Site/MotionToggle"], firstLoad),
  // By name only (`import QtQuick as Q`), for the one Qt type it still
  // makes: the window that holds what an example opens.
  ...site(["Site/CodeBlock"], "Ljos.Ui has no WindowContainer"),
  ...site(["Activity", "Actor", "Art", "Crowd", "Pose", "Sheet", "Spot", "Talks", "Thing", "Touchable", "World"].map((name) => `LjosPlay/${name}`), played),
  ...site(["Cockpit/CarModel", "Cockpit/CarScene", "Cockpit/ChaseView", "Cockpit/Strip", "Cockpit/WallClock", "Watch/Strip", "Watch/WallClock", "Watch/WatchScene"].map((name) => `Demos/${name}`), synced),
  // By name only (`import QtQuick as Q`), for the types Ljos.Ui lacks.
  ...site(["Demos/Lottie"], "Ljos.Ui has no Item.TopLeft for the transformOrigin its avatars scale about"),
  ...site(["Demos/Shader"], "Ljos.Ui has no ShaderEffect"),
  // ShowcaseApp's recording, loaded when a reader asks (Loader.source given
  // an import), with what it sets on the item loaded and reads of it;
  // Ljos.Ui's Loader takes a url only and its item is a QtObject with none
  // of those.
  ...site(["Site/ShowcasePlayer"], "Ljos.Ui's Loader takes a url, not a lazy import, and its item is untyped"),
  "site/src/demos/shader/Shader.qml": "Ljos.Ui has no ShaderEffect",
  "site/src/islands/ControlsHost.qml": "it builds the Astro reference's page with Qt Quick Controls, which readers' in-page compiles import",
  // The Astro reference's Motion demo calms its own motion (a softer
  // spring, shorter glides) when a reader asks for less, its own way;
  // Ljos.Ui's animations calm themselves (no overshoot, a spring that
  // never swings past). site-ljos's steps its springs itself from a
  // FrameAnimation, which runs on under reduced motion, so it needs no
  // QtQuick.
  "site/src/demos/motion/Motion.qml": "its animations calm themselves its own way, not as Ljos.Ui's do under reduced motion",
};

// Files that import a module of QtQuick's other than QtQuick3D's, and why.
const qtQuickModules = {
  "QtQuick.Controls": {
    ...site(["Site/ControlsHost"], "it builds the page with Qt Quick Controls, which readers' in-page compiles import"),
    "site/src/islands/ControlsHost.qml": "it builds the Astro reference's page with Qt Quick Controls, which readers' in-page compiles import",
  },
  "QtQuick.Effects": {
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

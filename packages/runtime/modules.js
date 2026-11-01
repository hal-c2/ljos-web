// The modules this commit of ljos-web provides, for a program that has to
// know before it builds (a designer that refuses to export what has no face
// on the web, a site builder that refuses a bundle that imports one):
// `modules.json` beside this file, which `ljos-web modules --json` prints.
//
// What the runtime has of a module is one of its package's exports
// (`./QtQuick/Layouts` is QtQuick.Layouts). Two more are compiled, not
// exported: `QtQuick.Controls` is put together by the Vite plugin from the
// QML of a style, Ljós's own (`controls/`) where no Qt 6 is installed, and
// `Ljos.Design` is Ljós's QML, given to the compiler as a stand-in
// (`--with`). A style Ljós has none of (Imagine) is QML of Qt's own, and
// needs that Qt to be built.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONTROLS } from "./controls.js";

const runtime = import.meta.dirname;

export const FORMAT = "ljos-web-modules";
export const VERSION = 1;

// Where a module's types come from: the runtime's own JavaScript, Qt's QML,
// Ljós's QML.
const COMPILED = [
  { module: "QtQuick.Controls", from: "ljos" },
  { module: "Ljos.Design", from: "ljos" },
];

// What a build of a site that imports `module` must be given besides
// ljos-web: `qt`, an installed Qt 6's QML modules; `with`, a directory of
// the module's QML (`--with`).
function needs(module, from) {
  if (module.startsWith("QtQuick.Controls.")) return existsSync(join(CONTROLS, ...module.split("."), "qmldir")) ? [] : ["qt"];
  if (module === "QtQuick.Controls") return [];
  return from === "ljos" ? ["with"] : [];
}

// The list as the package says it today: what `modules.json` must equal.
export function provided(packageJson = join(runtime, "package.json")) {
  const { exports } = JSON.parse(readFileSync(packageJson, "utf8"));
  const exported = Object.keys(exports)
    .filter((key) => /^\.\/[A-Z]/.test(key))
    .map((key) => ({ module: key.slice(2).replaceAll("/", "."), from: "runtime" }));
  const modules = [...exported, ...COMPILED]
    .map(({ module, from }) => ({ module, from, needs: needs(module, from) }))
    .sort((a, b) => (a.module < b.module ? -1 : a.module > b.module ? 1 : 0));
  return { format: FORMAT, version: VERSION, modules };
}

// The list as committed, which a program reads without running this one.
export function listed() {
  return JSON.parse(readFileSync(join(runtime, "modules.json"), "utf8"));
}

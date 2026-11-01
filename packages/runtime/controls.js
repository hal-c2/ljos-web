// Ljós's own styles of Qt Quick Controls: the QML of ljos-ui's
// `crates/ljos_controls/qml`, written for Ljós from Qt's documentation and
// from what a running Qt shows (ljos-ui's CLEAN_ROOM.md), with Ljós's
// metrics. They are copied into `controls/` at one commit of ljos-ui, which
// `controls/LJOS_UI.json` names with a hash of every file, so that a page
// that imports `QtQuick.Controls` builds where no Qt is installed.
//
// `controls/` is laid out as a directory of Qt's QML modules is
// (`QtQuick/Controls/Basic/Button.qml`), so the Vite plugin takes it as one:
// it is looked in for a module before an installed Qt, or alone. ljos-ui has
// no `qmldir` there (its build packs the files itself), so those are written
// here, from which files there are; `check` holds both to the commit.
//
// `node controls.js write DIR REV` copies them from DIR, a checkout of
// ljos-ui's `crates/ljos_controls/qml` at REV (`mise run controls`).
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

export const CONTROLS = join(import.meta.dirname, "controls");
const SOURCE = "LJOS_UI.json";
const STYLES = "QtQuick/Controls";
// What `import QtQuick.Controls` is when nothing says otherwise, as in Qt.
const DEFAULT = "Basic";
// Modules the runtime has in JavaScript alone, which get a `qmldir` of
// their own all the same: one found here is the one used, so the QML an
// installed Qt has of them never comes into a page of Ljós's style.
const NATIVE = ["QtQuick/Controls/impl", "QtQuick/Controls/Material/impl", "QtQuick/Controls/Universal/impl"];

const hash = (text) => createHash("sha256").update(text).digest("hex");
const posix = (path) => path.split(sep).join("/");

function walk(directory, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path, found);
    else found.push(path);
  }
  return found;
}

// The `qmldir` of each module, by its directory, from the QML files there
// are: a module per directory that has some, and what Ljós's engine makes of
// them (ljos-ui's `ljos_controls::style`). A style other than Basic falls
// back on Basic's controls for those it has no file of.
export function qmldirs(files) {
  const modules = new Map(NATIVE.map((directory) => [directory, []]));
  for (const file of files) {
    if (!file.endsWith(".qml")) continue;
    const directory = posix(dirname(file));
    if (!modules.has(directory)) modules.set(directory, []);
    modules.get(directory).push(posix(file).split("/").at(-1));
  }
  const styles = [...modules.keys()]
    .filter((directory) => dirname(directory) === STYLES)
    .map((directory) => directory.split("/").at(-1))
    .filter((name) => name !== "impl");
  const written = new Map();
  const header = "# Written by ljos-web (packages/runtime/controls.js) for Ljós's own QML: not Qt's.";
  const uri = (directory) => directory.replaceAll("/", ".");
  written.set(STYLES, [
    header,
    `module ${uri(STYLES)}`,
    ...styles.filter((style) => style !== DEFAULT).sort().map((style) => `optional import ${uri(STYLES)}.${style} auto`),
    `default import ${uri(STYLES)}.${DEFAULT}`,
  ]);
  for (const [directory, names] of modules) {
    const lines = [header, `module ${uri(directory)}`];
    for (const name of names.sort()) lines.push(`${name.slice(0, -4)} 6.0 ${name}`);
    const style = dirname(directory) === STYLES ? directory.split("/").at(-1) : null;
    if (styles.includes(style) && style !== DEFAULT) lines.push(`import ${uri(STYLES)}.${DEFAULT} auto`);
    // What no style draws (`Action`, `AbstractButton`) is Templates', and is
    // still a name of `QtQuick.Controls`, as Qt documents it.
    if (style === DEFAULT) lines.push("import QtQuick.Templates auto");
    written.set(directory, lines);
  }
  return new Map([...written].map(([directory, lines]) => [`${directory}/qmldir`, lines.join("\n") + "\n"]));
}

// What is wrong with `controls/` against what it says it was copied from:
// a file missing, changed or added, or a `qmldir` not as its files make it.
export function check(root = CONTROLS) {
  const problems = [];
  const at = join(root, SOURCE);
  if (!existsSync(at)) return [`${SOURCE} is not there: copy the styles with \`mise run controls\``];
  const source = JSON.parse(readFileSync(at, "utf8"));
  const present = walk(root).map((file) => posix(relative(root, file))).filter((file) => file !== SOURCE);
  const made = qmldirs(Object.keys(source.files));
  for (const [file, sum] of Object.entries(source.files)) {
    const path = join(root, file);
    if (!existsSync(path)) problems.push(`${file} is missing`);
    else if (hash(readFileSync(path)) !== sum) problems.push(`${file} is not as ljos-ui has it at ${source.rev}`);
  }
  for (const [file, text] of made) {
    const path = join(root, file);
    if (!existsSync(path)) problems.push(`${file} is missing`);
    else if (readFileSync(path, "utf8") !== text) problems.push(`${file} is not the qmldir its files make`);
  }
  for (const file of present) {
    if (!(file in source.files) && !made.has(file)) problems.push(`${file} is not ljos-ui's at ${source.rev}`);
  }
  return problems;
}

// What `controls/LJOS_UI.json` says: the commit and where in ljos-ui.
export const source = (root = CONTROLS) => JSON.parse(readFileSync(join(root, SOURCE), "utf8"));

export function write(from, rev, root = CONTROLS) {
  const files = walk(from)
    .map((file) => posix(relative(from, file)))
    .filter((file) => file.startsWith(`${STYLES}/`) && file.endsWith(".qml"))
    .sort();
  rmSync(root, { recursive: true, force: true });
  const sums = {};
  for (const file of files) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    cpSync(join(from, file), join(root, file));
    sums[file] = hash(readFileSync(join(root, file)));
  }
  for (const [file, text] of qmldirs(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  const said = { repository: "https://github.com/hal-c2/ljos-ui", path: "crates/ljos_controls/qml", rev, files: sums };
  writeFileSync(join(root, SOURCE), JSON.stringify(said, null, 2) + "\n");
  return files.length;
}

if (process.argv[1] === import.meta.filename) {
  const [command, from, rev] = process.argv.slice(2);
  if (command === "write" && from && /^[0-9a-f]{40}$/.test(rev ?? "")) {
    console.log(`controls: ${write(from, rev)} files of ljos-ui ${rev}`);
  } else if (command === "check") {
    const problems = check();
    for (const problem of problems) console.error(problem);
    process.exit(problems.length > 0 ? 1 : 0);
  } else {
    console.error("usage: node controls.js write DIR REV | check");
    process.exit(2);
  }
}

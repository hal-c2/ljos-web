// Ljós's own QML, for pages built where no Qt is installed: its styles of
// Qt Quick Controls (ljos-ui's `crates/ljos_controls/qml/QtQuick`), its
// own controls (`Ljos.Controls`, `Ljos.Controls.Basic`, beside them in
// `crates/ljos_controls/qml/Ljos`), and the design they are drawn with
// (`Ljos.Design`, ljos-ui's `crates/ljos_design_qml/qml`). Written for
// Ljós from Qt's documentation and from what a running Qt shows (ljos-ui's
// CLEAN_ROOM.md), with Ljós's metrics. They are copied into `controls/` at
// one commit of ljos-ui, which `controls/LJOS_UI.json` names with a hash of
// every file.
//
// `controls/` is laid out as a directory of QML modules is
// (`QtQuick/Controls/Basic/Button.qml`, `Ljos/Controls/Button.qml`), so the
// Vite plugin and the compiler take it as one: it is looked in for a module
// before an installed Qt, or alone, and is where `Ljos.*`'s QML is always
// found. The `qmldir`s are written here, from which files there are, so
// each module is what Ljós's engine makes of them (ljos-ui's
// `ljos_controls::style`, `ljos_controls::ljos`, `ljos_controls::ljos_style`):
// `check` holds both to the commit.
//
// `node controls.js write DIR REV [DESIGN]` copies them from DIR, ljos-ui's
// `crates/ljos_controls/qml` at REV (`mise run controls`), and Ljos.Design
// from DESIGN, its `crates/ljos_design_qml/qml` at REV. Without DESIGN,
// that directory is read at REV out of the ljos-ui checkout `mise run
// controls` was given (LJOS_UI, else `../ljos-ui`), which has it.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, sep } from "node:path";

export const CONTROLS = join(import.meta.dirname, "controls");
const SOURCE = "LJOS_UI.json";
const STYLES = "QtQuick/Controls";
const BASIC = `${STYLES}/Basic`;
// Where in ljos-ui each part of `controls/` is copied from, by the
// directory it is copied to.
const FROM = "crates/ljos_controls/qml";
const DESIGN_FROM = "crates/ljos_design_qml/qml";
const DESIGN = "Ljos/Design";
const OWN = "Ljos/Controls";
// The controls of Ljós's own API that have a look of their own drawn as
// Basic would, which stand in for Basic's of the same name in
// `Ljos.Controls.Basic` (its TabButton has `iconName`).
const OWN_BASIC = `${OWN}/Basic`;
// What `import QtQuick.Controls` is when nothing says otherwise, as in Qt.
const DEFAULT = "Basic";
// Modules the runtime has in JavaScript alone, which get a `qmldir` of
// their own all the same: one found here is the one used, so the QML an
// installed Qt has of them never comes into a page of Ljós's style.
const NATIVE = ["QtQuick/Controls/impl", "QtQuick/Controls/Material/impl", "QtQuick/Controls/Universal/impl"];
// The controls Ljós's API has that the Basic style draws (ljos-ui's
// `ljos_controls::ljos::DRAWN`): `Ljos.Controls.Basic` is these of Basic's,
// and `Ljos.Controls` has each that it has no file of its own for. What
// they have besides (AbstractButton, ButtonGroup, FileDialog, FolderDialog)
// draws nothing, and is the runtime's (`Ljos/Controls/index.js`).
export const DRAWN = [
  "ApplicationWindow",
  "BusyIndicator",
  "Button",
  "CheckBox",
  "ComboBox",
  "Control",
  "DelayButton",
  "Dialog",
  "Frame",
  "GroupBox",
  "ItemDelegate",
  "Label",
  "Menu",
  "MenuItem",
  "MenuSeparator",
  "Page",
  "Pane",
  "Popup",
  "ProgressBar",
  "RadioButton",
  "RoundButton",
  "ScrollBar",
  "ScrollView",
  "Slider",
  "SpinBox",
  "SwipeView",
  "Switch",
  "TabBar",
  "TabButton",
  "TextArea",
  "TextField",
  "ToolBar",
  "ToolButton",
  "ToolTip",
];

const hash = (text) => createHash("sha256").update(text).digest("hex");
const posix = (path) => path.split(sep).join("/");
// A file that says `pragma Singleton` is one, as the qmldir must say too.
const SINGLETON = /^\s*pragma\s+Singleton\b/m;

function walk(directory, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path, found);
    else found.push(path);
  }
  return found;
}

// Whether a file of a checkout is one `controls/` takes.
const taken = (file) => file.endsWith(".qml") && (file.startsWith(`${STYLES}/`) || file.startsWith("Ljos/"));

// The `qmldir` of each module, by its directory, from the QML files there
// are (`read(file)` is a file's text: whether it is a singleton): a module
// per directory that has some, and what Ljós's engine makes of them. A
// style other than Basic falls back on Basic's controls for those it has
// no file of; `Ljos.Controls` and `Ljos.Controls.Basic` name Basic's files
// where they are Basic's.
export function qmldirs(files, read = () => "") {
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
  // A type of the module in `directory`, from the file `at` names (its own,
  // or Basic's), versioned as the module is: Ljós's 1.0, Qt's 6.0.
  const entry = (directory, name, at = name) =>
    `${SINGLETON.test(read(posix(join(directory, at)))) ? "singleton " : ""}${name.slice(0, -4)} ${directory.startsWith("Ljos/") ? "1.0" : "6.0"} ${at}`;
  written.set(STYLES, [
    header,
    `module ${uri(STYLES)}`,
    ...styles.filter((style) => style !== DEFAULT).sort().map((style) => `optional import ${uri(STYLES)}.${style} auto`),
    `default import ${uri(STYLES)}.${DEFAULT}`,
  ]);
  const basic = new Set(modules.get(BASIC) ?? []);
  // Basic's file of a control, named from a module of Ljós's.
  const borrowed = (directory, name) => `${relative(directory, BASIC).split(sep).join("/")}/${name}`;
  for (const [directory, names] of modules) {
    if (directory === OWN_BASIC) continue;
    const lines = [header, `module ${uri(directory)}`];
    for (const name of names.sort()) lines.push(entry(directory, name));
    if (directory === OWN) {
      for (const name of DRAWN.map((name) => `${name}.qml`)) {
        if (!names.includes(name) && basic.has(name)) lines.push(entry(OWN, name, borrowed(OWN, name)));
      }
    }
    const style = dirname(directory) === STYLES ? directory.split("/").at(-1) : null;
    if (styles.includes(style) && style !== DEFAULT) lines.push(`import ${uri(STYLES)}.${DEFAULT} auto`);
    // What no style draws (`Action`, `AbstractButton`) is Templates', and is
    // still a name of `QtQuick.Controls`, as Qt documents it.
    if (style === DEFAULT) lines.push("import QtQuick.Templates auto");
    written.set(directory, lines);
  }
  // `Ljos.Controls.Basic`: Basic's controls of Ljós's API, each that Ljós's
  // own Basic look has none of under that name.
  if (modules.has(OWN_BASIC) || modules.has(OWN)) {
    const own = new Set(modules.get(OWN_BASIC) ?? []);
    const lines = [header, `module ${uri(OWN_BASIC)}`];
    const all = [...DRAWN.map((name) => `${name}.qml`).filter((name) => basic.has(name) && !own.has(name)), ...own].sort();
    for (const name of all) lines.push(entry(OWN_BASIC, name, own.has(name) ? name : borrowed(OWN_BASIC, name)));
    written.set(OWN_BASIC, lines);
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
  const text = (file) => (existsSync(join(root, file)) ? readFileSync(join(root, file), "utf8") : "");
  const made = qmldirs(Object.keys(source.files), text);
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

// Copies the QML of `from` (ljos-ui's `crates/ljos_controls/qml`) and of
// `design` (its `crates/ljos_design_qml/qml`), both at `rev`, into `root`.
//
// The tree is made in a directory of its own beside `root` and then put
// in `root`'s place, so `root` is only ever a whole tree: two writes at
// once (two `mise run controls` in one checkout) each make their own, and
// the last to finish is the one kept. Wiping `root` and writing into it
// made one write delete the files the other was writing, which failed
// with ENOTEMPTY and left tracked files deleted.
export function write(from, rev, root = CONTROLS, design) {
  const listed = (directory, keep) =>
    walk(directory)
      .map((file) => posix(relative(directory, file)))
      .filter(keep)
      .map((file) => [file, join(directory, file)]);
  const copied = [
    ...listed(from, (file) => taken(file) && !file.startsWith(`${DESIGN}/`)),
    ...(design ? listed(design, (file) => file.startsWith(`${DESIGN}/`) && file.endsWith(".qml")) : []),
  ].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  mkdirSync(dirname(root), { recursive: true });
  // Beside `root`, so it is on its file system and moves into place whole.
  const fresh = mkdtempSync(join(dirname(root), `.${basename(root)}-`));
  try {
    const sums = {};
    for (const [file, path] of copied) {
      mkdirSync(dirname(join(fresh, file)), { recursive: true });
      cpSync(path, join(fresh, file));
      sums[file] = hash(readFileSync(join(fresh, file)));
    }
    for (const [file, text] of qmldirs(Object.keys(sums), (file) => readFileSync(join(fresh, file), "utf8"))) {
      mkdirSync(dirname(join(fresh, file)), { recursive: true });
      writeFileSync(join(fresh, file), text);
    }
    const paths = { [FROM]: [`${STYLES}/`, `${OWN}/`], ...(design ? { [DESIGN_FROM]: [`${DESIGN}/`] } : {}) };
    const said = { repository: "https://github.com/hal-c2/ljos-ui", paths, rev, files: sums };
    writeFileSync(join(fresh, SOURCE), JSON.stringify(said, null, 2) + "\n");
    publish(fresh, root);
  } finally {
    // Gone once published; what is left of a write that failed.
    rmSync(fresh, { recursive: true, force: true });
  }
  return copied.length;
}

// Puts the tree `fresh` in `root`'s place. A directory cannot be renamed
// over one that has files, so the old tree is moved aside first; under a
// lock (mkdir is atomic everywhere), so of two writes the second does not
// move the first's tree aside between its two renames.
function publish(fresh, root) {
  const lock = `${root}.lock`;
  const pause = new Int32Array(new SharedArrayBuffer(4));
  for (let waited = 0; ; waited += 100) {
    try {
      mkdirSync(lock);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (waited >= 300_000) {
        throw new Error(`controls: waited 5 minutes for ${lock}; if no other write is running, remove that directory and try again`);
      }
      // `write` is synchronous, as its callers are: wait without a loop
      // that spins.
      Atomics.wait(pause, 0, 0, 100);
    }
  }
  try {
    const old = `${fresh}.old`;
    if (existsSync(root)) renameSync(root, old);
    renameSync(fresh, root);
    rmSync(old, { recursive: true, force: true });
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

// Ljos.Design's QML at `rev`, out of a checkout of ljos-ui: the directory
// it was read into, which the caller removes.
function designAt(checkout, rev) {
  const into = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-design-"));
  const archive = execFileSync("git", ["-C", checkout, "archive", rev, DESIGN_FROM], { maxBuffer: 1 << 28 });
  execFileSync("tar", ["x", "-C", into], { input: archive });
  return { dir: join(into, DESIGN_FROM), remove: () => rmSync(into, { recursive: true, force: true }) };
}

if (process.argv[1] === import.meta.filename) {
  const [command, from, rev, design] = process.argv.slice(2);
  if (command === "write" && from && /^[0-9a-f]{40}$/.test(rev ?? "")) {
    const read = design ? { dir: design, remove: () => {} } : designAt(process.env.usage_ljos_ui ?? process.env.LJOS_UI ?? "../ljos-ui", rev);
    try {
      console.log(`controls: ${write(from, rev, CONTROLS, read.dir)} files of ljos-ui ${rev}`);
    } finally {
      read.remove();
    }
  } else if (command === "check") {
    const problems = check();
    for (const problem of problems) console.error(problem);
    process.exit(problems.length > 0 ? 1 : 0);
  } else {
    console.error("usage: node controls.js write DIR REV [DESIGN] | check");
    process.exit(2);
  }
}

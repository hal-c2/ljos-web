#!/usr/bin/env node
// What real Qt renders for each example: `corpus/reference/<id>.png`, the
// picture the web rendering is compared with.
//
//   corpus/reference.mjs [ID...]      # default: every example Qt can run
//
// The examples are run with the plain `qml` tool (no C++ of their own: the QML
// in `corpus/standins/<id>` stands in for it where there is some), each in a
// small harness that loads the entry file, lets it settle and saves what it
// painted. Which examples that works for, and the window each gets, is in
// `corpus/examples.json`.
//
// Qt draws them with OpenGL, as it does on a desktop, in a compositor that has
// no screen (`sway`, headless): shader effects are in the picture. Without
// one it is the offscreen platform, which draws in software and leaves them
// out. Modules of Qt that are not the system's are found the way Qt finds
// them: QML_IMPORT_PATH, QT_PLUGIN_PATH and LD_LIBRARY_PATH are passed on.
//
// `corpus/reference/reference.json` records when each picture was taken: an
// example that shows the time of day is compared at that same moment.
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assetsOf } from "./assets.mjs";

const corpus = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(corpus, "examples.json"), "utf8"));
const examples = join(corpus, manifest.root);
const output = join(corpus, "reference");
const indexFile = join(output, "reference.json");

// QML set to nothing is unset, as mise-tasks/reference and setup read it. A
// path of its own is read from where reference was started: the examples run
// in a scratch directory. It is only prefixed, never normalized, so a
// `link/..` goes through the link as setup's probe of it did. The probe goes
// without the desktop's Qt platform theme, like the examples: a gtk3 theme
// kills qml when there is no display.
const { QT_QPA_PLATFORMTHEME: _theme, ...untheme } = process.env;
const qml = process.env.QML
  ? !process.env.QML.includes("/") || process.env.QML.startsWith("/")
    ? process.env.QML
    : `${process.cwd()}/${process.env.QML.replace(/^\.\//, "")}`
  : ["qml6", "qml"].find((tool) => spawnSync(tool, ["--help"], { env: { ...untheme, QT_QPA_PLATFORM: "offscreen" } }).status === 0);
if (!qml) {
  console.error("no `qml6` or `qml` tool: install Qt 6 (qt6-declarative), or set QML");
  process.exit(1);
}

// Qt's shader compiler is not on the path where Qt keeps its own tools.
const qsb = process.env.QSB ?? ["qsb", "/usr/lib/qt6/bin/qsb", "/usr/lib/qt6/libexec/qsb"].find((tool) => spawnSync(tool, ["--help"]).status === 0) ?? "qsb";

// The screen the examples see, which the gallery's browser is given too:
// several lay themselves out by `Screen`.
const { screen } = manifest;

// The compositor's windows float at the size they ask for, undecorated, on an
// output that is that screen.
async function compose(directory) {
  const config = join(directory, "sway.conf");
  writeFileSync(
    config,
    [`output HEADLESS-1 resolution ${screen.width}x${screen.height} scale 1`, 'for_window [app_id=".*"] floating enable', "default_border none", ""].join("\n"),
  );
  const environment = { PATH: process.env.PATH, HOME: directory, XDG_RUNTIME_DIR: directory, WLR_BACKENDS: "headless", WLR_LIBINPUT_NO_DEVICES: "1" };
  const sway = spawn("sway", ["-c", config], { env: environment, stdio: "ignore" });
  const gone = new Promise((done) => sway.once("error", done).once("exit", done));
  for (let waited = 0; waited < 5000; waited += 50) {
    const socket = readdirSync(directory).find((name) => /^wayland-\d+$/.test(name));
    if (socket) return { socket, stop: () => (sway.kill(), gone) };
    if (await Promise.race([gone.then(() => true), wait(50)])) break;
  }
  sway.kill();
  return null;
}

// The harness for an entry whose root is an Item: what `QQuickView` with
// `SizeRootObjectToView` shows, on the view's white.
const itemHarness = ({ entry, width, height, settle, png }) => `
import QtQuick
Window {
    width: ${width}; height: ${height}; visible: true
    Rectangle {
        id: stage
        anchors.fill: parent
        color: "white"
        Loader {
            id: loader
            anchors.fill: parent
            source: ${JSON.stringify(entry)}
            onStatusChanged: if (status === Loader.Error) Qt.exit(2)
        }
    }
    Timer {
        interval: ${settle}; running: loader.status === Loader.Ready
        onTriggered: stage.grabToImage(function (result) {
            console.log("reference:" + JSON.stringify({ at: Date.now(), width: stage.width, height: stage.height }))
            Qt.exit(result.saveToFile(${JSON.stringify(png)}) ? 0 : 3)
        })
    }
}
`;

// The harness for an entry whose root is a Window: the window is created as
// `QQmlApplicationEngine` would, and its whole scene (for an ApplicationWindow
// that includes the header, the footer and the popups) is grabbed. A grab
// leaves out the window's own colour, so it is laid over that colour in this
// harness's window and grabbed again. Only one of the two windows shows at a
// time: a compositor tells a window that is behind another of nothing, and Qt
// does not draw one that is told nothing.
const windowHarness = ({ entry, width, height, impose, properties, settle, png }) => `
import QtQuick
Window {
    id: harness
    visible: false
    property var target: null
    property var grab: null
    Rectangle {
        id: stage
        anchors.fill: parent
        color: harness.target ? harness.target.color : "white"
        Image {
            id: scene
            anchors.fill: parent
            cache: false
            onStatusChanged: if (status === Image.Ready) composed.start()
        }
    }
    Component.onCompleted: {
        const component = Qt.createComponent(${JSON.stringify(entry)})
        if (component.status !== Component.Ready) {
            console.error(component.errorString())
            Qt.exit(2)
            return
        }
        const target = component.createObject(null, ${JSON.stringify({ ...(impose ? { width, height } : {}), ...properties })})
        if (!target) {
            console.error(component.errorString())
            Qt.exit(2)
            return
        }
        harness.target = target
        settled.start()
    }
    Timer {
        id: settled
        interval: ${settle}
        onTriggered: {
            const target = harness.target
            harness.width = target.width
            harness.height = target.height
            let root = target.contentItem
            while (root.parent)
                root = root.parent
            root.grabToImage(function (result) {
                harness.grab = result
                target.visible = false
                harness.visible = true
                console.log("reference:" + JSON.stringify({ at: Date.now(), width: root.width, height: root.height }))
                scene.source = result.url
            })
        }
    }
    Timer {
        id: composed
        interval: 100
        onTriggered: stage.grabToImage(function (result) {
            Qt.exit(result.saveToFile(${JSON.stringify(png)}) ? 0 : 3)
        })
    }
}
`;

// A place in the copy for a file the example's directory has not got: the
// directories down to it are the copy's own, of links to what is there.
function place(directory, copy, path) {
  const names = path.split("/");
  for (let depth = 1; depth < names.length; depth += 1) {
    const [original, linked] = [directory, copy].map((root) => join(root, ...names.slice(0, depth)));
    if (!lstatSync(linked).isSymbolicLink()) continue;
    rmSync(linked);
    mkdirSync(linked);
    for (const name of readdirSync(original)) symlinkSync(join(original, name), join(linked, name));
  }
  return join(copy, path);
}

const elsewhere = ["QML_IMPORT_PATH", "QT_PLUGIN_PATH", "LD_LIBRARY_PATH"];

function capture(example, display) {
  const directory = join(examples, example.dir);
  const scratch = mkdtempSync(join(tmpdir(), `qml-reference-${example.id}-`));
  try {
    const home = join(scratch, "home");
    mkdirSync(home);
    writeFileSync(
      join(scratch, "screen.json"),
      JSON.stringify({ screens: [{ name: "reference", x: 0, y: 0, ...screen, logicalDpi: 96, logicalBaseDpi: 96, dpr: 1 }] }),
    );
    // The example is run from a copy of its directory made of links, where
    // the `qmldir` can be put right: one written for a CMake build sends the
    // engine to resources (`prefer :/qt/qml/...`) that the plain tool has not
    // got. When the example imports itself by name (`import examples.Maroon`
    // in `maroon/`) the copy has that name.
    const copy = join(scratch, "modules", ...(example.qt.module ?? "example").split("."));
    mkdirSync(copy, { recursive: true });
    for (const name of readdirSync(directory)) {
      if (name !== "qmldir") symlinkSync(join(directory, name), join(copy, name));
    }
    if (existsSync(join(directory, "qmldir"))) {
      const lines = readFileSync(join(directory, "qmldir"), "utf8").split("\n");
      writeFileSync(join(copy, "qmldir"), lines.filter((line) => !/^(prefer|typeinfo)\b/.test(line)).join("\n"));
    }
    // The shaders its build compiles are compiled here, next to their
    // sources, where the QML names them.
    for (const shader of example.qt.shaders ?? []) {
      const built = spawnSync(qsb, ["--qt6", ...(shader.endsWith(".vert") ? ["-b"] : []), "-o", `${place(directory, copy, shader)}.qsb`, join(directory, shader)], { encoding: "utf8" });
      if (built.status !== 0) return { ok: false, why: `qsb: ${built.error?.message ?? built.stderr}`, warnings: [] };
    }
    // What its build downloads is where the build puts it, once it has
    // been fetched (`mise run assets`).
    for (const [to, from] of assetsOf(example)?.places ?? []) symlinkSync(from, place(directory, copy, to));
    const entry = join(copy, example.entry);
    const importPaths = (example.importPaths ?? []).map((path) => resolve(copy, path));
    if (example.qt.module) importPaths.push(join(scratch, "modules"));
    // What stands in for the example's C++ is QML that Qt takes too: the
    // picture is of the example with the same types the web gives it.
    const standins = join(corpus, "standins", example.id);
    if (existsSync(standins)) importPaths.push(standins);
    // A module of the example's whose `qmldir` its build writes gets one
    // here: its files, and what stands in for its C++, which those files
    // name without importing anything.
    for (const [uri, path] of Object.entries(example.modules ?? {})) {
      const [module, standin] = [join(directory, path), join(standins, ...uri.split("."))];
      if (uri.includes("*") || existsSync(join(module, "qmldir"))) continue;
      const qmldir = place(directory, copy, join(path, "qmldir"));
      const lines = [`module ${uri}`];
      // Its files are those its build names, which may be in directories
      // of its own, or else those that are in it.
      const cmake = existsSync(join(module, "CMakeLists.txt")) ? readFileSync(join(module, "CMakeLists.txt"), "utf8") : "";
      const named = /\bQML_FILES\s+((?:(?![A-Z_]{2,}\b|\))\S+\s+)*)/.exec(cmake)?.[1].split(/\s+/).filter((file) => existsSync(join(module, file)));
      for (const file of named?.length ? named : readdirSync(module)) {
        const name = /([A-Z]\w*)(?:\.ui)?\.qml$/.exec(file)?.[1];
        if (!name || (!named?.length && file.includes("/"))) continue;
        const singleton = /^\s*pragma\s+Singleton\b/m.test(readFileSync(join(module, file), "utf8"));
        lines.push(`${singleton ? "singleton " : ""}${name} 1.0 ${file}`);
      }
      if (existsSync(join(standin, "qmldir"))) {
        for (const name of readdirSync(standin)) {
          if (name !== "qmldir") symlinkSync(join(standin, name), join(dirname(qmldir), name));
        }
        lines.push(...readFileSync(join(standin, "qmldir"), "utf8").split("\n").filter((line) => line.trim() && !line.startsWith("module ")));
      }
      if (lines.length > 1) writeFileSync(qmldir, lines.join("\n") + "\n");
    }

    const png = join(scratch, "reference.png");
    const harness = example.root === "Window" ? windowHarness : itemHarness;
    writeFileSync(
      join(scratch, "harness.qml"),
      harness({
        entry: pathToFileURL(entry).href,
        width: example.window.width,
        height: example.window.height,
        impose: example.window.imposed ?? false,
        properties: example.qt.properties ?? {},
        settle: example.qt.settle ?? 1500,
        png,
      }),
    );

    const environment = {
      PATH: process.env.PATH,
      HOME: home,
      XDG_CONFIG_HOME: join(home, ".config"),
      XDG_DATA_HOME: join(home, ".local/share"),
      XDG_CACHE_HOME: join(home, ".cache"),
      XDG_RUNTIME_DIR: display?.directory ?? process.env.XDG_RUNTIME_DIR ?? scratch,
      LANG: "en_US.UTF-8",
      TZ: "UTC",
      ...(display
        ? { QT_QPA_PLATFORM: "wayland", WAYLAND_DISPLAY: display.socket, QT_WAYLAND_DISABLE_WINDOWDECORATION: "1" }
        : { QT_QPA_PLATFORM: `offscreen:configfile=${join(scratch, "screen.json")}` }),
      ...Object.fromEntries(elsewhere.filter((name) => process.env[name]).map((name) => [name, process.env[name]])),
      QT_FORCE_STDERR_LOGGING: "1",
      QT_SCALE_FACTOR: "1",
      QML_DISABLE_DISK_CACHE: "1",
      // Glyphs as the font's rasterizer draws them, which is how a browser's
      // are drawn; laid out where Qt lays them out either way.
      QML_DISABLE_DISTANCEFIELD: "1",
      ...(example.qt.style ? { QT_QUICK_CONTROLS_STYLE: example.qt.style } : {}),
      ...(example.qt.controlsConf ? { QT_QUICK_CONTROLS_CONF: resolve(directory, example.qt.controlsConf) } : {}),
      ...(example.qt.env ?? {}),
    };
    const args = [...importPaths.flatMap((path) => ["-I", path]), join(scratch, "harness.qml")];
    // Without a network: in a network namespace of its own, which has none.
    const command = example.qt.offline ? ["unshare", "--map-root-user", "--net", qml, ...args] : [qml, ...args];
    const run = spawnSync(command[0], command.slice(1), { env: environment, encoding: "utf8", timeout: 30000, cwd: scratch });
    const log = (run.stderr ?? "") + (run.stdout ?? "");
    const captured = /reference:(\{.*\})/.exec(log);
    const warnings = log
      .split("\n")
      .filter((line) => line.trim() && !line.includes("reference:{"))
      .map((line) => line.replaceAll(pathToFileURL(copy).href + "/", "").replaceAll(scratch, "<scratch>"));
    if (run.status !== 0 || !captured || !existsSync(png) || statSync(png).size === 0) {
      const why = run.error?.code === "ETIMEDOUT" ? "timed out" : `exit ${run.status ?? run.signal}`;
      return { ok: false, why, warnings };
    }
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, `${example.id}.png`), readFileSync(png));
    return { ok: true, ...JSON.parse(captured[1]), warnings };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const wanted = process.argv.slice(2);
const unknown = wanted.filter((id) => !manifest.examples.some((example) => example.id === id));
if (unknown.length) {
  console.error(`no such example: ${unknown.join(", ")}`);
  process.exit(1);
}
const index = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, "utf8")) : {};
const runtime = mkdtempSync(join(tmpdir(), "qml-reference-"));
chmodSync(runtime, 0o700);
const composed = spawnSync("sway", ["--version"]).status === 0 ? await compose(runtime) : null;
const display = composed && { directory: runtime, socket: composed.socket };
if (!display) console.log("no headless `sway`: drawn in software, without shader effects");
let failed = 0;
for (const example of manifest.examples) {
  if (wanted.length ? !wanted.includes(example.id) : !example.qt.runnable) continue;
  if (!example.qt.runnable) {
    console.log(`${example.id}: not run, ${example.qt.reason}`);
    continue;
  }
  const result = capture(example, display);
  for (const warning of result.warnings) console.log(`  ${warning}`);
  if (!result.ok) {
    failed += 1;
    console.log(`${example.id}: FAILED (${result.why})`);
    continue;
  }
  const { width, height } = example.window;
  const size = result.width === width && result.height === height ? "" : ` (the manifest says ${width}x${height})`;
  if (size) failed += 1;
  index[example.id] = { capturedAt: result.at, width: result.width, height: result.height };
  console.log(`${example.id}: ${result.width}x${result.height}${size}`);
}
if (existsSync(output)) {
  const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(indexFile, JSON.stringify(sorted, null, 2) + "\n");
}
await composed?.stop();
rmSync(runtime, { recursive: true, force: true });
process.exit(failed ? 1 : 0);

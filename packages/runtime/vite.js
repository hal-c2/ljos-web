// Vite plugin: a `.qml` import is compiled by `qmlc` as it is loaded, and so
// is a script it imports.
//
// Much of Qt is QML itself: a style of Qt Quick Controls is a directory of
// QML files over the types of QtQuick.Templates. Those are not rewritten
// here. A module of Qt's is put together from what the runtime has of it
// (the types Qt has in C++) and the QML files of the Qt that is installed,
// compiled as any other. A type Qt has in C++ and the runtime does not have
// yet is there all the same, to say so when it is used: a style names every
// control, and a program that uses three of them needs those three.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, delimiter, dirname, isAbsolute, join, sep } from "node:path";
import { searchForWorkspaceRoot } from "vite";

// What marks a `.js` file as the script a QML file imports
// (`import "logic.js" as Logic`), which `qmlc` makes a module of.
const SCRIPT = "qml";

const isScript = (id) => {
  const [file, query] = id.split("?");
  return file.endsWith(".js") && new URLSearchParams(query).has(SCRIPT);
};

// The modules the runtime has, by what they are imported as.
const runtime = import.meta.dirname;
const natives = () => JSON.parse(readFileSync(join(runtime, "package.json"), "utf8")).exports;

// `ljos-web/QtQuick/Controls`: a module of Qt's, not `ljos-web/object`.
const MODULE = /^ljos-web\/(Qt[\w/]*)$/;
const VIRTUAL = "\0ljos-web:";
// Qt's own QML is of no program, and takes the style of the one that came
// to it: its address says which (`DebugView.qml?for=Material`), and so does
// that of each module on the way.
const FOR = "for";
const carried = (importer) => new URLSearchParams(importer?.split("?")[1]).get(FOR);
// The part of a module that is the types nothing has yet, which the QML of
// the module itself may name: it is there before they are.
const ABSENT = "absent";
const path = (uri) => uri.replaceAll(".", "/");

// A style of the program's own is a directory of QML files: the types its
// `qmldir` names, or each file that could be one when it has none, as a
// module CMake is yet to write the `qmldir` of.
const bespoke = (style) => (style && isAbsolute(style) ? style : null);
function tailored(directory) {
  const about = described(directory);
  if (about) return [...about.types].map(([name, file]) => [name, join(directory, file)]);
  return readdirSync(directory)
    .filter((name) => /^[A-Z]\w*\.qml$/.test(name))
    .map((name) => [name.slice(0, -4), join(directory, name)]);
}
// What a style is called where only a name will do: a file selector.
const called = (style) => (bespoke(style) ? basename(style) : style);
// What Qt falls back on for the controls such a style does not have.
const FALLBACK = "Basic";

// What the Qt installed here says of itself: where it keeps its QML modules
// and its tools, and which Qt it is.
function installed() {
  for (const tool of ["qtpaths6", "qtpaths", "qmake6"]) {
    const ask = (what) => {
      const asked = spawnSync(tool, [tool.startsWith("qmake") ? "-query" : "--query", what], { encoding: "utf8" });
      return asked.status === 0 ? asked.stdout.trim() : "";
    };
    const qml = ask("QT_INSTALL_QML");
    if (qml) return { qml, bins: ask("QT_INSTALL_BINS"), version: ask("QT_VERSION") };
  }
  return {};
}

// `qrc:/qt-project.org/imports/QtQuick/Controls/Basic/images/check.png`:
// where a module of Qt's keeps the pictures its QML names, inside the plugin
// that is the module. They are read out of it by Qt's own `qml` tool, into
// `directory`, once.
const KEPT = "qrc:/qt-project.org/imports";
// `qrc:/qtquick3deffects/shaders/blur.frag`: what else the QML of a module
// names that its plugin keeps, under a name of the plugin's own: the shaders
// of an effect of QtQuick3D.Effects, and the pictures they read.
const LODGED = /qrc:\/((?!qt-project\.org\/)[\w-]+(?:\/[\w-]+)*)\/[\w.-]+/g;

const EXTRACT = (uri, folder) => `import QtQml
import Qt.labs.folderlistmodel
import ${uri} as Module

QtObject {
    id: root
    property FolderListModel folder: FolderListModel {
        showDirs: false
        folder: "${folder}"
        onStatusChanged: if (status === FolderListModel.Ready) root.read()
    }
    property Timer late: Timer { interval: 5000; running: true; onTriggered: Qt.quit() }
    function read() {
        for (let i = 0; i < folder.count; i++) {
            const name = folder.get(i, "fileName")
            const get = new XMLHttpRequest()
            get.open("GET", folder.folder + "/" + name, false)
            get.responseType = "arraybuffer"
            get.send()
            console.log("kept", name, Qt.btoa(get.response))
        }
        Qt.quit()
    }
}
`;

function extract(tool, uri, folder, directory) {
  mkdirSync(directory, { recursive: true });
  const script = join(directory, ".extract.qml");
  writeFileSync(script, EXTRACT(uri, folder));
  const ran = spawnSync(tool, [script], {
    encoding: "utf8",
    timeout: 20000,
    maxBuffer: 1 << 26,
    // Without a terminal Qt logs to the journal; without a display it has
    // nowhere to be.
    env: { ...process.env, QT_FORCE_STDERR_LOGGING: "1", QML_XHR_ALLOW_FILE_READ: "1", QT_QPA_PLATFORM: "offscreen" },
  });
  if (ran.error) return ran.error.message;
  for (const [, name, data] of ran.stderr.matchAll(/kept (\S+) (\S+)/g)) {
    writeFileSync(join(directory, name), Buffer.from(data, "base64"));
  }
  return null;
}

// `wave.frag.qsb`: a shader as Qt draws with it, baked by Qt's `qsb` tool
// from its source, `wave.frag`, when a program is built. It is baked here
// likewise when it is not there. In what is baked is the same shader for
// each way of drawing Qt knows: a browser's is OpenGL ES, and that text is
// what the runtime is given.
const BAKED = ".qsb";

function baked(context, tool, file, directory) {
  let read = file;
  const run = (args) => {
    const ran = spawnSync(tool, args, { encoding: "utf8", maxBuffer: 1 << 26 });
    if (ran.error) context.error(`could not run ${tool}: ${ran.error.message}`);
    if (ran.status !== 0) context.error(ran.stderr.trim() || `${tool} could not read ${file}`);
    return ran.stdout;
  };
  if (existsSync(file)) context.addWatchFile(file);
  else {
    const source = file.slice(0, -BAKED.length);
    if (!existsSync(source)) context.error(`${file} is not there, nor is ${source} to bake it from`);
    context.addWatchFile(source);
    mkdirSync(directory, { recursive: true });
    read = join(directory, `${createHash("sha1").update(file).digest("hex")}${BAKED}`);
    run(["--glsl", "300 es", "-o", read, source]);
  }
  const shaders = new Map();
  for (const part of run(["-d", read]).split(/^\*{8,}$/m)) {
    const [, level, text] = part.match(/^Shader \d+: GLSL (\d+ es) \[Standard\]\nEntry point: \w+\nContents:\n([^]*)$/m) ?? [];
    if (level) shaders.set(level, text.trim() + "\n");
  }
  const text = shaders.get("300 es") ?? shaders.get("100 es");
  if (!text) context.error(`${file} has no shader for OpenGL ES in it`);
  return `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
}

// What a `qmldir` says its module is made of: the QML files that are its
// types, and the modules that come with it. Of `optional import`s one comes,
// the `default import` when the program chooses no other: a style.
function described(directory) {
  const file = join(directory, "qmldir");
  if (!existsSync(file)) return null;
  const types = new Map();
  const imports = [];
  const defaults = [];
  let optional = false;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const words = line.split("#")[0].trim().split(/\s+/);
    if (words[0] === "singleton" || words[0] === "internal") words.shift();
    if (words[0] === "import" && words[1]) imports.push(words[1]);
    else if (words[0] === "optional" && words[1] === "import") optional = true;
    else if (words[0] === "default" && words[1] === "import" && words[2]) defaults.push(words[2]);
    else if (/^[A-Z]/.test(words[0] ?? "") && words.at(-1).endsWith(".qml") && words.length <= 3) types.set(words[0], words.at(-1));
  }
  // With nothing to choose from, a default is an import as any other.
  if (!optional) imports.push(...defaults);
  return { file, types, imports, style: optional ? (defaults[0] ?? null) : null };
}

// What a `qtquickcontrols2.conf` says, by its groups: `[Material]`, and
// under it `Theme=Dark`.
function conf(file) {
  const groups = {};
  let group = null;
  for (const line of existsSync(file) ? readFileSync(file, "utf8").split("\n") : []) {
    const text = line.trim();
    const named = text.match(/^\[(.*)\]$/);
    if (named) group = groups[named[1]] ??= {};
    else if (group && /^[^;#=][^=]*=/.test(text)) {
      const at = text.indexOf("=");
      group[text.slice(0, at).trim()] = text.slice(at + 1).trim().replace(/^"(.*)"$/, "$1");
    }
  }
  return groups;
}

// The names a module of the runtime's exports, its `export *` followed.
function exported(context, file, names = new Set(), seen = new Set()) {
  if (seen.has(file) || !existsSync(file)) return names;
  seen.add(file);
  context.addWatchFile(file);
  for (const node of context.parse(readFileSync(file, "utf8")).body) {
    if (node.type === "ExportAllDeclaration") {
      if (node.exported) names.add(node.exported.name ?? node.exported.value);
      else if (/^\.\.?\//.test(node.source.value)) exported(context, join(dirname(file), node.source.value), names, seen);
    } else if (node.type === "ExportNamedDeclaration") {
      for (const specifier of node.specifiers) names.add(specifier.exported.name ?? specifier.exported.value);
      if (node.declaration?.id) names.add(node.declaration.id.name);
      for (const declarator of node.declaration?.declarations ?? []) names.add(declarator.id.name);
    }
  }
  return names;
}

// - `qmlc`, `args`: the compiler and what it is run with, or a function of
//   the file compiled that gives that: `--urls-on-assignment` for a program
//   that sets `QML_COMPAT_RESOLVE_URLS_ON_ASSIGNMENT`, whose paths are taken
//   from the file they are written in whatever they are given to.
// - `qt`: where the QML modules of Qt are, when not where `qtpaths` says:
//   a directory, or several, a module being of the first to have it. When
//   not given, `QML_IMPORT_PATH` names more of them, as it does to Qt.
// - `style`: what `import QtQuick.Controls` is, "Material" or "Fusion": a
//   name, or a function of the file that imports it when the files of one
//   build are not all of one style. Otherwise the one the settings name,
//   and Qt's default when there is none. A directory is a style of the
//   program's own, as `QQuickStyle::setStyle` takes one: the controls its
//   QML files are, and Basic's for the rest.
// - `controls`: the settings of Qt Quick Controls, which an application of
//   Qt's has in its `qtquickcontrols2.conf`: that file, or its groups
//   (`{ Material: { Theme: "Dark" } }`), or a function of the file that
//   imports the controls, as `style` is.
// - `standins`: directories of QML modules, each with its `qmldir`, that
//   stand in for the types a program has in C++, where there is no C++: or
//   a function of the file compiled that gives them.
// - `root`: the directory of the project, whose modules are the `qmldir`
//   and `CMakeLists.txt` files under it: or a function of the file compiled
//   that gives it. Otherwise each file's is the nearest directory above it
//   whose `CMakeLists.txt` starts a project, or its own.
// - `importPaths`: directories looked in for a module before the root, as
//   Qt's `-I` (`mocks`, so that `App.Media` is `mocks/App/Media`), the first
//   to have it deciding: or a function of the file compiled that gives them.
export default function qml({ qmlc = "qmlc", args = [], qt, style, controls, standins = [], root, importPaths = [] } = {}) {
  let asked;
  const found = () => (asked ??= installed());
  const elsewhere = process.env.QML_IMPORT_PATH?.split(delimiter) ?? [];
  const roots = [qt ?? [...elsewhere, process.env.QT_INSTALL_QML ?? found().qml]].flat().filter(Boolean);
  // Where a module of Qt's is: null when Qt has none of that name here.
  const home = (module) => {
    const root = roots.find((root) => existsSync(join(root, module, "qmldir")));
    return root ? join(root, module) : null;
  };
  const set = (importer) => {
    const given = typeof controls === "function" ? controls(importer) : controls;
    const groups = typeof given === "string" ? conf(given) : given;
    return groups && Object.keys(groups).length > 0 ? groups : null;
  };
  // `Default` is what the style Qt falls back on was once called.
  const styled = (importer) =>
    (typeof style === "function" ? style(importer) : style) ?? set(importer)?.Controls?.Style?.replace(/^Default$/, "Basic");
  const stood = (file) => (typeof standins === "function" ? standins(file) : standins) ?? [];
  const rooted = (file) => (typeof root === "function" ? root(file) : root);
  const looked = (file) => (typeof importPaths === "function" ? importPaths(file) : importPaths) ?? [];
  const compiled = new Map();
  let cache = join(runtime, "node_modules/.vite/ljos-web");
  // The pictures of a module, by what its QML names them: next to the QML
  // when the installation has them there, otherwise read out of the plugin
  // when the QML names any, or what the runtime has of the module does: the
  // QML of the Imagine style asks `Imagine` where its pictures are. An `@2x`
  // one is for a screen that is not asked about yet. Its shaders likewise:
  // those are baked, and inside the plugin.
  const kept = (module, about, kind) => {
    const native = natives()[`./${module}`];
    const files = [...[...about.types.values()].map((file) => join(home(module), file)), ...(native ? [join(runtime, native)] : [])];
    const texts = files.map((file) => readFileSync(file, "utf8"));
    const stored = (owner, named) => {
      const folder = `${KEPT}/${owner}/${kind}`;
      let directory = join(home(owner) ?? "", kind);
      if (!home(owner) || !existsSync(directory)) {
        if (!named(folder)) return [];
        const { bins, version } = found();
        directory = join(cache, version || "qt", owner, kind);
        if (!existsSync(directory)) {
          const failed = extract(join(bins || "", "qml"), owner.replaceAll("/", "."), folder, directory);
          if (failed) console.warn(`ljos-web: the ${kind} of ${owner} could not be read out of Qt: ${failed}`);
        }
      }
      return readdirSync(directory)
        .filter((name) => !name.startsWith(".") && !name.includes("@"))
        .map((name) => [`${folder}/${name}`, join(directory, name)]);
    };
    // And those of another module that its QML names: what a style draws
    // with is the style's, and named by the module beside it that draws.
    const theirs = new RegExp(`${KEPT}/([\\w/]+)/${kind}/`, "g");
    const others = new Set(texts.flatMap((text) => [...text.matchAll(theirs)].map(([, owner]) => owner)));
    others.delete(module);
    return [...stored(module, (folder) => texts.some((text) => text.includes(folder))), ...[...others].sort().flatMap((owner) => stored(owner, () => true))];
  };
  // And what else its QML names that is in the plugin, a folder at a time:
  // read out of it likewise. A shader is no picture to Vite, which is asked
  // for where each file is and not for what is in it.
  const lodged = (module, about) => {
    const texts = [...about.types.values()].map((file) => readFileSync(join(home(module), file), "utf8"));
    const folders = new Set(texts.flatMap((text) => [...text.matchAll(LODGED)].map(([, folder]) => folder)));
    const { bins, version } = found();
    return [...folders].sort().flatMap((folder) => {
      const directory = join(cache, version || "qt", module, ...folder.split("/"));
      if (!existsSync(directory)) {
        const failed = extract(join(bins || "", "qml"), module.replaceAll("/", "."), `qrc:/${folder}`, directory);
        if (failed) console.warn(`ljos-web: ${folder} of ${module} could not be read out of Qt: ${failed}`);
      }
      const names = readdirSync(directory).filter((name) => !name.startsWith(".") && !name.includes("@"));
      // Nothing read is not kept: the next build asks Qt again.
      if (names.length === 0) {
        console.warn(`ljos-web: nothing of ${folder} could be read out of Qt's ${module.replaceAll("/", ".")}`);
        rmSync(directory, { recursive: true, force: true });
      }
      return names.map((name) => [`qrc:/${folder}/${name}`, `${join(directory, name)}?url`]);
    });
  };
  // The types Qt has of a module in C++, as the compiler's table has them:
  // what the runtime is to have of it. None for a module the table lacks.
  const tables = new Map();
  const listed = (kind, module) => {
    const key = `${kind} ${module}`;
    if (!tables.has(key)) {
      const asked = spawnSync(qmlc, [kind, module.replaceAll("/", ".")], { encoding: "utf8" });
      const names = asked.status === 0 ? asked.stdout.trim().split(" ").slice(1) : [];
      tables.set(key, names.length > 0 ? names : null);
    }
    return tables.get(key);
  };
  const needed = (module) => listed("--types", module);
  // The types Qt has of it as QML files, which are of Qt's installation and
  // not of the runtime: what there is none of where Qt has no such module.
  const written = (module) => (home(module) ? null : listed("--qml-types", module));
  // What Qt's installation says of a module, when it is worth reading: one
  // with QML files or a style, or one that only brings others.
  const composed = (module, seen = []) => {
    const directory = seen.includes(module) ? null : home(module);
    const about = directory ? described(directory) : null;
    if (!about) return null;
    if (about.types.size > 0 || about.style) return about;
    return about.imports.some((uri) => has(path(uri), [...seen, module])) ? about : null;
  };
  // `QML`, which QtQml's `qmldir` imports, is no module to import: what is
  // in it the runtime has in QtQml.
  const has = (module, seen = []) =>
    /^Qt/.test(module) && Boolean(natives()[`./${module}`] || needed(module) || written(module) || composed(module, seen));
  // Whether what a module of Qt's is depends on the style: it has the choice
  // of one, or its QML or what it brings comes to a module that has. Only
  // such a module is one for each style; any other is the same for all.
  const sways = new Map();
  const swayed = (module, seen = []) => {
    if (sways.has(module)) return sways.get(module);
    const about = seen.includes(module) ? null : composed(module);
    if (!about) return false;
    const named = [...about.types.values()].flatMap((file) =>
      [...readFileSync(join(home(module), file), "utf8").matchAll(/^\s*import\s+([A-Za-z][\w.]*)/gm)].map(([, uri]) => uri),
    );
    const others = [...new Set([...about.imports, ...named])].map(path);
    const sway = Boolean(about.style) || others.some((other) => other !== module && swayed(other, [...seen, module]));
    if (seen.length === 0) sways.set(module, sway);
    return sway;
  };
  // What a module is made of, in the order that decides whose a name is:
  // what the runtime has of it and its QML files, then what it brings, each
  // name from the first module to have it, and last what Qt has in C++ and
  // nothing here does. Where Qt has no such module here its QML files are
  // named all the same, to say so. Names and not `export *`: a name two
  // modules have is one no file can import.
  const made = (context, module, chosen, seen = []) => {
    const about = composed(module);
    const native = natives()[`./${module}`];
    const names = new Set();
    if (native) exported(context, join(runtime, native), names);
    for (const name of about?.types.keys() ?? []) names.add(name);
    const uninstalled = (written(module) ?? []).filter((name) => !names.has(name));
    for (const name of uninstalled) names.add(name);
    const styles = about?.style?.split(".");
    // The program's own style comes before the one that fills in for it.
    const fitted = styles && bespoke(chosen) ? tailored(chosen) : [];
    for (const [name] of fitted) names.add(name);
    const named = bespoke(chosen) ? FALLBACK : chosen;
    const imports = styles ? [[...styles.slice(0, -1), named ?? styles.at(-1)].join(".")] : (about?.imports ?? []);
    const brought = [];
    for (const uri of imports.map(path)) {
      if (uri === module || seen.includes(uri) || !has(uri)) continue;
      const theirs = [...made(context, uri, undefined, [...seen, module]).names].filter((name) => name !== "default" && !names.has(name));
      for (const name of theirs) names.add(name);
      if (theirs.length > 0) brought.push([uri, theirs]);
    }
    const missing = (needed(module) ?? []).filter((name) => !names.has(name));
    for (const name of missing) names.add(name);
    return { about, native, brought, missing, uninstalled, names, fitted };
  };
  return {
    name: "ljos-web",
    // Before Vite's own: a script is told from any other `.js` file by who
    // imports it, and only here is that known.
    enforce: "pre",
    configResolved(config) {
      cache = join(config.cacheDir, "ljos-web");
    },
    // Qt's own QML is outside the project. What the runtime itself is built
    // on that is no module (SQLite, for QtQuick.LocalStorage) is bundled
    // for the browser before a page asks for it.
    config(config) {
      const optimizeDeps = { include: ["ljos-web > sql.js"] };
      if (roots.length === 0) return { optimizeDeps };
      const allowed = config.server?.fs?.allow ? [] : [searchForWorkspaceRoot(config.root ?? process.cwd())];
      return { optimizeDeps, server: { fs: { allow: [...allowed, ...roots] } } };
    },
    async resolveId(source, importer, options) {
      if (source.startsWith(VIRTUAL)) return source;
      const module = source.match(MODULE)?.[1];
      const carry = styled(importer) ?? carried(importer);
      if (module && has(module)) {
        const chosen = composed(module)?.style;
        const query = new URLSearchParams();
        if (chosen) query.set("style", carry ?? chosen.split(".").at(-1));
        // The settings go with the controls, and with a style imported by
        // its own name: whichever a program has first tells the runtime.
        const settings = chosen || /^QtQuick\/Controls\/[A-Z]\w*$/.test(module) ? set(importer) : null;
        // In letters an address keeps as they are, whoever passes it on.
        if (settings) query.set("controls", Buffer.from(JSON.stringify(settings)).toString("base64url"));
        if (carry && swayed(module)) query.set(FOR, carry);
        return `${VIRTUAL}${module}${query.size > 0 ? `?${query}` : ""}`;
      }
      if (!importer || (!importer.split("?")[0].endsWith(".qml") && !isScript(importer))) return null;
      // A baked shader is made here, whether or not the file is there.
      if (source.endsWith(BAKED) && /^\.\.?\//.test(source)) return join(dirname(importer.split("?")[0]), source);
      // What compiled QML imports is the runtime's to find, wherever the QML
      // is: Qt's own is in no project.
      if (/^[\w@]/.test(source)) {
        const found = await this.resolve(source, importer, { ...options, skipSelf: true }).catch(() => null);
        if (found) return found;
        const own = natives()[source.replace(/^ljos-web(?=\/)/, ".")];
        return own ? join(runtime, own) : this.resolve(source, join(runtime, "index.js"), { ...options, skipSelf: true });
      }
      // What Qt's own QML has next to it is of the same program.
      if (source.endsWith(".qml") && /^\.\.?\//.test(source) && carried(importer)) {
        const next = await this.resolve(source, importer, { ...options, skipSelf: true });
        return !next || next.id.includes("?") ? next : { ...next, id: `${next.id}?${FOR}=${carried(importer)}` };
      }
      if (!source.endsWith(".js") || !/^\.\.?\//.test(source)) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved || resolved.external || resolved.id.includes("?")) return resolved;
      return { ...resolved, id: `${resolved.id}?${SCRIPT}` };
    },
    load(id) {
      if (id.startsWith(VIRTUAL)) {
        const [module, query] = id.slice(VIRTUAL.length).split("?");
        const asked = new URLSearchParams(query);
        const { about, native, brought, missing, uninstalled, fitted } = made(this, module, asked.get("style") ?? undefined);
        const kernel = JSON.stringify(join(runtime, natives()["./object"]));
        const lines = [];
        // What Qt has of it and the runtime does not, yet, and what Qt would
        // have of it as QML were that module of Qt's installed.
        if (asked.has(ABSENT)) {
          const uri = JSON.stringify(module.replaceAll("/", "."));
          lines.push(`import { absent as $absent } from ${kernel};`);
          for (const name of missing) lines.push(`export const ${name} = /* @__PURE__ */ $absent(${uri}, ${JSON.stringify(name)});`);
          for (const name of uninstalled) lines.push(`export const ${name} = /* @__PURE__ */ $absent(${uri}, ${JSON.stringify(name)}, false);`);
          return { code: lines.join("\n") + "\n", map: null };
        }
        const carry = asked.has(FOR) ? `?${FOR}=${asked.get(FOR)}` : "";
        // What the runtime has of the module: the types Qt has in C++.
        if (native) lines.push(`export * from ${JSON.stringify(join(runtime, native))};`);
        // Those come before the QML, which is in the module it imports.
        const stubbed = [...missing, ...uninstalled];
        if (stubbed.length > 0) lines.push(`export { ${stubbed.join(", ")} } from ${JSON.stringify(`${id}${query ? "&" : "?"}${ABSENT}`)};`);
        if (about) {
          this.addWatchFile(about.file);
          // Its QML files, which come before a type of the same name the
          // runtime has: a named export hides one that `export *` brings.
          for (const [name, file] of about.types) {
            lines.push(`export { default as ${name} } from ${JSON.stringify(join(home(module), file) + carry)};`);
          }
          const pictures = [...kept(module, about, "images"), ...kept(module, about, "shaders").filter(([, file]) => file.endsWith(BAKED)), ...lodged(module, about)];
          if (pictures.length > 0) {
            lines.push(`import { resources as $resources } from ${kernel};`);
            pictures.forEach(([url, file], index) => {
              lines.push(`import $${index} from ${JSON.stringify(file)};`, `$resources.set(${JSON.stringify(url)}, $${index});`);
            });
          }
        }
        for (const [name, file] of fitted) lines.push(`export { default as ${name} } from ${JSON.stringify(file)};`);
        for (const [uri, names] of brought) lines.push(`export { ${names.join(", ")} } from "ljos-web/${uri}";`);
        // A style is told to what it is the style of: what is not QML in it
        // (the colours and fonts of a control) goes by which was chosen.
        if (asked.has("style") && brought.length > 0) {
          const uri = (module) => JSON.stringify(module.replaceAll("/", "."));
          lines.push(`import { chosen as $chosen } from ${kernel};`, `$chosen.set(${uri(module)}, ${uri(brought[0][0])});`);
        }
        // And what the application's settings say of the styles: a style
        // takes its own group of them.
        if (asked.has("controls")) {
          const settings = JSON.stringify(join(runtime, "QtQuick/Controls/settings.js"));
          lines.push(`import { configure as $configure } from ${settings};`, `$configure(${Buffer.from(asked.get("controls"), "base64url")});`);
        }
        return { code: lines.join("\n") + "\n", map: null };
      }
      const [file] = id.split("?");
      if (file.endsWith(BAKED)) {
        const text = baked(this, join(found().bins || "", "qsb"), file, join(cache, "shaders"));
        return { code: `export default ${JSON.stringify(text)};\n`, map: null };
      }
      if (!file.endsWith(".qml") && !isScript(id)) return null;
      // A component is compiled with the files next to it: what they set on
      // its instances decides what it takes. A build that watches rebuilds
      // it when any of them changes.
      const directory = dirname(file);
      for (const sibling of readdirSync(directory)) {
        if (sibling.endsWith(".qml")) this.addWatchFile(join(directory, sibling));
      }
      // The style of the controls is a file selector, as it is in Qt: a
      // file with one of the same name in `+Material` is that one there.
      const selector = called(styled(file));
      const selected = selector ? join(directory, `+${selector}`) : null;
      if (selected && existsSync(selected)) {
        for (const variant of readdirSync(selected)) {
          if (variant.endsWith(".qml")) this.addWatchFile(join(selected, variant));
        }
      }
      // What stands in for a type decides what it takes likewise.
      const more = stood(file);
      for (const directory of more) {
        if (!existsSync(directory)) continue;
        for (const name of readdirSync(directory, { recursive: true })) {
          if (name.endsWith(".qml") || name.endsWith("qmldir")) this.addWatchFile(join(directory, name));
        }
      }
      // Qt's own is compiled once, whichever programs come to it.
      const own = roots.some((root) => file.startsWith(root + sep));
      if (own && compiled.has(file)) return { code: compiled.get(file), map: null };
      // Where Qt's modules are is told, so that a module of the installed
      // Qt's is one `qmlc` knows to be installed.
      const project = rooted(file);
      const given = [
        ...(typeof args === "function" ? args(file) : args),
        ...(project ? ["--root", project] : []),
        ...looked(file).flatMap((directory) => ["-I", directory]),
        ...more.flatMap((directory) => ["--with", directory]),
        ...roots.flatMap((root) => ["--qt", root]),
        ...(selector ? ["--select", selector] : []),
      ];
      const result = spawnSync(qmlc, [...given, file], {
        encoding: "utf8",
      });
      if (result.error) this.error(`could not run ${qmlc}: ${result.error.message}`);
      if (result.status !== 0) this.error(result.stderr.trim());
      if (own) compiled.set(file, result.stdout);
      return { code: result.stdout, map: null };
    },
    // The same for the dev server: a changed file takes the compiled output
    // of its whole directory with it.
    hotUpdate({ file, modules }) {
      if (!file.endsWith(".qml")) return;
      const directory = dirname(file);
      const affected = new Set(modules);
      for (const module of this.environment.moduleGraph.idToModuleMap.values()) {
        if (module.file?.endsWith(".qml") && dirname(module.file) === directory) affected.add(module);
      }
      return [...affected];
    },
  };
}

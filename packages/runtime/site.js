// A static site from a directory that says what it is: `ljos-site.json`, the
// site contract (format "ljos-site", version 1, target "web"). Whoever wrote
// the directory (a designer's export, a script) chose its files; this holds
// them to what the manifest promises, compiles the entry with `qmlc` through
// the Vite plugin with the directory as the project's root, and has Vite
// write `index.html` and its assets. Nothing of whoever wrote it is needed.
//
// Everything the manifest rules out is refused before anything is compiled
// or written: a field it does not have, a file it does not list or lists
// wrong, a path out of the directory, a link, a module without its qmldir,
// an import ljos-web does not provide.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, posix, resolve } from "node:path";
import { build } from "vite";
import { provided } from "./modules.js";
import qml, { installed } from "./vite.js";

const runtime = import.meta.dirname;

export const MANIFEST = "ljos-site.json";
// A site this wrote says so, and only such a site is replaced.
export const STAMP = ".ljos-site-build";

// A refusal: the bundle is not what its manifest promises, or the build
// lacks what the bundle needs.
export class SiteError extends Error {
  constructor(message) {
    super(message);
    this.name = "SiteError";
  }
}

// The manifest's fields by the contract's words. Each is required unless
// marked optional; a field that is not here is refused.
const SHAPE = {
  format: "string",
  version: "number",
  target: "string",
  entry: "string",
  theme: { optional: "string" },
  blocks: [{ block: "string", file: "string" }],
  files: [{ path: "string", bytes: "number" }],
  left_out: [{ path: "string", why: "string" }],
  modules: [{ module: "string", qmldir: "string" }],
  imports: ["string"],
  ljos_web: "string",
};

function shaped(value, shape, where) {
  if (typeof shape === "string") {
    if (typeof value !== shape) throw new SiteError(`${where} is not a ${shape}`);
    return;
  }
  if (Array.isArray(shape)) {
    if (!Array.isArray(value)) throw new SiteError(`${where} is not a list`);
    value.forEach((item, index) => shaped(item, shape[0], `${where}[${index}]`));
    return;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new SiteError(`${where} is not an object`);
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(shape, key)) throw new SiteError(`${where} has a field the contract does not: ${key}`);
  }
  for (const [key, field] of Object.entries(shape)) {
    const optional = typeof field === "object" && !Array.isArray(field) && Object.hasOwn(field, "optional");
    if (!Object.hasOwn(value, key)) {
      if (optional) continue;
      throw new SiteError(`${where} has no ${key}`);
    }
    shaped(value[key], optional ? field.optional : field, `${where}.${key}`);
  }
}

// A path the contract allows: plain names below the bundle, none of them a
// designer's own (its mock modules, its state) or types written in Rust,
// which have no face on the web.
function plain(path) {
  const parts = path.split("/");
  if (path === "" || path.includes("\\") || isAbsolute(path) || parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new SiteError(`${path} is not a plain path below the bundle`);
  }
  if (parts[0] === "mocks" || parts.includes(".studio")) throw new SiteError(`${path} is a designer's, not the site's`);
  if (parts.at(-1) === "ljostypes.json") throw new SiteError(`${path} declares types written in Rust, which have no face on the web`);
  if (path === MANIFEST) throw new SiteError(`${MANIFEST} lists itself`);
}

// Every file below `directory`, by its path from it; a link is refused, as
// a site keeps none and its hosts do not either.
function present(directory, prefix = "", found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = `${prefix}${entry.name}`;
    if (entry.isSymbolicLink()) throw new SiteError(`${path} is a link`);
    if (entry.isDirectory()) present(join(directory, entry.name), `${path}/`, found);
    else found.push(path);
  }
  return found;
}

// What a qmldir says: the module it declares and the files its types are.
function qmldir(text) {
  let module = null;
  const files = [];
  for (const line of text.split("\n")) {
    const words = line.split("#")[0].trim().split(/\s+/);
    if (words[0] === "module" && words[1]) module ??= words[1];
    if (words[0] === "singleton" || words[0] === "internal") words.shift();
    if (/^[A-Z]/.test(words[0] ?? "") && /\.(qml|js)$/.test(words.at(-1))) files.push(words.at(-1));
  }
  return { module, files };
}

// The modules a document imports by name (`import QtQuick.Layouts`), not
// by path: a path import is of the bundle's own files.
const imported = (text) => [...text.matchAll(/^\s*import\s+([A-Za-z_][\w.]*)/gm)].map(([, uri]) => uri);

const controls = (module) => module === "QtQuick.Controls" || module.startsWith("QtQuick.Controls.");

// Holds the bundle at `dir` to its manifest; what it says, when it does.
export function check(dir) {
  const at = join(dir, MANIFEST);
  if (!existsSync(at)) throw new SiteError(`${dir} holds no ${MANIFEST}: it is no site bundle`);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(at, "utf8"));
  } catch (error) {
    throw new SiteError(`${MANIFEST} is not JSON: ${error.message}`);
  }
  shaped(manifest, SHAPE, MANIFEST);
  const { format, version, target, entry, theme, files, modules, imports, ljos_web } = manifest;
  if (format !== "ljos-site" || version !== 1 || target !== "web") {
    throw new SiteError(`a ${format} ${version} for ${target} is not a site bundle this builds (ljos-site 1, web)`);
  }
  if (!/^[0-9a-f]{40}$/.test(ljos_web)) throw new SiteError(`${ljos_web} is not an ljos-web commit`);

  const listed = new Set();
  for (const { path, bytes } of files) {
    plain(path);
    if (listed.has(path)) throw new SiteError(`${path} is listed twice`);
    listed.add(path);
    const stat = lstatSync(join(dir, path), { throwIfNoEntry: false });
    if (!stat) throw new SiteError(`${path} is listed but is not there`);
    if (!stat.isFile()) throw new SiteError(`${path} is listed but is not a plain file`);
    if (stat.size !== bytes) throw new SiteError(`${path} is ${stat.size} bytes; the manifest says ${bytes}`);
  }
  for (const path of present(dir)) {
    if (path !== MANIFEST && !listed.has(path)) throw new SiteError(`${path} is in the bundle but not in its manifest`);
  }
  if (!entry.endsWith(".qml") || !listed.has(entry)) throw new SiteError(`the entry ${entry} is not a listed document`);
  if (theme !== undefined && !listed.has(theme)) throw new SiteError(`the theme ${theme} is not a listed file`);

  // The project's own modules, each once and each where its qmldir says.
  const own = new Set();
  const named = new Set();
  for (const { module, qmldir: file } of modules) {
    if (posix.basename(file) !== "qmldir" || !listed.has(file)) throw new SiteError(`${module}'s qmldir ${file} is not a listed qmldir`);
    const said = qmldir(readFileSync(join(dir, file), "utf8"));
    if (said.module !== module) throw new SiteError(`${file} declares ${said.module ?? "no module"}; the manifest says ${module}`);
    for (const type of said.files) {
      const path = posix.join(posix.dirname(file), type);
      if (!listed.has(path)) throw new SiteError(`${file} names ${path}, which is not listed`);
    }
    if (own.has(module)) throw new SiteError(`${module} is in modules twice: two directories would claim it`);
    own.add(module);
    named.add(file);
  }
  // The compiler finds modules by the qmldirs below the root: one the
  // manifest does not name would be a module it hides.
  for (const file of listed) {
    if (posix.basename(file) !== "qmldir" || named.has(file)) continue;
    const { module } = qmldir(readFileSync(join(dir, file), "utf8"));
    if (module) throw new SiteError(`${file} declares module ${module}, which modules does not name`);
  }

  // What it takes from ljos-web, sorted and once, each provided by it.
  const offered = new Map(provided().modules.map((entry) => [entry.module, entry]));
  imports.forEach((module, index) => {
    if (index > 0 && imports[index - 1] >= module) throw new SiteError(`imports is not sorted, each once: ${imports[index - 1]} before ${module}`);
    if (own.has(module)) throw new SiteError(`${module} is in imports and is the project's own`);
    if (!offered.has(module)) throw new SiteError(`it imports ${module}, which ljos-web does not provide (\`ljos-web modules\` lists what it does)`);
  });
  for (const path of listed) {
    if (!path.endsWith(".qml")) continue;
    for (const module of imported(readFileSync(join(dir, path), "utf8"))) {
      if (!own.has(module) && !imports.includes(module)) throw new SiteError(`${path} imports ${module}, which the manifest neither lists as a module nor imports`);
    }
  }
  return { manifest, needs: imports.map((module) => offered.get(module)).filter((entry) => entry.needs.length > 0) };
}

// Where Qt's QML modules are, as the Vite plugin looks for them.
function qtRoots(qt) {
  if (qt) return [qt].flat();
  const elsewhere = process.env.QML_IMPORT_PATH?.split(":") ?? [];
  return [...elsewhere, process.env.QT_INSTALL_QML ?? installed().qml].filter(Boolean);
}

// The theme a bundle carries (`theme.json` beside its entry) is not applied
// to Ljos.Design yet: that waits on a way for Ljos.Design to take a theme
// without Rust. When there is one, this is the one place it is applied,
// given the bundle's theme file and the site as built; until then the file
// is carried into the site as it is and nothing reads it.
function applyTheme(_theme, _site) {}

// Builds the site the bundle at `dir` describes into `out` (default: the
// bundle's path with `-site`). `qmlc` is the compiler (default `$QMLC`, then
// `qmlc` on the path), `qt` where Qt's QML modules are when not where Qt
// says, `with` the directories of QML modules that stand in for what ljos-web
// compiles from elsewhere (Ljos.Design's, from ljos-ui's
// `crates/ljos_design_qml/qml`). What it wrote, and its size.
export async function buildSite({ dir, out, qmlc = process.env.QMLC ?? "qmlc", qt, with: standins = [], logLevel = "warn" } = {}) {
  if (!dir) throw new SiteError("which bundle? buildSite({ dir })");
  dir = resolve(dir);
  out = resolve(out ?? `${dir}-site`);
  const { manifest, needs } = check(dir);

  for (const { module, needs: wanted } of needs) {
    if (wanted.includes("qt") && !qtRoots(qt).some((root) => existsSync(join(root, "QtQuick/Controls/qmldir")))) {
      throw new SiteError(
        `it imports ${module}, which is compiled from an installed Qt 6's own QML, and there is no Qt here: none found by qtpaths6, QT_INSTALL_QML or QML_IMPORT_PATH (give its qml directory with --qt)`,
      );
    }
    if (wanted.includes("with") && !standins.some((root) => existsSync(join(root, ...module.split("."), "qmldir")))) {
      throw new SiteError(
        `it imports ${module}, which is QML ljos-web compiles but does not hold: give the directory with ${module.replaceAll(".", "/")}/qmldir below it with --with${module === "Ljos.Design" ? " (ljos-ui's crates/ljos_design_qml/qml)" : ""}`,
      );
    }
  }
  if (out === dir || out.startsWith(`${dir}/`)) throw new SiteError(`${out} is inside the bundle; choose another out`);
  if (existsSync(out) && !existsSync(join(out, STAMP)) && readdirSync(out).length > 0) {
    throw new SiteError(`${out} holds something other than a site this built; choose another out`);
  }
  const head = spawnSync("git", ["-C", runtime, "rev-parse", "HEAD"], { encoding: "utf8" });
  const at = head.status === 0 ? head.stdout.trim() : null;
  if (at && at !== manifest.ljos_web) console.warn(`note: the bundle was checked against ljos-web ${manifest.ljos_web}; building with ${at}`);

  // What Vite builds from: a page that mounts the entry, made apart from
  // the bundle, which holds only what its manifest lists.
  const stage = mkdtempSync(join(tmpdir(), "ljos-site-"));
  try {
    writeFileSync(join(stage, "index.html"), PAGE);
    writeFileSync(join(stage, "main.js"), MAIN);
    await build({
      configFile: false,
      root: stage,
      base: "./",
      logLevel,
      cacheDir: join(runtime, "node_modules/.vite/ljos-site"),
      plugins: [qml({ qmlc, args: ["--root", dir], qt, standins })],
      resolve: {
        alias: {
          "ljos-site:entry": join(dir, manifest.entry),
          "ljos-site:object": join(runtime, "object.js"),
          "ljos-site:css": join(runtime, "style.css"),
        },
        dedupe: ["solid-js", "@solidjs/web", "@solidjs/signals"],
      },
      build: { outDir: join(stage, "dist"), emptyOutDir: true, target: "esnext", chunkSizeWarningLimit: 4000 },
    });
    const site = join(stage, "dist");
    if (manifest.theme !== undefined) {
      mkdirSync(dirname(join(site, manifest.theme)), { recursive: true });
      cpSync(join(dir, manifest.theme), join(site, manifest.theme));
      applyTheme(manifest.theme, site);
    }
    writeFileSync(join(site, STAMP), `${manifest.ljos_web}\n`);
    rmSync(out, { recursive: true, force: true });
    mkdirSync(dirname(out), { recursive: true });
    cpSync(site, out, { recursive: true });
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
  const written = present(out).filter((path) => path !== STAMP);
  const bytes = written.reduce((sum, path) => sum + lstatSync(join(out, path)).size, 0);
  return { out, files: written.sort(), bytes };
}

const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ljós site</title>
    <style>
      html, body { margin: 0; height: 100%; }
      #app { width: 100vw; height: 100vh; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.js"></script>
  </body>
</html>
`;

const MAIN = `import "ljos-site:css";
import { mount } from "ljos-site:object";
import Entry from "ljos-site:entry";

mount(Entry, document.getElementById("app"));
`;

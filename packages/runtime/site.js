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
import { randomUUID } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, posix, resolve } from "node:path";
import { build } from "vite";
import { findTheme } from "./find-theme.js";
import { provided } from "./modules.js";
import qml, { compilerAt, hasControls, installed } from "./vite.js";
import { CLIENT_CONDITIONS } from "./server/conditions.js";

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
    // A comment to Qt, a type of the module to the compiler: its file counts.
    const block = line.match(/^\s*#\s*block\s+[A-Z]\S*\s+\S+\s+(\S+\.qml)(\s|$)/);
    if (block) files.push(block[1]);
    const words = line.split("#")[0].trim().split(/\s+/);
    if (words[0] === "module" && words[1]) module ??= words[1];
    if (words[0] === "singleton" || words[0] === "internal") words.shift();
    if (/^[A-Z]/.test(words[0] ?? "") && /\.(qml|js)$/.test(words.at(-1))) files.push(words.at(-1));
  }
  return { module, files };
}

// What each of `paths` imports, as the compiler reads it: a reading of ours
// would differ from its parser somewhere, and what it lets past is then what
// the compiler reads from outside the bundle.
function importsOf(dir, paths, qmlc) {
  const ran = spawnSync(qmlc, ["--imports", ...paths], { cwd: dir, encoding: "utf8", maxBuffer: 1 << 28 });
  if (ran.error) throw new SiteError(`could not run ${qmlc}: ${ran.error.message}`);
  if (ran.status !== 0) throw new SiteError(`${qmlc} could not read what the bundle imports:\n${ran.stderr.trim()}`);
  const said = JSON.parse(ran.stdout);
  const errors = said.flatMap((file) => file.errors ?? []);
  if (errors.length) throw new SiteError(errors.join("\n"));
  return said;
}

// Where `to`, written in the file `from`, lands among the bundle's paths;
// null outside the bundle.
function within(from, to) {
  if (to.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(to)) return null;
  // `parts/` is the directory `parts`, as the compiler reads it.
  const path = posix.normalize(posix.join(posix.dirname(from), to)).replace(/\/+$/, "") || ".";
  return path === ".." || path.startsWith("../") ? null : path;
}

const controls = (module) => module === "QtQuick.Controls" || module.startsWith("QtQuick.Controls.");

// Holds the bundle at `dir` to its manifest; what it says, when it does.
export function check(dir, qmlc = process.env.QMLC ?? "qmlc") {
  qmlc = compilerAt(qmlc);
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
      const path = within(file, type);
      if (path === null) throw new SiteError(`${file} names ${type}, which is outside the bundle`);
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

  for (const { block, file } of manifest.blocks ?? []) {
    if (!listed.has(file)) throw new SiteError(`the block ${block}'s file ${file} is not a listed file`);
  }
  for (const { path } of manifest.left_out ?? []) {
    if (listed.has(path)) throw new SiteError(`${path} is said to be left out but is in the bundle`);
  }

  // What it takes from ljos-web, sorted and once, each provided by it.
  const offered = new Map(provided().modules.map((entry) => [entry.module, entry]));
  imports.forEach((module, index) => {
    if (index > 0 && imports[index - 1] >= module) throw new SiteError(`imports is not sorted, each once: ${imports[index - 1]} before ${module}`);
    if (own.has(module)) throw new SiteError(`${module} is in imports and is the project's own`);
    if (!offered.has(module)) throw new SiteError(`it imports ${module}, which ljos-web does not provide (\`ljos-web modules\` lists what it does)`);
  });
  // What the compiler would read for a path import is the bundle's too: the
  // manifest's promise holds only if it never reads past what is listed.
  const read = importsOf(dir, [...listed].filter((path) => path.endsWith(".qml") || path.endsWith(".js")), qmlc);
  for (const { file: path, paths } of read) {
    for (const target of paths) {
      const at = within(path, target);
      if (at === null) throw new SiteError(`${path} imports ${target}, which is outside the bundle`);
      const directory = at === "." || [...listed].some((file) => file.startsWith(`${at}/`));
      if (!listed.has(at) && !directory) throw new SiteError(`${path} imports ${target}, which is not listed`);
    }
  }
  for (const { file: path, modules: taken } of read) {
    for (const module of taken) {
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

// The theme the site reads, as ljos-ui's `docs/theme.md` has it: the
// manifest's `theme` is the named file; without one, the `theme.json`
// nearest the entry among the listed files, up to the bundle's top. Checked
// before anything is built: a refused theme refuses the site, with each of
// its mistakes as `file:line:column: message`.
function themeOf(dir, manifest, qmlc) {
  const listed = new Set(manifest.files.map(({ path }) => path));
  const file = manifest.theme ?? findTheme(listed, manifest.entry);
  if (!file) return null;
  const ran = spawnSync(qmlc, ["--theme", file], { cwd: dir, encoding: "utf8" });
  if (ran.error) throw new SiteError(`could not run ${qmlc}: ${ran.error.message}`);
  if (ran.status !== 0) throw new SiteError(`the theme ${file} is refused:\n${ran.stderr.trim()}`);
  return file;
}

// The commit of the ljos-web that `directory` is the runtime of, if it is a
// checkout of ljos-web. Installed in a host's `node_modules`, the repository
// git finds around it is the host's, whose commit says nothing of ljos-web.
export function builtWith(directory = runtime) {
  const git = (...args) => spawnSync("git", ["-C", directory, ...args], { encoding: "utf8" });
  const top = git("rev-parse", "--show-toplevel");
  if (top.status !== 0) return null;
  const own = join(top.stdout.trim(), "packages/runtime");
  if (!existsSync(own) || realpathSync(own) !== realpathSync(directory)) return null;
  const head = git("rev-parse", "HEAD");
  return head.status === 0 ? head.stdout.trim() : null;
}

// Puts the built site at `from` where `out` is, whole: copied beside it and
// renamed, so that whatever serves `out`, or a copy that fails, never meets
// half a site. A sibling, since a rename stays on one file system.
export function replaceSite(from, out, rename = renameSync) {
  mkdirSync(dirname(out), { recursive: true });
  const fresh = `${out}.new-${randomUUID()}`;
  const old = `${out}.old-${randomUUID()}`;
  try {
    cpSync(from, fresh, { recursive: true });
    const there = existsSync(out);
    if (there) rename(out, old);
    try {
      rename(fresh, out);
    } catch (error) {
      if (there) {
        try {
          rename(old, out);
        } catch {
          // It is the only copy of the last good site, so it stays, and is said.
          throw new SiteError(`${out} could not be replaced (${error.message}) or put back: the last good site is at ${old}`);
        }
      }
      throw error;
    }
    rmSync(old, { recursive: true, force: true });
  } finally {
    rmSync(fresh, { recursive: true, force: true });
  }
}

// Builds the site the bundle at `dir` describes into `out` (default: the
// bundle's path with `-site`). `qmlc` is the compiler (default `$QMLC`, then
// `qmlc` on the path), `qt` where Qt's QML modules are when not where Qt
// says, `with` the directories of QML modules that stand in for what ljos-web
// compiles from elsewhere (Ljos.Design's, from ljos-ui's
// `crates/ljos_design_qml/qml`), `styles` whose QML the controls are:
// Ljós's (`"ljos"`) unless Qt's (`"qt"`) are asked for. `liveShell`: true
// (or `{ site }`, the name a visitor's shell is kept under) for a site whose
// visitors may drop a shell of their own over its blocks (docs/LJOS_WEB.md
// A9); its compiler is written beside the page and fetched only on a drop.
// `prerender`: true (or `{ width, height }`, the page size it is made at)
// writes the page's HTML at build time — its text, links and structure in
// `index.html`, for a reader or a crawler with no script — and the page's
// script hydrates it, taking those elements over rather than making the
// page again (docs/LJOS_WEB.md, the prerender section). A live shell's
// page is its own host's to make, so the two are refused together. With
// `pages` (`[{ route, title, props }]`), the one entry is prerendered
// once per page — at its route (`/` is `index.html`, `/docs/` is
// `docs/index.html`), under its title, made with its `props` as the
// entry's own properties — and each page's script hydrates it with the
// same props, which its HTML carries. One build, one set of assets,
// every page's own HTML: a site of many pages is one shell that shows
// the page its route names. `css`: stylesheets the page carries after
// the runtime's own (`ljos-web/codeblock.css`, whose `tok-*` rules colour
// the code a site's rich text holds through its `--ljos-code-*` theme).
// What it wrote, and its size.
//
// A site's controls are Ljós's whether or not the machine that builds it
// has a Qt: the site is a Ljós application, which draws with Ljós's style
// natively, and a bundle builds to the same site on any machine. A style
// Ljós has none of (Imagine) is still the installed Qt's.
// The pages a prerender is asked for, held to their shape before
// anything is compiled: a route is a plain path below the site's root
// and names a directory (`/`, `/docs/`), each once.
function pagesOf(prerender) {
  if (typeof prerender !== "object" || prerender === null || prerender.pages === undefined) return null;
  const { pages } = prerender;
  if (!Array.isArray(pages) || pages.length === 0) throw new SiteError("prerender.pages is a list of pages, one at least");
  const seen = new Set();
  for (const page of pages) {
    if (typeof page !== "object" || page === null || typeof page.route !== "string" || !/^\/([A-Za-z0-9._~-]+\/)*$/.test(page.route) || page.route.split("/").some((part) => /^\.+$/.test(part))) {
      throw new SiteError(`a page's route is a plain path below the site ending in /, not ${JSON.stringify(page?.route)}`);
    }
    if (seen.has(page.route)) throw new SiteError(`the route ${page.route} is in prerender.pages twice`);
    seen.add(page.route);
    if (page.title !== undefined && typeof page.title !== "string") throw new SiteError(`the route ${page.route}'s title is not a string`);
    if (page.props !== undefined && (typeof page.props !== "object" || page.props === null || Array.isArray(page.props))) throw new SiteError(`the route ${page.route}'s props are not an object`);
  }
  return pages;
}

export async function buildSite({ dir, out, qmlc = process.env.QMLC ?? "qmlc", qt, styles = "ljos", with: standins = [], liveShell = false, prerender = false, css = [], logLevel = "warn" } = {}) {
  if (!dir) throw new SiteError("which bundle? buildSite({ dir })");
  if (!Array.isArray(css) || css.some((path) => typeof path !== "string" || !path.endsWith(".css") || !existsSync(path))) {
    throw new SiteError(`css is a list of .css files that exist, not ${JSON.stringify(css)}`);
  }
  if (prerender && liveShell) throw new SiteError("a site with a live shell is not prerendered: its page is the shell host's to make (choose one of prerender and liveShell)");
  const pages = prerender ? pagesOf(prerender) : null;
  dir = resolve(dir);
  out = resolve(out ?? `${dir}-site`);
  qmlc = compilerAt(qmlc);
  const { manifest, needs } = check(dir, qmlc);
  const theme = themeOf(dir, manifest, qmlc);

  if (styles !== "ljos" && styles !== "qt") throw new SiteError(`styles is "ljos" or "qt", not ${JSON.stringify(styles)}`);
  for (const { module, needs: wanted } of needs) {
    const ofQt = wanted.includes("qt") || (styles === "qt" && (module === "QtQuick.Controls" || module.startsWith("QtQuick.Controls.")));
    if (ofQt && !qtRoots(qt).some(hasControls)) {
      throw new SiteError(
        wanted.includes("qt")
          ? `it imports ${module}, which is compiled from an installed Qt 6's own QML (Ljós has no style of it), and there is no Qt 6 here: none found by qtpaths6, qtpaths, qmake6, QT_INSTALL_QML or QML_IMPORT_PATH (give its qml directory with --qt)`
          : `it imports ${module} and asks for Qt's styles, and there is no Qt 6 here: none found by qtpaths6, qtpaths, qmake6, QT_INSTALL_QML or QML_IMPORT_PATH (give its qml directory with --qt)`,
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
  const at = builtWith();
  if (at && at !== manifest.ljos_web) console.warn(`note: the bundle was checked against ljos-web ${manifest.ljos_web}; building with ${at}`);

  // What Vite builds from: a page that mounts the entry, made apart from
  // the bundle, which holds only what its manifest lists.
  const stage = mkdtempSync(join(tmpdir(), "ljos-site-"));
  try {
    writeFileSync(join(stage, "index.html"), PAGE);
    const sheets = css.map((_, at) => `import "ljos-site:sheet-${at}";\n`).join("");
    // After the runtime's sheet, so a site's rules win over its defaults.
    writeFileSync(join(stage, "main.js"), (liveShell ? LIVE : prerender ? PRERENDERED : MAIN).replace('import "ljos-site:css";\n', (own) => own + sheets));
    // The kernel the page's graph is: Solid's own, or Ljós's compiled
    // to wasm where `LJOS_KERNEL=wasm`, as everywhere else in this
    // repository. The prerender below is made with the same one, so
    // what it writes is what the page would make.
    const kernel = process.env.LJOS_KERNEL === "wasm" ? join(runtime, "kernel/wasm.js") : join(runtime, "kernel/solid.js");
    const shared = {
      configFile: false,
      root: stage,
      base: "./",
      logLevel,
      cacheDir: join(runtime, "node_modules/.vite/ljos-site"),
      resolve: {
        alias: {
          "ljos-site:entry": join(dir, manifest.entry),
          "ljos-site:object": join(runtime, "object.js"),
          "ljos-site:server": join(runtime, "server.js"),
          "ljos-site:css": join(runtime, "style.css"),
          ...Object.fromEntries(css.map((path, at) => [`ljos-site:sheet-${at}`, resolve(path)])),
          "ljos-site:live": join(runtime, "Ljos/Blocks/live.js"),
          "#kernel": kernel,
        },
        dedupe: ["solid-js", "@solidjs/web", "@solidjs/signals"],
      },
    };
    const plugin = () => qml({ qmlc, args: ["--root", dir], qt, styles, standins, theme: theme ? join(dir, theme) : false, liveShell });
    await build({
      ...shared,
      plugins: [plugin()],
      build: { outDir: join(stage, "dist"), emptyOutDir: true, target: "esnext", chunkSizeWarningLimit: 4000 },
      // The live shell's compiler runs in a module worker.
      worker: { format: "es" },
    });
    const site = join(stage, "dist");
    if (prerender) {
      // The same entry made where there is no browser: a server bundle
      // of the entry over this runtime, rendered in a Node process of
      // its own into the page the client build wrote.
      writeFileSync(join(stage, "server-entry.js"), SERVER);
      await build({
        ...shared,
        plugins: [plugin()],
        build: {
          ssr: join(stage, "server-entry.js"),
          outDir: join(stage, "server"),
          emptyOutDir: true,
          target: "esnext",
          chunkSizeWarningLimit: 4000,
          rollupOptions: { output: { format: "es", entryFileNames: "server-entry.mjs" } },
        },
        ssr: { noExternal: true, resolve: { conditions: CLIENT_CONDITIONS } },
        environments: { ssr: { resolve: { noExternal: true, conditions: CLIENT_CONDITIONS } } },
      });
      // One render per page, each in a process of its own, as a render
      // takes the globals over. A site of one page is the entry made
      // with no props at `/`, as it always was.
      const said = typeof prerender === "object" ? prerender : {};
      const size = { ...(said.width !== undefined ? { width: said.width } : {}), ...(said.height !== undefined ? { height: said.height } : {}) };
      const shell = readFileSync(join(site, "index.html"), "utf8");
      if (!shell.includes('<div id="app"></div>')) throw new SiteError("the built page has no empty #app to prerender into");
      for (const page of pages ?? [{ route: "/" }]) {
        const options = { ...size, ...(page.props ? { props: page.props } : {}) };
        const ran = spawnSync(process.execPath, [join(runtime, "server/prerender.js"), join(stage, "server/server-entry.mjs"), JSON.stringify(options)], {
          encoding: "utf8",
          maxBuffer: 1 << 28,
          timeout: 120_000,
        });
        if (ran.error) throw new SiteError(`could not prerender ${page.route}: ${ran.error.message}`);
        if (ran.status !== 0) throw new SiteError(`${page.route} could not be prerendered:\n${(ran.stderr || ran.stdout).trim()}`);
        if (ran.stderr) console.warn(ran.stderr.trimEnd());
        // The page at its route asks for the one build's assets from
        // its own depth, carries the props it was made with for its
        // script to hydrate it by, and is titled as its own page.
        const depth = page.route.split("/").filter(Boolean).length;
        let html = shell;
        if (depth > 0) html = html.replaceAll('="./', `="${"../".repeat(depth)}`);
        if (page.title !== undefined) {
          const title = page.title.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
          html = html.replace("<title>Ljós site</title>", () => `<title>${title}</title>`);
        }
        if (page.props) {
          const carried = JSON.stringify(page.props).replaceAll("</script", "<\\/script");
          html = html.replace('<div id="app"></div>', () => `<script type="application/json" id="ljos-props">${carried}</script>\n    <div id="app"></div>`);
        }
        html = html.replace('<div id="app"></div>', () => `<div id="app">${ran.stdout}</div>`);
        const at = join(site, page.route.slice(1), "index.html");
        mkdirSync(dirname(at), { recursive: true });
        writeFileSync(at, html);
      }
    }
    // Carried as it is too, for whatever reads it beside the page.
    if (theme) {
      mkdirSync(dirname(join(site, theme)), { recursive: true });
      cpSync(join(dir, theme), join(site, theme));
    }
    writeFileSync(join(site, STAMP), `${manifest.ljos_web}\n`);
    replaceSite(site, out);
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

// The page of a prerendered site: its HTML is in the page already, and
// is taken over — with the props its page of the site was made with,
// where the build wrote them beside it.
const PRERENDERED = `import "ljos-site:css";
import { hydrate } from "ljos-site:object";
import Entry from "ljos-site:entry";

const carried = document.getElementById("ljos-props");
hydrate(Entry, document.getElementById("app"), carried ? JSON.parse(carried.textContent) : {});
`;

// What the prerender renders: the entry, made by the runtime's server
// renderer (one runtime in the bundle, the entry's and the renderer's
// together).
const SERVER = `import { renderToString } from "ljos-site:server";
import Entry from "ljos-site:entry";

export default (options) => renderToString(Entry, options);
`;

// The page of a site with a live shell: the entry, under what lets a visitor
// drop another.
const LIVE = `import "ljos-site:css";
import { liveShell } from "ljos-site:live";
import Entry from "ljos-site:entry";

liveShell(Entry, document.getElementById("app"));
`;

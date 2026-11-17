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
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir, totalmem } from "node:os";
import { dirname, isAbsolute, join, posix, resolve } from "node:path";
import { build } from "vite";
import { findTheme } from "./find-theme.ts";
import { provided } from "./modules.js";
import qml, { compilerAt, hasControls, installed, kernelNamed, runCompiler } from "./vite.js";
import { CLIENT_CONDITIONS } from "./server/conditions.js";
import { pooled } from "./pool.js";

export { pooled };

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
  const ran = runCompiler(qmlc, ["--imports", ...paths], { cwd: dir, encoding: "utf8", maxBuffer: 1 << 28 });
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
  // manifest's promise holds only if it never reads past what is listed. A
  // `.d.ts` file is an editor's, which the compiler never reads.
  const read = importsOf(dir, [...listed].filter((path) => /\.(?:qml|js|ts|lts)$/.test(path) && !path.endsWith(".d.ts")), qmlc);
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
  const ran = runCompiler(qmlc, ["--theme", file], { cwd: dir, encoding: "utf8" });
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
// the page its route names. A page's `description` is its
// `<meta name="description">`. `prerender.sizes`
// (`[{ width, height, from }]`, narrowest first) makes each page once
// per window size, the stylesheet showing the one a browser of the
// reader's width is, and `prerender.schemes` (`["light", "dark"]`) once
// per colour scheme, shown as the browser asks or as the page's root
// says (`data-ljos-scheme`); the page hydrates the render shown. `head`
// is HTML put at the end of every page's `<head>`: a site's icons,
// metadata, and a script that says the reader's own scheme before the
// body is read. A prerendered page's script is asked for once its HTML
// has been painted. `css`: stylesheets the page carries after the
// runtime's own (`ljos-web/codeblock.css`, whose `tok-*` rules colour the
// code a site's rich text holds through its `--ljos-code-*` theme).
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
    if (page.description !== undefined && typeof page.description !== "string") throw new SiteError(`the route ${page.route}'s description is not a string`);
  }
  return pages;
}

// The sizes a page is prerendered at, narrowest first: each is the page a
// browser at least `from` wide is shown (its own width when not said; the
// narrowest is shown below its `from` too), picked by the stylesheet, so
// a reader's first paint is laid out for a window like theirs with no
// script, and the page hydrates the one shown. One size is a page of one.
function sizesOf(prerender) {
  if (typeof prerender !== "object" || prerender === null) return [{}];
  const { width, height, sizes } = prerender;
  const plain = (value, what) => {
    if (value !== undefined && !(typeof value === "number" && Number.isFinite(value) && value > 0)) throw new SiteError(`${what} is a number of pixels above 0, not ${JSON.stringify(value)}`);
  };
  plain(width, "prerender.width");
  plain(height, "prerender.height");
  if (sizes === undefined) return [{ ...(width !== undefined ? { width } : {}), ...(height !== undefined ? { height } : {}) }];
  if (width !== undefined || height !== undefined) throw new SiteError("prerender has sizes or a width and height, not both");
  if (!Array.isArray(sizes) || sizes.length === 0) throw new SiteError("prerender.sizes is a list of sizes, one at least");
  let last = -Infinity;
  return sizes.map((size, index) => {
    if (typeof size !== "object" || size === null) throw new SiteError(`prerender.sizes[${index}] is not a size`);
    plain(size.width, `prerender.sizes[${index}].width`);
    plain(size.height, `prerender.sizes[${index}].height`);
    if (size.width === undefined || size.height === undefined) throw new SiteError(`prerender.sizes[${index}] has no width or height`);
    if (size.from !== undefined && !(typeof size.from === "number" && Number.isFinite(size.from) && size.from >= 0)) throw new SiteError(`prerender.sizes[${index}].from is a width in pixels, not ${JSON.stringify(size.from)}`);
    const from = size.from ?? size.width;
    if (from <= last) throw new SiteError(`prerender.sizes are narrowest first: sizes[${index}] is shown from ${from}px, not past ${last}px`);
    last = from;
    return { width: size.width, height: size.height, from };
  });
}

// The colour schemes a page is prerendered in: the page made as a
// browser asking for each would have it, so a reader asking for dark is
// first shown the dark page and no light one flashes before it. Light,
// where it is one of them, is shown to a browser that asks for neither.
// None said is one render, made as a browser asking for nothing.
function schemesOf(prerender) {
  if (typeof prerender !== "object" || prerender === null || prerender.schemes === undefined) return [undefined];
  const { schemes } = prerender;
  if (!Array.isArray(schemes) || schemes.length === 0 || schemes.some((scheme) => scheme !== "light" && scheme !== "dark") || new Set(schemes).size !== schemes.length) {
    throw new SiteError(`prerender.schemes is a list of "light" and "dark", each once, not ${JSON.stringify(schemes)}`);
  }
  return schemes.includes("light") ? ["light", ...schemes.filter((scheme) => scheme !== "light")] : schemes;
}

// Which of a page's renders the browser shows, as a stylesheet: each size
// from its `from` up to the next one's, and in each the scheme the reader
// asks for — the browser's, or the page's own where its root says one
// (`<html data-ljos-scheme="dark">`, set before the body is read by a
// page that lets its reader choose).
function rendersSheet(renders, sizes) {
  const rules = [];
  for (const [index, { size, scheme }] of renders.entries()) {
    const { from } = sizes[size];
    const up = sizes[size + 1]?.from;
    // Up to the next size's start and not including it, so no width
    // between two whole pixels (a zoomed window's) falls between them.
    const below = up === undefined ? "" : `(width < ${up}px)`;
    const above = size === 0 ? "" : `(min-width: ${from}px)`;
    const when = [above, below].filter(Boolean);
    const at = (media, rule) => (media.length ? `@media ${media.join(" and ")} { ${rule} }` : rule);
    const shown = `[data-ljos-render="${index}"]`;
    if (scheme === undefined || renders.every((other) => other.size !== size || other.scheme === scheme)) {
      rules.push(at(when, `${shown} { display: block; }`));
    } else if (scheme === "light") {
      rules.push(at(when, `:root:not([data-ljos-scheme="dark"]) ${shown} { display: block; }`));
    } else {
      // Later than light's, and as specific: where both match, this wins.
      const light = `[data-ljos-render="${renders.findIndex((other) => other.size === size && other.scheme === "light")}"]`;
      rules.push(at([...when, "(prefers-color-scheme: dark)"], `:root:not([data-ljos-scheme]) ${light} { display: none; } :root:not([data-ljos-scheme]) ${shown} { display: block; }`));
      rules.push(at(when, `:root[data-ljos-scheme="dark"] ${shown} { display: block; }`));
    }
  }
  return `<style>\n      [data-ljos-render] { display: none; width: 100%; height: 100%; }\n      ${rules.join("\n      ")}\n    </style>`;
}

// A page's light and dark renders at one size that differ only in how
// the scheme draws it are one render: each colour that differs is a
// custom property, the light one where the reader is shown light and the
// dark one where they are shown dark (as `rendersSheet` decides it, so a
// reader's own pick on the root wins the same way), and so is an item
// shown in one scheme and not the other (a theme toggle's sun and moon).
// What an element says that differs (a toggle's "Use the dark theme") is
// the light one, with the dark one beside it for the page's script to say
// before it hydrates. A render is about as large as a page's reading, and
// two of a page do not share gzip's window: two renders a page need not
// carry are most of what it would first load. Anything else that differs
// (a word, a size, an element) keeps the two renders, each shown in its
// own scheme. Once hydrated, the page's own bindings write every colour
// and every item's visibility as they always did.
const COLOUR = /#[0-9a-fA-F]{3,8}\b|(?:rgb|hsl)a?\([^)]*\)/g;
const TAG = /(<[^>]*>)/;
const ATTRIBUTE = /\s([^\s="'>/]+)(?:="([^"]*)")?/g;
// What an element says rather than draws: the light words stand in a page
// with no script, which cannot switch the scheme either.
const SAID = /^(aria-[a-z]+|title|alt)$/;
const HIDDEN = "display: none";

// A name for what is `light` in the light scheme and `dark` in the dark.
function schemeName(named, light, dark) {
  const key = `${light}\n${dark}`;
  if (!named.has(key)) named.set(key, { name: `--ljos-scheme-${named.size}`, light, dark });
  return `var(${named.get(key).name})`;
}

// Two texts that match outside their colours as one, or null.
function shareColours(light, dark, named) {
  if (light === dark) return light;
  const words = light.split(COLOUR);
  const theirs = dark.split(COLOUR);
  if (words.length !== theirs.length || words.some((word, index) => word !== theirs[index])) return null;
  const ours = light.match(COLOUR);
  const other = dark.match(COLOUR);
  return words.reduce((shared, word, index) => shared + word + (index < ours.length ? (ours[index] === other[index] ? ours[index] : schemeName(named, ours[index], other[index])) : ""), "");
}

// An item's style in both schemes as one, or null: its colours, and its
// being hidden in one only. Only a positioned item (`.qq`) is shown by
// any display that is not none, so `block` stands for its own.
function shareStyle(light, dark, item, named) {
  const shared = shareColours(light, dark, named);
  if (shared !== null || !item) return shared;
  const ours = light.split(/;\s*/).filter(Boolean);
  const theirs = dark.split(/;\s*/).filter(Boolean);
  if (Math.abs(ours.length - theirs.length) !== 1) return null;
  const [longer, shorter] = ours.length > theirs.length ? [ours, theirs] : [theirs, ours];
  const drawn = (declaration) => declaration?.replace(COLOUR, "");
  const at = longer.findIndex((declaration, index) => drawn(declaration) !== drawn(shorter[index]));
  if (longer[at] !== HIDDEN) return null;
  const both = shareColours(longer.toSpliced(at, 1).join("; "), shorter.join("; "), named);
  if (both === null) return null;
  const parts = both.split("; ");
  const display = ours.length > theirs.length ? schemeName(named, "none", "block") : schemeName(named, "block", "none");
  return `${parts.toSpliced(at, 0, `display: ${display}`).join("; ")};`;
}

// One start tag in both schemes as one, or null.
function shareTag(light, dark, named) {
  const name = /^<([^\s>/]+)/.exec(light)?.[1];
  if (!name || name !== /^<([^\s>/]+)/.exec(dark)?.[1]) return null;
  const ours = [...light.matchAll(ATTRIBUTE)];
  const theirs = [...dark.matchAll(ATTRIBUTE)];
  const end = (tag, found) => tag.slice(found.length ? found.at(-1).index + found.at(-1)[0].length : name.length + 1);
  if (ours.length !== theirs.length || end(light, ours) !== end(dark, theirs)) return null;
  const item = ours.some(([, key, value]) => key === "class" && value?.split(" ").includes("qq"));
  const said = [];
  let tag = `<${name}`;
  for (const [index, [, key, value]] of ours.entries()) {
    const [, otherKey, other] = theirs[index];
    if (key !== otherKey || (value === undefined) !== (other === undefined)) return null;
    let shared = value;
    if (value !== other) {
      if (key === "style") shared = shareStyle(value, other, item, named);
      else if (SAID.test(key)) said.push([key, other]);
      else shared = null;
      if (shared === null) return null;
    }
    tag += value === undefined ? ` ${key}` : ` ${key}="${shared}"`;
  }
  if (said.length) tag += ` data-ljos-dark="${said.map(([key]) => key).join(" ")}"${said.map(([key, other]) => ` data-ljos-dark-${key}="${other}"`).join("")}`;
  return tag + end(light, ours);
}

// The one render the light and dark ones are, with what differs named in
// `named` (light and dark, by name), or null where they differ in more.
function shareSchemes(light, dark, named) {
  const ours = light.split(TAG);
  const theirs = dark.split(TAG);
  if (ours.length !== theirs.length) return null;
  let shared = "";
  let styleSheet = false;
  for (const [index, part] of ours.entries()) {
    const other = theirs[index];
    let both = part;
    if (part !== other) {
      if (index % 2 === 1) both = shareTag(part, other, named);
      else both = styleSheet ? shareColours(part, other, named) : null;
      if (both === null) return null;
    }
    if (index % 2 === 1) styleSheet = /^<style[\s>]/.test(part);
    shared += both;
  }
  return shared;
}

// The colours `shareSchemes` named, as the scheme shown says them.
function schemesSheet(named) {
  if (named.size === 0) return "";
  const say = (scheme) => [...named.values()].map((colour) => `${colour.name}: ${colour[scheme]};`).join(" ");
  return `<style>\n      :root { ${say("light")} }\n      @media (prefers-color-scheme: dark) { :root:not([data-ljos-scheme]) { ${say("dark")} } }\n      :root[data-ljos-scheme="dark"] { ${say("dark")} }\n    </style>`;
}

// The head a page is written with: what the site gives every page, and
// the page's own description.
const escapeText = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const escapeAttribute = (text) => escapeText(text).replaceAll('"', "&quot;");

// The page a reader is shown first is the prerendered one: its script is
// asked for once that has been painted, so that nothing the page will run
// stands before what the reader came to read, and the module graph's
// preloads are asked for with it. A tab opened behind others asks when it
// is first shown, as a frame is only painted then.
const STARTER =
  '{const s=document.currentScript,main=new URL(s.dataset.ljosStart,document.baseURI);requestAnimationFrame(()=>setTimeout(()=>{for(const name of s.dataset.ljosPreload.split(" ").filter(Boolean)){const link=document.createElement("link");link.rel="modulepreload";link.crossOrigin="";link.href=new URL(name,main).href;document.head.append(link)}import(main.href)}))}';

function startAfterPaint(html) {
  const script = /[ \t]*<script type="module" crossorigin src="(\.\/[^"]+)"><\/script>\n?/.exec(html);
  if (!script) throw new SiteError("the built page has no module script to start once it is painted");
  const preloads = [...html.matchAll(/[ \t]*<link rel="modulepreload" crossorigin href="(\.\/[^"]+)">\n?/g)];
  const from = posix.dirname(script[1]);
  let started = html.replace(script[0], "");
  for (const [whole] of preloads) started = started.replace(whole, "");
  const names = preloads.map(([, href]) => posix.relative(from, href)).join(" ");
  return started.replace("</body>", () => `  <script data-ljos-start="${script[1]}" data-ljos-preload="${names}">${STARTER}</script>\n  </body>`);
}

// The most one render was seen to hold (ljos.dev's, 2026-11: under
// 1 GiB with its Node and the page's runtime), kept free for each.
const RENDER_MEMORY = 1024 ** 3;

// How many of a build's prerenders run at once: `LJOS_SITE_JOBS`, or as
// many as the machine runs at once and has the memory for. Each is a
// Node process of its own that spends its time making one page, so one
// per core keeps them all busy, but 32 of them hold 12 GiB: a build
// held to less (a cgroup's limit, which Node reads) or a small machine
// runs fewer rather than being stopped. A machine shared with other
// work says fewer still.
export function siteJobs(env = process.env, { cores = availableParallelism(), memory = Math.min(process.constrainedMemory?.() || Infinity, totalmem()) } = {}) {
  const asked = env.LJOS_SITE_JOBS;
  if (asked === undefined || asked === "") return Math.max(1, Math.min(cores, Math.floor(memory / RENDER_MEMORY)));
  const jobs = Number(asked);
  if (!Number.isInteger(jobs) || jobs < 1) throw new SiteError(`LJOS_SITE_JOBS is ${JSON.stringify(asked)}; give how many renders may run at once, a whole number from 1`);
  return jobs;
}

// How long one page's render may take, and how much HTML it may write.
const RENDER_TIMEOUT = 120_000;
const RENDER_MAX_BYTES = 1 << 28;

// One render, as spawnSync ran it but without holding the event loop:
// `input` on stdin, stdout and stderr collected, and `error` set when it
// could not be run, ran past RENDER_TIMEOUT or wrote more than
// RENDER_MAX_BYTES, as spawnSync's would be.
function rendering(args, input, signal) {
  return new Promise((done) => {
    const child = spawn(process.execPath, args, { stdio: ["pipe", "pipe", "pipe"] });
    const out = [];
    const err = [];
    let size = 0;
    let error = null;
    const end = (why) => {
      error ??= why;
      child.kill("SIGKILL");
    };
    const timer = setTimeout(() => end(new Error(`it did not end within ${RENDER_TIMEOUT / 1000} s`)), RENDER_TIMEOUT);
    const stopped = () => end(new Error("another render failed"));
    signal?.addEventListener("abort", stopped, { once: true });
    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > RENDER_MAX_BYTES) end(new Error(`it wrote more than ${RENDER_MAX_BYTES} bytes`));
      else out.push(chunk);
    });
    child.stderr.on("data", (chunk) => err.push(chunk));
    child.on("error", (why) => (error ??= why));
    // A render that ends before it has read its options says why on
    // stderr; the pipe it closed is not that reason.
    child.stdin.on("error", () => {});
    child.on("close", (status, killed) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", stopped);
      done({ error, status, signal: killed, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") });
    });
    child.stdin.end(input);
  });
}

export async function buildSite({ dir, out, qmlc = process.env.QMLC ?? "qmlc", qt, styles = "ljos", with: standins = [], liveShell = false, prerender = false, css = [], head = "", logLevel = "warn", jobs = siteJobs() } = {}) {
  if (!dir) throw new SiteError("which bundle? buildSite({ dir })");
  if (!Array.isArray(css) || css.some((path) => typeof path !== "string" || !path.endsWith(".css") || !existsSync(path))) {
    throw new SiteError(`css is a list of .css files that exist, not ${JSON.stringify(css)}`);
  }
  if (prerender && liveShell) throw new SiteError("a site with a live shell is not prerendered: its page is the shell host's to make (choose one of prerender and liveShell)");
  if (typeof head !== "string") throw new SiteError("head is the HTML every page's head is given, a string");
  if (!Number.isInteger(jobs) || jobs < 1) throw new SiteError(`jobs is how many renders may run at once, a whole number from 1, not ${JSON.stringify(jobs)}`);
  // How long each part of the build took, in milliseconds, for whoever
  // builds a site to say where its time goes.
  const timings = {};
  const timed = async (part, work) => {
    const from = performance.now();
    try {
      return await work();
    } finally {
      timings[part] = Math.round(performance.now() - from);
    }
  };
  const pages = prerender ? pagesOf(prerender) : null;
  const sizes = prerender ? sizesOf(prerender) : null;
  const schemes = prerender ? schemesOf(prerender) : null;
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
    // to wasm where `LJOS_KERNEL=wasm` (behind the page's WebAssembly
    // check, `kernel/checked.js`), as everywhere else in this
    // repository. The prerender below is made with the same one, so
    // what it writes is what the page would make.
    const kernel = kernelNamed() === "wasm" ? join(runtime, "kernel/checked.js") : join(runtime, "kernel/solid.js");
    const shared = {
      configFile: false,
      root: stage,
      base: "./",
      logLevel,
      cacheDir: join(runtime, "node_modules/.vite/ljos-site"),
      resolve: {
        alias: {
          "ljos-site:entry": join(dir, manifest.entry),
          "ljos-site:object": join(runtime, "object.ts"),
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
    // The page's build and, for a prerender, the server bundle of the same
    // entry, at once: neither reads what the other writes, and each has a
    // plugin of its own. The compiler is run to its end in the plugin's
    // load (`runCompiler`), so no two compiles overlap; what overlaps is
    // the bundler's own work around them.
    const client = timed("client", () =>
      build({
        ...shared,
        plugins: [plugin()],
        // Each file is compiled by qmlc in the plugin's load, so nearly all
        // of a build's time is in callbacks; that is expected, not a warning.
        build: { outDir: join(stage, "dist"), emptyOutDir: true, target: "esnext", chunkSizeWarningLimit: 4000, rollupOptions: { checks: { bundlerTimings: false } } },
        // The live shell's compiler runs in a module worker.
        worker: { format: "es" },
      }),
    );
    // The same entry made where there is no browser: a server bundle of
    // the entry over this runtime, rendered in a Node process of its own
    // into the page the client build wrote.
    if (prerender) writeFileSync(join(stage, "server-entry.js"), SERVER);
    const server = prerender
      ? timed("server", () =>
          build({
            ...shared,
            plugins: [plugin()],
            build: {
              ssr: join(stage, "server-entry.js"),
              outDir: join(stage, "server"),
              emptyOutDir: true,
              target: "esnext",
              chunkSizeWarningLimit: 4000,
              rollupOptions: { output: { format: "es", entryFileNames: "server-entry.mjs" }, checks: { bundlerTimings: false } },
            },
            // The browser's builds of what the page is made with: Node's own
            // build of solid-js renders once and never again, so a root sized
            // by the element it is put in would keep the size it had before it
            // was put there, and every binding what it first read.
            ssr: { noExternal: true, resolve: { conditions: CLIENT_CONDITIONS } },
            environments: { ssr: { resolve: { noExternal: true, conditions: CLIENT_CONDITIONS } } },
          }),
        )
      : null;
    // Both ended before either's failure is thrown: the stage they write
    // into is removed once this throws.
    const [failed] = (await Promise.allSettled([client, server])).filter((settled) => settled.status === "rejected");
    if (failed) throw failed.reason;
    const site = join(stage, "dist");
    // What the site gives every page's head (its icon, its colours, what a
    // link to it shows) names files the site puts beside its pages, as it
    // wrote them: a relative one is asked for from each page's own depth.
    if (head.trim()) {
      const page = join(site, "index.html");
      writeFileSync(page, readFileSync(page, "utf8").replace("  </head>", () => `    ${head.trim()}\n  </head>`));
    }
    if (prerender) {
      // One render per page, each in a process of its own, as a render
      // takes the globals over. A site of one page is the entry made
      // with no props at `/`, as it always was.
      let shell = readFileSync(join(site, "index.html"), "utf8");
      if (!shell.includes('<div id="app"></div>')) throw new SiteError("the built page has no empty #app to prerender into");
      shell = startAfterPaint(shell);
      // Every size in every scheme, narrowest first and light before dark.
      const made = sizes.flatMap((_, size) => schemes.map((scheme) => ({ size, scheme })));
      const listed = pages ?? [{ route: "/" }];
      // Every page's renders, several at once (`jobs`), given back in this
      // order: each page is then written from its own, as one at a time
      // wrote it.
      const asked = listed.flatMap((page) => made.map(({ size, scheme }) => ({ page, size, scheme })));
      const rendered = await timed("prerender", () =>
        pooled(
          asked.map(({ page, size, scheme }) => async (signal) => {
            const { width, height } = sizes[size];
            const options = {
              ...(width !== undefined ? { width } : {}),
              ...(height !== undefined ? { height } : {}),
              ...(scheme !== undefined ? { scheme } : {}),
              ...(page.props ? { props: page.props } : {}),
            };
            // On stdin, not as an argument: a page's props are as large as
            // its reading, and one argument has a limit of its own (E2BIG).
            const ran = await rendering([join(runtime, "server/prerender.js"), join(stage, "server/server-entry.mjs"), "-"], JSON.stringify(options), signal);
            const at = [sizes.length > 1 ? ` at ${width}×${height}` : "", schemes.length > 1 ? ` in ${scheme}` : ""].join("");
            if (ran.error) throw new SiteError(`could not prerender ${page.route}${at}: ${ran.error.message}`);
            if (ran.status !== 0) throw new SiteError(`${page.route} could not be prerendered${at}:\n${(ran.stderr || ran.stdout).trim()}`);
            return { size, scheme, html: ran.stdout, said: ran.stderr };
          }),
          jobs,
        ),
      );
      timings.renders = rendered.length;
      timings.jobs = Math.min(jobs, rendered.length);
      // What the renders said, in the order they are listed in, whichever
      // ended first.
      for (const { said } of rendered) if (said) console.warn(said.trimEnd());
      for (const [index, page] of listed.entries()) {
        const each = rendered.slice(index * made.length, (index + 1) * made.length);
        // A size's light and dark renders made one where only their
        // colours differ, each size on its own.
        const named = new Map();
        const kept = [];
        for (const [size] of sizes.entries()) {
          const own = each.filter((render) => render.size === size);
          const light = own.find((render) => render.scheme === "light");
          const dark = own.find((render) => render.scheme === "dark");
          const shared = light && dark ? shareSchemes(light.html, dark.html, named) : null;
          if (shared === null) kept.push(...own);
          else kept.push({ size, scheme: undefined, html: shared });
        }
        const renders = kept.map((render) => render.html);
        const sheet = [kept.length > 1 ? rendersSheet(kept, sizes) : "", schemesSheet(named)].filter(Boolean).join("\n    ");
        // The rules every render gives the page by a sheet are said once,
        // before the sizes, however many sizes say them.
        const sheets = [];
        const bodies = renders.map((html) => {
          const sheet = /^<style>[\s\S]*?<\/style>/.exec(html)?.[0] ?? "";
          if (sheet && !sheets.includes(sheet)) sheets.push(sheet);
          return html.slice(sheet.length);
        });
        // Widest first in the page, each still named by its index: with
        // no script, a fragment's address goes to the first element of
        // that name, and the browser scrolls to it only where it is
        // shown, so the one first is where a deep link lands. A desktop
        // reader is the one who opens a heading's link with script off;
        // a phone's lands at the top of the page.
        const order = [...kept.keys()].sort((a, b) => kept[b].size - kept[a].size || a - b);
        const written = renders.length > 1 ? sheets.join("") + order.map((index) => `<div data-ljos-render="${index}">${bodies[index]}</div>`).join("") : renders[0];
        // The page at its route asks for the one build's assets from
        // its own depth, carries the props it was made with for its
        // script to hydrate it by, and is titled as its own page.
        const depth = page.route.split("/").filter(Boolean).length;
        let html = sheet ? shell.replace("  </head>", () => `    ${sheet}\n  </head>`) : shell;
        // Any attribute the shell or the site's head gives as `./` (the
        // start script's own `data-ljos-start` too), in either quotes.
        if (depth > 0) html = html.replace(/(=["'])\.\//g, `$1${"../".repeat(depth)}`);
        if (page.title !== undefined) html = html.replace("<title>Ljós site</title>", () => `<title>${escapeText(page.title)}</title>`);
        if (page.description !== undefined) html = html.replace(/(<title>[^<]*<\/title>)/, (title) => `${title}\n    <meta name="description" content="${escapeAttribute(page.description)}" />`);
        if (page.props) {
          // Every `<` escaped, so no text in the props (`</script`, a
          // `<!--` before a `<script`) ends or reopens the element.
          const carried = JSON.stringify(page.props).replaceAll("<", "\\u003c");
          html = html.replace('<div id="app"></div>', () => `<script type="application/json" id="ljos-props">${carried}</script>\n    <div id="app"></div>`);
        }
        html = html.replace('<div id="app"></div>', () => `<div id="app">${written}</div>`);
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
  return { out, files: written.sort(), bytes, timings };
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
const app = document.getElementById("app");
// A page prerendered at more than one size or in more than one scheme
// hydrates the render the reader is shown, and is then that one alone,
// whatever size the window becomes and whichever scheme is asked for.
const renders = [...app.querySelectorAll(":scope > [data-ljos-render]")];
const shown = renders.find((render) => getComputedStyle(render).display !== "none") ?? renders[0];
for (const render of renders) if (render !== shown) render.remove();
if (shown) {
  shown.removeAttribute("data-ljos-render");
  shown.style.cssText = "width:100%;height:100%";
}
// What a render says in the dark scheme where it is one render for both
// (site.js's shareSchemes), said before it is hydrated, as the sheet
// decides the scheme: the root's own pick, or else the browser's.
const root = document.documentElement.dataset.ljosScheme;
const dark = root ? root === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
for (const element of (shown ?? app).querySelectorAll("[data-ljos-dark]")) {
  for (const key of element.dataset.ljosDark.split(" ")) {
    if (dark) element.setAttribute(key, element.getAttribute(\`data-ljos-dark-\${key}\`));
    element.removeAttribute(\`data-ljos-dark-\${key}\`);
  }
  element.removeAttribute("data-ljos-dark");
}
hydrate(Entry, shown ?? app, carried ? JSON.parse(carried.textContent) : {});
if (shown) app.setAttribute("data-ljos-hydrated", "true");
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

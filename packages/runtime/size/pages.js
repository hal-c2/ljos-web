// What each page of a built site loads: for every `index.html` below a
// site's directory, the page itself and the scripts, styles and wasm
// its first load takes (the module graph from its `<script
// type="module">` and `<link rel="modulepreload">`, through every
// static import) and what it may fetch later (the dynamic imports beyond that, and the files those
// take), each raw and gzip. Read from the files alone: no browser, so it
// is what the build wrote, not what one visit happened to ask for.
//
// usage: node size/pages.js <site dist> [--base /path/] [--json] [--files]
//   --base   where the site stands, for addresses from the root (`/`)
//   --json   the report as JSON, for a test or a before/after table
//   --files  each page's files by name under its line
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const ASSET = /\.(?:js|mjs|css|wasm)$/;

// Read once per report: a later report of a dist built again reads
// its files afresh.
const gzipped = new Map();
function sized(file) {
  if (!gzipped.has(file)) {
    const bytes = readFileSync(file);
    gzipped.set(file, { raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length });
  }
  return gzipped.get(file);
}

// Every page's HTML below `dir`, by its route.
function pagesUnder(dir, at = dir, found = []) {
  for (const entry of readdirSync(at, { withFileTypes: true })) {
    const path = join(at, entry.name);
    if (entry.isDirectory()) pagesUnder(dir, path, found);
    else if (entry.name === "index.html") found.push({ route: `/${relative(dir, dirname(path))}${relative(dir, dirname(path)) ? "/" : ""}`, file: path });
  }
  return found.sort((a, b) => a.route.localeCompare(b.route));
}

// Where the site stands below its address's root (`/`, `/ljos-web/`):
// an address from the root names a file below the dist from there.
let site = { dist: "/", base: "/" };

// A local file a page or chunk names, resolved beside it (or, from the
// root, at the site's base); null for a URL elsewhere, a data URL or a
// file that is not there.
function local(from, href) {
  if (!href || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href)) return null;
  const clean = href.split(/[?#]/)[0];
  if (clean.startsWith("/") && !clean.startsWith(site.base)) return null;
  const path = clean.startsWith("/") ? join(site.dist, clean.slice(site.base.length)) : resolve(dirname(from), clean);
  return existsSync(path) && statSync(path).isFile() ? path : null;
}

// What a page's HTML loads before anything runs.
function htmlAssets(file) {
  const html = readFileSync(file, "utf8");
  const found = [];
  for (const [tag] of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const src = tag.match(/\b(?:src|href)="([^"]+)"/i)?.[1];
    const path = local(file, src);
    if (!path || !ASSET.test(path)) continue;
    if (/^<link/i.test(tag) && !/\brel="(?:stylesheet|modulepreload|preload)"/i.test(tag)) continue;
    found.push(path);
  }
  return found;
}

// What a built chunk takes: the files it imports statically (needed
// before it runs), those it imports dynamically (only when that code
// runs), and the assets it names by URL (wasm, CSS: fetched when the
// code that names them runs, which for a page's first chunk is at once).
function chunkEdges(file) {
  const text = readFileSync(file, "utf8");
  const stat = new Set();
  const lazy = new Set();
  const named = new Set();
  const add = (set, spec) => {
    const path = local(file, spec);
    if (path && ASSET.test(path)) set.add(path);
  };
  // `import"./a.js"`, `import{a}from"./a.js"`, `export*from"./a.js"`
  for (const [, spec] of text.matchAll(/(?:\bimport|\bfrom)\s*["']([^"']+)["']/g)) add(stat, spec);
  for (const [, spec] of text.matchAll(/\bimport\(\s*["'`]([^"'`$]+)["'`]\s*\)/g)) add(lazy, spec);
  // Vite's preload map: the files each dynamic import brings with it.
  const deps = text.match(/__vite__mapDeps\s*=\s*\([^)]*?\)\s*=>\s*[^[]*\[\s*\]\s*,?\s*[^=]*=\s*\[([^\]]*)\]/) ?? text.match(/m\.f\s*\|\|\s*\(m\.f\s*=\s*\[([^\]]*)\]/);
  if (deps) for (const [, spec] of deps[1].matchAll(/["']([^"']+)["']/g)) add(lazy, spec.startsWith(".") ? spec : `./${spec.replace(/^assets\//, "")}`);
  for (const [, spec] of text.matchAll(/new URL\(\s*["'`]([^"'`$]+)["'`]\s*,\s*import\.meta\.url\s*\)/g)) add(named, spec);
  return { stat, lazy, named };
}

const edges = new Map();
const edgesOf = (file) => (edges.has(file) ? edges.get(file) : (edges.set(file, file.endsWith(".js") || file.endsWith(".mjs") ? chunkEdges(file) : { stat: new Set(), lazy: new Set(), named: new Set() }), edges.get(file)));

// The closure of `roots` through static imports (and the URLs they name);
// the dynamic imports met on the way, for the caller to follow.
function closure(roots, already = new Set()) {
  const got = new Set();
  const lazy = new Set();
  const stack = [...roots];
  while (stack.length) {
    const file = stack.pop();
    if (got.has(file) || already.has(file)) continue;
    got.add(file);
    const { stat, lazy: later, named } = edgesOf(file);
    for (const next of [...stat, ...named]) stack.push(next);
    for (const next of later) lazy.add(next);
  }
  return { got, lazy };
}

function summed(files, dist) {
  const list = [...files].map((file) => ({ file: relative(dist, file), ...sized(file) })).sort((a, b) => b.gzip - a.gzip);
  const kind = (ext) => list.filter((entry) => entry.file.endsWith(ext));
  const total = (entries) => entries.reduce((sum, entry) => ({ raw: sum.raw + entry.raw, gzip: sum.gzip + entry.gzip, count: sum.count + 1 }), { raw: 0, gzip: 0, count: 0 });
  return { total: total(list), html: total(kind(".html")), js: total(kind(".js")), css: total(kind(".css")), wasm: total(kind(".wasm")), files: list };
}

export function pageReport(dist, { base = "/" } = {}) {
  dist = resolve(dist);
  site = { dist, base: base.endsWith("/") ? base : `${base}/` };
  gzipped.clear();
  edges.clear();
  return pagesUnder(dist).map(({ route, file }) => {
    const first = closure(htmlAssets(file));
    // The page itself is first-load too, with what it carries (its
    // props, its prerendered markup).
    first.got.add(file);
    // Everything reachable later, through any number of dynamic imports.
    const later = new Set();
    let frontier = [...first.lazy];
    const seen = new Set(first.got);
    while (frontier.length) {
      const { got, lazy } = closure(frontier, seen);
      for (const path of got) later.add(path), seen.add(path);
      frontier = [...lazy].filter((path) => !seen.has(path));
    }
    return { route, first: summed(first.got, dist), later: summed(later, dist) };
  });
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)}`;

export function pageTable(report, { files = false } = {}) {
  const lines = [
    "| page | first: requests | first: raw kB | first: gzip kB | html gzip | js gzip | css gzip | wasm gzip | later: requests | later: gzip kB |",
    "|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|",
  ];
  for (const { route, first, later } of report) {
    lines.push(`| ${route} | ${first.total.count} | ${kb(first.total.raw)} | ${kb(first.total.gzip)} | ${kb(first.html.gzip)} | ${kb(first.js.gzip)} | ${kb(first.css.gzip)} | ${kb(first.wasm.gzip)} | ${later.total.count} | ${kb(later.total.gzip)} |`);
    if (files) for (const entry of first.files) lines.push(`|  ${entry.file} | | ${kb(entry.raw)} | ${kb(entry.gzip)} | | | | | | |`);
  }
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dist, ...flags] = process.argv.slice(2);
  if (!dist) {
    console.error("usage: node size/pages.js <site dist> [--base /path/] [--json] [--files]");
    process.exit(2);
  }
  const at = flags.indexOf("--base");
  const report = pageReport(dist, at >= 0 ? { base: flags[at + 1] } : {});
  if (flags.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else console.log(pageTable(report, { files: flags.includes("--files") }));
}

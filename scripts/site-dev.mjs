// `mise run site`: ljos.dev (site-ljos) built, served and rebuilt as its
// sources change, with open pages reloaded once a rebuild lands.
//
//   node scripts/site-dev.mjs [--build] [--port N] [--base PATH]
//
// The build is site-ljos's own (`pnpm --filter ljos-site-ljos build`),
// run in a fresh process each time, so a rebuild reads the controls,
// the runtime and the docs as they are on disk then. It writes
// site-ljos/dist; what is served is a copy of the last build that
// passed, so a failed rebuild leaves the page a reader has open as it
// was. The mise task builds the compiler, the wasm and Chromium first,
// and sets QMLC and LJOS_DOCS_DIR.
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, watch } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({
  options: {
    build: { type: "boolean", default: false },
    port: { type: "string", default: process.env.PORT || "4471" },
    base: { type: "string", default: process.env.LJOS_SITE_BASE || "/" },
  },
});
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`site: --port ${values.port} is not a port number`);
  process.exit(2);
}
const base = values.base;
if (!base.startsWith("/") || !base.endsWith("/")) {
  console.error(`site: --base ${JSON.stringify(base)} is a path that starts and ends with "/" (such as "/" or "/ljos-web/")`);
  process.exit(2);
}
process.env.LJOS_SITE_BASE = base;

const dist = join(repo, "site-ljos", "dist");
const targetDir = resolve(repo, process.env.CARGO_TARGET_DIR || "target");
const served = join(targetDir, "site-dev", "served");

const seconds = (start) => `${((Date.now() - start) / 1000).toFixed(1)} s`;

// The build's own output goes to the terminal as it comes, so a failure
// reads as the build said it.
function run(command, args) {
  return new Promise((done) => {
    const child = spawn(command, args, { cwd: repo, stdio: "inherit", env: process.env });
    child.on("error", (error) => {
      console.error(`site: ${command}: ${error.message}`);
      done(false);
    });
    child.on("exit", (code, signal) => done(code === 0 && !signal));
  });
}

const buildSite = () => run("pnpm", ["--filter", "ljos-site-ljos", "build"]);

if (values.build) {
  const start = Date.now();
  const ok = await buildSite();
  if (!ok) {
    console.error(`site: the build failed after ${seconds(start)}`);
    process.exit(1);
  }
  console.log(`site: built ${relative(process.cwd(), dist) || dist} for ${base} in ${seconds(start)}`);
  process.exit(0);
}

// --- serving -------------------------------------------------------------

// As site-ljos/scripts/serve.mjs serves, so a page behaves here as it
// does under the tests and on Pages: only below the base, `404.html`
// for an address that names no file. Each HTML page also gets the
// live-reload script.
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".json": "application/json", ".wasm": "application/wasm", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8" };
const EVENTS = "/__site-dev/events";
const RELOADER = `<script>(() => {
  const events = new EventSource(${JSON.stringify(EVENTS)});
  events.addEventListener("reload", () => location.reload());
  events.addEventListener("failed", () => console.warn("site: the rebuild failed; this is the last good build (see the terminal)"));
})();</script>`;
const listeners = new Set();
let lastGood = false;

function send(event, data = "") {
  for (const response of listeners) response.write(`event: ${event}\ndata: ${data}\n\n`);
}

function notBuilt(response) {
  response.writeHead(503, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  response.end(`<!doctype html><title>site: not built</title><p>No build of the site has passed yet; the terminal running <code>mise run site</code> says why. This page reloads when one does.</p>${RELOADER}`);
}

function file(response, path, status = 200) {
  const type = TYPES[extname(path)] ?? "application/octet-stream";
  let body = readFileSync(path);
  if (type.startsWith("text/html")) {
    const html = body.toString("utf8");
    const at = html.lastIndexOf("</body>");
    body = at < 0 ? html + RELOADER : html.slice(0, at) + RELOADER + html.slice(at);
  }
  response.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  response.end(body);
}

const server = createServer((request, response) => {
  const url = new URL(request.url, "http://site");
  if (url.pathname === EVENTS) {
    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
    response.write(": connected\n\n");
    listeners.add(response);
    request.on("close", () => listeners.delete(response));
    return;
  }
  let path;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end("bad address\n");
    return;
  }
  if (base !== "/" && path === base.slice(0, -1)) {
    response.writeHead(301, { location: base }).end();
    return;
  }
  if (!path.startsWith(base)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end(`not here: the site stands at ${base}\n`);
    return;
  }
  if (!lastGood) {
    notBuilt(response);
    return;
  }
  path = `/${path.slice(base.length)}`;
  if (path.endsWith("/")) path += "index.html";
  const wanted = normalize(join(served, path));
  if (!wanted.startsWith(served + sep) || !existsSync(wanted) || !statSync(wanted).isFile()) {
    const missing = join(served, "404.html");
    if (existsSync(missing)) file(response, missing, 404);
    else response.writeHead(404).end("not here\n");
    return;
  }
  file(response, wanted);
});

// The copy that is served is replaced whole, and only by a build that
// passed.
function keep() {
  const next = `${served}.next`;
  rmSync(next, { recursive: true, force: true });
  mkdirSync(dirname(served), { recursive: true });
  cpSync(dist, next, { recursive: true });
  rmSync(served, { recursive: true, force: true });
  renameSync(next, served);
  lastGood = true;
}

// --- rebuilding ------------------------------------------------------------

// What a change under crates/ (or the Cargo files) needs before the site
// is built again: the compilers and the kernel the build and the pages
// use. cargo rebuilds only what the change touched. A QMLC the caller
// named is theirs, and left alone.
async function buildRust() {
  const steps = [];
  if (process.env.LJOS_SITE_OWN_QMLC !== "1") steps.push(["cargo", ["build", "--bin", "qmlc"]]);
  steps.push(["mise", ["run", "build:wasm-compiler"]], ["mise", ["run", "build:kernel"]], ["mise", ["run", "build:wasm-3d"]]);
  for (const [command, args] of steps) if (!(await run(command, args))) return false;
  return true;
}

// Paths are relative to the repository. Outputs the build and the tasks
// write into the watched trees are not changes to the site's sources:
// site-ljos's build writes its generated pages into site-ljos/bundle
// itself, so a change git ignores never starts a build, or each build
// would start the next. The patterns below cover what git would say
// where there is no git (a tarball).
const docs = process.env.LJOS_DOCS_DIR ? resolve(process.env.LJOS_DOCS_DIR) : undefined;
const WATCHED = [
  { dir: join(repo, "site-ljos", "bundle") },
  { dir: join(repo, "site-ljos", "scripts") },
  { dir: join(repo, "packages", "runtime") },
  { dir: join(repo, "crates"), rust: true },
  { dir: repo, files: ["Cargo.toml", "Cargo.lock"], rust: true },
  ...(docs ? [{ dir: docs }] : []),
];
const IGNORED = [
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)\.git(\/|$)/,
  /^packages\/runtime\/(tests|site-tests|size|test-results|playwright-report)\//,
  /^packages\/runtime\/kernel\/[^/]*\.wasm$/,
  /^packages\/runtime\/compiler\/[^/]*\.wasm$/,
  /^packages\/runtime\/QtQuick3D\/wgpu\//,
  /(^|\/)target\//,
  /~$|\.swp$|\.swx$|(^|\/)\.#|(^|\/)4913$/,
];

let pending = new Map(); // path -> needs a Rust build
let timer;
let building = false;

function changed(path, rust) {
  const shown = docs && path.startsWith(docs) ? `docs/${relative(docs, path)}` : relative(repo, path);
  if (IGNORED.some((pattern) => pattern.test(shown))) return;
  pending.set(shown, (pending.get(shown) ?? false) || rust);
  clearTimeout(timer);
  timer = setTimeout(rebuild, 300);
}

// The paths of a batch git ignores, asked once for the whole batch.
function gitIgnored(paths) {
  const inRepo = paths.filter((path) => !path.startsWith("docs/") || !docs);
  if (!inRepo.length) return new Set();
  const asked = spawnSync("git", ["check-ignore", "--stdin", "-z"], { cwd: repo, input: inRepo.join("\0"), encoding: "utf8" });
  // 0: some are ignored, 1: none are; anything else (no git) ignores none.
  if (asked.status !== 0) return new Set();
  return new Set(asked.stdout.split("\0").filter(Boolean));
}

async function rebuild() {
  if (building) return; // the build in flight runs again when it ends
  const ignored = gitIgnored([...pending.keys()]);
  for (const path of ignored) pending.delete(path);
  if (!pending.size) return;
  building = true;
  const batch = pending;
  pending = new Map();
  const names = [...batch.keys()];
  const rust = [...batch.values()].some(Boolean);
  console.log(`\nsite: changed: ${names.slice(0, 5).join(", ")}${names.length > 5 ? ` and ${names.length - 5} more` : ""}`);
  send("building");
  const start = Date.now();
  const ok = (!rust || (await buildRust())) && (await buildSite());
  if (ok) {
    keep();
    console.log(`site: rebuilt in ${seconds(start)}; reloading ${listeners.size} open page${listeners.size === 1 ? "" : "s"}`);
    send("reload");
  } else {
    console.error(`site: the rebuild failed after ${seconds(start)}; still serving the last good build${lastGood ? "" : " (none yet)"}`);
    send("failed");
  }
  console.log(`site: ${url}`);
  building = false;
  if (pending.size) rebuild();
}

for (const { dir, files, rust = false } of WATCHED) {
  if (!existsSync(dir)) continue;
  watch(dir, { recursive: !files }, (_event, name) => {
    if (!name) return;
    if (files && !files.includes(String(name))) return;
    changed(join(dir, String(name)), rust);
  });
}

const url = `http://127.0.0.1:${port}${base}`;
server.on("error", (error) => {
  console.error(error.code === "EADDRINUSE" ? `site: port ${port} is in use; pick another with --port N or PORT=N` : `site: ${error.message}`);
  process.exit(1);
});
server.listen(port, "127.0.0.1", async () => {
  const start = Date.now();
  if (await buildSite()) {
    keep();
    console.log(`site: built in ${seconds(start)}; watching for changes`);
  } else {
    console.error(`site: the first build failed after ${seconds(start)}; fix it and save, and the site is built again`);
  }
  console.log(`site: ${url}`);
});

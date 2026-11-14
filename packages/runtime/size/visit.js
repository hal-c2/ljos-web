// What a visit to each page of a built site fetched: the files a
// browser asked for on first load (until the network is quiet) and
// after a reader's first edit (a click into the page's first code
// editor, and a keystroke), raw and gzip, by kind. Where pages.js
// reads what the build wrote, this is what one visit asked for: the
// two agree on first load unless the page imports on its own.
//
// usage: node size/visit.js <site dist> <route>... [--json] [--files]
//   the site is served from <dist> at the root on a free port
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".wasm": "application/wasm" };

function serve(dir) {
  const server = createServer((request, response) => {
    let path = decodeURIComponent(new URL(request.url, "http://site").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = normalize(join(dir, path));
    // Inside the dist, not a sibling that shares its name's start.
    const inside = relative(dir, file);
    if (inside.startsWith("..") || isAbsolute(inside) || !existsSync(file) || !statSync(file).isFile()) return response.writeHead(404).end();
    response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done(server)));
}

const kindOf = (path) => (/\.(?:js|mjs)$/.test(path) ? "js" : path.endsWith(".css") ? "css" : path.endsWith(".wasm") ? "wasm" : "other");

function summed(entries) {
  const total = (list) => list.reduce((sum, entry) => ({ raw: sum.raw + entry.raw, gzip: sum.gzip + entry.gzip, count: sum.count + 1 }), { raw: 0, gzip: 0, count: 0 });
  const files = [...entries].sort((a, b) => b.gzip - a.gzip);
  return { total: total(files), js: total(files.filter((entry) => entry.kind === "js")), css: total(files.filter((entry) => entry.kind === "css")), wasm: total(files.filter((entry) => entry.kind === "wasm")), files };
}

export async function visit(dist, routes) {
  dist = resolve(dist);
  const server = await serve(dist);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const report = [];
  let browser;
  try {
    browser = await chromium.launch();
    for (const route of routes) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
      let phase = [];
      // A body is read after its request finished: each read goes to the
      // phase it finished in, and a phase is summed once its reads are in,
      // those that began while the earlier ones were read too.
      let reading = [];
      page.on("requestfinished", (request) => {
        const url = new URL(request.url());
        // A blob: is the page's own making (a compiled module, a worker).
        if (url.protocol !== "http:" || url.origin !== origin || url.pathname.endsWith(".html") || url.pathname.endsWith("/")) return;
        const into = phase;
        reading.push(
          request
            .response()
            .then((response) => response?.body())
            .catch(() => null)
            .then((body) => {
              if (body) into.push({ file: url.pathname.slice(1), kind: kindOf(url.pathname), raw: body.length, gzip: gzipSync(body, { level: 9 }).length });
            }),
        );
      });
      const read = async () => {
        while (reading.length) {
          const pending = reading;
          reading = [];
          await Promise.all(pending);
        }
      };
      await page.goto(`${origin}${route}`);
      await page.waitForSelector('#app[data-ljos-hydrated="true"]', { timeout: 30_000 }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
      await read();
      const first = phase;
      phase = [];
      // A reader's first edit: the page's first code editor, if any. An
      // edit that could not be made says where it stopped, not a size.
      const editor = page.getByRole("textbox", { name: /^Edit / }).first();
      let edit = null;
      if (await editor.count()) {
        let step = "click into the editor";
        try {
          await editor.click({ timeout: 10_000 });
          step = "wait for CodeMirror";
          await page.waitForSelector(".cm-content", { timeout: 30_000 });
          step = "type";
          await page.keyboard.press("Control+Home");
          await page.keyboard.type("// edited\n");
          await page.waitForTimeout(1500);
          await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
          await read();
          edit = summed(phase);
        } catch (error) {
          edit = { failed: `${step}: ${error.message.split("\n")[0]}` };
        }
      }
      report.push({ route, first: summed(first), edit });
      await page.close();
    }
  } finally {
    await browser?.close();
    server.close();
  }
  return report;
}

const kb = (bytes) => (bytes / 1024).toFixed(1);

export function visitTable(report, { files = false } = {}) {
  const lines = [
    "| page | first: requests | first: raw kB | first: gzip kB | js gzip | css gzip | wasm gzip | after an edit: requests | after an edit: gzip kB |",
    "|---|--:|--:|--:|--:|--:|--:|--:|--:|",
  ];
  for (const { route, first, edit } of report) {
    lines.push(`| ${route} | ${first.total.count} | ${kb(first.total.raw)} | ${kb(first.total.gzip)} | ${kb(first.js.gzip)} | ${kb(first.css.gzip)} | ${kb(first.wasm.gzip)} | ${!edit ? "no editor" : edit.failed ? `edit failed (${edit.failed})` : edit.total.count} | ${edit?.total ? kb(edit.total.gzip) : ""} |`);
    if (files) for (const entry of first.files) lines.push(`|  ${entry.file} | | ${kb(entry.raw)} | ${kb(entry.gzip)} | | | | | |`);
  }
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const [dist, ...rest] = args.filter((arg) => !arg.startsWith("--"));
  if (!dist || !rest.length) {
    console.error("usage: node size/visit.js <site dist> <route>... [--json] [--files]");
    process.exit(2);
  }
  const report = await visit(dist, rest);
  if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else console.log(visitTable(report, { files: args.includes("--files") }));
}

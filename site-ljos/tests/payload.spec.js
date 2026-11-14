// What a page loads before a reader does anything: the files its HTML
// names and everything they import statically, read from the build
// (ljos-web's size/pages.js), and what one visit to a page asked for.
// Code a page never uses stays out of its first load. When it gets
// back in, the failure lists the files and the pages they reached.
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { pageReport } from "../../packages/runtime/size/pages.js";

const dist = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "dist");
const base = process.env.LJOS_SITE_BASE ?? "/";
const report = pageReport(dist);
const kB = (bytes) => Math.round(bytes / 1024);
const named = (file, prefix) => file.split("/").pop().startsWith(prefix);

// Each page's first-load files that match, by page.
function reaching(prefixes, pages = report) {
  const found = {};
  for (const { route, first } of pages) {
    const files = first.files.filter((entry) => prefixes.some((prefix) => named(entry.file, prefix))).map((entry) => entry.file);
    if (files.length) found[route] = files;
  }
  return found;
}

test("the report reads every page the build wrote", () => {
  expect(report.length).toBeGreaterThan(50);
  for (const { route, first } of report) expect(first.js.count, `${route} loads its script`).toBeGreaterThan(0);
});

// What only an edit, a 3D physics scene or a database needs.
test("no page's first load holds the editor, the compiler, PhysX or sql.js", () => {
  expect(reaching(["attach-", "ljos_web_compiler", "physx-", "sql-wasm"])).toEqual({});
  const wasm = report.filter(({ first }) => first.wasm.count > 0).map(({ route, first }) => `${route}: ${first.files.filter((entry) => entry.file.endsWith(".wasm")).map((entry) => entry.file)}`);
  expect(wasm).toEqual([]);
});

// The ceiling stands at what a page loads now, and comes down as code
// a page does not use leaves its first load. It never goes up.
const CEILING_KB = 620;

test(`no page's first load is over ${CEILING_KB} kB gzip`, () => {
  const over = report.filter(({ first }) => first.total.gzip > CEILING_KB * 1024).map(({ route, first }) => `${route}: ${kB(first.total.gzip)} kB`);
  expect(over).toEqual([]);
});

// A page with no code block asks for what its HTML names and nothing
// else: no module it fetches on its own once it runs.
test("a page with nothing to run asks for nothing past its first load", async ({ page }) => {
  const route = "rust/overview/";
  const static_ = report.find((entry) => entry.route === `/${route}`);
  expect(static_, `/${route} is built`).toBeTruthy();
  const expected = new Set(static_.first.files.map((entry) => entry.file));
  const asked = [];
  page.on("requestfinished", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "http:" || !/\.(?:js|mjs|css|wasm)$/.test(url.pathname)) return;
    asked.push(url.pathname.slice(base.length));
  });
  await page.goto(`${base}${route}`);
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  await page.waitForLoadState("networkidle");
  expect(asked.filter((file) => !expected.has(file))).toEqual([]);
});

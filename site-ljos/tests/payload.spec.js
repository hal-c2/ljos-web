// What a page loads before a reader does anything: the files its HTML
// names and everything they import statically, read from the build
// (ljos-web's size/pages.js), and what one visit to a page asked for.
// Code a page never uses stays out of its first load. When it gets
// back in, the failure lists the files and the pages they reached.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { pageReport } from "../../packages/runtime/size/pages.js";

const dist = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "dist");
const base = process.env.LJOS_SITE_BASE ?? "/";
const report = pageReport(dist, { base });
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

// What only an edit, a 3D physics scene or a database needs, in what
// the build makes every page load: its HTML's files and their static
// imports. A page's script may still import these at once as it runs;
// what a visit asks for is pinned in a browser.
test("no page's static first load holds the editor, the compiler, PhysX or sql.js", () => {
  expect(reaching(["attach-", "ljos_web_compiler", "physx-", "sql-wasm"])).toEqual({});
  const wasm = report.filter(({ first }) => first.wasm.count > 0).map(({ route, first }) => `${route}: ${first.files.filter((entry) => entry.file.endsWith(".wasm")).map((entry) => entry.file)}`);
  expect(wasm).toEqual([]);
});

// The in-page compiler's table of modules, and the whole namespaces it
// hands compiled QML (every type `QtQuick` has), come with a reader's
// first edit: a page's own QML takes only the types it names.
test("no page's first load holds the compiler's modules or a whole namespace", () => {
  expect(reaching(["modules-", "QtQuick-"])).toEqual({});
  // The whole namespace is a chunk of its own, fetched later: folded
  // back into a page's first chunk, it would not be named and the line
  // above would pass with it there.
  const later = new Set(report.flatMap(({ later }) => later.files.map((entry) => entry.file)));
  expect([...later].some((file) => named(file, "QtQuick-")), "a QtQuick-* chunk the compiler's modules fetch").toBe(true);
  expect([...later].some((file) => named(file, "modules-")), "a modules-* chunk").toBe(true);
});

// A docs page's reading is its own: in its HTML's props, not in a
// script every page loads. Another page's headings are in none of
// a page's first-load files.
test("a docs page's first load holds no other page's reading", () => {
  const propsOf = (route) => {
    const html = readFileSync(join(dist, route, "index.html"), "utf8");
    const json = html.match(/<script type="application\/json" id="ljos-props">([\s\S]*?)<\/script>/)?.[1];
    return json ? JSON.parse(json) : null;
  };
  const other = propsOf("start/install");
  expect(other?.page?.headings?.length, "/start/install/ carries its own headings").toBeGreaterThan(0);
  const words = other.page.headings.map((heading) => heading.plain).filter((text) => typeof text === "string" && text.length > 12);
  expect(words.length).toBeGreaterThan(0);
  const reader = report.find((entry) => entry.route === "/rust/overview/");
  const holding = reader.first.files.filter((entry) => entry.file.endsWith(".js")).filter((entry) => words.some((text) => readFileSync(join(dist, entry.file), "utf8").includes(JSON.stringify(text).slice(1, -1))));
  expect(holding.map((entry) => entry.file)).toEqual([]);
});

// The ceiling stands at what a page loads now, its own HTML with it,
// and comes down as code a page does not use leaves its first load.
// It never goes up.
const CEILING_KB = 395;

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

// A page whose code blocks run asks for what an edit needs (the
// compiler, its wasm and modules, the editor) only once the reader
// reaches for a block's code and edits it: a reader who only reads
// fetches none.
for (const route of ["language/overview/", "demos/"]) {
  test(`/${route} fetches the compiler and the editor for the reader's first edit, not before`, async ({ page }) => {
    const asked = [];
    page.on("requestfinished", (request) => {
      const url = new URL(request.url());
      if (url.protocol === "http:" && /\.(?:js|mjs|wasm)$/.test(url.pathname)) asked.push(url.pathname.split("/").pop());
    });
    const forEdit = () => asked.filter((file) => file.endsWith(".wasm") || ["attach-", "modules-", "compiler-", "ljos_web_compiler"].some((prefix) => file.startsWith(prefix)));
    await page.setViewportSize({ width: 1440, height: 1600 });
    await page.goto(`${base}${route}`);
    await page.waitForSelector('#app[data-ljos-hydrated="true"]');
    await page.waitForLoadState("networkidle");
    expect(forEdit(), "before the reader reaches for the code").toEqual([]);
    await page.getByRole("textbox", { name: /^Edit / }).first().click();
    await page.waitForSelector(".cm-content");
    await page.waitForLoadState("networkidle");
    // Reaching for the code brings the editor, and runs nothing yet.
    expect(forEdit().filter((file) => file.startsWith("ljos_web_compiler")), "once the editor is in, before an edit").toEqual([]);
    await page.keyboard.press("Control+Home");
    await page.keyboard.type("// edited\n");
    await expect.poll(() => forEdit().some((file) => file.startsWith("attach-")), { timeout: 30_000 }).toBe(true);
    await expect.poll(() => forEdit().some((file) => file.startsWith("ljos_web_compiler") && file.endsWith(".wasm")), { timeout: 30_000 }).toBe(true);
  });
}

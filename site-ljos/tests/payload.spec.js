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

// Every page is written in the Marketing shell; the others a reader
// picks come with the pick (bundle/Shells/later.js,
// features/shells.feature), and so do the switcher's choices and a
// shell's source with the first look at them.
test("no page's first load holds a shell it is not written in, nor what picks one", () => {
  expect(reaching(["Workbench-", "Desktop-"])).toEqual({});
  const later = new Set(report.flatMap(({ later }) => later.files.map((entry) => entry.file)));
  for (const shell of ["Workbench-", "Desktop-"]) expect([...later].some((file) => named(file, shell)), `a ${shell}* chunk a pick fetches`).toBe(true);
  // The shell choices and a shell's source are drawn in Ljós's own
  // controls, which reading a page does not need (bundle/Site/later.js).
  expect(reaching(["ShellChoices-", "ShellSource-"])).toEqual({});
  for (const panel of ["ShellChoices-", "ShellSource-"]) expect([...later].some((file) => named(file, panel)), `a ${panel}* chunk opening it fetches`).toBe(true);
});

// The header's one icon is a picture (Site/GitHubMark.qml): QtQuick.Shapes
// is for a demo that draws with it, and comes with that demo.
test("no page's first load holds QtQuick.Shapes", () => {
  expect(reaching(["Shape-", "Shapes-", "Path-"])).toEqual({});
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
// It never goes up for code a page does not use. It went up once, from
// 395 kB, for what every page uses: its links are the page's own `a`s,
// with their addresses in its HTML, and a press shows the page in
// place (nav.js), about 2.5 kB. What a docs page loads and does not
// use is far more: the front page and the demos are made by the shell
// every page loads, and with them the 3D and the effects. It went up
// again, from 400 kB, for what a page's live examples use: each one's
// picture in the dark scheme, and the words for one that draws nothing
// yet, written in the page because its two schemes share one tree
// (2.2 kB on /data/models/, which has eight). A plain card writes
// neither. /start/cli/, all plain cards, already loaded 401.2 kB
// before them. It went up again, from 403 kB, for a live example on a
// phone: its stage and toolbar come before its code, so the narrow
// page writes them in another order than the wide one and the two
// compress less together (1.6 kB on /data/models/), and the runtime
// keeps a reader's focus in a part that moves (1.1 kB). A plain card
// now writes none of a live one's parts, nor a fold its code is too
// short for: /start/cli/ came down from 403 kB to 374 kB.
const CEILING_KB = 405;

test(`no page's first load is over ${CEILING_KB} kB gzip`, () => {
  const over = report.filter(({ first }) => first.total.gzip > CEILING_KB * 1024).map(({ route, first }) => `${route}: ${kB(first.total.gzip)} kB`);
  expect(over).toEqual([]);
});

// Every page is written wide and narrow, so a list in a part the narrow
// page hides is in every reader's first load (features/shells.feature).
// /start/cli/ has the most headings, and so the most to lose.
test("the contents beside the page are written only where they are shown", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(`${base}start/cli/`);
    const copies = await page
      .locator('[role="complementary"][aria-label="On this page"]')
      .evaluateAll((all) => all.map((one) => ({ shown: one.style.display !== "none", links: one.querySelectorAll("a").length })));
    expect(copies.filter((copy) => copy.shown && copy.links > 0), "the wide page's list").toHaveLength(1);
    expect(copies.filter((copy) => !copy.shown && copy.links > 0), "a hidden sidebar's list").toEqual([]);
  } finally {
    await context.close();
  }
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

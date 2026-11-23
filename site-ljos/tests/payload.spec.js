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
// What a page waits for before it is written or taken over is its first
// load too, though the build imports it dynamically (bundle/Site/later.js,
// `awaited`).
const AWAITED = { "/": ["Landing-"], "/showcase/": ["ShowcasePage-"] };
const report = pageReport(dist, { base, awaited: AWAITED });
const kB = (bytes) => Math.round(bytes / 1024);
const named = (file, prefix) => file.split("/").pop().startsWith(prefix);
// What some page fetches once it runs, past its first load.
const later = new Set(report.flatMap(({ later }) => later.files.map((entry) => entry.file)));

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
  // The bundle's own first-load code is one file (`site-*`,
  // packages/runtime/site.js): a module that got in with it would not
  // be named, and the line above would pass with it there. The editor is a
  // chunk of its own, fetched later; the compiler's, PhysX's and sql.js's
  // scripts each name their .wasm, which no first-load script does.
  expect([...later].some((file) => named(file, "attach-") && file.endsWith(".js")), "an attach-* chunk an edit fetches").toBe(true);
  const wasmOf = ["ljos_web_compiler-", "physx-js-webidl-", "sql-wasm-browser-"];
  for (const prefix of wasmOf) expect([...later].some((file) => named(file, prefix) && file.endsWith(".wasm")), `a ${prefix}*.wasm fetched later`).toBe(true);
  const scripts = new Set(report.flatMap(({ first }) => first.files.map((entry) => entry.file).filter((file) => file.endsWith(".js"))));
  const naming = [...scripts].flatMap((file) => {
    const text = readFileSync(join(dist, file), "utf8");
    return wasmOf.filter((prefix) => text.includes(prefix)).map((prefix) => `${file} names ${prefix}*.wasm`);
  });
  expect(naming).toEqual([]);
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
  expect([...later].some((file) => named(file, "QtQuick-")), "a QtQuick-* chunk the compiler's modules fetch").toBe(true);
  expect([...later].some((file) => named(file, "modules-")), "a modules-* chunk").toBe(true);
});

// Every page is written in the Elegant shell; the others a reader
// picks come with the pick (bundle/Shells/later.js,
// features/shells.feature), and so do the switcher's choices and a
// shell's source with the first look at them.
test("no page's first load holds a shell it is not written in, nor what picks one", () => {
  expect(reaching(["Workbench-", "Desktop-"])).toEqual({});
  for (const shell of ["Workbench-", "Desktop-"]) expect([...later].some((file) => named(file, shell)), `a ${shell}* chunk a pick fetches`).toBe(true);
  // The shell choices and a shell's source are drawn in Ljós's own
  // controls, which reading a page does not need (bundle/Site/later.js).
  expect(reaching(["ShellChoices-", "ShellSource-"])).toEqual({});
  for (const panel of ["ShellChoices-", "ShellSource-"]) expect([...later].some((file) => named(file, panel)), `a ${panel}* chunk opening it fetches`).toBe(true);
});

// The showcase is a module of its own (bundle/Site/later.js), with its
// apps' data: no other page's first load holds it. The showcase is
// written with it and asks for it as it is taken over, so it is counted
// in that page's first load.
test("no page but the showcase's first load holds the showcase", () => {
  const showcase = report.find(({ route }) => route === "/showcase/");
  expect(reaching(["ShowcasePage-"], report.filter((entry) => entry !== showcase))).toEqual({});
  expect(reaching(["ShowcasePage-"], pageReport(dist, { base })), "a chunk no page imports statically").toEqual({});
  expect(reaching(["ShowcasePage-"], [showcase]), "the ShowcasePage-* chunk the showcase waits for, counted").toHaveProperty(["/showcase/"]);
  // Its apps as written, from the data only that module carries.
  const written = readFileSync(join(dist, "showcase/index.html"), "utf8");
  expect(written, "the showcase as written").toContain("Built with Ljós");
  expect(written, "an app the showcase shows, as written").toContain("The Office");
});

// The header's one icon is a picture (Site/GitHubMark.qml): QtQuick.Shapes
// is for a demo that draws with it, and comes with that demo.
test("no page's first load holds QtQuick.Shapes", () => {
  expect(reaching(["Shape-", "Shapes-", "Path-"])).toEqual({});
  // Its Shape is a chunk of its own, fetched later: joined into a
  // first-load file (`site-*`, packages/runtime/site.js), it would not be
  // named and the line above would pass with it there.
  expect([...later].some((file) => named(file, "Shape-")), "a Shape-* chunk a demo fetches").toBe(true);
});

// The bundle's own code a page loads first is one file (`site-*`,
// packages/runtime/site.js): not cut into a file for each set of later
// modules that share some of it (a page or a demo of its own), each
// costing every page a file and a context gzip shares. Those cuts were
// named after a type or script they held.
test("a page's first load holds the bundle's own code in one file", () => {
  const sites = report.filter(({ first }) => first.files.filter((entry) => named(entry.file, "site-") && entry.file.endsWith(".js")).length !== 1).map(({ route }) => route);
  expect(sites, "pages without exactly one site-* script").toEqual([]);
  expect(reaching(["Toc-", "CodeBlock-", "StageButton-", "shells-", "observed-", "code-editor-", "LinkButton-", "Theme-"])).toEqual({});
});

// The `site-*` group takes the bundle's files without what they import
// (packages/runtime/site.js), and rolldown keeps the order modules run
// in only between chunks that are not in a cycle. So nothing `site-*`
// imports, however far down, may import it back: the runtime's chunks
// never reach the bundle's code.
test("nothing the bundle's first-load file imports imports it back", () => {
  const sites = new Set(report.flatMap(({ first }) => first.files.filter((entry) => named(entry.file, "site-") && entry.file.endsWith(".js")).map((entry) => join(dist, entry.file))));
  expect(sites.size).toBeGreaterThan(0);
  const imports = (file) => [...readFileSync(file, "utf8").matchAll(/(?:\bimport|\bfrom)\s*["'](\.{1,2}\/[^"']+\.js)["']/g)].map(([, spec]) => join(dirname(file), spec));
  const back = {};
  for (const site of sites) {
    const seen = new Set();
    const stack = imports(site);
    while (stack.length) {
      const file = stack.pop();
      if (seen.has(file)) continue;
      seen.add(file);
      const next = imports(file);
      if (next.includes(site)) (back[site.slice(dist.length + 1)] ??= []).push(file.slice(dist.length + 1));
      stack.push(...next);
    }
  }
  expect(back, "chunks that import the site-* file they are imported by").toEqual({});
});

// The front page is a module of its own (bundle/Site/later.js), with
// its demos' posters and its words: no other page's first load holds
// it. The front page is written with it and asks for it as it is taken
// over, so it is counted in that page's first load.
test("no page but the front page's first load holds the front page", () => {
  const front = report.find(({ route }) => route === "/");
  expect(reaching(["Landing-"], report.filter((entry) => entry !== front))).toEqual({});
  expect(reaching(["Landing-"], pageReport(dist, { base })), "a chunk no page imports statically").toEqual({});
  expect(reaching(["Landing-"], [front]), "the Landing-* chunk the front page waits for, counted").toHaveProperty(["/"]);
  // Its words as written, wrapped where the page laid them out.
  const written = readFileSync(join(dist, "index.html"), "utf8").replace(/\s+/g, " ");
  expect(written, "the front page as written").toContain("Software you can reshape while it runs.");
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

// The head is written into every page: what it says to whoever edits
// it stays in bundle/assets/head.html.
test("no page's head carries the comments of the file it is written from", () => {
  const source = readFileSync(join(dist, "../bundle/assets/head.html"), "utf8");
  const comments = [...source.matchAll(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//g)].map(([comment]) => comment.split("\n")[0]);
  expect(comments.length, "head.html says why").toBeGreaterThan(0);
  const html = readFileSync(join(dist, "index.html"), "utf8");
  const head = html.slice(0, html.indexOf("</head>"));
  expect(comments.filter((comment) => head.includes(comment))).toEqual([]);
});

// The page's one property that follows the window's width is set by
// its change: no page needs the Binding type for it (bundle/Main.qml).
test("no page's first load holds the Binding type", () => {
  expect(reaching(["Binding-"])).toEqual({});
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

// A plain code card is its code and its Copy. The toolbar and stage
// a live block runs in are made in a live card only: written hidden in
// every card, they were most of a long page's first load (Site/CodeBlock.qml).
test("a plain code card carries no live block's toolbar or stage", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    const live = async (route) => {
      await page.goto(`${base}${route}`);
      const cards = page.locator('[role="group"][aria-label^="Code"]');
      expect(await cards.count(), `${route} has code cards`).toBeGreaterThan(0);
      return cards.evaluateAll((all) =>
        all.filter((card) => card.querySelector('img[alt="What this example draws"]') || /\bReset\b/.test(card.textContent)).length,
      );
    };
    expect(await live("start/cli/"), "/start/cli/'s plain cards").toBe(0);
    expect(await live("start/first-app/"), "/start/first-app/'s live cards").toBeGreaterThan(0);
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

// The front page's replay reloads its app from a second module the build
// made, so it asks for nothing an edit needs: not as it loads, not while
// it plays, not once it has played to its end.
//
// Quiet is counted here, not read from Playwright's "networkidle": that
// fires once a navigation, and a frame made and dropped after it (the
// replay's screenshot measures styles in one) takes it back for good, as
// nothing after it restarts the wait. A file is counted as it is asked
// for, finished or not.
test("/ fetches no compiler and no editor through its whole replay", async ({ page }) => {
  const asked = [];
  let open = 0;
  let stirred = Date.now();
  page.on("request", (request) => {
    open += 1;
    stirred = Date.now();
    const url = new URL(request.url());
    if (url.protocol === "http:" && /\.(?:js|mjs|wasm)$/.test(url.pathname)) asked.push(url.pathname.split("/").pop());
  });
  const settled = () => {
    open -= 1;
    stirred = Date.now();
  };
  page.on("requestfinished", settled);
  page.on("requestfailed", settled);
  // As Playwright counts it: nothing asked for or on its way for 500 ms.
  const quiet = (message) => expect.poll(() => open === 0 && Date.now() - stirred >= 500, { message, timeout: 15_000 }).toBe(true);
  const forEdit = () => asked.filter((file) => file.endsWith(".wasm") || ["attach-", "modules-", "compiler-", "ljos_web_compiler"].some((prefix) => file.startsWith(prefix)));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base);
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  await page.waitForLoadState("networkidle");
  expect(forEdit(), "as it loads").toEqual([]);
  await expect(page.getByRole("button", { name: "Pause the agent replay" }), "while it plays").toBeVisible();
  await expect(page.getByText("reloaded", { exact: true }), "its edit, reloaded").toHaveCount(1, { timeout: 30_000 });
  await expect(page.getByText("answered", { exact: true }), "played to its end").toHaveCount(7, { timeout: 60_000 });
  await quiet("the page asks for nothing more once the replay has played");
  expect(forEdit(), "once it has played").toEqual([]);
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

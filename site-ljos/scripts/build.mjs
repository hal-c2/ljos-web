// ljos.dev as prerendered Ljós pages: the docs of the pinned ljos-ui
// revision (the same `site/ljos-ui.sha` the Astro site builds from),
// read as a Markdown content source, written into the bundle beside
// the hand-written shell, and built once — every route its own
// prerendered page. The Astro `site/` is untouched and keeps
// deploying; this writes `site-ljos/dist/` and nothing else serves
// or ships it yet.
//
// DECISION: the docs come from a checkout, as the Astro build's
// sync-docs has it: `LJOS_DOCS_DIR`, else the usual sibling layouts.
// CI checks ljos-ui out at the pin and says where it put it.
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createRequire } from "node:module";
import { highlight, readMarkdownSite } from "ljos-web/markdown";
import { buildSite } from "ljos-web/site";
import { checkExamples, hashExample, loadHarnesses, loadPrerenders, pruneCache, renderPrerenders, siteFiles } from "ljos-web/codeblocks";
import { assemble, packGiven, tagged } from "ljos-web/codeblocks/parse";
import { kernelNamed } from "ljos-web/vite";
import { packRich } from "ljos-web/codeblock/rich";
import { giveFiles, readGiven } from "../../site/scripts/codeblock-files.mjs";
import { keysByHash, listedEverywhere, pageOfRoute, pageRecords, readLedger, saysEverywhere } from "../../site/scripts/codeblocks-ledger.mjs";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Where the site stands below its address's root: `/` at a domain of
// its own, `/ljos-web/` as a project's github.io pages. Every asset a
// page asks for is relative already; what the base decides is where a
// route the site names from its root goes: the shell's `Content` says
// it, so every link a page prerenders already has its address
// (`nav.js`), and each page's head says it too.
const base = process.env.LJOS_SITE_BASE ?? "/";
if (!/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(base)) {
  console.error(`site-ljos: LJOS_SITE_BASE is ${JSON.stringify(base)}; it is a path that starts and ends with "/" (such as "/" or "/ljos-web/")`);
  process.exit(1);
}
// DECISION (site3 deploy): ljos.dev is the site's canonical home, so
// every build names each page's address there, the github.io preview
// at its project path too: origin + route, never origin + base +
// route. One constant, so a page's canonical link, its og:url, the
// sitemap and robots.txt cannot disagree.
const origin = process.env.LJOS_SITE_ORIGIN ?? "https://ljos.dev";
if (!/^https?:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(origin)) {
  console.error(`site-ljos: LJOS_SITE_ORIGIN is ${JSON.stringify(origin)}; it is a scheme and host with no path or trailing "/" (such as "https://ljos.dev")`);
  process.exit(1);
}
const repo = resolve(here, "..");
const bundle = join(here, "bundle");
// The example's paper, from the one file the bundle's Theme reads it
// from too: the picture and the paper under the running example match.
function examplePaper() {
  const found = /var examplePaper = "(#[0-9a-fA-F]{6})";/.exec(readFileSync(join(bundle, "paper.js"), "utf8"));
  if (!found) throw new Error("bundle/paper.js: no examplePaper");
  return found[1];
}
const out = join(here, "dist");

const candidates = [
  process.env.LJOS_DOCS_DIR,
  resolve(here, "../ljos-ui/docs/site"),
  resolve(here, "../../ljos-ui/docs/site"),
  join(homedir(), "dev/ljos-ui/docs/site"),
].filter(Boolean);
const docs = candidates.find((candidate) => existsSync(join(candidate, "start/index.md")));
if (!docs) {
  console.error(`site-ljos: no ljos-ui docs/site found. Tried:\n  ${candidates.join("\n  ")}\nSet LJOS_DOCS_DIR to a ljos-ui docs/site checkout.`);
  process.exit(1);
}
if (!process.env.LJOS_DOCS_DIR) {
  const pinned = readFileSync(join(repo, "site/ljos-ui.sha"), "utf8").trim();
  try {
    const head = execSync("git rev-parse HEAD", { cwd: docs, encoding: "utf8" }).trim();
    if (head !== pinned) console.warn(`site-ljos: WARNING docs checkout is at ${head}, but site/ljos-ui.sha pins ${pinned}; building the checkout's pages, not the pinned ones.`);
  } catch { /* not a git checkout: nothing to compare */ }
}

// The sections and their sidebar words are the Astro site's, so the
// two sites name the same map.
const SECTIONS = [
  { id: "start", label: "Start" },
  { id: "ui", label: "User interface" },
  { id: "controls", label: "Controls" },
  { id: "data", label: "Data and input" },
  { id: "language", label: "Language" },
  { id: "quality", label: "Quality" },
  { id: "rust", label: "Rust" },
];
const site = readMarkdownSite({ dir: docs, sections: SECTIONS });
const qmlc = process.env.QMLC ?? join(repo, "target/debug/qmlc");

// Live code blocks (docs/LJOS_WEB.md A27), without remark, as that
// section has a Ljós-page site use them: assemble each page's fences
// into examples, hold every one that claims to run to compiling and
// running at build time, and give the ones that do to the shell as
// live blocks — code beside its running result, the result
// prerendered to a picture for the page as first written and for a
// reader with no script, then mounted live in the page. An example
// that does not compile or run and never claimed to stays plain
// code and is counted; the site never shows a block as live that
// is not.
const harnesses = loadHarnesses(join(docs, "harness"));
const siteHeld = siteFiles(join(docs, "files"));
const liveAt = new Map(); // a page's code block -> its live payload
{
  const gathered = [];
  const onPages = [];
  const given = readGiven();
  for (const page of site.pages) {
    const fences = page.blocks.filter((block) => block.kind === "code");
    if (!fences.length) continue;
    const said = fences.map((block) => ({
      lang: block.lang,
      code: block.code,
      line: block.line ?? 0,
      ...(block.harness ? { harness: block.harness } : {}),
      ...(block.file ? { file: block.file } : {}),
      ...(block.group ? { group: block.group } : {}),
      ...(block.files ? { files: block.files } : {}),
      ...(block.before ? { before: true } : {}),
      of: block,
    }));
    const { examples } = assemble(said, { harnesses, files: siteHeld });
    giveFiles(pageOfRoute(page.route), said, examples, given);
    onPages.push({ page: pageOfRoute(page.route), fences: said, examples });
    for (const example of examples) gathered.push({ page, example });
  }
  // One stamp's answers to a directory, and this site is built on
  // either kernel: the default's stand at the top, another's beside
  // them, so neither build drops or makes again what the other made.
  const kernel = kernelNamed();
  const cacheDir = kernel === kernelNamed({}) ? join(here, ".codeblock-prerenders") : join(here, ".codeblock-prerenders", kernel);
  const checked = checkExamples(gathered.map(({ example }) => example), { qmlc });
  // An example is its hash: one on two pages is made once, and what is
  // said of the copy made is said of every place it stands.
  const refused = new Map(checked.map(({ example, diagnostics }) => [hashExample(example), diagnostics]));
  // As in site/scripts/codeblock-prerenders.mjs: an example the ledger
  // lists everywhere it stands is plain by the docs' own word.
  // The fixture's docs are not the ledger's (LJOS_CODEBLOCKS_LEDGER=none).
  const ledger = process.env.LJOS_CODEBLOCKS_LEDGER === "none" ? readLedger("") : readLedger();
  const keysOf = keysByHash(onPages, hashExample);
  const named = (example) => (keysOf.get(hashExample(example)) ?? []).join(", ");
  const mustRun = ({ example }) => example.blocks.some(tagged) && !listedEverywhere(keysOf.get(hashExample(example)) ?? [], ledger);
  const claimed = checked.filter(mustRun);
  if (claimed.length) {
    console.error(`site-ljos: ${claimed.length} example(s) claim to run and do not compile:`);
    for (const { example, diagnostics } of claimed) console.error(`  ${named(example)}:\n    ${diagnostics.join("\n    ")}`);
    process.exit(1);
  }
  const runnable = gathered.filter(({ example }) => !refused.has(hashExample(example)));
  const { manifest, failures } = await renderPrerenders(runnable.map(({ example }) => example), { cacheDir, qmlc, checked: true });
  // As in site/scripts/codeblock-prerenders.mjs: what a live example
  // said as it was made is news unless the ledger says it is the
  // page's point, and the example does not run as far as a reader is
  // concerned.
  for (const { example } of runnable) {
    const hash = hashExample(example);
    const said = manifest[hash]?.file ? manifest[hash].logged : undefined;
    if (said?.length && !saysEverywhere(keysOf.get(hash) ?? [], ledger))
      failures.push({ example, diagnostics: said.map((line) => `said as it was made: ${line}`) });
  }
  const unrun = new Map(failures.map(({ example, diagnostics }) => [hashExample(example), diagnostics]));
  const claimedUnrun = failures.filter(mustRun);
  if (claimedUnrun.length) {
    console.error(`site-ljos: ${claimedUnrun.length} example(s) claim to run and did not run:`);
    for (const { example, diagnostics } of claimedUnrun) console.error(`  ${named(example)}:\n    ${diagnostics.join("\n    ")}`);
    process.exit(1);
  }
  const prerendered = loadPrerenders(cacheDir);
  const live = runnable.filter(({ example }) => !unrun.has(hashExample(example)) && prerendered[hashExample(example)]?.html);
  // A picture of each live example's prerendered result, drawn by
  // the browser from the prerender's own HTML, cached by hash: the
  // stage a reader without script (and every reader, before the
  // live mount) is shown.
  const pictures = join(bundle, "Examples");
  rmSync(pictures, { recursive: true, force: true });
  mkdirSync(pictures, { recursive: true });
  // A picture is the prerender's, as this browser draws it, on the
  // example's paper (bundle/paper.js), which stands under the running
  // example too, light or dark alike: text the example gives no colour is
  // written for it, and would be lost on a dark page. One picture, not
  // one for each scheme: a page whose two schemes said two pictures would
  // be written twice over (site.js's shareSchemes). Kept under both
  // names, so a cache kept across builds never answers with one an older
  // runtime or browser drew. The page names it by its hash. How it is
  // drawn is in the name too (the stage around it, so the paper, and the
  // size an unsized root is given), so a changed recipe draws again.
  const EXAMPLE_PAPER = examplePaper();
  const STAGE = `<!doctype html><style>html,body{margin:0;background:${EXAMPLE_PAPER}}</style>`;
  const UNSIZED = [320, 180];
  const drawnBy = createHash("sha256").update(`${chromium.executablePath()}\n${STAGE}\n${UNSIZED}`).digest("hex").slice(0, 12);
  const kept = (hash) => `${hash.slice(0, 16)}-${createHash("sha256").update(`${prerendered[hash].stamp ?? ""}\n${drawnBy}`).digest("hex").slice(0, 12)}.png`;
  const shots = live.filter(({ example }) => !existsSync(join(cacheDir, kept(hashExample(example)))));
  if (shots.length) {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      for (const { example } of shots) {
        const hash = hashExample(example);
        const { html } = prerendered[hash];
        // A root that gave itself no size prerenders at none: the
        // stage's own size is the picture's then, as in QML below.
        const width = prerendered[hash].width > 0 ? prerendered[hash].width : UNSIZED[0];
        const height = prerendered[hash].height > 0 ? prerendered[hash].height : UNSIZED[1];
        await page.setViewportSize({ width, height });
        await page.setContent(`${STAGE}<div id="app" style="position:relative;width:${width}px;height:${height}px">${html}</div>`);
        await page.screenshot({ path: join(cacheDir, kept(hash)), clip: { x: 0, y: 0, width, height } });
      }
    } finally {
      await browser.close();
    }
  }
  // Pictures an older runtime or browser drew are never shown again.
  pruneCache(cacheDir, { keep: new Set(live.map(({ example }) => kept(hashExample(example)))), pattern: /^[0-9a-f]{16}(-dark)?-[0-9a-f]{12}\.png$/ });
  for (const { example } of live) {
    const hash = hashExample(example);
    const picture = `${hash.slice(0, 16)}.png`;
    if (!existsSync(join(cacheDir, kept(hash)))) continue;
    cpSync(join(cacheDir, kept(hash)), join(pictures, picture));
    const width = prerendered[hash].width > 0 ? prerendered[hash].width : 320;
    const height = prerendered[hash].height > 0 ? prerendered[hash].height : 180;
    // The figure stands at the example's entry fence; its other
    // fences stay in the flow as code.
    const entryFence = example.blocks.find((block) => (block.file ?? "Main.qml") === example.entry) ?? example.blocks[0];
    liveAt.set(entryFence.of, {
      hash: hash.slice(0, 16),
      entry: example.entry,
      before: example.before,
      ...(example.harness ? { harness: example.harness, harnessTemplate: example.harnessTemplate, harnessFile: example.harnessFile } : {}),
      // Each file highlighted as its fence is: what the editor shows
      // until the reader is in it.
      display: example.display.map((file) => ({ ...file, rich: packRich(highlight(file.code, file.lang ?? "qml")) })),
      ...(example.given ? { given: packGiven(example.given) } : {}),
      picture,
      width,
      height,
    });
  }
  // Every example, page by page, as it stands: what the suite holds
  // to the ledger of plain examples (site/scripts/codeblocks-ledger.mjs).
  const liveSet = new Set(live.map(({ example }) => example));
  const outcome = (example) => {
    const hash = hashExample(example);
    if (refused.has(hash)) return { state: "not compiling", diagnostics: refused.get(hash) };
    if (unrun.has(hash)) return { state: "not running", diagnostics: unrun.get(hash) };
    if (!liveSet.has(example)) return { state: "not running", diagnostics: ["no prerender was made"] };
    return prerendered[hash]?.logged?.length ? { state: "live", logged: prerendered[hash].logged } : { state: "live" };
  };
  const report = onPages.flatMap(({ page, fences, examples }) => pageRecords(page, fences, examples, outcome, tagged));
  writeFileSync(join(cacheDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `site-ljos: ${live.length} live code blocks ` +
      `(${gathered.length - live.length} left plain: ${checked.length} not compiling, ${failures.length} not running)`,
  );
}

// A link the docs name from the site's root goes as far down as the
// base, written into the reading itself: a page's links are right
// before any script runs, and with none.
const rooted = (value) =>
  typeof value === "string"
    ? value.replace(/href="\/(?!\/)/g, `href="${base}`)
    : Array.isArray(value)
      ? value.map(rooted)
      : value && typeof value === "object"
        ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, rooted(inner)]))
        : value;

// Every route's title: the page's own, and the one a shell showing
// that route in place gives the tab. The shell is given only the
// titles of the site's own pages and what follows a docs page's, as
// the sidebar already names every docs page (`Nav.titled`): each
// page loads the shell, so a second list of every title would be in
// every page's first load.
const own = {
  "/": "Ljós — malleable software, everywhere",
  "/demos/": "Live demos — Ljós",
};
const after = " — Ljós";
const titles = {
  ...own,
  ...Object.fromEntries(site.pages.map((page) => [page.route, `${page.title}${after}`])),
};

// The reading: each docs page's own, carried in the props its route
// is made with (so its HTML holds its blocks and no other page's),
// with the pages before and after it in the sidebar's order; and
// where the site stands, the site's own titles and the sidebar, which
// the shell's Content type holds. Content.qml is written fresh each
// build and gitignored: the Markdown is its source.
const leading = (page) => (page ? { route: page.route, title: page.title } : null);
const slim = site.pages.map(({ route, title, description, headings, blocks }, i) => ({
  route,
  title,
  description,
  headings,
  previous: leading(site.pages[i - 1]),
  next: leading(site.pages[i + 1]),
  // A picture's address is the page's own: from its route's depth
  // back to the site's root, where the pictures stand.
  // A code block's colouring is packed (`ljos-web/codeblock/rich`).
  blocks: blocks.map((block) =>
    liveAt.has(block)
      ? { kind: "live", lang: block.lang, rich: packRich(block.rich), live: { ...liveAt.get(block), picture: `${"../".repeat(route.split("/").filter(Boolean).length)}Examples/${liveAt.get(block).picture}` } }
      : block.kind === "code"
        ? { ...block, rich: packRich(block.rich) }
        : rooted(block),
  ),
}));
writeFileSync(
  join(bundle, "Site/Content.qml"),
  `pragma Singleton
import QtQuick

// Generated by site-ljos/scripts/build.mjs from the pinned docs:
// where the site stands, the site's own titles and the sidebar. Each
// page's own blocks are in its props. Do not edit by hand.
QtObject {
    readonly property string base: ${JSON.stringify(base)}
    readonly property var titles: (${JSON.stringify(own)})
    readonly property string after: ${JSON.stringify(after)}
    readonly property var sidebar: ${JSON.stringify(site.sidebar)}
}
`,
);

// The Pantry flagship's project, as data: the shell the editor
// starts from and the files a visitor's shell compiles against,
// read from the very files the bundle ships (bundle/Demos and
// bundle/Pantry), so the words in the editor are the words that
// run. Generated like Content.qml; do not edit by hand.
{
  const pantryFiles = {};
  for (const name of ["qmldir", "Basket.qml", "Note.qml", "StatusSlot.qml"])
    pantryFiles[`Pantry/${name}`] = readFileSync(join(bundle, "Pantry", name), "utf8");
  writeFileSync(
    join(bundle, "Demos/PantryProject.qml"),
    `pragma Singleton
import QtQuick

// Generated by site-ljos/scripts/build.mjs from bundle/Demos/PantryShell.qml
// and bundle/Pantry/: what the flagship demo's editor starts from, and the
// files a visitor's shell compiles against. Do not edit by hand.
QtObject {
    readonly property string shellText: ${JSON.stringify(readFileSync(join(bundle, "Demos/PantryShell.qml"), "utf8"))}
    readonly property string shellRich: ${JSON.stringify(packRich(highlight(readFileSync(join(bundle, "Demos/PantryShell.qml"), "utf8"), "qml")))}
    readonly property var files: (${JSON.stringify(pantryFiles)})
}
`,
  );
}

// The bundle's manifest, of the bundle as it stands now.
function files(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(directory, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`],
  );
}
const paths = files(bundle).filter((path) => path !== "ljos-site.json").sort();
const imports = new Set();
for (const path of paths.filter((path) => path.endsWith(".qml"))) {
  for (const [, uri] of readFileSync(join(bundle, path), "utf8").matchAll(/^\s*import\s+([A-Za-z_][\w.]*)/gm)) {
    if (!["Site", "Demos", "Pantry"].includes(uri)) imports.add(uri);
  }
}
let ljosWeb = "0".repeat(40);
try {
  ljosWeb = execSync("git rev-parse HEAD", { cwd: repo, encoding: "utf8" }).trim();
} catch { /* built from a tarball: no commit to name */ }
writeFileSync(
  join(bundle, "ljos-site.json"),
  `${JSON.stringify(
    {
      format: "ljos-site",
      version: 1,
      target: "web",
      entry: "Main.qml",
      blocks: [],
      files: paths.map((path) => ({ path, bytes: statSync(join(bundle, path)).size })),
      left_out: [],
      modules: [{ module: "Site", qmldir: "Site/qmldir" }, { module: "Demos", qmldir: "Demos/qmldir" }, { module: "Pantry", qmldir: "Pantry/qmldir" }],
      imports: [...imports].sort(),
      ljos_web: ljosWeb,
    },
    null,
    2,
  )}\n`,
);

// A page's description is its front matter's, else the start of its
// first paragraph: every page says what it is to a search result, in
// no more than a search result shows (a front matter's too is cut).
const plain = (rich) => String(rich ?? "").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
function describe(page) {
  const first = page.description ? String(page.description).replace(/\s+/g, " ").trim() : plain(page.blocks.find((block) => block.kind === "para")?.rich);
  if (!first) return `${page.title}, in the Ljós docs.`;
  if (first.length <= 160) return first;
  // Cut at the last word that fits, or mid-word where one word is longer.
  const space = first.lastIndexOf(" ", 157);
  return `${first.slice(0, space > 0 ? space : 157)}…`;
}
const pages = [
  {
    route: "/",
    title: titles["/"],
    description: "Ljós is a Rust UI toolkit for malleable software: apps that the people who use them, and their agents, can reshape while they run.",
    props: { route: "/" },
  },
  {
    route: "/demos/",
    title: titles["/demos/"],
    description: "Complete Ljós apps running in the page: a shell you rewrite, a 3D scene to orbit, a shader effect, a whole app, and motion.",
    props: { route: "/demos/" },
  },
  ...site.pages.map((page, i) => ({ route: page.route, title: titles[page.route], description: describe(page), props: { route: page.route, page: slim[i] } })),
];
// The site's head, with the colours of bundle/tokens.js (the table
// Site/Theme.qml reads) written in as CSS custom properties: one table,
// so the HTML around the app and the app never disagree.
function siteHead() {
  const source = readFileSync(join(bundle, "tokens.js"), "utf8").replace(/^\.pragma library$/m, "");
  const { light, dark } = new Function(`${source}\nreturn { light, dark };`)();
  const css = (name) => `--ljos-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
  const declarations = (tone) =>
    [
      ...Object.entries(tone)
        .filter(([, value]) => typeof value === "string")
        .map(([name, value]) => `${css(name)}: ${value};`),
      `--ljos-codeblock-border: ${tone.divider};`,
      `--ljos-codeblock-focus: ${tone.focus};`,
      ...Object.entries(tone.code).map(([tag, value]) => `--ljos-code-${tag}: ${value};`),
    ].join(" ");
  const tokens = [
    `  :root { ${declarations(light)} }`,
    `  @media (prefers-color-scheme: dark) { :root:not([data-ljos-scheme="light"]) { ${declarations(dark)} } }`,
    `  :root[data-ljos-scheme="dark"] { ${declarations(dark)} }`,
  ].join("\n");
  // Where the app keeps the reader's scheme, read from the script that
  // keeps it, so the head's script never asks for another.
  const scheme = readFileSync(join(bundle, "scheme.js"), "utf8").replace(/^\.pragma library$/m, "");
  const { key } = new Function(`${scheme}\nreturn { key };`)();
  return readFileSync(join(bundle, "assets/head.html"), "utf8")
    .replace("%SCHEME_KEY%", () => JSON.stringify(key))
    .replace("%LJOS_TOKENS%", () => tokens)
    .replaceAll("%LIGHT_CANVAS%", light.canvas)
    .replaceAll("%DARK_CANVAS%", dark.canvas);
}

// Built as a machine with no Qt 6 builds it, which is how CI builds
// it and how the site builder's own controls tests build theirs
// (`withoutQt` in site-tests): the site is a Ljós application whose
// controls are Ljós's own, and a Qt that happens to be installed
// must not decide which QML the in-page compiler's link table
// bundles for modules this site never imports. The scrub is the
// build's alone; the caller's environment is put back.
const saved = { PATH: process.env.PATH, QT_INSTALL_QML: process.env.QT_INSTALL_QML, QML_IMPORT_PATH: process.env.QML_IMPORT_PATH };
const noQt = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-site-no-qt-"));
process.env.PATH = noQt;
delete process.env.QT_INSTALL_QML;
delete process.env.QML_IMPORT_PATH;
let built;
try {
  // DECISION (site3 design): every page is written for a phone and a
  // desktop, in light and dark, so the first paint is laid out and
  // coloured as the reader's window will have it; the site's head
  // (icons, metadata, the colour tokens, and the script that says the
  // reader's own scheme before the body is read) is the bundle's.
  // codeblock.css: the code's colours (`tok-*`, `--ljos-code-*`) and
  // the editor's look, for the highlighted code the pages show.
  const codeCss = createRequire(import.meta.url).resolve("ljos-web/codeblock.css");
  built = await buildSite({
    dir: bundle,
    out,
    qmlc,
    qt: [],
    css: [codeCss],
    head: siteHead(),
    prerender: {
      sizes: [
        { width: 390, height: 844 },
        { width: 1440, height: 900, from: 1000 },
      ],
      schemes: ["light", "dark"],
      pages,
    },
  });
} finally {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  rmSync(noQt, { recursive: true, force: true });
}

// Each page is told the base it stands at, in its head, before
// anything of the page runs.
const htmlUnder = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? htmlUnder(join(directory, entry.name)) : entry.name.endsWith(".html") ? [join(directory, entry.name)] : [],
  );
for (const file of htmlUnder(out)) {
  const html = readFileSync(file, "utf8");
  const at = html.indexOf("<head>");
  if (at < 0) throw new Error(`site-ljos: ${file} has no <head> to name the base in`);
  writeFileSync(file, `${html.slice(0, at + 6)}\n    <meta name="ljos-base" content="${base}">${html.slice(at + 6)}`);
}

// Each page's address on the site's home, from the pages the build
// was given: in its head, and in the sitemap robots.txt names. Its icon
// is named in its head too, at the base: a page that names none is asked
// `/favicon.ico` of the address's root, which below a project's base is
// not the site's, and is not there.
const icons = `<link rel="icon" href="${base}favicon.svg" type="image/svg+xml">\n    <link rel="apple-touch-icon" href="${base}apple-touch-icon.png">`;
const escapeXml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const addressOf = (route) => `${origin}${route}`;
for (const { route } of pages) {
  const file = join(out, route.slice(1), "index.html");
  const html = readFileSync(file, "utf8");
  // At the head's end, after the charset: nothing reads them while
  // the page loads.
  const at = html.indexOf("</head>");
  if (at < 0) throw new Error(`site-ljos: ${file} has no </head> to name its address in`);
  const address = escapeXml(addressOf(route));
  writeFileSync(file, `${html.slice(0, at)}  ${icons}\n    <link rel="canonical" href="${address}">\n    <meta property="og:url" content="${address}">\n  ${html.slice(at)}`);
}
writeFileSync(
  join(out, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(({ route }) => `  <url><loc>${escapeXml(addressOf(route))}</loc></url>\n`).join("")}</urlset>\n`,
);
writeFileSync(join(out, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);

// The page for an address the site has no page for. Pages serves the
// one `404.html` at the site's root for a missing address at any depth
// below it, so nothing in it is relative: every address in it starts
// at the base this build stands at. It is plain HTML, with no script:
// it says what happened and where to go, in the shell's own colours
// and words, and needs nothing else to.
// DECISION: written by hand here rather than prerendered from the
// shell: a prerendered page asks for its script and styles relative to
// its own depth, which a page served at every depth cannot.
const notFound = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="ljos-base" content="${base}">
    <meta name="robots" content="noindex">
    <meta name="description" content="There is no page at this address on ljos.dev.">
    <title>Page not found — Ljós</title>
    ${icons}
    <style>
      :root { color-scheme: light dark; --bg: #fdfbf6; --panel: #f6f1e6; --ink: #2b251d; --muted: #6b5f4c; --accent: #9a6210; --border: #ddd2bd; --on-accent: #ffffff; }
      @media (prefers-color-scheme: dark) { :root { --bg: #1a1712; --panel: #241f19; --ink: #ece5d8; --muted: #b3a892; --accent: #e0a43c; --border: #453a2d; --on-accent: #1a1712; } }
      html, body { margin: 0; background: var(--bg); color: var(--ink); font-family: system-ui, sans-serif; }
      body { min-height: 100vh; display: flex; flex-direction: column; }
      header { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 22px; padding: 12px 20px; border-bottom: 1px solid var(--border); }
      header .home { display: flex; align-items: center; gap: 8px; color: var(--ink); text-decoration: none; font: bold 24px Georgia, serif; }
      nav { display: flex; gap: 22px; }
      nav a { color: var(--ink); text-decoration: none; font-size: 14px; }
      a:hover { text-decoration: underline; }
      a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      main { flex: 1; width: min(680px, calc(100% - 32px)); margin: 0 auto; padding: 48px 0; }
      h1 { font: bold 34px Georgia, serif; margin: 0 0 12px; }
      p { font-size: 16px; line-height: 1.5; color: var(--muted); margin: 0 0 24px; }
      main .go { display: inline-block; padding: 10px 14px; background: var(--accent); color: var(--on-accent); font-weight: bold; font-size: 15px; text-decoration: none; }
      main .docs { margin-left: 12px; color: var(--accent); font-size: 15px; }
      footer { padding: 12px 20px; border-top: 1px solid var(--border); background: var(--panel); color: var(--muted); font-size: 12px; text-align: center; }
      footer a { color: var(--ink); text-decoration: none; }
    </style>
  </head>
  <body>
    <header>
      <a class="home" href="${base}" aria-label="Ljós — front page"><img src="${base}favicon.svg" width="28" height="28" alt="">Ljós</a>
      <nav aria-label="Site">
        <a href="${base}start/">Docs</a>
        <a href="${base}demos/">Demos</a>
        <a href="https://github.com/hal-c2/ljos-ui">GitHub</a>
      </nav>
    </header>
    <main>
      <h1>Page not found</h1>
      <p>There is no page at this address. It may have moved, or the link that brought you here may be mistyped.</p>
      <a class="go" href="${base}">Go to the front page</a><a class="docs" href="${base}start/">Read the docs</a>
    </main>
    <footer>Ljós — malleable software, everywhere · MIT · <a href="https://community-software.org/">Community principles</a></footer>
  </body>
</html>
`;
writeFileSync(join(out, "404.html"), notFound);

// Each docs page's reading, beside its HTML: what a shell already
// running reads to show that page in place (bundle/nav.js), the same
// data the page's own HTML was made with.
site.pages.forEach((page, i) => writeFileSync(join(out, page.route.slice(1), "page.json"), JSON.stringify(slim[i])));

// The brand files a browser asks for by name: the mark, and the
// pictures of it made once from it (bundle/assets).
cpSync(join(bundle, "assets/ljos-mark.svg"), join(out, "favicon.svg"));
for (const name of ["apple-touch-icon.png", "og-image.png"]) cpSync(join(bundle, "assets", name), join(out, name));
// The pictures a demo's frame shows until the demo runs, or instead of
// it where it cannot: named by the pages as strings, like a live block's.
// What the search looks through (Site/Search.qml): every page's title
// and headings, fetched as a reader first searches, so no page's first
// load holds the others' (each page's own reading is in its props).
writeFileSync(
  join(out, "search.json"),
  JSON.stringify(site.pages.map(({ route, title, headings }) => ({ route, title, headings: headings.map(({ plain, anchor }) => ({ plain, anchor })) }))),
);
mkdirSync(join(out, "pictures"), { recursive: true });
for (const name of readdirSync(join(bundle, "assets")).filter((name) => /^demo-.*\.webp$/.test(name))) cpSync(join(bundle, "assets", name), join(out, "pictures", name));
// A live block's picture is named from its payload, not written in
// any QML the compiler sees, so no build step carries it: the
// pictures the bundle was built with stand beside the pages.
if (existsSync(join(bundle, "Examples"))) cpSync(join(bundle, "Examples"), join(out, "Examples"), { recursive: true });
console.log(`site-ljos: ${pages.length} pages (${site.pages.length} docs) from ${docs}, standing at ${base}`);
console.log(`site-ljos: ${out} (${built.files.length} files, ${built.bytes} bytes)`);

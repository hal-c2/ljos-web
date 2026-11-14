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
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createRequire } from "node:module";
import { highlight, readMarkdownSite } from "ljos-web/markdown";
import { buildSite } from "ljos-web/site";
import { checkExamples, hashExample, loadHarnesses, loadPrerenders, renderPrerenders } from "ljos-web/codeblocks";
import { assemble, tagged } from "ljos-web/codeblocks/parse";
import { packRich } from "ljos-web/codeblock/rich";
import { keysByHash, listedEverywhere, pageOfRoute, pageRecords, readLedger } from "../../site/scripts/codeblocks-ledger.mjs";

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
const repo = resolve(here, "..");
const bundle = join(here, "bundle");
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
const liveAt = new Map(); // a page's code block -> its live payload
{
  const gathered = [];
  const onPages = [];
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
      ...(block.before ? { before: true } : {}),
      of: block,
    }));
    const { examples } = assemble(said, { harnesses });
    onPages.push({ page: pageOfRoute(page.route), fences: said, examples });
    for (const example of examples) gathered.push({ page, example });
  }
  const cacheDir = join(here, ".codeblock-prerenders");
  const checked = checkExamples(gathered.map(({ example }) => example), { qmlc });
  // An example is its hash: one on two pages is made once, and what is
  // said of the copy made is said of every place it stands.
  const refused = new Map(checked.map(({ example, diagnostics }) => [hashExample(example), diagnostics]));
  // As in site/scripts/codeblock-prerenders.mjs: an example the ledger
  // lists everywhere it stands is plain by the docs' own word.
  const ledger = readLedger();
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
  const { failures } = await renderPrerenders(runnable.map(({ example }) => example), { cacheDir, qmlc });
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
  const shots = live.filter(({ example }) => !existsSync(join(cacheDir, `${hashExample(example).slice(0, 16)}.png`)));
  if (shots.length) {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      for (const { example } of shots) {
        const hash = hashExample(example);
        const { html } = prerendered[hash];
        // A root that gave itself no size prerenders at none: the
        // stage's own size is the picture's then, as in QML below.
        const width = prerendered[hash].width > 0 ? prerendered[hash].width : 320;
        const height = prerendered[hash].height > 0 ? prerendered[hash].height : 180;
        await page.setViewportSize({ width, height });
        await page.setContent(`<!doctype html><style>html,body{margin:0;background:#fdfbf6}</style><div id="app" style="position:relative;width:${width}px;height:${height}px">${html}</div>`);
        await page.screenshot({ path: join(cacheDir, `${hash.slice(0, 16)}.png`), clip: { x: 0, y: 0, width, height } });
      }
    } finally {
      await browser.close();
    }
  }
  for (const { example } of live) {
    const hash = hashExample(example);
    const picture = `${hash.slice(0, 16)}.png`;
    if (!existsSync(join(cacheDir, picture))) continue;
    cpSync(join(cacheDir, picture), join(pictures, picture));
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
    return liveSet.has(example) ? { state: "live" } : { state: "not running", diagnostics: ["no prerender was made"] };
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
// that route in place gives the tab.
const titles = {
  "/": "Ljós — malleable software, everywhere",
  "/demos/": "Live demos — Ljós",
  ...Object.fromEntries(site.pages.map((page) => [page.route, `${page.title} — Ljós`])),
};

// The reading, as the data the shell's Content type holds. Written
// fresh each build and gitignored: the Markdown is its source.
const slim = site.pages.map(({ route, title, description, headings, blocks }) => ({
  route,
  title,
  description,
  headings,
  // A picture's address is the page's own: from its route's depth
  // back to the site's root, where the pictures stand.
  // A code block's colouring is packed (`ljos-web/codeblock/rich`):
  // every page's is in the site's first script.
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
// where the site stands, every route's title, the sidebar and every
// page's blocks. Do not edit by hand.
QtObject {
    readonly property string base: ${JSON.stringify(base)}
    readonly property var titles: (${JSON.stringify(titles)})
    readonly property var sidebar: ${JSON.stringify(site.sidebar)}
    readonly property var pages: ${JSON.stringify(slim)}
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

const pages = Object.entries(titles).map(([route, title]) => ({ route, title, props: { route } }));
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
  // codeblock.css: the code's colours (`tok-*`, `--ljos-code-*`) and
  // the editor's look, for the highlighted code the pages show.
  const codeCss = createRequire(import.meta.url).resolve("ljos-web/codeblock.css");
  built = await buildSite({ dir: bundle, out, qmlc, qt: [], css: [codeCss], prerender: { width: 1440, height: 900, pages } });
} finally {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  rmSync(noQt, { recursive: true, force: true });
}

// Each page is told the base it stands at, in its head, before
// anything of the page runs. Its icon is named there too, at the base:
// a page that names none is asked `/favicon.ico` of the address's root,
// which below a project's base is not the site's, and is not there.
const htmlUnder = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? htmlUnder(join(directory, entry.name)) : entry.name.endsWith(".html") ? [join(directory, entry.name)] : [],
  );
const icons = `\n    <link rel="icon" href="${base}favicon.svg" type="image/svg+xml">\n    <link rel="apple-touch-icon" href="${base}apple-touch-icon.png">`;
for (const file of htmlUnder(out)) {
  const html = readFileSync(file, "utf8");
  const at = html.indexOf("<head>");
  if (at < 0) throw new Error(`site-ljos: ${file} has no <head> to name the base in`);
  writeFileSync(file, `${html.slice(0, at + 6)}\n    <meta name="ljos-base" content="${base}">${icons}${html.slice(at + 6)}`);
}

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
${icons.trimStart()}
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
    </style>
  </head>
  <body>
    <header>
      <a class="home" href="${base}" aria-label="Ljós — front page"><img src="${base}favicon.svg" width="28" height="28" alt="">Ljós</a>
      <nav aria-label="Site">
        <a href="${base}start/">Docs</a>
        <a href="${base}demos/">Live demos</a>
        <a href="https://github.com/hal-c2/ljos-ui">GitHub</a>
      </nav>
    </header>
    <main>
      <h1>Page not found</h1>
      <p>There is no page at this address. It may have moved, or the link that brought you here may be mistyped.</p>
      <a class="go" href="${base}">Go to the front page</a><a class="docs" href="${base}start/">Read the docs</a>
    </main>
    <footer>Ljós — malleable software, everywhere · MIT</footer>
  </body>
</html>
`;
writeFileSync(join(out, "404.html"), notFound);

// The brand files a browser asks for by name are the site's, whichever
// builder wrote the pages.
for (const name of ["favicon.svg", "apple-touch-icon.png", "og-image.png"]) {
  const from = join(repo, "site/public", name);
  if (existsSync(from)) cpSync(from, join(out, name));
}
// A live block's picture is named from its payload, not written in
// any QML the compiler sees, so no build step carries it: the
// pictures the bundle was built with stand beside the pages.
if (existsSync(join(bundle, "Examples"))) cpSync(join(bundle, "Examples"), join(out, "Examples"), { recursive: true });
console.log(`site-ljos: ${pages.length} pages (${site.pages.length} docs) from ${docs}, standing at ${base}`);
console.log(`site-ljos: ${out} (${built.files.length} files, ${built.bytes} bytes)`);

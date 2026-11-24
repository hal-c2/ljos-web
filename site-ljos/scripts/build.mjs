// ljos.dev as prerendered Ljós pages: the docs of the pinned ljos-ui
// revision (the same `site/ljos-ui.sha` the Astro site builds from),
// read as a Markdown content source, written into the bundle beside
// the hand-written shell, and built once — every route its own
// prerendered page. The Astro `site/` is untouched and keeps
// deploying; this writes `site-ljos/dist/` and nothing else serves
// or ships it yet.
//
// DECISION: the docs come from the checkout `LJOS_DOCS_DIR` names, as
// the Astro build's sync-docs has it (scripts/docs-dir.mjs). The tasks
// and CI fetch ljos-ui at the pin and say where they put it.
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { docsDir } from "../../scripts/docs-dir.mjs";
import { chromium } from "@playwright/test";
import { createRequire } from "node:module";
import { highlight, readMarkdownSite } from "ljos-web/markdown";
import { askedJobs, buildSite, pooled } from "ljos-web/site";
import { checkExamplesAll, hashExample, loadHarnesses, loadPrerenders, pruneCache, renderPrerenders, siteFiles } from "ljos-web/codeblocks";
import { assemble, packGiven, tagged } from "ljos-web/codeblocks/parse";
import { kernelNamed } from "ljos-web/vite";
import { packRich } from "ljos-web/codeblock/rich";
import * as Pro from "./pro.mjs";
import { giveFiles, readGiven } from "../../site/scripts/codeblock-files.mjs";
import { keysByHash, listedEverywhere, liveOutcome, madeNews, pageOfRoute, pageRecords, readLedger, saysEverywhere } from "../../site/scripts/codeblocks-ledger.mjs";
import { drawPictures, shipsDark, stagesOf, verdictKey } from "./pictures.mjs";

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
const out = join(here, "dist");

const docs = docsDir("site-ljos");

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
// For the desktop (`mise run site:native`): LJOS_SITE_NATIVE names a
// directory, and the build writes only what the bundle reads as it runs
// (the generated QML beside the shell) and each docs page's reading
// under it, then stops. Nothing is pictured or prerendered, so it needs
// neither qmlc nor a browser; the docs' examples are shown as code, as
// the desktop has no in-page compiler to make them live yet.
const native = process.env.LJOS_SITE_NATIVE ? resolve(process.env.LJOS_SITE_NATIVE) : null;
if (!native) {
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
  // What the build spends before it makes anything, said beside the
  // count: on a CI runner this was minutes, one compiler and one
  // picture after another.
  const phases = [];
  const timed = async (name, work) => {
    const start = performance.now();
    const result = await work();
    phases.push(`${name} ${Math.round(performance.now() - start)} ms`);
    return result;
  };
  const checked = await timed(`${gathered.length} examples checked`, () => checkExamplesAll(gathered.map(({ example }) => example), { qmlc }));
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
  const { manifest, failures } = await timed("examples prerendered", () => renderPrerenders(runnable.map(({ example }) => example), { cacheDir, qmlc, checked: true, dark: true }));
  // As in site/scripts/codeblock-prerenders.mjs: what a live example
  // said as it was made is news unless the ledger says it is the
  // page's point, and the example does not run as far as a reader is
  // concerned. One that claims to run and refused in the dark has not
  // run for a dark reader: that is news too (madeNews).
  for (const { example } of runnable) {
    const hash = hashExample(example);
    const news = madeNews(manifest[hash], { claimed: mustRun({ example }), logs: saysEverywhere(keysOf.get(hash) ?? [], ledger) });
    if (news.length) failures.push({ example, diagnostics: news });
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
  // window's paper (tokens.js `paper`): one for each scheme, each from
  // the prerender made in it, so a dark page's window holds the app as
  // it runs in the dark, not a light card. The page's two renders still
  // share one tree (site.js's shareSchemes): each picture is its own
  // item, hidden in the other scheme. Kept under names that say how
  // each was made (the prerender's stamp, this browser, the paper
  // around it and the size an unsized root is given), so a cache kept
  // across builds never answers with one an older runtime or browser
  // drew, and a changed recipe draws again. The page names them by
  // their hash.
  const STAGES = stagesOf(tones());
  const UNSIZED = [320, 180];
  const drawnBy = createHash("sha256").update(`${chromium.executablePath()}\n${STAGES.light}\n${STAGES.dark}\n${UNSIZED}`).digest("hex").slice(0, 12);
  const kept = (hash, scheme = "light") =>
    `${hash.slice(0, 16)}${scheme === "dark" ? "-dark" : ""}-${createHash("sha256").update(`${prerendered[hash].stamp ?? ""}\n${drawnBy}`).digest("hex").slice(0, 12)}.png`;
  const SCHEMES = ["light", "dark"];
  // In which schemes an example's picture is empty (pictures.mjs): one whose
  // point is what it logs, or one that waits for the reader before it
  // draws. Its window says so there rather than stand empty. Known as
  // each picture is drawn, and kept beside them, by picture.
  const blankFile = join(cacheDir, "blank.json");
  let blankWas = {};
  try {
    blankWas = JSON.parse(readFileSync(blankFile, "utf8"));
  } catch {
    blankWas = {};
  }
  const blank = {};
  const judged = (verdict) => SCHEMES.every((scheme) => typeof verdict?.[scheme] === "boolean");
  const shots = live.filter(({ example }) => {
    const hash = hashExample(example);
    return SCHEMES.some((scheme) => !existsSync(join(cacheDir, kept(hash, scheme)))) || !judged(blankWas[verdictKey(kept(hash))]);
  });
  for (const { example } of live) {
    const key = verdictKey(kept(hashExample(example)));
    if (judged(blankWas[key])) blank[key] = blankWas[key];
  }
  if (shots.length) {
    // A few pages of one browser, each drawing its share: one page drew
    // every picture in turn, and each waited on the last's layout and
    // capture. Few, not one per core: they share the browser's GPU and
    // compositor processes, which a dozen pages only queue on.
    const pages = Math.max(1, Math.min(shots.length, 4, askedJobs(process.env, "LJOS_SITE_JOBS") ?? 4));
    await timed(`${shots.length} pictures drawn on ${pages} pages`, async () => {
      const browser = await chromium.launch();
      try {
        const free = await Promise.all(Array.from({ length: pages }, () => browser.newPage()));
        await pooled(
          shots.map(({ example }) => async () => {
            const page = free.pop();
            try {
              const hash = hashExample(example);
              // A root that gave itself no size prerenders at none: the
              // stage's own size is the picture's then, as in QML below.
              const width = prerendered[hash].width > 0 ? prerendered[hash].width : UNSIZED[0];
              const height = prerendered[hash].height > 0 ? prerendered[hash].height : UNSIZED[1];
              const { html, htmlDark } = prerendered[hash];
              const to = Object.fromEntries(SCHEMES.map((scheme) => [scheme, join(cacheDir, kept(hash, scheme))]));
              const drawn = await drawPictures(page, { html, htmlDark, width, height, stages: STAGES, to });
              blank[verdictKey(kept(hash))] = drawn.blank;
            } finally {
              free.push(page);
            }
          }),
          pages,
        );
      } finally {
        await browser.close();
      }
    });
  }
  writeFileSync(blankFile, `${JSON.stringify(blank, null, 2)}\n`);
  // Pictures an older runtime or browser drew are never shown again.
  pruneCache(cacheDir, {
    keep: new Set(live.flatMap(({ example }) => SCHEMES.map((scheme) => kept(hashExample(example), scheme)))),
    pattern: /^[0-9a-f]{16}(-dark)?-[0-9a-f]{12}\.png$/,
  });
  for (const { example } of live) {
    const hash = hashExample(example);
    const picture = `${hash.slice(0, 16)}.png`;
    const [keptLight, keptDark] = SCHEMES.map((scheme) => join(cacheDir, kept(hash, scheme)));
    if (!existsSync(keptLight)) continue;
    cpSync(keptLight, join(pictures, picture));
    // A picture that is the same in both schemes is one file.
    const ownDark = existsSync(keptDark) && shipsDark({ light: readFileSync(keptLight), dark: readFileSync(keptDark) });
    const pictureDark = ownDark ? `${hash.slice(0, 16)}-dark.png` : undefined;
    if (pictureDark) cpSync(keptDark, join(pictures, pictureDark));
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
      ...(pictureDark ? { pictureDark } : {}),
      ...(blank[verdictKey(kept(hash))]?.light ? { blank: true } : {}),
      ...(blank[verdictKey(kept(hash))]?.dark ? { blankDark: true } : {}),
      width,
      height,
      // What it said as it was made: the first lines of its values
      // strip, before a reader runs it.
      ...(prerendered[hash].logged?.length ? { logged: prerendered[hash].logged } : {}),
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
    // Live, and drawn light in the dark, where only its dark making
    // refused: the record says what the dark said.
    return liveOutcome(prerendered[hash]);
  };
  const report = onPages.flatMap(({ page, fences, examples }) => pageRecords(page, fences, examples, outcome, tagged));
  writeFileSync(join(cacheDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `site-ljos: ${live.length} live code blocks ` +
      `(${gathered.length - live.length} left plain: ${checked.length} not compiling, ${failures.length} not running)`,
  );
  console.log(`site-ljos: ${phases.join(", ")}`);
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
const after = " — Ljós";
// The demos page's own name, which search.json lists it by too.
const demosTitle = "Live demos";
const own = {
  "/": "Ljós — software you can reshape while it runs",
  "/demos/": `${demosTitle}${after}`,
  "/showcase/": "Built with Ljós",
};
// The apps built with Ljós the showcase shows, as data, and the
// recordings and captures of each (bundle/Showcase).
const showcase = JSON.parse(readFileSync(join(bundle, "Showcase/products.json"), "utf8")).map(withEngine);
// The pro demos' pages are the site's own too (scripts/pro.mjs).
Object.assign(own, Pro.titles(Pro.demos, after));
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
      ? { kind: "live", lang: block.lang, rich: packRich(block.rich), live: pictured(liveAt.get(block), "../".repeat(route.split("/").filter(Boolean).length)) }
      : block.kind === "code"
        ? { ...block, rich: packRich(block.rich) }
        : rooted(block),
  ),
}));
writeFileSync(
  join(bundle, "Site/Content.qml"),
  `pragma Singleton
import Ljos.Core

// Generated by site-ljos/scripts/build.mjs from the pinned docs:
// where the site stands, the site's own titles and the sidebar. Each
// page's own blocks are in its props. Do not edit by hand.
Object {
    readonly property string base: ${JSON.stringify(base)}
    readonly property unknown titles: (${JSON.stringify(own)})
    readonly property string after: ${JSON.stringify(after)}
    // The pro demos (Demos/pro.json), each with its route: the shell
    // finds a route's page here, the demos page a card for each. What
    // only a pro demo's own page says of it is in ProText.
    readonly property unknown pro: (${JSON.stringify(Pro.demos.map(({ description, summary, use, tryThis, shows, ...demo }) => ({ ...demo, route: Pro.route(demo), upstream: undefined })))})
    readonly property unknown sidebar: ${JSON.stringify(site.sidebar)}
}
`,
);
// What a pro demo's own page says of it (Demos/pro.json), by name: its
// own singleton, not Content's, so only that page's module carries it
// and no other page's first load does (tests/payload.spec.js). Written
// fresh each build and gitignored, like Content.qml.
writeFileSync(
  join(bundle, "Site/ProText.qml"),
  `pragma Singleton
import Ljos.Core

// Generated by site-ljos/scripts/build.mjs from bundle/Demos/pro.json:
// what each pro demo's page says of it. Do not edit by hand.
Object {
    readonly property unknown of: (${JSON.stringify(Object.fromEntries(Pro.demos.map(({ name, summary, use, tryThis, shows }) => [name, { summary, use, tryThis, shows }])))})
}
`,
);
// The apps built with Ljós (Showcase/products.json), each with its
// recording and captures: the showcase page is made from these. Its own
// singleton, not Content's, so only the showcase's module carries them
// and no other page's first load does (tests/payload.spec.js). Written
// fresh each build and gitignored, like Content.qml.
writeFileSync(
  join(bundle, "Site/ShowcaseApps.qml"),
  `pragma Singleton
import Ljos.Core

// Generated by site-ljos/scripts/build.mjs from bundle/Showcase/products.json:
// the apps the showcase shows. Do not edit by hand.
Object {
    readonly property unknown apps: (${JSON.stringify(showcase)})
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
import Ljos.Core

// Generated by site-ljos/scripts/build.mjs from bundle/Demos/PantryShell.qml
// and bundle/Pantry/: what the flagship demo's editor starts from, and the
// files a visitor's shell compiles against. Do not edit by hand.
Object {
    readonly property string shellText: ${JSON.stringify(readFileSync(join(bundle, "Demos/PantryShell.qml"), "utf8"))}
    readonly property string shellRich: ${JSON.stringify(packRich(highlight(readFileSync(join(bundle, "Demos/PantryShell.qml"), "utf8"), "qml")))}
    readonly property unknown files: (${JSON.stringify(pantryFiles)})
}
`,
  );
}

// The front page's TypeScript, as it is shown: the part that makes the
// board, cut from each of the two files the dispatch app's modules are
// built from (bundle/Demos/logic/before/board.ts for the list it starts
// as, logic/after/board.ts for the board the replay's edit makes) and
// coloured, with the lines the edit changes, by their place in what is
// shown and as text, and the ones a phone shows of them above the app,
// by their line in the file. Generated like the Pantry's; do not edit by hand.
const boardCut = (version) => {
  const file = readFileSync(join(bundle, `Demos/logic/${version}/board.ts`), "utf8");
  const from = file.indexOf("export function lanes(");
  if (from < 0) throw new Error(`bundle/Demos/logic/${version}/board.ts has no \`export function lanes(\` for the front page to show`);
  return { text: file.slice(from).trimEnd(), first: file.slice(0, from).split("\n").length };
};
const boardCuts = { list: boardCut("before"), board: boardCut("after") };
const boardShown = (layout, other) => {
  const { text, first } = boardCuts[layout];
  const lines = text.split("\n");
  const theirs = new Set(boardCuts[other].text.split("\n"));
  const changed = lines.flatMap((line, at) => (theirs.has(line) ? [] : [at]));
  // A phone has room for two: the lines that name a lane, where there are any.
  const named = changed.filter((at) => /\btitle:/.test(lines[at]));
  const strip = (named.length > 0 ? named : changed).slice(0, 2).map((at) => ({ line: first + at, text: lines[at].trim() }));
  // And the changed lines as text, for the log's record of the edit.
  const said = changed.map((at) => lines[at].trim());
  return { rich: packRich(highlight(text, "ts")), lines: lines.length, changed, strip, said };
};
writeFileSync(
  join(bundle, "Demos/DispatchSource.qml"),
  `pragma Singleton
import Ljos.Core

// Generated by site-ljos/scripts/build.mjs from bundle/Demos/logic/before/board.ts
// and logic/after/board.ts: the code the front page shows beside the app
// that runs it, by the layout the module built from it makes. Do not edit
// by hand.
Object {
    readonly property unknown list: (${JSON.stringify(boardShown("list", "board"))})
    readonly property unknown board: (${JSON.stringify(boardShown("board", "list"))})
}
`,
);

// The front page's code blocks that aren't docs, coloured like the
// docs': a block's \`rich\` is always packed highlighted text, never the
// plain code again (which shows it uncoloured). Generated like the
// Pantry's; do not edit by hand.
const ownShellCode = `import Ljos.Blocks

ShellLoader {
    source: "shell.qml"       // the user's layout
    fallback: "AppShell.qml"  // used if theirs won't compile
}
`;
writeFileSync(
  join(bundle, "Site/LandingCode.qml"),
  `pragma Singleton
import Ljos.Core

// Generated by site-ljos/scripts/build.mjs: the front page's own code
// blocks, as text and coloured, each a string so a typed file reads it as
// one. Do not edit by hand.
Object {
    readonly property string ownShellCode: ${JSON.stringify(ownShellCode)}
    readonly property string ownShellRich: ${JSON.stringify(packRich(highlight(ownShellCode, "qml")))}
}
`,
);

// Each pro demo's source, as data for its editor (scripts/pro.mjs): a
// JSON file its page imports when it is made, so the text is in no
// other page's load; and the imports that load it and its app
// (Demos/pro-later.js, committed too, so a checkout not yet built is
// one project for `ljos check`; tests/pro.spec.js keeps it the table's).
// Generated; do not edit by hand.
for (const demo of Pro.demos)
  writeFileSync(join(bundle, `Demos/${demo.name}-project.json`), `${JSON.stringify(Pro.projectOf(Pro.targetOf(demo), (code, lang) => packRich(highlight(code, lang))))}\n`);
writeFileSync(join(bundle, "Demos/pro-later.js"), Pro.loaders(Pro.demos));

// What the site's pages name from its root, beside them under `root`:
// the web build's output, or the desktop's directory (LJOS_SITE_NATIVE),
// whose shell reads them from there as a browser fetches them.
function writeShared(root) {
  // The brand files a browser asks for by name: the mark, and the
  // pictures of it made once from it (bundle/assets).
  cpSync(join(bundle, "assets/ljos-mark.svg"), join(root, "favicon.svg"));
  // The logo as the README shows it (the panels and the script word), the
  // header's and the footer's.
  cpSync(join(bundle, "assets/ljos.svg"), join(root, "ljos.svg"));
  // The site's own faces, with their licence (the head's @font-face).
  cpSync(join(bundle, "assets/fonts"), join(root, "fonts"), { recursive: true });
  for (const name of ["apple-touch-icon.png", "og-image.png"]) cpSync(join(bundle, "assets", name), join(root, name));
  // The pictures a demo's frame shows until the demo runs, or instead of
  // it where it cannot: named by the pages as strings, like a live block's.
  // What the search looks through (Site/Search.qml): every docs page's
  // title and headings, then the demos' pages and the showcase by their
  // titles (the field says it searches docs and demos), fetched as a reader
  // first searches, so no page's first load holds the others' (each page's
  // own reading is in its props).
  writeFileSync(
    join(root, "search.json"),
    JSON.stringify([
      ...site.pages.map(({ route, title, headings }) => ({ route, title, headings: headings.map(({ plain, anchor }) => ({ plain, anchor })) })),
      { route: "/demos/", title: demosTitle, headings: [] },
      { route: "/showcase/", title: own["/showcase/"], headings: [] },
      ...Pro.demos.map((demo) => ({ route: Pro.route(demo), title: demo.title, headings: [] })),
    ]),
  );
  // The QML of each shell the site ships and of each page it frames, as
  // data for "View this shell's source" and a workbench's Source tab
  // (shells.js fetches it when a reader first asks, so no page's first
  // load holds it): the very files the bundle ships, highlighted as a
  // code block's are.
  {
    const sourceOf = (file) => {
      const text = readFileSync(join(bundle, file), "utf8");
      return { file, text, rich: packRich(highlight(text, "qml")) };
    };
    writeFileSync(
      join(root, "shell-sources.json"),
      `${JSON.stringify({
        shells: Object.fromEntries(["Elegant", "Cyberpunk", "Workbench", "Desktop"].map((name) => [name.toLowerCase(), sourceOf(`Shells/${name}.qml`)])),
        pages: Object.fromEntries(["Landing", "DemosPage", "ShowcasePage", "DocPage", "ProDemoPage"].map((name) => [name, sourceOf(`Site/${name}.qml`)])),
        // The typed scripts the shells import (Shells/logic), by their file:
        // a reader's edit of a shell is compiled with them beside it.
        scripts: Object.fromEntries(
          readdirSync(join(bundle, "Shells/logic"))
            .filter((name) => /\.(ts|js)$/.test(name))
            .map((name) => [`Shells/logic/${name}`, readFileSync(join(bundle, "Shells/logic", name), "utf8")]),
        ),
      })}\n`,
    );
  }
  mkdirSync(join(root, "pictures"), { recursive: true });
  // The demos' pictures (above), and the captures of what is built with
  // Ljós (Site/BuiltWith.qml), each as WebP with a PNG beside it.
  for (const name of readdirSync(join(bundle, "assets")).filter((name) => /^demo-.*\.webp$|^built-.*\.(webp|png)$/.test(name))) cpSync(join(bundle, "assets", name), join(root, "pictures", name));
  // The header's icon, in each look's text colour for each scheme (Site/GitHubMark.qml).
  const githubMark = readFileSync(join(bundle, "assets/github-mark.svg"), "utf8");
  for (const [look, toned] of Object.entries(tones().looks)) {
    const name = look === "elegant" ? "github-mark" : `github-mark-${look}`;
    writeFileSync(join(root, "pictures", `${name}.svg`), githubMark.replace("%TEXT%", () => toned.light.text));
    writeFileSync(join(root, "pictures", `${name}-dark.svg`), githubMark.replace("%TEXT%", () => toned.dark.text));
  }
  // The showcase's recordings and captures, named by its data.
  cpSync(join(bundle, "Showcase/media"), join(root, "showcase/media"), { recursive: true });
  // A live block's picture is named from its payload, not written in
  // any QML the compiler sees, so no build step carries it: the
  // pictures the bundle was built with stand beside the pages.
  if (existsSync(join(bundle, "Examples"))) cpSync(join(bundle, "Examples"), join(root, "Examples"), { recursive: true });
}

// The desktop's build ends here: each docs page's reading, as the web
// build puts it beside the page's HTML (page.json), and the files the
// pages name from the site's root, under the native directory, for the
// shell to read as it goes (nav.js `desk`).
if (native) {
  site.pages.forEach((page, i) => {
    const dir = join(native, page.route.slice(1));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "page.json"), JSON.stringify(slim[i]));
  });
  writeShared(native);
  console.log(`site-ljos: ${site.pages.length} docs pages read for the desktop into ${native}`);
  process.exit(0);
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
    if (!["Site", "Shells", "Demos", "Pantry"].includes(uri)) imports.add(uri);
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
      // The site's state, as blocks a shell places and a reader's own
      // shell is written against (Site/qmldir's `# block` lines).
      blocks: [
        { block: "Site.Router", file: "Site/Router.qml" },
        { block: "Site.Preferences", file: "Site/Preferences.qml" },
      ],
      files: paths.map((path) => ({ path, bytes: statSync(join(bundle, path)).size })),
      left_out: [],
      modules: [{ module: "Site", qmldir: "Site/qmldir" }, { module: "Demos", qmldir: "Demos/qmldir" }, { module: "Pantry", qmldir: "Pantry/qmldir" }, { module: "Shells", qmldir: "Shells/qmldir" }],
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
    description: "Ljós is a Rust UI toolkit for apps that people and their agents can change live, with declarative interfaces and typed TypeScript.",
    props: { route: "/" },
  },
  {
    route: "/demos/",
    title: titles["/demos/"],
    description: "Complete Ljós apps running in the page: a shell you rewrite, a 3D scene to orbit, a shader effect, a whole app, and motion.",
    props: { route: "/demos/" },
  },
  {
    route: "/showcase/",
    title: titles["/showcase/"],
    description: "Apps that run on Ljós today, recorded as they run: what each shows about the toolkit, and where its source is.",
    props: { route: "/showcase/" },
  },
  ...Pro.pages(Pro.demos, after),
  ...site.pages.map((page, i) => ({ route: page.route, title: titles[page.route], description: describe(page), props: { route: page.route, page: slim[i] } })),
];
// bundle/tokens.js's two tones and each look's, the table Site/Theme.qml reads.
function tones() {
  const source = readFileSync(join(bundle, "tokens.js"), "utf8").replace(/^\.pragma library$/m, "");
  return new Function(`${source}\nreturn { light, dark, looks };`)();
}

// An app's engine as the showcase shows it: each snippet of its
// example cut from the copy of the example's file kept beside the
// entry (the file as it is at the entry's commit), coloured as code,
// and linked to those lines at that commit. A snippet the file does not
// have stops the build, so the page never quotes lines that are not there.
function withEngine(product) {
  if (!product.engine) return product;
  // An engine is shown in its own words or not named at all: an entry
  // that names one without an example would stand as a heading and a
  // link over nothing.
  const example = product.engine.example;
  if (!example) throw new Error(`bundle/Showcase/products.json: ${product.id}'s engine has no example`);
  const source = readFileSync(join(bundle, example.copy), "utf8");
  const lines = source.split("\n");
  // The whole file is highlighted and its lines cut after: lines cut
  // first would be read as a file of their own, and a property's lines
  // out of their object read as QML that isn't.
  const coloured = highlight(source, "qml").split("\n");
  const where = `bundle/Showcase/products.json: ${product.id}'s engine example`;
  const snippets = example.snippets.map(({ lines: [from, to], says }) => {
    if (!(from >= 1 && to >= from && to <= lines.length)) throw new Error(`${where} has no lines ${from}–${to} in ${example.copy}`);
    const code = lines.slice(from - 1, to).join("\n");
    const html = coloured.slice(from - 1, to).join("\n");
    // A token over a cut (a comment or a string across lines) would
    // leave its colour open, or close one the cut never opened; such a
    // cut is moved, not mended.
    if (!whole(html) || coloured.length !== lines.length) throw new Error(`${where} cuts a token at lines ${from}–${to} of ${example.copy}`);
    return {
      says,
      code,
      rich: packRich(html),
      link: `Lines ${from}–${to} at ${example.commit.slice(0, 7)}`,
      href: `https://github.com/${example.repository}/blob/${example.commit}/${example.path}#L${from}-L${to}`,
    };
  });
  return { ...product, engine: { ...product.engine, example: { ...example, snippets, copy: undefined } } };
}

// Whether highlighted lines close each span they open, after opening
// it: equal counts alone would pass a cut that starts inside one token
// and ends inside another.
function whole(html) {
  let open = 0;
  for (const [tag] of html.matchAll(/<span\b|<\/span>/g)) {
    open += tag === "</span>" ? -1 : 1;
    if (open < 0) return false;
  }
  return open === 0;
}

// A live block's pictures, addressed from its page: from its route's
// depth back to the site's root, where the pictures stand.
function pictured(live, up) {
  return {
    ...live,
    picture: `${up}Examples/${live.picture}`,
    ...(live.pictureDark ? { pictureDark: `${up}Examples/${live.pictureDark}` } : {}),
  };
}

// The other shells' colours, which siteHead() names and the build
// writes beside the pages.
let looksSheet;

// The site's head, with the colours of bundle/tokens.js (the table
// Site/Theme.qml reads) written in as CSS custom properties: one table,
// so the HTML around the app and the app never disagree.
function siteHead() {
  const { light, dark, looks } = tones();
  const css = (name) => `--ljos-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
  // A colour with alpha is written as QML reads it, #AARRGGBB; CSS
  // reads eight digits as #RRGGBBAA, so it is turned round for the head.
  const color = (value) => (/^#[0-9a-f]{8}$/i.test(value) ? `#${value.slice(3)}${value.slice(1, 3)}` : value);
  const declarations = (tone) =>
    [
      ...Object.entries(tone)
        .filter(([, value]) => typeof value === "string")
        .map(([name, value]) => `${css(name)}: ${color(value)};`),
      `--ljos-codeblock-border: ${tone.divider};`,
      `--ljos-codeblock-focus: ${tone.focus};`,
      ...Object.entries(tone.code).map(([tag, value]) => `--ljos-code-${tag}: ${color(value)};`),
    ].join(" ");
  // A look's type and shape, which do not change with the scheme.
  const shape = (look) =>
    [
      `--ljos-font-display: ${look.fonts.display};`,
      `--ljos-font-sans: ${look.fonts.sans};`,
      `--ljos-font-mono: ${look.fonts.mono};`,
      `--ljos-radius-small: ${look.shape.radiusSmall}px;`,
      `--ljos-radius: ${look.shape.radius}px;`,
      `--ljos-radius-large: ${look.shape.radiusLarge}px;`,
    ].join(" ");
  // Every page is written in the default shell (tokens.js's own light
  // and dark), so its colours alone are in the head and decide the
  // first paint. Each other shell's are under the name of the shell
  // shown (Frames.showing), so a code block or a page's ground changes
  // with a switch and no script of its own; they are a stylesheet of
  // their own (`looks`), which the head names and the page asks for
  // once a reader keeps or shows another shell (shells.js `dress`):
  // every page carrying every look's colours was 1.3 kB of each first
  // load for what most readers never switch to.
  // Until the page says which shell it shows, a kept one's (the head's
  // `data-ljos-shell`) are the colours: the head holds the first frame
  // back for this sheet, and that frame is drawn in them.
  const scoped = (shell, tail = "", scheme = "") =>
    `:root${scheme}[data-ljos-shell="${shell}"]:not([data-ljos-shell-showing])${tail}, :root${scheme}[data-ljos-shell-showing="${shell}"]${tail}`;
  const tokens = [
    `  :root { ${declarations(light)} ${shape(looks.elegant)} }`,
    `  @media (prefers-color-scheme: dark) { :root:not([data-ljos-scheme="light"]) { ${declarations(dark)} } }`,
    `  :root[data-ljos-scheme="dark"] { ${declarations(dark)} }`,
  ].join("\n");
  const others = Object.entries(looks)
    .filter(([shell]) => shell !== "elegant")
    .flatMap(([shell, look]) => [
      `${scoped(shell)} { ${declarations(look.light)} ${shape(look)} }`,
      `@media (prefers-color-scheme: dark) { ${scoped(shell, ':not([data-ljos-scheme="light"])')} { ${declarations(look.dark)} } }`,
      `${scoped(shell, "", '[data-ljos-scheme="dark"]')} { ${declarations(look.dark)} }`,
    ])
    .join("\n");
  // And what a shell does beyond its colours, as Cyberpunk's glitch.
  const ways = readFileSync(join(bundle, "assets/looks.css"), "utf8").replace(/^[ \t]*\/\*[\s\S]*?\*\/\n/gm, "");
  const sheet = `${others}\n${ways}`;
  looksSheet = { name: `looks-${createHash("sha256").update(sheet).digest("hex").slice(0, 10)}.css`, text: sheet };
  // The site's own faces (bundle/assets/fonts, served at the base's
  // fonts/): the default shell's are fetched with the page, so its first
  // lines are set in them; another shell's come when it shows.
  const faces = [
    { family: "Inter", file: "inter-var.woff2", weight: "100 900", style: "normal", early: true },
    { family: "JetBrains Mono", file: "jetbrains-mono-var.woff2", weight: "100 800", style: "normal" },
    { family: "Chakra Petch", file: "chakra-petch-400.woff2", weight: "400", style: "normal" },
    { family: "Chakra Petch", file: "chakra-petch-600.woff2", weight: "600", style: "normal" },
  ];
  const latin = "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
  const fontFaces = faces
    .map((face) => `  @font-face { font-family: "${face.family}"; src: url("${base}fonts/${face.file}") format("woff2"); font-weight: ${face.weight}; font-style: ${face.style}; font-display: swap; unicode-range: ${latin}; }`)
    .join("\n");
  const preloads = faces
    .filter((face) => face.early)
    .map((face) => `<link rel="preload" href="${base}fonts/${face.file}" as="font" type="font/woff2" crossorigin />`)
    .join("\n");
  // Where the app keeps the reader's scheme, read from the script that
  // keeps it, so the head's script never asks for another.
  const scheme = readFileSync(join(bundle, "scheme.js"), "utf8").replace(/^\.pragma library$/m, "");
  const { key } = new Function(`${scheme}\nreturn { key };`)();
  // The same for the shell kept (shells.js).
  // Its imports go too: `key` needs none of them.
  const shells = readFileSync(join(bundle, "shells.js"), "utf8").replace(/^\.(pragma library|import .*)$/gm, "");
  const shellKey = new Function(`${shells}\nreturn key;`)();
  // How long the head waits for a kept shell before it shows the page
  // anyway: its fade's delay and its script's timer, one number.
  const shellWait = 2500;
  return readFileSync(join(bundle, "assets/head.html"), "utf8")
    // Its comments are whole lines, for whoever edits it: every page
    // would carry them.
    .replace(/^[ \t]*(?:<!--[\s\S]*?-->|\/\*[\s\S]*?\*\/)\n/gm, "")
    .replace("%SCHEME_KEY%", () => JSON.stringify(key))
    .replace("%SHELL_KEY%", () => JSON.stringify(shellKey))
    .replaceAll("%SHELL_WAIT%", () => String(shellWait))
    .replace("%LJOS_TOKENS%", () => tokens)
    .replace("%LOOKS_CSS%", () => `${base}${looksSheet.name}`)
    .replace("%FONT_FACES%", () => fontFaces)
    .replace("%FONT_PRELOADS%", () => preloads)
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
    // DECISION (SITE-I18N): the site is written in English and read in
    // the languages bundle/i18n has a catalogue for; the reader's pick is
    // kept beside their scheme's (scheme.js).
    languages: { source: "en", key: "ljos.dev:language" },
    // DECISION (SITE-6 PR D): the Pantry is the app a reader opens the
    // Observer on from the landing, so its shell and blocks say where each
    // object is written (the tree names Basket, not the Rectangle it is
    // made of), and the demo that writes `PantryShell {}` says so, so that
    // its root is named as the shell it is; every other file of the site
    // carries none of it.
    // The agent replay's card is what its Observer tab lists, so it and
    // the stage that writes `DispatchCard {}` say so too.
    inspect: (path) =>
      path === "Demos/PantryShell.qml" ||
      path === "Demos/PantryDemo.qml" ||
      path.startsWith("Pantry/") ||
      path === "Demos/DispatchCard.qml" ||
      path === "Demos/AgentView.qml",
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

writeFileSync(join(out, looksSheet.name), looksSheet.text);

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
      header .home { display: flex; align-items: center; }
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
      <a class="home" href="${base}" aria-label="Ljós, home"><img src="${base}ljos.svg" width="90" height="40" alt=""></a>
      <nav aria-label="Site">
        <a href="${base}start/">Docs</a>
        <a href="${base}demos/">Demos</a>
        <a href="${base}showcase/">Showcase</a>
        <a href="https://github.com/hal-c2/ljos-ui">GitHub</a>
      </nav>
    </header>
    <main>
      <h1>Page not found</h1>
      <p>There is no page at this address. It may have moved, or the link that brought you here may be mistyped.</p>
      <a class="go" href="${base}">Go to the front page</a><a class="docs" href="${base}start/">Read the docs</a>
    </main>
    <footer>Malleable software, everywhere · MIT · <a href="https://community-software.org/">Community principles</a></footer>
  </body>
</html>
`;
writeFileSync(join(out, "404.html"), notFound);

// Each docs page's reading, beside its HTML: what a shell already
// running reads to show that page in place (bundle/nav.js), the same
// data the page's own HTML was made with.
site.pages.forEach((page, i) => writeFileSync(join(out, page.route.slice(1), "page.json"), JSON.stringify(slim[i])));

writeShared(out);
// Each pro demo's files as they are, where its page compiles an edit
// against them: what an edit does not change (a model, the other
// files) is read from here, by the address the compiler gives it.
for (const demo of Pro.demos) cpSync(Pro.targetOf(demo), join(out, Pro.sourceAt(demo)), { recursive: true });
console.log(`site-ljos: ${pages.length} pages (${site.pages.length} docs) from ${docs}, standing at ${base}`);
console.log(`site-ljos: ${out} (${built.files.length} files, ${built.bytes} bytes)`);
// Where the build's time went, so a slow one says which part was slow.
const { client, "client again": again, server, prerender, renders, jobs } = built.timings;
console.log(`site-ljos: client ${client} ms${again === undefined ? "" : ` (${again} ms of it built again)`}, server ${server} ms (at once), ${renders} prerenders ${prerender} ms on ${jobs} jobs`);

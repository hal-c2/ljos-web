// The prerenders of the docs' live code blocks, and the check they
// run: every block that would go live is compiled with `qmlc` and
// then actually made, in Node, by the runtime's own prerender
// (`renderToString`, docs/LJOS_WEB.md A26/A27). A block that claims
// to run (tagged, or any block with LJOS_CODEBLOCKS_STRICT=1) and
// does not fails here, with the compiler's or the page's words.
// Prerenders are cached by content hash in .codeblock-prerenders/;
// the Astro build embeds them, so nothing is served but the pages.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkExamples, hashExample, loadHarnesses, renderPrerenders, siteFiles } from "ljos-web/codeblocks";
import { assemble, extractBlocks, tagged } from "ljos-web/codeblocks/parse";
import { giveFiles, readGiven, unused } from "./codeblock-files.mjs";
import { writeHeld } from "./codeblocks-held.mjs";
import { keysByHash, listedEverywhere, pageRecords, readLedger, saysEverywhere, unmarked } from "./codeblocks-ledger.mjs";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [
  process.env.LJOS_DOCS_DIR,
  resolve(siteRoot, "../ljos-ui/docs/site"),
  resolve(siteRoot, "../../ljos-ui/docs/site"),
  join(homedir(), "dev/ljos-ui/docs/site"),
].filter(Boolean);
const src = candidates.find((c) => existsSync(join(c, "start/index.md")));
if (!src) {
  console.error(`codeblock-prerenders: no ljos-ui docs/site found. Tried:\n  ${candidates.join("\n  ")}\nSet LJOS_DOCS_DIR.`);
  process.exit(1);
}
const harnessDir = join(src, "harness");
const strict = process.env.LJOS_CODEBLOCKS_STRICT === "1";
const harnesses = loadHarnesses(harnessDir);
const files = siteFiles(join(src, "files"));
const qmlc = process.env.QMLC ?? resolve(siteRoot, "../target/debug/qmlc");

const pages = readdirSync(src, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith(".md") && !f.startsWith("harness"));
const byHash = new Map();
const onPages = [];
const given = readGiven();
const gave = [];
let legacy = 0;
for (const page of pages) {
  const fences = extractBlocks(readFileSync(join(src, page), "utf8"));
  const { examples, unknown } = assemble(fences, { harnesses, files });
  gave.push(...giveFiles(page, fences, examples, given));
  onPages.push({ page, fences, examples });
  if (strict && unknown.length > 0) {
    console.error(`codeblock-prerenders: ${page}: ${unknown.length} bare or unknown fence(s), first at line ${unknown[0].line}`);
    process.exit(1);
  }
  legacy += unknown.length;
  for (const example of examples) byHash.set(hashExample(example), example);
}
const examples = [...byHash.values()];
const claimed = (example) => strict || example.blocks.some(tagged);
// An example the ledger lists everywhere it stands is plain by the
// docs' own word, so it does not stop the build; the suite holds the
// report to the ledger. Every other claim to run is kept.
// Docs other than the pinned ones (the fixture's) are not the ledger's:
// none of their blocks is let stand plain by it.
const unledgered = process.env.LJOS_CODEBLOCKS_LEDGER === "none";
const ledger = unledgered ? readLedger("") : readLedger();
const keysOf = keysByHash(onPages, hashExample);
const mustRun = (example) => claimed(example) && !listedEverywhere(keysOf.get(hashExample(example)) ?? [], ledger);
// Named as the ledger names it, so what cannot run on the web yet can
// be listed there with why.
const named = (example) => (keysOf.get(hashExample(example)) ?? []).join(", ");
// The claimed examples let stand plain, for the page build to keep so.
const held = new Set();
const failures = checkExamples(examples, { qmlc });
const failed = new Map(failures.map(({ example, diagnostics }) => [hashExample(example), diagnostics]));
for (const { example, diagnostics } of failures) {
  if (mustRun(example)) {
    console.error(`codeblock-prerenders: ${named(example)} does not compile:\n${diagnostics.join("\n")}`);
    process.exit(1);
  }
  if (claimed(example)) held.add(hashExample(example));
}
legacy += failures.length;
const runnable = examples.filter((example) => !failed.has(hashExample(example)));

// One docs' examples to a directory (renderPrerenders drops what the
// docs no longer have), so another docs' are kept apart from the
// pinned ones' (LJOS_CODEBLOCK_PRERENDERS, as astro.config.mjs reads).
const cacheDir = resolve(siteRoot, process.env.LJOS_CODEBLOCK_PRERENDERS ?? ".codeblock-prerenders");
const { manifest, failures: unmade } = await renderPrerenders(runnable, { cacheDir, qmlc, checked: true });
for (const { example, diagnostics } of unmade) {
  if (mustRun(example)) {
    console.error(`codeblock-prerenders: ${named(example)} does not run:\n${diagnostics.join("\n")}`);
    process.exit(1);
  }
  if (claimed(example)) held.add(hashExample(example));
  // renderPrerenders said it in the manifest, failed, so the build
  // that embeds them leaves this block plain instead of promising it
  // live.
  legacy++;
}
// What a live example said as it was made is news unless the ledger
// says it is the page's point (`logs`): one that claims to run stops
// the build, and any other stands plain, for the ledger to say why.
const news = new Map();
let drawn = 0;
let spoke = 0;
for (const example of runnable) {
  const hash = hashExample(example);
  const said = manifest[hash]?.file ? manifest[hash].logged : undefined;
  if (said?.length && !saysEverywhere(keysOf.get(hash) ?? [], ledger)) {
    if (mustRun(example)) {
      console.error(`codeblock-prerenders: ${named(example)} said, as it was made:\n${said.join("\n")}`);
      process.exit(1);
    }
    news.set(hash, said.map((line) => `said as it was made: ${line}`));
    held.add(hash);
    legacy++;
    continue;
  }
  if (manifest[hash]?.file) drawn++;
  if (said?.length) spoke++;
}
writeHeld(cacheDir, held);
// Every example, page by page, as it stands: what the suite holds to
// the ledger of plain examples (codeblocks-ledger.mjs).
const outcome = (example) => {
  const hash = hashExample(example);
  if (failed.has(hash)) return { state: "not compiling", diagnostics: failed.get(hash) };
  if (manifest[hash]?.failed) return { state: "not running", diagnostics: manifest[hash].diagnostics };
  if (news.has(hash)) return { state: "not running", diagnostics: news.get(hash) };
  if (!manifest[hash]?.file) return { state: "not running", diagnostics: ["no prerender was made"] };
  return manifest[hash].logged?.length ? { state: "live", logged: manifest[hash].logged } : { state: "live" };
};
const report = onPages.flatMap(({ page, fences, examples }) => pageRecords(page, fences, examples, outcome, tagged));
writeFileSync(join(cacheDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
// The ledger is the step's to keep: a block that does not run, or says
// what no one meant it to, and is not listed, stops it here, and so
// does an entry for a block that runs quietly now.
const problems = unledgered ? [] : [...unmarked(report, ledger), ...unused(given, gave)];
if (problems.length) {
  console.error(`codeblock-prerenders: the report and site/codeblocks-pending.txt disagree:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(
  `codeblock-prerenders: ${drawn} live block(s) prerendered, ${legacy} block(s) left plain (untagged, or listed in the ledger), from ${pages.length} pages in ${src}` +
    (spoke ? `; ${spoke} live block(s) logged as they were made (${join(cacheDir, "report.json")})` : ""),
);

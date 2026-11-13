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
import { checkExamples, hashExample, loadHarnesses, renderPrerenders } from "ljos-web/codeblocks";
import { assemble, extractBlocks, tagged } from "ljos-web/codeblocks/parse";
import { exampleKeys, listedEverywhere, pageRecords, readLedger } from "./codeblocks-ledger.mjs";

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
const qmlc = process.env.QMLC ?? resolve(siteRoot, "../target/debug/qmlc");

const pages = readdirSync(src, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith(".md") && !f.startsWith("harness"));
const byHash = new Map();
const onPages = [];
let legacy = 0;
for (const page of pages) {
  const fences = extractBlocks(readFileSync(join(src, page), "utf8"));
  const { examples, unknown } = assemble(fences, { harnesses });
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
const ledger = readLedger();
const keysOf = new Map();
for (const { page, fences, examples: shown } of onPages)
  for (const { example, key } of exampleKeys(page, fences, shown)) {
    const hash = hashExample(example);
    keysOf.set(hash, [...(keysOf.get(hash) ?? []), key]);
  }
const mustRun = (example) => claimed(example) && !listedEverywhere(keysOf.get(hashExample(example)) ?? [], ledger);
// Named as the ledger names it, so what cannot run on the web yet can
// be listed there with why.
const named = (example) => (keysOf.get(hashExample(example)) ?? []).join(", ");
const failures = checkExamples(examples, { qmlc });
const failed = new Map(failures.map(({ example, diagnostics }) => [hashExample(example), diagnostics]));
for (const { example, diagnostics } of failures) {
  if (mustRun(example)) {
    console.error(`codeblock-prerenders: ${named(example)} does not compile:\n${diagnostics.join("\n")}`);
    process.exit(1);
  }
}
legacy += failures.length;
const runnable = examples.filter((example) => !failed.has(hashExample(example)));

const cacheDir = join(siteRoot, ".codeblock-prerenders");
const { manifest, failures: unmade } = await renderPrerenders(runnable, { cacheDir, qmlc });
for (const { example, diagnostics } of unmade) {
  if (mustRun(example)) {
    console.error(`codeblock-prerenders: ${named(example)} does not run:\n${diagnostics.join("\n")}`);
    process.exit(1);
  }
  // Said in the manifest, so the build that embeds them leaves this
  // block plain instead of promising it live.
  manifest[hashExample(example)] = { failed: true, diagnostics };
  legacy++;
}
let drawn = 0;
for (const example of runnable) if (manifest[hashExample(example)]?.file) drawn++;
writeFileSync(join(cacheDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
// Every example, page by page, as it stands: what the suite holds to
// the ledger of plain examples (codeblocks-ledger.mjs).
const outcome = (example) => {
  const hash = hashExample(example);
  if (failed.has(hash)) return { state: "not compiling", diagnostics: failed.get(hash) };
  if (manifest[hash]?.failed) return { state: "not running", diagnostics: manifest[hash].diagnostics };
  return manifest[hash]?.file ? { state: "live" } : { state: "not running", diagnostics: ["no prerender was made"] };
};
const report = onPages.flatMap(({ page, fences, examples }) => pageRecords(page, fences, examples, outcome, tagged));
writeFileSync(join(cacheDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `codeblock-prerenders: ${drawn} live block(s) prerendered, ${legacy} untagged block(s) left plain, from ${pages.length} pages in ${src}`,
);

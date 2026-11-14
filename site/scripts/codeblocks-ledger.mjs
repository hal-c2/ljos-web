// Which docs examples run on the site, and which are said not to.
//
// Both builds (the Astro reference through codeblock-prerenders.mjs,
// the Ljós site through site-ljos/scripts/build.mjs) leave an example
// that does not compile or run as plain code, unless it claims to run.
// A plain example is a promise the docs make and the site breaks, so
// every one must be named in codeblocks-pending.txt with why; the
// suites of both sites hold each build's report to that list, both
// ways, so the list only shrinks.
//
// An example is named as ljos-ui's own docs check names it
// (crates/ljos_cli/tests/docs_site.rs): `<page> <n>`, the page's path
// under docs/site and which of its `qml` fences the example starts at,
// counted from 1.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LEDGER = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "codeblocks-pending.txt");

// The reasons an example may stand plain: the same words as ljos-ui's
// ledger where the reason is the docs' own, `web:` for what runs in
// Ljós but not yet on the web, and `docs:` for an example the page
// leaves without what it reads, which ljos check only warns about.
const REASONS = /^(host-types|shows-findings|(web|docs):[a-z0-9-]+)$/;

/** The docs page a site route is read from: `/start/` is `start/index.md`. */
export function pageOfRoute(route) {
  const parts = route.split("/").filter(Boolean);
  return parts.length === 1 ? `${parts[0]}/index.md` : `${parts.join("/")}.md`;
}

/**
 * Each of a page's examples with its name, `<page> <n>`. `fences` are
 * the page's code blocks in order, as given to `assemble`.
 */
export function exampleKeys(page, fences, examples) {
  const ordinals = new Map();
  for (const fence of fences) if (fence.lang === "qml") ordinals.set(fence, ordinals.size + 1);
  return examples.map((example) => {
    // docs_site.rs names a group by its root, the one `qml` fence with
    // no `file=`, even where the page shows another of its files first.
    const root = example.blocks.find((block) => block.lang === "qml" && !block.file);
    const n = root
      ? ordinals.get(root)
      : Math.min(...example.blocks.map((block) => ordinals.get(block)).filter((k) => k !== undefined));
    return { example, n, key: `${page} ${n}` };
  });
}

/**
 * One page's examples as the report holds them. `outcome(example)`
 * says `live`, `not compiling` or `not running`, with the diagnostics.
 */
export function pageRecords(page, fences, examples, outcome, tagged) {
  return exampleKeys(page, fences, examples).map(({ example, n }) => {
    const { state, diagnostics = [] } = outcome(example);
    return {
      page,
      n,
      line: example.blocks[0].line ?? 0,
      claimed: example.blocks.some(tagged),
      state,
      diagnostics: diagnostics.slice(0, 3),
    };
  });
}

/**
 * Whether an example that claims to run may stand plain instead of
 * stopping the build: the ledger lists it on every page that shows it,
 * by the `keys` `exampleKeys` gives it there. One page left out would
 * be a plain example nobody said was plain.
 */
export function listedEverywhere(keys, ledger) {
  return keys.length > 0 && keys.every((key) => ledger.entries.has(key));
}

export function readLedger(text = readFileSync(LEDGER, "utf8")) {
  const entries = new Map();
  const problems = [];
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const [page, n, reason, ...rest] = line.split(/\s+/);
    const at = `codeblocks-pending.txt:${i + 1}`;
    if (!page?.endsWith(".md") || !/^[1-9][0-9]*$/.test(n ?? "") || !reason) {
      problems.push(`${at}: \`<page> <n> <reason>…\`, not "${line}"`);
      return;
    }
    if (!REASONS.test(reason)) problems.push(`${at}: no reason \`${reason}\``);
    if (entries.has(`${page} ${n}`)) problems.push(`${at}: ${page} ${n} is listed twice`);
    entries.set(`${page} ${n}`, { reason, note: rest.join(" "), at });
  });
  return { entries, problems };
}

/** What a build's report and the ledger disagree on, worded for a reader. */
export function unmarked(records, ledger) {
  const problems = [...ledger.problems];
  const seen = new Set();
  for (const record of records) {
    const key = `${record.page} ${record.n}`;
    if (!Number.isFinite(record.n)) continue;
    seen.add(key);
    const listed = ledger.entries.get(key);
    if (record.state === "live" && listed)
      problems.push(`${listed.at}: ${key} runs now (${listed.reason}); take it off the list`);
    if (record.state !== "live" && !listed)
      problems.push(
        `docs/site/${record.page}:${record.line}: ${key} is ${record.state} and not listed as plain:\n    ${record.diagnostics.join("\n    ")}`,
      );
  }
  for (const [key, { at }] of ledger.entries) if (!seen.has(key)) problems.push(`${at}: ${key} is no example of the docs`);
  return problems;
}

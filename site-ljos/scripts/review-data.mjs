#!/usr/bin/env node
// Refreshes the review's data (bundle/Review/review.json) from the
// compare apps: it cuts each excerpt's code from its file and lines, so
// the page never shows code the app does not have, and with
// --placeholders it writes marked stand-in numbers for every metric not
// yet measured. The numbers themselves come from the compare lead's
// RESULTS.md; until it lands a stand-in is flagged `placeholder` and the
// page says so above its charts.
//
//   node scripts/review-data.mjs --review <clone> --compare <dir> [--results <RESULTS.json>] [--prose <prose.json>] [--placeholders]
//
// --review is a clone of the published apps (REPO below), every app in
// it as measured, in its own directory (a framework's `source.root`,
// "review:<dir>"); each excerpt links to its file there, at the
// clone's commit, and the page to the whole repository at that commit.
// --compare is the directory holding the compare lead's fact sheets
// (<dir>/facts/); --results
// the compare lead's RESULTS.json, whose medians replace the stand-ins;
// --prose the fans' words ({ intro, frameworks: { <id>: { fan, cool,
// limits, shows: [n] } } }).
//
// What a fan shows first in a framework's section is one of the
// excerpts its fact sheet (<dir>/facts/<framework>.excerpts.md) numbers,
// named in the data by that number (`prose.shows: [{ "n": 4 }]`): the
// sheet gives its file, its lines and what it shows, and the code is cut
// from the app as the features' is.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(here, "bundle/Review/review.json");

function option(name) {
  const at = process.argv.indexOf(name);
  return at < 0 ? null : process.argv[at + 1];
}
const roots = { compare: option("--compare"), review: option("--review") };
const REPO = "https://github.com/hal-c2/ui-framework-review";
const placeholders = process.argv.includes("--placeholders");

const review = JSON.parse(readFileSync(file, "utf8"));
const byId = new Map(review.frameworks.map((one) => [one.id, one]));

// "compare:egui" -> <compare>/egui
function placeOf(one, root) {
  const [kind, rest] = root.split(/:(.*)/su);
  const base = roots[kind];
  if (base == null) throw new Error(`${one.id}: pass --${kind} to read ${root}`);
  return join(base, rest);
}
const rootOf = (one) => placeOf(one, one.source.root);

// The published apps at the clone's commit: a reader can open the whole
// file an excerpt was cut from, and build and run every app.
if (roots.review == null) throw new Error("pass --review <clone of " + REPO + ">");
const sha = execFileSync("git", ["-C", roots.review, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
review.repo = { href: `${REPO}/tree/${sha}`, sha };

const resultsFile = option("--results");
const results = resultsFile == null ? null : JSON.parse(readFileSync(resultsFile, "utf8"));

// Every entry the published repository lists (site/data/entries.json):
// a framework that runs natively and on the web is two entries, each in
// its own group, naming the other as its pair. An entry's picture and,
// for a web build, the page that runs it come from the repository's
// GitHub Pages site, loaded only when a reader scrolls to it, so the
// review's own pages carry none of them. What an entry could not do of
// the spec comes from the compare lead's ENTRIES-2.json (in RESULTS.json
// as `entries`).
const PAGES = "https://hal-c2.github.io/ui-framework-review";
const listed = JSON.parse(readFileSync(join(roots.review, "site/data/entries.json"), "utf8")).entries;
const noted = new Map((results?.entries ?? []).map((entry) => [entry.entry, entry]));
const entryOf = new Map();
// "review:ljos-web/app" is in the repository's "ljos-web" directory.
const inDir = (framework, dir) => dir != null && (framework.source.root === `review:${dir}` || framework.source.root.startsWith(`review:${dir}/`));
// Sizes and line counts of the entries the review had no section for,
// as the repository writes them; COUNTED below has the others.
const counted = { loc: {}, binary: {} };
for (const entry of listed) {
  // An entry already given a section is that section, whether this run
  // or an earlier one named it.
  let one = byId.get(entry.id) ?? review.frameworks.find((framework) => inDir(framework, entry.dir));
  if (one == null) {
    // An entry with no app of its own (Dioxus's desktop build is the web
    // app's code) links to its pair's; its words are not written yet.
    const pair = listed.find((other) => (entry.counterparts ?? []).includes(other.id) && other.dir != null);
    const from = pair && review.frameworks.find((framework) => inDir(framework, pair.dir));
    if (from == null) throw new Error(`${entry.id}: no app of its own and no pair with one`);
    one = {
      id: entry.id,
      name: entry.name,
      kind: entry.kind,
      language: entry.language,
      version: entry.version,
      licence: from.licence,
      links: from.links,
      source: { root: from.source.root },
      prose: { fan: entry.summary, cool: [], limits: [], shows: [], placeholder: true },
    };
    review.frameworks.push(one);
    byId.set(one.id, one);
    const count = (text, pattern) => Number(text?.match(pattern)?.[1]?.replace(/,/gu, ""));
    const loc = count(entry.loc, /^([\d,]+)/u);
    const bytes = count(entry.binary, /([\d,]+) B stripped/u);
    if (loc > 0) counted.loc[one.id] = loc;
    if (bytes > 0 && one.kind === "native") counted.binary[one.id] = Math.round(bytes / 1e4) / 100;
  }
  entryOf.set(entry.id, one);
  one.name = entry.name;
  one.results = entry.results;
  const shot = (scheme) => `screenshots/${entry.id}/${scheme}.png`;
  if (existsSync(join(roots.review, shot("light"))) && existsSync(join(roots.review, shot("dark")))) {
    one.screenshot = { light: `${PAGES}/${shot("light")}`, dark: `${PAGES}/${shot("dark")}` };
  } else delete one.screenshot;
  if (entry.kind === "web" && existsSync(join(roots.review, "builds", entry.id))) one.run = `${PAGES}/run/${entry.id}/`;
  else delete one.run;
  const note = noted.get(entry.id);
  if (note?.strategy != null) one.strategy = note.strategy;
  const missing = note?.missing == null ? [] : [note.missing].flat();
  if (missing.length > 0) one.missing = missing;
  else delete one.missing;
}
for (const entry of listed) {
  const pair = (entry.counterparts ?? []).map((id) => entryOf.get(id)?.id).filter((id) => id != null);
  if (pair.length > 0) entryOf.get(entry.id).pair = pair;
  else delete entryOf.get(entry.id).pair;
}
// An entry the compare lead ran that the published repository does not
// list yet (another way to build a listed framework's app, such as Qt
// Quick with its logic in Rust) gets a section of its own beside the
// entry it names as its pair. Its app is in the compare directory, so
// its excerpts link nowhere and it has no picture until it is published.
const UNLISTED = {
  "cxx-qt": {
    name: "CXX-Qt",
    language: "QML + Rust",
    version: "CXX-Qt 0.10.0 on Qt 6.12.0",
    licence: "MIT OR Apache-2.0",
    links: { site: "https://kdab.github.io/cxx-qt/book/", docs: "https://kdab.github.io/cxx-qt/book/", repo: "https://github.com/KDAB/cxx-qt" },
  },
  "qt-bridge": {
    name: "Qt Bridge",
    language: "QML + Rust",
    version: "qtbridge 0.4.1",
    licence: "LicenseRef-Qt-Commercial OR LGPL-3.0-only",
    links: { site: "https://doc.qt.io/qtbridges/", docs: "https://doc.qt.io/qtbridge-rust/", repo: "https://code.qt.io/cgit/qt/qtbridge-rust.git/" },
  },
};
for (const note of noted.values()) {
  const with_ = entryOf.get(note.pair);
  if (entryOf.has(note.entry) || with_ == null) continue;
  const known = UNLISTED[note.entry];
  if (known == null) throw new Error(`${note.entry}: in RESULTS.json's entries, not published, and not in UNLISTED`);
  let one = byId.get(note.entry);
  if (one == null) {
    one = {
      id: note.entry,
      kind: note.platform,
      source: { root: `compare:${note.entry}` },
      prose: { fan: `${with_.name}'s inbox with its logic in Rust: ${note.strategy}.`, cool: [], limits: [], shows: [], placeholder: true },
    };
    review.frameworks.push(one);
    byId.set(one.id, one);
  }
  Object.assign(one, known);
  one.strategy = note.strategy;
  const missing = [note.missing ?? []].flat();
  if (missing.length > 0) one.missing = missing;
  else delete one.missing;
  delete one.screenshot;
  delete one.run;
  entryOf.set(note.entry, one);
  one.pair = [with_.id];
  with_.pair = [...new Set([...(with_.pair ?? []), one.id])];
}

for (const one of review.frameworks) {
  const [kind, dir] = one.source.root.split(/:(.*)/su);
  if (kind === "compare" && entryOf.get(one.id)?.source.root === one.source.root && UNLISTED[one.id] != null) {
    one.source = { root: one.source.root };
    continue;
  }
  if (kind !== "review") throw new Error(`${one.id}: its source.root ${one.source.root} is not in the published apps ("review:<dir>")`);
  one.source = { root: one.source.root, href: `${REPO}/blob/${sha}/${dir}/` };
}

// The revision a link pins: ".../blob/<sha>/...".
const pinnedOf = (href) => href.match(/\/blob\/([0-9a-f]{7,40})\//u)?.[1];

// A file as a revision of the checkout at `dir` has it, or undefined
// where that revision has no such file (or the checkout no such
// revision).
function atRevision(dir, rev, file) {
  try {
    return execFileSync("git", ["-C", dir, "show", `${rev}:./${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 26 });
  } catch {
    return undefined;
  }
}

// A line links to the app as published only if the file there, at the
// revision the link pins, is the file the excerpt was cut from: the
// clone read may have changes not committed.
function published(one, file) {
  if (one.source.href == null) return false;
  const rev = pinnedOf(one.source.href);
  if (rev === undefined) return false;
  return atRevision(rootOf(one), rev, file) === readFileSync(join(rootOf(one), file), "utf8");
}

// The lines a range names, with the indent they share taken off so a
// deep excerpt still starts at the left edge.
function cut(text, lines) {
  const [first, last] = lines.split("-").map(Number);
  const all = text.split("\n");
  if (!(first >= 1 && last >= first && last <= all.length)) throw new Error(`lines ${lines} outside 1-${all.length}`);
  const picked = all.slice(first - 1, last);
  const indent = Math.min(...picked.filter((line) => line.trim() !== "").map((line) => line.match(/^[ \t]*/u)[0].length));
  return picked.map((line) => line.slice(indent)).join("\n").replace(/\s+$/u, "");
}

// An excerpt's code from its app, and the link to its lines where the
// app is published.
function fill(one, excerpt) {
  excerpt.code = cut(readFileSync(join(rootOf(one), excerpt.file), "utf8"), excerpt.lines);
  if (published(one, excerpt.file)) excerpt.href = `${one.source.href}${excerpt.file}#L${excerpt.lines.replace("-", "-L")}`;
  else delete excerpt.href;
}

for (const feature of review.features) {
  for (const [id, excerpt] of Object.entries(feature.excerpts)) {
    const one = byId.get(id);
    if (one == null) throw new Error(`${feature.id}: no framework ${id}`);
    fill(one, excerpt);
  }
}

const LANGS = { qml: "qml", slint: "slint", rs: "rust", dart: "dart", declare: "declare", tsx: "tsx", ts: "ts", cpp: "cpp", h: "cpp" };

// A fact sheet's excerpts by number: "## 4. Free pick: the bar chart"
// over "`src/views.rs:477-500`" and a fenced block. A sheet writes its
// paths from where it stands (`compare/dioxus/src/main.rs`,
// `bench/inbox/Store.qml`), so a path loses leading directories until
// it names a file of the app.
function sheet(one) {
  const at = join(roots.compare ?? "", "facts", `${one.id}.excerpts.md`);
  if (roots.compare == null || !existsSync(at)) throw new Error(`${one.id}: no fact sheet at ${at}; pass --compare`);
  const text = readFileSync(at, "utf8");
  const found = new Map();
  for (const part of text.split(/^## /mu).slice(1)) {
    const head = part.match(/^(\d+)\.\s+(.+)$/mu);
    const place = part.match(/^`([^`]+):(\d+-\d+)`$/mu);
    const fence = part.match(/^```(\w*)$/mu);
    if (head == null || place == null) continue;
    let file = place[1];
    while (!existsSync(join(rootOf(one), file)) && file.includes("/")) file = file.slice(file.indexOf("/") + 1);
    if (!existsSync(join(rootOf(one), file))) throw new Error(`${one.id}: ${place[1]} is no file of ${one.source.root}`);
    // Coloured as the features' code is, by its file: a sheet tags a
    // language the highlighter has no name for (Declare) as `text`.
    const lang = LANGS[file.split(".").pop()] ?? (fence?.[1] || "text");
    found.set(Number(head[1]), { caption: head[2].replace(/`/gu, ""), file, lines: place[2], lang });
  }
  return found;
}

// The fans' words, written from the fact sheets alone and checked
// against them sentence by sentence before they come here: they replace
// the placeholders whole, and name the excerpts they show by number.
const proseFile = option("--prose");
if (proseFile != null) {
  const prose = JSON.parse(readFileSync(proseFile, "utf8"));
  review.intro = { text: prose.intro };
  for (const [id, words] of Object.entries(prose.frameworks)) {
    const one = byId.get(id);
    if (one == null) throw new Error(`${proseFile}: ${id} is no framework of the review`);
    one.prose = { fan: words.fan, cool: words.cool, limits: words.limits, shows: words.shows.map((n) => ({ n })) };
  }
  // An entry new to the review keeps its placeholder until its words are
  // written; every other framework must have them.
  const unwritten = review.frameworks.filter((one) => !(one.id in prose.frameworks) && one.prose.placeholder !== true).map((one) => one.id);
  if (unwritten.length > 0) throw new Error(`${proseFile}: no words for ${unwritten.join(", ")}`);
}

for (const one of review.frameworks) {
  // Until its words are written, a placeholder section shows its sheet's
  // first excerpt.
  if (one.prose.shows == null && placeholders) one.prose.shows = [{ n: 1 }];
  if (one.prose.shows == null || one.prose.shows.length === 0) continue;
  const numbered = sheet(one);
  one.prose.shows = one.prose.shows.map(({ n }) => {
    const excerpt = numbered.get(n);
    if (excerpt == null) throw new Error(`${one.id}: its fact sheet has no excerpt ${n}`);
    const shown = { n, ...excerpt };
    fill(one, shown);
    return shown;
  });
}

// A stand-in that reads as a number but is plainly not one: the same
// for the same framework and metric on every run, so the page does not
// move between builds.
function standIn(metric, id) {
  let hash = 2166136261;
  for (const char of `${metric}/${id}`) hash = Math.imul(hash ^ char.codePointAt(0), 16777619) >>> 0;
  const span = { startup: [40, 900], memory: [20, 400], "idle-cpu": [0, 3], scroll: [4, 20], search: [2, 60], binary: [3, 60], transfer: [30, 400], loc: [500, 2500] }[metric] ?? [1, 100];
  const median = span[0] + ((hash % 1000) / 1000) * (span[1] - span[0]);
  const round = (value) => (span[1] >= 100 ? Math.round(value) : Math.round(value * 10) / 10);
  return { median: round(median), min: round(median * 0.92), max: round(median * 1.08), runs: 0, placeholder: true };
}

// The measured numbers, from the compare lead's RESULTS.json
// (compare/harness/aggregate.py): each a median over the runs that
// finished, with their least and most. Where a metric lives in it is
// named per kind of framework; a web number is Chromium's. Native
// memory is anonymous PSS, the heap the app made, as the shared
// libraries a toolkit maps would otherwise count against it. A native
// search is every key's lag pooled over the runs, at its 95th
// percentile, as the first key's alone hides an app that stalls on the
// later ones. The web session times only the first key, so a web search
// is that key's lag over the runs; the two are on separate charts.
// Sizes and line counts are counted once, by the compare lead, and come
// from RESULTS.md's tables (COUNTED below).
const MEASURED = {
  startup: { native: ["session", "first_frame_ms"], web: ["fcp_ms"] },
  memory: { native: ["session", "anon_pss_after_session_mib"], web: ["pss_after_session_mib_browser_tree"] },
  "idle-cpu": { native: ["session", "idle_cpu_percent"], web: ["idle_cpu_percent_browser_tree"] },
  scroll: { native: ["session", "steps", "2000 rows down", "frame_p95_ms"], web: ["steps", "2000 rows down", "frame_p95_ms"] },
  search: { native: ["session", "steps", "search", "every_input_lag_ms"], web: ["steps", "search", "lag_ms"], pooled: { native: "keys" } },
};
// RESULTS.md's "Code, size and build" section, as counted once:
// stripped native builds in MB (Qt Quick's is its 1.07 MB app and the
// 39.0 MB of Qt libraries it links; Flutter's its bundle), each web
// build's code alone gzip -9 in kB of 1 000 bytes, and cloc's code
// lines.
const COUNTED = {
  binary: { ljos: 139, qt: 40.07, slint: 22.6, egui: 22.4, iced: 20.5, gpui: 44.7, flutter: 24.8 },
  transfer: { solid: 37, declare: 192, yew: 215, sycamore: 216, "ljos-web": 216, leptos: 249, dioxus: 340 },
  loc: {
    ljos: 1686,
    "ljos-web": 1712,
    qt: 1316,
    slint: 1819,
    egui: 1373,
    iced: 1483,
    gpui: 1547,
    flutter: 1531,
    solid: 798,
    declare: 577,
    yew: 1407,
    sycamore: 1369,
    dioxus: 1025,
    leptos: 1063,
  },
};
for (const metric of review.metrics) {
  for (const [id, count] of Object.entries({ ...COUNTED[metric.id], ...counted[metric.id] })) metric.values[id] = { median: count, min: count, max: count, runs: 1, of: "counts" };
}

// The renderer sets the numbers were measured in (compare/harness/
// aggregate2.py's passes), in the order the page offers them, the first
// its default. Native apps ran each set with one driver environment
// shared by every app; the web apps ran in Chromium on the GPU for the
// GPU set and in Chromium's own software path (SwiftShader) for the
// others, since a browser has no llvmpipe thread count to set. Firefox
// ran once, on its default, and is shown beside the sets, not in them.
const SETS = [
  { id: "gpu", label: "GPU", browser: "chromium-gpu" },
  { id: "sw-default", label: "Software (llvmpipe)", browser: "chromium" },
  { id: "sw-4", label: "Software, 4 threads", browser: "chromium" },
  { id: "sw-own", label: "Software, each toolkit's own", browser: "chromium" },
];
const BROWSERS = { "chromium-gpu": "Chromium on the GPU", chromium: "Chromium, software (SwiftShader)", firefox: "Firefox" };
if (results != null) {
  const dig = (at, path) => path.reduce((here, key) => (here == null ? null : here[key]), at);
  const round = (value) => (Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 100) / 100);
  const span = (numbers) => {
    const known = numbers.filter((number) => typeof number === "number");
    if (known.length === 0) return null;
    const [least, most] = [Math.min(...known), Math.max(...known)];
    return least === most ? `${round(least)}` : `${round(least)}–${round(most)}`;
  };
  const valueOf = (at, where, kind) => {
    const path = where[kind];
    const stat = path && at ? dig(at, path) : null;
    const pooled = where.pooled?.[kind];
    // A pooled number: the bar its 95th percentile, the line from the
    // median key to the slowest.
    if (pooled != null) return stat?.p95 == null ? null : { median: round(stat.p95), min: round(stat.p50), max: round(stat.max), runs: stat.n, of: pooled, stat: "p95" };
    return stat?.median == null ? null : { median: round(stat.median), min: round(stat.min), max: round(stat.max), runs: stat.n };
  };
  // What a run did not report is left out, not null: the page's types
  // have a missing value optional (ljos check's ts-no-null).
  const known = (fields) => Object.fromEntries(Object.entries(fields).filter(([, value]) => value != null));
  const webIn = (browser) => {
    const reports = Object.entries(results.web ?? {}).map(([, by]) => by[browser]).filter((report) => report != null);
    if (reports.length === 0) return null;
    return known({
      browser: BROWSERS[browser],
      renderer: results.web_renderers?.[browser] ?? null,
      seen: reports.find((report) => report.renderer)?.renderer ?? null,
      version: reports.find((report) => report.version)?.version ?? null,
      runs: span(reports.map((report) => report.runs)),
    });
  };
  review.sets = SETS.map(({ id, label, browser }) => {
    const pass = results.native?.[id];
    const runtimes = Object.values(pass?.runtimes ?? {});
    const machine = pass?.meta?.machine;
    const native =
      pass == null || runtimes.length === 0
        ? null
        : known({
            renderer: pass.renderer,
            env: pass.env,
            machine: machine == null ? null : `${machine.cpu}, ${machine.cpus} CPUs, ${Math.round(machine.memory_bytes / 2 ** 30)} GiB, Linux ${machine.kernel}`,
            date: pass.meta.date ?? null,
            runs: span(runtimes.map((runtime) => runtime.session?.runs)),
            load: span(runtimes.flatMap((runtime) => runtime.session?.load_average?.values ?? [])),
          });
    return known({ id, label, native, web: webIn(browser) });
  });
  const firefox = webIn("firefox");
  if (firefox == null) delete review.firefox;
  else review.firefox = firefox;
  for (const metric of review.metrics) {
    const where = MEASURED[metric.id];
    if (where == null) continue;
    // A timed metric's numbers are each set's own: a set an app did not
    // run in has no number for it, never another set's.
    delete metric.values;
    metric.sets = {};
    metric.firefox = {};
    for (const { id, browser } of SETS) {
      const values = (metric.sets[id] = {});
      for (const one of review.frameworks) {
        const name = one.results ?? one.id;
        const at = one.kind === "native" ? results.native?.[id]?.runtimes?.[name] : results.web?.[name]?.[browser];
        const value = valueOf(at, where, one.kind);
        if (value != null) values[one.id] = value;
      }
    }
    for (const one of review.frameworks) {
      const value = one.kind === "web" ? valueOf(results.web?.[one.results ?? one.id]?.firefox, where, "web") : null;
      if (value != null) metric.firefox[one.id] = value;
    }
  }
}

if (placeholders) {
  for (const metric of review.metrics) {
    // A renderer set's missing number stays missing: the page says the
    // set has none.
    if (metric.values == null) continue;
    for (const one of review.frameworks) {
      const measured = metric.values[one.id];
      if (measured != null && !measured.placeholder) continue;
      // A metric only one kind of framework has (a native binary, a web
      // transfer) has no number of the other.
      const grouped = metric.groups.some((group) => group.kind === "all" || group.kind === one.kind);
      if (grouped) metric.values[one.id] = standIn(metric.id, one.id);
      else delete metric.values[one.id];
    }
  }
}

writeFileSync(file, `${JSON.stringify(review, null, 2)}\n`);
console.log(`review-data: ${review.features.reduce((sum, feature) => sum + Object.keys(feature.excerpts).length, 0)} excerpts cut into ${file}`);

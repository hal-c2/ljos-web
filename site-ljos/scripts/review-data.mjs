#!/usr/bin/env node
// Refreshes the review's data (bundle/Review/review.json) from the
// compare apps: it cuts each excerpt's code from its file and lines, so
// the page never shows code the app does not have, and with
// --placeholders it writes marked stand-in numbers for every metric not
// yet measured. The numbers themselves come from the compare lead's
// RESULTS.md; until it lands a stand-in is flagged `placeholder` and the
// page says so above its charts.
//
//   node scripts/review-data.mjs --compare <dir> --ljos-ui <checkout> [--results <RESULTS.json>] [--prose <prose.json>] [--placeholders]
//
// --compare is the directory holding one app per framework
// (<dir>/<framework>/...) and its fact sheets (<dir>/facts/); --ljos-ui
// a checkout of ljos-ui whose bench/inbox is the Ljós app; --results
// the compare lead's RESULTS.json, whose medians replace the stand-ins;
// --prose the fans' words ({ intro, frameworks: { <id>: { fan, cool,
// limits, shows: [n] } } }).
//
// What a fan shows first in a framework's section is one of the
// excerpts its fact sheet (<dir>/facts/<framework>.excerpts.md) numbers,
// named in the data by that number (`prose.shows: [{ "n": 4 }]`): the
// sheet gives its file, its lines and what it shows, and the code is cut
// from the app as the features' is.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(here, "bundle/Review/review.json");

function option(name) {
  const at = process.argv.indexOf(name);
  return at < 0 ? null : process.argv[at + 1];
}
const roots = { compare: option("--compare"), "ljos-ui": option("--ljos-ui") };
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

// Where an app's published copy is elsewhere (Ljós web runs ljos-ui's
// bench/inbox), a line links there only if that file is the same.
function published(one, file) {
  if (!one.source.href) return false;
  if (!one.source.published) return true;
  const there = join(placeOf(one, one.source.published), file);
  return existsSync(there) && readFileSync(there, "utf8") === readFileSync(join(rootOf(one), file), "utf8");
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
  const unwritten = review.frameworks.filter((one) => !(one.id in prose.frameworks)).map((one) => one.id);
  if (unwritten.length > 0) throw new Error(`${proseFile}: no words for ${unwritten.join(", ")}`);
}

for (const one of review.frameworks) {
  // Until its words are written, a placeholder section shows its sheet's
  // first excerpt.
  if (one.prose.shows == null && placeholders) one.prose.shows = [{ n: 1 }];
  if (one.prose.shows == null) continue;
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
  for (const [id, count] of Object.entries(COUNTED[metric.id] ?? {})) metric.values[id] = { median: count, min: count, max: count, runs: 1, of: "counts" };
}

// The runtimes RESULTS.json names that the page names otherwise.
const RUNTIME = { qt: "qtquick", gpui: "gpui-x11" };
const resultsFile = option("--results");
if (resultsFile != null) {
  const results = JSON.parse(readFileSync(resultsFile, "utf8"));
  const dig = (at, path) => path.reduce((here, key) => (here == null ? null : here[key]), at);
  for (const metric of review.metrics) {
    const where = MEASURED[metric.id];
    if (where == null) continue;
    for (const one of review.frameworks) {
      const name = RUNTIME[one.id] ?? one.id;
      const at = one.kind === "native" ? results.native?.runtimes?.[name] : results.web?.[name]?.chromium;
      const path = where[one.kind];
      const stat = path && at ? dig(at, path) : null;
      const round = (value) => (Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 100) / 100);
      const pooled = where.pooled?.[one.kind];
      if (pooled != null) {
        // A pooled number: the bar its 95th percentile, the line from the
        // median key to the slowest.
        if (stat?.p95 == null) continue;
        metric.values[one.id] = { median: round(stat.p95), min: round(stat.p50), max: round(stat.max), runs: stat.n, of: pooled, stat: "p95" };
        continue;
      }
      if (stat?.median == null) continue;
      metric.values[one.id] = { median: round(stat.median), min: round(stat.min), max: round(stat.max), runs: stat.n };
    }
  }
}

if (placeholders) {
  for (const metric of review.metrics) {
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

// The framework review's data (Review/review.json, carried in
// ReviewBuilt.data) as Site/ReviewPage.qml reads it, and what the page
// works out of it: which frameworks are picked, the bars of a metric for
// those, and how a number is said.

export interface Links {
  readonly site: string;
  readonly docs: string;
  readonly repo: string;
}

// The words of a framework's section: a fan's, then what it does best
// and the inbox code they would show first, then where it is not as
// strong.
export interface Prose {
  readonly fan: string;
  readonly cool: readonly string[];
  readonly shows: readonly Excerpt[];
  readonly limits: readonly string[];
  readonly placeholder?: boolean;
  // Left out of the first load: the later data has them.
  readonly later?: boolean;
}

export interface Framework {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly language: string;
  readonly version: string;
  readonly licence: string;
  readonly links: Links;
  readonly prose: Prose;
  // The published repository's pictures of the app, light and dark.
  readonly screenshot?: Shots;
  // Where a web entry's production build runs in a reader's browser.
  readonly run?: string;
  // The same framework's entries of the other kind: Dioxus's desktop
  // build is the pair of its web build.
  readonly pair?: readonly string[];
  // How the entry builds the app, where the framework has several ways.
  readonly strategy?: string;
  // What of the spec the entry could not do.
  readonly missing?: readonly string[];
}

export interface Shots {
  readonly light: string;
  readonly dark: string;
}

// How the apps of one kind ran in a renderer set: native apps with one
// driver environment for every app, web apps in one browser.
export interface Native {
  readonly renderer: string;
  readonly env: string;
  readonly machine: string | null;
  readonly date: string | null;
  // Ranges over the apps ("3", "3–7") and over every run ("1.7–20.5").
  readonly runs: string | null;
  readonly load: string | null;
}

export interface Web {
  readonly browser: string;
  readonly renderer: string | null;
  // The WebGL renderer the browser reported.
  readonly seen: string | null;
  readonly version: string | null;
  readonly runs: string | null;
}

// A renderer set: every timed number of the page was measured in one,
// and the page shows one set at a time. A kind the set has not run is
// null.
export interface RendererSet {
  readonly id: string;
  readonly label: string;
  readonly native: Native | null;
  readonly web: Web | null;
}

// One measured number: the median of its runs, their spread, and how
// many there were. A placeholder stands in until the number is measured.
export interface Value {
  // The median, or the statistic `stat` names.
  readonly median: number;
  readonly min: number;
  readonly max: number;
  readonly runs: number;
  // What `runs` counts where it is not runs: "keys" for a number pooled
  // over every key typed.
  readonly of?: string;
  // "p95" where the bar is the 95th percentile, not the median: a
  // median of every key would hide the slow ones.
  readonly stat?: string;
  readonly placeholder?: boolean;
}

// The frameworks of one kind ("native" or "web"), or of both ("all"),
// as one metric measured them: on a scale of their own, with how and by
// what command. Native and web apps share a group only where they were
// measured the same way.
export interface Group {
  readonly kind: string;
  readonly how: string;
  readonly command: string;
}

export interface Metric {
  readonly id: string;
  readonly label: string;
  readonly unit: string;
  // Counted once (a size, lines of code), not timed over runs.
  readonly counted?: boolean;
  // The least step of it that matters: its axis runs at least this far,
  // so spreads below it (a hundredth of a percent of idle CPU) are not
  // drawn across the chart.
  readonly floor?: number;
  readonly groups: readonly Group[];
  // By framework id; a framework with no number of it has none here.
  // A timed metric has none: its numbers are each renderer set's own.
  readonly values?: Values;
  // A timed metric's numbers, by renderer set and then framework id.
  readonly sets?: { readonly [set: string]: Values };
  // Firefox's, which ran beside the sets, not in them.
  readonly firefox?: Values;
}

export interface Values {
  readonly [id: string]: Value;
}

// A metric as one renderer set measured it, the numbers that set's
// alone: what the charts and the table draw.
export interface Measured extends Metric {
  readonly values: Values;
}

// Lines of one framework's inbox, cut and coloured by the build. The
// build ships the code as written only where it cannot be read back out
// of its colouring (codeOf): the page would carry every excerpt twice.
export interface Excerpt {
  readonly file: string;
  readonly lines: string;
  readonly lang: string;
  readonly code?: string;
  readonly rich: string;
  readonly href?: string;
  readonly placeholder?: boolean;
  // What it shows, where a fan's section shows it (the fact sheet's
  // heading of that excerpt).
  readonly caption?: string;
}

export interface Feature {
  readonly id: string;
  readonly label: string;
  readonly about: string;
  readonly excerpts: { readonly [id: string]: Excerpt };
}

export interface App {
  readonly name: string;
  readonly about: string;
}

// What the page says first: that the bias is the point.
export interface Intro {
  readonly placeholder?: boolean;
  readonly text: string;
}

// The published apps, at the commit the review measured: every app's
// whole code, its data and the scripts that measured it.
export interface Repo {
  readonly href: string;
  readonly sha: string;
}

export interface Review {
  readonly intro: Intro;
  readonly repo: Repo;
  readonly app: App;
  readonly picked: readonly string[];
  readonly frameworks: readonly Framework[];
  readonly features: readonly Feature[];
  readonly metrics: readonly Metric[];
  // In the order the page offers them, the first its default.
  readonly sets?: readonly RendererSet[];
  readonly firefox?: Web | null;
}

// A bar of a chart: a picked framework's value of one metric.
export interface Bar {
  readonly id: string;
  readonly name: string;
  readonly value: Value;
}

// What one framework's excerpt of a feature shows, under its name.
export interface Shown {
  readonly id: string;
  readonly name: string;
  readonly where: string;
  readonly excerpt: Excerpt;
}

// A row of the picker: the frameworks of one kind, under its label.
export interface Kind {
  readonly kind: string;
  readonly label: string;
}

// A tab of the code's row, as far as the arrows move the focus to it.
export interface Focusable {
  forceActiveFocus(reason: number): void;
}

export function isFocusable(item: unknown): item is Focusable {
  return typeof item === "object" && item !== null && "forceActiveFocus" in item && typeof item.forceActiveFocus === "function";
}

// The fewest frameworks a comparison holds.
export const FEWEST = 2;

function isReview(value: unknown): value is Review {
  return typeof value === "object" && value !== null && "intro" in value && "frameworks" in value && "features" in value && "metrics" in value && "picked" in value;
}

// The review the build carries (ReviewBuilt.data, parsed from
// Review/review.json), as the page reads it.
export function reviewOf(data: unknown): Review {
  if (!isReview(data)) throw new Error("ReviewBuilt.data is not the framework review");
  return data;
}

// A list of ids the page can hold and change, out of one it may only
// read.
function copied(ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of ids) out.push(id);
  return out;
}

export function nameOf(review: Review, id: string): string {
  const one = review.frameworks.find((framework) => framework.id === id);
  return one !== undefined ? one.name : id;
}

// Whether pressing a framework would leave fewer than two compared: a
// press that would is not taken.
export function stays(picked: readonly string[], id: string): boolean {
  return picked.length <= FEWEST && picked.includes(id);
}

// The picked frameworks after a press on one: put back if it was
// picked, else added after the rest, so what was picked first stays
// first. Never fewer than two.
export function toggled(picked: readonly string[], id: string): string[] {
  if (stays(picked, id)) return copied(picked);
  const out: string[] = [];
  for (const one of picked) if (one !== id) out.push(one);
  if (!picked.includes(id)) out.push(id);
  return out;
}

// A metric's bars: one per picked framework it has a number of, in the
// order they were picked.
export function barsOf(review: Review, metric: Measured, picked: readonly string[]): Bar[] {
  const bars: Bar[] = [];
  for (const id of picked) {
    const value = metric.values[id];
    if (value !== undefined) bars.push({ id, name: nameOf(review, id), value });
  }
  return bars;
}

// The bars of one group of a metric: the picked frameworks of its kind.
export function barsIn(review: Review, metric: Measured, group: Group, picked: readonly string[]): Bar[] {
  return barsOf(
    review,
    metric,
    picked.filter((id) => group.kind === "all" || kindOf(review, id) === group.kind),
  );
}

// How many of a metric's groups hold a picked framework: a chart split
// by kind draws only those, and says its scales differ only where it
// draws two.
export function groupsHeld(review: Review, metric: Measured, picked: readonly string[]): number {
  let held = 0;
  for (const group of metric.groups) if (barsIn(review, metric, group, picked).length > 0) held += 1;
  return held;
}

// Whether a framework of a group's kind is picked: a timed chart draws
// that group in every set, with how the set ran it, bars or none.
export function holds(review: Review, group: Group, picked: readonly string[]): boolean {
  return picked.some((id) => group.kind === "all" || kindOf(review, id) === group.kind);
}

export function kindOf(review: Review, id: string): string {
  const one = review.frameworks.find((framework) => framework.id === id);
  return one !== undefined ? one.kind : "";
}

// The one kind a metric measures ("native" or "web"), or "" where it
// measures both.
export function onlyKind(metric: Metric): string {
  const first = metric.groups[0];
  return metric.groups.length === 1 && first !== undefined && first.kind !== "all" ? first.kind : "";
}

// A group's list of bars, as a screen reader names it: the metric, the
// kind where it has a group of its own, and the unit.
export function groupName(metric: Metric, group: Group): string {
  return group.kind === "all" ? `${metric.label}, ${metric.unit}` : `${metric.label}, ${group.kind} apps, ${metric.unit}`;
}

// The picked frameworks a metric has no number of, by name.
export function unmeasured(review: Review, metric: Measured, picked: readonly string[]): string[] {
  const names: string[] = [];
  for (const id of picked) if (metric.values[id] === undefined) names.push(nameOf(review, id));
  return names;
}

// The length a chart's axis runs to: the longest whisker of its bars, so
// every bar and its spread fit, and never short of the metric's floor.
export function reach(bars: readonly Bar[], floor: number = 0): number {
  let most = floor;
  for (const bar of bars) most = Math.max(most, bar.value.max);
  return most > 0 ? most : 1;
}

// A number with its unit, as the bar and its name say it.
export function said(value: number, unit: string): string {
  return unit === "%" ? `${value}%` : `${value} ${unit}`;
}

// A bar's name for a screen reader, the framework first: "Slint: 80 ms".
export function barName(bar: Bar, unit: string): string {
  const stat = bar.value.stat === undefined ? "" : ` ${bar.value.stat}`;
  return `${bar.name}: ${said(bar.value.median, unit)}${stat}`;
}

// The spread of a value and how many runs it is: "74–88, 5 runs", or
// "1 run" alone for a number counted once (a size, lines of code).
export function spread(value: Value): string {
  if (value.placeholder === true) return `${value.min}–${value.max}, placeholder`;
  const of = value.of ?? "runs";
  const runs = value.runs === 1 ? `1 ${of.replace(/s$/u, "")}` : `${value.runs} ${of}`;
  return value.min === value.max ? runs : `${value.min}–${value.max}, ${runs}`;
}

// A cell of the table: the median (or the statistic it is, named), then
// its spread and runs.
export function cell(value: Value | undefined): string {
  if (value === undefined) return "—";
  const stat = value.stat === undefined ? "" : ` ${value.stat}`;
  return `${value.median}${stat} (${spread(value)})`;
}

// The renderer set the page shows first.
export function firstSet(review: Review): string {
  return review.sets?.[0]?.id ?? "";
}

// No set: the page's data before it has any.
const NO_SET: RendererSet = { id: "", label: "", native: null, web: null };

export function setOf(review: Review, id: string): RendererSet {
  return review.sets?.find((one) => one.id === id) ?? review.sets?.[0] ?? NO_SET;
}

// Whether a metric is timed in renderer sets (startup, memory), not
// counted once (a size, lines of code).
export function timed(metric: Metric): boolean {
  return metric.sets !== undefined;
}

// The numbers the page's first load leaves out (scripts/build.mjs): the
// sets after the first and Firefox's, by metric, which the page imports
// once a reader picks another set or opens the table (Site/later.js).
export interface Later {
  readonly loaded: boolean;
  readonly sets: Readonly<Record<string, Readonly<Record<string, Values>>>>;
  readonly firefox: Readonly<Record<string, Values>>;
  readonly prose: Readonly<Record<string, Prose>>;
}

const NOT_YET: Later = { loaded: false, sets: {}, firefox: {}, prose: {} };

export function notYet(): Later {
  return NOT_YET;
}

export function laterOf(data: unknown): Later {
  if (typeof data !== "object" || data === null) throw new Error("review-later.json is not the review's later numbers");
  const { sets, firefox, prose } = data as { sets?: unknown; firefox?: unknown; prose?: unknown };
  if (typeof sets !== "object" || sets === null || typeof firefox !== "object" || firefox === null || typeof prose !== "object" || prose === null)
    throw new Error("review-later.json has no sets, firefox or prose");
  return { loaded: true, sets: sets as Later["sets"], firefox: firefox as Later["firefox"], prose: prose as Later["prose"] };
}

// Whether a framework's words are still to come.
export function wordsLater(review: Review, ids: readonly string[], later: Later): boolean {
  return !later.loaded && ids.some((id) => byId(review, id).prose.later === true);
}

// A framework as its section shows it: with its words, once they are in.
export function framed(review: Review, id: string, later: Later): Framework {
  const one = byId(review, id);
  const prose = one.prose.later === true ? later.prose[id] : undefined;
  return prose === undefined ? one : { ...one, prose };
}

// The set the charts show: the one chosen, once its numbers are in.
// Until then the first stays, rather than a set drawn as unmeasured.
export function shownSet(review: Review, set: string, later: Later): string {
  return later.loaded ? set : firstSet(review);
}

// A metric as a renderer set measured it. A set that has no number of a
// framework leaves it out: no other set's number stands in.
export function inSet(metric: Metric, set: string, later: Later = NOT_YET): Measured {
  const values = metric.sets === undefined ? (metric.values ?? {}) : (metric.sets[set] ?? later.sets[metric.id]?.[set] ?? {});
  return { ...metric, values };
}

// A metric as Firefox measured it, beside the sets: a count (a size,
// lines of code) is the same in any browser.
export function inFirefox(metric: Metric, later: Later = NOT_YET): Measured {
  return { ...metric, values: metric.sets === undefined ? (metric.values ?? {}) : (metric.firefox ?? later.firefox[metric.id] ?? {}) };
}

// The picked web frameworks Firefox has a number of: the table gives
// each a row of its own.
export function firefoxPicked(review: Review, picked: readonly string[], later: Later = NOT_YET): string[] {
  if (review.firefox == null) return [];
  const ids: string[] = [];
  for (const id of picked) {
    if (kindOf(review, id) === "web" && review.metrics.some((metric) => (metric.firefox ?? later.firefox[metric.id])?.[id] !== undefined)) ids.push(id);
  }
  return ids;
}

// A row of the table: a picked framework in the shown set, or a picked
// web framework in Firefox, after them.
export interface Line {
  readonly id: string;
  readonly name: string;
  readonly firefox: boolean;
}

export function linesOf(review: Review, picked: readonly string[], later: Later = NOT_YET): Line[] {
  const lines: Line[] = [];
  for (const id of picked) lines.push({ id, name: nameOf(review, id), firefox: false });
  for (const id of firefoxPicked(review, picked, later)) lines.push({ id, name: `${nameOf(review, id)}, Firefox`, firefox: true });
  return lines;
}

export function lineCell(metric: Metric, line: Line, set: string, later: Later = NOT_YET): string {
  return cell((line.firefox ? inFirefox(metric, later) : inSet(metric, set, later)).values[line.id]);
}

// A table row's cells, as a screen reader reads them.
export function lineName(review: Review, line: Line, set: string, later: Later = NOT_YET): string {
  const cells: string[] = [line.name];
  for (const metric of review.metrics) cells.push(lineCell(metric, line, set, later));
  return cells.join(" ");
}

// How a renderer set ran one kind of app, said under each chart of it:
// what drew, what every app shared, how many runs, how busy the machine
// was, and on what.
export function conditions(review: Review, set: string, kind: string): string {
  const one = setOf(review, set);
  if (kind === "web") {
    const web = one.web;
    if (web === null) return `${one.label}: the web apps have not run in this set yet.`;
    const seen = web.seen === null ? "" : `, WebGL renderer ${web.seen}`;
    const version = web.version === null ? "" : ` ${web.version}`;
    const runs = web.runs === null ? "" : ` ${web.runs} runs of each app.`;
    return `${one.label}: ${web.browser}${version}, ${web.renderer ?? "its default renderer"}${seen}.${runs}`;
  }
  const native = one.native;
  if (native === null) return `${one.label}: the native apps have not run in this set yet.`;
  const runs = native.runs === null ? "" : ` ${native.runs} runs of each app`;
  const load = native.load === null ? "" : `, load average ${native.load}`;
  const machine = native.machine === null ? "" : `, on ${native.machine}`;
  const date = native.date === null ? "" : `, ${native.date}`;
  return `${one.label}: ${native.renderer}. Every app ran with ${native.env}.${runs}${load}${machine}${date}.`;
}

// Firefox's run, said under the table.
export function firefoxConditions(review: Review): string {
  const web = review.firefox;
  if (web == null) return "";
  const version = web.version === null ? "" : ` ${web.version}`;
  const runs = web.runs === null ? "" : ` ${web.runs} runs of each app.`;
  return `Firefox${version} ran the web apps beside the sets, on ${web.renderer ?? "its default renderer"}.${runs} Its numbers are rows of the table.`;
}

// An entry's picture, lazy so a reader fetches only what they scroll to
// and only in the scheme the page shows: an <img> in rich text stands in
// the page's HTML as written, so a reader without script has it too.
export function shotOf(one: Framework, dark: boolean, width: number): string {
  const shots = one.screenshot;
  if (shots === undefined || width <= 0) return "";
  const src = dark ? shots.dark : shots.light;
  const alt = `${one.name}: the inbox app, ${dark ? "dark" : "light"}`.replace(/&/gu, "&amp;").replace(/"/gu, "&quot;").replace(/</gu, "&lt;");
  return `<img loading="lazy" decoding="async" src="${src}" width="${width}" height="${Math.round((width * 800) / 1280)}" alt="${alt}">`;
}

// The names of an entry's pairs, the same framework of the other kind.
export function pairNames(review: Review, one: Framework): string {
  return (one.pair ?? []).map((id) => nameOf(review, id)).join(", ");
}

// Whether any number, excerpt or section is still a placeholder.
export function anyPlaceholder(review: Review): boolean {
  return (
    review.intro.placeholder === true ||
    review.metrics.some((metric: Metric) => review.frameworks.some((one: Framework) => metric.values?.[one.id]?.placeholder === true)) ||
    review.features.some((feature: Feature) => review.frameworks.some((one: Framework) => feature.excerpts[one.id]?.placeholder === true)) ||
    review.frameworks.some((one: Framework) => one.prose.placeholder === true || one.prose.shows.some((excerpt: Excerpt) => excerpt.placeholder === true))
  );
}

// No feature: what the code section shows before the data has any.
const NO_FEATURE: Feature = { id: "", label: "", about: "", excerpts: {} };

// The feature of an id, or the first where none has it.
export function featureOf(review: Review, id: string): Feature {
  return review.features.find((one) => one.id === id) ?? review.features[0] ?? NO_FEATURE;
}

// Where an excerpt is published, or "" where it is not.
export function hrefOf(excerpt: Excerpt): string {
  return excerpt.href ?? "";
}

// What a feature shows for the picked frameworks: each one's excerpt,
// in the order they were picked.
export function shownOf(review: Review, feature: Feature, picked: readonly string[]): Shown[] {
  const shown: Shown[] = [];
  for (const id of picked) {
    const excerpt = feature.excerpts[id];
    if (excerpt !== undefined) shown.push({ id, name: nameOf(review, id), where: `${excerpt.file}:${excerpt.lines}`, excerpt });
  }
  return shown;
}

// An excerpt's code as written, read out of its colouring where the
// build shipped no copy: a packed string (ljos-web/codeblock/rich) is
// escaped code with `<` and a letter where a token starts and `>` where
// it ends, and any other is the highlighter's markup. The build ships
// the code itself wherever this would not give it back exactly
// (scripts/build.mjs, plainOf).
export function codeOf(excerpt: Excerpt): string {
  if (excerpt.code !== undefined) return excerpt.code;
  const rich = excerpt.rich;
  const escaped = rich.startsWith("") ? rich.slice(1).replace(/<[a-z]|>/gu, "") : rich.replace(/<[^>]*>/gu, "");
  // The highlighter escapes these five alone; `&` is undone last, so
  // `&amp;lt;` stays `&lt;`.
  return escaped.replace(/&lt;/gu, "<").replace(/&gt;/gu, ">").replace(/&quot;/gu, '"').replace(/&#39;/gu, "'").replace(/&amp;/gu, "&");
}

// The picked frameworks in the data's order, as the fans' sections
// stand: a section keeps its place as others are picked and put back.
export function inOrder(review: Review, picked: readonly string[]): string[] {
  const ids: string[] = [];
  for (const one of review.frameworks) if (picked.includes(one.id)) ids.push(one.id);
  return ids;
}

export function byId(review: Review, id: string): Framework {
  const one = review.frameworks.find((framework) => framework.id === id);
  if (one === undefined) throw new Error(`no framework ${id} in the review`);
  return one;
}

export function ofKind(review: Review, kind: string): Framework[] {
  const all: Framework[] = [];
  for (const one of review.frameworks) if (one.kind === kind) all.push(one);
  return all;
}

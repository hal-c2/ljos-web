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
  readonly values: { readonly [id: string]: Value };
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

export interface Review {
  readonly intro: Intro;
  readonly app: App;
  readonly picked: readonly string[];
  readonly frameworks: readonly Framework[];
  readonly features: readonly Feature[];
  readonly metrics: readonly Metric[];
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
export function barsOf(review: Review, metric: Metric, picked: readonly string[]): Bar[] {
  const bars: Bar[] = [];
  for (const id of picked) {
    const value = metric.values[id];
    if (value !== undefined) bars.push({ id, name: nameOf(review, id), value });
  }
  return bars;
}

// The bars of one group of a metric: the picked frameworks of its kind.
export function barsIn(review: Review, metric: Metric, group: Group, picked: readonly string[]): Bar[] {
  return barsOf(
    review,
    metric,
    picked.filter((id) => group.kind === "all" || kindOf(review, id) === group.kind),
  );
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
export function unmeasured(review: Review, metric: Metric, picked: readonly string[]): string[] {
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

// A table row's cells for one framework, as a screen reader reads them.
export function rowName(review: Review, id: string): string {
  const cells: string[] = [nameOf(review, id)];
  for (const metric of review.metrics) cells.push(cell(metric.values[id]));
  return cells.join(" ");
}

// Whether any number, excerpt or section is still a placeholder.
export function anyPlaceholder(review: Review): boolean {
  return (
    review.intro.placeholder === true ||
    review.metrics.some((metric: Metric) => review.frameworks.some((one: Framework) => metric.values[one.id]?.placeholder === true)) ||
    review.features.some((feature: Feature) => review.frameworks.some((one: Framework) => feature.excerpts[one.id]?.placeholder === true)) ||
    review.frameworks.some((one: Framework) => one.prose.placeholder === true)
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

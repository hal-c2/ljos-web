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
  readonly median: number;
  readonly min: number;
  readonly max: number;
  readonly runs: number;
  readonly placeholder?: boolean;
}

export interface Metric {
  readonly id: string;
  readonly label: string;
  readonly unit: string;
  readonly how: string;
  readonly command: string;
  // Measured for one kind of framework only ("native" or "web").
  readonly only?: string;
  readonly values: { readonly [id: string]: Value | null };
}

// Lines of one framework's inbox, cut and coloured by the build.
export interface Excerpt {
  readonly file: string;
  readonly lines: string;
  readonly lang: string;
  readonly code: string;
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

// The fewest frameworks a comparison holds.
export const FEWEST = 2;

export function nameOf(review: Review, id: string): string {
  const one = review.frameworks.find((framework) => framework.id === id);
  return one ? one.name : id;
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
  if (stays(picked, id)) return picked.slice();
  return picked.includes(id) ? picked.filter((one) => one !== id) : picked.concat([id]);
}

// A metric's bars: one per picked framework it has a number of, in the
// order they were picked.
export function barsOf(review: Review, metric: Metric, picked: readonly string[]): Bar[] {
  const bars: Bar[] = [];
  for (const id of picked) {
    const value = metric.values[id];
    if (value != null) bars.push({ id, name: nameOf(review, id), value });
  }
  return bars;
}

// The picked frameworks a metric has no number of, by name.
export function unmeasured(review: Review, metric: Metric, picked: readonly string[]): string[] {
  return picked.filter((id) => metric.values[id] == null).map((id) => nameOf(review, id));
}

// The length a chart's axis runs to: the longest whisker of its bars, so
// every bar and its spread fit.
export function reach(bars: readonly Bar[]): number {
  let most = 0;
  for (const bar of bars) most = Math.max(most, bar.value.max);
  return most > 0 ? most : 1;
}

// A number with its unit, as the bar and its name say it.
export function said(value: number, unit: string): string {
  return unit === "%" ? `${value}%` : `${value} ${unit}`;
}

// A bar's name for a screen reader, the framework first: "Slint: 80 ms".
export function barName(bar: Bar, unit: string): string {
  return `${bar.name}: ${said(bar.value.median, unit)}`;
}

// The spread of a value and how many runs it is: "74–88, 5 runs".
export function spread(value: Value): string {
  const runs = value.runs === 1 ? "1 run" : `${value.runs} runs`;
  return `${value.min}–${value.max}, ${value.placeholder ? "placeholder" : runs}`;
}

// A cell of the table: the median, then its spread and runs.
export function cell(value: Value | null): string {
  return value == null ? "—" : `${value.median} (${spread(value)})`;
}

// Whether any number, excerpt or section is still a placeholder.
export function anyPlaceholder(review: Review): boolean {
  return (
    review.intro.placeholder === true ||
    review.metrics.some((metric) => Object.keys(metric.values).some((id) => metric.values[id]?.placeholder === true)) ||
    review.features.some((feature) => Object.keys(feature.excerpts).some((id) => feature.excerpts[id].placeholder === true)) ||
    review.frameworks.some((one) => one.prose.placeholder === true)
  );
}

// What a feature shows for the picked frameworks: each one's excerpt,
// in the order they were picked.
export function shownOf(review: Review, feature: Feature | undefined, picked: readonly string[]): Shown[] {
  if (feature === undefined) return [];
  const shown: Shown[] = [];
  for (const id of picked) {
    const excerpt = feature.excerpts[id];
    if (excerpt !== undefined) shown.push({ id, name: nameOf(review, id), where: `${excerpt.file}:${excerpt.lines}`, excerpt });
  }
  return shown;
}

export function ofKind(review: Review, kind: string): Framework[] {
  return review.frameworks.filter((one) => one.kind === kind);
}

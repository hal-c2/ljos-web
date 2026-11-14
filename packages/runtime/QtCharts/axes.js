// The axes of a chart: how much room each asks for beside the plot, where its
// ticks are, and what is drawn of it. The numbers are Qt's, taken from
// ChartValueAxisX/Y, ChartBarCategoryAxisX and Horizontal/VerticalAxis.
import { defineType, derived, QtObject, settle, slot } from "../object.ts";
import { colorValue, css } from "../QtQuick/color.js";
import { describe } from "../QtQuick/font.js";
import { fontNamed, label, line, tall, truncated, wide } from "./plot.js";

export const HORIZONTAL = 1;
export const VERTICAL = 2;
export const LEFT = 1;
export const RIGHT = 2;
export const TOP = 32;
export const BOTTOM = 64;

// Between an axis and its labels, and how long a tick is.
const PADDING = 4;

// An axis is black until a chart has it, and then of the chart's theme.
const themed = (colour) => derived((self) => (self.orientation ? colour : "#000000"));

export const AbstractAxis = defineType("AbstractAxis", QtObject, {
  properties: {
    visible: true,
    lineVisible: true,
    color: themed("#d6d6d6"),
    labelsVisible: true,
    labelsColor: themed("#404044"),
    labelsFont: fontNamed("labelsFont"),
    gridVisible: true,
    gridLineColor: themed("#e2e2e2"),
    truncateLabels: true,
    // Where the chart put it: none until one has.
    orientation: 0,
    alignment: 0,
  },
  resolve: { color: colorValue, labelsColor: colorValue, gridLineColor: colorValue },
});

// How many digits follow the point: enough to tell two ticks apart.
function digits(low, high, ticks) {
  if (ticks > 1) {
    const gap = -Math.floor(Math.log10((high - low) / (ticks - 1)));
    if (gap > 0) return gap + 1;
  }
  return 1;
}

// The first tick of an axis whose ticks are an interval apart.
const first = (anchor, low, interval) => anchor - Math.floor((anchor - low) / interval) * interval;

// What the ticks of a value axis say: createValueLabels.
function values(axis, ticks) {
  const low = axis.min;
  const high = axis.max;
  const texts = [];
  if (!(high > low) || ticks < 1) return texts;
  const precision = digits(low, high, ticks);
  if (axis.tickType === ValueAxis.TicksFixed) {
    for (let i = 0; i < ticks; i++) texts.push((low + (i * (high - low)) / (ticks - 1)).toFixed(precision));
    return texts;
  }
  const interval = axis.tickInterval;
  if (!(interval > 0)) return texts;
  for (let value = first(axis.tickAnchor, low, interval); value <= high; value += interval) texts.push(value.toFixed(precision));
  return texts;
}

export const ValueAxis = defineType("ValueAxis", AbstractAxis, {
  properties: {
    min: 0,
    max: 0,
    tickCount: 5,
    tickType: 1,
    tickAnchor: 0,
    tickInterval: 0,
  },
  enums: { TicksDynamic: 0, TicksFixed: 1 },
  // Qt takes no count under two, and keeps what it had: here, the default.
  resolve: { tickCount: (self, own) => (own() >= 2 ? Math.floor(own()) : 5) },
  methods: {
    $range() {
      return [this.min, this.max];
    },
    // Where the ticks are along an axis that begins at `origin` and is
    // `length` long: to the right, or up when the length is negative.
    $points(origin, length) {
      const points = [];
      const low = this.min;
      const high = this.max;
      if (!(high > low)) return points;
      if (this.tickType === ValueAxis.TicksFixed) {
        const count = this.tickCount;
        const delta = length / (count - 1);
        for (let i = 0; i < count; i++) points.push(i * delta + origin);
        return points;
      }
      const interval = this.tickInterval;
      if (!(interval > 0)) return points;
      const delta = length / (high - low);
      for (let value = first(this.tickAnchor, low, interval); value <= high; value += interval) points.push((value - low) * delta + origin);
      return points;
    },
    $labels(points) {
      return values(this, points.length);
    },
    // The room it would like and the least it takes, as widths and heights.
    // Along the axis that is how far its labels reach past its ends.
    $hint(spec) {
      const upright = this.orientation === VERTICAL;
      if (!this.labelsVisible) return upright ? [2, 0, 1, 0] : [0, 1, 0, 1];
      const texts = values(this, this.tickCount);
      const dots = wide(spec, "...");
      const high = tall(spec);
      const some = texts.length > 0;
      if (upright) {
        let widest = 0;
        for (const text of texts) widest = Math.max(widest, wide(spec, text));
        return [widest + PADDING + 2, some ? high / 2 : 0, dots + PADDING + 1, high / 2];
      }
      const ends = some ? Math.max(wide(spec, texts[0]), wide(spec, texts[texts.length - 1])) : 0;
      return [ends / 2, (some ? high : 0) + PADDING + 1, dots / 2, high + PADDING + 1];
    },
  },
});

const NONE = Object.freeze([]);

// Qt keeps one of each name. The list it was given is looked through once.
export function distinct(self, own) {
  const given = own() ?? NONE;
  if (self.$given !== given) {
    self.$given = given;
    self.$names = [...new Set(Array.from(given, String))];
  }
  return self.$names;
}

export const BarCategoryAxis = defineType("BarCategoryAxis", AbstractAxis, {
  properties: {
    categories: NONE,
    // The first and the last category shown.
    min: derived((self) => self.categories[0] ?? ""),
    max: derived((self) => self.categories.at(-1) ?? ""),
    count: derived((self) => self.categories.length),
  },
  resolve: { categories: distinct },
  methods: {
    clear() {
      slot(this, "categories").write(NONE);
      settle();
    },
    // A category is one wide and its number is in its middle.
    $range() {
      const names = this.categories;
      if (names.length === 0) return [0, 0];
      const low = names.indexOf(this.min);
      const high = names.indexOf(this.max);
      return [(low < 0 ? 0 : low) - 0.5, (high < 0 ? names.length - 1 : high) + 0.5];
    },
    // The ticks are between the categories, and one is past the last.
    $points(origin, length) {
      const points = [];
      const [low, high] = this.$range();
      const range = high - low;
      const delta = length / range;
      const count = Math.floor(range);
      if (!(delta >= 2) || count < 1) return points;
      const offset = (Math.round(low + 0.5) - (low + 0.5)) * delta;
      for (let i = 0; i < count + 2; i++) points.push(offset + i * delta + origin);
      return points;
    },
    // Each tick's label is the category that begins there.
    $labels(points, grid) {
      const names = this.categories;
      const [low, high] = this.$range();
      const d = (high - low) / grid.width;
      const texts = [];
      for (let i = 0; i < points.length - 1; i++) {
        const x = Math.floor(((points[i] + points[i + 1]) / 2 - grid.left) * d + low + 0.5);
        texts.push(x < high && x >= 0 && x < names.length ? names[x] : "");
      }
      texts.push("");
      return texts;
    },
    $hint(spec) {
      if (!this.labelsVisible) return [0, 1, 0, 1];
      const high = tall(spec);
      return [0, (this.categories.length ? high : 0) + PADDING + 1, 0, high + PADDING + 1];
    },
  },
});

// A label as it is or cut short, and how much room it takes.
function fitted(axis, spec, text, width, height) {
  if (axis.truncateLabels) return truncated(spec, text, width, height);
  return { text, width: wide(spec, text), height: tall(spec) };
}

// An axis beside the plot: its line along the plot's edge, a tick and a
// grid line for each value that is in the plot, and the labels that fit
// above one another. VerticalAxis::updateGeometry.
function upright(axis, rect, grid, smooth, into) {
  const points = axis.$points(grid.bottom, -grid.height);
  if (points.length === 0) return;
  const texts = axis.$labels(points, grid);
  const left = axis.alignment === LEFT;
  const edge = left ? rect.right : rect.left;
  const pen = axis.lineVisible ? css(axis.color) : null;
  const rule = axis.gridVisible ? css(axis.gridLineColor) : null;
  const ink = axis.labelsVisible ? css(axis.labelsColor) : null;
  const spec = describe(axis.labelsFont);
  if (pen) into.lines.push(line(edge, grid.top, edge, grid.bottom, pen, smooth));
  let limit = rect.bottom;
  for (let i = 0; i < points.length; i++) {
    const at = points[i];
    if (at >= grid.top && at <= grid.bottom) {
      if (rule) into.grid.push(line(grid.left, at, grid.right, at, rule, smooth));
      if (pen) into.lines.push(left ? line(edge - PADDING, at, edge, at, pen, smooth) : line(edge, at, edge + PADDING, at, pen, smooth));
    }
    const text = texts[i];
    if (!ink || !text) continue;
    const fit = fitted(axis, spec, text, rect.width, rect.height / points.length - 2 * PADDING);
    const x = Math.round(left ? edge - fit.width - PADDING : edge + PADDING);
    const y = Math.round(at - fit.height / 2);
    // One that would lie over the one below it, or outside, is left out.
    if (y + fit.height > limit || y - 1 > rect.bottom || y < rect.top - 1) continue;
    limit = y;
    into.labels.push(label(fit.text, x, y, spec, ink));
  }
}

// An axis under or over the plot. The labels of one with categories are
// between its ticks. HorizontalAxis::updateGeometry.
function level(axis, rect, grid, smooth, into) {
  const points = axis.$points(grid.left, grid.width);
  if (points.length === 0) return;
  const texts = axis.$labels(points, grid);
  const between = axis.$type.chain.includes(BarCategoryAxis);
  const under = axis.alignment === BOTTOM;
  const edge = under ? rect.top : rect.bottom;
  const pen = axis.lineVisible ? css(axis.color) : null;
  const rule = axis.gridVisible ? css(axis.gridLineColor) : null;
  const ink = axis.labelsVisible ? css(axis.labelsColor) : null;
  const spec = describe(axis.labelsFont);
  if (pen) into.lines.push(line(grid.left, edge, grid.right, edge, pen, smooth));
  let past = 0;
  for (let i = 0; i < points.length; i++) {
    const at = points[i];
    if (at >= grid.left && at <= grid.right) {
      if (rule) into.grid.push(line(at, grid.top, at, grid.bottom, rule, smooth));
      if (pen) into.lines.push(line(at, edge, at, under ? edge + PADDING : edge - PADDING, pen, smooth));
    }
    const text = texts[i];
    if (!ink || !text) continue;
    const fit = fitted(axis, spec, text, rect.width / points.length - 2 * PADDING, rect.height - PADDING);
    let x = at - fit.width / 2;
    if (between && i + 1 !== points.length) {
      const from = Math.max(at, grid.left);
      const to = Math.min(points[i + 1], grid.right);
      const room = to - from;
      // What is left of a category at the plot's edge has no room for it.
      if (room < fit.width && (from === grid.left || to === grid.right)) continue;
      x = from + room / 2 - fit.width / 2;
    }
    x = Math.round(x);
    const y = Math.round(under ? edge + PADDING : edge - fit.height - PADDING);
    if ((x < past && fit.text === "...") || x < rect.left - 1 || x - 1 > rect.right) continue;
    past = fit.width + x;
    into.labels.push(label(fit.text, x, y, spec, ink));
  }
  if (between && rule) {
    into.grid.push(line(grid.left, grid.top, grid.left, grid.bottom, rule, smooth));
    into.grid.push(line(grid.right, grid.top, grid.right, grid.bottom, rule, smooth));
  }
}

// Adds what is drawn of an axis that has `rect` beside the plot `grid` to
// the lists of `into`: its grid, its line and ticks, its labels.
export function scaled(axis, rect, grid, smooth, into) {
  if (axis.orientation === VERTICAL) upright(axis, rect, grid, smooth, into);
  else level(axis, rect, grid, smooth, into);
}

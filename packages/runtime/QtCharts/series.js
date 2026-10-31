// What a chart shows: bars in sets, and lines through points. A series
// keeps its numbers and says what is drawn of them between its two axes;
// the chart gives it the axes, the colours of its theme and a place.
import { runWithOwner } from "solid-js";
import { contents, defineType, derived, QtObject, settle, slot, whenComplete } from "../object.js";
import { color, colorValue, css, equal, hsva, rgba } from "../QtQuick/color.js";
import { Point } from "../QtQml/values.js";
import { apart, box, curved, stroke } from "./plot.js";
import { untrack } from "#kernel";

const next = (version) => version + 1;
const NONE = Object.freeze([]);
const BLACK = "#000000";

const is = (object, Type) => object?.$type?.chain.includes(Type) === true;

// The light theme's colours, which series take in turn.
const COLOURS = ["#209fdf", "#99ca53", "#f6a625", "#6d5fd5", "#bf593e"];

// Each has a gradient from white through itself to a dark one of its hue,
// from which the sets past the fifth take theirs: ChartThemeManager::colorAt.
function shade(index, at) {
  const base = color(COLOURS[index]);
  if (at === 0.5) return base;
  const dark = hsva(base.hsvHue, base.hsvSaturation, 0.25);
  if (at === 1) return dark;
  const from = at < 0.5 ? color("#ffffff") : base;
  const to = at < 0.5 ? base : dark;
  const t = (at < 0.5 ? at : at - 0.5) / 0.5;
  return rgba(from.r * (1 - t) + to.r * t, from.g * (1 - t) + to.g * t, from.b * (1 - t) + to.b * t);
}

const SERIES = {
  SeriesTypeLine: 0,
  SeriesTypeArea: 1,
  SeriesTypeBar: 2,
  SeriesTypeStackedBar: 3,
  SeriesTypePercentBar: 4,
  SeriesTypePie: 5,
  SeriesTypeScatter: 6,
  SeriesTypeSpline: 7,
  SeriesTypeHorizontalBar: 8,
  SeriesTypeHorizontalStackedBar: 9,
  SeriesTypeHorizontalPercentBar: 10,
  SeriesTypeBoxPlot: 11,
  SeriesTypeCandlestick: 12,
};

export const AbstractSeries = defineType("AbstractSeries", QtObject, {
  properties: {
    name: "",
    visible: true,
    opacity: 1,
  },
  enums: SERIES,
});

// What a series' numbers are measured against: its axes' ranges, as so many
// pixels to one. Nothing when either axis has no range.
function scale(series, plot) {
  const [left, right] = series.$across.$range();
  const [low, high] = series.$up.$range();
  if (!(right > left) || !(high > low)) return null;
  return { left, low, dx: plot.width / (right - left), dy: plot.height / (high - low) };
}

export const BarSet = defineType("BarSet", QtObject, {
  properties: {
    label: "",
    // Black until a chart has the set, whose theme colours what was not given.
    color: BLACK,
    borderColor: BLACK,
    borderWidth: 1,
    values: NONE,
    count: derived((self) => self.values.length),
  },
  resolve: { color: colorValue, borderColor: colorValue },
  methods: {
    at(index) {
      return untrack(() => this.values)[index] ?? 0;
    },
    append(value) {
      slot(this, "values").write([...untrack(() => this.values), ...(Array.isArray(value) ? value : [value])]);
      settle();
    },
    remove(index, count = 1) {
      const values = untrack(() => this.values);
      if (index < 0 || index >= values.length) return;
      slot(this, "values").write(values.filter((_, at) => at < index || at >= index + count));
      settle();
    },
    replace(index, value) {
      const values = untrack(() => this.values);
      if (index < 0 || index >= values.length) return;
      slot(this, "values").write(values.with(index, value));
      settle();
    },
  },
});

// The theme colours a set that was given no colour, and outlines in white
// one whose outline is as it was made: a pixel wide and black. Once: a set
// keeps the colour it has when sets come and go.
function tint(set, fill) {
  if (set.$themed) return;
  set.$themed = true;
  if (!slot(set, "color").explicit()) slot(set, "color").provide(fill);
  if (set.borderWidth === 1 && equal(set.borderColor, BLACK)) slot(set, "borderColor").provide("#ffffff");
}

// Colours the sets of a bar series which is the chart's `index`th series:
// QAbstractBarSeriesPrivate::initializeTheme. The sets of all the chart's
// bar series take the five colours in turn, and those past the fifth a
// colour further along its gradient.
export function themeBars(series, index, plots) {
  const sets = series.$sets;
  let actual = 0;
  let first = sets.length;
  let lowest = index;
  for (let other = 0; other < plots.length; other++) {
    if (other === index || !is(plots[other], AbstractBarSeries)) continue;
    actual += plots[other].$sets.length;
    if (other < lowest) {
      first = Math.max(plots[other].$sets.length, COLOURS.length);
      lowest = other;
    }
  }
  let at = 0.5;
  let step = 0.2;
  const further = () => {
    at += step;
    if (at === 1) at += step;
    at -= Math.trunc(at);
  };
  if (first > 1) {
    step = (1 / first) * (first % COLOURS.length ? COLOURS.length : COLOURS.length - 1);
    if (index > 0) for (let stepper = actual; stepper > COLOURS.length; stepper -= COLOURS.length) further();
  }
  for (let i = 0; i < sets.length; i++) {
    const turn = actual + i;
    if (turn > 0 && turn % COLOURS.length === 0) further();
    tint(sets[i], shade(turn % COLOURS.length, at));
  }
}

// A line takes the colour that is its series' turn and is two wide, unless
// it was given a colour or a width.
export function themeLine(series, index) {
  if (!equal(series.color, BLACK) || series.width !== 1) return;
  slot(series, "color").provide(COLOURS[index % COLOURS.length]);
  slot(series, "width").provide(2);
}

// The sets changed: the chart colours the new ones and draws again.
function changed(series) {
  const chart = series.$chart;
  if (chart) themeBars(series, chart.$plots.indexOf(series), chart.$plots);
  series.$touch(next);
  chart?.$touch(next);
  settle();
}

const made = (series, label, values) => runWithOwner(series.$owner, () => untrack(() => BarSet({ label, values: Array.from(values ?? NONE) })));

export const AbstractBarSeries = defineType("AbstractBarSeries", AbstractSeries, {
  properties: {
    // How much of a category the bars of all the sets take together.
    barWidth: 0.5,
    count: derived((self) => (self.$track(), self.$sets.length)),
  },
  enums: { LabelsCenter: 0, LabelsInsideEnd: 1, LabelsInsideBase: 2, LabelsOutsideEnd: 3 },
  setup(self) {
    self.$sets = [];
  },
  adopt(self, props) {
    self.$sets = contents(props).filter((child) => is(child, BarSet));
  },
  methods: {
    at(index) {
      return this.$sets[index] ?? null;
    },
    append(label, values) {
      return this.insert(this.$sets.length, label, values);
    },
    insert(index, label, values) {
      const set = made(this, label, values);
      this.$sets.splice(Math.max(0, Math.min(index, this.$sets.length)), 0, set);
      changed(this);
      return set;
    },
    remove(set) {
      const index = this.$sets.indexOf(set);
      if (index < 0) return false;
      this.$sets.splice(index, 1);
      changed(this);
      return true;
    },
    clear() {
      this.$sets.length = 0;
      changed(this);
    },
    // The series' numbers reach from the middle of a category before the
    // first to that of one after the last, and up from nought or down to it.
    $domain() {
      let most = 0;
      let low = 0;
      let high = 0;
      for (const set of this.$sets) {
        const values = set.values;
        most = Math.max(most, values.length);
        for (let i = 0; i < values.length; i++) {
          low = Math.min(low, values[i]);
          high = Math.max(high, values[i]);
        }
      }
      return [-0.5, most - 0.5, low, high];
    },
    // What the legend shows of it: each set's colours and label.
    $markers(into) {
      this.$track();
      for (const set of this.$sets) into.push(set);
    },
  },
});

// The bars of each category side by side, a set after another; and where
// the chart has several bar series, those side by side likewise.
function bars(series, plot, smooth) {
  const shapes = [];
  const chart = series.$chart;
  chart.$track();
  series.$track();
  const to = scale(series, plot);
  if (!to) return shapes;
  let index = 0;
  let count = 0;
  for (const other of chart.$plots) {
    if (!is(other, AbstractBarSeries)) continue;
    if (other === series) index = count;
    count++;
  }
  const share = count > 1 ? 1 / count : 1;
  const moved = count > 1 ? share * index + share / 2 - 0.5 : 0;
  const sets = series.$sets;
  const width = series.barWidth * share;
  const each = width / sets.length;
  const floor = plot.y + plot.height + to.low * to.dy;
  for (let s = 0; s < sets.length; s++) {
    const set = sets[s];
    const values = set.values;
    const fill = css(set.color);
    const pen = { colour: css(set.borderColor), width: set.borderWidth };
    for (let c = 0; c < values.length; c++) {
      const from = moved + c - width / 2 + s * each;
      const x = plot.x + (from - to.left) * to.dx;
      const top = floor - values[c] * to.dy;
      shapes.push(box(x, Math.min(top, floor), each * to.dx, Math.abs(floor - top), fill, pen, smooth));
    }
  }
  return shapes;
}

export const BarSeries = defineType("BarSeries", AbstractBarSeries, {
  properties: {
    axisX: null,
    axisY: null,
    axisXTop: null,
    axisYRight: null,
    type: SERIES.SeriesTypeBar,
  },
  methods: {
    $paint(plot, smooth) {
      return bars(this, plot, smooth);
    },
    $clip(plot) {
      return plot;
    },
  },
});

export const XYPoint = defineType("XYPoint", QtObject, {
  properties: { x: 0, y: 0 },
});

const ORIGIN = new Point(0, 0);

// The points changed.
function moved(series) {
  series.$touch(next);
  settle();
}

export const XYSeries = defineType("XYSeries", AbstractSeries, {
  properties: {
    color: BLACK,
    width: 1,
    axisX: null,
    axisY: null,
    axisXTop: null,
    axisYRight: null,
    count: derived((self) => (self.$track(), self.$points.length)),
  },
  resolve: { color: colorValue },
  setup(self) {
    self.$points = [];
  },
  // The points declared in it are its first, once they know where they are.
  adopt(self, props) {
    const declared = contents(props).filter((child) => is(child, XYPoint));
    if (declared.length === 0) return;
    whenComplete(() =>
      untrack(() => {
        self.$points.unshift(...declared.map((point) => new Point(point.x, point.y)));
        self.$touch(next);
      }),
    );
  },
  methods: {
    at(index) {
      return this.$points[index] ?? ORIGIN;
    },
    append(x, y) {
      this.$points.push(new Point(x, y));
      moved(this);
    },
    insert(index, x, y) {
      this.$points.splice(Math.max(0, Math.min(index, this.$points.length)), 0, new Point(x, y));
      moved(this);
    },
    // The point at an index, or the one that is where (`x`, `y`) is.
    remove(x, y) {
      const index = y === undefined ? x : this.$points.findIndex((point) => point.x === x && point.y === y);
      this.removePoints(index, 1);
    },
    removePoints(index, count) {
      if (index < 0 || count <= 0 || index + count > this.$points.length) return;
      this.$points.splice(index, count);
      moved(this);
    },
    replace(oldX, oldY, newX, newY) {
      const index = this.$points.findIndex((point) => point.x === oldX && point.y === oldY);
      if (index < 0) return;
      this.$points[index] = new Point(newX, newY);
      moved(this);
    },
    clear() {
      if (this.$points.length === 0) return;
      this.$points.length = 0;
      moved(this);
    },
    // As far as its points reach; from nought to one when it has none.
    $domain() {
      const points = this.$points;
      if (points.length === 0) return [0, 1, 0, 1];
      let left = Infinity;
      let right = -Infinity;
      let low = Infinity;
      let high = -Infinity;
      for (const { x, y } of points) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        low = Math.min(low, y);
        high = Math.max(high, y);
      }
      return [left, right, low, high];
    },
    $markers(into) {
      into.push(this);
    },
    // Where its points are in the plot.
    $placed(plot) {
      this.$track();
      const to = scale(this, plot);
      if (!to) return NONE;
      const floor = plot.y + plot.height;
      return this.$points.map(({ x, y }) => [plot.x + (x - to.left) * to.dx, floor - (y - to.low) * to.dy]);
    },
    $pen() {
      return { colour: css(this.color), width: this.width };
    },
  },
});

export const LineSeries = defineType("LineSeries", XYSeries, {
  properties: { type: SERIES.SeriesTypeLine },
  methods: {
    $paint(plot, smooth) {
      const points = this.$placed(plot);
      return points.length > 1 ? [stroke(apart(points), this.$pen(), smooth)] : NONE;
    },
    // Half a pixel more than the plot where that lets a line along its edge
    // show, and never past it: LineChartItem::paint.
    $clip(plot) {
      const x = plot.x - Math.trunc(plot.x);
      const y = plot.y - Math.trunc(plot.y);
      const across = plot.width + 0.5 - Math.trunc(plot.width + 0.5);
      const down = plot.height + 0.5 - Math.trunc(plot.height + 0.5);
      return { x: plot.x - x, y: plot.y - y, width: plot.width + x + Math.max(x, across), height: plot.height + y + Math.max(y, down) };
    },
  },
});

export const SplineSeries = defineType("SplineSeries", XYSeries, {
  properties: { type: SERIES.SeriesTypeSpline },
  methods: {
    $paint(plot, smooth) {
      const points = this.$placed(plot);
      return points.length > 1 ? [stroke(curved(points), this.$pen(), smooth)] : NONE;
    },
    $clip(plot) {
      return plot;
    },
  },
});

export const bar = (series) => is(series, AbstractBarSeries);
export const plotted = (child) => is(child, AbstractSeries);

// ChartView: series between axes, and a legend that names them.
//
// A chart is one `<svg>`: its background, the axes' grid, lines and labels,
// each series in a window the size of the plot, and the legend. Where each
// is comes from one layout, Qt's own: the legend takes a side, the axes
// what their labels need of what is left, and the series the rest. An
// effect each draws them again when something they are drawn from changes.
import { runWithOwner } from "solid-js";
import { defineType, derived, effect, group, onChange, QtObject, slot, whenComplete } from "../object.js";
import { colorValue, css } from "../QtQuick/color.js";
import { lazy, rules } from "../QtQuick/compute.js";
import { describe, fonts, metrics } from "../QtQuick/font.js";
import { Item } from "../QtQuick/Item.js";
import { Rect } from "../QtQml/values.js";
import { BarCategoryAxis, BOTTOM, HORIZONTAL, LEFT, RIGHT, scaled, TOP, ValueAxis, VERTICAL } from "./axes.js";
import { box, draw, fontNamed, label, line, oval, svg, tall, truncated, wide, window } from "./plot.js";
import { bar, plotted, themeBars, themeLine, XYSeries } from "./series.js";
import { untrack } from "#kernel";

// What is drawn outside a chart does not show.
rules(`.qq-chart { overflow: hidden; }`);

const next = (version) => version + 1;
const is = (object, Type) => object?.$type?.chain.includes(Type) === true;

// Between the chart's edge and its background, and the legend's and what
// is in it.
const EDGE = 9;
// Around a marker and its label, and between the two.
const AROUND = 3;
const BETWEEN = 4;
// How much of the chart the axes of one direction, or a legend beside the
// plot, may take.
const PORTION = 0.4;

const RECTANGLE = 1;
const CIRCLE = 2;
const FROM_SERIES = 3;

export const Legend = defineType("Legend", QtObject, {
  properties: {
    // The side of the chart it is on: `Qt.AlignTop` and the like.
    alignment: TOP,
    visible: true,
    font: fontNamed("font"),
    labelColor: "#404044",
    markerShape: RECTANGLE,
    reverseMarkers: false,
  },
  enums: {
    MarkerShapeDefault: 0,
    MarkerShapeRectangle: 1,
    MarkerShapeCircle: 2,
    MarkerShapeFromSeries: 3,
    MarkerShapeRotatedRectangle: 4,
    MarkerShapeTriangle: 5,
    MarkerShapeStar: 6,
    MarkerShapePentagon: 7,
  },
  resolve: { labelColor: colorValue, markerShape: (self, own) => own() || RECTANGLE },
});

// What the legend names: the sets of the bar series and the other series,
// those that show. Each with how big its marker is.
function named(self, spec) {
  self.$track();
  const sources = [];
  for (const series of self.$plots) if (series.visible) series.$markers(sources);
  const legend = self.$legend;
  const side = Math.floor(metrics(spec).height / 2);
  const drawn = legend.markerShape === FROM_SERIES;
  const beside = legend.alignment === LEFT || legend.alignment === RIGHT;
  const dots = wide(spec, "...");
  let widest = 0;
  const markers = sources.map((source) => {
    const line = is(source, XYSeries);
    // A line's own marker is a piece of the line.
    const width = drawn && line ? Math.round(side * 1.5) : side;
    const height = drawn && line ? Math.round(source.width) : side;
    widest = Math.max(widest, width);
    return { source, line, text: line ? source.name : source.label, width, height, room: width, wants: 0, high: 0 };
  });
  for (const marker of markers) {
    // Beside the plot the labels begin where the widest marker ends.
    if (beside) marker.room = widest;
    marker.wants = wide(spec, marker.text) + 2 * AROUND + BETWEEN + marker.room + 1;
    marker.least = dots + 2 * AROUND + BETWEEN + marker.room;
    marker.high = Math.max(marker.height, tall(spec)) + 2 * AROUND;
  }
  return markers;
}

// How much of the chart the legend asks for.
function asked(markers) {
  let width = 0;
  let height = 0;
  for (const marker of markers) {
    width = Math.max(width, marker.wants, marker.least);
    height = Math.max(height, marker.high);
  }
  return [width + 2 * EDGE, height + 2 * EDGE];
}

// The widths the markers of a legend over or under the plot get: what they
// ask for, or less of the longest when that is more than there is.
// LegendLayout::setAttachedGeometry.
function shared(markers, room) {
  const order = markers.map((marker) => ({ marker, width: marker.wants })).sort((a, b) => b.width - a.width);
  const count = order.length;
  let total = 0;
  for (const entry of order) total += entry.width;
  const available = room - AROUND * count;
  if (total >= available && count > 0) {
    let cut = false;
    for (let i = 1; i < count; i++) {
      const at = i - 1;
      while (order[at].width >= order[i].width && !cut) {
        order[at].width--;
        total--;
        if (i > 1) {
          for (let j = at - 1; j >= 0; j--) {
            if (order[at].width < order[j].width) {
              order[j].width--;
              total--;
            }
          }
        }
        if (total < available) cut = true;
      }
      if (i === count - 1 && order[count - 1].width > order[at].width) {
        order[count - 1].width--;
        total--;
      }
      if (cut) break;
    }
    while (total >= available) {
      for (const entry of order) {
        entry.width--;
        total--;
      }
    }
  }
  const widths = new Map();
  for (const entry of order) widths.set(entry.marker, entry.width);
  return widths;
}

// A marker's outline: its set's, unless the legend's label colour changed
// while it was there, which Qt gives the markers of then as well.
function outline(marker) {
  const source = marker.source;
  if (source.$outline) return { colour: source.$outline, width: 1 };
  if (marker.line) return { colour: "#000000", width: 1 };
  return { colour: css(source.borderColor), width: source.borderWidth };
}

// How a marker and its label fit in `width`: where the label begins, what
// of it shows, and how wide and high the two are together.
function fitted(marker, width, height, spec) {
  const begin = AROUND + marker.room + BETWEEN + AROUND;
  const fit = truncated(spec, marker.text, width - begin, height);
  return { marker, begin, fit, width: begin + fit.width + AROUND, height: Math.max(marker.height, fit.height) + 2 * AROUND, x: 0, y: 0 };
}

// A marker and its label at (`x`, `y`).
function marked({ marker, begin, fit, height }, x, y, legend, spec, smooth, shapes) {
  const left = x + AROUND - 0.5 + (marker.room - marker.width) / 2;
  const top = y + height / 2 - marker.height / 2 + 0.5;
  const source = marker.source;
  const shape = legend.markerShape;
  if (shape === FROM_SERIES && marker.line) {
    const middle = top + marker.height / 2;
    const drawn = line(left, middle, left + marker.width, middle, css(source.color), smooth);
    if (source.width !== 1) drawn.set["stroke-width"] = source.width;
    shapes.push(drawn);
  } else if (shape === FROM_SERIES) {
    // What Qt draws for a set then: an empty square, whatever the set's colours.
    shapes.push(box(left, top, marker.width, marker.height, null, { colour: "#000000", width: 1 }, smooth));
  } else {
    const make = shape === CIRCLE ? oval : box;
    shapes.push(make(left, top, marker.width, marker.height, css(source.color), outline(marker), smooth));
  }
  // Dots alone say nothing: Qt shows no label then.
  if (fit.text !== "...") shapes.push(label(fit.text, x + begin - AROUND, y + height / 2 - fit.height / 2, spec, css(legend.labelColor)));
}

// What is drawn of the legend in the rectangle the layout gave it: the
// markers after one another, in the middle of it when there is room.
function key(self, rect, smooth) {
  const shapes = [];
  const legend = self.$legend;
  const spec = describe(legend.font);
  const markers = named(self, spec);
  if (!rect || markers.length === 0) return shapes;
  if (legend.reverseMarkers) markers.reverse();
  const width = rect.width - 2 * EDGE;
  const height = rect.height - 2 * EDGE;
  let x = rect.x + EDGE;
  let y = rect.y + EDGE;
  let items;
  if (legend.alignment === TOP || legend.alignment === BOTTOM) {
    const widths = shared(markers, width);
    let across = 0;
    let taken = 0;
    items = markers.map((marker) => {
      const item = fitted(marker, widths.get(marker), height, spec);
      item.x = across;
      item.y = height / 2 - item.height / 2;
      across += item.width;
      taken += item.width - AROUND;
      return item;
    });
    if (taken < width) x = rect.x + Math.trunc(width / 2 - taken / 2);
  } else {
    let down = 0;
    items = markers.map((marker) => {
      const item = fitted(marker, width, height, spec);
      item.y = down;
      down += item.height;
      return item;
    });
    if (down < height) y = rect.y + Math.trunc(height / 2 - down / 2);
  }
  for (const item of items) marked(item, x + item.x, y + item.y, legend, spec, smooth, shapes);
  return shapes;
}

const NOWHERE = Object.freeze({ plot: new Rect(0, 0, 0, 0), legend: null, rects: new Map() });

// Where everything is: AbstractChartLayout::setGeometry, and for the axes
// CartesianChartLayout::calculateAxisGeometry.
function arrange(self) {
  fonts();
  self.$track();
  const margins = self.margins;
  let left = EDGE + margins.left;
  let top = EDGE + margins.top;
  let right = self.width - EDGE - margins.right;
  let bottom = self.height - EDGE - margins.bottom;

  let where = null;
  const legend = self.$legend;
  if (legend.visible) {
    const [width, height] = asked(named(self, describe(legend.font)));
    const beside = Math.min(width, (right - left) * PORTION);
    switch (legend.alignment) {
      case TOP:
        where = new Rect(left, top, right - left, height);
        top += height;
        break;
      case BOTTOM:
        where = new Rect(left, bottom - height, right - left, height);
        bottom -= height;
        break;
      case LEFT:
        where = new Rect(left, top, beside, bottom - top);
        left += beside;
        break;
      case RIGHT:
        where = new Rect(right - beside, top, beside, bottom - top);
        right -= beside;
        break;
    }
  }

  // What the axes of each side ask for together, and at the least.
  const sides = new Map([LEFT, RIGHT, TOP, BOTTOM].map((side) => [side, { count: 0, width: 0, height: 0, leastWidth: 0, leastHeight: 0, squeeze: 1, offset: 0 }]));
  const sizes = new Map();
  let extentWidth = 0;
  let extentHeight = 0;
  for (const axis of self.$axes) {
    if (!axis.visible) continue;
    const side = sides.get(axis.alignment);
    if (!side) continue;
    const hint = axis.$hint(describe(axis.labelsFont));
    const width = Math.max(hint[0], hint[2]);
    const height = Math.max(hint[1], hint[3]);
    sizes.set(axis, [width, height]);
    side.count++;
    if (axis.orientation === VERTICAL) {
      side.width += width;
      side.height = Math.max(side.height, height);
      side.leastWidth += hint[2];
      side.leastHeight = Math.max(side.leastHeight, hint[3]);
      extentHeight = Math.max(extentHeight, height);
    } else {
      side.width = Math.max(side.width, width);
      side.height += height;
      side.leastWidth = Math.max(side.leastWidth, hint[2]);
      side.leastHeight += hint[3];
      extentWidth = Math.max(extentWidth, width);
    }
  }
  const [onLeft, onRight, onTop, onBottom] = [sides.get(LEFT), sides.get(RIGHT), sides.get(TOP), sides.get(BOTTOM)];
  // No more than their portion: the axes of a side are squeezed into it.
  const upright = onLeft.count + onRight.count;
  for (const side of [onLeft, onRight]) {
    const most = Math.trunc(((PORTION * (right - left)) / upright) * side.count);
    if (side.count > 0 && side.width > most) {
      side.squeeze = most / side.width;
      side.width = most;
    }
  }
  const level = onTop.count + onBottom.count;
  for (const side of [onTop, onBottom]) {
    const most = Math.trunc(((PORTION * (bottom - top)) / level) * side.count);
    if (side.count > 0 && side.height > most) {
      side.squeeze = most / side.height;
      side.height = most;
    }
  }
  // Room for the first and the last label of the axes of the other direction.
  const leastHeight = Math.max(onLeft.leastHeight, onRight.leastHeight) + 1;
  const leastWidth = Math.max(onTop.leastWidth, onBottom.leastWidth) + 1;
  const plotLeft = left + Math.max(extentWidth, onLeft.width, leastWidth / 2);
  const plotTop = top + Math.max(extentHeight, onTop.height, leastHeight / 2);
  const plotRight = right - Math.max(extentWidth, onRight.width, leastWidth / 2);
  const plotBottom = bottom - Math.max(extentHeight, onBottom.height, leastHeight / 2);

  // Each axis after the one before it on its side, on whole pixels. One
  // beside the plot is as high as where the chart ends is far down: Qt's.
  const rects = new Map();
  for (const axis of self.$axes) {
    const size = sizes.get(axis);
    if (!size) continue;
    const side = sides.get(axis.alignment);
    if (axis.orientation === VERTICAL) {
      const width = size[0] * side.squeeze;
      if (axis.alignment === LEFT) side.offset += width;
      const x = axis.alignment === LEFT ? plotLeft - side.offset : plotRight + side.offset;
      if (axis.alignment === RIGHT) side.offset += width;
      rects.set(axis, new Rect(Math.trunc(x), Math.trunc(top), Math.trunc(width), Math.trunc(bottom)));
    } else {
      const height = size[1] * side.squeeze;
      const y = axis.alignment === TOP ? plotTop - side.offset - height : plotBottom + side.offset;
      side.offset += height;
      rects.set(axis, new Rect(Math.trunc(left), Math.trunc(y), Math.trunc(right - left), Math.trunc(height)));
    }
  }

  // The same rectangle while the plot is where it was: `plotArea` has not
  // changed then.
  let plot = self.$plot;
  if (!plot || plot.x !== plotLeft || plot.y !== plotTop || plot.width !== plotRight - plotLeft || plot.height !== plotBottom - plotTop) {
    plot = self.$plot = new Rect(plotLeft, plotTop, plotRight - plotLeft, plotBottom - plotTop);
  }
  return { plot, legend: where, rects };
}

// The axis of one direction that series share when they name none: one
// the chart has already of the kind the series takes, or a new one.
function common(self, orientation, Kind) {
  return self.$axes.find((axis) => axis.orientation === orientation && is(axis, Kind)) ?? runWithOwner(self.$owner, () => Kind({}));
}

// Gives a series an axis. The chart has an axis where its first series put
// it. A value axis with no range takes the series', and from then on keeps
// it: Qt's axes do not follow what their series are given later.
function join(self, axis, series, orientation, alignment, own) {
  if (!self.$axes.includes(axis)) {
    self.$axes.push(axis);
    slot(axis, "orientation").provide(orientation);
    slot(axis, "alignment").provide(alignment);
  }
  const domain = series.$domain();
  if (is(axis, ValueAxis)) {
    let [low, high] = orientation === HORIZONTAL ? domain : domain.slice(2);
    if (Math.abs(axis.max - axis.min) > 1e-12) return;
    // An axis the chart made is given some range even so.
    if (low === high && !own) [low, high] = [low - 0.5, high + 0.5];
    slot(axis, "min").provide(low);
    slot(axis, "max").provide(high);
  } else if (bar(series) && orientation === HORIZONTAL && axis.categories.length === 0) {
    // Categories with no names are numbered.
    slot(axis, "categories").provide(Array.from({ length: domain[1] + 0.5 }, (_, index) => String(index + 1)));
  }
}

// Takes a series into the chart: its colours, its axes, and its place.
function add(self, series) {
  const index = self.$plots.length;
  self.$plots.push(series);
  series.$chart = self;
  if (bar(series)) themeBars(series, index, self.$plots);
  else themeLine(series, index);

  const across = series.axisX ?? series.axisXTop ?? common(self, HORIZONTAL, bar(series) ? BarCategoryAxis : ValueAxis);
  join(self, across, series, HORIZONTAL, across === series.axisX || !series.axisXTop ? BOTTOM : TOP, across === series.axisX || across === series.axisXTop);
  const up = series.axisY ?? series.axisYRight ?? common(self, VERTICAL, ValueAxis);
  join(self, up, series, VERTICAL, up === series.axisY || !series.axisYRight ? LEFT : RIGHT, up === series.axisY || up === series.axisYRight);
  series.$across = across;
  series.$up = up;

  const element = self.$series.appendChild(svg("svg"));
  effect(
    () => {
      const plot = self.$layout().plot;
      const visible = series.visible;
      return { visible, opacity: series.opacity, clip: series.$clip(plot), shapes: visible ? series.$paint(plot, self.antialiasing) : [] };
    },
    ({ visible, opacity, clip, shapes }) => {
      element.style.display = visible ? "" : "none";
      element.style.opacity = opacity === 1 ? "" : opacity;
      window(element, clip.x, clip.y, clip.width, clip.height);
      draw(element, shapes);
    },
  );
}

let filters = 0;

// The shadow Qt puts under a chart's background: blurred, and moved down
// and to the right. Qt's blur of radius 10 is half that on a picture half
// the size: as wide as a Gaussian blur of deviation 2.5.
function shadow(node) {
  const filter = svg("filter");
  filter.id = `qq-chart-shadow-${++filters}`;
  for (const [name, value] of [["x", "-20%"], ["y", "-20%"], ["width", "140%"], ["height", "140%"]]) filter.setAttribute(name, value);
  const drop = filter.appendChild(svg("feDropShadow"));
  for (const [name, value] of [["dx", 5], ["dy", 5], ["stdDeviation", 2.5], ["flood-color", "rgb(63, 63, 63)"], ["flood-opacity", 180 / 255]]) drop.setAttribute(name, value);
  node.prepend(filter);
  return filter.id;
}

export const ChartView = defineType("ChartView", Item, {
  properties: {
    // White until it is given: Qt's reads as no colour till then.
    backgroundColor: undefined,
    backgroundRoundness: 5,
    dropShadowEnabled: false,
    // Painted only once it is given.
    plotAreaColor: undefined,
    // Between the background's edge and what is in it.
    margins: group({ top: 20, bottom: 20, left: 20, right: 20 }),
    plotArea: derived((self) => self.$layout().plot),
    count: derived((self) => (self.$track(), self.$plots.length)),
  },
  enums: {
    ChartThemeLight: 0,
    ChartThemeBlueCerulean: 1,
    ChartThemeDark: 2,
    ChartThemeBrownSand: 3,
    ChartThemeBlueNcs: 4,
    ChartThemeHighContrast: 5,
    ChartThemeBlueIcy: 6,
    ChartThemeQt: 7,
    NoAnimation: 0,
    GridAxisAnimations: 1,
    SeriesAnimations: 2,
    AllAnimations: 3,
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
  },
  resolve: { backgroundColor: colorValue, plotAreaColor: colorValue },
  methods: {
    get legend() {
      return this.$legend;
    },
    // The series at an index, or the one of a name.
    series(which) {
      if (typeof which === "number") return this.$plots[which] ?? null;
      return this.$plots.find((series) => untrack(() => series.name) === which) ?? null;
    },
    // A series' axis; with no series, the chart's first of that direction.
    axisX(series) {
      return (series ? series.$across : this.$axes.find((axis) => untrack(() => axis.orientation) === HORIZONTAL)) ?? null;
    },
    axisY(series) {
      return (series ? series.$up : this.$axes.find((axis) => untrack(() => axis.orientation) === VERTICAL)) ?? null;
    },
  },
  setup(self) {
    const root = svg("svg");
    root.setAttribute("class", "qq-plot qq-chart");
    const [back, grid, lines, labels, series, names] = Array.from({ length: 6 }, () => root.appendChild(svg("g")));
    const frame = back.appendChild(svg("rect"));
    const field = back.appendChild(svg("rect"));
    self.$node.append(root);
    self.$series = series;
    self.$plots = [];
    self.$axes = [];
    self.$legend = Legend({});
    self.$layout = lazy(self, () => arrange(self), NOWHERE);
    let filter = null;

    effect(
      () => self.antialiasing,
      (smooth) => {
        if (smooth) root.removeAttribute("shape-rendering");
        else root.setAttribute("shape-rendering", "crispEdges");
      },
    );
    effect(
      () => [
        self.width,
        self.height,
        slot(self, "backgroundColor").explicit() ? css(self.backgroundColor) : "#ffffff",
        self.backgroundRoundness,
        self.dropShadowEnabled,
        slot(self, "plotAreaColor").explicit() ? css(self.plotAreaColor) : null,
        self.$layout().plot,
      ],
      ([width, height, colour, round, shaded, inside, plot]) => {
        frame.setAttribute("x", EDGE);
        frame.setAttribute("y", EDGE);
        frame.setAttribute("width", Math.max(0, width - 2 * EDGE));
        frame.setAttribute("height", Math.max(0, height - 2 * EDGE));
        frame.setAttribute("rx", round);
        frame.setAttribute("ry", round);
        frame.setAttribute("fill", colour);
        if (shaded) frame.setAttribute("filter", `url(#${(filter ??= shadow(root))})`);
        else frame.removeAttribute("filter");
        field.setAttribute("x", plot.x);
        field.setAttribute("y", plot.y);
        field.setAttribute("width", Math.max(0, plot.width));
        field.setAttribute("height", Math.max(0, plot.height));
        field.setAttribute("fill", inside ?? "none");
      },
    );
    effect(
      () => {
        const { plot, rects } = self.$layout();
        const into = { grid: [], lines: [], labels: [] };
        for (const [axis, rect] of rects) scaled(axis, rect, plot, self.antialiasing, into);
        return into;
      },
      (into) => {
        draw(grid, into.grid);
        draw(lines, into.lines);
        draw(labels, into.labels);
      },
    );
    effect(
      () => (self.$legend.visible ? key(self, self.$layout().legend, self.antialiasing) : []),
      (shapes) => draw(names, shapes),
    );
    // Qt outlines the markers it has in the legend's label colour when that
    // changes, and not those of the series that come later.
    onChange(self.$legend, "labelColor", () => {
      const sources = [];
      for (const plot of self.$plots) plot.$markers(sources);
      const colour = css(untrack(() => self.$legend.labelColor));
      for (const source of sources) source.$outline = colour;
      self.$touch(next);
    });
  },
  // The series join once their own points and sets are in them, in the
  // order they were declared in.
  adopt(self, props) {
    Item.adopt(self, props);
    whenComplete(() =>
      untrack(() => {
        for (const child of self.$static) if (plotted(child)) add(self, child);
        self.$touch(next);
      }),
    );
  },
});

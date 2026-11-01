// GraphsView: bars between an axis of categories and one of values.
//
// Behind the bars is one `<svg>`: the background, the ticks beside each
// axis, the grid in the plot and the lines the axes are. The labels and the
// bars are items, as Qt's are: a Text and a rounded Rectangle each, or what
// the axis' `labelDelegate` and the series' `barDelegate` make. Where each
// is comes from Qt's own arithmetic, and an effect each puts them there
// again when something they are placed by changes.
import { defineType, derived, effect, instantiate, slot } from "../object.js";
import { box, draw, svg } from "../QtCharts/plot.js";
import { color, css, equal } from "../QtQuick/color.js";
import { lazy, rules } from "../QtQuick/compute.js";
import { Item } from "../QtQuick/Item.js";
import { Rectangle } from "../QtQuick/Rectangle.js";
import { Text } from "../QtQuick/Text.js";
import { Rect } from "../QtQml/values.js";
import { BarCategoryAxis, ValueAxis } from "./axes.js";
import { bars } from "./series.js";
import { GraphsTheme } from "./theme.js";
import { untrack } from "#kernel";

rules(`
.qq-graph-names { position: absolute; left: 0; top: 0; }
.qq-graph-bars { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
`);

const is = (object, Type) => object?.$type?.chain.includes(Type) === true;
const NONE = Object.freeze([]);
const NOTHING = Object.freeze({});

// How long an axis' ticks are, how much room its labels have, and what is
// between the labels of the upright one and its ticks.
const TICKS = 15;
const NAMES_HIGH = 25;
const NAMES_WIDE = 40;
const GAP = 5;
// Between the bars of two sets, and how round a bar's corners are.
const BETWEEN = 2;
const ROUND = 4;
// More lines than this along an axis are a blur in Qt, and none here.
const MOST = 500;
const COUNTED = 1e6;
// Over how many pixels the edge of a line fades: of an axis' and its ticks,
// and of the grid's.
const AXIS = 1;
const GRID = 1.05;

const CENTRE = 4;
const RIGHT = 2;
const TOP = 32;
const MIDDLE = 128;
const ON_VALUE = 1;
const GROUPS = 0;
const PERCENT = 2;
const BLACK = color("#000000");

// Where everything is: QGraphsView::updateAxisAreas and updatePlotArea,
// for an axis under the plot and one to its left.
function arrange(self) {
  const across = self.axisX;
  const up = self.axisY;
  const left = self.marginLeft;
  const top = self.marginTop;
  const width = self.width - left - self.marginRight;
  const height = self.height - top - self.marginBottom;
  // An axis that does not show takes no room, and one there is not none.
  const shownX = !across || across.visible;
  const shownY = !up || up.visible;
  const ticksHigh = shownX ? TICKS : 0;
  const ticksWide = shownY ? TICKS : 0;
  const namesWide = shownY ? NAMES_WIDE : 0;
  const gap = shownY ? GAP : 0;
  const under = across && shownX ? TICKS + NAMES_HIGH : 0;
  const beside = up ? namesWide + gap + ticksWide : 0;

  // The same rectangle while the plot is where it was: `plotArea` has not
  // changed then.
  const wide = Math.max(0, width - beside);
  const high = Math.max(0, height - under);
  let plot = self.$plot;
  if (!plot || plot.x !== left + beside || plot.y !== top || plot.width !== wide || plot.height !== high) {
    plot = self.$plot = new Rect(left + beside, top, wide, high);
  }
  return {
    plot,
    ticksX: new Rect(left + beside, top + height - under, width - beside, ticksHigh),
    // Qt gives the labels under the plot the height of the ticks.
    namesX: new Rect(left + beside, top + height - under + ticksHigh, width - beside, ticksHigh),
    ticksY: new Rect(left + namesWide + gap, top, ticksWide, height - under),
    namesY: new Rect(left, top, namesWide, height - under),
  };
}

const NOWHERE = Object.freeze({ plot: new Rect(0, 0, 0, 0), ticksX: new Rect(0, 0, 0, 0), namesX: new Rect(0, 0, 0, 0), ticksY: new Rect(0, 0, 0, 0), namesY: new Rect(0, 0, 0, 0) });

// How far apart the main lines of a value axis are when it does not say: a
// tenth of its range, rounded up to one digit. AxisRenderer's.
function stepOf(range) {
  const scale = 10 ** -Math.ceil(Math.log10(range)) * 10;
  return Math.max(0.0001, (Math.ceil(range * scale) / scale) * 0.1);
}

// The least value at or over `min` that is whole steps from the anchor. Qt
// counts the steps there one at a time, and what the sum loses on the way is
// in what it draws: an axis from 5 to 6 has no label at 5. So does this, as
// far as a million steps.
function firstOf(anchor, min, step) {
  if (Math.abs(min - anchor) / step > COUNTED) return anchor + Math.ceil((min - anchor) / step) * step;
  let first = anchor;
  while (first < min) first += step;
  while (first >= min + step) first -= step;
  return first;
}

// What an axis measures: from what value to what; how many steps of its
// main lines that is (`parts`) and what part of a step the first of them is
// from where the axis begins (`moved`); and what part of a step is between
// two of the lines between them (`sub`).
function measured(axis) {
  if (is(axis, ValueAxis)) {
    const { min, max, tickAnchor } = axis;
    const range = max - min;
    const count = axis.subTickCount;
    const sub = count > 0 ? 1 / (count + 1) : 1;
    if (!(range > 0)) return { min, max, step: 1, first: min, parts: 0, moved: 0, sub };
    const step = axis.tickInterval > 0 ? axis.tickInterval : stepOf(range);
    const first = firstOf(tickAnchor, min, step);
    return { min, max, step, first, parts: range / step, moved: (first - min) / step, sub };
  }
  // A category is a step, with a line between them in the middle of it.
  if (is(axis, BarCategoryAxis)) return { min: 0, max: axis.categories.length, step: 1, first: 0, parts: axis.categories.length, moved: 0, sub: 0.5 };
  // With no axis the values are measured against Qt's twenty.
  return { min: 0, max: 20, step: 1, first: 0, parts: 0, moved: 0, sub: 0.5 };
}

// How much of a pixel a line has that is `wide` and whose middle is `far`
// from the pixel's: Qt's shaders fade a line over `soft` pixels about each
// of its edges, and so does this.
function cover(far, wide, soft) {
  const t = Math.max(0, Math.min(1, (wide + soft - 2 * far) / (2 * soft)));
  return t * t * (3 - 2 * t);
}

// The first pixel whose middle is at or after a place: what is drawn from
// one place to another has the pixels from the one's to before the other's.
const pixel = (place) => Math.ceil(place - 0.5);

// Adds a line whose middle is at `middle`: along x when it is upright,
// along y when level. It reaches from `from` to `to` the other way, has no
// pixel before `least` or from `most` on, and is a strip for each run of
// pixels it has as much of.
function strips(shapes, upright, middle, wide, soft, fill, from, to, least, most) {
  const reach = (wide + soft) / 2;
  const last = Math.min(Math.floor(middle + reach), most - 1);
  let begin = 0;
  let run = 0;
  for (let at = Math.max(Math.floor(middle - reach), least); at <= last + 1; at++) {
    const part = at > last ? 0 : Math.round(cover(Math.abs(at + 0.5 - middle), wide, soft) * 255) / 255;
    if (part === run) continue;
    if (run > 0) {
      const set = upright ? { x: begin, y: from, width: at - begin, height: to - from } : { x: from, y: begin, width: to - from, height: at - begin };
      shapes.push({ tag: "rect", set: { ...set, fill, "fill-opacity": run } });
    }
    begin = at;
    run = part;
  }
}

// Adds a line for each place `spacing` apart along a rectangle: upright
// ones counted from its left, or level ones from its bottom, the first at
// `first`. Each reaches from `from` to `to` across the rectangle, and none
// is drawn outside it.
function rule(shapes, rect, upright, spacing, first, wide, soft, fill, from, to) {
  const length = upright ? rect.width : rect.height;
  if (!(spacing > 0) || !Number.isFinite(spacing) || length / spacing > MOST) return;
  const reach = (wide + soft) / 2;
  const start = upright ? rect.x : rect.y;
  const side = upright ? rect.y : rect.x;
  const least = pixel(start);
  const most = pixel(start + length);
  from = pixel(side + from);
  to = pixel(side + to);
  for (let k = Math.ceil((-reach - first) / spacing); ; k++) {
    const at = first + k * spacing;
    if (at > length + reach) break;
    strips(shapes, upright, upright ? start + at : start + length - at, wide, soft, fill, from, to, least, most);
  }
}

// A view that has no axis draws its background and nothing else: Qt makes
// what draws the plot and measures the bars with the first axis.
const bare = (self) => !self.axisX && !self.axisY;

// The plot's background and the grid over it: AxisRenderer::updateAxisGrid.
function grid(self) {
  if (bare(self)) return NONE;
  const theme = self.theme;
  const { plot, namesX, namesY } = self.$layout();
  const left = pixel(plot.x);
  const top = pixel(plot.y);
  const shapes = [box(left, top, pixel(plot.x + plot.width) - left, pixel(plot.y + plot.height) - top, theme.plotAreaBackgroundVisible ? css(theme.plotAreaBackgroundColor) : null, null, true)];
  if (theme.gridVisible) {
    const pen = theme.grid;
    const half = pen.mainWidth / 2;
    const across = measured(self.axisX);
    const up = measured(self.axisY);
    // The first line is half a main line in from the edge, and the last as
    // much in from the other.
    const gapX = (plot.width - pen.mainWidth) / across.parts;
    const gapY = (plot.height - pen.mainWidth) / up.parts;
    const firstX = half + (across.moved * namesX.width) / across.parts;
    const firstY = half + (up.moved * namesY.height) / up.parts;
    const fine = css(pen.subColor);
    const main = css(pen.mainColor);
    if (self.axisX?.subGridVisible) rule(shapes, plot, true, gapX * across.sub, firstX, pen.subWidth, GRID, fine, 0, plot.height);
    if (self.axisY?.subGridVisible) rule(shapes, plot, false, gapY * up.sub, firstY, pen.subWidth, GRID, fine, 0, plot.width);
    if (self.axisX?.gridVisible ?? true) rule(shapes, plot, true, gapX, firstX, pen.mainWidth, GRID, main, 0, plot.height);
    if (self.axisY?.gridVisible ?? true) rule(shapes, plot, false, gapY, firstY, pen.mainWidth, GRID, main, 0, plot.width);
  }
  return shapes;
}

// An axis' own colour, or the theme's while it has none.
const tint = (own, themed) => css(own.valid ? own : themed);

// The ticks beside an axis, in the rectangle the layout gave them: the main
// ones across all of it, those between them across the part next to the
// plot. AxisRenderer::updateAxisTickers.
function ticks(self, axis, pen, rect, upright, length) {
  const shapes = [];
  if (!axis?.visible) return shapes;
  const scale = measured(axis);
  const spacing = ((upright ? rect.width : rect.height) - self.theme.grid.mainWidth) / scale.parts;
  const first = pen.mainWidth / 2 + (scale.moved * length) / scale.parts;
  const across = upright ? rect.height : rect.width;
  if (scale.sub !== 1) {
    const fine = tint(axis.subColor, pen.subColor);
    // A fifth of the ticks under the plot, half of those beside it: the
    // part next to the plot.
    if (upright) rule(shapes, rect, true, spacing * scale.sub, first, pen.subWidth, AXIS, fine, 0, across * 0.2);
    else rule(shapes, rect, false, spacing * scale.sub, first, pen.subWidth, AXIS, fine, across * 0.5, across);
  }
  rule(shapes, rect, upright, spacing, first, pen.mainWidth, AXIS, tint(axis.color, pen.mainColor), 0, across);
  return shapes;
}

// The line an axis is: along the edge of the plot its ticks end at, and
// half of it in the plot.
function edge(shapes, axis, pen, upright, middle, from, to) {
  if (!axis?.lineVisible) return;
  const reach = (pen.mainWidth + AXIS) / 2;
  strips(shapes, upright, middle, pen.mainWidth, AXIS, tint(axis.color, pen.mainColor), pixel(from), pixel(to), pixel(middle - reach), pixel(middle + reach));
}

// A delegate is a component. What is not is no delegate.
const component = (delegate) => (delegate?.$component === true ? delegate : null);

// Gives an item's property a value, where the item has one of that name.
function put(item, name, value) {
  const own = slot(item, name);
  if (own) own.write(value);
  else if (name in item) item[name] = value;
}

// One item of a delegate's, or `plain`'s where the delegate makes none.
function make(self, delegate, plain) {
  if (delegate) {
    const made = instantiate(delegate, NOTHING, self, self.$owner);
    if (made.object?.$node) return made;
    made.dispose();
  }
  return instantiate(plain, NOTHING, self, self.$owner);
}

function discard(pool, from) {
  for (const made of pool.made.splice(from)) {
    made.object.$node.remove();
    made.dispose();
  }
}

// At least `count` items in the pool, of what `delegate` makes: all of them
// anew when that is another delegate than they were made by.
function pooled(self, pool, container, delegate, plain, count) {
  if (pool.delegate !== delegate) discard(pool, 0);
  pool.delegate = delegate;
  while (pool.made.length < count) {
    const made = make(self, delegate, plain);
    container.append(made.object.$node);
    pool.made.push(made);
  }
}

const pool = () => ({ made: [], delegate: null });

// What a label is when its axis has no delegate.
const name = () => Text({});

// Says what a label is of. A Text, be it a delegate's, is of the theme's
// font and colour as well, and its text where the axis has it; another
// item is told the text where it has a property for it.
function say(item, text, across, upright, font, colour) {
  put(item, "text", text);
  if (!is(item, Text)) return;
  put(item, "horizontalAlignment", across);
  put(item, "verticalAlignment", upright);
  put(item, "font", font);
  put(item, "color", colour);
}

const UNNAMED = Object.freeze({ delegate: null, shown: false, texts: NONE });

// The names under the plot, one to a category:
// AxisRenderer::updateBarXAxisLabels.
function names(self) {
  const axis = self.axisX;
  if (!is(axis, BarCategoryAxis)) return UNNAMED;
  const rect = self.$layout().namesX;
  const theme = self.theme;
  const texts = axis.categories;
  const wide = rect.width / texts.length;
  return {
    delegate: component(axis.labelDelegate),
    shown: axis.visible && axis.labelsVisible,
    font: theme.axisXLabelFont,
    colour: theme.axisX.labelTextColor,
    texts,
    x: rect.x + (axis.labelPosition === ON_VALUE ? wide / 2 : 0),
    y: rect.y,
    wide,
    high: rect.height,
    turned: axis.labelsAngle,
  };
}

// The values beside the plot, one at each main line that is within the
// axis: AxisRenderer::updateValueYAxisLabels. `tops` has null for one that
// is not.
function values(self) {
  const axis = self.axisY;
  if (!is(axis, ValueAxis)) return UNNAMED;
  const rect = self.$layout().namesY;
  const scale = measured(axis);
  const texts = [];
  const tops = [];
  if (scale.parts > 0) {
    const decimals = axis.labelDecimals < 0 ? Math.max(0, Math.ceil(Math.log10(10 / (scale.max - scale.min)))) : axis.labelDecimals;
    const apart = rect.height / scale.parts;
    for (let value = scale.first; value <= scale.max && texts.length < 100; value += scale.step) {
      const top = rect.y + rect.height - (texts.length + scale.moved) * apart;
      tops.push(top - 0.01 > rect.y + rect.height || top + 0.01 < rect.y ? null : top);
      texts.push(value.toFixed(Math.min(decimals, 100)));
    }
  }
  const theme = self.theme;
  return {
    delegate: component(axis.labelDelegate),
    shown: axis.visible && axis.labelsVisible,
    font: theme.axisYLabelFont,
    colour: theme.axisY.labelTextColor,
    texts,
    tops,
    x: rect.x,
    wide: rect.width,
    turned: axis.labelsAngle,
  };
}

const UNDRAWN = Object.freeze({ bars: NONE, legend: NONE });

// What each value of each set adds up to with those of the other sets.
function summed(sets, count) {
  const totals = new Array(count).fill(0);
  for (const set of sets) {
    const values = set.values;
    for (let at = 0; at < values.length && at < count; at++) totals[at] += Math.abs(Number(values[at]));
  }
  return totals;
}

// A colour as a series that is not opaque shows it. Qt counts its alpha in
// whole 255ths, and drops what is over.
const faded = (colour, opacity) => colour.alpha(Math.trunc(Math.round(colour.a * 255) * opacity) / 255);

// The colour a set takes of a list: its turn's, and black of an empty one.
const taken = (list, turn) => (list.length ? list[turn % list.length] : BLACK);

// Where the bars of a series are in the plot, what colours they have, and
// what a legend says of its sets: BarsRenderer::updateVerticalBars. The
// series is the `index`th of `count` that share the plot.
function placed(self, series, index, count) {
  const sets = series.barSets;
  if (sets.length === 0 || bare(self)) return UNDRAWN;
  const theme = self.theme;
  const { width, height } = self.$layout().plot;
  const kind = series.barsType;
  const stacked = kind !== GROUPS;
  // Every set is taken to have as many values as the first.
  const per = sets[0].values.length;
  // The room a bar has, of which it takes its part in the middle.
  const room = stacked ? width / (per * count) : width / (sets.length * per * count) - BETWEEN;
  const wide = room * series.barWidth;
  const centring = (room - wide) * (stacked ? 1 : sets.length) * 0.5;
  const begin = (index / (per * count)) * width;

  const scale = measured(self.axisY);
  const delta = scale.max - scale.min;
  const unit = delta > 0 ? 1 / delta : 100;
  const multiplier = series.valuesMultiplier;
  const base = height * -scale.min * multiplier * unit;
  const totals = kind === PERCENT ? summed(sets, per) : null;
  const risen = [];
  const sunk = [];

  const fills = series.seriesColors.length ? series.seriesColors : theme.seriesColors;
  const edges = series.borderColors.length ? series.borderColors : theme.borderColors;
  const opacity = series.opacity;
  const drawn = { bars: [], legend: [] };
  let along = 0;
  let turn = 0;
  for (const set of sets) {
    const values = set.values;
    // A set with no values has no bars, no colour and no place in a legend.
    if (values.length === 0) continue;
    let fill = set.color.a !== 0 ? set.color : taken(fills, turn);
    let outline = set.borderColor.a !== 0 ? set.borderColor : taken(edges, turn);
    const outlined = set.borderWidth === -1 ? theme.borderWidth : set.borderWidth;
    const label = set.label;
    drawn.legend.push({ color: fill, borderColor: outline, label });
    if (opacity !== 1) {
      fill = faded(fill, opacity);
      outline = faded(outline, opacity);
    }
    // Qt divides by the count of the first set's values: with none there
    // is nowhere to put a bar.
    for (let at = 0; per > 0 && at < values.length; at++) {
      const real = Number(values[at]);
      let value = real * multiplier;
      if (totals?.[at]) value *= 100 / totals[at];
      const long = Math.abs(height * value * unit);
      let x = begin + (at / per) * width + centring;
      let y;
      if (!stacked) {
        x += along;
        y = height - base - (value < 0 ? 0 : long);
      } else if (value >= 0) {
        y = height - long - base - (risen[at] ?? 0);
        risen[at] = (risen[at] ?? 0) + long;
      } else {
        y = height - base + (sunk[at] ?? 0);
        sunk[at] = (sunk[at] ?? 0) + long;
      }
      drawn.bars.push({ x, y, wide, long, fill, outline, outlined, value: real, label });
    }
    along += wide + BETWEEN;
    turn++;
  }
  return drawn;
}

// Whether a legend says of the sets what it said.
function alike(before, after) {
  if (before.length !== after.length) return false;
  return after.every((entry, index) => {
    const old = before[index];
    return old.label === entry.label && equal(old.color, entry.color) && equal(old.borderColor, entry.borderColor);
  });
}

export const GraphsView = defineType("GraphsView", Item, {
  properties: {
    // What it is drawn with: a theme of its own until it is given one.
    theme: null,
    // Between the view's edges and what is in it.
    marginTop: 20,
    marginBottom: 20,
    marginLeft: 20,
    marginRight: 20,
    axisX: null,
    axisY: null,
    // Where the bars are: what the margins and the axes leave.
    plotArea: derived((self) => self.$layout().plot),
    // Whether a bar ends where the plot does.
    clipPlotArea: true,
  },
  resolve: { theme: (self, own) => own() ?? self.$theme },
  setup(self) {
    const root = svg("svg");
    root.setAttribute("class", "qq-plot");
    const back = root.appendChild(svg("g"));
    const marks = root.appendChild(svg("g"));
    const lined = root.appendChild(svg("g"));
    const axes = root.appendChild(svg("g"));
    const labels = document.createElement("div");
    labels.className = "qq-graph-names";
    const field = document.createElement("div");
    field.className = "qq-graph-bars";
    self.$node.append(root, labels, field);

    self.$theme = GraphsTheme({});
    self.$layout = lazy(self, () => arrange(self), NOWHERE);

    effect(
      () => {
        const theme = self.theme;
        return [box(0, 0, self.width, self.height, theme.backgroundVisible ? css(theme.backgroundColor) : null, null, true)];
      },
      (shapes) => draw(back, shapes),
    );
    effect(
      () => grid(self),
      (shapes) => draw(lined, shapes),
    );
    effect(
      () => {
        const { ticksX, ticksY, namesX, namesY } = self.$layout();
        const theme = self.theme;
        const penX = theme.axisX;
        const penY = theme.axisY;
        const across = self.axisX;
        const up = self.axisY;
        const lines = [];
        edge(lines, up, penY, true, ticksY.x + ticksY.width, ticksY.y, ticksY.y + ticksY.height);
        edge(lines, across, penX, false, ticksX.y, ticksX.x, ticksX.x + ticksX.width);
        return { ticks: [...ticks(self, up, penY, ticksY, false, namesY.height), ...ticks(self, across, penX, ticksX, true, namesX.width)], lines };
      },
      ({ ticks, lines }) => {
        draw(marks, ticks);
        draw(axes, lines);
      },
    );

    // The labels are in the view's own coordinates.
    const underNames = pool();
    const besideNames = pool();
    effect(
      () => names(self),
      ({ delegate, shown, font, colour, texts, x, y, wide, high, turned }) =>
        untrack(() => {
          pooled(self, underNames, labels, delegate, name, texts.length);
          for (const [index, { object: item }] of underNames.made.entries()) {
            // Those there are too many of stay, and do not show.
            const visible = shown && index < texts.length;
            put(item, "visible", visible);
            if (!visible) continue;
            put(item, "x", x + index * wide);
            put(item, "y", y);
            put(item, "width", wide);
            put(item, "height", high);
            put(item, "rotation", turned);
            say(item, texts[index], CENTRE, TOP, font, colour);
          }
        }),
    );
    effect(
      () => values(self),
      ({ delegate, shown, font, colour, texts, tops, x, wide, turned }) =>
        untrack(() => {
          pooled(self, besideNames, labels, delegate, name, texts.length);
          for (const [index, { object: item }] of besideNames.made.entries()) {
            const visible = shown && index < texts.length && tops[index] !== null;
            put(item, "visible", visible);
            if (!visible) continue;
            // No height: the text is in the middle of the line it names.
            put(item, "x", x);
            put(item, "y", tops[index]);
            put(item, "width", wide);
            put(item, "height", 0);
            put(item, "rotation", turned);
            say(item, texts[index], RIGHT, MIDDLE, font, colour);
          }
        }),
    );

    // The bars are in the plot's coordinates, and by default end where it does.
    const bar = () => Rectangle({ radius: ROUND });
    const pools = new Map();
    effect(
      () => [self.$layout().plot, self.clipPlotArea],
      ([plot, clip]) => {
        // Moved there as an item is: a place between two pixels is kept so.
        field.style.transform = `translate(${plot.x}px, ${plot.y}px)`;
        field.style.width = `${plot.width}px`;
        field.style.height = `${plot.height}px`;
        field.style.overflow = clip ? "hidden" : "";
      },
    );
    effect(
      () => {
        const all = self.$static.filter(bars);
        return all.map((series, index) => ({ series, delegate: component(series.barDelegate), visible: series.visible, drawn: placed(self, series, index, all.length) }));
      },
      (all) =>
        untrack(() => {
          for (const { series, delegate, visible, drawn } of all) {
            let items = pools.get(series);
            if (!items) pools.set(series, (items = pool()));
            pooled(self, items, field, delegate, bar, drawn.bars.length);
            discard(items, drawn.bars.length);
            for (const [index, { object: item }] of items.made.entries()) {
              const { x, y, wide, long, fill, outline, outlined, value, label } = drawn.bars[index];
              put(item, "x", x);
              put(item, "y", y);
              put(item, "width", wide);
              put(item, "height", long);
              put(item, "visible", visible);
              if (delegate) {
                // What a delegate's item may have properties for.
                put(item, "barColor", fill);
                put(item, "barBorderColor", outline);
                put(item, "barBorderWidth", outlined);
                put(item, "barSelected", false);
                put(item, "barValue", value);
                put(item, "barLabel", label);
                put(item, "barIndex", index);
              } else {
                put(item, "color", fill);
                put(item, "border$color", outline);
                put(item, "border$width", outlined);
              }
            }
            const legend = slot(series, "legendData");
            if (!alike(legend.get(), drawn.legend)) legend.write(drawn.legend);
          }
        }),
    );
  },
});

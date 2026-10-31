// The axes of a graph: what a GraphsView measures its bars against. An axis
// says what it has; where its lines and labels are is the view's to work
// out.
import { defineType, derived, QtObject, settle, slot } from "../object.js";
import { distinct } from "../QtCharts/axes.js";
import { colorValue } from "../QtQuick/color.js";
import { untrack } from "#kernel";

export const AbstractAxis = defineType("AbstractAxis", QtObject, {
  properties: {
    visible: true,
    lineVisible: true,
    labelsVisible: true,
    labelsAngle: 0,
    // What each label is made from: a Text of the theme's when there is none.
    labelDelegate: null,
    gridVisible: true,
    subGridVisible: true,
    // No colours until they are given: the theme's are drawn then.
    color: undefined,
    subColor: undefined,
  },
  resolve: { color: colorValue, subColor: colorValue },
});

// Qt keeps a range in order as it is assigned: a `min` over the `max` takes
// the `max` with it, and a `max` under the `min` the `min`.
const bound = (name, other, past) => ({
  get() {
    return slot(this, name).get();
  },
  set(value) {
    slot(this, name).write(value);
    if (past(untrack(() => this[other]), value)) slot(this, other).write(value);
    settle();
  },
  enumerable: true,
  configurable: true,
});

export const ValueAxis = defineType("ValueAxis", AbstractAxis, {
  properties: {
    min: 0,
    max: 10,
    // How many digits follow the point: as many as the range needs when
    // negative.
    labelDecimals: -1,
    subTickCount: 0,
    // A value that has a tick, and how far apart the ticks are: a tenth of
    // the range or so when nought.
    tickAnchor: 0,
    tickInterval: 0,
  },
  methods: Object.defineProperties(
    {},
    {
      min: bound("min", "max", (max, min) => max < min),
      max: bound("max", "min", (min, max) => min > max),
    },
  ),
});

const NONE = Object.freeze([]);

// Writes the categories `change` makes of the ones there are.
function rewrite(axis, change) {
  const before = untrack(() => axis.categories);
  const names = [...before];
  change(names);
  if (names.length === before.length && names.every((name, index) => name === before[index])) return;
  slot(axis, "categories").write(names);
  settle();
}

export const BarCategoryAxis = defineType("BarCategoryAxis", AbstractAxis, {
  properties: {
    categories: NONE,
    min: derived((self) => self.categories[0] ?? ""),
    max: derived((self) => self.categories.at(-1) ?? ""),
    count: derived((self) => self.categories.length),
    labelPosition: 0,
  },
  enums: { Center: 0, OnValue: 1 },
  resolve: { categories: distinct },
  methods: {
    at(index) {
      return untrack(() => this.categories)[index] ?? "";
    },
    // One category or a list of them. One the axis has already is not added.
    append(categories) {
      rewrite(this, (names) => names.push(...(Array.isArray(categories) ? categories : [categories])));
    },
    insert(index, category) {
      rewrite(this, (names) => {
        if (!names.includes(String(category))) names.splice(Math.max(0, Math.min(index, names.length)), 0, category);
      });
    },
    // The category of a name, or the one at an index.
    remove(category) {
      rewrite(this, (names) => {
        const index = typeof category === "number" ? category : names.indexOf(category);
        if (index >= 0 && index < names.length) names.splice(index, 1);
      });
    },
    replace(old, category) {
      rewrite(this, (names) => {
        const index = names.indexOf(old);
        if (index >= 0 && !names.includes(String(category))) names[index] = category;
      });
    },
    clear() {
      slot(this, "categories").write(NONE);
      settle();
    },
  },
});

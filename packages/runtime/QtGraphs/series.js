// What a graph shows: bars in sets, and the mapper that makes sets of a
// model's cells. A series keeps its sets; the GraphsView it is in works out
// where their bars are and what colours they have.
import { onCleanup, runWithOwner } from "solid-js";
import { contents, defineType, derived, effect, QtObject, settle, slot } from "../object.js";
import { color, colorValue } from "../QtQuick/color.js";
import { untrack } from "#kernel";

const next = (version) => version + 1;
const NONE = Object.freeze([]);

const is = (object, Type) => object?.$type?.chain.includes(Type) === true;

// Writes the values `change` makes of the ones a set has.
function revalue(set, change) {
  const values = [...untrack(() => set.values)];
  change(values);
  slot(set, "values").write(values);
  settle();
}

export const BarSet = defineType("BarSet", QtObject, {
  properties: {
    label: "",
    // No colour until one is given: its series' or the theme's is drawn.
    color: "transparent",
    borderColor: "transparent",
    // The theme's until one is given: a width that is given is nought at
    // the least, and so there is no giving the theme's back.
    borderWidth: -1,
    values: NONE,
    count: derived((self) => self.values.length),
  },
  resolve: {
    color: colorValue,
    borderColor: colorValue,
    borderWidth: (self, own) => (slot(self, "borderWidth").explicit() ? Math.max(0, own()) : -1),
  },
  methods: {
    at(index) {
      return Number(untrack(() => this.values)[index] ?? 0);
    },
    // One value or a list of them.
    append(value) {
      revalue(this, (values) => values.push(...(Array.isArray(value) ? value : [value])));
    },
    insert(index, value) {
      revalue(this, (values) => values.splice(Math.max(0, Math.min(index, values.length)), 0, value));
    },
    remove(index, count = 1) {
      if (index < 0) return;
      revalue(this, (values) => values.splice(index, Math.max(0, count)));
    },
    replace(index, value) {
      if (index < 0 || index >= untrack(() => this.values).length) return;
      revalue(this, (values) => (values[index] = value));
    },
    sum() {
      let total = 0;
      for (const value of untrack(() => this.values)) total += Number(value);
      return total;
    },
    clear() {
      slot(this, "values").write(NONE);
      settle();
    },
  },
});

// A list of colours as colour values. The list it was given is looked
// through once.
const lists = new WeakMap();
function colours(self, own) {
  const given = own();
  if (given === NONE) return given;
  let made = lists.get(given);
  if (!made) lists.set(given, (made = Array.from(given, color)));
  return made;
}

// The sets changed: whoever counts or draws them does so again.
function changed(series) {
  series.$touch(next);
  settle();
}

export const BarSeries = defineType("BarSeries", QtObject, {
  properties: {
    name: "",
    visible: true,
    opacity: 1,
    // What every value is multiplied by: from nought to one.
    valuesMultiplier: 1,
    // The sets take these in turn, where there are any; the theme's else.
    seriesColors: NONE,
    borderColors: NONE,
    barsType: 0,
    // How much of the room a bar has it takes.
    barWidth: 0.5,
    // What each bar is made from: a rounded Rectangle when there is none.
    barDelegate: null,
    count: derived((self) => (self.$track(), self.$sets.length)),
    barSets: derived((self) => (self.$track(), self.$sets)),
    // What a legend shows of each set: `color`, `borderColor` and `label`.
    // Its graph says, and so it is empty in a series no graph has.
    legendData: NONE,
  },
  enums: { Groups: 0, Stacked: 1, StackedPercent: 2 },
  resolve: {
    seriesColors: colours,
    borderColors: colours,
    valuesMultiplier: (self, own) => Math.max(0, Math.min(1, own())),
  },
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
    find(set) {
      return this.$sets.indexOf(set);
    },
    // One set or a list of them. A set is in a series once.
    append(sets) {
      const added = (Array.isArray(sets) ? sets : [sets]).filter((set, index, all) => is(set, BarSet) && !this.$sets.includes(set) && all.indexOf(set) === index);
      if (added.length === 0 || (Array.isArray(sets) && added.length !== sets.length)) return false;
      this.$sets = [...this.$sets, ...added];
      changed(this);
      return true;
    },
    insert(index, set) {
      if (!is(set, BarSet) || this.$sets.includes(set)) return false;
      this.$sets = this.$sets.toSpliced(Math.max(0, Math.min(index, this.$sets.length)), 0, set);
      changed(this);
      return true;
    },
    // The set itself, or the one at an index.
    remove(set) {
      const index = typeof set === "number" ? set : this.$sets.indexOf(set);
      if (!(index >= 0 && index < this.$sets.length)) return false;
      this.$sets = this.$sets.toSpliced(index, 1);
      changed(this);
      return true;
    },
    take(set) {
      return this.remove(this.$sets.indexOf(set));
    },
    removeMultiple(index, count) {
      if (index < 0 || count < 0 || index + count > this.$sets.length) return;
      this.$sets = this.$sets.toSpliced(index, count);
      changed(this);
    },
    // A set for the one at an index, or for another set; or a list of sets
    // for all there are.
    replace(old, set) {
      if (Array.isArray(old)) {
        if (!old.every((each) => is(each, BarSet))) return false;
        this.$sets = [...new Set(old)];
        changed(this);
        return true;
      }
      const index = typeof old === "number" ? old : this.$sets.indexOf(old);
      if (!(index >= 0 && index < this.$sets.length) || !is(set, BarSet) || this.$sets.includes(set)) return false;
      this.$sets = this.$sets.with(index, set);
      changed(this);
      return true;
    },
    clear() {
      if (this.$sets.length === 0) return;
      this.$sets = [];
      changed(this);
    },
  },
});

export const bars = (child) => is(child, BarSeries);

const HORIZONTAL = 1;
const VERTICAL = 2;

// The cell a set's value is in: the set is a column of the model and the
// value so many rows down it, or a row and so many columns along.
function cell(self, model, section, at) {
  const count = self.count;
  if (count !== -1 && at >= count) return null;
  const index = self.orientation === VERTICAL ? model.index(at + self.first, section) : model.index(section, at + self.first);
  return index?.valid ? index : null;
}

// What a cell says. A list model that has no `data` is asked for the first
// of its roles: Qt's ListModel answers the display role with the role it
// numbers nought, which is the first of an element that was appended (and
// the last of the first ListElement, which is not known here).
function said(model, index) {
  if (typeof model.data === "function") return model.data(index, 0);
  return model.$elements?.[index.row]?.[model.$roles[0]];
}

// The name of a set: what the model has beside the row, or over the column,
// it is made of. A model that says nothing numbers them from one, as Qt's
// do.
function named(model, section, orientation) {
  if (typeof model.headerData === "function") return String(model.headerData(section, orientation, 0) ?? "");
  return String(section + 1);
}

// What the series is to have: a name and values for each section from the
// first to the last that has a cell, as many values as it has cells.
// Nothing without a model or a series: the series keeps its sets then.
// QBarModelMapperPrivate::initializeBarsFromModel.
function mapped(self) {
  self.$track();
  const model = self.model;
  const series = self.series;
  if (!model || !series) return null;
  const across = self.orientation === VERTICAL ? HORIZONTAL : VERTICAL;
  const sets = [];
  for (let section = self.firstBarSetSection; section <= self.lastBarSetSection; section++) {
    let index = cell(self, model, section, 0);
    if (!index) break;
    const values = [];
    while (index) {
      values.push(Number(said(model, index)) || 0);
      index = cell(self, model, section, values.length);
    }
    sets.push({ label: named(model, section, across), values });
  }
  return { series, sets };
}

// Gives the series those sets, in place of what it has. The sets made for
// a series are kept and said anew: Qt makes new ones each time.
function fill(self, drawn) {
  if (!drawn) return;
  const { series, sets } = drawn;
  if (self.$made?.series !== series) self.$made = { series, sets: [] };
  const made = self.$made.sets;
  untrack(() => {
    for (let at = 0; at < sets.length; at++) {
      made[at] ??= runWithOwner(series.$owner, () => BarSet({}));
      slot(made[at], "label").write(sets[at].label);
      slot(made[at], "values").write(sets[at].values);
    }
  });
  series.$sets = made.slice(0, sets.length);
  changed(series);
}

// What a model says when what the mapper read of it is no longer so, as a
// QAbstractItemModel does. Qt's mapper hears nothing of rows moved.
const HEARD = ["modelReset", "dataChanged", "headerDataChanged", "rowsInserted", "rowsRemoved", "columnsInserted", "columnsRemoved"];

// Hears of the model's changes from now on, and no more of the one before.
// A list model tells of its rows; what a row says tells its readers itself.
function follow(self, model) {
  if (model === self.$heard) return;
  self.$heard = model;
  self.$deaf?.();
  self.$deaf = null;
  const again = () => {
    self.$touch(next);
    settle();
  };
  if (typeof model?.$observe === "function") {
    self.$deaf = model.$observe({ inserted: again, removed: again, moved() {}, role() {} });
    return;
  }
  const heard = HEARD.filter((name) => typeof model?.[name]?.connect === "function");
  for (const name of heard) model[name].connect(again);
  self.$deaf = () => {
    for (const name of heard) model[name].disconnect(again);
  };
}

const MAPPED = ["model", "series", "firstBarSetSection", "lastBarSetSection", "first", "count", "orientation"];

// Qt fills the series whenever one of these is assigned, be it what the
// property was already: a program that cleared the series asks for the
// same cells again.
const assigned = (name) => ({
  get() {
    return slot(this, name).get();
  },
  set(value) {
    slot(this, name).write(value);
    this.$touch(next);
    settle();
  },
  enumerable: true,
  configurable: true,
});

export const BarModelMapper = defineType("BarModelMapper", QtObject, {
  properties: {
    model: null,
    series: null,
    // The first and the last column (or row) that is a set: none when
    // negative.
    firstBarSetSection: -1,
    lastBarSetSection: -1,
    // The first row (or column) that is a value, and how many are: all
    // there are when the count is negative.
    first: 0,
    count: -1,
    // Whether a set is a column of the model, or a row.
    orientation: VERTICAL,
  },
  resolve: {
    firstBarSetSection: (self, own) => Math.max(-1, own()),
    lastBarSetSection: (self, own) => Math.max(-1, own()),
    first: (self, own) => Math.max(0, own()),
    count: (self, own) => Math.max(-1, own()),
  },
  methods: Object.defineProperties({}, Object.fromEntries(MAPPED.map((name) => [name, assigned(name)]))),
  setup(self) {
    onCleanup(() => self.$deaf?.());
    effect(
      () => self.model,
      (model) => follow(self, model),
    );
    effect(
      () => mapped(self),
      (drawn) => fill(self, drawn),
    );
  },
});

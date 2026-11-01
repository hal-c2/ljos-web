// `ItemSelectionModel`: which cells of a model are selected, and which one
// is current.
import { onCleanup } from "solid-js";
import { defineType, effect, QtObject, slot } from "../object.js";
import { columnsOf, modelIndex, moved, rowsOf } from "./model.js";
import { settle } from "./settle.js";
import { untrack } from "#kernel";

const NO_UPDATE = 0;
const CLEAR = 1;
const SELECT = 2;
const DESELECT = 4;
const TOGGLE = 8;
const CURRENT = 16;
const ROWS = 32;
const COLUMNS = 64;

const NOWHERE = modelIndex(null, -1);
const NONE = Object.freeze([]);

// A cell of `model` as the selection keeps it: one object per cell, whatever
// object the model itself gives for it, so that `===` tells two apart.
const own = (model, index) => (model && index?.valid && index.model === model ? modelIndex(model, index.row, index.column) : NOWHERE);

// A model that tells of its rows with signals, as a QAbstractItemModel does,
// tells the observer. Gives what stops it.
function listen(model, observer) {
  const heard = {
    rowsInserted: (parent, first, last) => observer.inserted(first, last - first + 1),
    rowsRemoved: (parent, first, last) => observer.removed(first, last - first + 1),
    // The rows are put before `row`, counted while they are still there.
    rowsMoved: (parent, first, last, destination, row) => observer.moved(first, row > first ? row - (last - first + 1) : row, last - first + 1),
    modelReset: () => observer.reset(),
  };
  const undo = [];
  for (const name of Object.keys(heard)) {
    const emitted = model?.[name];
    if (typeof emitted?.connect !== "function") continue;
    emitted.connect(heard[name]);
    undo.push(() => emitted.disconnect(heard[name]));
  }
  return undo.length ? () => undo.forEach((stop) => stop()) : null;
}

// A selection is made in two steps, as Qt makes it: what is settled, and
// the cells of the last command, which a command with `Current` replaces
// (a selection being dragged out) and any other settles first.
function merge(settled, cells, command) {
  if (!cells.length) return settled;
  if (command & SELECT) return [...settled.filter((cell) => !cells.includes(cell)), ...cells];
  if (command & DESELECT) return settled.filter((cell) => !cells.includes(cell));
  if (command & TOGGLE) {
    return [...settled.filter((cell) => !cells.includes(cell)), ...cells.filter((cell) => !settled.includes(cell))];
  }
  return settled;
}

const selection = (self) => merge(self.$settled, self.$last, self.$command);

// Says what the selection now is, and what of it is new and what is gone,
// if anything is.
function publish(self, before, quietly) {
  const after = selection(self);
  const selected = after.filter((cell) => !before.includes(cell));
  const deselected = before.filter((cell) => !after.includes(cell));
  if (!selected.length && !deselected.length) return;
  slot(self, "selectedIndexes").write(after);
  slot(self, "hasSelection").write(after.length > 0);
  if (!quietly) self.selectionChanged(selected, deselected);
}

// `another` says the row is another one though it has the number the one
// before had: that one went.
function current(self, index, previous, another) {
  slot(self, "currentIndex").write(index);
  self.currentChanged(index, previous);
  if (another || index.row !== previous.row) self.currentRowChanged(index, previous);
  if (index.column !== previous.column) self.currentColumnChanged(index, previous);
}

function forget(self) {
  self.$settled = [];
  self.$last = [];
  self.$command = NO_UPDATE;
  slot(self, "selectedIndexes").write(NONE);
  slot(self, "hasSelection").write(false);
  slot(self, "currentIndex").write(NOWHERE);
}

// Every cell where its row now is: `shift` gives a row's new number, or -1
// for one that is gone. Gives the cells that went.
function reindex(self, model, shift) {
  const gone = [];
  const place = (cells) =>
    cells.flatMap((cell) => {
      const row = shift(cell.row);
      if (row >= 0) return [modelIndex(model, row, cell.column)];
      gone.push(cell);
      return [];
    });
  self.$settled = place(self.$settled);
  self.$last = place(self.$last);
  return gone;
}

export const ItemSelectionModel = defineType("ItemSelectionModel", QtObject, {
  properties: { model: null, hasSelection: false, currentIndex: NOWHERE, selectedIndexes: NONE },
  enums: {
    NoUpdate: NO_UPDATE,
    Clear: CLEAR,
    Select: SELECT,
    Deselect: DESELECT,
    Toggle: TOGGLE,
    Current: CURRENT,
    Rows: ROWS,
    Columns: COLUMNS,
    SelectCurrent: SELECT | CURRENT,
    ToggleCurrent: TOGGLE | CURRENT,
    ClearAndSelect: CLEAR | SELECT,
  },
  signals: ["selectionChanged", "currentChanged", "currentRowChanged", "currentColumnChanged"],
  methods: {
    // `index` is a cell, or a list of them: Qt's QItemSelection.
    select(index, command) {
      command = Number(command) || NO_UPDATE;
      if (command === NO_UPDATE) return;
      const model = untrack(() => this.model);
      let cells = (Array.isArray(index) ? index : [index]).map((cell) => own(model, cell)).filter((cell) => cell.valid);
      cells = [...new Set(cells)];
      if (command & ROWS) {
        const columns = columnsOf(model);
        const rows = [...new Set(cells.map((cell) => cell.row))];
        cells = rows.flatMap((row) => Array.from({ length: columns }, (_, column) => modelIndex(model, row, column)));
      }
      if (command & COLUMNS) {
        const rows = rowsOf(model);
        const columns = [...new Set(cells.map((cell) => cell.column))];
        cells = columns.flatMap((column) => Array.from({ length: rows }, (_, row) => modelIndex(model, row, column)));
      }
      const before = selection(this);
      if (command & CLEAR) {
        this.$settled = [];
        this.$last = [];
      }
      if (!(command & CURRENT)) {
        this.$settled = selection(this);
        this.$last = [];
      }
      if (command & (SELECT | DESELECT | TOGGLE)) {
        this.$command = command;
        this.$last = cells;
      }
      publish(this, before);
      settle();
    },
    setCurrentIndex(index, command) {
      const model = untrack(() => this.model);
      if (!model) return;
      index = own(model, index);
      const previous = untrack(() => this.currentIndex);
      if (index === previous) return this.select(index, command);
      slot(this, "currentIndex").write(index);
      this.select(index, command);
      current(this, index, previous);
      settle();
    },
    clearCurrentIndex() {
      const previous = untrack(() => this.currentIndex);
      if (!previous.valid) return;
      current(this, NOWHERE, previous);
      settle();
    },
    clearSelection() {
      const before = selection(this);
      this.$settled = [];
      this.$last = [];
      publish(this, before);
      settle();
    },
    clear() {
      this.clearSelection();
      this.clearCurrentIndex();
    },
    // The same, and nobody is told.
    reset() {
      forget(this);
      settle();
    },
    isSelected(index) {
      const model = this.model;
      return this.selectedIndexes.includes(own(model, index));
    },
    isRowSelected(row) {
      const model = this.model;
      const columns = columnsOf(model);
      const selected = this.selectedIndexes;
      for (let column = 0; column < columns; column++) {
        if (!selected.includes(modelIndex(model, row, column))) return false;
      }
      return columns > 0 && row >= 0 && row < rowsOf(model);
    },
    isColumnSelected(column) {
      const model = this.model;
      const rows = rowsOf(model);
      const selected = this.selectedIndexes;
      for (let row = 0; row < rows; row++) {
        if (!selected.includes(modelIndex(model, row, column))) return false;
      }
      return rows > 0 && column >= 0 && column < columnsOf(model);
    },
    rowIntersectsSelection(row) {
      return this.selectedIndexes.some((cell) => cell.row === row);
    },
    columnIntersectsSelection(column) {
      return this.selectedIndexes.some((cell) => cell.column === column);
    },
    // The rows that are selected in every column, as cells of `column`.
    selectedRows(column = 0) {
      const rows = new Set(this.selectedIndexes.map((cell) => cell.row));
      return [...rows].filter((row) => this.isRowSelected(row)).map((row) => modelIndex(this.model, row, column));
    },
    selectedColumns(row = 0) {
      const columns = new Set(this.selectedIndexes.map((cell) => cell.column));
      return [...columns].filter((column) => this.isColumnSelected(column)).map((column) => modelIndex(this.model, row, column));
    },
  },
  setup(self) {
    self.$settled = [];
    self.$last = [];
    self.$command = NO_UPDATE;
    let followed;
    let unobserve = null;
    onCleanup(() => unobserve?.());
    // What is selected stays with its row as rows come, go and move. Gives
    // the cells whose rows went.
    const follow = (model, shift) => {
      const before = selection(self);
      const gone = reindex(self, model, shift);
      const after = selection(self);
      if (before.length) slot(self, "selectedIndexes").write(after);
      slot(self, "hasSelection").write(after.length > 0);
      const was = untrack(() => self.currentIndex);
      const row = was.valid ? shift(was.row) : -1;
      if (row >= 0) slot(self, "currentIndex").write(modelIndex(model, row, was.column));
      return gone;
    };
    const observer = (model) => ({
      inserted(index, count) {
        follow(model, (row) => (row >= index ? row + count : row));
      },
      removed(index, count) {
        const was = untrack(() => self.currentIndex);
        const gone = follow(model, (row) => (row < index ? row : row < index + count ? -1 : row - count));
        if (was.valid && was.row >= index && was.row < index + count) {
          // The current row went: the one after it is current now, or the
          // one before when it was the last.
          const rows = rowsOf(model);
          current(self, modelIndex(model, index < rows ? index : index - 1, was.column), was, true);
        }
        if (gone.length) self.selectionChanged([], gone);
      },
      moved(from, to, count) {
        follow(model, (row) => moved(row, from, to, count));
      },
      role() {},
      // A model that is another one altogether: Qt forgets, and tells nobody.
      reset() {
        forget(self);
      },
    });
    effect(
      () => self.model,
      (model) => {
        if (model === followed) return;
        // Another model: nothing of the one before means anything in it.
        if (followed !== undefined) forget(self);
        followed = model;
        unobserve?.();
        unobserve = (model?.$observe ? model.$observe(observer(model)) : listen(model, observer(model))) ?? null;
      },
    );
  },
});

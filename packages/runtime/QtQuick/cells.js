// What a TableView shows: a model of rows and columns, whatever it was
// given as, and what a delegate is told of its cell.
import { columnsOf, modelIndex, moved, rowsOf, touch, track } from "./model.js";
import { untrack } from "#kernel";

const NONE = 0;
const NUMBER = 1;
const ARRAY = 2;
const LIST = 3;
const COUNTED = 4;
const TABLE = 5;

const NOWHERE = modelIndex(null, -1);

// The roles of a QAbstractItemModel that says none.
const ROLES = { 0: "display", 1: "decoration", 2: "edit", 3: "toolTip", 4: "statusTip", 5: "whatsThis" };

// What a delegate has whatever the model: a role of one of these names is
// not reached by it.
const OWN = ["row", "column", "index", "model", "modelData", "hasModelChildren", "selected", "current", "editing"];

function kindOf(source) {
  if (typeof source === "number") return NUMBER;
  if (Array.isArray(source)) return ARRAY;
  if (!source || typeof source !== "object") return NONE;
  // What answers as a QAbstractItemModel does: a TableModel, or an object
  // written to be asked the same.
  if (typeof source.data === "function" && typeof source.index === "function") return TABLE;
  if (source.$elements && source.$observe) return LIST;
  if (typeof source.get === "function" && "count" in source) return COUNTED;
  return NONE;
}

// Whether a model answers as a QAbstractItemModel does: it has cells that
// are told apart by an index.
export const tabular = (source) => kindOf(source) === TABLE;
export const indexed = (source) => kindOf(source) === TABLE || kindOf(source) === LIST;

// The cell a delegate is being made for. The compiler binds what a delegate
// requires of it; a delegate type Qt has in C++ (`TableViewDelegate`) that
// is made without those bindings takes its cell from here as it is made.
let made = null;
export const making = () => made;
export function make(cell, work) {
  const before = made;
  made = cell;
  try {
    return work();
  } finally {
    made = before;
  }
}

// A cell's data: `row`, `column`, `index`, `model`, and the roles its table
// adds. `$row` and `$column` are where it is in the model, and they change
// when its delegate is used again for another cell.
const Cell = Object.create(null, {
  row: {
    get() {
      track(this, "at");
      return this.$row;
    },
    enumerable: true,
  },
  column: {
    get() {
      track(this, "at");
      return this.$column;
    },
    enumerable: true,
  },
  index: {
    get() {
      track(this, "at");
      track(this.$of, "size");
      return this.$column * this.$of.rows() + this.$row;
    },
    enumerable: true,
  },
  model: {
    get() {
      return this;
    },
    enumerable: true,
  },
  selected: {
    get() {
      track(this, "at");
      return this.$view.$selected(this.$row, this.$column);
    },
  },
  current: {
    get() {
      track(this, "at");
      return this.$view.$current(this.$row, this.$column);
    },
  },
  editing: { value: false },
  // What Qt's views set on a delegate that requires them.
  tableView: {
    get() {
      return this.$view;
    },
  },
  headerView: {
    get() {
      return this.$view.$header ? this.$view : undefined;
    },
  },
});

// What a cell reads of one role, which a model may say alone has changed.
const ofRole = (name) => `role ${name}`;

function role(proto, name, read, write) {
  if (OWN.includes(name)) return;
  const own = ofRole(name);
  Object.defineProperty(proto, name, {
    get() {
      track(this, "at");
      track(this, "data");
      track(this, own);
      return read(this.$row, this.$column, name);
    },
    set(value) {
      write?.(this.$row, this.$column, name, value);
    },
    enumerable: true,
    configurable: true,
  });
}

function data(proto, name, read) {
  Object.defineProperty(proto, name, {
    get() {
      track(this, "at");
      track(this, "data");
      return read(this.$row, this.$column);
    },
    enumerable: true,
    configurable: true,
  });
}

export const SAME = (line) => line;
const EVERYWHERE = () => true;
const inserted = (index, count) => (line) => (line >= index ? line + count : line);
const removed = (index, count) => (line) => (line < index ? line : line < index + count ? -1 : line - count);

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export class Table {
  constructor(view, source) {
    const kind = kindOf(source);
    const proto = Object.create(Cell);
    this.source = source;
    this.kind = kind;
    this.proto = proto;
    proto.$view = view;
    proto.$of = this;
    if (kind === NUMBER) data(proto, "modelData", (row) => row);
    else if (kind === ARRAY) {
      data(proto, "modelData", (row) => source[row]);
      const first = source[0];
      if (isObject(first)) for (const name of Object.keys(first)) role(proto, name, (row) => source[row]?.[name]);
    } else if (kind === COUNTED) data(proto, "modelData", (row) => source.get(row));
    else if (kind === LIST) {
      for (const name of source.$roles) this.listRole(name);
      // A list of one role is also a list of values.
      data(proto, "modelData", (row) => {
        const roles = source.$roles;
        return roles.length === 1 ? source.$elements[row]?.[roles[0]] : undefined;
      });
      proto.hasModelChildren = false;
    } else if (kind === TABLE) {
      // The names of its roles, by number.
      this.names = {};
      this.learn();
      // A table of one role is also a table of values.
      data(proto, "modelData", (row, column) => {
        const numbers = Object.keys(this.names);
        return numbers.length === 1 ? this.read(row, column, Number(numbers[0])) : undefined;
      });
      proto.hasModelChildren = false;
    }
  }

  // What a table model has in a cell for a role. A delegate reads it again
  // when the model says it changed, as in Qt, and not when what the model
  // made it from did: its cell may be gone by then, for the model to say.
  read(row, column, role) {
    const source = this.source;
    return untrack(() => source.data(source.index(row, column), role));
  }

  // The roles a table model has now: one that learns them from its rows has
  // none until it has a row.
  learn() {
    const source = this.source;
    const names = source.roleNames?.() ?? ROLES;
    for (const key of Object.keys(names)) {
      if (key in this.names) continue;
      const number = Number(key);
      this.names[key] = String(names[key]);
      role(
        this.proto,
        this.names[key],
        (row, column) => this.read(row, column, number),
        (row, column, name, value) => source.setData?.(source.index(row, column), value, number),
      );
    }
  }

  listRole(name) {
    const source = this.source;
    role(
      this.proto,
      name,
      (row) => source.$elements[row]?.[name],
      (row, column, role, value) => source.setProperty(row, role, value),
    );
  }

  // Whether a selection model can tell its cells: they have indexes.
  get indexed() {
    return indexed(this.source);
  }

  rows() {
    const source = this.source;
    switch (this.kind) {
      case NUMBER:
        return Math.max(0, Math.floor(source)) || 0;
      case ARRAY:
        return source.length;
      case COUNTED:
        return Number(source.count) || 0;
      case LIST:
        return source.$elements.length;
      case TABLE:
        return rowsOf(source);
      default:
        return 0;
    }
  }

  columns() {
    return this.kind === TABLE ? columnsOf(this.source) : 1;
  }

  // A cell of the model as a view and a selection model tell of it: one
  // object for a cell, whatever the model's own `index()` gives.
  index(row, column) {
    return this.indexed ? modelIndex(this.source, row, column) : NOWHERE;
  }

  // Tells `listener` of what the model says changed in it: `reset()`,
  // `rows(shift)`, `columns(shift)`, `moved(rows, columns)` and
  // `data(within, roles)`, where a shift gives a row's new number, or -1 for
  // one that is gone, `within(row, column)` says whether a cell is one of
  // those that changed and `roles` names what changed of it, when the model
  // said: all of every cell when it did not. Gives what stops it.
  watch(listener) {
    const source = this.source;
    if (this.kind === LIST) {
      return source.$observe({
        inserted: (index, count) => listener.rows(inserted(index, count)),
        removed: (index, count) => listener.rows(removed(index, count)),
        moved: (from, to, count) => listener.moved((row) => moved(row, from, to, count), SAME),
        role: (name) => {
          if (!(name in this.proto)) this.listRole(name);
        },
      });
    }
    if (this.kind !== TABLE) return null;
    // As a QAbstractItemModel says them: `(parent, first, last)`, and for
    // a move the line they are put before, counted while they are there.
    const between = (first, last, before) => (line) => moved(line, first, before > first ? before - (last - first + 1) : before, last - first + 1);
    const heard = {
      modelReset: () => {
        this.learn();
        listener.reset();
      },
      rowsInserted: (parent, first, last) => {
        this.learn();
        listener.rows(inserted(first, last - first + 1));
      },
      rowsRemoved: (parent, first, last) => listener.rows(removed(first, last - first + 1)),
      columnsInserted: (parent, first, last) => listener.columns(inserted(first, last - first + 1)),
      columnsRemoved: (parent, first, last) => listener.columns(removed(first, last - first + 1)),
      rowsMoved: (parent, first, last, destination, before) => listener.moved(between(first, last, before), SAME),
      columnsMoved: (parent, first, last, destination, before) => listener.moved(SAME, between(first, last, before)),
      // Anything may be anywhere.
      layoutChanged: () => listener.moved(),
      dataChanged: (from, to, roles) => {
        if (!from?.valid || !to?.valid) return listener.data(EVERYWHERE);
        const within = (row, column) => row >= from.row && row <= to.row && column >= from.column && column <= to.column;
        const names = [];
        for (const number of roles ?? []) if (number in this.names) names.push(this.names[number]);
        listener.data(within, names.length === (roles?.length ?? 0) ? names : []);
      },
    };
    const undo = [];
    for (const name of Object.keys(heard)) {
      const emitted = source[name];
      if (typeof emitted?.connect !== "function") continue;
      const told = heard[name];
      emitted.connect(told);
      undo.push(() => emitted.disconnect(told));
    }
    return () => undo.forEach((stop) => stop());
  }

  // A cell's data, for a delegate that is made for it.
  cell(row, column) {
    const cell = Object.create(this.proto);
    cell.$row = row;
    cell.$column = column;
    return cell;
  }

  // The same data for another cell: what was read of it is read again.
  move(cell, row, column) {
    cell.$row = row;
    cell.$column = column;
    touch(cell, "at");
  }
}

// Reads what says how large a model is, for a view that depends on it when
// the model tells of no change.
export function depend(source) {
  const kind = kindOf(source);
  if (kind === ARRAY) return source.length;
  if (kind === COUNTED) return source.count;
  return kind === TABLE ? rowsOf(source) + columnsOf(source) : 0;
}

// What a delegate read of its cell is read again: all of it, or the roles
// that are named.
export function changed(cell, roles) {
  if (!roles?.length) touch(cell, "data");
  else for (const name of roles) touch(cell, ofRole(name));
}
export const resized = (table) => touch(table, "size");

// `import Qt.labs.qmlmodels`: TableModel, a table whose rows are JavaScript
// objects, and TableModelColumn, which says what of a row a column shows.
//
// As in Qt (qqmltablemodel.cpp, qqmlabstractcolumnmodel.cpp): the roles a
// column has, and the type of what each holds, are learnt from the first row
// the model is given, and a row given later has to be like it.
import { contents, defineType, effect, QtObject, slot, whenComplete } from "../../../object.js";
import { modelIndex } from "../../../QtQuick/model.js";
import { settle } from "../../../QtQuick/settle.js";
import { signal, untrack } from "#kernel";

const next = (version) => version + 1;
const NOWHERE = modelIndex(null, -1);

// The roles a column may give, each at Qt's number for it.
const ROLES = [
  "display",
  "decoration",
  "edit",
  "toolTip",
  "statusTip",
  "whatsThis",
  "font",
  "textAlignment",
  "background",
  "foreground",
  "checkState",
  "accessibleText",
  "accessibleDescription",
  "sizeHint",
];
const EDIT = 2;

// `Qt.ItemIsSelectable | Qt.ItemIsEnabled | Qt.ItemIsEditable`.
const FLAGS = 35;

// `TableModelColumn { display: "name" }`: a role is the name of a property of
// the row, or a function that is given the cell's index.
export const TableModelColumn = defineType("TableModelColumn", QtObject, {
  properties: Object.fromEntries(ROLES.map((name) => [name, undefined])),
});

const warn = (text) => console.warn(`QML TableModel: ${text}`);

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// A row is the model's own once it is given: changing the object it was made
// from changes nothing.
const copy = (row) => (isObject(row) ? { ...row } : row);

const alike = (a, b) => {
  if (Object.is(a, b)) return true;
  if (!isObject(a) || !isObject(b)) return false;
  const names = Object.keys(a);
  return names.length === Object.keys(b).length && names.every((name) => Object.is(a[name], b[name]));
};
const same = (rows, others) => rows.length === others.length && rows.every((row, at) => alike(row, others[at]));

// The type Qt holds a value from JavaScript as: what its warnings name.
function typeOf(value) {
  if (value === undefined) return "";
  if (value === null) return "std::nullptr_t";
  if (typeof value === "string") return "QString";
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "double";
  if (typeof value === "boolean") return "bool";
  return Array.isArray(value) ? "QVariantList" : "QVariantMap";
}

function jsType(value) {
  if (Array.isArray(value)) return "array";
  return value === null ? "null" : typeof value;
}

const shown = (value) => `QVariant(${typeOf(value)}, ${typeof value === "string" ? JSON.stringify(value) : value})`;

// Whether a value can be held where the first row had one of `type`: one of
// these can be made of another, except a number of a text that is none.
const SCALARS = ["QString", "int", "double", "bool"];
const FITS = 0;
const CANNOT = 1;
const FAILS = 2;

function fits(value, type) {
  const given = typeOf(value);
  if (given === type || value === null) return FITS;
  if (!SCALARS.includes(given) || !SCALARS.includes(type)) return CANNOT;
  if (given !== "QString") return FITS;
  if (type === "int") return /^\s*[+-]?\d+\s*$/.test(value) ? FITS : FAILS;
  if (type === "double") return value.trim() !== "" && !Number.isNaN(Number(value)) ? FITS : FAILS;
  return FITS;
}

// What each column has for a role: Qt's `fetchColumnMetadata`.
function learn(self) {
  const m = self.$model;
  const first = m.rows[0];
  m.getters.forEach((getters, column) => {
    const roles = {};
    ROLES.forEach((name, number) => {
      const getter = getters[name];
      if (getter === undefined) return;
      let found;
      if (typeof getter === "string") {
        if (!isObject(first)) {
          warn(
            `expected row for role "${name}" of TableModelColumn at index ${column} to be a simple object, but it's ${typeOf(first)} instead: ${shown(first)}`,
          );
          return;
        }
        found = { name: getter, type: typeOf(first[getter]), string: true };
      } else found = { name: "", type: typeOf(getter(modelIndex(self, 0, column))), string: false };
      if (!found.type) return;
      roles[name] = found;
      m.names[number] = name;
    });
    m.metadata[column] = roles;
  });
}

// Whether a row is like the first: Qt's `validateNewRow`.
function valid(self, asked, row, setting = false) {
  const m = self.$model;
  if (!m.metadata.length) return true;
  if (!setting && (row === null || typeof row !== "object")) {
    warn(`${asked}: expected "row" argument to be a QJSValue, but got ${typeOf(row)} instead:\n${shown(row)}`);
    return false;
  }
  if (!isObject(row)) {
    warn(`${asked}: row manipulation functions do not support complex rows`);
    return false;
  }
  const given = Object.keys(row).length;
  if (given < m.columns.length) {
    warn(`${asked}: expected ${m.columns.length} columns, but only got ${given}`);
    return false;
  }
  for (const [column, roles] of m.metadata.entries()) {
    for (const role of Object.values(roles)) {
      if (!role.string) continue;
      if (!Object.hasOwn(row, role.name)) {
        warn(`${asked}: expected a property named "${role.name}" in row`);
        return false;
      }
      const value = row[role.name];
      const fit = fits(value, role.type);
      if (fit === CANNOT) {
        warn(`${asked}: expected the property named "${role.name}" to be of type "${role.type}", but got "${typeOf(value)}" instead`);
        return false;
      }
      if (fit === FAILS) {
        const type = typeOf(value);
        warn(`${asked}: failed converting value "QVariant(${type}, ${value})" set at column ${column} with role "${type}" to "${role.type}"`);
        return false;
      }
    }
  }
  return true;
}

// Whether a row is one there is, or with `append` one that could be added.
function within(self, asked, argument, row, append = false) {
  const count = self.$model.rows.length;
  if (row < 0) {
    warn(`${asked}: "${argument}" cannot be negative`);
    return false;
  }
  if (append ? row > count : row >= count) {
    warn(`${asked}: "${argument}" ${row} is greater than ${append ? "" : "or equal to "}rowCount() of ${count}`);
    return false;
  }
  return true;
}

const counted = (self) => slot(self, "rowCount").write(self.$model.rows.length);

// All the rows at once: Qt's `setRowsPrivate`.
function fill(self, rows) {
  const m = self.$model;
  if (!m.columns.length) return warn("No TableModelColumns were set; model will be empty");
  const first = !m.metadata.length;
  if (!first) for (const row of rows) if (!valid(self, "setRows()", row, true)) return;
  self.modelAboutToBeReset();
  m.rows = rows.map(copy);
  counted(self);
  if (first && rows.length) learn(self);
  m.bump(next);
  self.modelReset();
  settle();
}

function assign(self, rows) {
  const m = self.$model;
  if (!Array.isArray(rows)) return warn(`setRows(): the type of "rows" is ${jsType(rows)} but an array is expected`);
  if (same(rows, m.rows)) return;
  if (m.complete) fill(self, rows);
  else m.rows = rows.map(copy);
}

function insert(self, at, row) {
  const m = self.$model;
  self.rowsAboutToBeInserted(NOWHERE, at, at);
  m.rows = [...m.rows.slice(0, at), copy(row), ...m.rows.slice(at)];
  counted(self);
  if (!m.metadata.length) learn(self);
  m.bump(next);
  self.rowsInserted(NOWHERE, at, at);
  settle();
}

// The columns are counted and the rows it was given taken once it and what
// is declared in it exist: Qt's `componentComplete`.
function complete(self) {
  const m = self.$model;
  m.columns = [...(self.columns ?? [])];
  m.getters = m.columns.map((column) => {
    const getters = {};
    for (const name of ROLES) {
      const getter = column[name];
      if (getter === undefined) continue;
      if (typeof getter === "string" || typeof getter === "function") getters[name] = getter;
      else console.warn(`QML TableModelColumn: getter for "${name}" must be a function`);
    }
    return getters;
  });
  m.complete = true;
  slot(self, "columnCount").write(m.columns.length);
  if (!m.assigned) {
    m.given = slot(self, "rows").asked();
    if (Array.isArray(m.given)) m.rows = m.given.map(copy);
    else warn(`setRows(): the type of "rows" is ${jsType(m.given)} but an array is expected`);
  }
  fill(self, m.rows);
}

export const TableModel = defineType("TableModel", QtObject, {
  properties: { columns: [], rows: [], rowCount: 0, columnCount: 0 },
  signals: [
    "modelAboutToBeReset",
    "modelReset",
    "rowsAboutToBeInserted",
    "rowsInserted",
    "rowsAboutToBeRemoved",
    "rowsRemoved",
    "rowsAboutToBeMoved",
    "rowsMoved",
    "dataChanged",
  ],
  methods: {
    // The rows as the model has them, whatever it was given: what a method
    // did to them is in what `rows` reads as, and assigning to it takes
    // effect at once.
    get rows() {
      const m = this.$model;
      m.version();
      return m.rows;
    },
    set rows(rows) {
      this.$model.assigned = true;
      assign(this, rows);
    },
    index(row, column = 0) {
      return modelIndex(this, row, column);
    },
    parent() {
      return NOWHERE;
    },
    // `role` is a role's name or its number.
    data(index, role = 0) {
      const m = this.$model;
      if (typeof role === "string") {
        role = ROLES.indexOf(role);
        if (!(role in m.names)) return undefined;
      }
      if (!index?.valid) return void warn("data(): invalid QModelIndex");
      const { row, column } = index;
      if (!(row >= 0 && row < m.rows.length)) return void warn("data(): invalid row specified in QModelIndex");
      if (!(column >= 0 && column < m.columns.length)) return void warn("data(): invalid column specified in QModelIndex");
      const roles = m.metadata[column] ?? {};
      const name = m.names[role] ?? "";
      const found = roles[name];
      if (!found) {
        return void warn(
          `data(): no role named ${name} at column index ${column}. The available roles for that column are: QList(${Object.keys(roles)
            .map((each) => `"${each}"`)
            .join(", ")})`,
        );
      }
      return found.string ? m.rows[row][found.name] : m.getters[column][name](index);
    },
    setData(index, value, role = EDIT) {
      const m = this.$model;
      if (typeof role === "string") {
        role = ROLES.indexOf(role);
        if (!(role in m.names)) return false;
      }
      if (!index?.valid) return false;
      const { row, column } = index;
      if (!(row >= 0 && row < m.rows.length && column >= 0 && column < m.columns.length)) return false;
      const roles = m.metadata[column] ?? {};
      const name = m.names[role] ?? "";
      const found = roles[name];
      if (!found) {
        warn(
          `setData(): no role named "${name}" at column index ${column}. The available roles for that column are: QList(${Object.keys(roles)
            .map((each) => `"${each}"`)
            .join(", ")})`,
        );
        return false;
      }
      const fit = fits(value, found.type);
      if (fit !== FITS) {
        const told = value !== null && typeof value === "object" ? "QVariant(QJSValue, )" : shown(value);
        const where = `set at row ${row} column ${column} with role "${name}"`;
        if (fit === CANNOT) warn(`setData(): the value ${told} ${where} cannot be converted to "${found.type}"`);
        else warn(`setData(): failed converting value ${told} ${where} to "${found.type}"`);
        return false;
      }
      if (!found.string) {
        warn("setData(): manipulation of complex row structures is not supported");
        return false;
      }
      m.rows = m.rows.slice();
      m.rows[row] = { ...m.rows[row], [found.name]: value };
      m.bump(next);
      this.dataChanged(index, index, [role]);
      settle();
      return true;
    },
    // A table model that names no headers numbers them.
    headerData(section, orientation, role = 0) {
      return role === 0 ? section + 1 : undefined;
    },
    roleNames() {
      return this.$model.names;
    },
    flags() {
      return FLAGS;
    },
    appendRow(row) {
      if (valid(this, "appendRow()", row)) insert(this, this.$model.rows.length, row);
    },
    clear() {
      const m = this.$model;
      if (!m.rows.length) return;
      this.modelAboutToBeReset();
      m.rows = [];
      counted(this);
      m.bump(next);
      this.modelReset();
      settle();
    },
    getRow(row) {
      return within(this, "getRow()", "rowIndex", row) ? this.$model.rows[row] : undefined;
    },
    insertRow(at, row) {
      if (valid(this, "insertRow()", row) && within(this, "insertRow()", "rowIndex", at, true)) insert(this, at, row);
    },
    // `rows` rows from `from` on, so that the first of them is at `to`.
    moveRow(from, to, rows = 1) {
      const m = this.$model;
      const count = m.rows.length;
      if (from === to) return warn('moveRow(): "fromRowIndex" cannot be equal to "toRowIndex"');
      if (rows <= 0) return warn('moveRow(): "rows" is less than or equal to 0');
      if (!within(this, "moveRow()", "fromRowIndex", from) || !within(this, "moveRow()", "toRowIndex", to)) return;
      for (const [name, at] of [
        ["fromRowIndex", from],
        ["toRowIndex", to],
      ]) {
        if (at + rows > count) {
          return warn(`moveRow(): "${name}" (${at}) + "rows" (${rows}) = ${at + rows}, which is greater than rowCount() of ${count}`);
        }
      }
      // As a QAbstractItemModel says it: the row they are put before,
      // counted while they are where they were.
      const before = to > from ? to + rows : to;
      this.rowsAboutToBeMoved(NOWHERE, from, from + rows - 1, NOWHERE, before);
      const moved = m.rows.slice();
      moved.splice(to, 0, ...moved.splice(from, rows));
      m.rows = moved;
      m.bump(next);
      this.rowsMoved(NOWHERE, from, from + rows - 1, NOWHERE, before);
      settle();
    },
    removeRow(at, rows = 1) {
      const m = this.$model;
      const count = m.rows.length;
      if (!within(this, "removeRow()", "rowIndex", at)) return;
      if (rows <= 0) return warn('removeRow(): "rows" is less than or equal to zero');
      if (at + rows > count) {
        return warn(`removeRow(): "rows" ${rows} exceeds available rowCount() of ${count} when removing from "rowIndex" ${at}`);
      }
      this.rowsAboutToBeRemoved(NOWHERE, at, at + rows - 1);
      m.rows = [...m.rows.slice(0, at), ...m.rows.slice(at + rows)];
      counted(this);
      m.bump(next);
      this.rowsRemoved(NOWHERE, at, at + rows - 1);
      settle();
    },
    setRow(at, row) {
      const m = this.$model;
      if (!valid(this, "setRow()", row) || !within(this, "setRow()", "rowIndex", at, true)) return;
      if (at === m.rows.length) return insert(this, at, row);
      m.rows = m.rows.slice();
      m.rows[at] = copy(row);
      m.bump(next);
      this.dataChanged(modelIndex(this, at, 0), modelIndex(this, at, m.columns.length - 1), []);
      settle();
    },
  },
  setup(self) {
    const [version, bump] = signal(0, self.$owner);
    const m = (self.$model = {
      rows: [],
      columns: [],
      // What each column was given for a role, and what was learnt of it
      // from the first row: the property of a row it is, and its type.
      getters: [],
      metadata: [],
      // The names of the roles any column has, by number.
      names: {},
      complete: false,
      // Whether `rows` was assigned, which is over what it is bound to.
      assigned: false,
      given: undefined,
      version,
      bump,
    });
    whenComplete(() => untrack(() => complete(self)));
    // What `rows` is bound to gives other rows.
    effect(
      () => slot(self, "rows").asked(),
      (given) => {
        if (m.assigned || given === m.given) return;
        m.given = given;
        assign(self, given);
      },
    );
  },
  // Its children are its columns.
  adopt(self, props) {
    slot(self, "columns").provide(contents(props).filter((child) => child?.$type?.chain.includes(TableModelColumn)));
  },
});

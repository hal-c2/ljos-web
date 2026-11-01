// Models, and the rows a view makes delegates for.
//
// A view's `model` may be a number, a JavaScript array, a ListModel, an
// ObjectModel, or any object with `count` and `get(i)`. `Rows` puts them
// behind one interface: how many rows there are, the object a delegate is
// given for one (`index`, `modelData`, `model` and a property per role), and
// what happened to them. A view is told of rows inserted, removed and moved,
// never to start again: the delegate of a row lives as long as the row does.
import { runWithOwner } from "solid-js";
import { contents, defineType, derived, inside, instantiate, QtObject, slot } from "../object.js";
import { settle } from "./settle.js";
import { followed, signal, untrack } from "#kernel";

const next = (version) => version + 1;

// What can change under a reader, by name: a row's index, an element's
// role. The signal is made when something first reads it in a binding, so
// that rows nobody looks at cost nothing.
const SIGNALS = Symbol("signals");

export function track(holder, name) {
  if (!followed()) return;
  const signals = (holder[SIGNALS] ??= Object.create(null));
  (signals[name] ??= signal(0))[0]();
}

export function touch(holder, name) {
  holder[SIGNALS]?.[name]?.[1](next);
}

// ------------------------------------------------------- AbstractListModel

// A cell of a model: Qt's QModelIndex, which is a value. Two of one cell are
// the same object, so that `===` says so.
const NOWHERE = { row: -1, column: -1, valid: false, model: null, internalId: 0 };
NOWHERE.parent = NOWHERE;
Object.freeze(NOWHERE);
const indexes = new WeakMap();

// How many rows and columns a model says it has: `rowCount()` as Qt's models
// have it in C++, or `rowCount` as a TableModel has it in QML.
const asked = (model, name) => {
  const count = model?.[name];
  return Number(typeof count === "function" ? count.call(model) : count) || 0;
};
export const rowsOf = (model) => asked(model, "rowCount");
export const columnsOf = (model) => asked(model, "columnCount");

export function modelIndex(model, row, column = 0) {
  if (!(row >= 0 && column >= 0 && row < rowsOf(model) && column < columnsOf(model))) return NOWHERE;
  let made = indexes.get(model);
  if (!made) indexes.set(model, (made = new Map()));
  const key = column * 0x100000000 + row;
  let index = made.get(key);
  if (!index) made.set(key, (index = Object.freeze({ row, column, valid: true, model, internalId: 0, parent: NOWHERE })));
  return index;
}

// What a view asks of a model it follows row by row: `$elements`, the value
// of each row, an object with a property per role (one that can change tells
// its readers, with `track` and `touch`); `$roles`, the names of the roles;
// and `$observe(listener)`, which tells of rows `inserted(index, count)`,
// `removed(index, count)` and `moved(from, to, count)`, after `$elements`
// was changed, and of a new `role(name)`. A ListModel is one, and so is
// whatever else is made from this: a model read from a file, a proxy.
export const AbstractListModel = defineType("AbstractListModel", QtObject, {
  // A QAbstractItemModel's, for a program that follows a model itself.
  signals: ["dataChanged", "rowsInserted", "rowsRemoved", "rowsMoved"],
  methods: {
    rowCount() {
      return this.$elements.length;
    },
    columnCount() {
      return 1;
    },
    index(row, column = 0) {
      return modelIndex(this, row, column);
    },
    // Views hear first, and the program after them.
    $observe(listener) {
      this.$listeners.delete(this.$aloud);
      this.$listeners.add(listener).add(this.$aloud);
      return () => this.$listeners.delete(listener);
    },
  },
  setup(self) {
    self.$elements = [];
    self.$roles = [];
    self.$aloud = {
      inserted: (index, count) => self.rowsInserted(NOWHERE, index, index + count - 1),
      removed: (index, count) => self.rowsRemoved(NOWHERE, index, index + count - 1),
      // Where they went is the row they now stand before, counted as rows
      // were before the move.
      moved: (from, to, count) => self.rowsMoved(NOWHERE, from, from + count - 1, NOWHERE, to > from ? to + count : to),
      role() {},
    };
    self.$listeners = new Set([self.$aloud]);
  },
});

// A row's values changed: `names` are the roles that did.
function changed(model, row, names) {
  const index = modelIndex(model, row);
  model.dataChanged(
    index,
    index,
    names.map((name) => model.$roles.indexOf(name)),
  );
}

// Every row of such a model replaced: `elements` are the new ones and
// `roles` the names they have.
export function reset(model, elements, roles = model.$roles) {
  const length = model.$elements.length;
  model.$elements = elements;
  if (length) for (const listener of model.$listeners) listener.removed(0, length);
  const known = model.$roles;
  model.$roles = roles;
  for (const name of roles) {
    if (!known.includes(name)) for (const listener of model.$listeners) listener.role(name);
  }
  if (elements.length) for (const listener of model.$listeners) listener.inserted(0, elements.length);
}

// ---------------------------------------------------------------- ListModel

const RECORD = Symbol("record");
const VALUES = Symbol("values");

// `ListElement { name: "a"; cost: 2 }`: what it was given, for the ListModel
// it is declared in.
export const ListElement = (props) => ({ [RECORD]: props });

// What a role reads as in an element that has no value for it: Qt's roles
// are typed by the first value they were given.
const blank = (value) =>
  typeof value === "string" ? "" : typeof value === "number" ? 0 : typeof value === "boolean" ? false : undefined;

function defineRole(model, name, value) {
  model.$roles.push(name);
  if (!untrack(() => model.dynamicRoles)) model.$blank[name] = blank(value);
  Object.defineProperty(model.$element, name, {
    get() {
      track(this, name);
      const held = this[VALUES][name];
      return held === undefined ? model.$blank[name] : held;
    },
    // `model.get(0).name = "x"` changes the model.
    set(given) {
      if (!store(model, this, name, given)) return;
      const row = model.$elements.indexOf(this);
      if (row >= 0) changed(model, row, [name]);
      settle();
    },
    enumerable: true,
    configurable: true,
  });
  for (const listener of model.$listeners) listener.role(name);
}

// A list in an element is a model of its own.
function nested(model, list) {
  const made = runWithOwner(model.$owner, () => untrack(() => ListModel({ dynamicRoles: model.dynamicRoles })));
  splice(made, 0, list);
  return made;
}

function store(model, element, name, value) {
  if (!(name in model.$element)) defineRole(model, name, value);
  if (Array.isArray(value)) value = nested(model, value);
  if (Object.is(element[VALUES][name], value)) return false;
  element[VALUES][name] = value;
  touch(element, name);
  return true;
}

function element(model, given) {
  const record = given?.[RECORD] ?? given ?? {};
  const made = Object.create(model.$element);
  made[VALUES] = {};
  for (const name of Object.keys(record)) {
    if (name[0] !== "$" && name !== "children") store(model, made, name, record[name]);
  }
  return made;
}

function counted(model, length) {
  slot(model, "count").write(length);
}

// Puts elements made from `given` (one, or a list of them) at `index`.
function splice(model, index, given) {
  const made = (Array.isArray(given) ? given : [given]).map((each) => element(model, each));
  if (!made.length) return;
  model.$elements.splice(index, 0, ...made);
  counted(model, model.$elements.length);
  for (const listener of model.$listeners) listener.inserted(index, made.length);
}

export const ListModel = defineType("ListModel", AbstractListModel, {
  properties: { count: 0, dynamicRoles: false },
  methods: {
    get(index) {
      return this.$elements[index];
    },
    append(dict) {
      splice(this, this.$elements.length, dict);
      settle();
    },
    insert(index, dict) {
      if (!(index >= 0 && index <= this.$elements.length)) {
        console.warn(`ListModel: insert: index ${index} out of range`);
        return;
      }
      splice(this, index, dict);
      settle();
    },
    remove(index, count = 1) {
      const elements = this.$elements;
      if (!(index >= 0 && count >= 0 && index + count <= elements.length)) {
        console.warn(`ListModel: remove: indices [${index} - ${index + count}] out of range [0 - ${elements.length}]`);
        return;
      }
      if (!count) return;
      elements.splice(index, count);
      counted(this, elements.length);
      for (const listener of this.$listeners) listener.removed(index, count);
      settle();
    },
    // `count` elements from `from` on, so that the first is at `to`.
    move(from, to, count) {
      const elements = this.$elements;
      if (!(count >= 0 && from >= 0 && to >= 0 && from + count <= elements.length && to + count <= elements.length)) {
        console.warn("ListModel: move: out of range");
        return;
      }
      if (!count || from === to) return;
      elements.splice(to, 0, ...elements.splice(from, count));
      for (const listener of this.$listeners) listener.moved(from, to, count);
      settle();
    },
    set(index, dict) {
      const elements = this.$elements;
      if (index === elements.length) return this.append(dict);
      if (!(index >= 0 && index < elements.length)) {
        console.warn(`ListModel: set: index ${index} out of range`);
        return;
      }
      const record = dict?.[RECORD] ?? dict ?? {};
      const names = Object.keys(record).filter((name) => store(this, elements[index], name, record[name]));
      if (names.length) changed(this, index, names);
      settle();
    },
    setProperty(index, property, value) {
      const elements = this.$elements;
      if (!(index >= 0 && index < elements.length)) {
        console.warn(`ListModel: setProperty: index ${index} out of range`);
        return;
      }
      if (!store(this, elements[index], property, value)) return;
      changed(this, index, [property]);
      settle();
    },
    clear() {
      const length = this.$elements.length;
      if (!length) return;
      this.$elements.length = 0;
      counted(this, 0);
      for (const listener of this.$listeners) listener.removed(0, length);
      settle();
    },
    // For a model changed from a WorkerScript: there is nothing to wait for.
    sync() {},
  },
  setup(self) {
    self.$blank = Object.create(null);
    // What its elements inherit: an accessor per role.
    // What an element has is its roles, which are its model's to define:
    // `JSON.stringify(model.get(0))` is asked for them here.
    self.$element = Object.defineProperty({}, "toJSON", {
      value() {
        return Object.fromEntries(self.$roles.map((name) => [name, this[name]]));
      },
    });
  },
  adopt(self, props) {
    self.$elements = untrack(() =>
      contents(props)
        .filter((child) => child[RECORD])
        .map((child) => element(self, child)),
    );
    counted(self, self.$elements.length);
  },
});

// -------------------------------------------------------------- ObjectModel

const ObjectModelAttached = defineType("ObjectModelAttached", QtObject, {
  properties: {
    index: derived((self) => {
      const model = self.$object.$objectModel;
      if (!model) return -1;
      model.$ordered();
      return model.$objects.indexOf(self.$object);
    }),
  },
  setup(self, props) {
    self.$object = props.$attachee;
  },
});

function reordered(model) {
  counted(model, model.$objects.length);
  model.$reorder(next);
}

// A model whose rows are the objects themselves: a view shows them as they
// are, without a delegate.
export const ObjectModel = defineType("ObjectModel", QtObject, {
  properties: { count: 0 },
  attached: ObjectModelAttached,
  methods: {
    get children() {
      this.$ordered();
      return this.$objects;
    },
    get(index) {
      return this.$objects[index];
    },
    append(object) {
      this.insert(this.$objects.length, object);
    },
    insert(index, object) {
      if (!(index >= 0 && index <= this.$objects.length)) return;
      object.$objectModel = this;
      this.$objects.splice(index, 0, object);
      reordered(this);
      for (const listener of this.$listeners) listener.inserted(index, 1);
      settle();
    },
    move(from, to, count = 1) {
      const objects = this.$objects;
      if (!(count > 0 && from >= 0 && to >= 0 && from + count <= objects.length && to + count <= objects.length)) return;
      if (from === to) return;
      objects.splice(to, 0, ...objects.splice(from, count));
      reordered(this);
      for (const listener of this.$listeners) listener.moved(from, to, count);
      settle();
    },
    remove(index, count = 1) {
      const objects = this.$objects;
      if (!(index >= 0 && count > 0 && index + count <= objects.length)) return;
      for (const object of objects.splice(index, count)) object.$objectModel = null;
      reordered(this);
      for (const listener of this.$listeners) listener.removed(index, count);
      settle();
    },
    clear() {
      this.remove(0, this.$objects.length);
    },
    $observe(listener) {
      this.$listeners.add(listener);
      return () => this.$listeners.delete(listener);
    },
  },
  setup(self) {
    self.$objects = [];
    self.$listeners = new Set();
    [self.$ordered, self.$reorder] = signal(0, self.$owner);
  },
  adopt(self, props) {
    // They are children of whatever view shows them, not of where the
    // model was declared.
    self.$objects = inside(null, () => contents(props));
    for (const object of self.$objects) object.$objectModel = self;
    counted(self, self.$objects.length);
  },
});

// --------------------------------------------------------------------- Rows

const NONE = 0;
const NUMBER = 1;
const ARRAY = 2;
const LIST = 3;
const OBJECTS = 4;
const COUNTED = 5;

function kindOf(source) {
  if (typeof source === "number") return NUMBER;
  if (Array.isArray(source)) return ARRAY;
  if (source == null || typeof source !== "object") return NONE;
  // By what it has, not by its type: a model that declares properties of its
  // own is of a type derived from the one it was written as.
  if (source.$elements && source.$observe) return LIST;
  if (source.$objects && source.$observe) return OBJECTS;
  return typeof source.get === "function" && "count" in source ? COUNTED : NONE;
}

// A DelegateModel is a model and a delegate together: a view given one
// shows its model with its delegate.
export const modelOf = (model) => (model?.$delegates ? model.model : model);
export const delegateOf = (model, delegate) => (model?.$delegates ? model.delegate : delegate);

// How many rows a model has, for a view to depend on when the model does
// not say what changed in it: an object with `count` and `get(i)`.
export function size(source) {
  const kind = kindOf(source);
  if (kind === NUMBER) return Math.max(0, Math.floor(source)) || 0;
  if (kind === ARRAY) return source.length;
  return kind === COUNTED ? Number(source.count) || 0 : 0;
}

// What a delegate is given. A row is its own `model`: `model.name` reads a
// role and `model.name = v` writes it. It inherits from nothing, so that
// `"name" in row` is true of `index`, `model`, `modelData` and the roles
// alone: compiled QML asks, when a name may be a role or something further
// out.
const Row = Object.setPrototypeOf(
  {
    get index() {
      track(this, "index");
      return this.$index;
    },
    get model() {
      return this;
    },
    get modelData() {
      return this.$value;
    },
    // A role with no name is the row's value, as in Qt, whose styles show
    // the rows of a combo box that has no `textRole` by it.
    get ""() {
      return this.modelData;
    },
  },
  null,
);

const NumberRow = Object.create(Row, {
  modelData: {
    get() {
      return this.index;
    },
  },
});

// A row of a model with roles has `modelData` only when there is one role
// to be it.
const ListRow = Object.create(Row, {
  modelData: {
    get() {
      const roles = this.$rows.source.$roles;
      return roles.length === 1 ? this.$value[roles[0]] : undefined;
    },
  },
});

const BASES = [Row, NumberRow, Row, ListRow, Row, Row];

// A role, read from and written to the row's value: a ListModel's element
// (which tells its readers), or a plain object (which cannot: assigning to
// a key of an array's object is seen by the next read, as in Qt).
function defineRowRole(proto, name) {
  if (name in proto) return;
  Object.defineProperty(proto, name, {
    get() {
      return this.$value?.[name];
    },
    set(value) {
      if (this.$value) this.$value[name] = value;
    },
    enumerable: true,
    configurable: true,
  });
}

// `view` is what uses the rows: `{ owner, parent(), inserted(index, count),
// removed(index, count, rows), moved(from, to, count) }` and, optionally,
// `created(row)` and `destroyed(row)`. `self`, if given, is what a row's
// `$view` is. A row has `$index`, `$value` and, once made, `$item`: the
// delegate's object.
export class Rows {
  constructor(view) {
    this.view = view;
    this.count = 0;
    this.source = undefined;
    this.kind = NONE;
    this.component = undefined;
    // An array's values as they were last seen: the array may be changed
    // in place before it is given again.
    this.values = null;
    // The rows a delegate was made for, by index.
    this.live = new Map();
    this.proto = null;
    this.unobserve = null;
    // The component, and a note on its object of the row it is for: the
    // attached properties of a delegate are found through it.
    this.make = (row) => {
      const object = this.component(row);
      if (object) object.$delegate = row;
      return object;
    };
  }

  // The model and the delegate, when either may have changed.
  set(source, component) {
    const kind = kindOf(source);
    const length = size(source);
    if (component !== this.component) {
      this.remove(0, this.count);
      this.component = component;
    } else if (kind === NUMBER && this.kind === NUMBER) {
      this.source = source;
      if (length > this.count) this.insert(this.count, length - this.count);
      else this.remove(length, this.count - length);
      return;
    } else if (kind === ARRAY && this.kind === ARRAY) {
      this.source = source;
      this.reconcile(source);
      return;
    } else if (kind === this.kind && source === this.source) {
      // The same model: one that reports is followed, one that does not
      // has changed in a way only it knows.
      if (kind !== COUNTED || length === this.count) return;
    }
    this.remove(0, this.count);
    this.unobserve?.();
    this.unobserve = null;
    this.source = source;
    this.kind = kind;
    this.values = kind === ARRAY ? source.slice() : null;
    this.proto = Object.create(BASES[kind]);
    this.proto.$rows = this;
    this.proto.$view = this.view.self;
    if (kind === LIST) for (const name of source.$roles) defineRowRole(this.proto, name);
    if (kind === LIST || kind === OBJECTS) {
      this.unobserve = source.$observe(this);
      this.insert(0, kind === LIST ? source.$elements.length : source.$objects.length);
    } else {
      this.insert(0, length);
    }
  }

  // Whether rows have what it takes to be shown.
  get ready() {
    return this.kind === OBJECTS || typeof this.component === "function";
  }

  value(index) {
    switch (this.kind) {
      case ARRAY:
        return this.values[index];
      case LIST:
        return this.source.$elements[index];
      case OBJECTS:
        return this.source.$objects[index];
      case COUNTED:
        return untrack(() => this.source.get(index));
      default:
        return index;
    }
  }

  // A role of a row no delegate was made for: what section it is in.
  read(index, role) {
    return this.kind === NUMBER || this.kind === NONE ? undefined : this.value(index)?.[role];
  }

  // The row at `index`, with its delegate, made if it has to be.
  row(index) {
    let row = this.live.get(index);
    if (row) return row;
    const value = this.value(index);
    if ((this.kind === ARRAY || this.kind === COUNTED) && value && typeof value === "object") {
      for (const name of Object.keys(value)) defineRowRole(this.proto, name);
    }
    row = Object.create(this.proto);
    row.$index = index;
    row.$value = value;
    row.$dispose = null;
    if (this.kind === OBJECTS) {
      row.$item = value;
      value.$delegate = row;
    } else {
      const made = instantiate(this.make, row, this.view.parent(), this.view.owner);
      row.$item = made.object;
      row.$dispose = made.dispose;
    }
    this.live.set(index, row);
    this.view.created?.(row);
    return row;
  }

  // The view no longer shows the row.
  release(row) {
    if (this.live.get(row.$index) === row) this.live.delete(row.$index);
    this.discard(row);
  }

  discard(row) {
    this.view.destroyed?.(row);
    row.$dispose?.();
    row.$dispose = null;
    row.$index = -1;
  }

  // The rows whose index is to change: `shift` gives the new one, or -1
  // for a row that is gone.
  reindex(shift) {
    const gone = [];
    const live = new Map();
    for (const row of this.live.values()) {
      const index = shift(row.$index);
      if (index < 0) {
        gone.push(row);
        continue;
      }
      if (index !== row.$index) {
        row.$index = index;
        touch(row, "index");
      }
      live.set(index, row);
    }
    this.live = live;
    return gone;
  }

  insert(index, count, values) {
    if (count <= 0) return;
    if (values) this.values.splice(index, 0, ...values);
    this.reindex((at) => (at >= index ? at + count : at));
    this.count += count;
    this.view.inserted(index, count);
  }

  remove(index, count) {
    if (count <= 0) return;
    if (this.values) this.values.splice(index, count);
    const gone = this.reindex((at) => (at < index ? at : at < index + count ? -1 : at - count));
    gone.sort((a, b) => a.$index - b.$index);
    this.count -= count;
    this.view.removed(index, count, gone);
    for (const row of gone) this.discard(row);
  }

  move(from, to, count) {
    if (this.values) this.values.splice(to, 0, ...this.values.splice(from, count));
    this.reindex((at) => moved(at, from, to, count));
    this.view.moved(from, to, count);
  }

  // What a model that reports says.
  inserted(index, count) {
    this.insert(index, count);
  }

  removed(index, count) {
    this.remove(index, count);
  }

  moved(from, to, count) {
    this.move(from, to, count);
  }

  role(name) {
    defineRowRole(this.proto, name);
  }

  // An array given in place of another: the values in both keep their rows.
  reconcile(values) {
    const held = this.values;
    let start = 0;
    const shorter = Math.min(held.length, values.length);
    while (start < shorter && same(held[start], values[start])) start++;
    let heldEnd = held.length;
    let end = values.length;
    while (heldEnd > start && end > start && same(held[heldEnd - 1], values[end - 1])) {
      heldEnd--;
      end--;
    }
    if (heldEnd === start) return this.insert(start, end - start, values.slice(start, end));
    if (end === start) return this.remove(start, heldEnd - start);
    // In between: what is no longer there goes, what stays is moved to
    // where it now is, and what is new is put in.
    const wanted = new Map();
    for (let index = start; index < end; index++) wanted.set(values[index], (wanted.get(values[index]) ?? 0) + 1);
    for (let index = heldEnd - 1; index >= start; index--) {
      const left = wanted.get(held[index]);
      if (left) wanted.set(held[index], left - 1);
      else this.remove(index, 1);
    }
    for (let index = start; index < end; index++) {
      const value = values[index];
      if (same(held[index], value) && index < held.length - (values.length - end)) continue;
      const tail = held.length - (values.length - end);
      let at = -1;
      for (let other = index + 1; other < tail; other++) {
        if (same(held[other], value)) {
          at = other;
          break;
        }
      }
      if (at < 0) this.insert(index, 1, [value]);
      else this.move(at, index, 1);
    }
  }

  dispose() {
    this.unobserve?.();
    this.unobserve = null;
  }
}

// Whether two values of an array are one: as a Map tells them apart, to which
// what is not a number is itself.
const same = (one, other) => one === other || (one !== one && other !== other);

// Where the row at `at` is once `count` rows have moved from `from` to `to`.
export function moved(at, from, to, count) {
  if (at >= from && at < from + count) return at - from + to;
  if (from < to && at >= from + count && at < to + count) return at - count;
  if (to < from && at >= to && at < from) return at + count;
  return at;
}

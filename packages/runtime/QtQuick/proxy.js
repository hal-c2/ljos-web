// `SortFilterProxyModel`: some of another model's rows, in another order.
//
// Its rows are the source's own: the same element is a row of both, so a
// delegate reads and writes the source through it, and a row that stays
// keeps its delegate whatever happens to the others. Which rows, and in
// what order, is worked out again when the source's rows change, when a
// role a filter or a sorter read changes, and when a filter or a sorter is
// set another way; what views are told is the difference.
import { onCleanup } from "solid-js";
import { defineType, effect, QtObject, slot } from "../object.js";
import { AbstractListModel, modelIndex } from "./model.js";
import { settle } from "./settle.js";
import { signal, untrack } from "#kernel";

const next = (version) => version + 1;

const ASCENDING = 0;
const DESCENDING = 1;
const CASE_INSENSITIVE = 0;
const CASE_SENSITIVE = 1;
// What a sorter nobody gave a priority has: the last.
const LAST = 2147483647;

// What a filter or a sorter has that the proxy must know of to do its work
// again: `$version` is read with the rest of how it is set.
const versioned = {
  setup(self) {
    [self.$version, self.$bump] = signal(0, self.$owner);
  },
  methods: {
    invalidate() {
      this.$bump(next);
      settle();
    },
  },
};

// A row as a function of the program's is given it: it reads the roles and
// changes nothing, and what it read is noted for the proxy to depend on.
const reader = (read) => ({
  get(element, name) {
    if (typeof name === "string") read.add(name);
    return element[name];
  },
  set: () => true,
});

// ------------------------------------------------------------------ filters

// `$accepts(elements)` gives the test of a row; it reads how the filter is
// set, and the test what it needs of the row.
const Filter = defineType("Filter", QtObject, {
  properties: { enabled: true, inverted: false },
  ...versioned,
});

export const ValueFilter = defineType("ValueFilter", Filter, {
  properties: { roleName: "", value: undefined },
  methods: {
    $accepts() {
      const { roleName, value } = this;
      // With no role, or no value, it has nothing to accept a row by.
      if (!roleName || value === undefined) return () => false;
      // As QML's `==`: 2 is "2".
      return (element) => element[roleName] == value;
    },
  },
});

// `function filter(data: RoleData): bool`: the program's own test. What it
// reads of anything but the row is its own affair: the proxy is told with
// `invalidate()`.
export const FunctionFilter = defineType("FunctionFilter", Filter, {
  methods: {
    $accepts() {
      if (typeof this.filter !== "function") return () => true;
      const read = new Set();
      const handler = reader(read);
      return (element) => {
        const accepted = untrack(() => this.filter(new Proxy(element, handler)));
        for (const name of read) element[name];
        return Boolean(accepted);
      };
    },
  },
});

// ------------------------------------------------------------------ sorters

// `$compares(elements)` gives the order of two rows, ascending: negative
// when the first is before the second.
const Sorter = defineType("Sorter", QtObject, {
  properties: { enabled: true, sortOrder: ASCENDING, priority: LAST },
  ...versioned,
});

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// The values of a role, read once a row.
function values(elements, roleName) {
  const read = new Map();
  for (const element of elements) read.set(element, element[roleName]);
  return read;
}

export const RoleSorter = defineType("RoleSorter", Sorter, {
  properties: { roleName: "" },
  methods: {
    $compares(elements) {
      const { roleName } = this;
      if (!roleName) return null;
      const read = values(elements, roleName);
      return (left, right) => {
        const a = read.get(left);
        const b = read.get(right);
        if (a === undefined || b === undefined) return 0;
        return typeof a === "number" && typeof b === "number" ? compare(a, b) : compare(String(a), String(b));
      };
    },
  },
});

// As a reader would order them: by the language's rules, not by the codes
// of the characters.
export const StringSorter = defineType("StringSorter", Sorter, {
  properties: { roleName: "", caseSensitivity: CASE_SENSITIVE, numericMode: false, ignorePunctuation: false },
  methods: {
    $compares(elements) {
      const { roleName } = this;
      if (!roleName) return null;
      const collator = new Intl.Collator(undefined, {
        sensitivity: this.caseSensitivity === CASE_INSENSITIVE ? "accent" : "variant",
        numeric: Boolean(this.numericMode),
        ignorePunctuation: Boolean(this.ignorePunctuation),
      });
      const read = values(elements, roleName);
      return (left, right) => collator.compare(String(read.get(left) ?? ""), String(read.get(right) ?? ""));
    },
  },
});

// `function sort(left: RoleData, right: RoleData): int`.
export const FunctionSorter = defineType("FunctionSorter", Sorter, {
  methods: {
    $compares(elements) {
      if (typeof this.sort !== "function") return null;
      const read = new Set();
      const handler = reader(read);
      const compares = (left, right) =>
        Number(untrack(() => this.sort(new Proxy(left, handler), new Proxy(right, handler)))) || 0;
      // Every role it read of any row, of every row.
      compares.done = () => {
        for (const element of elements) for (const name of read) element[name];
      };
      return compares;
    },
  },
});

// -------------------------------------------------------------------- proxy

const follows = (source) => Boolean(source?.$elements && source.$observe);

// The rows of `source` the filters accept, in the order the sorters give.
function arrange(self, source) {
  const all = source.$elements;
  const tests = [];
  for (const filter of self.filters ?? []) {
    filter.$version();
    if (!filter.enabled) continue;
    const accepts = filter.$accepts(all);
    const inverted = filter.inverted;
    tests.push(inverted ? (element) => !accepts(element) : accepts);
  }
  const rows = tests.length ? all.filter((element) => tests.every((test) => test(element))) : all.slice();

  self.$resorted();
  const sorters = [];
  (self.sorters ?? []).forEach((sorter, declared) => {
    sorter.$version();
    if (sorter.enabled) sorters.push({ sorter, declared, priority: sorter === self.$primary ? -1 : sorter.priority });
  });
  if (!sorters.length) return rows;
  sorters.sort((a, b) => a.priority - b.priority || a.declared - b.declared);
  const orders = [];
  let reversed;
  for (const { sorter } of sorters) {
    const compares = sorter.$compares(rows);
    const descending = sorter.sortOrder === DESCENDING;
    // Rows the sorters have in one place stay as the source has them, the
    // other way round when the first sorter is.
    reversed ??= descending;
    if (compares) orders.push({ compares, sign: descending ? -1 : 1 });
  }
  if (!orders.length) return rows;
  const place = new Map(rows.map((element, index) => [element, index]));
  const tie = reversed ? -1 : 1;
  rows.sort((left, right) => {
    for (const { compares, sign } of orders) {
      const order = compares(left, right);
      if (order) return order * sign;
    }
    return (place.get(left) - place.get(right)) * tie;
  });
  for (const { compares } of orders) compares.done?.();
  return rows;
}

// Makes the proxy's rows the `wanted` ones, telling whoever follows it of
// each row that went, moved or came, with the rows as they are by then.
function show(self, wanted) {
  const held = self.$elements;
  const tell = (what, ...where) => {
    for (const listener of self.$listeners) listener[what](...where);
  };
  const staying = new Set(wanted);
  for (let end = held.length; end > 0; ) {
    if (staying.has(held[end - 1])) {
      end--;
      continue;
    }
    let start = end - 1;
    while (start > 0 && !staying.has(held[start - 1])) start--;
    held.splice(start, end - start);
    tell("removed", start, end - start);
    end = start;
  }
  const here = new Set(held);
  let at = 0;
  for (const element of wanted) {
    if (!here.has(element)) continue;
    if (held[at] !== element) {
      const from = held.indexOf(element, at + 1);
      held.splice(at, 0, ...held.splice(from, 1));
      tell("moved", from, at, 1);
    }
    at++;
  }
  for (let start = 0; start < wanted.length; start++) {
    if (held[start] === wanted[start]) continue;
    let end = start + 1;
    while (end < wanted.length && !here.has(wanted[end])) end++;
    held.splice(start, 0, ...wanted.slice(start, end));
    tell("inserted", start, end - start);
    start = end - 1;
  }
}

// `model` and `sourceModel` are one property under two names.
const other = (name) => (self, own) => {
  const given = own();
  if (given !== undefined) return given;
  const named = slot(self, name);
  return named.explicit() ? named.own() : undefined;
};

export const SortFilterProxyModel = defineType("SortFilterProxyModel", AbstractListModel, {
  properties: { model: undefined, sourceModel: undefined, filters: [], sorters: [] },
  resolve: { model: other("sourceModel"), sourceModel: other("model") },
  methods: {
    // Asks every filter and sorter again: for what they read that is not a
    // role of a row.
    invalidate() {
      this.$resort(next);
      settle();
    },
    invalidateSorter() {
      this.invalidate();
    },
    // The sorter that decides first, whatever the priorities say.
    setPrimarySorter(sorter) {
      this.$primary = sorter ?? null;
      this.invalidate();
    },
    mapToSource(index) {
      const source = this.$source;
      if (!source || index?.model !== this) return modelIndex(null, -1);
      return modelIndex(source, source.$elements.indexOf(this.$elements[index.row]), index.column);
    },
    mapFromSource(index) {
      const source = this.$source;
      if (!source || index?.model !== source || !index.valid) return modelIndex(null, -1);
      return modelIndex(this, this.$elements.indexOf(source.$elements[index.row]), index.column);
    },
  },
  setup(self) {
    self.$source = null;
    self.$primary = null;
    Object.defineProperty(self, "$roles", { get: () => self.$source?.$roles ?? [], configurable: true });
    const [changed, change] = signal(0, self.$owner);
    [self.$resorted, self.$resort] = signal(0, self.$owner);
    // What the source says of its rows: the proxy looks at them again. A new
    // role is one of the proxy's rows' too.
    const rows = () => change(next);
    const observer = {
      inserted: rows,
      removed: rows,
      moved: rows,
      role(name) {
        for (const listener of self.$listeners) listener.role(name);
      },
    };
    let unobserve = null;
    onCleanup(() => unobserve?.());
    let refused;
    effect(
      () => {
        const model = self.model;
        const source = follows(model) ? model : null;
        changed();
        return { model, source, wanted: source ? arrange(self, source) : [] };
      },
      ({ model, source, wanted }) => {
        if (model != null && !source && model !== refused) {
          console.warn("SortFilterProxyModel: a model whose rows have roles is the only kind it can be given");
        }
        refused = model;
        // Whoever follows it makes and moves delegates as it is told.
        untrack(() => {
          if (source !== self.$source) {
            unobserve?.();
            self.$source = source;
            unobserve = source?.$observe(observer) ?? null;
            for (const name of self.$roles) observer.role(name);
          }
          show(self, wanted);
        });
      },
    );
  },
});

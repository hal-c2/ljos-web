// `import Ljos.Models`: Ljós's own models, as Ljós has them natively
// (ljos-ui's `ljos_jsonmodel` and its scenarios are the specification).
//
// A JsonListModel is a read-only list model whose rows are the objects of a
// JSON array, given as text in `json` or in the file `source` names. Its
// roles are the keys of the objects in the order they are first seen. A
// change says only what differs, so the delegates of the rows that stayed
// are kept; JSON it cannot use leaves the rows as they were and says why.
import { getOwner, onCleanup, runWithOwner } from "solid-js";
import { defineType, onChange, settle, slot, whenCompleted } from "../../object.ts";
import type { QObject, Signal } from "../../object.ts";
import { AbstractListModel, modelIndex, track, touch } from "../../QtQuick/model.js";
import { read as readFile, watch } from "../../files.js";
import { untrack } from "#kernel";

const NULL = 0;
const READY = 1;
const LOADING = 2;
const ERROR = 3;

// What a model holds of a stray file at most: it keeps every row in memory.
const DOCUMENT_BYTES = 64 * 1024 * 1024;
const BOM = "﻿";

// What a row is: an object of JSON's.
type Row = Record<string, unknown>;

// A row as a view reads it: see `element`.
interface Element {
  [ROW]: Row;
}

// What a view that follows the model row by row is told (QtQuick/model.js
// says what it asks of a list model).
interface Listener {
  inserted(index: number, count: number): void;
  removed(index: number, count: number): void;
  role(name: string): void;
}

// A cell of a model, as `modelIndex` gives it.
type Index = object;

// What a model keeps that no property says: the rows (AbstractListModel's
// fields, which a view reads), and what it is reading.
interface State {
  $element: object;
  $elements: Element[];
  $roles: string[];
  $listeners: Set<Listener>;
  $aloud: Listener;
  $asked: number;
  $request: AbortController | null;
  $following: string | null;
  $unwatch: (() => void) | null;
}

// What of a JsonListModel its workings here use.
interface Model extends QObject, State {
  json: string;
  source: string;
  // Each is emitted as `(...args)`: what they are given, Qt's QAbstractItemModel says.
  modelAboutToBeReset: Signal;
  modelReset: Signal;
  rowsAboutToBeInserted: Signal;
  rowsAboutToBeRemoved: Signal;
  dataChanged: Signal;
}

// A document's fault: `at` is the line and column when the JSON is broken.
class Fault extends Error {
  declare at: [line: number, column: number] | undefined;

  constructor(message: string, at?: [line: number, column: number]) {
    super(message);
    this.at = at;
  }
}

// The line and column of the character at `offset`, both from 1.
function place(text: string, offset: number): [line: number, column: number] {
  let line = 1;
  let start = 0;
  for (let index = text.indexOf("\n"); index !== -1 && index < offset; index = text.indexOf("\n", index + 1)) {
    line++;
    start = index + 1;
  }
  return [line, offset - start + 1];
}

// Where JSON.parse stopped: found again here, as browsers say it each their
// own way (an offset, a line and column, or a piece of the text) or not at
// all. Only run on text JSON.parse refused.
function stopped(text: string): [line: number, column: number] {
  let at = 0;
  const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const space = () => {
    while (at < text.length && " \t\n\r".includes(text[at]!)) at++;
  };
  const fail = (): never => {
    throw at;
  };
  const word = (it: string) => (text.startsWith(it, at) ? (at += it.length) : fail());
  const string = (): number => {
    for (at++; at < text.length; ) {
      const c = text[at]!;
      if (c === '"') return at++;
      if (c < " ") fail();
      if (c !== "\\") at++;
      else if (text[at + 1] === "u") /^[0-9a-fA-F]{4}$/.test(text.slice(at + 2, at + 6)) ? (at += 6) : fail();
      else '"\\/bfnrt'.includes(text[at + 1] ?? "x") ? (at += 2) : fail();
    }
    return fail();
  };
  const items = (close: string, item: () => unknown): number => {
    at++;
    space();
    if (text[at] === close) return at++;
    for (;;) {
      item();
      space();
      if (text[at] === close) return at++;
      if (text[at] !== ",") fail();
      at++;
    }
  };
  const value = (): number => {
    space();
    const c = text[at];
    if (c === "[") return items("]", value);
    if (c === "{")
      return items("}", () => {
        space();
        if (text[at] !== '"') fail();
        string();
        space();
        if (text[at] !== ":") fail();
        at++;
        value();
      });
    if (c === '"') return string();
    if (c === "t") return word("true");
    if (c === "f") return word("false");
    if (c === "n") return word("null");
    NUMBER.lastIndex = at;
    return NUMBER.test(text) ? (at = NUMBER.lastIndex) : fail();
  };
  try {
    value();
    space();
    if (at < text.length) fail();
  } catch (where) {
    // Nested deeper than the stack: said at the end.
    if (typeof where !== "number") return place(text, text.length);
  }
  return place(text, at);
}

// What went wrong, without where or the piece of the text a browser quotes:
// that is said the same way whichever browser said it.
const reason = (error: unknown) =>
  String((error as Error | null | undefined)?.message ?? error)
    .replace(/^JSON\.parse:\s*/, "")
    .replace(/, (?:\.\.\.)?"[\s\S]*"(?:\.\.\.)? is not valid JSON$/, "")
    .replace(/\s*\(line \d+ column \d+\)/, "")
    .replace(/\s*(?:in JSON\s*)?at position \d+/, "")
    .replace(/\s*at line \d+ column \d+ of the JSON data/, "");

// The rows of a document: an array of objects.
function rows(text: string): Row[] {
  if (text.length > DOCUMENT_BYTES) throw new Fault(`the document is larger than ${DOCUMENT_BYTES} bytes`);
  // A byte order mark is not JSON, but editors write it.
  if (text.startsWith(BOM)) text = text.slice(1);
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch (error) {
    const [line, column] = stopped(text);
    throw new Fault(`${reason(error)} at line ${line} column ${column}`, [line, column]);
  }
  if (!Array.isArray(document)) throw new Fault("the document is not an array of objects");
  document.forEach((row: unknown, index) => {
    if (row === null || typeof row !== "object" || Array.isArray(row)) throw new Fault(`row ${index} is not an object`);
  });
  return document;
}

// What is said of a document: where, then what.
const describe = (name: string, fault: Fault) => (fault.at ? `${name}:${fault.at[0]}:${fault.at[1]}: ${fault.message}` : `${name}: ${fault.message}`);

// A value of a row: a key's own, never one an object inherits.
const field = (row: Row, key: string): unknown => (Object.hasOwn(row, key) ? row[key] : undefined);
const sameValue = (a: unknown, b: unknown): boolean => a === b || (typeof a === "object" && typeof b === "object" && a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b));

// The same keys with the same values, in whichever order: the order of the
// keys of an object is no data of a row.
function sameRow(a: Row, b: Row): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]));
}

// The keys of `rows`, in first-seen order.
function union(rows: readonly Row[]): string[] {
  const names = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) names.add(key);
  return [...names];
}

// The smallest change between the rows and new ones: rows equal at the start
// and the end stay; between them the rows at the same index change in place,
// and what one side has more of is inserted or removed after them. A move is
// said as the rows between its ends changing: finding moves would pair rows
// by a guess at what identifies them, which JSON does not say.
function plan(old: readonly Row[], next: readonly Row[]) {
  let first = 0;
  while (first < old.length && first < next.length && sameRow(old[first]!, next[first]!)) first++;
  let last = 0;
  while (last < old.length - first && last < next.length - first && sameRow(old[old.length - 1 - last]!, next[next.length - 1 - last]!)) last++;
  const oldMiddle = old.length - first - last;
  const newMiddle = next.length - first - last;
  const changed = Math.min(oldMiddle, newMiddle);
  return { first, changed, removed: oldMiddle - changed, inserted: newMiddle - changed };
}

// A row as a view reads it: a property per role, which tells its readers
// when the row changes in place.
const ROW: unique symbol = Symbol("row");

function defineRole(self: Model, name: string): void {
  Object.defineProperty(self.$element, name, {
    get(this: Element) {
      track(this, name);
      return field(this[ROW], name);
    },
    enumerable: true,
    configurable: true,
  });
}

function element(self: Model, row: Row): Element {
  const made: Element = Object.create(self.$element);
  made[ROW] = row;
  return made;
}

// The views, which a reset tells of everything again; the program hears of
// it as a reset, not as rows.
const views = (self: Model): Listener[] => [...self.$listeners].filter((listener) => listener !== self.$aloud);

// Makes `next` the rows and says what differs: the roles first, on their
// own, so that whoever hears of the rows can read them by the roles they
// have; then the rows, the count and the status.
function apply(self: Model, next: Row[], status: number): void {
  const known = self.$roles;
  const names = union(next);
  // A role is gone: what a view shaped its delegates by no longer holds, so
  // the rows go in with the roles and all is said as one reset.
  const gone = next.length > 0 && known.some((name) => !names.includes(name));
  if (gone) {
    self.modelAboutToBeReset();
    const length = self.$elements.length;
    self.$elements = [];
    for (const view of views(self)) if (length) view.removed(0, length);
    self.$roles = names;
    self.$element = {};
    for (const name of names) defineRole(self, name);
    for (const view of views(self)) for (const name of names) view.role(name);
    slot(self, "roles")!.write([...names]);
    settle();
    self.$elements = next.map((row) => element(self, row));
    for (const view of views(self)) if (next.length) view.inserted(0, next.length);
    self.modelReset();
  } else {
    const added = names.filter((name) => !known.includes(name));
    if (added.length) {
      self.$roles = [...known, ...added];
      for (const name of added) defineRole(self, name);
      for (const listener of self.$listeners) for (const name of added) listener.role(name);
      slot(self, "roles")!.write([...self.$roles]);
      settle();
    }
    change(self, next);
  }
  slot(self, "count")!.write(self.$elements.length);
  settle();
  slot(self, "error")!.write("");
  slot(self, "status")!.write(status);
  settle();
}

function change(self: Model, next: Row[]): void {
  const old = self.$elements.map((made) => made[ROW]);
  const { first, changed, removed, inserted } = plan(old, next);
  const names = self.$roles;
  // The rows that stayed are the new text's, keys in its order, for `get`:
  // nothing of them is said, as nothing of their data differs.
  for (let row = 0; row < first; row++) self.$elements[row]![ROW] = next[row]!;
  for (let row = first + changed + removed; row < old.length; row++) self.$elements[row]![ROW] = next[row - old.length + next.length]!;

  // The rows in place, then what differs in them, neighbours that differ in
  // the same roles as one change.
  const groups: { first: number; count: number; roles: number[] }[] = [];
  for (let row = first; row < first + changed; row++) {
    const made = self.$elements[row]!;
    const was = made[ROW];
    const now = next[row]!;
    const differing: number[] = [];
    names.forEach((name, index) => {
      if (!sameValue(field(was, name), field(now, name)) || Object.hasOwn(was, name) !== Object.hasOwn(now, name)) differing.push(index);
    });
    made[ROW] = now;
    // A row between two changes that is the same, or whose keys only came
    // in another order, has nothing to say.
    if (!differing.length) continue;
    for (const index of differing) touch(made, names[index]!);
    const group = groups.at(-1);
    if (group && group.first + group.count === row && group.roles.join() === differing.join()) group.count++;
    else groups.push({ first: row, count: 1, roles: differing });
  }
  for (const { first, count, roles } of groups) self.dataChanged(modelIndex(self, first), modelIndex(self, first + count - 1), roles);

  const at = first + changed;
  const nowhere = modelIndex(self, -1);
  if (removed) {
    self.rowsAboutToBeRemoved(nowhere, at, at + removed - 1);
    self.$elements.splice(at, removed);
    for (const listener of self.$listeners) listener.removed(at, removed);
  }
  if (inserted) {
    self.rowsAboutToBeInserted(nowhere, at, at + inserted - 1);
    self.$elements.splice(at, 0, ...next.slice(at, at + inserted).map((row) => element(self, row)));
    for (const listener of self.$listeners) listener.inserted(at, inserted);
  }
}

// The rows stay; everything else says why.
function failed(self: Model, message: string): void {
  console.warn(`QML JsonListModel: ${message}`);
  slot(self, "error")!.write(message);
  slot(self, "status")!.write(ERROR);
  settle();
}

// Reads what the model is set to now. `quietly`: a read that follows a save
// does not show `Loading`, so nothing that shows the status flickers.
function load(self: Model, quietly: boolean): void {
  const asked = ++self.$asked;
  const source = untrack(() => self.source);
  if (!source) {
    follow(self, null);
    const text = untrack(() => self.json);
    if (!text) return apply(self, [], NULL);
    let next: Row[];
    try {
      next = rows(text);
    } catch (fault) {
      return failed(self, describe("json", fault as Fault));
    }
    return apply(self, next, READY);
  }
  const url = new URL(source, document.baseURI).href;
  if (!quietly) {
    slot(self, "status")!.write(LOADING);
    settle();
  }
  // Watched before it is read, so that no save after the read goes unseen.
  follow(self, url);
  self.$request?.abort();
  const request = (self.$request = new AbortController());
  readFile(url, { signal: request.signal })
    .then(
      (text: string): Loaded => ({ next: rows(text) }),
      (error: unknown): Loaded => ({ message: `${url}: ${(error as Error | null | undefined)?.message ?? error}` }),
    )
    .catch((fault: unknown): Loaded => ({ message: describe(url, fault as Fault) }))
    .then(({ next, message }) => {
      if (asked !== self.$asked || request.signal.aborted) return;
      self.$request = null;
      if (next) apply(self, next, READY);
      else failed(self, message!);
    });
}

// What a read of the file comes to: the rows, or what is said of it.
interface Loaded {
  next?: Row[];
  message?: string;
}

function follow(self: Model, url: string | null): void {
  if (self.$following === url) return;
  self.$unwatch?.();
  self.$unwatch = null;
  self.$following = url;
  if (url) self.$unwatch = watch(url, () => load(self, true));
}

export const JsonListModel = defineType("JsonListModel", AbstractListModel, {
  properties: { json: "", source: "", count: 0, roles: [], status: NULL, error: "" },
  enums: { Null: NULL, Ready: READY, Loading: LOADING, Error: ERROR },
  signals: ["modelAboutToBeReset", "modelReset", "rowsAboutToBeInserted", "rowsAboutToBeRemoved"],
  methods: {
    // Reads `source` again, or `json` when there is no source.
    reload(this: Model): void {
      untrack(() => load(this, false));
    },
    // The row at `index` as a plain object; undefined beyond the rows.
    get(this: Model, index: unknown): Row | undefined {
      if (!Number.isInteger(index) || (index as number) < 0) return undefined;
      const made = this.$elements[index as number];
      return made ? structuredClone(made[ROW]) : undefined;
    },
  },
  setup(made) {
    const self: Model = made as typeof made & State;
    self.$element = {};
    self.$asked = 0;
    self.$request = null;
    self.$following = null;
    self.$unwatch = null;
    onCleanup(() => {
      self.$asked++;
      self.$request?.abort();
      self.$unwatch?.();
    });
    // Read once the object is complete and before its `onCompleted`, and
    // again as a handler of a change is: outside Solid's flush, so that what
    // the model says is told in the order it says it (the roles before the
    // rows) and `Loading` is a change its handlers hear.
    const owner = getOwner();
    whenCompleted(() =>
      runWithOwner(owner, () => {
        load(self, false);
        const again = () => untrack(() => load(self, false));
        onChange(self, "json", again);
        onChange(self, "source", again);
      }),
    );
  },
});

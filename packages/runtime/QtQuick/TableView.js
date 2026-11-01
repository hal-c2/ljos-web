// `TableView`: a Flickable of the cells of a model that are in view.
//
// It is laid out as Qt lays it out (qquicktableview.cpp), because what it
// says of itself is what that way of working leaves: the table is a
// rectangle of loaded columns and rows without holes, a column or a row is
// loaded at an edge when the view reaches past it and unloaded when the
// view has left it, and what is outside is only guessed at. `contentWidth`
// is where the loaded columns end plus an average for those that are not
// loaded, and `originX` moves when the guess of what is before them was
// wrong.
//
// Views that follow another through `syncView` are updated after it, from
// the one none of them follows: its columns and their widths are theirs.
import { onCleanup } from "solid-js";
import { defineType, derived, effect, flush, flushing, instantiate, memo, QtObject, settle, slot } from "../object.js";
import { Point } from "../QtQml/values.js";
import { changed, depend, make, resized, SAME, Table } from "./cells.js";
import { Flickable } from "./Flickable.js";
import { forceActiveFocus } from "./focus.js";
import { TapHandler } from "./handlers.js";
import { ControlModifier } from "./keycodes.js";
import { modelIndex, touch, track } from "./model.js";
import { cull } from "./placing.js";
import { signal, untrack } from "#kernel";

const next = (version) => version + 1;

// What a rebuild is to do: Qt's RebuildOptions.
const ALL = 0x1;
const LAYOUT_ONLY = 0x2;
const VIEWPORT_ONLY = 0x4;
const TOP_LEFT_ROW = 0x8;
const TOP_LEFT_COLUMN = 0x10;
const CONTENT_WIDTH = 0x20;
const CONTENT_HEIGHT = 0x40;
const POSITION_ROW = 0x80;
const POSITION_COLUMN = 0x100;
// What a view that follows another does not take over from it.
const OWN = POSITION_ROW | POSITION_COLUMN | TOP_LEFT_ROW | TOP_LEFT_COLUMN;

const AT_END = -1;
const NOT_SET = -2;

const Horizontal = 1;
const Vertical = 2;

const AlignLeft = 0x1;
const AlignRight = 0x2;
const AlignHCenter = 0x4;
const AlignTop = 0x20;
const AlignBottom = 0x40;
const AlignVCenter = 0x80;
const Visible = 0x200;
const Contain = 0x400;

// An alignment along either direction.
const BEGIN = 1;
const END = 2;
const CENTER = 4;

const SelectionDisabled = 0;
const SelectCells = 1;
const SelectRows = 2;
const SelectColumns = 3;
const SingleSelection = 0;
const ContiguousSelection = 1;
const ExtendedSelection = 2;

// What Qt gives a column or a row whose delegates say no size.
const DEFAULT_SIZE = 50;

const NOWHERE = modelIndex(null, -1);
const NOTHING = Object.freeze(Object.create(null));
const UNSET = Symbol("unset");

const key = (column, row) => column * 0x100000000 + row;
const clamp = (value, min, max) => Math.max(Math.min(value, max), min);

// One direction of the table: its columns along x, or its rows along y.
// `lines` are the loaded ones in order, each `{ index, at, size }`.
class Axis {
  constructor(horizontal) {
    this.horizontal = horizontal;
    this.name = horizontal ? "h" : "v";
    this.position = horizontal ? "contentX" : "contentY";
    this.length = horizontal ? "width" : "height";
    this.content = horizontal ? "contentWidth" : "contentHeight";
    this.originKey = horizontal ? "originX" : "originY";
    this.implicit = horizontal ? "implicitWidth" : "implicitHeight";
    this.spacingKey = horizontal ? "columnSpacing" : "rowSpacing";
    this.providerKey = horizontal ? "columnWidthProvider" : "rowHeightProvider";
    this.lead = horizontal ? "leftMargin" : "topMargin";
    this.trail = horizontal ? "rightMargin" : "bottomMargin";
    this.CONTENT = horizontal ? CONTENT_WIDTH : CONTENT_HEIGHT;
    this.TOP_LEFT = horizontal ? TOP_LEFT_COLUMN : TOP_LEFT_ROW;
    this.POSITION = horizontal ? POSITION_COLUMN : POSITION_ROW;
    // How many the model has, and the loaded ones.
    this.count = 0;
    this.lines = [];
    this.spacing = 0;
    this.provider = undefined;
    // The sizes `setColumnWidth` gave.
    this.sizes = new Map();
    // Where the content begins, and how far past its size it goes on.
    this.origin = 0;
    this.end = 0;
    this.average = 0;
    // The size of the content, and the one the application set.
    this.total = 0;
    this.fixed = undefined;
    // Whether it is the followed view's.
    this.sync = false;
    // The view's place in the content when last laid out, and how much of
    // it the view shows.
    this.at = 0;
    this.extent = 0;
    // Where the content was when last looked at: a place it has not been
    // put by the view is one somebody moved it to.
    this.seen = undefined;
    // What `positionViewAtColumn` asked for, for the rebuild that does it.
    this.wanted = null;
  }
  get first() {
    return this.lines[0];
  }
  get last() {
    return this.lines[this.lines.length - 1];
  }
  // The loaded lines' outer edges, and the inner ones: where the first
  // ends and the last begins.
  get start() {
    return this.lines[0].at;
  }
  get stop() {
    const last = this.last;
    return last.at + last.size;
  }
  line(index) {
    for (const line of this.lines) if (line.index === index) return line;
    return undefined;
  }
}

const axes = (t) => [t.h, t.v];
const across = (t, a) => (a.horizontal ? t.v : t.h);
const followed = (self, a) => self.$table.parent.$table[a.name];
const cellAt = (t, a, index, other) => t.cells.get(a.horizontal ? key(index, other) : key(other, index));

function warn(self, message) {
  const t = self.$table;
  if (t.warned) return;
  t.warned = true;
  console.warn(`QML ${self.$type.typeName}: ${message}`);
}

// ---------------------------------------------------------------- sizes

// What the application says a column is wide: 0 for a hidden one, -1 when
// it says nothing and the delegates decide. Qt's `getColumnWidth`.
function said(self, a, index) {
  if (a.sync) {
    const parent = self.$table.parent;
    return said(parent, parent.$table[a.name], index);
  }
  const provider = a.provider;
  if (provider === undefined) return a.sizes.get(index) ?? -1;
  if (typeof provider !== "function") {
    warn(self, `${a.providerKey} doesn't contain a function`);
    return -1;
  }
  const size = Number(provider(index));
  return size >= 0 ? size : -1;
}

// The widest of a column's delegates.
function hint(self, a, index) {
  const t = self.$table;
  let size = 0;
  for (const line of across(t, a).lines) {
    const item = cellAt(t, a, index, line.index)?.$item;
    if (item?.$node) size = Math.max(size, item[a.implicit]);
  }
  return size;
}

// How wide a column is laid out. Qt's `getColumnLayoutWidth`.
function sized(self, a, index) {
  const given = said(self, a, index);
  if (given >= 0) return given;
  if (a.sync) {
    const parent = self.$table.parent;
    const theirs = parent.$table[a.name];
    if (theirs.line(index)) return sized(parent, theirs, index);
  }
  const size = hint(self, a, index);
  if (size > 0) return size;
  warn(self, `the delegate's ${a.implicit} needs to be greater than zero`);
  return DEFAULT_SIZE;
}

// The first column from `start` on that is not hidden, going forwards or
// backwards.
function visibleFrom(self, a, forward, start) {
  if (forward) {
    for (let index = start; index < a.count; index++) if (said(self, a, index) !== 0) return index;
  } else {
    for (let index = start; index >= 0; index--) if (said(self, a, index) !== 0) return index;
  }
  return AT_END;
}

// The one that would be loaded next at an edge of the loaded table.
const around = (self, a, forward) =>
  forward ? visibleFrom(self, a, true, a.last.index + 1) : visibleFrom(self, a, false, a.first.index - 1);

const least = (self, a) => a.origin - self[a.lead];
const most = (self, a) => Math.max(Math.max(-self[a.lead], a.total + self[a.trail] - a.extent) + a.end, least(self, a));

// ---------------------------------------------------------------- cells

// `TableView.onPooled`, `TableView.onReused`: a delegate that listens has
// the handler among what it was given.
function notify(item, name, handler) {
  if (!item?.$props) return;
  if (`TableView$${handler}` in item.$props || item.$attached?.TableView) TableView.attached(item)[name]();
}

function destroy(self, cell) {
  if (cell.$item?.$node) self.$contentItem.$remove(cell.$item);
  cell.$dispose();
}

function drain(self, t) {
  for (const cell of [...t.staged.splice(0), ...t.pool.splice(0)]) destroy(self, cell);
}

// Qt's `commitReleasedItems`: the delegates that were let go and that
// nothing has taken back are for any cell now.
function commit(self, t) {
  for (const cell of t.staged.splice(0)) {
    cell.$home = null;
    if (cell.$item?.$node) cull(cell.$item, true);
    cell.$waited = 0;
    t.pool.push(cell);
    notify(cell.$item, "pooled", "onPooled");
  }
}

// The delegate that was let go while it showed this cell of the model, if
// there is one: it shows it again, and is told of nothing but where the
// cell now is.
function kept(t, row, column) {
  if (!t.table.indexed) return undefined;
  const at = t.staged.findIndex((cell) => cell.$home?.[0] === row && cell.$home[1] === column);
  return at < 0 ? undefined : t.staged.splice(at, 1)[0];
}

// Qt's `drainReusePoolAfterLoadRequest`: a delegate nothing has used for a
// while is destroyed, and a while is longer the more of them an edge has.
function age(self, t) {
  if (!t.pool.length) return;
  for (const a of axes(t)) if (a.at < least(self, a) || a.at > most(self, a)) return;
  const w = t.h.lines.length;
  const h = t.v.lines.length;
  const limit = 2 * Math.ceil(w > h ? (w + 1) / h : (h + 1) / w);
  t.pool = t.pool.filter((cell) => {
    if (++cell.$waited <= limit) return true;
    destroy(self, cell);
    return false;
  });
}

function load(self, t, column, row) {
  const table = t.table;
  const [modelRow, modelColumn] = t.transposed ? [column, row] : [row, column];
  // A delegate used again is told where it now is, and what it makes of
  // that is not known until that has settled.
  let cell = kept(t, modelRow, modelColumn);
  if (cell) {
    if (cell.$row !== modelRow || cell.$column !== modelColumn) {
      table.move(cell, modelRow, modelColumn);
      t.stale = true;
    }
  } else if ((cell = t.fresh ? undefined : t.pool.shift())) {
    table.move(cell, modelRow, modelColumn);
    if (cell.$item?.$node) cull(cell.$item, false);
    notify(cell.$item, "reused", "onReused");
    t.stale = true;
  } else {
    cell = table.cell(modelRow, modelColumn);
    const component = t.delegate;
    const made = instantiate(
      (given) => {
        const object = make(cell, () => component(given));
        // What `TableView.view` is found through.
        if (object) object.$delegate = cell;
        return object;
      },
      cell,
      self.$contentItem,
      self.$owner,
    );
    cell.$item = made.object;
    cell.$dispose = made.dispose;
    const item = cell.$item;
    if (item?.$node) {
      self.$contentItem.$add(item);
      // Above what is declared in the view, as Qt stacks a cell.
      const stacking = slot(item, "z");
      if (!stacking.explicit()) stacking.provide(1);
    }
  }
  // Where its cell is in the model, which is told of rows that come and
  // go: a QPersistentModelIndex, for a model that has indexes.
  cell.$home = table.indexed ? [modelRow, modelColumn] : null;
  cell.$key = key(column, row);
  t.cells.set(cell.$key, cell);
  t.dirty = true;
}

// A delegate that may be used again waits to be: a rebuild takes back the
// ones whose cells it shows again.
function release(self, t, cell, reusable) {
  t.cells.delete(cell.$key);
  if (!reusable || !t.reuse) return destroy(self, cell);
  t.staged.push(cell);
}

// ---------------------------------------------------------------- edges

// Waits, when a delegate was used again, for what is bound to its row and
// column: the layout goes on from here once that has settled, as Qt's goes
// on once a delegate it asked for is made.
function* settling(t) {
  if (!t.stale) return;
  t.stale = false;
  yield;
}

function* loadEdge(self, t, a, forward) {
  const index = around(self, a, forward);
  for (const line of across(t, a).lines) {
    if (a.horizontal) load(self, t, index, line.index);
    else load(self, t, line.index, index);
  }
  yield* settling(t);
  // Beside its neighbour, as wide as its own delegates make it.
  const size = sized(self, a, index);
  if (forward) a.lines.push({ index, at: a.stop + a.spacing, size });
  else a.lines.unshift({ index, at: a.start - a.spacing - size, size });
  if (t.rebuilding) return;
  // Loaded because the view moved, not as a part of a rebuild.
  extents(self, t);
  age(self, t);
  t.changed = true;
}

function unloadEdge(self, t, a, forward) {
  const line = forward ? a.lines.pop() : a.lines.shift();
  for (const other of across(t, a).lines) release(self, t, cellAt(t, a, line.index, other.index), true);
  commit(self, t);
  t.dirty = true;
}

function canLoad(self, a, forward) {
  if (around(self, a, forward) === AT_END) return false;
  return forward ? a.stop < a.at + a.extent - a.spacing : a.start > a.at + a.spacing;
}

// One column is always kept: the rest is laid out from it.
function canUnload(a, forward) {
  if (a.lines.length <= 1) return false;
  return forward ? a.last.at >= a.at + a.extent : a.first.at + a.first.size <= a.at;
}

// The edge that is out of the view, if one is. Qt's `nextEdgeToUnload`.
function outside(t) {
  const h = t.h;
  const v = t.v;
  return canUnload(h, false) ? [h, false] : canUnload(h, true) ? [h, true] : canUnload(v, false) ? [v, false] : canUnload(v, true) ? [v, true] : null;
}

// Qt's `loadAndUnloadVisibleEdges`: one edge at a time, the left before the
// right before the top before the bottom, until the view is filled and
// nothing outside it is loaded.
function* fill(self, t) {
  if (!t.cells.size) return;
  const h = t.h;
  const v = t.v;
  let modified;
  do {
    modified = false;
    const out = outside(t);
    if (out) {
      modified = true;
      unloadEdge(self, t, out[0], out[1]);
    }
    const into = canLoad(self, h, false) ? [h, false] : canLoad(self, h, true) ? [h, true] : canLoad(self, v, false) ? [v, false] : canLoad(self, v, true) ? [v, true] : null;
    if (into) {
      modified = true;
      yield* loadEdge(self, t, into[0], into[1]);
    }
  } while (modified);
}

// --------------------------------------------------------------- layout

// Every loaded column at its width, one after the other from where the
// first is. Qt's `relayoutTableItems`.
function relayout(self, t) {
  if (!(t.h.extent > 0 && t.v.extent > 0)) return;
  for (const a of axes(t)) {
    let at = a.start;
    for (const line of a.lines) {
      const size = sized(self, a, line.index);
      line.at = at;
      line.size = size;
      if (size > 0) at += size + a.spacing;
    }
  }
  t.dirty = true;
}

function average(a) {
  if (a.fixed !== undefined) a.average = (a.fixed - (a.count - 1) * a.spacing) / a.count;
  else a.average = (a.stop - a.start - (a.lines.length - 1) * a.spacing) / a.lines.length;
}

// How large the content is: where the loaded columns end, and the average
// of them for each one after.
function measure(self, t, a) {
  if (a.sync) a.total = followed(self, a).total;
  else if (a.fixed !== undefined) a.total = a.fixed;
  else if (!a.lines.length) a.total = t.h.count * t.v.count > 0 && t.delegate ? DEFAULT_SIZE : 0;
  else {
    const after = around(self, a, true);
    const remaining = after === AT_END ? 0 : a.count - after;
    a.total = a.stop + remaining * (a.average + a.spacing);
  }
}

// Qt's `updateExtents`, for one direction: the content begins where the
// first column is once there is none before it, and ends where the last
// one does once there is none after it; until then both are guessed. Says
// whether the table had to be moved to where the view is.
function extent(self, a) {
  const before = around(self, a, false);
  const after = around(self, a, true);
  let moved = false;
  if (a.sync) {
    const theirs = followed(self, a);
    a.origin = theirs.origin;
    a.end = theirs.end;
  } else if (before === AT_END) {
    // Nothing is left before the table: a gap there is closed at once.
    if (a.start > a.at && a.start > a.origin) {
      a.first.at = a.origin;
      moved = true;
    }
    a.origin = a.first.at;
  } else if (a.start <= a.origin + a.spacing) {
    a.origin = a.start - (before + 1) * (a.average + a.spacing);
  } else if (after === AT_END) {
    if (a.stop < a.at + a.extent) {
      const edge = Math.min(a.at + a.extent, a.total + a.end);
      if (a.stop < edge) {
        a.first.at += edge - a.stop;
        for (const line of a.lines) if (line !== a.first) line.at += edge - a.stop;
        moved = true;
      }
    }
    a.end = a.stop - a.total;
  } else if (a.stop >= a.total + a.end - a.spacing) {
    a.end = a.stop - a.total + (a.count - after) * (a.average + a.spacing);
  }
  return moved;
}

function extents(self, t) {
  const h = t.h;
  const v = t.v;
  const was = [h.origin, v.origin, h.end, v.end];
  const movedX = extent(self, h);
  const movedY = extent(self, v);
  if (movedX || movedY) {
    relayout(self, t);
    // The views that follow this one are no longer where it is.
    for (const child of t.children) {
      child.$table.options |= VIEWPORT_ONLY | (movedX ? TOP_LEFT_COLUMN : 0) | (movedY ? TOP_LEFT_ROW : 0);
    }
  }
  // The view may be left outside the content: it is put back.
  if (was[0] !== h.origin || was[1] !== v.origin || was[2] !== h.end || was[3] !== v.end) t.bound = true;
}

// Qt's `updateContentSize`. The size is only guessed again when asked for,
// or when every column is loaded and it is known.
function contentSize(self, t, options) {
  for (const a of axes(t)) {
    const whole = around(self, a, false) === AT_END && around(self, a, true) === AT_END;
    if (!(options & a.CONTENT) && !whole) continue;
    average(a);
    measure(self, t, a);
  }
  extents(self, t);
}

// The view's place in the content, when the view itself decides it: no
// move for anybody to follow.
function scroll(self, a, value) {
  slot(self, a.position).write(value);
  a.at = a.seen = value;
}

// Where the content has to be for a loaded column to be at `alignment` in
// the view. Qt's `getAlignmentContentX`, which counts in whole pixels.
function aligned(self, a, line, alignment, offset, rect) {
  const from = Math.trunc(line.at) + (rect ? rect.start : 0);
  const length = rect ? rect.length : Math.trunc(line.size);
  // Qt's own "at the end if it fits, else at the beginning".
  if (alignment === (BEGIN | END)) alignment = (rect ? rect.start + rect.length : length) > a.extent ? BEGIN : END;
  let position = 0;
  if (alignment & BEGIN) position = from + offset;
  else if (alignment & END) position = from + length - a.extent + offset;
  else if (alignment & CENTER) position = from - (a.extent - length) / 2 + offset;
  return clamp(position, least(self, a), most(self, a));
}

// Where a rebuild begins: the top left cell and where it is. Qt's
// `calculateTopLeft`.
function topLeft(self, t, options) {
  const found = { h: NOT_SET, v: NOT_SET, hAt: 0, vAt: 0 };
  if (!t.h.count || !t.v.count) {
    found.h = found.v = AT_END;
    return found;
  }
  if (t.h.sync || t.v.sync) {
    // The followed view's, as far as this one has it.
    if (!t.parent.$table.cells.size) return found;
    for (const a of axes(t)) {
      if (!a.sync) continue;
      const theirs = followed(self, a).first;
      found[a.name] = theirs.index >= a.count ? AT_END : theirs.index;
      found[`${a.name}At`] = theirs.at;
    }
  }
  for (const a of axes(t)) {
    if (a.sync) continue;
    const pitch = a.average + a.spacing;
    let index;
    let at = 0;
    if (options & ALL) index = visibleFrom(self, a, true, 0);
    else if (options & a.TOP_LEFT) {
      // A guess from where the view is.
      index = clamp(pitch > 0 ? Math.trunc(a.at / pitch) : 0, 0, a.count - 1);
      at = index * pitch;
    } else if (options & a.POSITION) {
      index = clamp(a.wanted.index, 0, a.count - 1);
      at = index * pitch;
    } else {
      // The one it was, if the model still has it.
      index = clamp(a.first.index, 0, a.count - 1);
      at = a.start;
    }
    found[a.name] = index;
    found[`${a.name}At`] = at;
  }
  return found;
}

// Qt's `loadInitialTable`: everything is let go, and the table begun
// again from its top left cell.
function* begin(self, t, options) {
  const h = t.h;
  const v = t.v;
  const table = t.table;
  h.count = t.transposed ? table.rows() : table.columns();
  v.count = t.transposed ? table.columns() : table.rows();
  resized(table);
  const top = topLeft(self, t, options);
  for (const cell of [...t.cells.values()]) release(self, t, cell, !(options & ALL));
  if (options & ALL) {
    h.origin = v.origin = 0;
    h.end = v.end = 0;
  }
  h.lines = [];
  v.lines = [];
  t.dirty = true;
  for (const a of axes(t)) {
    if (a.sync) scroll(self, a, t.parent[a.position]);
    else if (options & a.POSITION) scroll(self, a, top[`${a.name}At`]);
  }
  if (!(h.count * v.count > 0) || !t.delegate || top.h < 0 || top.v < 0) return;
  if (!(h.extent > 0 && v.extent > 0)) return;
  load(self, t, top.h, top.v);
  h.lines.push({ index: top.h, at: top.hAt, size: 0 });
  v.lines.push({ index: top.v, at: top.vAt, size: 0 });
  yield* settling(t);
  // The height before the width, as Qt asks for them.
  v.first.size = sized(self, v, top.v);
  h.first.size = sized(self, h, top.h);
  yield* fill(self, t);
}

// Qt's `processRebuildTable`.
function* rebuild(self, t) {
  let options = t.options;
  t.options = 0;
  if (!t.cells.size) options |= ALL;
  if (options & ALL) options = (options & ~(VIEWPORT_ONLY | LAYOUT_ONLY)) | CONTENT_WIDTH | CONTENT_HEIGHT;
  else if (options & VIEWPORT_ONLY) options &= ~LAYOUT_ONLY;
  if (options & POSITION_ROW) options &= ~TOP_LEFT_ROW;
  if (options & POSITION_COLUMN) options &= ~TOP_LEFT_COLUMN;
  t.rebuilt = options;
  t.rebuilding = true;
  if (!(options & LAYOUT_ONLY)) yield* begin(self, t, options);
  if (!t.cells.size) {
    measure(self, t, t.h);
    measure(self, t, t.v);
  } else {
    relayout(self, t);
    contentSize(self, t, options);
    for (const a of axes(t)) {
      // The cell asked for is where the rebuild began: now that its size
      // is known, the view is put where it was asked to be.
      const wanted = a.wanted;
      if (!(options & a.POSITION) || wanted.index !== a.first.index) continue;
      scroll(self, a, aligned(self, a, a.first, wanted.alignment, wanted.offset, wanted.rect));
    }
    yield* fill(self, t);
    for (const a of axes(t)) {
      // Asked to be somewhere, the view is not left past the content.
      if (!(options & a.POSITION) || a.sync) continue;
      const low = least(self, a);
      const high = most(self, a);
      if (a.at < low) scroll(self, a, low);
      else if (a.at > high) scroll(self, a, high);
    }
    yield* fill(self, t);
    contentSize(self, t, options);
    if (options & ALL && t.reuse) {
      // A column and a row more than the view shows, for the pool: the
      // first flick has delegates to use.
      if (around(self, t.h, true) !== AT_END) yield* loadEdge(self, t, t.h, true);
      if (around(self, t.v, true) !== AT_END) yield* loadEdge(self, t, t.v, true);
      for (let out; (out = outside(t)); ) unloadEdge(self, t, out[0], out[1]);
    }
  }
  commit(self, t);
  t.rebuilding = false;
  t.changed = true;
}

// Whether a hidden column is loaded or one that is not hidden is left out
// between the loaded ones. Qt's `checkForVisibilityChanges`.
function visibility(self, t) {
  let options = 0;
  if (!t.cells.size) return options;
  for (const a of axes(t)) {
    const first = a.first.index;
    if (a.start === a.origin && first !== 0) options |= VIEWPORT_ONLY | a.TOP_LEFT;
    else {
      for (let index = first; index <= a.last.index; index++) {
        if (Boolean(a.line(index)) === (said(self, a, index) !== 0)) continue;
        options |= VIEWPORT_ONLY | (index === first ? a.TOP_LEFT : 0);
        break;
      }
    }
  }
  return options;
}

// What `forceLayout()` asks for.
function layoutOptions(self, t) {
  const table = t.table;
  let options = LAYOUT_ONLY | CONTENT_WIDTH | CONTENT_HEIGHT | visibility(self, t);
  if (table) {
    const columns = t.transposed ? table.rows() : table.columns();
    const rows = t.transposed ? table.columns() : table.rows();
    if (columns !== t.h.count || rows !== t.v.count) options |= VIEWPORT_ONLY;
  }
  return options;
}

// ----------------------------------------------------------------- sync

// The view this one follows, and in which directions.
function link(self, t) {
  const parent = self.syncView?.$table ? self.syncView : null;
  if (parent !== t.parent) {
    t.parent?.$table.children.delete(self);
    t.parent = null;
    for (let view = parent; view; view = view.$table.parent) {
      if (view !== self) continue;
      warn(self, "TableView: recursive syncView connection detected!");
      break;
    }
    if (parent && !t.warned) {
      parent.$table.children.add(self);
      t.parent = parent;
      t.options |= VIEWPORT_ONLY;
    }
  }
  const direction = self.$syncs();
  t.h.sync = Boolean(t.parent) && (direction & Horizontal) !== 0;
  t.v.sync = Boolean(t.parent) && (direction & Vertical) !== 0;
}

// What changed since the view was last laid out, as rebuild options.
function detect(self, t) {
  link(self, t);
  const source = self.$source();
  const transposed = self.$transposed(source);
  if (source !== t.source || transposed !== t.transposed) {
    t.source = source;
    t.transposed = transposed;
    t.unwatch?.();
    for (const cell of [...t.cells.values()]) release(self, t, cell, false);
    drain(self, t);
    t.table = new Table(self, source);
    t.unwatch = t.table.watch(t.listener);
    t.options |= ALL;
  }
  const delegate = self.delegate;
  if (delegate !== t.given) {
    t.given = delegate;
    t.delegate = typeof delegate === "function" ? delegate : null;
    for (const cell of [...t.cells.values()]) release(self, t, cell, false);
    drain(self, t);
    t.options |= ALL;
  }
  t.reuse = Boolean(self.reuseItems);
  if (!t.reuse) drain(self, t);
  let resizedView = false;
  for (const a of axes(t)) {
    if (a.sync) {
      // The spacing and the margins of the followed view are this one's.
      const parent = t.parent;
      for (const name of [a.spacingKey, a.lead, a.trail]) slot(self, name).write(parent[name]);
    }
    const spacing = self[a.spacingKey];
    if (spacing !== a.spacing) {
      a.spacing = spacing;
      t.options |= LAYOUT_ONLY | a.CONTENT;
    }
    const provider = self[a.providerKey];
    if (provider !== a.provider) {
      a.provider = provider;
      t.options |= VIEWPORT_ONLY | a.CONTENT;
    }
    // A content size the application set is kept.
    const content = slot(self, a.content);
    const fixed = content.assigned || content.bound || content.given !== undefined;
    if (fixed) content.place(undefined);
    a.fixed = fixed ? self[a.content] : undefined;
    const length = self[a.length];
    if (length !== a.extent) resizedView = true;
  }
  if (resizedView) {
    drain(self, t);
    t.options |= layoutOptions(self, t);
  }
  const table = t.table;
  const columns = t.transposed ? table.rows() : table.columns();
  const rows = t.transposed ? table.columns() : table.rows();
  if (columns !== t.h.count) t.options |= VIEWPORT_ONLY | CONTENT_WIDTH;
  if (rows !== t.v.count) t.options |= VIEWPORT_ONLY | CONTENT_HEIGHT;
  if (!t.parent) return;
  const theirs = t.parent.$table;
  for (const a of axes(t)) {
    if (!a.sync) continue;
    measure(self, t, a);
    if (!(t.options & LAYOUT_ONLY) || !a.lines.length) continue;
    // The followed view's first column is another one, or elsewhere:
    // laying out what is loaded here would not bring it there.
    const first = theirs[a.name].first;
    if (first?.index !== a.first.index || first.at !== a.first.at) t.options = (t.options & ~LAYOUT_ONLY) | VIEWPORT_ONLY;
  }
  // With fewer rows than the followed view, there may have been nothing to
  // show where it was, and now there is.
  if (!t.cells.size && t.h.count * t.v.count > 0 && theirs.cells.size) {
    if (t.h.sync && theirs.h.first.index <= t.h.count - 1) t.options |= VIEWPORT_ONLY;
    else if (t.v.sync && theirs.v.first.index <= t.v.count - 1) t.options |= VIEWPORT_ONLY;
  }
}

// Qt's `updateTable`: a rebuild if one is asked for, and else the edges
// that the view's move brought in or left behind.
function* update(self, t) {
  for (const a of axes(t)) {
    a.at = a.seen = self[a.position];
    a.extent = self[a.length];
  }
  if (t.options) yield* rebuild(self, t);
  else yield* fill(self, t);
}

// What the view says of itself, from what the layout left.
function publish(self, t) {
  const h = t.h;
  const v = t.v;
  for (const a of axes(t)) {
    const origin = slot(self, a.originKey);
    if (untrack(() => self[a.originKey]) !== a.origin) {
      // The content stays where it is while its beginning moves.
      const position = slot(self, a.position);
      if (!position.assigned && !position.bound) position.write(a.at);
      origin.place(a.origin);
    }
    if (a.fixed === undefined) slot(self, a.content).place(a.total);
    if (a.end !== a.ended) {
      a.ended = a.end;
      touch(t, "end");
    }
  }
  slot(self, "columns").write(h.count);
  slot(self, "rows").write(v.count);
  slot(self, "leftColumn").write(h.lines.length ? h.first.index : -1);
  slot(self, "rightColumn").write(h.lines.length ? h.last.index : -1);
  slot(self, "topRow").write(v.lines.length ? v.first.index : -1);
  slot(self, "bottomRow").write(v.lines.length ? v.last.index : -1);
  if (t.dirty) {
    t.dirty = false;
    for (const column of h.lines) {
      for (const row of v.lines) {
        const item = t.cells.get(key(column.index, row.index))?.$item;
        if (!item?.$node) continue;
        slot(item, "x").place(column.at);
        slot(item, "y").place(row.at);
        slot(item, "width").place(column.size);
        slot(item, "height").place(row.size);
      }
    }
  }
  if (t.bound) {
    t.bound = false;
    // Qt's `returnToBounds`, at once: a move like any other, which the
    // views that follow this one follow.
    if (!self.$moving) {
      for (const a of axes(t)) {
        const position = clamp(a.at, least(self, a), most(self, a));
        if (position !== a.at) slot(self, a.position).write(position);
      }
    }
  }
}

// `layoutChanged`, once the layout is done: what hears it may ask for
// another.
function tell(view) {
  const t = view.$table;
  for (const child of [...t.children]) tell(child);
  if (!t.changed) return;
  t.changed = false;
  view.layoutChanged();
}

// Qt's `syncViewportPosRecursive`: where one view was moved to, the view
// it follows and the views that follow it are too, in the directions they
// share.
function carry(view, done = new Set()) {
  const t = view.$table;
  done.add(view);
  const put = (other, a, value) => {
    slot(other, a.position).write(value);
    other.$table[a.name].seen = value;
  };
  const parent = t.parent;
  if (parent && !done.has(parent)) {
    for (const a of axes(t)) if (a.sync) put(parent, a, view[a.position]);
    carry(parent, done);
  }
  for (const child of t.children) {
    if (done.has(child)) continue;
    for (const a of axes(child.$table)) if (a.sync) put(child, a, view[a.position]);
    carry(child, done);
  }
}

// Whether somebody moved one of the views: the application, a scroll bar,
// the user.
function moved(view) {
  const t = view.$table;
  let any = false;
  for (const a of axes(t)) {
    const position = view[a.position];
    if (a.seen === undefined) a.seen = position;
    else if (a.seen !== position) any = true;
    a.seen = position;
  }
  if (any) carry(view);
  for (const child of [...t.children]) if (moved(child)) any = true;
  return any;
}

function* updateTree(self) {
  const t = self.$table;
  detect(self, t);
  yield* update(self, t);
  for (const child of [...t.children]) {
    child.$table.options |= t.rebuilt & ~OWN;
    yield* updateTree(child);
  }
  t.rebuilt = 0;
  publish(self, t);
}

// Everything is laid out from the view that follows none: what moved is
// followed, and then each view is updated after the one it follows.
function* work(root) {
  const t = root.$table;
  if (moved(root)) {
    // Moved a view's length or more, nothing loaded is of use: the table
    // is begun again where the view now is. Qt's
    // `scheduleRebuildIfFastFlick`.
    const h = t.h;
    const v = t.v;
    const x = root.contentX;
    const y = root.contentY;
    const width = root.width;
    const height = root.height;
    const shown = h.extent > 0 && v.extent > 0;
    if (!(shown && height > 0 && v.at < y + height && y < v.at + v.extent)) t.options |= VIEWPORT_ONLY | TOP_LEFT_ROW;
    if (!(shown && width > 0 && h.at < x + width && x < h.at + h.extent)) t.options |= VIEWPORT_ONLY | TOP_LEFT_COLUMN;
  }
  yield* updateTree(root);
}

function refresh(self) {
  link(self, self.$table);
  let root = self;
  while (root.$table.parent) root = root.$table.parent;
  const t = root.$table;
  // Asked for from inside a layout (a provider that calls `forceLayout`, a
  // delegate that assigns when it is complete): once this one is done.
  if (t.busy) return void (t.again = true);
  // A layout that waits goes on when what it waits for has settled: until
  // then nothing it was told is seen, and it is asked again when it is.
  if (t.work && untrack(t.version) === t.waited) return;
  t.busy = true;
  try {
    t.work ??= work(root);
    if (!t.work.next().done) {
      // It waits for what has to settle, and goes on in the next run.
      t.again = true;
      t.waited = untrack(t.version);
      return;
    }
    t.work = null;
  } finally {
    t.busy = false;
    // What changed meanwhile was not looked at.
    if (t.again) t.bump(next);
    t.again = false;
  }
  tell(root);
}

// What a method changed is laid out before it returns.
function apply(self) {
  const t = self.$table;
  if (t.ready) untrack(() => refresh(self));
  else t.bump(next);
  settle();
}

// ----------------------------------------------------------- positioning

// An edge whose size is needed at once. Where a delegate used again cannot
// settle, inside a flush, the edge has delegates of its own.
function loadNow(self, t, a, forward) {
  let root = self;
  while (root.$table.parent) root = root.$table.parent;
  const laying = root.$table;
  const busy = laying.busy;
  t.fresh = flushing();
  // What the flush brings does not lay the table out under this.
  laying.busy = true;
  try {
    for (const _ of loadEdge(self, t, a, forward)) flush();
  } finally {
    t.fresh = false;
    laying.busy = busy;
  }
}

// Qt's `scrollToColumn`: moves the view to a column that is loaded or the
// next to be, and says whether it could.
function scrollTo(self, t, a, index, alignment, offset, rect) {
  if (!a.lines.length) return false;
  if (index < a.first.index) {
    if (index !== around(self, a, false)) return false;
    loadNow(self, t, a, false);
  } else if (index > a.last.index) {
    if (index !== around(self, a, true)) return false;
    loadNow(self, t, a, true);
  }
  const line = a.line(index);
  if (!line) return false;
  slot(self, a.position).write(aligned(self, a, line, alignment, offset, rect));
  return true;
}

// Whether a view was moved at once, to a column it has: then it is laid out
// before the method returns, as Qt does it. A rebuild is for later.
let scrolled = false;

function position(self, a, index, alignment, offset, rect) {
  const t = self.$table;
  if (a.sync) return position(t.parent, followed(self, a), index, alignment, offset, rect);
  if (scrollTo(self, t, a, index, alignment, offset, rect)) return void (scrolled = true);
  // Too far to know where it is: the table is begun again from it.
  a.wanted = { index, alignment, offset, rect };
  t.options |= VIEWPORT_ONLY | a.POSITION;
  t.bump(next);
}

function positioned(self, work) {
  scrolled = false;
  untrack(work);
  if (scrolled) apply(self);
}

const validRect = (rect) => rect != null && rect.width > 0 && rect.height > 0;

// Qt's `positionViewAtColumn` and `positionViewAtRow`.
function positionAt(self, a, index, mode, offset, subRect) {
  index = Number(index);
  offset = Number(offset) || 0;
  if (!(index >= 0 && index < a.count) || !a.lines.length) return;
  const rect = validRect(subRect)
    ? { start: a.horizontal ? subRect.x : subRect.y, length: a.horizontal ? subRect.width : subRect.height }
    : null;
  const alignment = a.horizontal ? mode & 7 : (mode >> 5) & 7;
  const first = a.first;
  const last = a.last;
  const end = a.at + a.extent;
  const go = (how, by = offset) => position(self, a, index, how, by, rect);
  if (alignment) go(alignment);
  else if (mode === Contain) {
    if (index < first.index) go(BEGIN);
    else if (index > last.index) go(BEGIN | END);
    else if (index === first.index) {
      if (!rect) go(BEGIN);
      else if (first.at + rect.start < a.at) go(BEGIN);
      else if (first.at + rect.start + rect.length > end) go(END);
    } else if (index === last.index) {
      if (!rect) go(BEGIN | END);
      else if (last.at + rect.start + rect.length > end) go(END);
    }
  } else if (mode === Visible) {
    if (index < first.index) go(BEGIN, -offset);
    else if (index > last.index) go(BEGIN | END);
    else if (rect && rect.start + rect.length > end) go(BEGIN | END);
  } else warn(self, `Unsupported mode: ${mode}`);
}

// A loaded column under a place in the content, or -1: between two it is
// neither's, unless the spacing is shared out.
function lineAt(a, position, includeSpacing) {
  let end = a.start;
  for (const line of a.lines) {
    end += line.size;
    if (position < end) return line.index;
    end += a.spacing;
    if (!includeSpacing && position < end) return NOT_SET;
    if (includeSpacing && position < end - a.spacing / 2) return line.index;
  }
  return -1;
}

const pointOf = (x, y) => (typeof x === "object" && x !== null ? [x.x, x.y, y] : [x, y]);

// -------------------------------------------------------------- pointer

// Qt's `handleTap`: the cell tapped is the current one, and nothing is
// selected any more.
function tapped(self, at, modifiers) {
  if (self.keyNavigationEnabled) forceActiveFocus(self);
  if (modifiers || !self.pointerNavigationEnabled) return;
  const model = self.selectionModel;
  if (self.selectionBehavior !== SelectionDisabled) {
    clearSelection(self);
    untracked(self);
  }
  const cell = self.cellAtPosition(at.x, at.y);
  if (cell.x < 0 || cell.y < 0) return;
  model?.setCurrentIndex(self.modelIndex(cell), 0);
}

// ------------------------------------------------------------ selecting

// What a SelectionRectangle asks of the view it is on, Qt's
// QQuickSelectable: a selection is dragged out from the cell at one place
// to the cell at another, and the selection model is told the cells
// between them.

// What a selection model is told to do with cells.
const SELECT = 2;
const DESELECT = 4;

const NO_CELL = Object.freeze([-1, -1]);
const isCell = (cell) => cell[0] !== -1 && cell[1] !== -1;

// The selection is no longer one that is being made: it was changed by
// somebody else, or it is gone.
function untracked(self) {
  const mine = self.$table.selecting;
  mine.start = mine.end = NO_CELL;
  mine.existing = [];
  mine.flag = 0;
  mine.tell?.(false);
}

function clearSelection(self) {
  const mine = self.$table.selecting;
  const model = self.selectionModel;
  if (!model) return;
  mine.own = true;
  try {
    model.clearSelection();
  } finally {
    mine.own = false;
  }
}

function setCurrent(self, cell) {
  self.selectionModel?.setCurrentIndex(self.modelIndex(cell[0], cell[1]), 0);
}

// The cell at a place in the content, or the nearest one that is loaded and
// in view when there is none there.
function nearest(self, at) {
  const t = self.$table;
  const cell = self.cellAtPosition(at.x, at.y, true);
  if (cell.x !== -1 && cell.y !== -1) return [cell.x, cell.y];
  if (!t.cells.size || t.h.stop === t.h.start || t.v.stop === t.v.start) return NO_CELL;
  const within = (a, value) => {
    const from = self[a.position];
    return clamp(clamp(value, a.start, a.stop - 1) - from, 0, self[a.length]) + from;
  };
  const found = self.cellAtPosition(within(t.h, at.x), within(t.v, at.y), true);
  return [found.x, found.y];
}

function warnOnce(self, message) {
  const mine = self.$table.selecting;
  if (!mine.warned) console.warn(`QML ${self.$type.typeName}: ${message}`);
  mine.warned = true;
}

export function hasSelection(self) {
  return Boolean(self.selectionModel?.hasSelection);
}

// What `told(still)` is called with: false when the selection is no longer
// the rectangle that was dragged out, true when the rectangle changed.
export function onSelection(self, told) {
  self.$table.selecting.tell = told;
}

// A selection begins: what there was is kept only when the mode lets more
// than one be made and a modifier is held. With Ctrl on a selected cell,
// what is dragged out is taken from the selection.
export function startSelection(self, at, modifiers) {
  const mine = self.$table.selecting;
  const model = self.selectionModel;
  if (!model) {
    warnOnce(self, "Cannot start selection: no SelectionModel assigned!");
    return false;
  }
  if (self.selectionBehavior === SelectionDisabled) {
    console.warn(`QML ${self.$type.typeName}: Cannot start selection: TableView.selectionBehavior == TableView.SelectionDisabled`);
    return false;
  }
  const mode = self.selectionMode;
  if (mode === SingleSelection || mode === ContiguousSelection || !modifiers) clearSelection(self);
  else mine.existing = model.selectedIndexes;
  mine.flag = SELECT;
  if (modifiers & ControlModifier) {
    const cell = nearest(self, at);
    if (!isCell(cell)) return false;
    if (model.isSelected(self.index(cell[1], cell[0]))) mine.flag = DESELECT;
  }
  mine.start = mine.end = NO_CELL;
  return true;
}

// The cells from one corner to the other, row by row. A corner the model
// does not have makes it none, as a QItemSelectionRange is then not valid.
function between(self, left, top, right, bottom) {
  const cells = [];
  if (!self.index(top, left).valid || !self.index(bottom, right).valid) return cells;
  for (let row = top; row <= bottom; row++) {
    for (let column = left; column <= right; column++) cells.push(self.index(row, column));
  }
  return cells;
}

const spanOf = (from, to) => [Math.min(from[0], to[0]), Math.min(from[1], to[1]), Math.max(from[0], to[0]), Math.max(from[1], to[1])];

// Qt's `updateSelection`: the cells of the new rectangle are selected, and
// those the old one had beyond it no longer are.
function reselect(self, from, to) {
  const mine = self.$table.selecting;
  if (from[0] === mine.start[0] && from[1] === mine.start[1] && to[0] === mine.end[0] && to[1] === mine.end[1]) return;
  const model = self.selectionModel;
  const [oldLeft, oldTop, oldRight, oldBottom] = spanOf(from, to);
  const [left, top, right, bottom] = spanOf(mine.start, mine.end);
  const select = between(self, left, top, right, bottom);
  const deselect = new Set();
  const add = (cells) => cells.forEach((cell) => deselect.add(cell));
  if (oldLeft < left) add(between(self, oldLeft, oldTop, left - 1, oldBottom));
  else if (oldRight > right) add(between(self, right + 1, oldTop, oldRight, oldBottom));
  if (oldTop < top) add(between(self, oldLeft, oldTop, oldRight, top - 1));
  else if (oldBottom > bottom) add(between(self, oldLeft, bottom + 1, oldRight, oldBottom));
  mine.own = true;
  try {
    if (mine.flag === SELECT) {
      // What was selected before this selection began stays.
      model.select([...deselect].filter((cell) => !mine.existing.includes(cell)), DESELECT);
      model.select(select, SELECT);
    } else {
      model.select(mine.existing.filter((cell) => !select.includes(cell)), SELECT);
      model.select(select, DESELECT);
    }
  } finally {
    mine.own = false;
  }
}

// The cell a corner is at, for what the view selects: a cell, its row or
// its column.
function corner(self, cell, far) {
  const t = self.$table;
  switch (self.selectionBehavior) {
    case SelectCells:
      return cell;
    case SelectRows:
      return [far ? t.h.count - 1 : 0, cell[1]];
    case SelectColumns:
      return [cell[0], far ? t.v.count - 1 : 0];
  }
  return null;
}

function selectable(self) {
  const model = self.selectionModel;
  if (!self.$table.cells.size) return false;
  if (!model) {
    warnOnce(self, "Cannot set selection: no SelectionModel assigned!");
    return false;
  }
  return Boolean(model.model);
}

// `at` is a place in the content, or x -1 for the current cell.
export function setSelectionStartPos(self, at) {
  const t = self.$table;
  const mine = t.selecting;
  if (!selectable(self)) return;
  if (self.selectionMode === SingleSelection && isCell(mine.start)) return;
  const from = mine.start;
  let cell;
  if (at.x === -1) cell = t.cellOf(self.selectionModel.currentIndex);
  else {
    cell = nearest(self, at);
    if (isCell(cell)) setCurrent(self, cell);
  }
  if (!isCell(cell)) return;
  const start = corner(self, cell, false);
  if (!start) return;
  mine.start = start;
  if (isCell(mine.end)) reselect(self, from, mine.end);
}

export function setSelectionEndPos(self, at) {
  const mine = self.$table.selecting;
  if (!selectable(self)) return;
  const to = mine.end;
  let cell;
  if (self.selectionMode === SingleSelection) cell = mine.start;
  else {
    cell = nearest(self, at);
    if (!isCell(cell)) return;
  }
  setCurrent(self, cell);
  const end = corner(self, cell, true);
  if (!end) return;
  mine.end = end;
  if (isCell(mine.start)) reselect(self, mine.start, to);
}

// The start is the top left corner and the end the bottom right one, which
// is what a selection's handles are at. The selection is the same.
export function normalizeSelection(self) {
  const mine = self.$table.selecting;
  const [left, top, right, bottom] = spanOf(mine.start, mine.end);
  mine.start = [left, top];
  mine.end = [right, bottom];
}

// Where the selection is in the content, in whole pixels as in Qt. A corner
// in a column or a row that is not loaded is put at the content's edge.
export function selectionRectangle(self) {
  const t = self.$table;
  if (!t.h.lines.length || !t.v.lines.length) return { x: 0, y: 0, width: 0, height: 0 };
  const [left, top, right, bottom] = spanOf(t.selecting.start, t.selecting.end);
  const edge = (a, index, far) => {
    const line = a.line(index);
    if (line) return Math.trunc(far ? line.at + line.size : line.at);
    return index > a.last.index ? Math.trunc(self[a.content]) : 0;
  };
  const x = edge(t.h, left, false);
  const y = edge(t.v, top, false);
  return { x, y, width: edge(t.h, right, true) - x, height: edge(t.v, bottom, true) - y };
}

// Moves the content a step towards a place outside the view. Gives how far
// outside the place is, each way, or 0 when there is nowhere to go.
export function scrollTowardsPoint(self, at, step) {
  const t = self.$table;
  if (!t.cells.size) return { width: 0, height: 0 };
  const towards = (a, place, by) => {
    const from = self[a.position];
    const to = from + self[a.length];
    const forward = place >= to - 1;
    if (!forward && place >= from) return 0;
    const loaded = around(self, a, forward) === AT_END;
    const left = forward ? a.stop - to : from - a.start;
    if (left <= 0 && loaded) return 0;
    if (loaded) by = Math.min(by, left);
    self[a.position] = forward ? from + by : from - by;
    return place - (forward ? to : from) - 1;
  };
  return untrack(() => ({ width: towards(t.h, at.x, step.width), height: towards(t.v, at.y, step.height) }));
}

// What a delegate has attached as `TableView`.
const TableViewAttached = defineType("TableViewAttached", QtObject, {
  properties: {
    view: derived((self) => self.$of.$delegate?.$view ?? null),
  },
  signals: ["pooled", "reused"],
  setup(self, props) {
    self.$of = props.$attachee;
  },
});

export const TableView = defineType("TableView", Flickable, {
  properties: {
    model: undefined,
    delegate: undefined,
    rows: 0,
    columns: 0,
    rowSpacing: 0,
    columnSpacing: 0,
    rowHeightProvider: undefined,
    columnWidthProvider: undefined,
    syncView: null,
    syncDirection: Horizontal | Vertical,
    leftColumn: -1,
    rightColumn: -1,
    topRow: -1,
    bottomRow: -1,
    reuseItems: true,
    alternatingRows: true,
    selectionModel: null,
    selectionBehavior: SelectCells,
    selectionMode: ExtendedSelection,
    keyNavigationEnabled: true,
    pointerNavigationEnabled: true,
    currentRow: derived((self) => {
      const index = self.selectionModel?.currentIndex;
      return index?.valid ? self.$table.cellOf(index)[1] : -1;
    }),
    currentColumn: derived((self) => {
      const index = self.selectionModel?.currentIndex;
      return index?.valid ? self.$table.cellOf(index)[0] : -1;
    }),
  },
  enums: {
    AlignLeft,
    AlignRight,
    AlignHCenter,
    AlignTop,
    AlignBottom,
    AlignVCenter,
    AlignCenter: AlignHCenter | AlignVCenter,
    Visible,
    Contain,
    SelectionDisabled,
    SelectCells,
    SelectRows,
    SelectColumns,
    SingleSelection,
    ContiguousSelection,
    ExtendedSelection,
  },
  signals: ["layoutChanged"],
  attached: TableViewAttached,
  methods: {
    // The model the cells are of. A header view has another when it is
    // given none.
    $source() {
      return this.model;
    },
    // Whether the model's rows are laid out as columns.
    $transposed() {
      return false;
    },
    // The directions it follows its `syncView` in.
    $syncs() {
      return this.syncDirection;
    },
    $selected(row, column) {
      return this.$table.picked().has(key(column, row));
    },
    $current(row, column) {
      const index = this.selectionModel?.currentIndex;
      return Boolean(index?.valid) && index.row === row && index.column === column;
    },
    // The content ends where the table is found to end, which is not
    // always where its guessed size says.
    $maxX() {
      const t = this.$table;
      track(t, "end");
      const width = this.contentWidth;
      const end = Math.max(-this.leftMargin, (width < 0 ? this.width : width) + this.rightMargin - this.width);
      return Math.max(end + t.h.end, this.$minX());
    },
    $maxY() {
      const t = this.$table;
      track(t, "end");
      const height = this.contentHeight;
      const end = Math.max(-this.topMargin, (height < 0 ? this.height : height) + this.bottomMargin - this.height);
      return Math.max(end + t.v.end, this.$minY());
    },
    forceLayout() {
      const t = this.$table;
      untrack(() => (t.options |= layoutOptions(this, t)));
      apply(this);
    },
    // The layout a new size asks for, which Qt does not do at once.
    $relayout() {
      const t = this.$table;
      untrack(() => (t.options |= layoutOptions(this, t)));
      t.bump(next);
    },
    columnWidth(column) {
      return this.$table.h.line(column)?.size ?? -1;
    },
    rowHeight(row) {
      return this.$table.v.line(row)?.size ?? -1;
    },
    implicitColumnWidth(column) {
      const t = this.$table;
      return t.h.line(column) ? untrack(() => hint(this, t.h, column)) : -1;
    },
    implicitRowHeight(row) {
      const t = this.$table;
      return t.v.line(row) ? untrack(() => hint(this, t.v, row)) : -1;
    },
    explicitColumnWidth(column) {
      return this.$explicit(this.$table.h, column);
    },
    explicitRowHeight(row) {
      return this.$explicit(this.$table.v, row);
    },
    setColumnWidth(column, size) {
      this.$resize(this.$table.h, "column", column, size);
    },
    setRowHeight(row, size) {
      this.$resize(this.$table.v, "row", row, size);
    },
    clearColumnWidths() {
      this.$clear(this.$table.h);
    },
    clearRowHeights() {
      this.$clear(this.$table.v);
    },
    $explicit(a, index) {
      if (a.sync) return this.$table.parent.$explicit(followed(this, a), index);
      return a.sizes.get(index) ?? -1;
    },
    $resize(a, name, index, size) {
      const t = this.$table;
      index = Number(index);
      size = Number(size);
      if (index < 0) return void console.warn(`QML TableView: ${name} must be greather than, or equal to, zero`);
      if (a.sync) return t.parent.$resize(followed(this, a), name, index, size);
      if (this.$explicit(a, index) === size) return;
      if (size < 0) a.sizes.delete(index);
      else a.sizes.set(index, size);
      if (t.cells.size) this.$relayout();
    },
    $clear(a) {
      if (a.sync) return this.$table.parent.$clear(followed(this, a));
      if (!a.sizes.size) return;
      a.sizes.clear();
      this.$relayout();
    },
    isColumnLoaded(column) {
      return Boolean(this.$table.h.line(column));
    },
    isRowLoaded(row) {
      return Boolean(this.$table.v.line(row));
    },
    positionViewAtRow(row, mode, offset, subRect) {
      positioned(this, () => positionAt(this, this.$table.v, row, mode, offset, subRect));
    },
    positionViewAtColumn(column, mode, offset, subRect) {
      positioned(this, () => positionAt(this, this.$table.h, column, mode, offset, subRect));
    },
    // A cell is a point, its column first: `positionViewAtCell(cell, mode,
    // offset, subRect)` or `positionViewAtCell(column, row, mode, ...)`.
    positionViewAtCell(...args) {
      const [column, row, mode, offset, subRect] = typeof args[0] === "object" && args[0] !== null ? [args[0].x, args[0].y, ...args.slice(1)] : args;
      const horizontal = mode & ~(AlignTop | AlignBottom | AlignVCenter);
      const vertical = mode & ~(AlignLeft | AlignRight | AlignHCenter);
      if (!horizontal && !vertical) return void console.warn(`QML TableView: Unsupported mode: ${mode}`);
      const t = this.$table;
      // The column, and then the row from where that has left the view.
      if (horizontal) positioned(this, () => positionAt(this, t.h, column, horizontal, offset?.x, subRect));
      if (vertical) positioned(this, () => positionAt(this, t.v, row, vertical, offset?.y, subRect));
    },
    positionViewAtIndex(index, mode, offset, subRect) {
      const [column, row] = this.$table.cellOf(index);
      this.positionViewAtCell(column, row, mode, offset, subRect);
    },
    itemAtCell(column, row) {
      [column, row] = pointOf(column, row);
      return this.$table.cells.get(key(column, row))?.$item ?? null;
    },
    itemAtIndex(index) {
      const [column, row] = this.$table.cellOf(index);
      return this.itemAtCell(column, row);
    },
    // The cell at a place in the content, as a point of its column and
    // row: `cellAtPosition(point, includeSpacing)` or `cellAtPosition(x,
    // y, includeSpacing)`.
    cellAtPosition(x, y, includeSpacing) {
      [x, y, includeSpacing = includeSpacing] = pointOf(x, y);
      const t = this.$table;
      const h = t.h;
      const v = t.v;
      if (!t.cells.size || x < h.start || x > h.stop || y < v.start || y > v.stop) return new Point(-1, -1);
      const column = lineAt(h, x, Boolean(includeSpacing));
      const row = column === NOT_SET ? NOT_SET : lineAt(v, y, Boolean(includeSpacing));
      return column === NOT_SET || row === NOT_SET ? new Point(-1, -1) : new Point(column, row);
    },
    index(row, column) {
      const t = this.$table;
      if (!t.table) return NOWHERE;
      return t.transposed ? t.table.index(column, row) : t.table.index(row, column);
    },
    modelIndex(column, row) {
      [column, row] = pointOf(column, row);
      return this.index(row, column);
    },
    cellAtIndex(index) {
      const [column, row] = this.$table.cellOf(index);
      return new Point(column, row);
    },
    rowAtIndex(index) {
      return this.$table.cellOf(index)[1];
    },
    columnAtIndex(index) {
      return this.$table.cellOf(index)[0];
    },
  },
  setup(self) {
    const [version, bump] = signal(0, self.$owner);
    const schedule = (options) => {
      t.options |= options;
      bump(next);
    };
    // Every delegate's cell where the model says it now is. Told nothing,
    // nothing is known of any.
    const follow = (rows, columns) => {
      for (const cell of t.cells.values()) {
        const home = cell.$home;
        if (!home) continue;
        const row = rows?.(home[0]);
        const column = columns?.(home[1]);
        cell.$home = row >= 0 && column >= 0 ? [row, column] : null;
      }
    };
    const t = (self.$table = {
      tick: 0,
      ready: false,
      // The layout that is going on, and whether it had to wait.
      busy: false,
      work: null,
      again: false,
      waited: -1,
      stale: false,
      fresh: false,
      version,
      bump,
      h: new Axis(true),
      v: new Axis(false),
      source: UNSET,
      transposed: false,
      table: null,
      unwatch: null,
      given: UNSET,
      delegate: null,
      cells: new Map(),
      pool: [],
      // The delegates let go that a rebuild may take back.
      staged: [],
      reuse: true,
      options: 0,
      rebuilt: 0,
      rebuilding: false,
      dirty: false,
      changed: false,
      bound: false,
      warned: false,
      parent: null,
      children: new Set(),
      // The selection being made: the cells it began and ends at, what
      // was selected before it, whether it selects or takes away, who is
      // told of it, and whether a change to the selection is its own.
      selecting: { start: NO_CELL, end: NO_CELL, existing: [], flag: 0, tell: null, own: false, warned: false, model: null },
      // What the model says changed in it.
      // `rows` and `columns` say where a row and a column now are, or -1
      // for one that is gone.
      listener: {
        reset: () => schedule(ALL),
        rows(rows) {
          follow(rows, SAME);
          schedule(VIEWPORT_ONLY | (t.transposed ? CONTENT_WIDTH : CONTENT_HEIGHT));
        },
        columns(columns) {
          follow(SAME, columns);
          schedule(VIEWPORT_ONLY | (t.transposed ? CONTENT_HEIGHT : CONTENT_WIDTH));
        },
        moved(rows, columns) {
          follow(rows, columns);
          schedule(VIEWPORT_ONLY);
        },
        // A delegate has its new data when the model has said so.
        data(within, roles) {
          for (const cell of t.cells.values()) if (within(cell.$row, cell.$column)) changed(cell, roles);
          settle();
        },
      },
      // The cells that are selected, by where they are in the model.
      picked: memo(() => {
        const cells = new Set();
        for (const index of self.selectionModel?.selectedIndexes ?? []) cells.add(key(index.column, index.row));
        return cells;
      }, {}),
      // The column and the row a cell of the model is laid out at.
      cellOf(index) {
        if (!index?.valid || index.model !== t.source) return [-1, -1];
        return t.transposed ? [index.row, index.column] : [index.column, index.row];
      },
    });
    onCleanup(() => {
      t.unwatch?.();
      t.parent?.$table.children.delete(self);
      for (const child of t.children) child.$table.parent = null;
    });
    effect(
      () => {
        version();
        depend(self.$source());
        self.delegate;
        self.reuseItems;
        self.syncView;
        self.syncDirection;
        for (const a of axes(t)) {
          self[a.position];
          self[a.length];
          self[a.spacingKey];
          self[a.providerKey];
          self[a.lead];
          self[a.trail];
          if (slot(self, a.content).explicit()) self[a.content];
        }
        return ++t.tick;
      },
      () => {
        t.ready = true;
        untrack(() => refresh(self));
      },
    );
    // A selection somebody else changed is no longer the one being made.
    const elsewhere = () => {
      if (!t.selecting.own) untracked(self);
    };
    onCleanup(() => t.selecting.model?.selectionChanged.disconnect(elsewhere));
    // The selection model is of the view's model.
    effect(
      () => [self.selectionModel, self.$source()],
      ([selection, source]) => {
        const mine = t.selecting;
        if (mine.model !== selection) {
          mine.model?.selectionChanged.disconnect(elsewhere);
          mine.model = selection;
          selection?.selectionChanged.connect(elsewhere);
        }
        if (!selection) return;
        const table = t.source === source ? t.table : new Table(self, source);
        slot(selection, "model").write(table.indexed ? source : null);
      },
    );
    // A tap makes a cell the current one: on the press when the view does
    // not flick, as in Qt.
    const tap = instantiate(
      () =>
        TapHandler({
          get enabled() {
            return self.pointerNavigationEnabled;
          },
        }),
      NOTHING,
      self.$contentItem,
    ).object;
    tap.singleTapped.connect((point) => {
      if (untrack(() => self.interactive)) untrack(() => tapped(self, point.position, point.modifiers));
    });
    effect(
      () => tap.pressed,
      (pressed) => {
        if (!pressed) return;
        untrack(() => {
          if (!self.interactive) tapped(self, tap.point.position, tap.point.modifiers);
        });
      },
    );
  },
});

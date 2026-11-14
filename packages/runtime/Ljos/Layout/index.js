// `import Ljos.Layout`: what arranges children, in Ljós's own API
// (ljos-ui's `ljos_quick/src/layouts/arrangement.rs` is the specification,
// and DIALECT.md §4.6 the rule it keeps).
//
// `Row`, `Column`, `Box` and `Grid` are one arrangement, with one size rule
// per axis:
//
// - an axis a child says nothing about through `Layout` (no fill, no
//   preferred, smallest or largest size) is the child's own: the
//   arrangement reads its width or height and never writes it;
// - an axis it does say something about asks for `Layout.preferredWidth`,
//   else the width its file gives it, else its implicit width, and then
//   fills and is bounded as in a layout.
//
// A row, column or box none of whose children has a `Layout` packs them
// as a positioner does. Where nothing can grow, children stay at the start
// rather than being spread over the room; where room is shared out it is
// shared in whole pixels, and a child centred or pushed to the far side
// lands on one. Nothing else is rounded.
//
// They are layouts of the runtime's `QtQuick/Layouts` (measured, arranged
// and placed by its `Layout` type, which also gives them their implicit
// size and what `Layout.minimumWidth` of one reads), with the arithmetic
// of their own. `Flow` is `QtQuick`'s positioner as it is, `Layout` the
// layouts' attached type, and `Pages` a face of `StackLayout`: it shows
// one child at a time, and arranges none.
import { defineType, derived, slot } from "../../object.ts";
import { mirrored } from "../../QtQuick/LayoutMirroring.js";
import { Layout, StackLayout } from "../../QtQuick/Layouts/index.js";
import { given, shown } from "../../QtQuick/placing.js";
import { Flow } from "../../QtQuick/positioners.js";
import { distribute, edges, place, roundHalfUp, total, tracks } from "./distribute.js";
import { untrack } from "#kernel";

const H = 0;
const V = 1;
const RightToLeft = 1;
const TopToBottom = 1;
const MAX_CELLS = 1024;

const SIZE = ["width", "height"];
const IMPLICIT = ["implicitWidth", "implicitHeight"];
const FILL = ["fillWidth", "fillHeight"];
const PREFERRED = ["preferredWidth", "preferredHeight"];
const MINIMUM = ["minimumWidth", "minimumHeight"];
const MAXIMUM = ["maximumWidth", "maximumHeight"];
const STRETCH = ["horizontalStretchFactor", "verticalStretchFactor"];

// Alignment flags, as `Align` numbers them.
const ALIGN_RIGHT = 0x2;
const ALIGN_H_CENTER = 0x4;
const ALIGN_BOTTOM = 0x40;
const ALIGN_V_CENTER = 0x80;
const NEAR = 0;
const CENTER = 1;
const FAR = 2;

// The children an arrangement places: all but those that hide themselves,
// and a Repeater, which is there only to make the others.
const laidOut = (child) => shown(child) && !child.$repeat;

// Whether a child was given a `Layout`: written in its file, or asked for
// since.
function hasLayout(child) {
  if (child.$attached?.Layout) return true;
  return Boolean(child.$props?.$attach?.some((type) => type.attached === Layout.attached));
}

// One with no width or height is left out, as a positioner leaves it,
// unless it asks the arrangement for a size.
const skipped = (child) => !hasLayout(child) && (child.width === 0 || child.height === 0);

// What a `Layout.name` was given by the author, else what the item a
// LayoutItemProxy stands for was. A value only the type works out (a
// layout's own minimum) is not one.
function told(info, name) {
  const value = given(info, name);
  if (value !== undefined) return value;
  const target = info.$item.$proxied?.();
  return target?.$attached?.Layout ? given(target.$attached.Layout, name) : undefined;
}

function size(info, name) {
  const value = told(info, name);
  return value !== undefined && Number(value) >= 0 ? Number(value) : undefined;
}

function cellIndex(info, name) {
  const value = size(info, name);
  return value === undefined ? undefined : Math.trunc(Math.min(value, MAX_CELLS));
}

const span = (value) => Math.trunc(Math.min(Math.max(Number(value) || 0, 1), MAX_CELLS));

// Everything a child said through `Layout`; nothing for one that said
// nothing, without making it a `Layout` it was never given.
function attached(child) {
  if (!hasLayout(child)) {
    return {
      fill: [undefined, undefined],
      pref: [undefined, undefined],
      min: [undefined, undefined],
      max: [undefined, undefined],
      stretch: [-1, -1],
      align: 0,
      row: undefined,
      column: undefined,
      rowSpan: 1,
      columnSpan: 1,
      margins: [0, 0, 0, 0],
    };
  }
  const info = Layout.attached(child);
  const flag = (name) => {
    const value = told(info, name);
    return value === undefined ? undefined : Boolean(value);
  };
  const axes = (names, read) => [read(info, names[H]), read(info, names[V])];
  return {
    fill: [flag(FILL[H]), flag(FILL[V])],
    pref: axes(PREFERRED, size),
    min: axes(MINIMUM, size),
    max: axes(MAXIMUM, size),
    stretch: [info[STRETCH[H]], info[STRETCH[V]]],
    align: info.alignment,
    row: cellIndex(info, "row"),
    column: cellIndex(info, "column"),
    rowSpan: span(info.rowSpan),
    columnSpan: span(info.columnSpan),
    margins: [info.leftMargin, info.topMargin, info.rightMargin, info.bottomMargin],
  };
}

// Whether a child says anything through `Layout` about one axis.
const managed = (a, axis) =>
  a.fill[axis] === true || a.pref[axis] !== undefined || a.min[axis] !== undefined || a.max[axis] !== undefined;

// The size a child's file gives it along an axis, by itself or by its
// anchors; NaN when it follows its implicit size. Read untracked: the size
// the arrangement places goes into the same property, and a measure that
// followed it would be run again by its own placing.
function stated(child, axis) {
  return untrack(() => {
    const value = given(child, SIZE[axis]);
    if (typeof value === "number") return value;
    const anchors = child.anchors;
    const both = axis === H ? anchors?.left && anchors?.right : anchors?.top && anchors?.bottom;
    return anchors?.fill || both ? child[SIZE[axis]] : NaN;
  });
}

// What one child asks for along one axis: the one size rule. `file` is the
// size its file gave it when the arrangement first saw it.
function hint(a, axis, child, file) {
  if (!managed(a, axis)) {
    const current = child[SIZE[axis]];
    return { min: current, pref: current, max: current, stretch: -1 };
  }
  const asked = a.pref[axis] ?? (Number.isNaN(file) ? child[IMPLICIT[axis]] : file);
  const max = a.max[axis] ?? Infinity;
  const min = Math.min(a.min[axis] ?? 0, max);
  const pref = Math.min(Math.max(asked, min), max);
  if (a.fill[axis] === true) return { min, pref, max, stretch: a.stretch[axis] };
  return { min: pref, pref, max: pref, stretch: -1 };
}

// Left, top, right and bottom.
const paddings = (self) => [self.leftPadding, self.topPadding, self.rightPadding, self.bottomPadding];

// The same sizes as before are the same object: what read them is not run
// again.
function sizes(last, [width, height]) {
  const { min, pref, max } = last;
  const same =
    min[0] === width.min &&
    min[1] === height.min &&
    pref[0] === width.pref &&
    pref[1] === height.pref &&
    max[0] === width.max &&
    max[1] === height.max;
  return same
    ? last
    : { min: [width.min, height.min], pref: [width.pref, height.pref], max: [width.max, height.max] };
}

const runsRightToLeft = (self) => (self.layoutDirection === RightToLeft) !== mirrored(self);

// At the start unless the child says otherwise, as in a positioner; a row
// right to left starts at the right.
function alignOf(flags, axis, rtl) {
  const [far, center] = axis === H ? [ALIGN_RIGHT, ALIGN_H_CENTER] : [ALIGN_BOTTOM, ALIGN_V_CENTER];
  const align = flags & far ? FAR : flags & center ? CENTER : NEAR;
  if (rtl && axis === H && align !== CENTER) return align === NEAR ? FAR : NEAR;
  return align;
}

// A child in `start..end` with margins: its position and size.
function fit(start, end, before, after, h, align) {
  const room = Math.max(end - start - before - after, 0);
  const length = Math.max(Math.min(room, h.max), h.min);
  const free = room - length;
  if (free <= 0 || align === NEAR) return [start + before, length];
  if (align === CENTER) return [roundHalfUp(start + before + free / 2), length];
  return [roundHalfUp(end - after - length), length];
}

// Where each track starts and ends in `content` along an axis.
function lines(t, spacing, content) {
  const used = t.filter((k) => k.used);
  const most = used.reduce((all, k) => all + k.max, 0) + spacing * Math.max(used.length - 1, 0);
  // Room nobody can take is left at the end, not shared out.
  const sized = distribute(t, spacing, Math.min(content, most));
  // Room shared out is shared in whole pixels; a line of children that
  // keep their sizes is placed as they ask.
  if (t.some((k, i) => k.used && sized[i] !== k.pref)) return edges(t, sized, spacing);
  let at = 0;
  return t.map((k, i) => {
    const line = [at, at + sized[i]];
    if (k.used) at += sized[i] + spacing;
    return line;
  });
}

// A row, column or box with no child that has a `Layout`: each keeps its
// size, and they are packed along the main axis as a positioner packs
// them.
function measureLine(self, items, vertical, last) {
  const main = vertical ? V : H;
  const cross = 1 - main;
  const pad = paddings(self);
  const spacing = self.spacing;
  let along = 0;
  let widest = 0;
  const extents = items.map((child, index) => {
    if (index > 0) along += spacing;
    const extent = [child.width, child.height];
    along += extent[main];
    widest = Math.max(widest, extent[cross]);
    return extent;
  });
  const content = [0, 0];
  content[main] = along;
  content[cross] = widest;
  const fixed = (axis) => {
    const value = content[axis] + pad[axis] + pad[axis + 2];
    return { min: value, pref: value, max: value };
  };
  return {
    line: true,
    items,
    extents,
    vertical,
    pad,
    spacing,
    rtl: !vertical && runsRightToLeft(self),
    sizes: sizes(last.sizes, [fixed(H), fixed(V)]),
  };
}

// The sizes each child's file gave it when the arrangement first saw it,
// kept while it stays a child, as ljos-ui keeps them: once the arrangement
// has placed a size, the property holds that, and a binding that gives
// another later is not asked for until the child comes back.
const seenOf = (self) => (self.$seen ??= new Map());

// Forgets the children that have left, at every measure, line or plan: one
// that left while the others were packed as a line comes back asking for
// the size its file gives it then, as in ljos-ui.
function forgetLeft(self) {
  const seen = seenOf(self);
  if (!seen.size) return;
  const children = new Set(self.children);
  for (const child of seen.keys()) if (!children.has(child)) seen.delete(child);
}

function firstSeen(self, items) {
  const seen = seenOf(self);
  return items.map((child) => {
    let first = seen.get(child);
    if (!first) seen.set(child, (first = [stated(child, H), stated(child, V)]));
    return first;
  });
}

// The cells, tracks and hints of every child.
function measurePlan(self, items, grid, vertical, last) {
  const cells = [];
  const wants = [];
  const first = firstSeen(self, items);
  for (const [index, child] of items.entries()) {
    const a = attached(child);
    const file = first[index];
    cells.push({
      item: child,
      hint: [hint(a, H, child, file[H]), hint(a, V, child, file[V])],
      managed: [managed(a, H), managed(a, V)],
      margins: a.margins,
      align: a.align,
      slot: { row: 0, column: 0, rowSpan: 1, columnSpan: 1 },
    });
    wants.push({ row: a.row, column: a.column, rowSpan: a.rowSpan, columnSpan: a.columnSpan });
  }
  let spacing;
  if (grid) {
    spacing = [self.columnSpacing, self.rowSpacing];
    const slots = place(wants, ...gridLimits(self, wants.length));
    cells.forEach((cell, index) => {
      cell.slot = slots[index];
    });
  } else {
    spacing = vertical ? [0, self.spacing] : [self.spacing, 0];
    cells.forEach((cell, index) => {
      if (vertical) cell.slot.row = index;
      else cell.slot.column = index;
    });
  }
  const axis = (axis) => {
    const spans = cells.map((cell) => {
      const extra = cell.margins[axis] + cell.margins[axis + 2];
      const h = cell.hint[axis];
      const [start, len] = axis === H ? [cell.slot.column, cell.slot.columnSpan] : [cell.slot.row, cell.slot.rowSpan];
      return { start, len, min: h.min + extra, pref: h.pref + extra, max: h.max + extra, stretch: h.stretch };
    });
    const count = spans.reduce((most, s) => Math.max(most, s.start + s.len), 0);
    return tracks(count, spans, spacing[axis]);
  };
  const t = [axis(H), axis(V)];
  const pad = paddings(self);
  const padded = (axis) => {
    const extra = pad[axis] + pad[axis + 2];
    const { min, pref, max } = total(t[axis], spacing[axis]);
    return { min: min + extra, pref: pref + extra, max: max + extra };
  };
  return {
    line: false,
    grid,
    cells,
    tracks: t,
    spacing,
    vertical,
    pad,
    rtl: (grid || !vertical) && runsRightToLeft(self),
    sizes: sizes(last.sizes, [padded(H), padded(V)]),
  };
}

// How many rows and columns a grid of `count` children has, as far as it
// limits them, and whether it fills columns first. A count it is given
// bounds its line; given the other one only, it is what the children need
// in that many lines.
function gridLimits(self, count) {
  const limit = (value) => (Math.trunc(value) > 0 ? Math.trunc(value) : undefined);
  const topToBottom = self.flow === TopToBottom;
  let rows = limit(self.rows);
  let columns = limit(self.columns);
  if (rows !== undefined && columns === undefined && !topToBottom) columns = Math.max(Math.ceil(count / rows), 1);
  else if (columns !== undefined && rows === undefined && topToBottom) rows = Math.max(Math.ceil(count / columns), 1);
  return [rows, columns, topToBottom];
}

// The geometry of every child of a line `width` wide: positions only.
function arrangeLine(measured, width) {
  const { items, extents, vertical, pad, spacing, rtl } = measured;
  const main = vertical ? V : H;
  const cross = 1 - main;
  const room = Math.max(width - pad[0] - pad[2], 0);
  let at = 0;
  return items.map((item, index) => {
    const extent = extents[index];
    const position = [0, 0];
    position[main] = (rtl ? room - at - extent[main] : at) + pad[main];
    position[cross] = pad[cross];
    at += extent[main] + spacing;
    return { item, geometry: position, managed: [false, false] };
  });
}

// The geometry of every child of a plan `width` by `height`.
function arrangePlan(measured, width, height) {
  const { cells, tracks: t, spacing, pad, rtl, grid, vertical } = measured;
  const extent = [width, height];
  const content = (axis) => Math.max(extent[axis] - pad[axis] - pad[axis + 2], 0);
  const placed = (cell, axis, start, end) => {
    let [from, to] = [start, end];
    const backwards = rtl && axis === H;
    if (backwards) [from, to] = [content(H) - end, content(H) - start];
    return fit(
      from,
      to,
      cell.margins[axis],
      cell.margins[axis + 2],
      cell.hint[axis],
      alignOf(cell.align, axis, backwards),
    );
  };
  if (grid) {
    const all = [H, V].map((axis) => lines(t[axis], spacing[axis], content(axis)));
    // From the first to the last track the child covers that has a size:
    // the others under a span take no room.
    const cover = (axis, start, len) => {
      const used = [];
      for (let i = start; i < start + len; i++) if (t[axis][i]?.used && all[axis][i]) used.push(all[axis][i]);
      const first = used[0] ?? [0, 0];
      const last = used.at(-1) ?? first;
      return [first[0], last[1]];
    };
    return cells.map((cell) => {
      const geometry = [0, 0, 0, 0];
      for (const axis of [H, V]) {
        const [start, len] = axis === H ? [cell.slot.column, cell.slot.columnSpan] : [cell.slot.row, cell.slot.rowSpan];
        const [at, length] = placed(cell, axis, ...cover(axis, start, len));
        geometry[axis] = pad[axis] + at;
        geometry[2 + axis] = length;
      }
      return { item: cell.item, geometry, managed: cell.managed };
    });
  }
  const main = vertical ? V : H;
  const cross = 1 - main;
  const along = lines(t[main], spacing[main], content(main));
  return cells.map((cell) => {
    const index = main === H ? cell.slot.column : cell.slot.row;
    const geometry = [0, 0, 0, 0];
    const [atMain, lengthMain] = placed(cell, main, ...along[index]);
    const [atCross, lengthCross] = placed(cell, cross, 0, content(cross));
    geometry[main] = pad[main] + atMain;
    geometry[cross] = pad[cross] + atCross;
    geometry[2 + main] = lengthMain;
    geometry[2 + cross] = lengthCross;
    return { item: cell.item, geometry, managed: cell.managed };
  });
}

const side = derived((self) => self.padding);
const PADDING = {
  padding: 0,
  leftPadding: side,
  rightPadding: side,
  topPadding: side,
  bottomPadding: side,
};

// What `Row`, `Column`, `Box` and `Grid` have alike: `vertical` says
// whether a line runs down, `grid` whether children sit in cells.
function arrangement(name, spec) {
  return defineType(name, Layout, {
    properties: { spacing: 0, ...PADDING, layoutDirection: 0, ...spec.properties },
    enums: spec.enums,
    methods: {
      $measure(last) {
        forgetLeft(this);
        const items = this.children.filter((child) => laidOut(child) && !skipped(child));
        const grid = spec.grid === true;
        const vertical = grid ? false : spec.vertical(this);
        if (!grid && !items.some(hasLayout)) return measureLine(this, items, vertical, last);
        return measurePlan(this, items, grid, vertical, last);
      },
      $arrange(measured) {
        const width = this.width;
        const height = this.height;
        // An arrangement with no size leaves its children where they are.
        if (!(width >= 0 && height >= 0) || !measured.sizes || measured.line === undefined) return null;
        return measured.line ? arrangeLine(measured, width) : arrangePlan(measured, width, height);
      },
      $place(arranged) {
        if (!arranged) return;
        // A size goes only where the arrangement manages it. One it placed
        // stays when the axis stops being managed or the child leaves, as
        // in ljos-ui, whose arrangement writes every child's whole geometry.
        for (const { item, geometry, managed: own } of arranged) {
          slot(item, "x").place(geometry[0]);
          slot(item, "y").place(geometry[1]);
          for (const axis of [H, V]) if (own[axis]) slot(item, SIZE[axis]).place(geometry[2 + axis]);
        }
      },
    },
  });
}

// Children side by side, and one under another.
export const Row = arrangement("Row", { vertical: () => false });
export const Column = arrangement("Column", { vertical: () => true });

// A row or a column, as `direction` says; it can turn.
export const Box = arrangement("Box", {
  properties: { direction: 0 },
  enums: { Row: 0, Column: 1 },
  vertical: (self) => self.direction === 1,
});

// Children in cells, along the flow. A count of columns (or rows) bounds a
// line; with neither, the children are one line along the flow. Between
// two columns (and rows) is `spacing` until a spacing of its own is given.
const gap = derived((self) => self.spacing);
export const Grid = arrangement("Grid", {
  grid: true,
  properties: { columns: 0, rows: 0, columnSpacing: gap, rowSpacing: gap, flow: 0 },
  enums: { LeftToRight: 0, TopToBottom: 1 },
});

// One child at a time, as big as where it is.
export const Pages = defineType("Pages", StackLayout, {});

export { Flow, Layout };

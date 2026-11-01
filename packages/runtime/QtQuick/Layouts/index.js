// `import QtQuick.Layouts`.
//
// A layout says where its children are and how big, in two steps, as Qt
// does. What the children ask for, through `Layout` and their implicit
// sizes, gives the layout the least, the preferred and the most it can be:
// one computation over the children, run again when one of them changes,
// which is also where the layout's implicit size comes from. Then a single
// effect shares the size the layout has among them and gives each its place.
// The first step reads no size the second one set, so a layout that is only
// resized only shares again.
import { onCleanup } from "solid-js";
import { defineType, derived, effect, looped, QtObject, slot } from "../../object.js";
import { Item } from "../Item.js";
import { mirrored } from "../LayoutMirroring.js";
import { given, Settling, shown } from "../placing.js";
import { arrange, FLT_MAX, itemBox, measure } from "./engine.js";
import { untrack } from "#kernel";

const next = (version) => version + 1;

const RightToLeft = 1;
const TopToBottom = 1;
const AlignBaseline = 0x100;

const MINIMUM = ["minimumWidth", "minimumHeight"];
const PREFERRED = ["preferredWidth", "preferredHeight"];
const MAXIMUM = ["maximumWidth", "maximumHeight"];
const FILL = ["fillWidth", "fillHeight"];
const IMPLICIT = ["implicitWidth", "implicitHeight"];
const SIZE = ["width", "height"];

const SIZES = Object.freeze({ min: [0, 0], pref: [0, 0], max: [FLT_MAX, FLT_MAX] });
const NOTHING = Object.freeze({ sizes: SIZES });

const isLayout = (item) => Boolean(item.$measured);

// The same sizes as before are the same object: what read them is not run
// again.
function sizes(last, minWidth, minHeight, prefWidth, prefHeight, maxWidth, maxHeight) {
  const { min, pref, max } = last;
  const same =
    min[0] === minWidth &&
    min[1] === minHeight &&
    pref[0] === prefWidth &&
    pref[1] === prefHeight &&
    max[0] === maxWidth &&
    max[1] === maxHeight;
  return same ? last : { min: [minWidth, minHeight], pref: [prefWidth, prefHeight], max: [maxWidth, maxHeight] };
}

// The least, the preferred and the most a layout can be. A child that asks
// while they are being worked out gets the last ones (see Settling).
function hints(self) {
  const measured = self.$measured;
  if (measured.early()) return measured.last.sizes;
  self.$sizes ??= looped(self.$owner, () => measured.read().sizes);
  return self.$sizes();
}

// What an item's `Layout.name` was given. A LayoutItemProxy that says
// nothing says what its target does.
function stated(info, name) {
  const value = given(info, name);
  if (value !== undefined) return value;
  const target = info.$item.$proxied?.();
  return target ? Layout.attached(target)[name] : undefined;
}

// The same for a size or a stretch factor, which count from 0 up: -1 is how
// QML says "not set".
function extent(info, name) {
  const value = given(info, name);
  if (value >= 0) return value;
  const target = info.$item.$proxied?.();
  const theirs = target ? Layout.attached(target)[name] : -1;
  return theirs >= 0 ? theirs : undefined;
}

const minimum = (name, axis) => (self) =>
  extent(self, name) ?? (isLayout(self.$item) ? hints(self.$item).min[axis] : 0);
const maximum = (name, axis) => (self) =>
  extent(self, name) ?? (isLayout(self.$item) ? hints(self.$item).max[axis] : Infinity);
const counted = (name) => (self) => extent(self, name) ?? -1;
// A layout in a layout fills it unless it says otherwise.
const fills = (name) => (self) => {
  const fill = stated(self, name);
  return fill === undefined ? isLayout(self.$item) : Boolean(fill);
};
const margin = (name) => (self) => stated(self, name) ?? self.margins;
const cellIndex = (self, own) => Math.max(own() ?? 0, 0);

// `Layout.fillWidth` and the rest: what an item asks of the layout it is in.
// For a layout, the sizes it does not set are those of its contents.
const LayoutAttached = defineType("LayoutAttached", QtObject, {
  properties: {
    minimumWidth: 0,
    minimumHeight: 0,
    preferredWidth: -1,
    preferredHeight: -1,
    maximumWidth: Infinity,
    maximumHeight: Infinity,
    fillWidth: false,
    fillHeight: false,
    alignment: 0,
    horizontalStretchFactor: -1,
    verticalStretchFactor: -1,
    margins: 0,
    leftMargin: 0,
    topMargin: 0,
    rightMargin: 0,
    bottomMargin: 0,
    row: 0,
    column: 0,
    rowSpan: 1,
    columnSpan: 1,
  },
  resolve: {
    minimumWidth: minimum("minimumWidth", 0),
    minimumHeight: minimum("minimumHeight", 1),
    preferredWidth: counted("preferredWidth"),
    preferredHeight: counted("preferredHeight"),
    maximumWidth: maximum("maximumWidth", 0),
    maximumHeight: maximum("maximumHeight", 1),
    fillWidth: fills("fillWidth"),
    fillHeight: fills("fillHeight"),
    alignment: (self) => stated(self, "alignment") ?? 0,
    horizontalStretchFactor: counted("horizontalStretchFactor"),
    verticalStretchFactor: counted("verticalStretchFactor"),
    margins: (self) => stated(self, "margins") ?? 0,
    leftMargin: margin("leftMargin"),
    topMargin: margin("topMargin"),
    rightMargin: margin("rightMargin"),
    bottomMargin: margin("bottomMargin"),
    row: cellIndex,
    column: cellIndex,
  },
  setup(self, props) {
    self.$item = props.$attachee;
  },
});

// The width an item had when a layout first needed it, kept from then on:
// the layout is about to change that width, and what the item prefers must
// not follow it.
function fallback(item, info, axis) {
  const kept = (info.$fallback ??= [-1, -1]);
  if (kept[axis] < 0) {
    const size = untrack(() => given(item, SIZE[axis]));
    kept[axis] = typeof size === "number" ? size : 0;
  }
  return kept[axis];
}

// The least, the preferred and the most an item can be in a layout, margins
// included: Qt's `effectiveSizeHints_helper`, step for step. The preferred
// size is `Layout.preferredWidth`, else the implicit width, else the width.
function sizeHints(item, info, baseline) {
  const layout = isLayout(item) ? hints(item) : null;
  const min = [0, 0];
  const pref = [0, 0];
  const max = [0, 0];
  for (let axis = 0; axis < 2; axis++) {
    let least = extent(info, MINIMUM[axis]) ?? -1;
    let wanted = extent(info, PREFERRED[axis]) ?? -1;
    let most = extent(info, MAXIMUM[axis]) ?? -1;
    // What was said is put in order.
    if (least >= 0 && most >= 0 && least > most) least = most;
    if (wanted >= 0) {
      if (least >= 0 && wanted < least) wanted = least;
      else if (most >= 0 && wanted > most) wanted = most;
    }
    // What was not said is the layout's own, or no limit: and that never
    // takes from a size that was said.
    if (most < 0) most = layout ? layout.max[axis] : Infinity;
    if (wanted > most) most = wanted;
    if (least > most) most = least;
    if (least < 0) least = layout ? layout.min[axis] : 0;
    if (wanted >= 0 && wanted < least) least = wanted;
    if (most < least) least = most;
    if (wanted < 0) {
      const implicit = item[IMPLICIT[axis]];
      wanted = implicit > 0 ? Math.ceil(implicit) : fallback(item, info, axis);
    }
    min[axis] = least;
    pref[axis] = Math.min(Math.max(wanted, least), most);
    max[axis] = most;
  }
  const margins = [info.leftMargin, info.topMargin, info.rightMargin, info.bottomMargin];
  const across = margins[0] + margins[2];
  const down = margins[1] + margins[3];
  // How far the baseline is from the bottom of the least the item can be.
  const descent = baseline ? min[1] - item.baselineOffset + down : -1;
  min[0] += across;
  pref[0] += across;
  max[0] += across;
  min[1] += down;
  pref[1] += down;
  max[1] += down;
  return { min, pref, max, descent, margins };
}

// What stretches when there is room: by its factor, or as any item that
// fills does, or not at all.
const stretch = (factor, fill) => (factor >= 0 ? factor : fill ? -1 : 0);

// An item in the cells of a grid, as the engine wants it.
function cell(item, info, column, row, columnSpan, rowSpan) {
  const alignment = info.alignment;
  const fillWidth = info.fillWidth;
  const fillHeight = info.fillHeight;
  const size = sizeHints(item, info, Boolean(alignment & AlignBaseline));
  return {
    item,
    first: [column, row],
    span: [columnSpan, rowSpan],
    alignment,
    box: [itemBox(size, 0, fillWidth, alignment), itemBox(size, 1, fillHeight, alignment)],
    stretch: [stretch(info.horizontalStretchFactor, fillWidth), stretch(info.verticalStretchFactor, fillHeight)],
    // One that does not fill is never more than it prefers.
    limit: [fillWidth ? size.max[0] : size.pref[0], fillHeight ? size.max[1] : size.pref[1]],
    margins: size.margins,
  };
}

// What every layout is: an item whose implicit size is what its children
// need, with `$measure(last)` for what they need (its `sizes` the layout's
// own), `$arrange(measured)` for where they go in the size the layout has,
// and `$place(arranged)` to put them there.
export const Layout = defineType("Layout", Item, {
  properties: { implicitWidth: 0, implicitHeight: 0 },
  resolve: {
    implicitWidth: (self) => hints(self).pref[0],
    implicitHeight: (self) => hints(self).pref[1],
  },
  attached: LayoutAttached,
  setup(self) {
    self.$measured = new Settling(
      self,
      (self, last) => self.$measure(last),
      NOTHING,
      (measured) => measured.sizes,
    );
    effect(
      () => self.$arrange(self.$measured.read()),
      (arranged) => {
        self.$place(arranged);
        self.$measured.settle();
      },
    );
  },
});

// RowLayout, ColumnLayout and GridLayout: items in the cells of a grid.
const GridLayoutBase = defineType("GridLayoutBase", Layout, {
  properties: { layoutDirection: 0 },
  methods: {
    $measure(last) {
      const measured = measure(this.$cells(), this.$spacing(), this.$uniform());
      const [across, down] = measured.total;
      measured.sizes = sizes(last.sizes, across.min, down.min, across.pref, down.pref, across.max, down.max);
      return measured;
    },
    $arrange(measured) {
      const width = this.width;
      const height = this.height;
      // A layout with no size leaves its children where they are.
      if (!(width >= 0 && height >= 0)) return null;
      // A mirrored layout runs the other way from the one it was asked for.
      const arranged = arrange(measured, width, height, mirrored(this) !== (this.layoutDirection === RightToLeft));
      // Which of the items are the size they are to be, as this is worked
      // out: by the time they are placed they may be another.
      arranged.fits = untrack(() =>
        arranged.cells.map(({ item }, index) => item.width === arranged.width[index] && item.height === arranged.height[index]),
      );
      return arranged;
    },
    $place(arranged) {
      if (!arranged) return;
      const { cells, x, y, width, height, fits } = arranged;
      for (let index = 0; index < cells.length; index++) {
        const item = cells[index].item;
        slot(item, "x").place(x[index]);
        slot(item, "y").place(y[index]);
        // An item that is the size it is to be is not given one, as in Qt:
        // it goes on taking its size from what it holds, as a Loader does
        // from its item.
        const wide = slot(item, "width");
        const tall = slot(item, "height");
        if (fits[index] && wide.placed === undefined && tall.placed === undefined) continue;
        wide.place(width[index]);
        tall.place(height[index]);
      }
    },
  },
});

const linear = {
  properties: { spacing: 5, uniformCellSizes: false },
  spacing() {
    const spacing = this.spacing;
    return [spacing, spacing];
  },
  uniform() {
    const uniform = this.uniformCellSizes;
    return [uniform, uniform];
  },
};

// The children a layout places: all but those that hide themselves, and a
// Repeater, which is there only to make the others. (An item with no size
// has its cell all the same.)
const laidOut = (child) => shown(child) && !child.$repeat;

function line(self, down) {
  const cells = [];
  for (const child of self.children) {
    if (!laidOut(child)) continue;
    const index = cells.length;
    cells.push(cell(child, Layout.attached(child), down ? 0 : index, down ? index : 0, 1, 1));
  }
  return cells;
}

export const RowLayout = defineType("RowLayout", GridLayoutBase, {
  properties: linear.properties,
  methods: {
    $spacing: linear.spacing,
    $uniform: linear.uniform,
    $cells() {
      return line(this, false);
    },
  },
});

export const ColumnLayout = defineType("ColumnLayout", GridLayoutBase, {
  properties: linear.properties,
  methods: {
    $spacing: linear.spacing,
    $uniform: linear.uniform,
    $cells() {
      return line(this, true);
    },
  },
});

export const GridLayout = defineType("GridLayout", GridLayoutBase, {
  properties: {
    columns: -1,
    rows: -1,
    flow: 0,
    rowSpacing: 5,
    columnSpacing: 5,
    uniformCellWidths: false,
    uniformCellHeights: false,
  },
  enums: { LeftToRight: 0, TopToBottom: 1 },
  methods: {
    $spacing() {
      return [this.columnSpacing, this.rowSpacing];
    },
    $uniform() {
      return [this.uniformCellWidths, this.uniformCellHeights];
    },
    // Qt's `insertLayoutItems`: an item goes where `Layout.row` and
    // `Layout.column` say, else in the next cells that are free, along the
    // flow and wrapping at `columns` (or at `rows`, flowing downwards).
    $cells() {
      const cells = [];
      const taken = new Set();
      const flow = this.flow === TopToBottom ? 1 : 0;
      const columns = this.columns;
      let bound = flow ? this.rows : columns;
      if (bound < 0) bound = Infinity;
      // The next cell: its column, then its row.
      const at = [0, 0];
      for (const child of this.children) {
        if (!laidOut(child)) continue;
        const info = Layout.attached(child);
        let row = -1;
        let column = -1;
        // One of the two is enough: the other is then 0.
        if (given(info, "row") >= 0 || given(info, "column") >= 0) {
          row = info.row;
          if (columns < 0 || info.column < columns) column = info.column;
        }
        const span = [info.columnSpan, info.rowSpan];
        // Qt gives up on the rest of the items here too.
        if (!(span[0] >= 1 && span[1] >= 1) || span[flow] > bound) break;
        if (row >= 0) at[1] = row;
        if (column >= 0) at[0] = column;
        if (row < 0 || column < 0) {
          for (;;) {
            let free = at[flow] + span[flow] <= bound;
            for (let down = 0; free && down < span[1]; down++) {
              for (let across = 0; free && across < span[0]; across++) {
                if (taken.has((at[1] + down) * 0x10000 + at[0] + across)) free = false;
              }
            }
            if (free) break;
            // `>=`, where Qt has `==` and never comes back from a cell
            // past the bound.
            if (++at[flow] >= bound) {
              at[flow] = 0;
              at[1 - flow]++;
            }
          }
        }
        for (let down = 0; down < span[1]; down++) {
          for (let across = 0; across < span[0]; across++) taken.add((at[1] + down) * 0x10000 + at[0] + across);
        }
        cells.push(cell(child, info, at[0], at[1], span[0], span[1]));
      }
      return cells;
    },
  },
});

// The StackLayout an item is in, if it is in one.
function stack(self) {
  const parent = self.$item.parent;
  return parent?.$stack ? parent : null;
}

// `StackLayout.index`, `StackLayout.isCurrentItem`, `StackLayout.layout`.
const StackLayoutAttached = defineType("StackLayoutAttached", QtObject, {
  properties: { index: -1, isCurrentItem: false, layout: null },
  resolve: {
    index: (self) => stack(self)?.children.indexOf(self.$item) ?? -1,
    isCurrentItem(self) {
      const layout = stack(self);
      return layout ? layout.children.indexOf(self.$item) === layout.currentIndex : false;
    },
    layout: stack,
  },
  setup(self, props) {
    self.$item = props.$attachee;
  },
});

// One child at a time, as big as the layout: the others are hidden, and the
// layout is as big as the biggest of them needs.
export const StackLayout = defineType("StackLayout", Layout, {
  properties: {
    count: 0,
    currentIndex: derived((self) => (self.count > 0 ? 0 : -1)),
  },
  resolve: { count: (self) => self.children.length },
  attached: StackLayoutAttached,
  methods: {
    itemAt(index) {
      return this.children[index] ?? null;
    },
    $measure(last) {
      const items = this.children;
      const all = new Array(items.length);
      const least = [0, 0];
      const wanted = [0, 0];
      for (let index = 0; index < items.length; index++) {
        const info = Layout.attached(items[index]);
        const size = sizeHints(items[index], info, false);
        for (let axis = 0; axis < 2; axis++) {
          // One that says it does not fill is its preferred size and no other.
          const fill = stated(info, FILL[axis]);
          if (fill !== undefined && !fill) size.min[axis] = size.max[axis] = size.pref[axis];
          least[axis] = Math.max(least[axis], size.min[axis]);
          wanted[axis] = Math.max(wanted[axis], size.pref[axis]);
        }
        all[index] = size;
      }
      return {
        items,
        hints: all,
        // It can be bigger than any of its items.
        sizes: sizes(last.sizes, least[0], least[1], wanted[0], wanted[1], Infinity, Infinity),
      };
    },
    $arrange(measured) {
      return { measured, current: this.currentIndex, width: this.width, height: this.height };
    },
    $place({ measured, current, width, height }) {
      const { items, hints } = measured;
      for (let index = 0; index < items.length; index++) slot(items[index], "visible").place(index === current);
      const item = items[current];
      if (!item || !(width >= 0 && height >= 0) || (width === 0 && height === 0)) return;
      const { min, max } = hints[current];
      slot(item, "x").place(0);
      slot(item, "y").place(0);
      slot(item, "width").place(Math.min(Math.max(width, min[0]), max[0]));
      slot(item, "height").place(Math.min(Math.max(height, min[1]), max[1]));
    },
  },
  setup(self) {
    self.$stack = true;
  },
});

// Puts an item in another item, or in none: out of the one it was in first.
function move(item, parent) {
  const old = untrack(() => item.parent);
  if (old === parent) return;
  if (old?.$static.includes(item)) {
    old.$static = old.$static.filter((child) => child !== item);
    old.$touch(next);
  } else {
    old?.$remove(item);
  }
  slot(item, "parent").place(parent);
  parent?.$add(item);
}

// A proxy that has its target has it inside itself, as big as itself.
function fit(proxy, target) {
  slot(target, "x").place(0);
  slot(target, "y").place(0);
  slot(target, "width").place(proxy.$width);
  slot(target, "height").place(proxy.$height);
}

function take(proxy, target) {
  target.$proxies.controller = proxy;
  slot(target, "visible").place(true);
  move(target, proxy);
  fit(proxy, target);
}

// The target is hidden, and the first of its other proxies that is shown
// has it next.
function drop(proxy, target) {
  const proxies = target.$proxies;
  if (untrack(() => target.parent) === proxy) move(target, null);
  slot(target, "visible").place(false);
  proxies.controller = null;
  const heir = proxies.all.find((other) => other !== proxy && other.$shows);
  if (heir) take(heir, target);
}

// Whether what a proxy was given as its implicit size is what it has once
// everything is made. Qt works a program's bindings out one after another:
// those of what is declared later first, an object's own in the order they
// are written. Only a binding written after `target` is worked out after the
// proxy has its target, and it stays what the proxy has if the target's own
// size is not written again after it: by a binding of an item declared
// before the proxy, or by the item itself, as a Text is as big as its text
// once it is complete.
function ahead(self, target, name) {
  const props = self.$props;
  if (!Object.getOwnPropertyDescriptor(props, name)?.get) return false;
  const keys = Object.keys(props);
  if (keys.indexOf(name) < keys.indexOf("target")) return false;
  const theirs = slot(target, name);
  if (!theirs.explicit()) return false;
  return !theirs.bound || self.$early;
}

// A proxy is implicitly as big as its target. Qt writes the target's size
// over the proxy's own when the proxy is given the target and whenever the
// target's changes, and a binding of the proxy's own writes over that
// whenever it comes to something else: the proxy has what was written last.
const implied = (name) => (self, own) => {
  const target = self.target;
  const theirs = target?.[name] ?? 0;
  if (!target || !slot(self, name).explicit()) return target ? theirs : own();
  const mine = own();
  const seen = (self.$implied[name] ??= { target, theirs, mine, own: ahead(self, target, name) });
  if (seen.target !== target || seen.theirs !== theirs) seen.own = false;
  else if (seen.mine !== mine) seen.own = true;
  Object.assign(seen, { target, theirs, mine });
  return seen.own ? mine : theirs;
};

// Stands in a layout for an item that is declared elsewhere, so that
// several layouts can place the same item: the one that is shown has it.
export const LayoutItemProxy = defineType("LayoutItemProxy", Item, {
  properties: { target: null, implicitWidth: 0, implicitHeight: 0 },
  resolve: { implicitWidth: implied("implicitWidth"), implicitHeight: implied("implicitHeight") },
  methods: {
    // The target, when this is the proxy that has it.
    effectiveTarget() {
      const target = untrack(() => this.target);
      return target?.$proxies?.controller === this ? target : null;
    },
    $proxied() {
      return this.target ?? null;
    },
  },
  setup(self, props) {
    self.$implied = {};
    // Whether it is declared before the item it stands for.
    const told = Object.getOwnPropertyDescriptor(props, "target");
    self.$early = Boolean(told && !told.get && told.value && !told.value.$type);
    let current = null;
    const leave = () => {
      const proxies = current.$proxies;
      if (proxies.controller === self) drop(self, current);
      proxies.all.splice(proxies.all.indexOf(self), 1);
    };
    effect(
      () => [self.target ?? null, self.visible, self.width, self.height],
      ([target, visible, width, height]) => {
        self.$shows = visible;
        self.$width = width;
        self.$height = height;
        if (target !== current) {
          if (current) leave();
          current = target;
          if (target) {
            const proxies = (target.$proxies ??= { controller: null, all: [] });
            proxies.all.push(self);
            // An item with proxies is shown by one of them or not at all.
            if (!proxies.controller) slot(target, "visible").place(false);
          }
        }
        if (!target) return;
        const controller = target.$proxies.controller;
        if (visible && !controller) take(self, target);
        else if (controller !== self) return;
        else if (visible) fit(self, target);
        else drop(self, target);
      },
    );
    onCleanup(() => {
      self.$shows = false;
      if (current) leave();
    });
  },
});

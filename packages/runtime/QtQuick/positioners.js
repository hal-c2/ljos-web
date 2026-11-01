// Row, Column, Grid and Flow: items put one after another.
//
// A positioner says where its children are, never how big, and is itself as
// big as what it placed. Both come from one computation over the children's
// sizes, Qt's `doPositioning`, which is run again when one of them changes:
// its result is the positioner's implicit size, and a single effect gives
// the children their places.
import { defineType, derived, effect, flush, QtObject, slot } from "../object.js";
import { Item } from "./Item.js";
import { mirrored } from "./LayoutMirroring.js";
import { alike, cull, given, Settling, shown, sized } from "./placing.js";
import { untrack } from "#kernel";

const LeftToRight = 0;
const RightToLeft = 1;
const TopToBottom = 1;
const AlignLeft = 1;
const AlignRight = 2;
const AlignHCenter = 4;
const AlignBottom = 0x40;
const AlignVCenter = 0x80;

const NOTHING = Object.freeze({ items: [], skipped: [], x: [], y: [], width: 0, height: 0 });

// The children a positioner places, and those it leaves out: the hidden
// ones, and the ones with no width or no height.
function place(self, last) {
  const items = [];
  const skipped = [];
  for (const child of self.children) {
    (shown(child) && child.width && child.height ? items : skipped).push(child);
  }
  const placed = { items, skipped, x: new Array(items.length), y: new Array(items.length), width: 0, height: 0 };
  self.$position(placed);
  const same =
    last.width === placed.width &&
    last.height === placed.height &&
    alike(last.items, items) &&
    alike(last.skipped, skipped) &&
    alike(last.x, placed.x) &&
    alike(last.y, placed.y);
  // The same as before is the same object: nothing that read it runs again.
  return same ? last : placed;
}

// Where a positioner's children go and how big that makes it.
const placement = (self) => self.$placement.read();

// The place of an item among those its positioner placed, or -1.
function order(self) {
  const item = self.$item;
  const parent = item.parent;
  return parent?.$position ? placement(parent).items.indexOf(item) : -1;
}

// `Positioner.index`, `Positioner.isFirstItem`, `Positioner.isLastItem`.
const PositionerAttached = defineType("PositionerAttached", QtObject, {
  properties: { index: -1, isFirstItem: false, isLastItem: false },
  resolve: {
    index: order,
    isFirstItem: (self) => order(self) === 0,
    isLastItem(self) {
      const index = order(self);
      return index >= 0 && index === placement(self.$item.parent).items.length - 1;
    },
  },
  setup(self, props) {
    self.$item = props.$attachee;
  },
});

const side = derived((self) => self.padding);

export const Positioner = defineType("Positioner", Item, {
  properties: {
    spacing: 0,
    padding: 0,
    topPadding: side,
    leftPadding: side,
    rightPadding: side,
    bottomPadding: side,
    implicitWidth: 0,
    implicitHeight: 0,
  },
  resolve: {
    implicitWidth: (self) => placement(self).width,
    implicitHeight: (self) => placement(self).height,
  },
  signals: ["positioningComplete"],
  methods: {
    // Places are settled with everything else that changed, so there is
    // nothing more to force than that.
    forceLayout() {
      flush();
    },
  },
  attached: PositionerAttached,
  setup(self) {
    self.$placement = new Settling(self, place, NOTHING);
    effect(
      () => placement(self),
      ({ items, skipped, x, y }) => {
        for (let index = 0; index < items.length; index++) {
          const item = items[index];
          slot(item, "x").place(x[index]);
          slot(item, "y").place(y[index]);
          cull(item, false);
        }
        for (const item of skipped) cull(item, true);
        self.$placement.settle();
        untrack(() => self.positioningComplete());
      },
    );
  },
});

const direction = {
  properties: { layoutDirection: 0, effectiveLayoutDirection: 0 },
  // A mirrored positioner runs the other way from the one it was asked for.
  resolve: {
    effectiveLayoutDirection: (self) =>
      mirrored(self) === (self.layoutDirection === RightToLeft) ? LeftToRight : RightToLeft,
  },
};

export const Row = defineType("Row", Positioner, {
  ...direction,
  methods: {
    $position(placed) {
      const { items, x, y } = placed;
      const spacing = this.spacing;
      const top = this.topPadding;
      const padding = top + this.bottomPadding;
      const mirrored = this.effectiveLayoutDirection === RightToLeft;
      const start = mirrored ? this.rightPadding : this.leftPadding;
      const end = mirrored ? this.leftPadding : this.rightPadding;
      let offset = start;
      let height = padding;
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        x[index] = offset;
        // Across the row an item stays where it put itself, inside the padding.
        if (top) y[index] = (given(item, "y") ?? 0) + top;
        height = Math.max(height, item.height + padding);
        offset += item.width + spacing;
      }
      if (offset !== start) offset -= spacing;
      placed.width = offset + end;
      placed.height = height;
      if (!mirrored) return;
      // From the right edge of the row when it has a width of its own.
      const edge = sized(this, "width") ? this.width : placed.width;
      for (let index = 0; index < items.length; index++) x[index] = edge - x[index] - items[index].width;
    },
  },
});

export const Column = defineType("Column", Positioner, {
  methods: {
    $position(placed) {
      const { items, x, y } = placed;
      const spacing = this.spacing;
      const top = this.topPadding;
      const left = this.leftPadding;
      const padding = left + this.rightPadding;
      let offset = top;
      let width = padding;
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        if (left) x[index] = (given(item, "x") ?? 0) + left;
        y[index] = offset;
        width = Math.max(width, item.width + padding);
        offset += item.height + spacing;
      }
      if (offset !== top) offset -= spacing;
      placed.width = width;
      placed.height = offset + this.bottomPadding;
    },
  },
});

export const Grid = defineType("Grid", Positioner, {
  properties: {
    ...direction.properties,
    rows: -1,
    columns: -1,
    rowSpacing: -1,
    columnSpacing: -1,
    flow: 0,
    horizontalItemAlignment: 1,
    effectiveHorizontalItemAlignment: 1,
    verticalItemAlignment: 0x20,
  },
  enums: {
    LeftToRight: 0,
    TopToBottom: 1,
    AlignLeft: 1,
    AlignRight: 2,
    AlignHCenter: 4,
    AlignTop: 0x20,
    AlignBottom: 0x40,
    AlignVCenter: 0x80,
  },
  resolve: {
    ...direction.resolve,
    // Left and right change sides with the direction.
    effectiveHorizontalItemAlignment(self) {
      const alignment = self.horizontalItemAlignment;
      if (self.effectiveLayoutDirection !== RightToLeft) return alignment;
      if (alignment === AlignLeft) return AlignRight;
      return alignment === AlignRight ? AlignLeft : alignment;
    },
  },
  methods: {
    $position(placed) {
      const { items, x, y } = placed;
      const count = items.length;
      let columns = this.columns;
      let rows = this.rows;
      if (columns <= 0 && rows <= 0) {
        columns = 4;
        rows = Math.floor((count + 3) / 4);
      } else if (rows <= 0) {
        rows = Math.floor((count + columns - 1) / columns);
      } else if (columns <= 0) {
        columns = Math.floor((count + rows - 1) / rows);
      }
      const left = this.leftPadding;
      const right = this.rightPadding;
      const top = this.topPadding;
      placed.width = left + right;
      placed.height = top + this.bottomPadding;
      if (rows === 0 || columns === 0) return;

      // Each column is as wide as its widest item, each row as high as its
      // highest; what does not fit in rows * columns is left where it is.
      const down = this.flow === TopToBottom;
      const widths = new Array(columns).fill(0);
      const heights = new Array(rows).fill(0);
      const cells = Math.min(count, rows * columns);
      for (let index = 0; index < cells; index++) {
        const item = items[index];
        const row = down ? index % rows : Math.floor(index / columns);
        const column = down ? Math.floor(index / rows) : index % columns;
        widths[column] = Math.max(widths[column], item.width);
        heights[row] = Math.max(heights[row], item.height);
      }
      // The spacing between rows and between columns is `spacing` unless set.
      const spacing = this.spacing;
      const columnSpacing = slot(this, "columnSpacing").explicit() ? this.columnSpacing : spacing;
      const rowSpacing = slot(this, "rowSpacing").explicit() ? this.rowSpacing : spacing;
      for (let column = 0; column < columns; column++) placed.width += widths[column] + (column ? columnSpacing : 0);
      for (let row = 0; row < rows; row++) placed.height += heights[row] + (row ? rowSpacing : 0);

      const mirrored = this.effectiveLayoutDirection === RightToLeft;
      // Qt keeps this edge in an int.
      const edge = Math.trunc(sized(this, "width") ? this.width : placed.width);
      const first = mirrored ? edge - right : left;
      const horizontal = this.horizontalItemAlignment;
      const alignRight = this.effectiveHorizontalItemAlignment === AlignRight;
      const vertical = this.verticalItemAlignment;
      let xoffset = first;
      let yoffset = top;
      let row = 0;
      let column = 0;
      for (let index = 0; index < count; index++) {
        const item = items[index];
        let itemX = xoffset;
        if (alignRight) itemX += widths[column] - item.width;
        else if (horizontal === AlignHCenter) itemX += (widths[column] - item.width) / 2;
        if (mirrored) itemX -= widths[column];
        let itemY = yoffset;
        if (vertical === AlignVCenter) itemY += (heights[row] - item.height) / 2;
        else if (vertical === AlignBottom) itemY += heights[row] - item.height;
        x[index] = itemX;
        y[index] = itemY;
        if (down) {
          yoffset += heights[row] + rowSpacing;
          row = (row + 1) % rows;
          if (row) continue;
          xoffset += (widths[column] + columnSpacing) * (mirrored ? -1 : 1);
          yoffset = top;
          if (++column >= columns) break;
        } else {
          xoffset += (widths[column] + columnSpacing) * (mirrored ? -1 : 1);
          column = (column + 1) % columns;
          if (column) continue;
          yoffset += heights[row] + rowSpacing;
          xoffset = first;
          if (++row >= rows) break;
        }
      }
    },
  },
});

export const Flow = defineType("Flow", Positioner, {
  properties: { ...direction.properties, flow: 0 },
  enums: { LeftToRight: 0, TopToBottom: 1 },
  resolve: direction.resolve,
  methods: {
    $position(placed) {
      const { items, x, y } = placed;
      const spacing = this.spacing;
      const mirrored = this.effectiveLayoutDirection === RightToLeft;
      const start = mirrored ? this.rightPadding : this.leftPadding;
      const end = mirrored ? this.leftPadding : this.rightPadding;
      const top = this.topPadding;
      const bottom = this.bottomPadding;
      const down = this.flow === TopToBottom;
      // It wraps at its own size, when it has one: left alone it is one line.
      const limit = sized(this, down ? "height" : "width") ? (down ? this.height : this.width) : Infinity;
      let hoffset = start;
      let voffset = top;
      let line = 0;
      let width = start + end;
      let height = top + bottom;
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        const itemWidth = item.width;
        const itemHeight = item.height;
        if (down) {
          if (voffset !== top && voffset + itemHeight + bottom > limit) {
            voffset = top;
            hoffset += line + spacing;
            line = 0;
          }
        } else if (hoffset !== start && hoffset + itemWidth + end > limit) {
          hoffset = start;
          voffset += line + spacing;
          line = 0;
        }
        x[index] = hoffset;
        y[index] = voffset;
        width = Math.max(width, hoffset + itemWidth + end);
        height = Math.max(height, voffset + itemHeight + bottom);
        if (down) {
          voffset += itemHeight + spacing;
          line = Math.max(line, itemWidth);
        } else {
          hoffset += itemWidth + spacing;
          line = Math.max(line, itemHeight);
        }
      }
      placed.width = width;
      placed.height = height;
      if (!mirrored) return;
      const edge = sized(this, "width") ? this.width : width;
      for (let index = 0; index < items.length; index++) x[index] = edge - x[index] - items[index].width;
    },
  },
});

// `import Ljos.Layout`: what arranges children, in Ljós's own API
// (ljos-ui's `ljos_quick/src/ljos_layout.rs` and the `Ljos.Layout`
// module of its type table are the specification).
//
// Natively `Row`, `Column`, `Box` and `Grid` are the one arrangement: a
// child keeps its own size along an axis it says nothing about, and asks
// for one with the `Layout` it is given. The runtime's layouts
// (`QtQuick/Layouts`) are that arithmetic already, so an arrangement
// here is a face of the layout that arranges the same way, with the
// arrangement's own defaults — no spacing until it is given, where a
// Qt layout has five — and its `padding`, which a Qt layout has not: the
// cells are measured, arranged and placed inside it by the layouts'
// own engine. `Flow` is `QtQuick`'s positioner as it is, `Layout` the
// layouts' attached type, and `Pages` a face of `StackLayout`: it shows
// one child at a time, and arranges none.
import { defineType, derived, slot } from "../../object.js";
import { mirrored } from "../../QtQuick/LayoutMirroring.js";
import { ColumnLayout, GridLayout, Layout, RowLayout, StackLayout } from "../../QtQuick/Layouts/index.js";
import { arrange } from "../../QtQuick/Layouts/engine.js";
import { Flow } from "../../QtQuick/positioners.js";
import { untrack } from "#kernel";

const RightToLeft = 1;
const side = derived((self) => self.padding);
const PADDING = {
  padding: 0,
  leftPadding: side,
  rightPadding: side,
  topPadding: side,
  bottomPadding: side,
};
const inset = (self) => [self.leftPadding, self.topPadding, self.rightPadding, self.bottomPadding];

// An arrangement over `Base` (a layout of `QtQuick/Layouts`): its
// measure, arrange and place, inside its padding. With no padding —
// what an arrangement has until it is given any — they are the base's
// own, to the pixel.
function arrangement(name, Base, spec = {}) {
  return defineType(name, Base, {
    properties: { spacing: 0, ...PADDING, ...spec.properties },
    enums: spec.enums,
    methods: {
      $measure(last) {
        const measured = Base.proto.$measure.call(this, last);
        const [left, top, right, bottom] = inset(this);
        if (!left && !top && !right && !bottom) return measured;
        const grow = (sizes, axis, by) => (sizes === Infinity || sizes > 1e37 ? sizes : sizes + by);
        const { min, pref, max } = measured.sizes;
        const key = `${min}|${pref}|${max}|${left},${top},${right},${bottom}`;
        if (this.$padded?.key !== key) {
          this.$padded = {
            key,
            sizes: {
              min: [min[0] + left + right, min[1] + top + bottom],
              pref: [pref[0] + left + right, pref[1] + top + bottom],
              max: [grow(max[0], 0, left + right), grow(max[1], 1, top + bottom)],
            },
          };
        }
        measured.sizes = this.$padded.sizes;
        return measured;
      },
      $arrange(measured) {
        const [left, top, right, bottom] = inset(this);
        if (!left && !top && !right && !bottom) return Base.proto.$arrange.call(this, measured);
        const width = this.width - left - right;
        const height = this.height - top - bottom;
        if (!(width >= 0 && height >= 0)) return null;
        const arranged = arrange(measured, width, height, mirrored(this) !== (this.layoutDirection === RightToLeft));
        arranged.fits = untrack(() =>
          arranged.cells.map(({ item }, index) => item.width === arranged.width[index] && item.height === arranged.height[index]),
        );
        arranged.inset = [left, top];
        return arranged;
      },
      $place(arranged) {
        if (!arranged?.inset) return Base.proto.$place.call(this, arranged);
        const { cells, x, y, width, height, fits, inset: [left, top] } = arranged;
        for (let index = 0; index < cells.length; index++) {
          const item = cells[index].item;
          slot(item, "x").place(x[index] + left);
          slot(item, "y").place(y[index] + top);
          const wide = slot(item, "width");
          const tall = slot(item, "height");
          if (fits[index] && wide.placed === undefined && tall.placed === undefined) continue;
          wide.place(width[index]);
          tall.place(height[index]);
        }
      },
      ...spec.methods,
    },
  });
}

// Children side by side, and one under another.
export const Row = arrangement("Row", RowLayout);
export const Column = arrangement("Column", ColumnLayout);

// A row or a column, as `direction` says; it can turn.
export const Box = arrangement("Box", RowLayout, {
  properties: { direction: 0 },
  enums: { Row: 0, Column: 1 },
  methods: {
    $cells() {
      return (this.direction === 1 ? ColumnLayout : RowLayout).proto.$cells.call(this);
    },
  },
});

// Children in cells, along the flow. Between two columns (and rows) is
// `spacing` until a spacing of its own is given.
const gap = derived((self) => self.spacing);
export const Grid = arrangement("Grid", GridLayout, {
  properties: { columnSpacing: gap, rowSpacing: gap },
});

// One child at a time, as big as where it is.
export const Pages = defineType("Pages", StackLayout, {});

export { Flow, Layout };

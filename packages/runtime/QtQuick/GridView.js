// GridView: a model's rows in cells of one size, as many across as fit.
//
// Where a row is follows from its index alone, so nothing is estimated: the
// rows with delegates are those of the lines near what is shown.
import { defineType, derived, QtObject, slot } from "../object.js";
import { attachedProperties, clamp, ItemView, length, place } from "./ItemView.js";
import { untrack } from "#kernel";

const FlowLeftToRight = 0;
const FlowTopToBottom = 2;

const GridViewAttached = defineType("GridViewAttached", QtObject, {
  properties: attachedProperties,
  signals: ["add", "remove"],
  setup(self, props) {
    self.$of = props.$attachee;
  },
});

// How many cells there are across the way the view scrolls.
function across(self, vertical) {
  const room = vertical ? self.width : self.height;
  const cell = vertical ? self.cellWidth : self.cellHeight;
  return cell > 0 ? Math.max(Math.floor(room / cell), 1) : 1;
}

export const GridView = defineType("GridView", ItemView, {
  properties: {
    cellWidth: 100,
    cellHeight: 100,
    flow: FlowLeftToRight,
    flickableDirection: derived((self) => (self.flow === FlowTopToBottom ? 1 : 2)),
  },
  enums: { FlowLeftToRight, FlowTopToBottom, SnapToRow: 1, SnapOneRow: 2 },
  attached: GridViewAttached,
  methods: {
    // Along a line, and from one line to the next: which of the four ways
    // is which depends on the flow.
    moveCurrentIndexRight() {
      if (untrack(() => this.$vertical())) this.$step(1, 0);
      else this.$line(1);
    },
    moveCurrentIndexLeft() {
      if (untrack(() => this.$vertical())) this.$step(-1, this.$v.rows.count - 1);
      else this.$line(-1);
    },
    moveCurrentIndexDown() {
      if (untrack(() => this.$vertical())) this.$line(1);
      else this.$step(1, 0);
    },
    moveCurrentIndexUp() {
      if (untrack(() => this.$vertical())) this.$line(-1);
      else this.$step(-1, this.$v.rows.count - 1);
    },
    $line(by) {
      untrack(() => {
        const count = this.$v.rows.count;
        const index = this.currentIndex + by * across(this, this.$vertical());
        if (index >= 0 && index < count) this.currentIndex = index;
        else if (count && this.keyNavigationWraps) this.currentIndex = by > 0 ? index % count : count - 1;
      });
    },
    // The row whose cell a point of the content is in.
    indexAt(x, y) {
      return untrack(() => {
        const vertical = this.$vertical();
        const column = Math.floor(x / this.cellWidth);
        const line = Math.floor(y / this.cellHeight);
        const cells = across(this, vertical);
        if (column < 0 || line < 0 || (vertical ? column : line) >= cells) return -1;
        const index = vertical ? line * cells + column : column * cells + line;
        return index < this.$v.rows.count ? index : -1;
      });
    },
    $vertical() {
      return this.flow !== FlowTopToBottom;
    },
    $watch() {
      void this.flow;
      void this.cellWidth;
      void this.cellHeight;
    },
    $rowAt(state, position) {
      const index = Math.floor(position / state.cell) * state.across;
      return index >= 0 && index < state.rows.count ? index : -1;
    },
    $locate(state, index) {
      state.at = Math.floor(index / state.across) * state.cell;
      state.span = state.cell;
      return true;
    },
    // Every row's place is known.
    $seek() {},
    $arrange(state, count, current) {
      const rows = state.rows;
      const vertical = state.vertical;
      const axis = vertical ? "y" : "x";
      const span = vertical ? "height" : "width";
      const cellWidth = this.cellWidth;
      const cellHeight = this.cellHeight;
      const cell = (state.cell = Math.max(vertical ? cellHeight : cellWidth, 1));
      const cells = (state.across = across(this, vertical));
      const lines = Math.ceil(count / cells);
      const header = length(state.header.item, span);
      const footer = length(state.footer.item, span);
      const pass = ++state.pass;
      if (state.axis !== axis) {
        // The other flow: the content is as it was across the old one.
        const other = state.axis;
        state.axis = axis;
        if (other) {
          for (const part of [state.header, state.footer]) place(part.item, other, undefined);
          slot(this, other === "y" ? "originY" : "originX").place(undefined);
          slot(this, other === "y" ? "contentHeight" : "contentWidth").place(undefined);
          slot(this, "contentX").reset();
          slot(this, "contentY").reset();
          state.dirty = true;
        }
      }
      if (count) {
        const position = this[vertical ? "contentY" : "contentX"];
        const buffer = Math.max(this.cacheBuffer, 0);
        const from = clamp(Math.floor((position - buffer) / cell), 0, lines - 1);
        const to = clamp(Math.floor((position + this[span] + buffer) / cell), 0, lines - 1);
        const end = Math.min((to + 1) * cells, count);
        for (let index = from * cells; index < end; index++) rows.row(index).$stamp = pass;
        // The current item is kept, wherever it is.
        if (current >= 0) rows.row(current).$stamp = pass;
      }
      for (const row of rows.live.values()) {
        if (row.$stamp !== pass) {
          rows.release(row);
          continue;
        }
        const index = row.$index;
        const line = Math.floor(index / cells);
        const cross = index % cells;
        place(row.$item, "x", (vertical ? cross : line) * cellWidth);
        place(row.$item, "y", (vertical ? line : cross) * cellHeight);
      }
      place(state.header.item, axis, 0 - header);
      place(state.footer.item, axis, lines * cell);
      slot(this, vertical ? "originY" : "originX").place(0 - header);
      slot(this, vertical ? "contentHeight" : "contentWidth").place(lines * cell + header + footer);
    },
  },
  setup(self) {
    const state = self.$v;
    state.grid = true;
    state.cell = 100;
    state.across = 1;
    state.axis = undefined;
  },
});

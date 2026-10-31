// ListView: a model's rows one after another, each as long as its delegate.
//
// Only the rows near what is shown have delegates, so where the others are
// is an estimate, made as Qt makes it: every row there is no delegate for is
// taken to be as long as the average of those there is one for. The rows
// laid out hang from the first of them, which stays where it is while rows
// come and go around it.
import { defineType, derived, group, QtObject, slot } from "../object.js";
import { attachedProperties, clamp, create, drop, ItemView, length, place } from "./ItemView.js";
import { untrack } from "#kernel";

const Horizontal = 1;
const Vertical = 2;
const FirstCharacter = 1;

// The section a row is in: its value for the section's role, or the first
// character of that.
function sectionOf(self, rows, index) {
  if (!(index >= 0 && index < rows.count)) return "";
  const section = self.section;
  const property = section.property;
  if (!property) return "";
  const value = rows.read(index, property);
  const text = value == null ? "" : String(value);
  return section.criteria === FirstCharacter ? text.charAt(0) : text;
}

// How long a row is with the label of the section it begins, which is made
// here if there is to be one.
function measure(self, state, row, span) {
  const rows = state.rows;
  const index = row.$index;
  const component = self.section.delegate;
  const text = sectionOf(self, rows, index);
  const wanted = typeof component === "function" && text !== "" && text !== sectionOf(self, rows, index - 1);
  let label = row.$label;
  if (label && (!wanted || label.text !== text || label.component !== component)) {
    drop(self, label);
    label = row.$label = null;
  }
  if (wanted && !label) {
    label = row.$label = { component, item: null, dispose: null, text };
    create(self, label, component, 2, Object.setPrototypeOf({ section: text }, null));
  }
  row.$head = label ? length(label.item, span) : 0;
  row.$size = length(row.$item, span);
  return row.$head + row.$size;
}

// The other way: what was placed along the old axis is the items' own again.
function turn(self, state, axis) {
  const other = state.axis;
  state.axis = axis;
  if (!other) return;
  for (const row of state.rows.live.values()) {
    place(row.$item, other, undefined);
    place(row.$label?.item, other, undefined);
  }
  for (const part of [state.header, state.footer, state.highlight]) place(part.item, other, undefined);
  slot(self, other === "y" ? "originY" : "originX").place(undefined);
  slot(self, other === "y" ? "contentHeight" : "contentWidth").place(undefined);
  slot(self, "contentX").reset();
  slot(self, "contentY").reset();
  state.first = 0;
  state.firstPos = 0;
  state.last = -1;
  state.origin = undefined;
  state.dirty = true;
}

const ListViewAttached = defineType("ListViewAttached", QtObject, {
  properties: {
    ...attachedProperties,
    section: derived((self) => around(self, 0)),
    previousSection: derived((self) => around(self, -1)),
    nextSection: derived((self) => around(self, 1)),
  },
  signals: ["add", "remove"],
  setup(self, props) {
    self.$of = props.$attachee;
  },
});

// The section of the delegate's row, or of the one before or after it.
function around(self, by) {
  const row = self.$of.$delegate;
  const view = row?.$view;
  const index = row?.index ?? -1;
  if (!view || index < 0) return "";
  // Rows that moved are others' neighbours.
  view.$v.version();
  return sectionOf(view, view.$v.rows, index + by);
}

export const ListView = defineType("ListView", ItemView, {
  properties: {
    orientation: Vertical,
    spacing: 0,
    section: group({ property: "", criteria: 0, delegate: undefined }),
    flickableDirection: derived((self) => (self.orientation === Horizontal ? 1 : 2)),
  },
  enums: { Horizontal, Vertical, SnapToItem: 1, SnapOneItem: 2 },
  attached: ListViewAttached,
  methods: {
    incrementCurrentIndex() {
      this.$step(1, 0);
    },
    decrementCurrentIndex() {
      this.$step(-1, this.$v.rows.count - 1);
    },
    // The row whose delegate is at a point of the content.
    indexAt(x, y) {
      return untrack(() => {
        for (const row of this.$v.rows.live.values()) {
          const item = row.$item;
          if (!item.$node) continue;
          if (x >= item.x && x < item.x + item.width && y >= item.y && y < item.y + item.height) return row.$index;
        }
        return -1;
      });
    },
    $vertical() {
      return this.orientation !== Horizontal;
    },
    // What a layout depends on besides what every view's does: how long the
    // delegates are, and what sections their rows are in.
    $watch(state) {
      const span = this.orientation === Horizontal ? "width" : "height";
      const rows = state.rows;
      const section = this.section;
      const sectioned = section.property !== "";
      void this.spacing;
      void section.criteria;
      void section.delegate;
      for (const row of rows.live.values()) {
        length(row.$item, span);
        length(row.$label?.item, span);
        if (!sectioned) continue;
        sectionOf(this, rows, row.$index);
        sectionOf(this, rows, row.$index - 1);
      }
    },
    $inserted(state, index, count) {
      // Rows before the ones laid out push none of them along.
      if (state.laidOut && index < state.first) state.first += count;
    },
    $removed(state, index, count) {
      if (index + count <= state.first) state.first -= count;
      else if (index < state.first) state.first = index;
    },
    $released(state, row) {
      if (!row.$label) return;
      drop(this, row.$label);
      row.$label = null;
    },
    $rowAt(state, position) {
      for (const row of state.rows.live.values()) {
        if (row.$stamp === state.pass && position >= row.$block && position < row.$block + row.$head + row.$size) {
          return row.$index;
        }
      }
      return -1;
    },
    $locate(state, index) {
      const row = state.rows.live.get(index);
      if (!row || row.$stamp !== state.pass) return false;
      state.at = row.$block;
      state.span = row.$head + row.$size;
      return true;
    },
    // Makes the row at `index` one of those laid out. If it is far from
    // them, it is put where it should be by the average and the others are
    // laid out from it. With `home`, the first row is where the content
    // begins anew, at zero and not where the estimates had drifted to: Qt
    // does that for a view positioned at its first row.
    $seek(state, index, home) {
      const rows = state.rows;
      const anew = home && index === 0 && state.first !== 0;
      if (!anew && rows.live.get(index)?.$stamp === state.pass) return;
      const spacing = this.spacing;
      const row = rows.row(index);
      const size = measure(this, state, row, state.vertical ? "height" : "width");
      // The first row there is: the others are taken to be like it.
      if (!state.measured) state.avg = Math.round(size);
      const step = state.avg + spacing;
      let at;
      if (anew) at = 0;
      else if (index < state.first) at = state.firstPos - (state.first - index - 1) * step - spacing - size;
      else if (state.last >= state.first && index > state.last) {
        at = state.lastEnd + spacing + (index - state.last - 1) * step;
      } else at = state.firstPos + (index - state.first) * step;
      row.$block = at;
      row.$stamp = state.pass;
      state.first = index;
      state.firstPos = at;
      state.last = -1;
    },
    $arrange(state, count, current) {
      const rows = state.rows;
      const vertical = state.vertical;
      const axis = vertical ? "y" : "x";
      const span = vertical ? "height" : "width";
      if (state.axis !== axis) turn(this, state, axis);
      const spacing = this.spacing;
      const header = length(state.header.item, span);
      const footer = length(state.footer.item, span);
      const pass = ++state.pass;
      let first = 0;
      let firstPos = 0;
      let last = -1;
      let end = 0;
      let step = state.avg + spacing;
      if (count && this[span] < 0) {
        // Less than nothing long: no row is made, and each is taken to be as
        // long as Qt takes one to be before it has measured any.
        step = 100 + spacing;
        end = -spacing;
      } else if (count) {
        const position = this[vertical ? "contentY" : "contentX"];
        const buffer = Math.max(this.cacheBuffer, 0);
        const from = position - buffer;
        const to = position + this[span] + buffer;
        first = Math.min(state.first, count - 1);
        firstPos = state.firstPos;
        // More than a page away from the rows there are: start from the row
        // that should be there, not from all those in between.
        if (state.last >= first && step > 0) {
          const after = state.lastEnd + spacing;
          if (from > after + step || to < firstPos - step) {
            const target = clamp(state.last + 1 + Math.trunc((position - after) / step), 0, count - 1);
            if (target < first || target > state.last) {
              first = target;
              firstPos = after + (target - state.last - 1) * step;
            }
          }
        }
        let made = 0;
        let total = 0;
        let at = firstPos;
        end = firstPos;
        for (let index = first; index < count && at <= to; index++) {
          const row = rows.row(index);
          const size = measure(this, state, row, span);
          row.$block = at;
          if (!made && at + size < from && index + 1 < count) {
            // Before what is shown: the row after it is the first.
            first = index + 1;
            firstPos = at + size + spacing;
          } else {
            row.$stamp = pass;
            made++;
            total += size;
            last = index;
            end = at + size;
          }
          at += size + spacing;
        }
        while (first > 0 && firstPos > from) {
          const row = rows.row(first - 1);
          const size = measure(this, state, row, span);
          first--;
          firstPos -= size + spacing;
          row.$block = firstPos;
          row.$stamp = pass;
          if (!made) {
            last = first;
            end = firstPos + size;
          }
          made++;
          total += size;
        }
        // Rows after what is shown, once the view has gone back.
        while (made > 1) {
          const row = rows.live.get(last);
          if (row.$block <= to) break;
          row.$stamp = 0;
          made--;
          total -= row.$head + row.$size;
          last--;
          end = row.$block - spacing;
        }
        if (!made) {
          const row = rows.row(first);
          const size = measure(this, state, row, span);
          row.$block = firstPos;
          row.$stamp = pass;
          made = 1;
          total = size;
          last = first;
          end = firstPos + size;
        }
        state.avg = Math.round(total / made);
        state.measured = true;
        step = state.avg + spacing;
        // The current item is kept, wherever it is.
        if (current >= 0 && (current < first || current > last)) {
          const row = rows.row(current);
          const size = measure(this, state, row, span);
          row.$block =
            current < first ? firstPos - (first - current - 1) * step - spacing - size : end + spacing + (current - last - 1) * step;
          row.$stamp = pass;
        }
      }
      for (const row of rows.live.values()) {
        if (row.$stamp !== pass) {
          rows.release(row);
          continue;
        }
        place(row.$item, axis, row.$block + row.$head);
        place(row.$label?.item, axis, row.$block);
      }
      // Where the content begins and ends, the rows without a delegate
      // being as long as the average.
      const origin = firstPos - first * step;
      const ending = count ? end + (count - 1 - last) * step : origin;
      // While it is moved the beginning stays put: the element would have
      // to be scrolled to another place under the finger moving it.
      if (state.origin === undefined || !this.moving) state.origin = origin;
      place(state.header.item, axis, state.origin - header);
      place(state.footer.item, axis, ending);
      slot(this, vertical ? "originY" : "originX").place(state.origin - header);
      slot(this, vertical ? "contentHeight" : "contentWidth").place(Math.max(ending - state.origin, 0) + header + footer);
      state.first = first;
      state.firstPos = firstPos;
      state.last = last;
      state.lastEnd = end;
    },
  },
  setup(self) {
    const state = self.$v;
    // The first row laid out, and where it is.
    state.first = 0;
    state.firstPos = 0;
    state.lastEnd = 0;
    state.avg = 0;
    state.measured = false;
    state.origin = undefined;
    state.axis = undefined;
  },
});

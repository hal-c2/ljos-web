// What ListView and GridView share: a Flickable whose content is the
// delegates of a model's rows, made only for the rows near what is shown.
//
// One effect lays the view out. It depends on what a layout reads (the
// content position, the sizes of the delegates there are, the model) and
// runs the type's `$arrange`, which says which rows are needed and where
// they go. A row keeps its delegate for as long as it is needed: scrolling
// makes the rows that come into view and nothing else.
import { onCleanup } from "solid-js";
import { defineType, derived, effect, instantiate, slot } from "../object.js";
import { Flickable } from "./Flickable.js";
import { Item } from "./Item.js";
import { delegateOf, modelOf, moved, Rows, size } from "./model.js";
import { settle } from "./settle.js";
import { signal, untrack } from "#kernel";

const next = (version) => version + 1;

const Beginning = 0;
const Center = 1;
const End = 2;
const Visible = 3;
const Contain = 4;

const NoHighlightRange = 0;
const StrictlyEnforceRange = 2;

// What a header, a footer or a highlight is given: nothing.
const NOTHING = Object.freeze(Object.create(null));

export const clamp = (value, min, max) => Math.max(Math.min(value, max), min);

// A view's decision about an item, over whatever the item says. With no
// value, the item's own again.
export function place(item, key, value) {
  if (item?.$node) slot(item, key).place(value);
}

// How long an item is along `span`; an object that is not an item takes
// no room.
export const length = (item, span) => (item?.$node ? item[span] : 0);

// An item in the view's content. `z` is where Qt stacks it unless the item
// says.
function adopt(self, item, z) {
  if (!item?.$node) return;
  self.$contentItem.$add(item);
  const stacking = slot(item, "z");
  if (z && !stacking.explicit()) stacking.provide(z);
}

// Makes an item that is not a row's: `part` holds it and how to destroy it.
export function create(self, part, component, z, data = NOTHING) {
  const state = self.$v;
  const made = instantiate(
    (given) => {
      const object = component(given);
      // What `ListView.view` is found through.
      if (object) object.$delegate = state.aside;
      return object;
    },
    data,
    self.$contentItem,
    self.$owner,
  );
  part.component = component;
  part.item = made.object;
  part.dispose = made.dispose;
  adopt(self, part.item, z);
  state.dirty = true;
}

export function drop(self, part) {
  if (!part.dispose) return;
  self.$contentItem.$remove(part.item);
  part.dispose();
  part.item = part.dispose = null;
  self.$v.dirty = true;
}

// The header or the footer, when its component is another.
function aside(self, part, component, name) {
  if (part.component === component) return;
  drop(self, part);
  part.component = component;
  if (typeof component === "function") create(self, part, component, 1);
  slot(self, name).write(part.item);
}

// The highlight is there while there is a current item, behind it and as
// big, unless it is told not to follow.
function highlight(self, state, item) {
  const part = state.highlight;
  const component = self.highlight;
  const wanted = item != null && typeof component === "function";
  if (part.item && (!wanted || part.component !== component)) drop(self, part);
  if (wanted && !part.item) create(self, part, component, 0);
  slot(self, "highlightItem").write(part.item);
  if (!part.item || !item.$node || !self.highlightFollowsCurrentItem) return;
  if (state.vertical || state.grid) place(part.item, "y", item.y);
  if (!state.vertical || state.grid) place(part.item, "x", item.x);
  place(part.item, "width", item.width);
  place(part.item, "height", item.height);
}

const positionKey = (state) => (state.vertical ? "contentY" : "contentX");
const least = (self, state) => (state.vertical ? self.$minY() : self.$minX());
const most = (self, state) => (state.vertical ? self.$maxY() : self.$maxX());
const extent = (self, state) => (state.vertical ? self.height : self.width);

// A position that was never set is the content's beginning, wherever a
// header puts that: writing what it already is would pin it.
function moveTo(self, state, position) {
  const key = positionKey(state);
  if (position === self[key]) return;
  slot(self, key).write(position);
  state.dirty = true;
}

// Brings what `$locate` found into view, or into the highlight's range.
function reveal(self, state, bounded) {
  const size = extent(self, state);
  const mode = self.highlightRangeMode;
  const at = state.at;
  const span = state.span;
  let position = self[positionKey(state)];
  if (mode === NoHighlightRange) {
    if (at + span > position + size) position = at + span - size;
    if (at < position) position = at;
  } else {
    const begin = self.preferredHighlightBegin;
    const end = self.preferredHighlightEnd;
    if (at > position + end - span) position = at - end + span;
    if (at < position + begin) position = at - begin;
    if (mode === StrictlyEnforceRange) bounded = state.lax !== null;
  }
  if (bounded) {
    // One that starts inside its content is kept to that, not to its range.
    const ends = state.lax ? Flickable.proto : self;
    const [low, high] = state.vertical ? [ends.$minY, ends.$maxY] : [ends.$minX, ends.$maxX];
    position = clamp(position, low.call(self), high.call(self));
  }
  moveTo(self, state, position);
}

// `ListView.onAdd`, `ListView.onRemove`: a delegate that listens has the
// handler among what it was given.
function notify(self, item, name, handler) {
  const Type = self.$type;
  if (!item?.$props) return;
  if (`${Type.typeName}$${handler}` in item.$props || item.$attached?.[Type.typeName]) Type.attached(item)[name]();
}

// A view that starts inside its content though its range is enforced (the
// list Qt's TumblerView makes, which says so only once the list has its
// rows) stays there until something is other than it was: `lax` is what it
// was laid out by.
function loosened(self, state, count, current) {
  const lax = state.lax;
  const by = [count, current, self.width, self.height, self.preferredHighlightBegin, self.preferredHighlightEnd];
  if (!lax.length) {
    if (count && current >= 0 && extent(self, state)) lax.push(...by);
    return true;
  }
  return !self.moving && by.every((value, index) => value === lax[index]);
}

// A view whose range is enforced goes as far as its first row and its last
// are in the range, if the range has a size. (Qt: with one of no size too, to
// where the last row begins.)
function ranged(self, vertical) {
  return (
    self.highlightRangeMode === StrictlyEnforceRange &&
    self.preferredHighlightEnd > self.preferredHighlightBegin &&
    self.$vertical() === vertical
  );
}

function first(self, vertical) {
  const base = (vertical ? Flickable.proto.$minY : Flickable.proto.$minX).call(self);
  return ranged(self, vertical) ? base - self.preferredHighlightBegin : base;
}

function last(self, vertical) {
  const length = vertical ? self.contentHeight : self.contentWidth;
  if (!ranged(self, vertical) || !(length >= 0)) return (vertical ? Flickable.proto.$maxY : Flickable.proto.$maxX).call(self);
  const end = (vertical ? self.originY : self.originX) + length - self.preferredHighlightEnd;
  return Math.max(end, first(self, vertical));
}

function refresh(self, state) {
  // Making a row's item may settle what has changed, which would lay the
  // view out from inside its own layout and make the row once more: that
  // turn waits for this one.
  if (state.laying) {
    state.dirty = true;
    return false;
  }
  state.laying = true;
  try {
    return arrange(self, state);
  } finally {
    state.laying = false;
  }
}

function arrange(self, state) {
  const rows = state.rows;
  const model = modelOf(self.model);
  const delegate = delegateOf(self.model, self.delegate);
  const rowCount = size(model);
  // A model that reports is followed; another is looked at again when it,
  // or how many rows it has, is not what it was.
  if (model !== state.model || delegate !== state.delegate || rowCount !== state.size) {
    state.model = model;
    state.delegate = delegate;
    state.size = rowCount;
    rows.set(model, delegate);
  }
  aside(self, state.header, self.header, "headerItem");
  aside(self, state.footer, self.footer, "footerItem");
  const count = rows.ready ? rows.count : 0;
  state.vertical = self.$vertical();
  let current = self.currentIndex;
  // With a range that is enforced, the item the user brought into it is
  // the current one.
  if (count && self.moving && self.highlightRangeMode === StrictlyEnforceRange) {
    const under = self.$rowAt(state, self[positionKey(state)] + self.preferredHighlightBegin);
    if (under >= 0 && under !== current) {
      slot(self, "currentIndex").write(under);
      state.shown = current = under;
    }
  }
  if (current !== state.shown) {
    state.shown = current;
    state.follow = self.highlightFollowsCurrentItem;
  } else if (!self.moving && self.highlightRangeMode === StrictlyEnforceRange) {
    // With a range that is enforced the current item is in it wherever the
    // rows that came, went or grew have left it, unless the user is moving
    // the view.
    state.follow = true;
  }
  if (current < 0 || current >= count) current = -1;
  if (state.lax && !loosened(self, state, count, current)) {
    state.lax = null;
    state.loose(false);
  }
  // Where the current item is decides which rows are needed.
  if (state.follow && current >= 0) {
    self.$seek(state, current);
    if (self.$locate(state, current)) reveal(self, state, false);
  }
  self.$arrange(state, count, current);
  const item = current >= 0 ? (rows.live.get(current)?.$item ?? null) : null;
  slot(self, "currentItem").write(item);
  highlight(self, state, item);
  if (state.follow) {
    state.follow = false;
    if (current >= 0 && self.$locate(state, current)) reveal(self, state, true);
  } else if (state.fix && !self.moving) {
    // Rows went: the view may be beyond what is left.
    moveTo(self, state, clamp(self[positionKey(state)], least(self, state), most(self, state)));
  }
  if (state.added.length) {
    for (const added of state.added) if (added.$index >= 0) notify(self, added.$item, "add", "onAdd");
    state.added.length = 0;
  }
  state.fresh = null;
  if (state.dirty) {
    // The rows are others, or the view moved: lay out again, depending on
    // what there is now.
    state.dirty = false;
    state.bump(next);
    return true;
  }
  state.fix = false;
  return false;
}

// The layout now, for a method that goes on from it: a handler that calls
// one is run while what changed is being settled, and the view's turn to be
// laid out would come after the method returned.
function layout(self, state) {
  let turns = 3;
  while (refresh(self, state) && --turns);
}

// Puts the row at `index` at the beginning, the middle or the end of the
// view. `edge` takes the header (-1) or the footer (1) in with it.
function position(self, index, mode, edge = 0) {
  const state = self.$v;
  if (!state.laidOut) return;
  untrack(() => {
    layout(self, state);
    const count = state.rows.ready ? state.rows.count : 0;
    if (!(index >= 0 && index < count)) return;
    const key = positionKey(state);
    const span = state.vertical ? "height" : "width";
    // Twice: where a row far away is was a guess until it was laid out.
    for (let turn = 0; turn < 2; turn++) {
      self.$seek(state, index, true);
      if (!self.$locate(state, index)) return;
      const size = extent(self, state);
      const at = state.at;
      let to = self[key];
      switch (mode) {
        case Beginning:
          to = at;
          if (edge < 0) to -= length(state.header.item, span);
          break;
        case Center:
          to = at - (size - state.span) / 2;
          break;
        case End:
          to = at - size + state.span;
          if (edge > 0) to += length(state.footer.item, span);
          break;
        case Visible:
          if (at > to + size) to = at - size + state.span;
          else if (at + state.span <= to) to = at;
          break;
        case Contain:
          if (at + state.span >= to + size) to = at - size + state.span;
          if (at < to) to = at;
          break;
        default:
          to = at - self.preferredHighlightBegin;
      }
      to = Math.max(Math.min(to, most(self, state)), least(self, state));
      if (to !== self[key]) slot(self, key).write(to);
      if (self.highlightRangeMode === StrictlyEnforceRange) {
        // The row that came into a range that is enforced is the current
        // one.
        const under = self.$rowAt(state, to + self.preferredHighlightBegin);
        if (under >= 0) setCurrent(self, state, under);
      }
      layout(self, state);
    }
  });
  settle();
}

function setCurrent(self, state, index) {
  slot(self, "currentIndex").write(index);
  state.shown = index;
}

function sizes(item) {
  if (!item?.$node) return;
  void item.width;
  void item.height;
}

export const ItemView = defineType("ItemView", Flickable, {
  properties: {
    model: undefined,
    delegate: undefined,
    count: 0,
    // The first row, once there is one, until something says otherwise.
    currentIndex: derived((self) => (self.count > 0 ? 0 : -1)),
    currentItem: null,
    highlight: undefined,
    highlightItem: null,
    highlightFollowsCurrentItem: true,
    highlightRangeMode: NoHighlightRange,
    preferredHighlightBegin: 0,
    preferredHighlightEnd: 0,
    header: undefined,
    headerItem: null,
    footer: undefined,
    footerItem: null,
    cacheBuffer: 320,
    keyNavigationWraps: false,
    snapMode: 0,
  },
  enums: {
    Beginning,
    Center,
    End,
    Visible,
    Contain,
    SnapPosition: 5,
    NoHighlightRange,
    ApplyRange: 1,
    StrictlyEnforceRange,
    NoSnap: 0,
  },
  methods: {
    $minX() {
      return first(this, false);
    },
    $maxX() {
      return last(this, false);
    },
    $minY() {
      return first(this, true);
    },
    $maxY() {
      return last(this, true);
    },
    // The delegate of a row, if the row is near enough to have one.
    itemAtIndex(index) {
      return this.$v.rows.live.get(index)?.$item ?? null;
    },
    itemAt(x, y) {
      return this.itemAtIndex(this.indexAt(x, y));
    },
    positionViewAtIndex(index, mode) {
      position(this, index, mode);
    },
    positionViewAtBeginning() {
      position(this, 0, Beginning, -1);
    },
    positionViewAtEnd() {
      position(this, this.$v.rows.count - 1, End, 1);
    },
    forceLayout() {
      const state = this.$v;
      if (state.laidOut) untrack(() => layout(this, state));
      settle();
    },
    // The current index, a step on: `wrapped` is where it goes from the end.
    $step(by, wrapped) {
      const count = this.$v.rows.count;
      const index = untrack(() => this.currentIndex) + by;
      if (index >= 0 && index < count) this.currentIndex = index;
      else if (count && untrack(() => this.keyNavigationWraps)) this.currentIndex = wrapped;
    },
  },
  setup(self, props) {
    const [version, bump] = signal(0, self.$owner);
    const [loosely, loose] = signal(Boolean(props.$lax), self.$owner);
    const content = self.$contentItem;
    const changed = () => {
      slot(self, "count").write(rows.count);
      state.last = -1;
      bump(next);
    };
    const rows = new Rows({
      self,
      owner: self.$owner,
      parent: () => content,
      inserted(index, count) {
        const before = rows.count - count;
        const current = untrack(() => self.currentIndex);
        // The current item is the same one, further on.
        if (current >= index && current < before) setCurrent(self, state, current + count);
        else if (!before && state.emptied) setCurrent(self, state, 0);
        state.emptied = false;
        self.$inserted?.(state, index, count);
        state.fresh = state.laidOut ? [index, count] : null;
        changed();
      },
      removed(index, count, gone) {
        const current = untrack(() => self.currentIndex);
        if (current >= index + count) {
          setCurrent(self, state, current - count);
        } else if (current >= index) {
          // The current item went: the one that took its place is current.
          const taken = Math.min(index, rows.count - 1);
          state.emptied = taken < 0;
          setCurrent(self, state, taken);
        }
        self.$removed?.(state, index, count);
        state.fix = true;
        changed();
        for (const row of gone) notify(self, row.$item, "remove", "onRemove");
      },
      moved(from, to, count) {
        const current = untrack(() => self.currentIndex);
        const now = moved(current, from, to, count);
        if (now !== current) setCurrent(self, state, now);
        changed();
      },
      created(row) {
        const item = row.$item;
        if (item?.$node && item.$parent !== content) {
          // An ObjectModel's object: the view is where it is shown.
          item.$parent = content;
          slot(item, "parent").changed();
        }
        adopt(self, item, 1);
        const fresh = state.fresh;
        if (fresh && row.$index >= fresh[0] && row.$index < fresh[0] + fresh[1]) state.added.push(row);
        state.dirty = true;
      },
      destroyed(row) {
        if (row.$item?.$node) content.$remove(row.$item);
        self.$released?.(state, row);
        state.dirty = true;
      },
    });
    const state = (self.$v = {
      rows,
      version,
      bump,
      model: undefined,
      delegate: undefined,
      size: 0,
      tick: 0,
      // What a row is stamped with when a layout needs it.
      pass: 0,
      dirty: false,
      // Whether it is being laid out now.
      laying: false,
      fix: false,
      emptied: false,
      laidOut: false,
      // The current index the view last showed, and whether it has yet to
      // bring it into view.
      shown: undefined,
      follow: false,
      lax: props.$lax ? [] : null,
      loose,
      fresh: null,
      added: [],
      // What stands for a row in an item that is not one's.
      aside: { $view: self, $index: -1, index: -1 },
      header: { component: undefined, item: null, dispose: null },
      footer: { component: undefined, item: null, dispose: null },
      highlight: { component: undefined, item: null, dispose: null },
      vertical: true,
      grid: false,
      // Where `$locate` found a row, and how long it is.
      at: 0,
      span: 0,
      // The last row laid out in order, when no row has come or gone since.
      last: -1,
    });
    onCleanup(() => rows.dispose());
    effect(
      () => {
        version();
        size(modelOf(self.model));
        void delegateOf(self.model, self.delegate);
        void self.header;
        void self.footer;
        void self.highlight;
        void self.cacheBuffer;
        void self.highlightFollowsCurrentItem;
        void self.highlightRangeMode;
        void self.preferredHighlightBegin;
        void self.preferredHighlightEnd;
        void self.moving;
        void self.width;
        void self.height;
        void self.contentX;
        void self.contentY;
        sizes(state.header.item);
        sizes(state.footer.item);
        sizes(rows.live.get(self.currentIndex)?.$item);
        self.$watch(state);
        return ++state.tick;
      },
      () => {
        untrack(() => refresh(self, state));
        state.laidOut = true;
      },
    );
    // Snapping is the browser's too: the items are where it stops, which is
    // where an enforced range begins. One that started inside its content
    // and is there still may be where no item would stop.
    effect(
      () => {
        const vertical = self.$vertical();
        return [loosely() ? 0 : self.snapMode, vertical, ranged(self, vertical) ? self.preferredHighlightBegin : 0];
      },
      ([snap, vertical, begin]) => {
        const viewport = self.$viewport;
        viewport.style.scrollSnapType = snap ? `${vertical ? "y" : "x"} mandatory` : "";
        viewport.style.scrollPadding = begin ? (vertical ? `${begin}px 0 0 0` : `0 0 0 ${begin}px`) : "";
        viewport.classList.toggle("qq-snap", snap !== 0);
        viewport.classList.toggle("qq-snap-one", snap === 2);
      },
    );
  },
  // What is declared in a view is the view's, as in Qt, and stays where it
  // is: only the rows are in what moves.
  adopt: Item.adopt,
});

// `ListView.view`, `GridView.isCurrentItem`: what a delegate knows of the
// view it is in. The row is noted on the delegate when it is made.
export const attachedProperties = {
  view: derived((self) => self.$of.$delegate?.$view ?? null),
  isCurrentItem: derived((self) => {
    const row = self.$of.$delegate;
    const index = row?.index ?? -1;
    return index >= 0 && index === row.$view?.currentIndex;
  }),
};

// Tumbler: a wheel of rows, one of which is the current one. The style's
// content item is, or has in it, the view that turns: a PathView for a
// tumbler that wraps, a ListView for one that does not. The tumbler says
// how big the rows are and which is current, and the view says where it is.
import { defineType, derived, effect, QtObject, settle, slot } from "../../object.js";
import { Key } from "../keycodes.js";
import { ListView } from "../ListView.js";
import { PathView } from "../PathView.js";
import { Control, loose } from "./Control.js";
import { signal, untrack } from "#kernel";

const NONE = [];

const isTumbler = (item) => item.$type.chain.includes(Tumbler);
const isPath = (item) => item.$type.chain.includes(PathView);
const isList = (item) => item.$type.chain.includes(ListView);

// The view in a content item: the item, or the first one found inside it.
function find(item) {
  if (!item?.$node) return null;
  if (isPath(item) || isList(item)) return item;
  for (const child of item.children) {
    const view = find(child);
    if (view) return view;
  }
  return null;
}

const viewOf = (self) => find(self.contentItem);

// How far a row is from the current one, in rows: 1 for the one above it.
// A view that wraps counts the shorter way round.
function displacement(self) {
  const tumbler = self.tumbler;
  const view = tumbler && viewOf(tumbler);
  const count = tumbler ? tumbler.count : 0;
  if (!view || !count) return 0;
  const shown = tumbler.visibleItemCount;
  if (isList(view)) {
    return (view.contentY + view.preferredHighlightBegin - self.$of.y) / (tumbler.availableHeight / shown);
  }
  const index = self.$of.$delegate?.index ?? -1;
  const half = Math.floor(shown / 2) + (shown < count ? 1 : 0);
  let away = count > 1 ? count - index - view.offset : 0;
  if (away > half) away -= count;
  else if (away < -half) away += count;
  return away;
}

const TumblerAttached = defineType("TumblerAttached", QtObject, {
  properties: {
    tumbler: derived((self) => {
      for (let item = self.$of.parent; item; item = item.parent) if (isTumbler(item)) return item;
      return null;
    }),
    displacement: derived(displacement),
  },
  setup(self, props) {
    self.$of = props.$attachee;
  },
});

// The row is the tumbler's current one: what it reads as, and what was
// asked of it last.
function take(self, mine, index) {
  mine.index = mine.asked = index;
  mine.turn(index);
  slot(self, "currentIndex").write(index);
}

// Turns a view to a row: at once when the row is where the view starts.
function go(view, index, count, instant) {
  if (instant && isPath(view)) view.offset = (count - index) % count;
  if (view.currentIndex !== index) view.currentIndex = index;
}

// Qt's `_q_onViewCountChanged`, `_q_onViewCurrentIndexChanged` and
// `setCurrentIndex`: the tumbler has as many rows as its view, is where the
// view is, and goes to the row that is asked for if there is one.
function sync(self, mine, view, count, at, asked, explicit) {
  const fresh = view !== mine.view;
  // Asked for since: where the view went meanwhile is not a request.
  const told = !Object.is(asked, mine.asked);
  let wanted = -1;
  let instant = true;
  if (fresh) {
    mine.view = view;
    mine.at = at;
    // A view that takes over starts where the tumbler was.
    if (mine.pending < 0) mine.pending = mine.index;
    // Its rows come after it: until then the tumbler has those it had.
    mine.late = view !== null && !count && mine.count > 0;
    if (mine.late) queueMicrotask(() => late(self, mine, view));
    if (count) wanted = mine.pending;
  } else if (at !== mine.at) {
    mine.at = at;
    if (!mine.late) take(self, mine, at);
  }
  if (mine.late && count) {
    mine.late = false;
    wanted = mine.pending;
  }
  if (count !== mine.count && !mine.late) {
    mine.count = count;
    slot(self, "count").write(count);
    // Whether it wraps is decided when it has other rows.
    if (count && !explicit) mine.wrap(count >= self.visibleItemCount);
    if (!count) take(self, mine, -1);
    else if (mine.pending >= 0) wanted = mine.pending;
    else if (mine.index < 0) wanted = 0;
  }
  if (mine.explicit && !explicit && count) mine.wrap(count >= self.visibleItemCount);
  mine.explicit = explicit;
  if (told) {
    mine.asked = asked;
    const index = Math.trunc(Number(asked));
    if (!mine.ready) {
      // Before there are rows: the row to start at.
      if (index >= 0) mine.pending = index;
      if (count) wanted = mine.pending;
    } else if (index >= 0 && index < count && index !== mine.index) {
      wanted = index;
      instant = false;
    }
  }
  mine.ready = true;
  if (view && count && wanted >= 0) {
    // A row there is none of is not started at.
    if (wanted >= count) wanted = mine.index >= 0 && mine.index < count ? mine.index : 0;
    go(view, wanted, count, instant);
    mine.at = view.currentIndex;
    mine.pending = -1;
    if (mine.at === wanted) take(self, mine, wanted);
  }
  // What was asked for and is not there is not what the tumbler is at.
  if (mine.asked !== mine.index) take(self, mine, mine.index);
}

// A view that took over and has no rows.
function late(self, mine, view) {
  if (!mine.late || mine.view !== view) return;
  mine.late = false;
  untrack(() => sync(self, mine, view, view.count, view.currentIndex, mine.asked, mine.explicit));
  settle();
}

export const Tumbler = defineType("Tumbler", Control, {
  properties: {
    model: undefined,
    count: 0,
    currentIndex: -1,
    currentItem: derived((self) => viewOf(self)?.currentItem ?? null),
    delegate: null,
    visibleItemCount: 5,
    wrap: undefined,
    moving: derived((self) => Boolean(viewOf(self)?.moving)),
    flickDeceleration: undefined,
    // `Qt.TabFocus`.
    focusPolicy: 1,
  },
  enums: { Beginning: 0, Center: 1, End: 2, Visible: 3, Contain: 4, SnapPosition: 5 },
  attached: TumblerAttached,
  resolve: {
    // The row the view is at: what is asked for is where it is to go.
    currentIndex: (self) => self.$tumbler.current(),
    // Unless it is told, it wraps when it has no fewer rows than are seen.
    wrap: (self, own) => {
      const asked = own();
      return asked === undefined ? self.$tumbler.wraps() : Boolean(asked);
    },
    // A wheel that goes round is let run on; a list is not.
    flickDeceleration: (self, own) => {
      const asked = own();
      return asked === undefined ? (self.wrap ? 100 : 1500) : Math.max(0.001, Number(asked));
    },
  },
  methods: {
    positionViewAtIndex(index, mode) {
      untrack(() => viewOf(this))?.positionViewAtIndex(index, mode);
    },
    // Up and down turn it a row.
    $keyPressed(event) {
      const view = untrack(() => viewOf(this));
      const up = event.key === Key.Key_Up;
      if (!view || event.isAutoRepeat || !(up || event.key === Key.Key_Down)) return;
      if (up) view.decrementCurrentIndex();
      else view.incrementCurrentIndex();
      event.accepted = true;
      settle();
    },
  },
  setup(self) {
    const [wraps, wrap] = signal(true, self.$owner);
    const [current, turn] = signal(-1, self.$owner);
    const mine = (self.$tumbler = {
      wraps,
      wrap,
      current,
      turn,
      // The row a view that is made for it starts at.
      start: () => {
        if (mine.pending >= 0) return mine.pending;
        if (mine.index >= 0) return mine.index;
        const asked = Math.trunc(Number(untrack(() => slot(self, "currentIndex").asked())));
        return asked >= 0 ? asked : 0;
      },
      view: null,
      count: 0,
      index: -1,
      asked: -1,
      // The row to start at, once there are rows.
      pending: -1,
      at: -1,
      explicit: false,
      late: false,
      ready: false,
    });
    loose(self, "currentIndex");
    effect(
      () => {
        const view = viewOf(self);
        return [
          view,
          view ? view.count : 0,
          view ? view.currentIndex : -1,
          slot(self, "currentIndex").asked(),
          slot(self, "wrap").asked() !== undefined,
        ];
      },
      ([view, count, at, asked, explicit]) => untrack(() => sync(self, mine, view, count, at, asked, explicit)),
    );
    // Each row is as wide as the tumbler has room, and as high as one of
    // the rows that are seen.
    effect(
      () => {
        const view = viewOf(self);
        const rows = view ? (isList(view) ? view.contentItem : view).children : NONE;
        return [rows, self.availableWidth, self.availableHeight / self.visibleItemCount];
      },
      ([rows, width, height]) => {
        for (const row of rows) {
          slot(row, "width").place(width);
          slot(row, "height").place(height);
        }
      },
    );
  },
});

// SplitView: items side by side, or one under the other, with a handle
// between each two that is dragged to say how big they are. One item, the
// fill item, takes what the others leave.
//
// The layout and what a drag does to it are Qt's `QQuickSplitView`, step by
// step: where a handle stops is not something to work out anew.
import { onCleanup } from "solid-js";
import { defineType, derived, effect, inside, instantiate, QtObject, slot } from "../../object.js";
import { Item } from "../Item.js";
import { LeftButton } from "../keycodes.js";
import { CancelGrabExclusive, cursorOf, gone, hoverable, receive, UngrabExclusive } from "../pointer.js";
import { settle } from "../settle.js";
import { containerOf, Container } from "./Container.js";
import { drive, driven, reads } from "./driven.js";
import { signal, untrack } from "#kernel";

const Horizontal = 1;
const SplitVCursor = 11;
const SplitHCursor = 12;

const NOTHING = Object.freeze({});
const next = (version) => version + 1;
const bound = (low, value, high) => Math.max(low, Math.min(high, value));

const isSplitView = (item) => Boolean(item?.$split);
const attachedOf = (item) => item.$attached?.SplitView;

// What an item says of its size in the view. Each is held as a number once
// it is said, and until then is `null`; one that was taken back (`= undefined`)
// is `undefined`, and reads -1 whatever it was before, as in Qt.
const UNSAID = {
  minimumWidth: 0,
  minimumHeight: 0,
  preferredWidth: -1,
  preferredHeight: -1,
  maximumWidth: Infinity,
  maximumHeight: Infinity,
};
const SIZES = Object.keys(UNSAID);
const HELD = Object.fromEntries(SIZES.map((name) => [name, reads(name)]));

const isSaid = (value) => typeof value === "number";
const said = (item, name) => {
  const attached = attachedOf(item);
  return attached ? HELD[name](attached) : null;
};

function minimum(item, across) {
  const value = said(item, across ? "minimumWidth" : "minimumHeight");
  return isSaid(value) ? value : 0;
}

// An item that says nothing is as long as it would like to be.
function preferred(item, across) {
  const value = said(item, across ? "preferredWidth" : "preferredHeight");
  return isSaid(value) ? value : across ? item.implicitWidth : item.implicitHeight;
}

function maximum(item, across) {
  const value = said(item, across ? "maximumWidth" : "maximumHeight");
  return isSaid(value) ? value : Infinity;
}

function fills(item, across) {
  const attached = attachedOf(item);
  return Boolean(attached && (across ? attached.fillWidth : attached.fillHeight));
}

const SplitViewAttached = defineType("SplitViewAttached", QtObject, {
  properties: {
    view: derived((self) => {
      const view = self.$of.$node ? containerOf(self.$of) : null;
      return isSplitView(view) ? view : null;
    }),
    minimumWidth: undefined,
    minimumHeight: undefined,
    preferredWidth: undefined,
    preferredHeight: undefined,
    maximumWidth: undefined,
    maximumHeight: undefined,
    fillWidth: false,
    fillHeight: false,
  },
  resolve: Object.fromEntries(
    SIZES.map((name) => [
      name,
      (self) => {
        const value = HELD[name](self);
        return value === null ? UNSAID[name] : (value ?? -1);
      },
    ]),
  ),
  setup(self, props) {
    const of = (self.$of = props.$attachee);
    for (const name of SIZES) driven(self, name, null);
    if (!of.$node) return console.warn("SplitView: attached properties can only be used on Items");
    const around = of.$parent;
    if (around && !isSplitView(around) && !isSplitView(around.$parent)) {
      return console.warn("SplitView: attached properties must be accessed through a direct child of SplitView");
    }
    // The view an item is in already lays it out by what is said from now.
    of.$objectModel?.$container?.$split?.bump(next);
  },
});

// An assignment is said even of what the property is already, and
// `undefined` takes it back.
for (const name of SIZES) {
  Object.defineProperty(SplitViewAttached.proto, name, {
    ...Object.getOwnPropertyDescriptor(SplitViewAttached.proto, name),
    set(value) {
      slot(this, name).write(value);
      if (typeof value !== "function") {
        this.$driven[name].seen = value;
        drive(this, name, value);
      }
      settle();
    },
  });
}

const SplitHandleAttached = defineType("SplitHandleAttached", QtObject, {
  properties: { hovered: false, pressed: false },
});

// `SplitHandle.hovered` and `SplitHandle.pressed`: what a handle's QML shows
// itself by.
export const SplitHandle = defineType("SplitHandle", QtObject, { attached: SplitHandleAttached });

const views = new WeakMap();

// A handle takes the press itself, whatever its QML is: Qt's view takes it
// from its children.
const handling = {
  $press(point) {
    if (!point.primary || point.button !== LeftButton) return false;
    const view = views.get(this);
    const taken = untrack(() => press(view, this, point.in(view)));
    settle();
    return taken;
  },
  $move(point) {
    if (point.exclusive !== this) return;
    const view = views.get(this);
    untrack(() => move(view, point.in(view)));
    settle();
  },
  $release(point) {
    if (point.exclusive !== this) return;
    release(views.get(this));
    settle();
  },
  $grab(transition) {
    if (transition !== CancelGrabExclusive && transition !== UngrabExclusive) return;
    release(views.get(this));
    settle();
  },
  // What it is over is not to be flicked by it.
  $keeps() {
    return true;
  },
  $hovers() {
    return untrack(() => views.get(this).hoverEnabled);
  },
  $hover(point, over) {
    slot(SplitHandle.attached(this), "hovered").write(over);
    settle();
  },
};

function make(self, component) {
  const state = self.$split;
  const made = instantiate(component, NOTHING, self, self.$owner);
  const handle = made.object;
  if (!handle?.$node) {
    made.dispose();
    return false;
  }
  views.set(handle, self);
  Object.assign(handle, handling);
  receive(handle);
  hoverable(1);
  handle.$node.style.touchAction = "none";
  state.handles.push(handle);
  state.made.push(made.dispose);
  state.at.push(0);
  self.$keep(handle, true);
  return true;
}

// The last handle goes: there is one for each item but the last.
function discard(self) {
  const state = self.$split;
  const handle = state.handles.pop();
  const dispose = state.made.pop();
  state.at.pop();
  gone(handle);
  hoverable(-1);
  self.$keep(handle, false);
  dispose();
}

function handles(self) {
  const state = self.$split;
  const component = self.handle ?? null;
  const count = component ? Math.max(0, self.$model.$objects.length - 1) : 0;
  const all = state.handles;
  if (component === state.component && all.length === count) return;
  // No handle that goes is held any more.
  if (component !== state.component || all.length > count) release(self);
  if (component !== state.component) while (all.length) discard(self);
  state.component = component;
  while (all.length > count) discard(self);
  while (all.length < count && make(self, component));
  state.bump(next);
}

// How long what is from one item to another is, with their handles: what a
// handle that is dragged cannot go into. The fill item gives all it has but
// the least it says it may be.
function accumulated(self, first, last, across) {
  const state = self.$split;
  const items = self.$model.$objects;
  let size = 0;
  for (let index = first; index <= last; index++) {
    const item = items[index];
    if (item.visible) {
      if (index !== state.fill) size += across ? item.width : item.height;
      else {
        const least = said(item, across ? "minimumWidth" : "minimumHeight");
        if (isSaid(least)) size += least;
      }
    }
    if ((index < last || last < items.length - 1) && state.shown[index]) size += state.thick[index];
  }
  return size;
}

// How long the item beside the pressed handle is where the mouse is now:
// the one before the handle, or the one after it when the fill item is
// before.
function pulled(self, before, size, across) {
  const state = self.$split;
  const { shown, thick, at, pressed } = state;
  const grip = thick[pressed];
  const to = bound(0, state.mouse, size) - (state.from - state.start);
  if (before) {
    let edge = 0;
    for (let index = pressed - 1; index >= 0; index--) {
      if (!shown[index]) continue;
      edge = at[index] + thick[index];
      break;
    }
    const stop = size - accumulated(self, state.after, self.$model.$objects.length - 1, across) - grip;
    return bound(Math.min(Math.max(edge, to), stop), to, stop) - edge;
  }
  const edge = state.after < state.handles.length ? at[state.after] : size;
  const stop = accumulated(self, 0, pressed, across) - grip;
  return edge - (bound(stop, to, Math.max(Math.min(edge - grip, to), stop)) + grip);
}

// Qt's `layout`, which goes by how big the view is, not by how big what is
// inside its padding is.
function layout(self) {
  const state = self.$split;
  const items = self.$model.$objects;
  const count = items.length;
  if (!count) return;
  const { shown, thick, at, sizes } = state;
  const all = state.handles;
  const across = self.orientation === Horizontal;
  const { width, height } = self;
  const size = across ? width : height;

  // The fill item is the first shown that says it is, or the last shown.
  let last = -1;
  let first = -1;
  for (let index = 0; index < count; index++) {
    if (!items[index].visible) continue;
    last = index;
    if (first < 0 && fills(items[index], across)) first = index;
  }
  if (state.refill || state.fill >= count) state.fill = first >= 0 ? first : last < 0 ? count - 1 : last;
  state.refill = false;
  const fill = state.fill;

  // A handle is after its item, and the last item shown has none.
  shown.length = thick.length = all.length;
  const cursor = cursorOf(across ? SplitHCursor : SplitVCursor);
  for (let index = 0; index < all.length; index++) {
    const handle = all[index];
    shown[index] = index !== last && items[index].visible;
    thick[index] = across ? handle.implicitWidth : handle.implicitHeight;
    slot(handle, "visible").place(shown[index]);
    slot(handle, "width").place(across ? thick[index] : width);
    slot(handle, "height").place(across ? height : thick[index]);
    handle.$node.style.cursor = cursor;
  }

  // Every item but the fill item is as long as it prefers, or as the drag
  // says, within what it may be.
  const before = fill > state.pressed;
  const target = state.pressed < 0 ? -1 : before ? state.pressed : state.after;
  let used = 0;
  let dragged = -1;
  for (let index = 0; index < count; index++) {
    const item = items[index];
    sizes[index] = 0;
    if (!item.visible) continue;
    let asked = 0;
    if (index === target) {
      dragged = index;
      asked = pulled(self, before, size, across);
    } else if (index !== fill) asked = preferred(item, across);
    if (index !== fill) {
      sizes[index] = bound(minimum(item, across), asked, maximum(item, across));
      used += sizes[index];
    }
    if (shown[index]) used += thick[index];
  }

  // The fill item has the rest.
  const filler = items[fill];
  if (filler.visible && dragged !== fill) {
    sizes[fill] = bound(minimum(filler, across), size - used, maximum(filler, across));
    used += sizes[fill];
  }

  // Too much is taken off the others, from the last, down to the least each
  // may be.
  let over = used - size;
  for (let index = count - 1; index >= 0 && over > 0; index--) {
    if (index === fill || !items[index].visible) continue;
    const less = Math.min(sizes[index] - minimum(items[index], across), over);
    sizes[index] -= less;
    over -= less;
  }

  let offset = 0;
  for (let index = 0; index < count; index++) {
    const item = items[index];
    if (!item.visible) continue;
    // What a drag made of an item is what it prefers from now on.
    if (index === dragged && index !== fill) {
      drive(SplitView.attached(item), across ? "preferredWidth" : "preferredHeight", sizes[index]);
    }
    slot(item, "width").place(across ? sizes[index] : width);
    slot(item, "height").place(across ? height : sizes[index]);
    slot(item, "x").place(across ? offset : 0);
    slot(item, "y").place(across ? 0 : offset);
    offset += sizes[index];
    if (index >= all.length) continue;
    at[index] = offset;
    slot(all[index], "x").place(across ? offset : 0);
    slot(all[index], "y").place(across ? 0 : offset);
    offset += thick[index];
  }
}

function press(self, handle, point) {
  const state = self.$split;
  const items = self.$model.$objects;
  const index = state.handles.indexOf(handle);
  let after = -1;
  for (let at = index + 1; at < items.length && after < 0; at++) if (items[at].visible) after = at;
  if (index < 0 || after < 0) return false;
  const across = self.orientation === Horizontal;
  state.pressed = index;
  state.after = after;
  state.from = state.mouse = across ? point.x : point.y;
  state.start = state.at[index];
  slot(SplitHandle.attached(handle), "pressed").write(true);
  slot(self, "resizing").write(true);
  return true;
}

function move(self, point) {
  const state = self.$split;
  if (state.pressed < 0) return;
  state.mouse = self.orientation === Horizontal ? point.x : point.y;
  layout(self);
}

function release(self) {
  const state = self.$split;
  if (state.pressed < 0) return;
  const handle = state.handles[state.pressed];
  state.pressed = state.after = -1;
  slot(SplitHandle.attached(handle), "pressed").write(false);
  slot(self, "resizing").write(false);
}

// Whether what the layout goes by is what it went by last: `seen` is that,
// in the order it is read.
function note(state, index, value) {
  if (Object.is(state.seen[index], value)) return;
  state.seen[index] = value;
  state.stale = true;
}

// Which item fills is found again when the items change, or which of them
// are shown, or when one says whether it fills the way the view goes: not
// when the view is turned, after which the one that filled still does.
function tell(state, index, value, counts) {
  if (state.told[index] === value) return;
  state.told[index] = value;
  if (counts) state.refill = state.stale = true;
}

function read(self) {
  const state = self.$split;
  const model = self.$model;
  state.version();
  model.$ordered();
  const across = self.orientation === Horizontal;
  let index = 0;
  let told = 0;
  note(state, index++, self.handle ?? null);
  note(state, index++, across);
  note(state, index++, self.width);
  note(state, index++, self.height);
  for (const item of model.$objects) {
    note(state, index++, item);
    note(state, index++, item.visible);
    note(state, index++, minimum(item, across));
    note(state, index++, preferred(item, across));
    note(state, index++, maximum(item, across));
    const attached = attachedOf(item);
    tell(state, told++, item, true);
    tell(state, told++, item.visible, true);
    tell(state, told++, Boolean(attached?.fillWidth), across);
    tell(state, told++, Boolean(attached?.fillHeight), !across);
  }
  if (state.told.length !== told) {
    state.told.length = told;
    state.refill = state.stale = true;
  }
  for (const handle of state.handles) {
    note(state, index++, handle);
    note(state, index++, across ? handle.implicitWidth : handle.implicitHeight);
  }
  if (state.seen.length !== index) {
    state.seen.length = index;
    state.stale = true;
  }
  if (state.stale) state.stamp++;
  state.stale = false;
  return state.stamp;
}

export const SplitView = defineType("SplitView", Container, {
  properties: {
    orientation: Horizontal,
    resizing: false,
    handle: null,
  },
  attached: SplitViewAttached,
  methods: {
    // The sizes the items prefer, which is what a drag changes, as text: Qt
    // gives bytes, and either is only for `restoreState`.
    saveState() {
      const state = [];
      const items = this.$model.$objects;
      untrack(() => {
        for (let index = 0; index < items.length; index++) {
          const width = said(items[index], "preferredWidth");
          const height = said(items[index], "preferredHeight");
          if (!isSaid(width) && !isSaid(height)) continue;
          const entry = { index };
          if (isSaid(width)) entry.preferredWidth = width;
          if (isSaid(height)) entry.preferredHeight = height;
          state.push(entry);
        }
      });
      return JSON.stringify(state);
    },
    restoreState(state) {
      if (typeof state !== "string" || state === "") return false;
      let entries;
      try {
        entries = JSON.parse(state);
      } catch (error) {
        console.warn(`SplitView: Error reading SplitView state: ${error.message}`);
        return false;
      }
      if (!Array.isArray(entries)) entries = [];
      const items = this.$model.$objects;
      if (entries.length > items.length) {
        console.warn(`SplitView: Error reading SplitView state: expected ${items.length} or less split items but got ${entries.length}`);
        return false;
      }
      for (const entry of entries) {
        const item = items[entry?.index];
        if (!item) continue;
        const attached = SplitView.attached(item);
        if ("preferredWidth" in entry) drive(attached, "preferredWidth", Number(entry.preferredWidth));
        if ("preferredHeight" in entry) drive(attached, "preferredHeight", Number(entry.preferredHeight));
      }
      settle();
      return true;
    },
  },
  setup(self, props) {
    const [version, bump] = signal(0, self.$owner);
    const state = (self.$split = {
      version,
      bump,
      // The handles, how to destroy each, and of each whether it is shown,
      // how thick it is and where it is along the view.
      component: null,
      handles: [],
      made: [],
      shown: [],
      thick: [],
      at: [],
      // How long the layout makes each item.
      sizes: [],
      // The item that fills, and whether it is to be found again: by what
      // was `told` of the items when it was last looked for.
      fill: -1,
      refill: true,
      told: [],
      // The handle that is dragged and the first item shown after it; where
      // the press was, where the mouse is, and where the handle was.
      pressed: -1,
      after: -1,
      from: 0,
      mouse: 0,
      start: 0,
      seen: [],
      stale: false,
      stamp: 0,
    });
    // The items are in a content item, the handles are the view's own
    // children over it.
    if (!("contentItem" in props)) slot(self, "contentItem").provide(inside(self, () => Item({})));
    onCleanup(() => {
      for (const handle of state.handles) {
        gone(handle);
        hoverable(-1);
      }
    });
    let done = 0;
    effect(
      () => read(self),
      (stamp) => {
        if (stamp === done) return;
        done = stamp;
        untrack(() => {
          handles(self);
          layout(self);
        });
      },
    );
  },
});

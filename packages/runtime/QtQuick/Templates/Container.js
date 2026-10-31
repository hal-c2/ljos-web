// Container: a control whose items are the rows of a model, `contentModel`,
// one of which is current. A style shows them with a view over that model
// (`ListView { model: control.contentModel }`), or with none: then they are
// the content item's children as they are. A container with no content item
// shows none of them, as in Qt.
import { contents, defineType, derived, effect, slot } from "../../object.js";
import { departing } from "../focus.js";
import { Item } from "../Item.js";
import { ObjectModel } from "../model.js";
import { settle } from "../settle.js";
import { Control } from "./Control.js";
import { assignable, drive, driven, reads } from "./driven.js";
import { untrack } from "#kernel";

const next = (version) => version + 1;

// Where a content item's children are: a Flickable's are in its content.
export const within = (item) => item?.$contentItem ?? item ?? null;

// Whether the content item shows the items itself: a view does, and so does
// a Repeater in it over the model, whose items are its parent's children.
export const shows = (item, model) =>
  item?.$v !== undefined || within(item)?.$static?.some((child) => child.$repeat && child.model === model) === true;

export function reparent(item, parent) {
  if (item.$parent === parent) return;
  item.$parent = parent;
  slot(item, "parent").changed();
  item.$touch(next);
}

const current = (self) => untrack(() => self.currentIndex);

// The container an item is in and its place there, for what is attached to
// the item: `TabBar.index`, `SwipeView.view`.
export function containerOf(item) {
  item.$track();
  return item.$objectModel?.$container ?? null;
}

export function indexOf(item) {
  item.$track();
  const model = item.$objectModel;
  if (!model?.$container) return -1;
  model.$ordered();
  return model.$objects.indexOf(item);
}

// `keep` is for an item that comes where it was declared, a Repeater's: the
// current item is the one it was. Otherwise only a view that shows the items
// keeps its current item, and is followed.
function insert(self, index, item, keep) {
  if (!self.$isContent(item)) return;
  const model = self.$model;
  const first = !model.$objects.length;
  const index$ = current(self);
  reparent(item, within(untrack(() => self.contentItem)));
  self.$adding?.(item);
  model.insert(index, item);
  if (first && index$ === -1) drive(self, "currentIndex", index);
  else if (keep && index <= index$) drive(self, "currentIndex", index$ + 1);
  settle();
}

function move(self, from, to) {
  const index = current(self);
  self.$model.move(from, to);
  // The current item is the same one, wherever it is now.
  if (from === index) drive(self, "currentIndex", to);
  else if (from < index && to >= index) drive(self, "currentIndex", index - 1);
  else if (from > index && to <= index) drive(self, "currentIndex", index + 1);
  settle();
}

function remove(self, index) {
  const model = self.$model;
  const objects = model.$objects;
  const item = objects[index];
  const index$ = current(self);
  // Without the current item, the one before it is: a view is told before
  // the item goes, or it would take the one after.
  if (index === index$ && (index !== 0 || objects.length === 1)) {
    drive(self, "currentIndex", index$ - 1);
    settle();
  }
  // The keys are no more the item's: they stay with what it was in.
  departing(item);
  model.remove(index);
  if (index < index$) drive(self, "currentIndex", index$ - 1);
  const housed = self.$items.housed;
  housed.get(item)?.$remove(item);
  housed.delete(item);
  self.$items.repeated.delete(item);
  reparent(item, null);
  settle();
  return item;
}

// The items are children of the content item. A view makes them that as it
// comes to show them; with none it is done here. `housed` is where each was
// put: a menu keeps its items so too.
export function house(housed, objects, into, viewed) {
  for (const [item, where] of housed) {
    if (where === into && !viewed && objects.includes(item)) continue;
    where.$remove(item);
    housed.delete(item);
  }
  if (!into) return;
  for (const item of objects) {
    reparent(item, into);
    if (viewed || housed.has(item)) continue;
    into.$add(item);
    housed.set(item, into);
  }
}

// A Repeater declared in a container: its items are the container's, where
// the Repeater stands among what was declared. `state` is what was declared
// and which of the items are a Repeater's.
export function repeat(state, objects, insert, remove) {
  const wanted = [];
  const made = new Set();
  for (const entry of state.declared) {
    if (!entry.$siblings) {
      wanted.push(entry);
      continue;
    }
    for (const item of entry.$siblings()) {
      wanted.push(item);
      made.add(item);
    }
  }
  for (const item of [...state.repeated]) {
    if (made.has(item)) continue;
    const index = objects.indexOf(item);
    if (index >= 0) remove(index);
    state.repeated.delete(item);
  }
  let at = -1;
  for (const item of wanted) {
    const index = objects.indexOf(item);
    if (index >= 0) at = index;
    else if (made.has(item) && !state.repeated.has(item)) {
      state.repeated.add(item);
      insert(++at, item);
    }
  }
}

export const Container = defineType("Container", Control, {
  properties: {
    count: derived((self) => self.$model.count),
    currentIndex: undefined,
    currentItem: derived((self) => {
      const model = self.$model;
      model.$ordered();
      return model.$objects[self.currentIndex] ?? null;
    }),
    contentWidth: derived((self) => self.$contentWidth()),
    contentHeight: derived((self) => self.$contentHeight()),
    implicitContentWidth: derived((self) => self.contentWidth),
    implicitContentHeight: derived((self) => self.contentHeight),
    contentChildren: derived((self) => {
      const model = self.$model;
      model.$ordered();
      return model.$objects.slice();
    }),
    contentData: derived((self) => [...self.$items.data, ...self.contentChildren]),
  },
  resolve: { currentIndex: reads("currentIndex") },
  methods: {
    get contentModel() {
      return this.$model;
    },
    itemAt(index) {
      return this.$model.$objects[index] ?? null;
    },
    addItem(item) {
      this.insertItem(this.$model.$objects.length, item);
    },
    // One that is in it already is moved.
    insertItem(index, item) {
      if (!item?.$node) return;
      const objects = this.$model.$objects;
      if (!(index >= 0 && index <= objects.length)) index = objects.length;
      const from = objects.indexOf(item);
      if (from < 0) return insert(this, index, item);
      if (from < index) index--;
      if (from !== index) move(this, from, index);
    },
    moveItem(from, to) {
      const count = this.$model.$objects.length;
      if (!(from >= 0 && from < count)) return;
      if (!(to >= 0 && to < count)) to = count - 1;
      if (from !== to) move(this, from, to);
    },
    // Qt 5 removed by index, and Qt 6 still takes one.
    removeItem(item) {
      const index = typeof item === "number" ? item : this.$model.$objects.indexOf(item);
      if (index >= 0 && index < this.$model.$objects.length) remove(this, index);
    },
    takeItem(index) {
      return index >= 0 && index < this.$model.$objects.length ? remove(this, index) : null;
    },
    setCurrentIndex(index) {
      drive(this, "currentIndex", index);
      settle();
    },
    incrementCurrentIndex() {
      const index = current(this);
      if (index < this.$model.$objects.length - 1) this.setCurrentIndex(index + 1);
    },
    decrementCurrentIndex() {
      const index = current(this);
      if (index > 0) this.setCurrentIndex(index - 1);
    },
    // Which items are the container's own: a tab bar's are its buttons.
    $isContent() {
      return true;
    },
    // The item that shows what is declared in it: a menu bar has one for
    // each menu.
    $itemFor(child) {
      return child;
    },
    // What the content would like to be.
    $contentWidth() {
      return this.contentItem?.implicitWidth ?? 0;
    },
    $contentHeight() {
      return this.contentItem?.implicitHeight ?? 0;
    },
    // An item given to the container once it is made is one of its items;
    // the background and the content item are its children.
    $add(item) {
      if (item?.$node && !item.$siblings && this.$isContent(item)) this.addItem(item);
    },
    $remove(item) {
      const index = this.$model.$objects.indexOf(item);
      if (index >= 0) remove(this, index);
      else Item.proto.$remove.call(this, item);
    },
    $keep(item, keep) {
      if (!keep) return Item.proto.$remove.call(this, item);
      if (item.$parent !== this) slot(item, "parent").write(this);
      Item.proto.$add.call(this, item);
    },
  },
  setup(self) {
    const model = (self.$model = untrack(() => ObjectModel({})));
    model.$container = self;
    self.$items = { data: [], declared: [], repeated: new Set(), housed: new Map() };
    driven(self, "currentIndex", -1);
    effect(
      () => {
        const item = self.contentItem;
        model.$ordered();
        return [within(item), shows(item, model)];
      },
      ([into, viewed]) => house(self.$items.housed, model.$objects, into, viewed),
    );
    // A view moves its current index itself: when it is flicked, and to
    // keep its current item when rows come and go. The container follows.
    let view = null;
    let seen;
    effect(
      () => {
        const item = self.contentItem;
        return [item, item && "currentIndex" in item ? item.currentIndex : undefined];
      },
      ([item, index]) => {
        const same = item === view;
        const changed = index !== seen;
        view = item;
        seen = index;
        if (same && changed && index !== undefined) drive(self, "currentIndex", index);
      },
    );
    // And having moved it, the view's index is its own, not the binding a
    // style gave it (`currentIndex: control.currentIndex`), which is put
    // back where it says the same.
    effect(
      () => [self.contentItem, self.currentIndex],
      ([item, index]) => {
        const held = item && "currentIndex" in item ? slot(item, "currentIndex") : null;
        if (held?.assigned && held.bound && untrack(held.bound) === index) held.reset();
      },
    );
  },
  adopt(self, props) {
    const state = self.$items;
    const model = self.$model;
    for (const declared of contents(props, self)) {
      const child = self.$itemFor(declared);
      if (child?.$siblings) state.declared.push(child);
      else if (child?.$node) {
        if (self.$isContent(child)) {
          child.$objectModel = model;
          model.$objects.push(child);
          state.declared.push(child);
        } else {
          // An item that is not one of the container's is nobody's.
          reparent(child, null);
        }
        continue;
      }
      state.data.push(child);
    }
    slot(model, "count").write(model.$objects.length);
    // The first of the items is current, until the QML says which is.
    if (model.$objects.length) drive(self, "currentIndex", 0);
    if (!state.declared.some((child) => child.$siblings)) return;
    effect(
      () => {
        for (const child of state.declared) child.$siblings?.();
        return state.declared.length;
      },
      () =>
        untrack(() =>
          repeat(
            state,
            model.$objects,
            (index, item) => insert(self, index, item, true),
            (index) => remove(self, index),
          ),
        ),
    );
  },
});

assignable(Container, "currentIndex");

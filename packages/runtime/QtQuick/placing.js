// What positioners and layouts share: what an item said about itself before
// anything placed it, and whether it takes part at all.
import { createSignal, getObserver, runWithOwner } from "solid-js";
import { version, WASM } from "#kernel";
import { looped, slot } from "../object.js";

const WRITABLE = { ownedWrite: true };
const next = (version) => version + 1;
const whole = (result) => result;

// What an object works out from its children, which one of them may ask for
// while it is being worked out: `width: parent.width` in a Column that is as
// wide as its children. Read through the memo, the two would wait for each
// other. That reader gets the last result instead, and is run again once
// there is a new one: Qt lays out again after a polish in the same way.
//
// `part` is what of the result an early reader sees, for a result that is
// more than that: a layout's sizes, of everything it measured.
export class Settling {
  constructor(self, compute, initial, part = whole) {
    this.self = self;
    this.compute = compute;
    this.part = part;
    this.last = initial;
    this.told = part(initial);
    this.running = false;
    this.memo = null;
    this.readers = null;
    this.track = null;
    this.bump = null;
  }

  // Whether what is reading now reads from inside the computation, as it
  // does every time once it has.
  early() {
    // On the wasm kernel the graph's own reader is not Solid's observer:
    // whoever reads while it runs follows the result, and is run again
    // when there is a new one.
    if (WASM) {
      if (!this.running) return false;
      if (!this.track) [this.track, this.bump] = version(this.self.$owner);
      this.track();
      return true;
    }
    const reader = getObserver();
    if (!this.running && !(reader && this.readers?.has(reader))) return false;
    if (reader) {
      (this.readers ??= new WeakSet()).add(reader);
      if (!this.track) [this.track, this.bump] = runWithOwner(this.self.$owner, () => createSignal(0, WRITABLE));
      this.track();
    }
    return true;
  }

  read() {
    if (this.early()) return this.last;
    this.memo ??= looped(this.self.$owner, () => {
      this.running = true;
      try {
        this.last = this.compute(this.self, this.last);
      } finally {
        this.running = false;
      }
      return this.last;
    });
    return this.memo();
  }

  // From an effect's apply, when the result was used: those who read it
  // early are told of a new one.
  settle() {
    const result = this.part(this.last);
    if (this.told === result) return;
    this.told = result;
    this.bump?.(next);
  }
}

// What a property was assigned, bound or given, under what was placed over
// it: a Column moves an item from the `x` it has, a layout prefers the
// `width` it was declared with. Undefined when nothing set it.
export function given(item, name) {
  const property = slot(item, name);
  property.explicit();
  if (property.assigned) return property.value;
  return property.bound ? property.bound() : property.given;
}

// Whether the item itself is visible. One that an ancestor hides keeps its
// place, as in Qt: only its own `visible` takes it out.
export function shown(item) {
  const visible = slot(item, "visible");
  visible.explicit();
  return Boolean(visible.own());
}

// Whether a size is one the item was given, by itself, by its anchors or by
// what places it, rather than its implicit one. Qt's `widthValid`.
export function sized(item, name) {
  const size = slot(item, name);
  if (size.explicit() || size.placed !== undefined) return true;
  const anchors = item.anchors;
  if (anchors.fill) return true;
  return name === "width" ? Boolean(anchors.left && anchors.right) : Boolean(anchors.top && anchors.bottom);
}

// Hides an item and what is in it without touching `visible`, which stays
// what its QML says. Qt culls what a positioner leaves out the same way.
export function cull(item, culled) {
  if (Boolean(item.$culled) === culled) return;
  item.$culled = culled;
  item.$node.style.visibility = culled ? "hidden" : "";
}

export function alike(a, b) {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return false;
  return true;
}

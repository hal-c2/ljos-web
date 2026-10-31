// What a scroll bar and a scroll indicator share: a handle in a groove that
// says how much of some content is seen and from where, as fractions of it,
// and the attached object that makes one follow a Flickable.
import { derived, effect, slot } from "../../object.js";
import { assignable, drive, driven, reads } from "./driven.js";
import { untrack } from "#kernel";

export const Horizontal = 1;
export const Vertical = 2;

// Qt's `qFuzzyCompare`.
export const same = (a, b) => Math.abs(a - b) * 1e12 <= Math.min(Math.abs(a), Math.abs(b));

// Qt's `visualArea`: where the handle is and how long, which is not what
// `position` and `size` say when the handle may be no shorter than
// `minimumSize`, or when the content was dragged past its end. A bar's
// handle that fills the groove stays where it is.
function start(self) {
  const { position, size, minimumSize } = self;
  if (minimumSize > size && !(self.$bar && size === 1)) return (position / (1 - size)) * (1 - minimumSize);
  return position;
}

function visualSize(self) {
  const { size, minimumSize } = self;
  const at = start(self);
  return Math.max(minimumSize, Math.min(Math.max(size, minimumSize) + Math.min(0, at), Math.max(0, 1 - at)));
}

function visualPosition(self) {
  return Math.max(0, Math.min(start(self), Math.max(0, 1 - visualSize(self))));
}

// `size`, `position` and `active` are the type's to change and the QML's
// to bind.
export const properties = {
  size: undefined,
  position: undefined,
  active: undefined,
  orientation: Vertical,
  horizontal: derived((self) => self.orientation === Horizontal),
  vertical: derived((self) => self.orientation === Vertical),
  minimumSize: 0,
  visualSize: derived(visualSize),
  visualPosition: derived(visualPosition),
};

export const resolve = { size: reads("size"), position: reads("position"), active: reads("active") };

// The handle is the content item, put along the groove inside the padding.
export function inside() {
  const { leftPadding: x, topPadding: y, availableWidth: width, availableHeight: height, visualPosition: at, visualSize: size } = this;
  return this.orientation === Horizontal ? [x + at * width, y, width * size, height] : [x, y + at * height, width, height * size];
}

export function setup(self) {
  driven(self, "size", 0);
  driven(self, "position", 0);
  driven(self, "active", false);
  // A handle that grows past the end is moved back to where it ends there.
  let seen;
  effect(
    () => self.size,
    (size) => {
      if (size === seen) return;
      const first = seen === undefined;
      seen = size;
      if (!first && size + untrack(() => self.position) > 1) drive(self, "position", 1 - size);
    },
  );
}

export function assignables(Type) {
  for (const name of ["size", "position", "active"]) assignable(Type, name);
}

export function setPosition(self, position) {
  if (Number.isFinite(position) && !same(position, untrack(() => self.position))) drive(self, "position", position);
}

// The bar is as long as the Flickable it is in, along the edge it is for:
// Qt's `layoutHorizontal` and `layoutVertical`. `move` is whether it is put
// at the edge too.
function layout(bar, across, long, wide, move, indicator) {
  slot(bar, across ? "width" : "height").provide(long);
  if (!move) return;
  if (across) return slot(bar, "y").provide(wide - bar.height);
  if (!bar.mirrored) slot(bar, "x").provide(wide - bar.width);
  else if (!indicator) slot(bar, "x").provide(0);
}

// One bar of an attached object: `horizontal` or `vertical`. It is made a
// child of what it is attached to unless it has a parent, and takes its
// size and position from the Flickable's `visibleArea`. `flickable()` is
// the Flickable, which a ScrollView's bars get from the view; `moves(bar,
// moving)` is what the bar does when the Flickable starts and stops moving.
export function follows(self, name, flickable, moves, indicator) {
  const across = name === "horizontal";
  const state = { bar: null, target: null, into: null, size: 0, position: 0, moving: false, long: 0, wide: 0, thick: 0 };
  effect(
    () => {
      const bar = self[name];
      const target = flickable();
      if (!bar || !target) return [bar, target];
      const area = target.visibleArea;
      return across
        ? [bar, target, area.widthRatio, area.xPosition, target.movingHorizontally, target.width, target.height, bar.implicitHeight]
        : [bar, target, area.heightRatio, area.yPosition, target.movingVertically, target.height, target.width, bar.implicitWidth];
    },
    ([bar, target, size, position, moving, long, wide, thick]) =>
      untrack(() => {
        const fresh = bar !== state.bar || target !== state.target;
        if (bar !== state.bar) {
          state.into?.$remove(state.bar);
          state.bar = bar;
          state.into = null;
          if (bar) {
            const into = bar.parent ?? self.$of;
            if (!bar.parent) slot(bar, "parent").write(into);
            if (!into.children.includes(bar)) {
              into.$add(bar);
              state.into = into;
            }
            slot(bar, "orientation").provide(across ? Horizontal : Vertical);
          }
        }
        state.target = target;
        if (!bar || !target) return;
        // A bar beside the Flickable, as a ScrollView's is, is over it.
        if (fresh && state.into && state.into === target.parent) {
          state.into.$remove(bar);
          state.into.$add(bar);
        }
        if (bar.parent === target) {
          const resized = long !== state.long || wide !== state.wide;
          if (fresh || thick !== state.thick) layout(bar, across, long, wide, true, indicator);
          else if (resized && (across ? bar.height : bar.width) > 0) {
            const at = across ? bar.y : bar.x;
            const edge = state.wide - (across ? bar.height : bar.width);
            layout(bar, across, long, wide, Math.abs(at) < 1e-12 || same(at, edge), indicator);
          }
        }
        state.long = long;
        state.wide = wide;
        state.thick = thick;
        if (fresh || size !== state.size) drive(bar, "size", (state.size = size));
        if (fresh || position !== state.position) setPosition(bar, (state.position = position));
        if (moving !== state.moving) moves(bar, (state.moving = moving));
      }),
  );
}

// Slider: a value between `from` and `to`, chosen by dragging a handle
// along a groove, by the arrow keys or by the wheel. `position` is where the
// handle is, from 0 to 1: a style puts the handle there.
import { defineType, derived, effect, settle, slot } from "../../object.js";
import { styleHints } from "../../QtQml/application.js";
import { Key, LeftButton } from "../keycodes.js";
import { Control, keeps, loose, put } from "./Control.js";
import { untrack } from "#kernel";

export const Horizontal = 1;
export const Vertical = 2;

export const SnapMode = { NoSnap: 0, SnapAlways: 1, SnapOnRelease: 2 };

// Qt's `qFuzzyCompare`, `qFuzzyIsNull` and `qRound`: what it takes for the
// same, for nothing and for the nearest whole number.
export const close = (a, b) => Math.abs(a - b) * 1e12 <= Math.min(Math.abs(a), Math.abs(b));
export const nothing = (value) => Math.abs(value) <= 1e-12;
export const round = (value) => (value >= 0 ? Math.floor(value + 0.5) : Math.ceil(value - 0.5));
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export const now = (self, name) => untrack(() => self[name]);

// A value kept between `from` and `to`, whichever is the greater.
export function bounded(self, value) {
  const from = now(self, "from");
  const to = now(self, "to");
  return from > to ? clamp(value, to, from) : clamp(value, from, to);
}

// A value is fitted to its ends as it is read, so that one assigned out of
// range is never seen; what it was fitted to is then written, and stays
// when the ends move away again.
export function keep(self, name, value) {
  const held = slot(self, name);
  if (!Object.is(untrack(() => held.own()), value)) held.write(value);
}

// What a value assigned is read as, `mine` being what the control holds of
// its own: as it was given until the ends are known, as Qt has it until the
// component is complete, and what it was when it is as good as that.
export function fitted(self, mine, value) {
  if (mine?.from === undefined) return value;
  const from = self.from;
  const to = self.to;
  value = from > to ? clamp(value, to, from) : clamp(value, from, to);
  return close(mine.value, value) ? mine.value : value;
}

// The value at a position for a dial and a range slider, which do not step
// it: whole when the ends and the step are.
export function scaled(self, position) {
  const from = now(self, "from");
  const to = now(self, "to");
  const size = now(self, "stepSize");
  const value = from + (to - from) * position;
  return size !== 0 && [from, to, size].every(Number.isInteger) ? round(value) : value;
}

// The position of the nearest step.
export function snapPosition(self, position) {
  const range = now(self, "to") - now(self, "from");
  if (nothing(range)) return position;
  const step = now(self, "stepSize") / range;
  return nothing(step) ? position : round(position / step) * step;
}

// Where along the slider a point of it is, the handle's middle being under
// the pointer: not kept between 0 and 1.
export function along(self, handle, x, y) {
  return untrack(() => {
    if (self.orientation === Horizontal) {
      const size = handle?.width ?? 0;
      const extent = self.availableWidth - size;
      if (nothing(extent)) return 0;
      if (self.mirrored) return (self.width - x - self.rightPadding - size / 2) / extent;
      return (x - self.leftPadding - size / 2) / extent;
    }
    const size = handle?.height ?? 0;
    const extent = self.availableHeight - size;
    return nothing(extent) ? 0 : (self.height - y - self.bottomPadding - size / 2) / extent;
  });
}

// What a step is when the slider has none.
export const step = (self) => (nothing(now(self, "stepSize")) ? 0.1 : now(self, "stepSize"));

// How far the wheel turned, in notches.
export const notches = (turn) =>
  (Math.abs(turn.angleY) < Math.abs(turn.angleX) ? turn.angleX : turn.inverted ? -turn.angleY : turn.angleY) / 120;

// Whether a finger has gone far enough along the slider to be dragging it,
// and not the page.
export function dragged(self, from, x, y) {
  const given = now(self, "touchDragThreshold");
  const threshold = given < 0 ? styleHints().startDragDistance : Math.round(given);
  return Math.abs(now(self, "orientation") === Horizontal ? x - from.x : y - from.y) > threshold;
}

function setPosition(self, position) {
  const mine = self.$slider;
  position = clamp(position, 0, 1);
  if (close(mine.position, position)) return;
  mine.position = position;
  put(self, "position", position);
}

function updatePosition(self) {
  const mine = self.$slider;
  const from = now(self, "from");
  const to = now(self, "to");
  setPosition(self, close(from, to) ? 0 : (mine.value - from) / (to - from));
}

// Qt's `setValue`. Whether it changed.
function setValue(self, value) {
  const mine = self.$slider;
  value = bounded(self, value);
  if (nothing(value)) value = 0;
  const same = close(mine.value, value);
  if (!same) mine.value = value;
  keep(self, "value", mine.value);
  if (!same) updatePosition(self);
  return !same;
}

function positionAt(self, x, y) {
  return clamp(along(self, now(self, "handle"), x, y), 0, 1);
}

function move(self, x, y) {
  const mine = self.$slider;
  const before = mine.position;
  const snap = now(self, "snapMode");
  const live = now(self, "live");
  let position = positionAt(self, x, y);
  if (snap === SnapMode.SnapAlways) position = snapPosition(self, position);
  if (live) setValue(self, self.valueAt(position));
  if (!live || snap !== SnapMode.SnapAlways) setPosition(self, position);
  settle();
  if (!close(position, before)) self.moved();
}

export const Slider = defineType("Slider", Control, {
  properties: {
    from: 0,
    to: 1,
    value: 0,
    position: 0,
    visualPosition: derived((self) => (self.orientation === Vertical || self.mirrored ? 1 - self.position : self.position)),
    stepSize: 0,
    snapMode: SnapMode.NoSnap,
    pressed: false,
    orientation: Horizontal,
    horizontal: derived((self) => self.orientation === Horizontal),
    vertical: derived((self) => self.orientation === Vertical),
    handle: null,
    implicitHandleWidth: derived((self) => self.handle?.implicitWidth ?? 0),
    implicitHandleHeight: derived((self) => self.handle?.implicitHeight ?? 0),
    live: true,
    touchDragThreshold: -1,
    focusPolicy: 11,
  },
  enums: SnapMode,
  signals: ["moved"],
  resolve: { value: (self, own) => fitted(self, self.$slider, own()) },
  methods: {
    $accepts: LeftButton,
    valueAt(position) {
      const from = now(this, "from");
      const value = (now(this, "to") - from) * position;
      const size = now(this, "stepSize");
      return nothing(size) ? from + value : from + round(value / size) * size;
    },
    increase() {
      setValue(this, this.$slider.value + step(this));
      settle();
    },
    decrease() {
      setValue(this, this.$slider.value - step(this));
      settle();
    },
    // The mouse takes the handle to where it is pressed; a finger has to
    // move along the slider first.
    $handlePress(x, y, point) {
      const mine = this.$slider;
      mine.x = x;
      mine.y = y;
      mine.dragging = point?.type !== "touch";
      // Pressed before it has moved: what hears of both hears of this first.
      if (put(this, "pressed", true)) settle();
      if (mine.dragging) move(this, x, y);
    },
    $handleMove(x, y) {
      const mine = this.$slider;
      mine.dragging ||= dragged(this, mine, x, y);
      if (mine.dragging) move(this, x, y);
    },
    $handleRelease(x, y) {
      const mine = this.$slider;
      const before = mine.position;
      const snap = now(this, "snapMode");
      let position = positionAt(this, x, y);
      if (snap !== SnapMode.NoSnap) position = snapPosition(this, position);
      const value = this.valueAt(position);
      if (!close(value, mine.value)) setValue(this, value);
      else if (snap !== SnapMode.NoSnap) setPosition(this, position);
      settle();
      if (!close(position, before)) this.moved();
      mine.dragging = false;
      put(this, "pressed", false);
    },
    $handleUngrab() {
      this.$slider.dragging = false;
      put(this, "pressed", false);
    },
    // A mouse that drags it is its own: nothing around takes the drag.
    $keeps() {
      return this.$slider.dragging;
    },
    $keyPressed(event) {
      const mine = this.$slider;
      const before = mine.value;
      const horizontal = now(this, "orientation") === Horizontal;
      const up = horizontal ? (now(this, "mirrored") ? Key.Key_Left : Key.Key_Right) : Key.Key_Up;
      const down = horizontal ? (now(this, "mirrored") ? Key.Key_Right : Key.Key_Left) : Key.Key_Down;
      if (event.key !== up && event.key !== down) return;
      if (put(this, "pressed", true)) settle();
      setValue(this, mine.value + (event.key === up ? step(this) : -step(this)));
      event.accepted = true;
      settle();
      if (!close(mine.value, before)) this.moved();
    },
    // Any key let go: the slider is pressed no longer.
    $keyReleased() {
      if (put(this, "pressed", false)) settle();
    },
    $wheel(turn) {
      if (!now(this, "wheelEnabled")) return false;
      const mine = this.$slider;
      const before = mine.value;
      setValue(this, before + step(this) * notches(turn));
      settle();
      if (!close(mine.value, before)) this.moved();
      return true;
    },
  },
  setup(self) {
    const mine = (self.$slider = { value: 0, position: 0, from: undefined, to: undefined, x: 0, y: 0, dragging: false });
    loose(self, "value");
    keeps(self, () => [self.handle]);
    // A finger on it drags the handle, not the page.
    self.$node.style.touchAction = "none";
    // `value` assigned or bound from outside, and the ends it is kept
    // between: what it was given at first is fitted once all three are
    // known.
    effect(
      () => [self.value, self.from, self.to],
      ([value, from, to]) => {
        const ends = from !== mine.from || to !== mine.to;
        mine.from = from;
        mine.to = to;
        untrack(() => {
          setValue(self, value);
          if (ends) updatePosition(self);
        });
      },
    );
  },
});

// RangeSlider: two values between `from` and `to`, each with a handle on
// the same groove. `first` and `second` are objects with what a slider has
// for its one handle; the first never passes the second.
import { defineType, derived, effect, QtObject, settle, slot } from "../../object.js";
import { forceActiveFocus, MouseFocusReason, windowOf } from "../focus.js";
import { Key, LeftButton } from "../keycodes.js";
import { Control, keeps, loose, put } from "./Control.js";
import { along, clamp, close, dragged, Horizontal, keep, nothing, now, round, scaled, SnapMode, snapPosition, step, Vertical } from "./Slider.js";
import { untrack } from "#kernel";
import { speaks } from "../Accessible.js";

const other = (node) => (node.$range.first ? node.$range.slider.$slider.second : node.$range.slider.$slider.first);

// Where the handle is: not past the other one, unless both are being put.
function setPosition(node, position, alone) {
  const mine = node.$range;
  const first = mine.first;
  const low = first || alone ? 0 : Math.max(0, other(node).$range.position);
  const high = !first || alone ? 1 : Math.min(1, other(node).$range.position);
  position = clamp(position, low, high);
  if (close(mine.position, position)) return;
  mine.position = position;
  put(node, "position", position);
}

function updatePosition(node, alone) {
  const mine = node.$range;
  const from = now(mine.slider, "from");
  const to = now(mine.slider, "to");
  setPosition(node, close(from, to) ? 0 : (mine.value - from) / (to - from), alone);
}

// A handle's value between the ends, and not past the other's: what it was
// when it is as good as that.
function fit(node, value, from, to) {
  const mine = node.$range;
  const beyond = other(node).$range.value;
  value = clamp(value, Math.min(from, to), Math.max(from, to));
  if (mine.first === from > to ? value < beyond : value > beyond) value = beyond;
  return close(mine.value, value) ? mine.value : value;
}

// Qt's `setValue` of a handle.
function setValue(node, value) {
  const mine = node.$range;
  value = fit(node, value, now(mine.slider, "from"), now(mine.slider, "to"));
  const same = value === mine.value;
  mine.value = value;
  keep(node, "value", value);
  if (!same) updatePosition(node);
}

const RangeSliderNode = defineType("RangeSliderNode", QtObject, {
  properties: {
    value: 0,
    position: 0,
    visualPosition: derived((self) => {
      const slider = self.$range.slider;
      return slider.orientation === Vertical || slider.mirrored ? 1 - self.position : self.position;
    }),
    handle: null,
    pressed: false,
    hovered: false,
    implicitHandleWidth: derived((self) => self.handle?.implicitWidth ?? 0),
    implicitHandleHeight: derived((self) => self.handle?.implicitHeight ?? 0),
  },
  signals: ["moved"],
  // Fitted as it is read, once the slider has fitted the two together: one
  // assigned past the other is never seen.
  resolve: {
    value(self, own) {
      const slider = self.$range.slider;
      return slider.$slider?.from === undefined ? own() : fit(self, own(), slider.from, slider.to);
    },
  },
  methods: {
    increase() {
      setValue(this, this.$range.value + step(this.$range.slider));
      settle();
    },
    decrease() {
      setValue(this, this.$range.value - step(this.$range.slider));
      settle();
    },
  },
  setup(self, props) {
    self.$range = { slider: props.$slider, first: props.$first, value: props.$first ? 0 : 1, position: 0 };
    loose(self, "value");
  },
});

// What the slider is given for a handle (`first.value`, `first.handle`,
// `first.onMoved`) is what the handle's object is given.
function node(self, props, name) {
  const first = name === "first";
  const prefix = `${name}$`;
  const given = { $slider: self, $first: first };
  for (const key of Object.keys(props)) {
    if (key.startsWith(prefix)) Object.defineProperty(given, key.slice(prefix.length), Object.getOwnPropertyDescriptor(props, key));
  }
  if (!first && !("value" in given)) given.value = 1;
  return RangeSliderNode(given);
}

const hit = (self, handle, x, y) => Boolean(handle) && untrack(() => handle.contains(self.mapToItem(handle, x, y)));

// The handle a press is for: the one under it, else the nearer.
function pressedAt(self, x, y) {
  const { first, second } = self.$slider;
  const one = now(first, "handle");
  const two = now(second, "handle");
  const onOne = !now(first, "pressed") && hit(self, one, x, y);
  const onTwo = !now(second, "pressed") && hit(self, two, x, y);
  if (onOne && onTwo) return now(one, "z") > now(two, "z") ? first : second;
  if (onOne) return first;
  if (onTwo) return second;
  const at = along(self, one, x, y);
  const near = Math.abs(at - first.$range.position);
  const far = Math.abs(along(self, two, x, y) - second.$range.position);
  // As near to both: the one on the side of the press.
  if (close(near, far)) {
    const before = now(self, "from") > now(self, "to") ? at > first.$range.position : at < first.$range.position;
    return before ? first : second;
  }
  return near < far ? first : second;
}

const held = (self) => {
  const { first, second } = self.$slider;
  return now(first, "pressed") ? first : now(second, "pressed") ? second : null;
};

function move(self, x, y) {
  const pressed = held(self);
  if (!pressed) return;
  const before = pressed.$range.position;
  let position = along(self, now(pressed, "handle"), x, y);
  if (now(self, "snapMode") === SnapMode.SnapAlways) position = snapPosition(self, position);
  if (now(self, "live")) setValue(pressed, scaled(self, position));
  else setPosition(pressed, position);
  settle();
  if (!close(pressed.$range.position, before)) pressed.moved();
}

function release(self) {
  const { first, second } = self.$slider;
  self.$slider.dragging = false;
  put(first, "pressed", false);
  put(second, "pressed", false);
}

// The handle with focus: the one the keys move.
function focused(self) {
  const { first, second } = self.$slider;
  if (now(first, "handle")?.$active) return first;
  return now(second, "handle")?.$active ? second : null;
}

export const RangeSlider = defineType("RangeSlider", Control, {
  properties: {
    from: 0,
    to: 1,
    first: null,
    second: null,
    stepSize: 0,
    snapMode: SnapMode.NoSnap,
    orientation: Horizontal,
    live: true,
    horizontal: derived((self) => self.orientation === Horizontal),
    vertical: derived((self) => self.orientation === Vertical),
    touchDragThreshold: -1,
    focusPolicy: 11,
  },
  enums: SnapMode,
  methods: {
    $accepts: LeftButton,
    // The handles settle between them which has focus.
    $focusScope: true,
    // Both values at once: assigned one after the other, the first would be
    // held back by what the second still is.
    setValues(firstValue, secondValue) {
      const { first, second } = this.$slider;
      const from = now(this, "from");
      const to = now(this, "to");
      firstValue = clamp(firstValue, Math.min(from, to), Math.max(from, to));
      secondValue = clamp(secondValue, Math.min(from, to), Math.max(from, to));
      if (from > to) secondValue = Math.min(secondValue, firstValue);
      else firstValue = Math.min(firstValue, secondValue);
      first.$range.value = firstValue;
      second.$range.value = secondValue;
      keep(first, "value", firstValue);
      keep(second, "value", secondValue);
      updatePosition(first, true);
      updatePosition(second);
      settle();
    },
    valueAt(position) {
      const from = now(this, "from");
      const value = (now(this, "to") - from) * position;
      const size = now(this, "stepSize");
      return nothing(size) ? from + value : from + round(value / size) * size;
    },
    $handlePress(x, y, point) {
      const mine = this.$slider;
      mine.x = x;
      mine.y = y;
      mine.dragging = point?.type !== "touch";
      const pressed = pressedAt(this, x, y);
      const rest = other(pressed);
      // Pressed before it has moved: what hears of both hears of this first.
      if (put(pressed, "pressed", true)) settle();
      // The one pressed is over the other from now on.
      const handle = now(pressed, "handle");
      if (handle) {
        slot(handle, "z").write(1);
        if (now(this, "focusPolicy") & 2) forceActiveFocus(handle, MouseFocusReason);
      }
      const under = now(rest, "handle");
      if (under) slot(under, "z").write(0);
      if (mine.dragging) move(this, x, y);
    },
    // A mouse that drags it is its own: nothing around takes the drag.
    $keeps() {
      return this.$slider.dragging;
    },
    $handleMove(x, y) {
      const mine = this.$slider;
      mine.dragging ||= dragged(this, mine, x, y);
      if (mine.dragging) move(this, x, y);
    },
    $handleRelease(x, y) {
      const pressed = held(this);
      if (!pressed) return;
      const before = pressed.$range.position;
      const snap = now(this, "snapMode");
      let position = along(this, now(pressed, "handle"), x, y);
      if (snap !== SnapMode.NoSnap) position = snapPosition(this, position);
      const value = scaled(this, position);
      if (!close(value, pressed.$range.value)) setValue(pressed, value);
      else if (snap !== SnapMode.NoSnap) setPosition(pressed, position);
      settle();
      if (!close(pressed.$range.position, before)) pressed.moved();
      release(this);
    },
    $handleUngrab() {
      release(this);
    },
    $hover(point, inside) {
      Control.proto.$hover.call(this, point, inside);
      const { first, second } = this.$slider;
      const { x, y } = point.in(this);
      const one = now(first, "handle");
      const two = now(second, "handle");
      let onOne = inside && hit(this, one, x, y) && now(one, "enabled");
      let onTwo = inside && hit(this, two, x, y) && now(two, "enabled");
      if (onOne && onTwo) {
        onOne = now(one, "z") > now(two, "z");
        onTwo = !onOne;
      }
      const changed = put(first, "hovered", onOne);
      if (put(second, "hovered", onTwo) || changed) settle();
    },
    // Focus given to the slider is its first handle's, unless one of them
    // had it before.
    $reason(reason) {
      Control.proto.$reason.call(this, reason);
      if (!this.$active || windowOf(this).active !== this) return;
      const handle = now(this.$slider.first, "handle");
      if (handle) forceActiveFocus(handle, reason);
    },
    $keyPressed(event) {
      const moving = focused(this);
      if (!moving) return;
      const before = moving.$range.value;
      const horizontal = now(this, "orientation") === Horizontal;
      const up = horizontal ? (now(this, "mirrored") ? Key.Key_Left : Key.Key_Right) : Key.Key_Up;
      const down = horizontal ? (now(this, "mirrored") ? Key.Key_Right : Key.Key_Left) : Key.Key_Down;
      if (event.key !== up && event.key !== down) return;
      if (put(moving, "pressed", true)) settle();
      setValue(moving, before + (event.key === up ? step(this) : -step(this)));
      event.accepted = true;
      settle();
      if (!close(moving.$range.value, before)) moving.moved();
    },
    $keyReleased() {
      const { first, second } = this.$slider;
      const changed = put(first, "pressed", false);
      if (put(second, "pressed", false) || changed) settle();
    },
  },
  setup(self, props) {
    const first = node(self, props, "first");
    const second = node(self, props, "second");
    const mine = (self.$slider = { first, second, from: undefined, to: undefined, x: 0, y: 0, dragging: false });
    slot(self, "first").provide(first);
    slot(self, "second").provide(second);
    keeps(self, () => [first.handle, second.handle]);
    // Tab goes from one handle to the other.
    effect(
      () => [first.handle, second.handle],
      (handles) => {
        for (const handle of handles) if (handle) slot(handle, "activeFocusOnTab").provide(true);
      },
    );
    self.$node.style.touchAction = "none";
    // The values assigned or bound from outside, and the ends they are kept
    // between. What they were given at first is fitted together, once all
    // four are known.
    effect(
      () => [first.value, second.value, self.from, self.to],
      ([one, two, from, to]) => {
        const start = mine.from === undefined;
        const ends = from !== mine.from || to !== mine.to;
        mine.from = from;
        mine.to = to;
        untrack(() => {
          if (start) return self.setValues(one, two);
          setValue(first, one);
          setValue(second, two);
          if (!ends) return;
          updatePosition(first, true);
          updatePosition(second);
        });
      },
    );
  },
});

speaks(RangeSlider, "Slider");

// Dial: a value between `from` and `to`, chosen by turning a handle round.
// `angle` is where the handle is, in degrees clockwise from twelve o'clock,
// between `startAngle` and `endAngle`.
import { defineType, effect, settle, slot } from "../../object.js";
import { styleHints } from "../../QtQml/application.js";
import { Key, LeftButton } from "../keycodes.js";
import { Control, keeps, loose, put } from "./Control.js";
import { bounded, clamp, close, fitted, keep, nothing, now, scaled, SnapMode, snapPosition, step } from "./Slider.js";
import { untrack } from "#kernel";
import { speaks } from "../Accessible.js";

const InputMode = { Circular: 0, Horizontal: 1, Vertical: 2 };
const WrapDirection = { Clockwise: 0, CounterClockwise: 1 };

const START = -140;
const END = 140;

function setPosition(self, position) {
  const mine = self.$dial;
  position = clamp(position, 0, 1);
  const angle = mine.start + position * Math.abs(mine.end - mine.start);
  if (close(mine.position, position) && close(mine.angle, angle)) return;
  mine.position = position;
  mine.angle = angle;
  put(self, "position", position);
  put(self, "angle", angle);
}

function updatePosition(self) {
  const mine = self.$dial;
  const from = now(self, "from");
  const to = now(self, "to");
  setPosition(self, close(from, to) ? 0 : (mine.value - from) / (to - from));
}

function setValue(self, value) {
  const mine = self.$dial;
  value = bounded(self, value);
  const same = close(mine.value, value);
  if (!same) mine.value = value;
  keep(self, "value", mine.value);
  if (!same) updatePosition(self);
}

const warn = (text) => console.warn(`Dial: ${text}`);

// Qt's `setStartAngle` and `setEndAngle`: the two are less than a turn
// apart, the one that is given moving the other if it has to.
function setStartAngle(self, angle) {
  const mine = self.$dial;
  if (close(mine.start, angle)) return;
  if (angle >= mine.end) return warn(`startAngle (${angle}) cannot be greater than or equal to endAngle (${mine.end})`);
  if (angle <= -360) return warn(`startAngle (${angle}) cannot be less than or equal to -360`);
  if (angle < mine.end - 360) {
    warn(
      `Difference between startAngle (${angle}) and endAngle (${mine.end}) cannot be greater than 360. Changing endAngle to avoid overlaps.`,
    );
    mine.end = angle + 360;
  }
  mine.start = angle;
  updatePosition(self);
}

function setEndAngle(self, angle) {
  const mine = self.$dial;
  if (close(mine.end, angle)) return;
  if (angle <= mine.start) return warn(`endAngle (${angle}) cannot be less than or equal to startAngle (${mine.start})`);
  if (angle >= 720) return warn(`endAngle (${angle}) cannot be greater than or equal to 720`);
  if (angle > mine.start + 360) {
    warn(
      `Difference between startAngle (${mine.start}) and endAngle (${angle}) cannot be greater than 360. Changing startAngle to avoid overlaps.`,
    );
    mine.start = angle - 360;
  }
  mine.end = angle;
  updatePosition(self);
}

// Where round the dial a point of it is: the angle of the point from the
// middle, taken the turn that is within the dial's angles and, where the
// dial does not wrap, the turn nearest to where the handle is.
function circular(self, x, y) {
  const { start, end, angle } = self.$dial;
  const wrap = now(self, "wrap");
  const up = now(self, "height") / 2 - y;
  const right = x - now(self, "width") / 2;
  let alpha = right || up ? (-Math.atan2(up, right) / Math.PI) * 180 + 90 : 0;
  if (alpha < start && alpha + 360 < end) alpha += 360;
  else if (alpha >= end && alpha - 360 >= start) alpha -= 360;
  if ((alpha < start || alpha > end) && wrap) {
    if (Math.abs(alpha - start) > Math.abs(end - alpha - 360)) alpha += 360;
    else if (Math.abs(alpha - start - 360) < Math.abs(end - alpha)) alpha -= 360;
  }
  if (!wrap) {
    if (Math.abs(angle - alpha) > Math.abs(angle - (alpha + 360))) alpha += 360;
    if (Math.abs(angle - alpha) > Math.abs(angle - (alpha - 360))) alpha -= 360;
  }
  return (alpha - start) / (end - start);
}

// Dragged across or up: twice the dial's size is the whole range.
function linear(self, mode, x, y) {
  const mine = self.$dial;
  const distance = mode === InputMode.Horizontal ? mine.x - x : y - mine.y;
  const area = now(self, mode === InputMode.Horizontal ? "width" : "height") * 2;
  return clamp(mine.before - distance / area, 0, 1);
}

function positionAt(self, x, y) {
  const mode = now(self, "inputMode");
  return mode === InputMode.Circular ? circular(self, x, y) : linear(self, mode, x, y);
}

// More than half the way round at once: the pointer went across the gap
// between the ends.
const large = (self, position) => {
  const mine = self.$dial;
  return mine.end - mine.start >= 180 && Math.abs(position - mine.position) > 0.5;
};

// Whether the handle follows to a position: not across the gap, unless the
// dial wraps.
function follows(self, position) {
  const mine = self.$dial;
  const wrap = now(self, "wrap");
  const across = large(self, position);
  if (wrap && across) self.wrapped(position < mine.position ? WrapDirection.Clockwise : WrapDirection.CounterClockwise);
  return wrap || now(self, "inputMode") !== InputMode.Circular || !across;
}

function move(self, x, y) {
  const mine = self.$dial;
  const before = mine.position;
  let position = clamp(positionAt(self, x, y), 0, 1);
  if (now(self, "snapMode") === SnapMode.SnapAlways) position = snapPosition(self, position);
  if (!follows(self, position)) return;
  if (now(self, "live")) setValue(self, scaled(self, position));
  else setPosition(self, position);
  settle();
  if (!close(position, before)) self.moved();
}

function release(self) {
  const mine = self.$dial;
  mine.dragging = false;
  mine.x = mine.y = mine.before = 0;
  put(self, "pressed", false);
}

export const Dial = defineType("Dial", Control, {
  properties: {
    from: 0,
    to: 1,
    value: 0,
    position: 0,
    angle: START,
    startAngle: START,
    endAngle: END,
    stepSize: 0,
    snapMode: SnapMode.NoSnap,
    inputMode: InputMode.Circular,
    wrap: false,
    pressed: false,
    handle: null,
    live: true,
    // Tab stops at a dial, though a click does not give it focus.
    focusPolicy: 1,
  },
  enums: { ...SnapMode, ...InputMode, ...WrapDirection },
  signals: ["moved", "wrapped"],
  // An angle the dial refuses is never seen: once the two are fitted
  // together they read as the dial holds them.
  resolve: {
    value: (self, own) => fitted(self, self.$dial, own()),
    startAngle: (self, own) => (self.$dial?.fitted ? self.$dial.start : own()),
    endAngle: (self, own) => (self.$dial?.fitted ? self.$dial.end : own()),
  },
  methods: {
    $accepts: LeftButton,
    increase() {
      setValue(this, this.$dial.value + step(this));
      settle();
    },
    decrease() {
      setValue(this, this.$dial.value - step(this));
      settle();
    },
    // The mouse turns the handle to where it is pressed; a finger has to
    // move first.
    $handlePress(x, y, point) {
      const mine = this.$dial;
      mine.x = x;
      mine.y = y;
      mine.before = mine.position;
      mine.dragging = point?.type !== "touch";
      // Pressed before it has turned: what hears of both hears of this first.
      if (put(this, "pressed", true)) settle();
      if (mine.dragging) move(this, x, y);
    },
    // A mouse that drags it is its own: nothing around takes the drag.
    $keeps() {
      return this.$dial.dragging;
    },
    $handleMove(x, y) {
      const mine = this.$dial;
      const threshold = styleHints().startDragDistance;
      mine.dragging ||= Math.abs(x - mine.x) > threshold || Math.abs(y - mine.y) > threshold;
      if (mine.dragging) move(this, x, y);
    },
    $handleRelease(x, y) {
      const mine = this.$dial;
      if (mine.dragging) {
        const before = mine.position;
        let position = positionAt(this, x, y);
        if (now(this, "snapMode") !== SnapMode.NoSnap) position = snapPosition(this, position);
        if (follows(this, position)) setValue(this, scaled(this, position));
        settle();
        if (!close(position, before)) this.moved();
      }
      release(this);
    },
    $handleUngrab() {
      release(this);
    },
    $keyPressed(event) {
      const mine = this.$dial;
      const before = mine.value;
      const mirrored = now(this, "mirrored");
      const { key } = event;
      const down = key === Key.Key_Left || key === Key.Key_Down;
      const up = key === Key.Key_Right || key === Key.Key_Up;
      if (!down && !up && key !== Key.Key_Home && key !== Key.Key_End) return;
      if (put(this, "pressed", true)) settle();
      if (down || up) setValue(this, before + (down === mirrored ? step(this) : -step(this)));
      else setValue(this, now(this, (key === Key.Key_Home) === mirrored ? "to" : "from"));
      event.accepted = true;
      settle();
      if (!close(mine.value, before)) this.moved();
    },
    // Any key let go: the dial is pressed no longer.
    $keyReleased() {
      if (put(this, "pressed", false)) settle();
    },
    // The wheel is taken only when it turned the dial: at an end it scrolls
    // what the dial is in.
    $wheel(turn) {
      if (!now(this, "wheelEnabled")) return false;
      const mine = this.$dial;
      const before = mine.value;
      const angle = nothing(turn.angleY) ? turn.angleX : turn.inverted ? -turn.angleY : turn.angleY;
      setValue(this, before + (step(this) * angle) / 120);
      settle();
      return !close(mine.value, before);
    },
  },
  setup(self) {
    const mine = (self.$dial = {
      value: 0,
      position: 0,
      angle: START,
      start: START,
      end: END,
      from: undefined,
      to: undefined,
      x: 0,
      y: 0,
      before: 0,
      dragging: false,
      fitted: false,
    });
    loose(self, "value");
    keeps(self, () => [self.handle]);
    self.$node.style.touchAction = "none";
    // The angles as they were given are checked against each other once
    // both are known, the start first, and one by one after.
    const angles = [slot(self, "startAngle"), slot(self, "endAngle")];
    // What was given is written as it was taken; one that the other moved
    // is said to have changed.
    const taken = (held, angle, before) => {
      if (!Object.is(held.own(), angle)) held.write(angle);
      else if (angle !== before) held.changed();
    };
    effect(
      () => {
        void self.startAngle;
        void self.endAngle;
        return [angles[0].own(), angles[1].own()];
      },
      ([start, end]) => {
        untrack(() => {
          const before = [mine.start, mine.end];
          if (mine.fitted) {
            // Only the one that was given anew: what it moved of the other
            // is not given back.
            if (start !== before[0]) setStartAngle(self, start);
            if (end !== before[1]) setEndAngle(self, end);
          } else {
            mine.end = end;
            setStartAngle(self, start);
            const given = mine.end;
            mine.end = END;
            setEndAngle(self, given);
            mine.fitted = true;
          }
          taken(angles[0], mine.start, before[0]);
          taken(angles[1], mine.end, before[1]);
        });
      },
    );
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

speaks(Dial, "Dial");

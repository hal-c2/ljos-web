// ScrollBar: a handle that shows where a Flickable is in its content, and
// that moves the content when it is dragged. What it does with a press, a
// move and a release is what Qt's does (`qquickscrollbar.cpp`).
import { onCleanup } from "solid-js";
import { defineType, effect, QtObject, settle, slot } from "../../object.js";
import { LeftButton } from "../keycodes.js";
import { CancelGrabExclusive, cursorOf, drop, gone, hoverable, receive, UngrabExclusive } from "../pointer.js";
import { Control } from "./Control.js";
import { drive, reads } from "./driven.js";
import { assignables, follows, Horizontal, inside, properties, resolve, same, setPosition, setup } from "./scrolling.js";
import { untrack } from "#kernel";
import { speaks } from "../Accessible.js";

const NoSnap = 0;
const SnapAlways = 1;
const AlwaysOff = 1;

const bound = (low, value, high) => Math.max(low, Math.min(high, value));

const state = (self) => self.$bar;
const held = reads("size");

// It shows while what it scrolls moves, and while the mouse is on it.
function updateActive(self) {
  const mine = state(self);
  drive(self, "active", mine.moving || (self.interactive && (self.pressed || self.hovered)));
}

function setPressed(self, pressed) {
  if (!slot(self, "pressed").write(pressed)) return;
  updateActive(self);
}

// A position along the groove, where the handle is no shorter than
// `minimumSize`, as one of the content.
function logical(self, position) {
  const { size, minimumSize } = self;
  return minimumSize > size && minimumSize !== 1 ? (position * (1 - size)) / (1 - minimumSize) : position;
}

function positionAt(self, at) {
  if (self.orientation === Horizontal) return logical(self, at.x - self.leftPadding) / self.availableWidth;
  return logical(self, at.y - self.topPadding) / self.availableHeight;
}

function snapped(self, position) {
  const step = self.stepSize * (1 - self.size);
  return Math.abs(step) <= 1e-12 ? position : Math.round(position / step) * step;
}

// Where a point of the groove puts the handle: it is held where it was
// pressed, or by its middle when the press was beside it.
function dragged(self, at, snap) {
  const position = bound(0, positionAt(self, at) - state(self).offset, 1 - self.size);
  return snap ? snapped(self, position) : position;
}

function press(self, at) {
  const mine = state(self);
  const size = Math.max(self.size, logical(self, self.minimumSize));
  mine.offset = positionAt(self, at) - self.position;
  if (mine.offset < 0 || mine.offset > size) mine.offset = size / 2;
  setPressed(self, true);
}

function move(self, at) {
  if (self.pressed) setPosition(self, dragged(self, at, self.snapMode === SnapAlways));
}

// A release in the padding at either end leaves the handle where it is.
function release(self, at) {
  const outside =
    self.orientation === Horizontal
      ? at.x < self.leftPadding || at.x >= self.width - self.rightPadding
      : at.y < self.topPadding || at.y >= self.height - self.bottomPadding;
  if (outside) return;
  setPosition(self, dragged(self, at, self.snapMode !== NoSnap));
  state(self).offset = 0;
  setPressed(self, false);
}

// `increase()` and `decrease()`: a step, a tenth of the content when the
// bar says none. The bar shows as it goes.
function step(self, direction) {
  untrack(() => {
    const by = Math.abs(self.stepSize) <= 1e-12 ? 0.1 : self.stepSize;
    const active = self.active;
    drive(self, "active", true);
    settle();
    setPosition(self, direction > 0 ? Math.min(1 - self.size, self.position + by) : Math.max(0, self.position - by));
    settle();
    drive(self, "active", active);
  });
  settle();
}

// The bar was moved: the Flickable goes where it says. Qt's
// `scrollHorizontal` and `scrollVertical`.
function scroll(target, across, position) {
  const name = across ? "contentX" : "contentY";
  const min = across ? target.$minX() : target.$minY();
  const max = across ? target.$maxX() : target.$maxY();
  const to = position * (max - min + (across ? target.width : target.height)) + min;
  if (!Number.isNaN(to) && !same(to, target[name])) slot(target, name).write(to);
}

function scrolls(self, name, flickable) {
  const across = name === "horizontal";
  let bar = null;
  let seen;
  effect(
    () => {
      const now = self[name];
      return [now, now?.position];
    },
    ([now, position]) => {
      const moved = now === bar && position !== seen;
      bar = now;
      seen = position;
      const target = moved && untrack(flickable);
      if (target) untrack(() => scroll(target, across, position));
    },
  );
}

function moves(bar, moving) {
  state(bar).moving = moving;
  updateActive(bar);
}

// The Flickable of what a bar is attached to: that, or the one a ScrollView
// has inside it.
const flickableOf = (item) => (item.$viewport ? item : (item.$scrolled?.() ?? null));

const ScrollBarAttached = defineType("ScrollBarAttached", QtObject, {
  properties: { horizontal: null, vertical: null },
  setup(self, props) {
    const of = (self.$of = props.$attachee);
    if (!of.$viewport && !of.$scrolled) {
      return console.warn("ScrollBar attached property must be attached to an object deriving from Flickable or ScrollView");
    }
    const flickable = () => flickableOf(of);
    for (const name of ["horizontal", "vertical"]) {
      follows(self, name, flickable, moves, false);
      scrolls(self, name, flickable);
    }
  },
});

export const ScrollBar = defineType("ScrollBar", Control, {
  properties: {
    ...properties,
    stepSize: 0,
    pressed: false,
    snapMode: NoSnap,
    interactive: true,
    policy: 0,
  },
  resolve: {
    ...resolve,
    size: (self) => bound(0, held(self), 1),
    minimumSize: (self, own) => bound(0, own(), 1),
  },
  enums: { NoSnap, SnapAlways, SnapOnRelease: 2, AsNeeded: 0, AlwaysOff, AlwaysOn: 2 },
  attached: ScrollBarAttached,
  methods: {
    $inside: inside,
    increase() {
      step(this, 1);
    },
    decrease() {
      step(this, -1);
    },
    $press(point) {
      if (!point.primary || point.button !== LeftButton || !untrack(() => this.interactive)) return false;
      state(this).point = point;
      untrack(() => {
        const at = point.in(this);
        press(this, at);
        move(this, at);
      });
      settle();
      return true;
    },
    $move(point) {
      if (point.exclusive !== this) return;
      untrack(() => move(this, point.in(this)));
      settle();
    },
    $release(point) {
      if (point.exclusive !== this) return;
      untrack(() => release(this, point.in(this)));
      settle();
    },
    $grab(transition) {
      if (transition !== CancelGrabExclusive && transition !== UngrabExclusive) return;
      const mine = state(this);
      mine.offset = 0;
      mine.point = null;
      untrack(() => setPressed(this, false));
      settle();
    },
    // Nothing takes the press from it: what it is over would be flicked.
    $keeps() {
      return true;
    },
    $hovers() {
      return untrack(() => this.hoverEnabled);
    },
    $hover(point, over) {
      untrack(() => {
        if (slot(this, "hovered").write(over)) updateActive(this);
      });
      settle();
    },
  },
  setup(self) {
    const mine = (self.$bar = { offset: 0, moving: false, point: null, hovering: false, fixed: null });
    setup(self);
    receive(self);
    onCleanup(() => {
      gone(self);
      if (mine.hovering) hoverable(-1);
    });
    const style = self.$node.style;
    effect(
      () => [Boolean(self.interactive), Boolean(self.hoverEnabled)],
      ([interactive, hovers]) => {
        // One that is not interactive is an indicator: what is under it is
        // pressed, and scrolled, as if it were not there.
        style.pointerEvents = interactive ? "" : "none";
        style.cursor = interactive ? cursorOf(0) : "";
        style.touchAction = interactive ? "none" : "";
        if (hovers !== mine.hovering) hoverable(hovers ? 1 : -1);
        mine.hovering = hovers;
        if (!interactive && mine.point) drop(mine.point, self);
      },
    );
  },
});

assignables(ScrollBar);

// What a ScrollView does to its bars: a finger makes indicators of them and
// a mouse makes them bars again, unless their QML said which they are.
export function interact(bar, interactive) {
  const mine = state(bar);
  const given = slot(bar, "interactive");
  mine.fixed ??= untrack(() => given.explicit());
  if (!mine.fixed) given.provide(interactive);
}

export { AlwaysOff };

speaks(ScrollBar, "ScrollBar");

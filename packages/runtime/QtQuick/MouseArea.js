// MouseArea: an item that takes the mouse, a touch or a pen.
//
// What it does with a press, a move and a release is what Qt's does, in the
// order Qt does it (`qquickmousearea.cpp`); who they are sent to is decided
// in pointer.js.
import { onCleanup } from "solid-js";
import { defineType, derived, effect, gather, group, onChange, settle, signal, slot } from "../object.js";
import { itemToScene, sceneToItem } from "./geometry.js";
import { Item } from "./Item.js";
import { LeftButton, NoButton } from "./keycodes.js";
import {
  after,
  cancel,
  CancelGrabExclusive,
  CancelGrabPassive,
  cursorOf,
  drop,
  gone,
  hoverable,
  receive,
  takeExclusive,
  under,
  UngrabExclusive,
  wheels,
} from "./pointer.js";
import { untrack } from "#kernel";

const FLT_MAX = 3.4028234663852886e38;
const bound = (low, value, high) => Math.max(low, Math.min(high, value));

const state = (self) => self.$mouse;

// Where the point is and what is held, kept for the signals that follow.
function save(self, point) {
  const mine = state(self);
  const at = point.in(self);
  mine.point = point;
  mine.x = at.x;
  mine.y = at.y;
  mine.sceneX = point.x;
  mine.sceneY = point.y;
  mine.button = point.button;
  mine.buttons = point.buttons;
  mine.modifiers = point.modifiers;
}

// Qt's `MouseEvent`: one per area, filled in for each signal. A handler that
// wants none of it says `mouse.accepted = false`.
function event(self, isClick, wasHeld) {
  const mine = state(self);
  const mouse = mine.mouse;
  mouse.x = mine.x;
  mouse.y = mine.y;
  mouse.button = mine.button;
  mouse.buttons = mine.buttons;
  mouse.modifiers = mine.modifiers;
  // `Qt.MouseEventSynthesizedByQt` for a touch.
  mouse.source = mine.point?.type === "touch" ? 2 : 0;
  mouse.isClick = isClick;
  mouse.wasHeld = wasHeld;
  mouse.accepted = true;
  return mouse;
}

function position(self) {
  const mine = state(self);
  slot(self, "mouseX").write(mine.x);
  slot(self, "mouseY").write(mine.y);
}

function setHovered(self, hovered) {
  const mine = state(self);
  if (mine.hovered === hovered) return;
  mine.hovered = hovered;
  slot(self, "containsMouse").write(hovered);
  settle();
  if (hovered) self.entered();
  else self.exited();
}

// `drag.onActiveChanged` is a handler in a group, which the compiler writes
// as it writes a binding: reading it runs it.
function setDragging(self, active) {
  const mine = state(self);
  if (mine.dragging === active) return;
  mine.dragging = active;
  slot(self, "drag$active").write(active);
  settle();
  const props = self.$props;
  const handler = Object.getOwnPropertyDescriptor(props, "drag$onActiveChanged");
  if (!handler) return;
  const value = untrack(() => props.drag$onActiveChanged);
  if (!handler.get && typeof value === "function") value();
}

const handlerOf = (name) => `on${name[0].toUpperCase()}${name.slice(1)}`;

// `propagateComposedEvents`: a click, a double click or a long press that
// this area did not accept is offered to the other areas under the point,
// from the top, until one keeps it.
function propagate(self, mouse, name) {
  const point = state(self).point;
  if (!point || !self.propagateComposedEvents) return;
  const handler = handlerOf(name);
  for (const item of under(point)) {
    if (item === self || !item.$mouseArea || !(item.acceptedButtons & mouse.button) || !(handler in item.$props)) continue;
    const at = point.in(item);
    if (!item.contains(at)) continue;
    mouse.x = at.x;
    mouse.y = at.y;
    // It has a handler: it has to say so to let the event go on.
    mouse.accepted = true;
    item[name](mouse);
    if (mouse.accepted) return;
  }
}

// Qt's `setPressed`: whether the press was accepted.
function setPressed(self, button, pressed) {
  const mine = state(self);
  const was = (mine.pressed & button) !== 0;
  if (was === pressed) return false;
  if (pressed) {
    mine.pressed |= button;
    slot(self, "pressed").write(true);
    slot(self, "pressedButtons").write(mine.pressed);
    position(self);
    settle();
    const mouse = event(self, false, mine.longPress);
    if (!mine.doubleClick) self.$pressed(mouse);
    if (mouse.accepted) return true;
    mine.pressed = NoButton;
    slot(self, "pressed").write(false);
    slot(self, "pressedButtons").write(NoButton);
    settle();
    if (!self.hoverEnabled) setHovered(self, false);
    return false;
  }
  const isClick = !mine.dragging && mine.hovered;
  mine.pressed &= ~button;
  slot(self, "pressed").write(mine.pressed !== NoButton);
  slot(self, "pressedButtons").write(mine.pressed);
  position(self);
  settle();
  const mouse = event(self, isClick, mine.longPress);
  self.released(mouse);
  if (isClick && !mine.longPress && !mine.doubleClick) {
    mouse.accepted = "onClicked" in self.$props;
    self.clicked(mouse);
    if (!mouse.accepted) propagate(self, mouse, "clicked");
  }
  return mouse.accepted;
}

// Qt's `mousePressEvent`.
function press(self, point) {
  const mine = state(self);
  mine.moved = false;
  mine.stealMouse = mine.keep = Boolean(self.preventStealing);
  mine.overThreshold = false;
  if (!self.enabled || !(point.button & self.acceptedButtons)) return false;
  mine.longPress = false;
  save(self, point);
  setDragging(self, false);
  position(self);
  setHovered(self, true);
  mine.startX = point.x;
  mine.startY = point.y;
  if (!setPressed(self, point.button, true)) return false;
  mine.hold = after(self.pressAndHoldInterval, mine.held, mine.hold ?? undefined);
  return true;
}

// The second press of a double click, after it was told as a press.
function doubleClick(self) {
  const mine = state(self);
  const connected = "onDoubleClicked" in self.$props;
  const mouse = event(self, true, false);
  mouse.accepted = connected;
  self.doubleClicked(mouse);
  if (!mouse.accepted) propagate(self, mouse, "doubleClicked");
  // The release that follows is then no click.
  if (mine.pressed) mine.doubleClick = connected || mouse.accepted;
}

const parentOf = (item) => {
  const parent = item.parent;
  return parent?.$node ? parent : null;
};

// Qt's `mouseMoveEvent`: the area is told where the point is, and what it
// drags follows once the point has gone further than the threshold.
function move(self, point) {
  const mine = state(self);
  if (!self.enabled && !mine.pressed) return;
  save(self, point);
  position(self);
  setHovered(self, self.contains(mine));
  const drag = self.drag;
  const target = drag.target;
  if (target) {
    const parent = parentOf(target);
    if (!mine.moved) {
      const at = parent ? itemToScene(parent, target.x, target.y) : target;
      mine.targetX = at.x;
      mine.targetY = at.y;
    }
    const start = parent ? sceneToItem(parent, mine.startX, mine.startY) : { x: mine.startX, y: mine.startY };
    const current = parent ? sceneToItem(parent, point.x, point.y) : point;
    if (mine.keep && mine.stealMouse && mine.overThreshold && !mine.dragging) setDragging(self, true);
    const origin = parent ? sceneToItem(parent, mine.targetX, mine.targetY) : { x: mine.targetX, y: mine.targetY };
    const axis = drag.axis;
    const targetX = target.x;
    const targetY = target.y;
    let dragX = targetX;
    let dragY = targetY;
    let boundedX = targetX;
    let boundedY = targetY;
    if (axis & 1) {
      dragX = origin.x + current.x - start.x;
      boundedX = bound(drag.minimumX, dragX, drag.maximumX);
    }
    if (axis & 2) {
      dragY = origin.y + current.y - start.y;
      boundedY = bound(drag.minimumY, dragY, drag.maximumY);
    }
    if (mine.dragging) {
      slot(target, "x").write(boundedX);
      slot(target, "y").write(boundedY);
      settle();
      // The area may have moved with it.
      const at = sceneToItem(self, mine.sceneX, mine.sceneY);
      mine.x = at.x;
      mine.y = at.y;
      position(self);
    }
    const threshold = drag.threshold;
    const overX = targetX !== boundedX && Math.abs(dragX - origin.x) > threshold;
    const overY = targetY !== boundedY && Math.abs(dragY - origin.y) > threshold;
    if (!mine.overThreshold && (overX || overY)) {
      mine.overThreshold = true;
      // Smoothed, the target starts from where the point is now, and does
      // not jump by the threshold.
      if (drag.smoothed) {
        mine.startX = point.x;
        mine.startY = point.y;
      }
    }
    if (!mine.keep && mine.overThreshold) mine.keep = mine.stealMouse = true;
    mine.moved = true;
  }
  settle();
  self.positionChanged(event(self, false, mine.longPress));
}

// Qt's `mouseReleaseEvent`.
function release(self, point) {
  const mine = state(self);
  mine.stealMouse = false;
  mine.overThreshold = false;
  if (self.enabled || mine.pressed) {
    save(self, point);
    setPressed(self, point.button, false);
    if (!mine.pressed) {
      cancel(mine.hold);
      setDragging(self, false);
      // A finger that is lifted is over nothing.
      if (!self.hoverEnabled || point.type === "touch") setHovered(self, false);
      mine.keep = Boolean(self.preventStealing);
    }
  }
  mine.doubleClick = false;
}

// The press was held for `pressAndHoldInterval`.
function held(self) {
  const mine = state(self);
  if (!mine.pressed || mine.dragging || !mine.hovered) return;
  mine.longPress = true;
  const mouse = event(self, false, true);
  mouse.accepted = "onPressAndHold" in self.$props;
  self.pressAndHold(mouse);
  if (!mouse.accepted) propagate(self, mouse, "pressAndHold");
  // Nobody made anything of it: the release is still a click.
  if (!mouse.accepted) mine.longPress = false;
}

const underMouse = (self) => {
  const point = state(self).point;
  return Boolean(point) && self.visible && self.contains(point.in(self));
};

// Qt's `ungrabMouse`: what the press was is taken away, by an item that
// steals it, by the page, or by the area being hidden.
function ungrabbed(self) {
  const mine = state(self);
  if (!mine.pressed) return;
  mine.pressed = NoButton;
  mine.stealMouse = mine.doubleClick = mine.overThreshold = mine.keep = false;
  cancel(mine.hold);
  setDragging(self, false);
  // Qt tells of the cancel before it tells of what changed with it.
  gather(() => {
    self.canceled();
    slot(self, "pressed").write(false);
    slot(self, "pressedButtons").write(NoButton);
    if (mine.hovered && !underMouse(self)) {
      mine.hovered = false;
      slot(self, "containsMouse").write(false);
    }
  });
}

// Qt's `sendMouseEvent`: a move or a release of a press that is a child's,
// seen first by an area that filters what its children get. It is told as
// its own, and once it drags, the press is taken from the child.
function filtered(self, point, releasing) {
  const mine = state(self);
  if (!mine.pressed) return;
  let steal = mine.stealMouse;
  if ((steal || self.contains(point.in(self))) && !point.exclusive?.$keeps?.(point)) {
    if (releasing) {
      release(self, point);
      steal = mine.stealMouse;
    } else move(self, point);
    if (steal) takeExclusive(point, self);
    return;
  }
  if (!releasing) return;
  mine.pressed &= ~point.button;
  mine.stealMouse = false;
  cancel(mine.hold);
  slot(self, "pressed").write(mine.pressed !== NoButton);
  slot(self, "pressedButtons").write(mine.pressed);
  if (mine.hovered) {
    mine.hovered = false;
    slot(self, "containsMouse").write(false);
  }
  settle();
  self.canceled();
}

// Whether something around the area scrolls: then a finger on it may be
// scrolling, and the page is left to tell.
function scrolled(self) {
  for (let parent = self.parent; parent; parent = parent.parent) if ("contentX" in parent) return true;
  return false;
}

export const MouseArea = defineType("MouseArea", Item, {
  properties: {
    pressed: false,
    containsMouse: false,
    containsPress: derived((self) => self.pressed && self.containsMouse),
    hoverEnabled: false,
    acceptedButtons: LeftButton,
    pressedButtons: NoButton,
    mouseX: 0,
    mouseY: 0,
    cursorShape: 0,
    propagateComposedEvents: false,
    preventStealing: false,
    pressAndHoldInterval: 800,
    drag: group({
      target: null,
      axis: 3,
      minimumX: -FLT_MAX,
      maximumX: FLT_MAX,
      minimumY: -FLT_MAX,
      maximumY: FLT_MAX,
      active: false,
      filterChildren: false,
      smoothed: true,
      threshold: 10,
    }),
  },
  // `pressed` is a property too, so its signal is kept apart: `$pressed`.
  signals: ["clicked", "released", "doubleClicked", "pressAndHold", "entered", "exited", "positionChanged", "canceled", "wheel"],
  methods: {
    $mouseArea: true,
    $press(point) {
      if (!point.primary) return false;
      // It has the press already, as a filter of what would not have it.
      if (state(this).pressed & point.button) return true;
      const accepted = press(this, point);
      if (accepted && point.double) doubleClick(this);
      return accepted;
    },
    $move(point) {
      if (point.exclusive === this) move(this, point);
      else filtered(this, point, false);
    },
    $release(point) {
      if (point.exclusive === this) release(this, point);
      else filtered(this, point, true);
    },
    // Another button, while one is held.
    $chord(point, down) {
      if (down) press(this, point);
      else release(this, point);
    },
    $grab(transition) {
      if (transition === CancelGrabExclusive || transition === CancelGrabPassive || transition === UngrabExclusive) {
        ungrabbed(this);
      }
    },
    // `drag.filterChildren`: a press on something inside the area is the
    // area's too.
    $filter(point, receiver) {
      if (!point.primary || !receiver.$press) return false;
      const mine = state(this);
      if (!mine.pressed && !(this.enabled && this.drag.filterChildren)) return false;
      if (!this.contains(point.in(this))) return false;
      press(this, point);
      return mine.pressed !== NoButton;
    },
    // Once it drags, or with `preventStealing`, nothing takes the press.
    $keeps() {
      return state(this).keep;
    },
    $hovers() {
      return this.hoverEnabled;
    },
    $hover(point, inside) {
      const mine = state(this);
      if (!inside) return setHovered(this, false);
      const at = point.in(this);
      const entering = !mine.hovered;
      if (!entering && (!point.moving || (at.x === mine.x && at.y === mine.y))) return;
      mine.point = point;
      mine.x = at.x;
      mine.y = at.y;
      mine.button = NoButton;
      mine.buttons = point.buttons;
      mine.modifiers = point.modifiers;
      position(this);
      if (entering) setHovered(this, true);
      else settle();
      if (point.moving) this.positionChanged(event(this, false, false));
    },
    // The wheel is for an area that handles it; from any other it goes on
    // to what is under it.
    $wheel(turn) {
      if (!("onWheel" in this.$props)) return false;
      const mine = state(this);
      const wheel = (mine.wheel ??= { x: 0, y: 0, angleDelta: { x: 0, y: 0 }, pixelDelta: { x: 0, y: 0 }, buttons: 0, modifiers: 0, inverted: false, phase: 0, accepted: true });
      const at = sceneToItem(this, turn.x, turn.y);
      wheel.x = at.x;
      wheel.y = at.y;
      wheel.angleDelta.x = turn.angleX;
      wheel.angleDelta.y = turn.angleY;
      wheel.pixelDelta.x = turn.pixelX;
      wheel.pixelDelta.y = turn.pixelY;
      wheel.buttons = turn.buttons;
      wheel.modifiers = turn.modifiers;
      wheel.inverted = turn.inverted;
      wheel.accepted = true;
      this.wheel(wheel);
      return wheel.accepted;
    },
  },
  setup(self, props) {
    const mine = (self.$mouse = {
      // The accepted buttons that are down.
      pressed: NoButton,
      hovered: false,
      dragging: false,
      moved: false,
      stealMouse: false,
      keep: false,
      overThreshold: false,
      longPress: false,
      doubleClick: false,
      point: null,
      x: 0,
      y: 0,
      sceneX: 0,
      sceneY: 0,
      button: NoButton,
      buttons: NoButton,
      modifiers: 0,
      // Where the press was, and where what is dragged was then: the scene's.
      startX: 0,
      startY: 0,
      targetX: 0,
      targetY: 0,
      hold: null,
      held: () => held(self),
      hovering: false,
      mouse: { x: 0, y: 0, button: 0, buttons: 0, modifiers: 0, source: 0, isClick: false, wasHeld: false, accepted: true, flags: 0 },
      wheel: null,
    });
    self.$pressed = signal(() => untrack(() => props.onPressed));
    receive(self);
    if ("onWheel" in props) wheels();
    onCleanup(() => {
      cancel(mine.hold);
      gone(self);
      if (mine.hovering) hoverable(-1);
    });
    // An area that hides itself while pressed is not pressed any more.
    onChange(self, "visible", () => {
      if (!mine.pressed || self.visible) return;
      ungrabbed(self);
      if (!self.hoverEnabled) setHovered(self, false);
      if (mine.point) drop(mine.point, self);
    });
    const style = self.$node.style;
    effect(
      () => ({
        cursor: slot(self, "cursorShape").explicit() ? cursorOf(self.cursorShape) : "",
        // A finger on the area presses it, and scrolls nothing.
        touch: scrolled(self) && !self.preventStealing && !self.drag.target ? "" : "none",
        hovers: Boolean(self.hoverEnabled),
      }),
      ({ cursor, touch, hovers }) => {
        style.cursor = cursor;
        style.touchAction = touch;
        if (hovers !== mine.hovering) hoverable(hovers ? 1 : -1);
        mine.hovering = hovers;
      },
    );
  },
});

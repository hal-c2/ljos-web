// Pointer handlers: TapHandler, DragHandler, HoverHandler, WheelHandler and
// PinchHandler.
//
// A handler is not an item: it acts on the item it is declared in, and is
// asked about a press before that item is. What each makes of a press, a
// move and a release is what Qt's does (`qquicktaphandler.cpp` and its
// neighbours); who they are sent to is decided in pointer.js.
import { onCleanup } from "solid-js";
import { defineType, derived, effect, group, QtObject, settle, slot } from "../object.js";
import { itemToScene, origin, sceneToItem } from "./geometry.js";
import { KeyboardModifierMask, LeftButton, NoButton } from "./keycodes.js";
import {
  after,
  cancel,
  CancelGrabExclusive,
  CancelGrabPassive,
  canTake,
  cursorOf,
  DOUBLE_CLICK_INTERVAL,
  drop,
  gather,
  GrabExclusive,
  GrabPassive,
  gone,
  handles,
  hoverable,
  takeExclusive,
  watch,
  wheels,
} from "./pointer.js";
import { signal, untrack } from "#kernel";

const DBL_MAX = Number.MAX_VALUE;
const next = (version) => version + 1;
const bound = (low, value, high) => Math.max(low, Math.min(high, value));

const parentOf = (item) => {
  const parent = item.parent;
  return parent?.$node ? parent : null;
};

const inside = (item, point) => item.contains(point.in(item));
const cancelled = (transition) => transition === CancelGrabExclusive || transition === CancelGrabPassive;

// `PointerDevice.Mouse`, `PointerDevice.Finger`: what `acceptedDevices` and
// `acceptedPointerTypes` are made of.
export const PointerDevice = Object.freeze({
  Unknown: 0,
  Mouse: 0x01,
  TouchScreen: 0x02,
  TouchPad: 0x04,
  Puck: 0x08,
  Stylus: 0x10,
  Airbrush: 0x20,
  Keyboard: 0x1000,
  AllDevices: 0x7fffffff,
  Generic: 0x01,
  Finger: 0x02,
  Pen: 0x04,
  Eraser: 0x08,
  Cursor: 0x10,
  AllPointerTypes: 0x7fff,
});

const DEVICES = { mouse: PointerDevice.Mouse, touch: PointerDevice.TouchScreen, pen: PointerDevice.Stylus };
const POINTERS = { mouse: PointerDevice.Generic, touch: PointerDevice.Finger, pen: PointerDevice.Pen };

// Qt's `QQuickHandlerPoint`: where the point a handler follows is, in the
// item the handler is in and in the scene. A handler has one that lasts, and
// what reads it is told when the point moves.
class HandlerPoint {
  constructor(tracked) {
    const [read, bump] = tracked ? signal(0) : [null, null];
    this.$read = read;
    this.$bump = bump;
    this.$reset();
  }

  get id() {
    this.$read?.();
    return this.$id;
  }

  get position() {
    this.$read?.();
    return (this.$position ??= { x: this.$x, y: this.$y });
  }

  get scenePosition() {
    this.$read?.();
    return (this.$scenePosition ??= { x: this.$sceneX, y: this.$sceneY });
  }

  get pressPosition() {
    this.$read?.();
    return (this.$pressPosition ??= { x: this.$pressX, y: this.$pressY });
  }

  get scenePressPosition() {
    this.$read?.();
    return (this.$scenePressPosition ??= { x: this.$scenePressX, y: this.$scenePressY });
  }

  get sceneGrabPosition() {
    this.$read?.();
    return (this.$sceneGrabPosition ??= { x: this.$grabX, y: this.$grabY });
  }

  get pressedButtons() {
    this.$read?.();
    return this.$buttons;
  }

  get modifiers() {
    this.$read?.();
    return this.$modifiers;
  }

  get velocity() {
    this.$read?.();
    return (this.$velocity ??= { x: this.$velocityX, y: this.$velocityY });
  }

  get pressure() {
    this.$read?.();
    return this.$pressure;
  }

  $changed() {
    this.$position = this.$scenePosition = this.$pressPosition = this.$scenePressPosition = null;
    this.$sceneGrabPosition = this.$velocity = null;
    this.$bump?.(next);
  }

  $reset() {
    this.$id = -1;
    this.$x = this.$y = this.$sceneX = this.$sceneY = 0;
    this.$pressX = this.$pressY = this.$scenePressX = this.$scenePressY = 0;
    this.$grabX = this.$grabY = 0;
    this.$buttons = this.$modifiers = 0;
    this.$velocityX = this.$velocityY = this.$pressure = 0;
    this.$changed();
  }

  // Where it was pressed, for a handler in `item`; `from` says the rest.
  $press(item, x, y, from) {
    const at = sceneToItem(item, x, y);
    this.$id = from.id;
    this.$pressX = at.x;
    this.$pressY = at.y;
    this.$scenePressX = this.$grabX = x;
    this.$scenePressY = this.$grabY = y;
    this.$move(item, x, y, from);
  }

  $move(item, x, y, from) {
    const at = sceneToItem(item, x, y);
    this.$x = at.x;
    this.$y = at.y;
    this.$sceneX = x;
    this.$sceneY = y;
    this.$buttons = from.buttons;
    this.$modifiers = from.modifiers;
    this.$velocityX = from.velocityX ?? 0;
    this.$velocityY = from.velocityY ?? 0;
    this.$pressure = from.pressure ?? 0;
    this.$changed();
  }

  // The handler took the point for its own, here.
  $grabbed() {
    this.$grabX = this.$sceneX;
    this.$grabY = this.$sceneY;
    this.$changed();
  }
}

// The point a signal is about (`tapped`, `grabChanged`, `canceled`): one per
// handler, filled in for each.
function eventOf(self, point) {
  const at = self.$event;
  const item = self.$parent;
  at.$press(item, point.pressX, point.pressY, point);
  at.$move(item, point.x, point.y, point);
  return at;
}

// Qt's `QQuickPointerDeviceHandler::wantsPointerEvent`. A handler that
// accepts no button does not care which are held: HoverHandler.
function wants(self, point) {
  if (!self.enabled) return false;
  const type = point.type;
  if (!(self.acceptedDevices & (DEVICES[type] ?? 0)) || !(self.acceptedPointerTypes & (POINTERS[type] ?? 0))) return false;
  const modifiers = self.acceptedModifiers >>> 0;
  if (modifiers !== KeyboardModifierMask && modifiers !== point.modifiers >>> 0) return false;
  const buttons = self.acceptedButtons;
  return type === "touch" || buttons === NoButton || ((point.buttons | point.button) & buttons) !== 0;
}

// What a handler says when its grab changes: Qt's `onGrabChanged`.
function told(self, transition, point) {
  const at = eventOf(self, point);
  if (cancelled(transition)) self.canceled(at);
  self.grabChanged(transition, at);
}

// A handler in a group (`xAxis.onActiveValueChanged`) is written by the
// compiler as a binding when it is an expression: reading it runs it.
function grouped(self, key, delta) {
  const props = self.$props;
  const handler = Object.getOwnPropertyDescriptor(props, key);
  if (!handler) return;
  const value = untrack(() => props[key]);
  if (!handler.get && typeof value === "function") value(delta);
}

export const PointerHandler = defineType("PointerHandler", QtObject, {
  properties: {
    enabled: true,
    active: false,
    parent: derived((self) => self.$parent),
    target: derived((self) => self.parent),
    // What it takes over from, and what it lets take over: from items and
    // other kinds of handler, and anything.
    grabPermissions: 0xf6,
    dragThreshold: 10,
    acceptedButtons: LeftButton,
    acceptedModifiers: KeyboardModifierMask,
    acceptedDevices: PointerDevice.AllDevices,
    acceptedPointerTypes: PointerDevice.AllPointerTypes,
  },
  signals: ["grabChanged", "canceled"],
  enums: {
    TakeOverForbidden: 0x00,
    CanTakeOverFromHandlersOfSameType: 0x01,
    CanTakeOverFromHandlersOfDifferentType: 0x02,
    CanTakeOverFromItems: 0x04,
    CanTakeOverFromAnything: 0x0f,
    ApprovesTakeOverByHandlersOfSameType: 0x10,
    ApprovesTakeOverByHandlersOfDifferentType: 0x20,
    ApprovesTakeOverByItems: 0x40,
    ApprovesCancellation: 0x80,
    ApprovesTakeOverByAnything: 0xf0,
  },
  methods: {
    $grab(transition, point) {
      told(this, transition, point);
    },
  },
  setup(self) {
    self.$point = new HandlerPoint(true);
    self.$event = new HandlerPoint(false);
    handles(self);
    onCleanup(() => gone(self));
  },
});

// `gesturePolicy`.
const DragThreshold = 0;
const ReleaseWithinBounds = 2;
const DragWithinBounds = 3;

// Qt's style hints: how far from the last a tap may be to count with it.
const MULTI_TAP_DISTANCE = { mouse: 5, pen: 5, touch: 10 };

function pressTap(self, point) {
  const mine = self.$mine;
  const item = self.$parent;
  mine.point = point;
  mine.pressed = true;
  mine.held = mine.quiet = false;
  self.$point.$press(item, point.pressX, point.pressY, point);
  settle();
  const threshold = self.longPressThreshold;
  if (threshold > 0) mine.hold = after(threshold * 1000, mine.long, mine.hold ?? undefined);
  // The grab comes before it says it is pressed. Within a drag threshold it
  // only watches: something else may yet make a drag of the press.
  if (self.gesturePolicy === DragThreshold) watch(point, self);
  else takeExclusive(point, self);
  slot(self, "pressed").write(true);
  settle();
  self.pointChanged();
}

// The point is followed no longer.
function forget(self) {
  self.$mine.point = null;
  self.$point.$reset();
  settle();
  self.pointChanged();
}

function cancelTap(self, point) {
  const mine = self.$mine;
  if (!mine.pressed) return;
  mine.pressed = false;
  cancel(mine.hold);
  slot(self, "pressed").write(false);
  settle();
  self.canceled(eventOf(self, point));
  forget(self);
  // What it only watched it is done watching when the point is let go.
  if (point.exclusive === self) drop(point, self);
}

function releaseTap(self, point) {
  const mine = self.$mine;
  mine.pressed = false;
  cancel(mine.hold);
  // Where it was let go, with no button down.
  self.$point.$move(self.$parent, point.x, point.y, point);
  slot(self, "pressed").write(false);
  // Held for longer than a long press takes, it is no tap.
  if (mine.held) {
    settle();
    return forget(self);
  }
  const touch = point.type === "touch";
  const button = touch ? NoButton : point.button;
  const reach = MULTI_TAP_DISTANCE[point.type] ?? 5;
  const dx = point.x - mine.lastX;
  const dy = point.y - mine.lastY;
  const again = mine.open && button === mine.button && dx * dx + dy * dy < reach * reach;
  const count = again ? mine.count + 1 : 1;
  mine.count = count;
  mine.button = button;
  mine.lastX = point.x;
  mine.lastY = point.y;
  mine.open = true;
  mine.window = after(DOUBLE_CLICK_INTERVAL, mine.closed, mine.window ?? undefined);
  slot(self, "tapCount").write(count);
  settle();
  const at = eventOf(self, point);
  self.tapped(at, button);
  const exclusive = self.exclusiveSignals;
  if (exclusive === 3) {
    // One or the other, so neither until it is known which.
    if (count === 1) {
      const first = (mine.first ??= new HandlerPoint(false));
      first.$press(self.$parent, point.pressX, point.pressY, point);
      first.$move(self.$parent, point.x, point.y, point);
      mine.single = after(DOUBLE_CLICK_INTERVAL, mine.late, mine.single ?? undefined);
    }
  } else if (count === 1 && exclusive !== 2) self.singleTapped(at, button);
  else if (count === 2 && exclusive !== 1) self.doubleTapped(at, button);
  forget(self);
}

export const TapHandler = defineType("TapHandler", PointerHandler, {
  properties: {
    pressed: false,
    tapCount: 0,
    // Seconds.
    longPressThreshold: 0.8,
    gesturePolicy: DragThreshold,
    exclusiveSignals: 0,
  },
  signals: ["tapped", "singleTapped", "doubleTapped", "longPressed", "pointChanged"],
  enums: {
    DragThreshold,
    WithinBounds: 1,
    ReleaseWithinBounds,
    DragWithinBounds,
    NotExclusive: 0,
    SingleTap: 1,
    DoubleTap: 2,
  },
  methods: {
    get point() {
      return this.$point;
    },
    // A point somebody has for its own is not offered: a press on a
    // MouseArea inside the item is the area's.
    $press(point) {
      if (this.$mine.pressed || !wants(this, point) || point.exclusive || !inside(this.$parent, point)) return false;
      pressTap(this, point);
      // A finger that is only watched goes on to what is under the item.
      return !(point.type === "touch" && this.gesturePolicy === DragThreshold);
    },
    $move(point) {
      const mine = this.$mine;
      if (mine.point !== point || !mine.pressed) return;
      const item = this.$parent;
      const threshold = this.dragThreshold;
      const policy = this.gesturePolicy;
      const over = Math.abs(point.x - point.pressX) > threshold || Math.abs(point.y - point.pressY) > threshold;
      // Dragged, it is not a long press any more.
      if (over && policy !== DragWithinBounds) mine.quiet = true;
      const within = inside(item, point);
      const kept = policy === DragThreshold ? !over && within : policy === ReleaseWithinBounds || within;
      if (!kept) return cancelTap(this, point);
      this.$point.$move(item, point.x, point.y, point);
      settle();
      this.pointChanged();
    },
    $release(point) {
      const mine = this.$mine;
      if (mine.point !== point || !mine.pressed) return;
      if (!inside(this.$parent, point)) return cancelTap(this, point);
      // Another of its buttons is still down.
      if (point.type !== "touch" && point.buttons & this.acceptedButtons) return;
      releaseTap(this, point);
    },
    $grab(transition, point) {
      if (cancelled(transition) && this.$mine.pressed) {
        cancelTap(this, point);
        return this.grabChanged(transition, eventOf(this, point));
      }
      told(this, transition, point);
    },
  },
  setup(self) {
    const mine = (self.$mine = {
      point: null,
      pressed: false,
      // Whether the press lasted as long as a long press, and whether it
      // moved too far to be told as one.
      held: false,
      quiet: false,
      hold: null,
      long() {
        if (!mine.pressed) return;
        mine.held = true;
        if (!mine.quiet) self.longPressed();
      },
      // The last tap, and whether the next still counts with it.
      count: 0,
      button: NoButton,
      lastX: 0,
      lastY: 0,
      open: false,
      window: null,
      closed: () => void (mine.open = false),
      // `exclusiveSignals: SingleTap | DoubleTap`: the first tap, waiting.
      first: null,
      single: null,
      late() {
        if (mine.count === 1) self.singleTapped(mine.first, mine.button);
        else if (mine.count === 2) self.doubleTapped(mine.first, mine.button);
      },
    });
    onCleanup(() => {
      cancel(mine.hold);
      cancel(mine.window);
      cancel(mine.single);
    });
  },
});

const axis = (minimum, maximum, value) => group({ enabled: true, minimum, maximum, activeValue: value });
const translation = () => ({ x: 0, y: 0 });

// Qt's `QQuickDragAxis::updateValue` for the two axes of a translation: what
// it is in this gesture, and what it adds up to over all of them, which the
// axis keeps within its limits.
function shift(self, x, y) {
  const mine = self.$mine;
  const xAxis = self.xAxis;
  const yAxis = self.yAxis;
  const dx = (mine.dx = xAxis.enabled ? x - mine.x : 0);
  const dy = (mine.dy = yAxis.enabled ? y - mine.y : 0);
  const persistent = self.persistentTranslation;
  mine.x += dx;
  mine.y += dy;
  slot(self, "xAxis$activeValue").write(mine.x);
  slot(self, "yAxis$activeValue").write(mine.y);
  slot(self, "activeTranslation").write({ x: mine.x, y: mine.y });
  slot(self, "persistentTranslation").write({
    x: xAxis.enabled ? bound(xAxis.minimum, persistent.x + dx, xAxis.maximum) : persistent.x,
    y: yAxis.enabled ? bound(yAxis.minimum, persistent.y + dy, yAxis.maximum) : persistent.y,
  });
}

function shifted(self) {
  const mine = self.$mine;
  if (self.xAxis.enabled) grouped(self, "xAxis$onActiveValueChanged", mine.dx);
  if (self.yAxis.enabled) grouped(self, "yAxis$onActiveValueChanged", mine.dy);
  self.translationChanged({ x: mine.dx, y: mine.dy });
}

// A gesture is over: what it added is kept, what it was starts from nothing.
function still(self) {
  const mine = self.$mine;
  mine.x = mine.y = 0;
  slot(self, "xAxis$activeValue").write(0);
  slot(self, "yAxis$activeValue").write(0);
  slot(self, "activeTranslation").write(translation());
}

// The target goes where the point is, keeping the spot it was pressed on
// under it: Qt's `handlePointerEventImpl`, the transform origin included.
function follow(self, point) {
  const target = self.target;
  const parent = target && parentOf(target);
  if (!parent) return;
  const mine = self.$mine;
  const at = sceneToItem(target, point.x, point.y);
  const about = origin(target);
  const scene = itemToScene(target, at.x - mine.pressX + about.x, at.y - mine.pressY + about.y);
  const to = sceneToItem(parent, scene.x, scene.y);
  const xAxis = self.xAxis;
  const yAxis = self.yAxis;
  slot(target, "x").write(xAxis.enabled ? bound(xAxis.minimum, to.x - about.x, xAxis.maximum) : target.x);
  slot(target, "y").write(yAxis.enabled ? bound(yAxis.minimum, to.y - about.y, yAxis.maximum) : target.y);
  settle();
}

// A drag that ends forgets where it was; a press that made none does not.
function endDrag(self) {
  const mine = self.$mine;
  mine.point = null;
  if (!mine.active) return;
  mine.active = false;
  slot(self, "active").write(false);
  still(self);
  settle();
  self.$point.$reset();
  settle();
  self.centroidChanged();
}

// A finger on something that is dragged or pinched moves it, not the page.
const untouched = (self) => {
  const node = self.$parent?.$node;
  if (node) node.style.touchAction = "none";
};

export const DragHandler = defineType("DragHandler", PointerHandler, {
  properties: {
    xAxis: axis(-DBL_MAX, DBL_MAX, 0),
    yAxis: axis(-DBL_MAX, DBL_MAX, 0),
    activeTranslation: derived(translation),
    persistentTranslation: derived(translation),
  },
  // `translationChanged` says by how much, so `translation` is not a
  // property of the kernel's: its changes are told here.
  signals: ["centroidChanged", "translationChanged"],
  methods: {
    get centroid() {
      return this.$point;
    },
    get translation() {
      return this.activeTranslation;
    },
    $press(point) {
      const mine = this.$mine;
      const item = this.$parent;
      if (mine.point || !wants(this, point) || !inside(item, point)) return false;
      mine.point = point;
      watch(point, this);
      const target = this.target;
      const at = target ? sceneToItem(target, point.x, point.y) : point;
      mine.pressX = at.x;
      mine.pressY = at.y;
      this.$point.$press(item, point.pressX, point.pressY, point);
      settle();
      this.centroidChanged();
      // A finger goes on to what is under the item; the mouse does not.
      return point.type !== "touch";
    },
    $move(point) {
      const mine = this.$mine;
      // Whoever has the point may not let go of it.
      if (mine.point !== point || !canTake(point, this)) return;
      const centroid = this.$point;
      centroid.$move(this.$parent, point.x, point.y, point);
      settle();
      this.centroidChanged();
      const dx = this.xAxis.enabled ? point.x - point.pressX : 0;
      const dy = this.yAxis.enabled ? point.y - point.pressY : 0;
      if (mine.active) {
        if (dx !== mine.x || dy !== mine.y) {
          shift(this, dx, dy);
          settle();
          shifted(this);
        }
      } else {
        const threshold = this.dragThreshold;
        if ((Math.abs(dx) <= threshold && Math.abs(dy) <= threshold) || !takeExclusive(point, this)) return;
        centroid.$grabbed();
        mine.active = true;
        slot(this, "active").write(true);
        settle();
      }
      follow(this, point);
    },
    $release(point) {
      if (this.$mine.point !== point) return;
      // Where it was let go, in the item as it is now.
      this.$point.$move(this.$parent, point.x, point.y, point);
      endDrag(this);
    },
    $grab(transition, point) {
      if (cancelled(transition) && this.$mine.point === point) endDrag(this);
      told(this, transition, point);
    },
  },
  setup(self) {
    // `x`, `y`: the translation of this drag. `pressX`, `pressY`: where in
    // the target the press was.
    self.$mine = { point: null, active: false, x: 0, y: 0, dx: 0, dy: 0, pressX: 0, pressY: 0 };
    untouched(self);
  },
});

export const HoverHandler = defineType("HoverHandler", PointerHandler, {
  properties: {
    hovered: false,
    cursorShape: 0,
    // Whether what is under the item is hidden from the mouse.
    blocking: false,
    acceptedButtons: NoButton,
  },
  signals: ["pointChanged"],
  methods: {
    get point() {
      return this.$point;
    },
    $hovers(point) {
      return wants(this, point);
    },
    $hover(point, over) {
      const mine = this.$mine;
      if (!over) {
        if (!mine.hovered) return;
        mine.hovered = false;
        slot(this, "hovered").write(false);
        return settle();
      }
      const at = this.$point;
      if (mine.hovered && at.$sceneX === point.x && at.$sceneY === point.y) return;
      at.$id = point.id;
      at.$move(this.$parent, point.x, point.y, point);
      if (!mine.hovered) {
        mine.hovered = true;
        slot(this, "hovered").write(true);
      }
      settle();
      this.pointChanged();
    },
  },
  setup(self) {
    self.$mine = { hovered: false };
    hoverable(1);
    onCleanup(() => hoverable(-1));
    const style = self.$parent?.$node?.style;
    if (!style) return;
    let shaped = false;
    effect(
      () => (self.enabled && slot(self, "cursorShape").explicit() ? cursorOf(self.cursorShape) : null),
      (cursor) => {
        if (cursor !== null) style.cursor = cursor;
        else if (shaped) style.cursor = "";
        shaped = cursor !== null;
      },
    );
  },
});

// Qt's `QQuickItemPrivate::adjustedPosForTransform`: where an item that was
// at (x, y) has to be for the point (cx, cy) of its parent to stay under the
// same spot of it, once it is moved by (tx, ty), scaled by `scale` and turned
// by `rotation` about that point.
function adjusted(item, cx, cy, x, y, tx, ty, scale, rotation) {
  const about = origin(item);
  const angle = (rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const px = (x + about.x + tx - cx) * scale;
  const py = (y + about.y + ty - cy) * scale;
  return { x: cx + px * cos - py * sin - about.x, y: cy + px * sin + py * cos - about.y };
}

// What the wheel turned does to the target's `property`: Qt's
// `QQuickWheelHandler::handleEventPoint`.
function turned(self, turn, by) {
  const name = self.property;
  const target = self.target;
  if (!name || !target) return;
  if (name !== "scale" && name !== "rotation") {
    const value = Number(target[name]);
    if (Number.isFinite(value)) target[name] = value + by;
    return;
  }
  const parent = parentOf(target);
  const at = parent ? sceneToItem(parent, turn.x, turn.y) : turn;
  const x = target.x;
  const y = target.y;
  let to = null;
  if (name === "scale") {
    const was = target.scale;
    target.scale = was * self.targetScaleMultiplier ** (by / 15);
    if (self.targetTransformAroundCursor) to = adjusted(target, at.x, at.y, x, y, 0, 0, target.scale / was, 0);
  } else {
    const was = target.rotation;
    target.rotation = was + by;
    if (self.targetTransformAroundCursor) to = adjusted(target, at.x, at.y, x, y, 0, 0, 1, target.rotation - was);
  }
  if (!to) return;
  slot(target, "x").write(to.x);
  slot(target, "y").write(to.y);
  settle();
}

export const WheelHandler = defineType("WheelHandler", PointerHandler, {
  properties: {
    // `Qt.Vertical`.
    orientation: 2,
    // Seconds without the wheel turning until it is no longer active.
    activeTimeout: 0.1,
    // Degrees turned so far, by `rotationScale`.
    rotation: 0,
    rotationScale: 1,
    property: "",
    targetScaleMultiplier: 2 ** (1 / 3),
    targetTransformAroundCursor: true,
    // Whether the wheel stops here, or goes on to what is under the item.
    blocking: true,
    acceptedDevices: PointerDevice.Mouse,
  },
  signals: ["wheel", "pointChanged"],
  methods: {
    get point() {
      return this.$point;
    },
    $wheel(turn) {
      const mine = this.$mine;
      const item = this.$parent;
      if (!this.enabled) return false;
      const modifiers = this.acceptedModifiers >>> 0;
      if (modifiers !== KeyboardModifierMask && modifiers !== turn.modifiers >>> 0) return false;
      const delta = this.orientation === 1 ? turn.angleX : turn.angleY;
      if (!delta) return false;
      const at = sceneToItem(item, turn.x, turn.y);
      if (!item.contains(at)) return false;
      // Degrees, by `rotationScale`: what `rotation` and the target's
      // property both change by.
      const by = (delta / 8) * this.rotationScale;
      mine.active = true;
      this.$point.$move(item, turn.x, turn.y, turn);
      slot(this, "active").write(true);
      slot(this, "rotation").write(this.rotation + by);
      settle();
      this.pointChanged();
      const wheel = mine.wheel;
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
      turned(this, turn, by);
      mine.timer = after(this.activeTimeout * 1000, mine.idle, mine.timer ?? undefined);
      return Boolean(this.blocking);
    },
  },
  setup(self) {
    const mine = (self.$mine = {
      active: false,
      timer: null,
      idle() {
        mine.active = false;
        slot(self, "active").write(false);
        settle();
      },
      wheel: {
        x: 0,
        y: 0,
        angleDelta: { x: 0, y: 0 },
        pixelDelta: { x: 0, y: 0 },
        buttons: 0,
        modifiers: 0,
        inverted: false,
        phase: 0,
        accepted: true,
      },
    });
    wheels();
    onCleanup(() => cancel(mine.timer));
  },
});

const distance = (point, x, y) => Math.hypot(point.x - x, point.y - y);
const direction = (point, x, y) => (Math.atan2(point.y - y, point.x - x) * 180) / Math.PI;
const swing = (from, to) => {
  const by = to - from;
  return by > 180 ? by - 360 : by < -180 ? by + 360 : by;
};

// Whether two fingers have moved enough to be a pinch, and then what they
// make: Qt's rules, by what they did since they were pressed.
function pinching(self, a, b, cx, cy) {
  const threshold = self.dragThreshold;
  const pressX = (a.pressX + b.pressX) / 2;
  const pressY = (a.pressY + b.pressY) / 2;
  let over = 0;
  let movement = 0;
  let spread = 0;
  let pressSpread = 0;
  for (const point of self.$mine.points) {
    const x = point.x - cx;
    const y = point.y - cy;
    const px = point.pressX - pressX;
    const py = point.pressY - pressY;
    movement += Math.hypot(x - px, y - py);
    spread += Math.hypot(x, y);
    pressSpread += Math.hypot(px, py);
    if (Math.abs(point.x - point.pressX) > threshold || Math.abs(point.y - point.pressY) > threshold) over++;
  }
  if (!over) return false;
  const dragX = self.xAxis.enabled ? cx - pressX : 0;
  const dragY = self.yAxis.enabled ? cy - pressY : 0;
  const spreading = Math.abs(spread - pressSpread);
  // Both moved the same way: a drag. They came apart or together: a scale.
  // Neither, and the middle stayed where it was: they went around it.
  if (over === 2 && dragX * dragX + dragY * dragY >= threshold * threshold && movement / 2 < threshold) return true;
  return spreading > threshold || (spreading < threshold && Math.hypot(cx - pressX, cy - pressY) < threshold);
}

function beginPinch(self, a, b, cx, cy) {
  const mine = self.$mine;
  if (!canTake(a, self) || !canTake(b, self)) return false;
  takeExclusive(a, self);
  takeExclusive(b, self);
  if (mine.points.length < 2) return false;
  const target = self.target;
  mine.active = true;
  mine.grabX = cx;
  mine.grabY = cy;
  mine.startDistance = (distance(a, cx, cy) + distance(b, cx, cy)) / 2;
  mine.angleA = direction(a, cx, cy);
  mine.angleB = direction(b, cx, cy);
  mine.startScale = self.persistentScale;
  mine.startRotation = self.persistentRotation;
  mine.targetX = target ? target.x : 0;
  mine.targetY = target ? target.y : 0;
  self.$point.$grabbed();
  slot(self, "active").write(true);
  settle();
  return true;
}

// All the fingers of one event have moved: what they make of the target.
function pinch(self) {
  const mine = self.$mine;
  if (mine.points.length < 2) return;
  const [a, b] = mine.points;
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  self.$point.$move(self.$parent, cx, cy, a);
  settle();
  self.centroidChanged();
  if (!mine.active && !(pinching(self, a, b, cx, cy) && beginPinch(self, a, b, cx, cy))) return;

  const scaleAxis = self.scaleAxis;
  let scaleBy = 1;
  if (scaleAxis.enabled) {
    const start = mine.startScale;
    const reach = (distance(a, cx, cy) + distance(b, cx, cy)) / 2;
    const active = bound(
      scaleAxis.minimum / start,
      mine.startDistance > 0 ? reach / mine.startDistance : 1,
      scaleAxis.maximum / start,
    );
    scaleBy = active / mine.scale;
    mine.scale = active;
    slot(self, "activeScale").write(active);
    slot(self, "scaleAxis$activeValue").write(active);
    slot(self, "persistentScale").write(bound(scaleAxis.minimum, start * active, scaleAxis.maximum));
  }

  const rotationAxis = self.rotationAxis;
  let rotationBy = 0;
  if (rotationAxis.enabled) {
    const angleA = direction(a, cx, cy);
    const angleB = direction(b, cx, cy);
    rotationBy = (swing(mine.angleA, angleA) + swing(mine.angleB, angleB)) / 2;
    mine.angleA = angleA;
    mine.angleB = angleB;
    mine.rotation += rotationBy;
    slot(self, "activeRotation").write(mine.rotation);
    slot(self, "rotationAxis$activeValue").write(mine.rotation);
    slot(self, "persistentRotation").write(
      bound(rotationAxis.minimum, self.persistentRotation + rotationBy, rotationAxis.maximum),
    );
  }

  const target = self.target;
  const parent = target && parentOf(target);
  const scale = self.persistentScale;
  const rotation = self.persistentRotation;
  let to = null;
  if (parent) {
    // The target turns and grows about the middle of the fingers, and goes
    // with it.
    const at = sceneToItem(parent, cx, cy);
    const from = sceneToItem(parent, mine.grabX, mine.grabY);
    const tx = at.x - from.x;
    const ty = at.y - from.y;
    to = adjusted(target, at.x, at.y, mine.targetX, mine.targetY, tx, ty, scale / mine.startScale, rotation - mine.startRotation);
    const xAxis = self.xAxis;
    const yAxis = self.yAxis;
    to.x = xAxis.enabled ? bound(xAxis.minimum, to.x, xAxis.maximum) : to.x - tx;
    to.y = yAxis.enabled ? bound(yAxis.minimum, to.y, yAxis.maximum) : to.y - ty;
    shift(self, tx, ty);
  } else {
    shift(self, cx - (a.pressX + b.pressX) / 2, cy - (a.pressY + b.pressY) / 2);
  }
  settle();
  if (scaleBy !== 1) {
    grouped(self, "scaleAxis$onActiveValueChanged", scaleBy);
    self.scaleChanged(scaleBy);
  }
  if (rotationBy !== 0) {
    grouped(self, "rotationAxis$onActiveValueChanged", rotationBy);
    self.rotationChanged(rotationBy);
  }
  shifted(self);
  if (to) {
    slot(target, "x").write(to.x);
    slot(target, "y").write(to.y);
    slot(target, "rotation").write(rotation);
    slot(target, "scale").write(scale);
    settle();
  }
  self.updated();
}

// A finger is gone: with one left there is no pinch.
function endPinch(self, point) {
  const mine = self.$mine;
  const index = mine.points.indexOf(point);
  if (index < 0) return;
  mine.points.splice(index, 1);
  if (!mine.active) return;
  mine.active = false;
  mine.scale = 1;
  mine.rotation = 0;
  slot(self, "active").write(false);
  slot(self, "activeScale").write(1);
  slot(self, "scaleAxis$activeValue").write(1);
  slot(self, "activeRotation").write(0);
  slot(self, "rotationAxis$activeValue").write(0);
  still(self);
  settle();
  self.$point.$reset();
  settle();
  self.centroidChanged();
}

export const PinchHandler = defineType("PinchHandler", PointerHandler, {
  properties: {
    minimumScale: -DBL_MAX,
    maximumScale: DBL_MAX,
    minimumRotation: -DBL_MAX,
    maximumRotation: DBL_MAX,
    activeScale: 1,
    persistentScale: 1,
    activeRotation: 0,
    persistentRotation: 0,
    activeTranslation: derived(translation),
    persistentTranslation: derived(translation),
    xAxis: axis(-DBL_MAX, DBL_MAX, 0),
    yAxis: axis(-DBL_MAX, DBL_MAX, 0),
    scaleAxis: axis(
      derived((self) => self.minimumScale),
      derived((self) => self.maximumScale),
      1,
    ),
    rotationAxis: axis(
      derived((self) => self.minimumRotation),
      derived((self) => self.maximumRotation),
      0,
    ),
  },
  // `scale`, `rotation` and `translation` tell their changes with how much
  // they changed by: signals of the handler's, not the kernel's.
  signals: ["centroidChanged", "scaleChanged", "rotationChanged", "translationChanged", "updated"],
  methods: {
    get centroid() {
      return this.$point;
    },
    // Qt's older names: the scale all pinches made, and what this one turned
    // and moved.
    get scale() {
      return this.persistentScale;
    },
    get rotation() {
      return this.activeRotation;
    },
    get translation() {
      return this.activeTranslation;
    },
    // Two fingers on the item. It only watches them until they pinch, and
    // never keeps a press from what is under it.
    $press(point) {
      const mine = this.$mine;
      const item = this.$parent;
      if (point.type !== "touch" || mine.points.length >= 2 || mine.points.includes(point)) return false;
      if (!wants(this, point) || !inside(item, point)) return false;
      mine.points.push(point);
      // Qt watches a finger once there are two, and says so of that one:
      // the first is watched here to hear of its moves, and nothing is said.
      if (mine.points.length < 2) {
        mine.unseen = point;
        watch(point, this);
        return false;
      }
      const [a, b] = mine.points;
      this.$point.$press(item, (a.pressX + b.pressX) / 2, (a.pressY + b.pressY) / 2, a);
      this.$point.$move(item, (a.x + b.x) / 2, (a.y + b.y) / 2, a);
      settle();
      this.centroidChanged();
      watch(point, this);
      return false;
    },
    $move(point) {
      const mine = this.$mine;
      if (mine.points.length === 2 && mine.points.includes(point)) gather(this, point);
    },
    $gathered() {
      pinch(this);
    },
    $release(point) {
      endPinch(this, point);
    },
    $grab(transition, point) {
      const mine = this.$mine;
      if (cancelled(transition)) endPinch(this, point);
      if (point === mine.unseen && transition < GrabExclusive) {
        if (transition !== GrabPassive) mine.unseen = null;
        return;
      }
      told(this, transition, point);
    },
  },
  setup(self) {
    self.$mine = {
      points: [],
      unseen: null,
      active: false,
      // Where the middle of the fingers was when the pinch began, how far
      // from it they were and in which direction, and what the target was.
      grabX: 0,
      grabY: 0,
      startDistance: 0,
      angleA: 0,
      angleB: 0,
      startScale: 1,
      startRotation: 0,
      targetX: 0,
      targetY: 0,
      // What this pinch has made so far.
      scale: 1,
      rotation: 0,
      x: 0,
      y: 0,
      dx: 0,
      dy: 0,
    };
    untouched(self);
  },
});

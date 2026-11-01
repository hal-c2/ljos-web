// SwipeDelegate: a row that is dragged aside to show what is under it: one
// thing to the left and one to the right (`swipe.left`, `swipe.right`), or
// one behind all of it (`swipe.behind`). `swipe.position` says how far it
// is, from -1 to 1, and a row let go of past half way, or fast enough, goes
// all the way: `swipe.complete`, `swipe.opened()`.
//
// What is under the row is made when it is first shown. It is not pressed
// itself: the row is, as in Qt, and passes the press on to what is under the
// pointer once it is open.
import { onCleanup } from "solid-js";
import { defineType, effect, group, instantiate, onChange, QtObject, settle, signal, slot } from "../../object.js";
import { styleHints } from "../../QtQml/application.js";
import { Property } from "../animation/property.js";
import { CancelGrabExclusive, takeExclusive } from "../pointer.js";
import { AbstractButton, setPressed, stopPressAndHold, stopPressRepeat } from "./AbstractButton.js";
import { put } from "./Control.js";
import { ItemDelegate } from "./ItemDelegate.js";
import { clamp, close, nothing } from "./Slider.js";
import { untrack } from "#kernel";

const NOTHING = Object.freeze({});

// How fast a swipe opens the row that is short of half way: pixels a second.
const FAST = 300;

const CHANGED = /^swipe\$on([A-Z])(\w*)Changed$/;

const MIXED = "SwipeDelegate: cannot set both behind and left/right properties";
const SHOWN = "SwipeDelegate: left/right/behind properties may only be set when swipe.position is 0";

const now = (self, name) => untrack(() => self.swipe[name]);
const widthOf = (item) => untrack(() => item.width);

// `SwipeDelegate.pressed` and `SwipeDelegate.onClicked`, of an item under
// the row that is no button.
const SwipeDelegateAttached = defineType("SwipeDelegateAttached", QtObject, {
  properties: { pressed: false },
  signals: ["clicked"],
});

const attachedOf = (item) => item.$attached?.SwipeDelegate;

const delegates = (mine) => mine.left || mine.right || mine.behind;

function setPosition(self, position) {
  slot(self, "swipe$position").write(clamp(position, -1, 1));
  settle();
}

function setComplete(self, complete) {
  if (now(self, "complete") === complete) return;
  slot(self, "swipe$complete").write(complete);
  settle();
  if (complete) self.swipe.completed();
}

// The row's `pressed`, heard before what is said next.
function press(self, pressed) {
  setPressed(self, pressed);
  settle();
}

// The item of a side, made of its component the first time it is asked for.
// It is under the content and the background, and the pointer passes it by:
// the row says what of it is pressed.
function make(self, side) {
  const mine = self.$swipe;
  if (mine.items[side]) return mine.items[side].object;
  const component = mine[side];
  if (typeof component !== "function") return null;
  const made = instantiate(component, NOTHING, self, self.$owner);
  const item = made.object;
  if (!item?.$node) {
    made.dispose();
    return null;
  }
  mine.items[side] = made;
  self.$keep(item, true);
  if (nothing(untrack(() => item.z))) slot(item, "z").write(-2);
  item.$node.style.pointerEvents = "none";
  slot(self, `swipe$${side}Item`).write(item);
  return item;
}

function unmake(self, side) {
  const mine = self.$swipe;
  const made = mine.items[side];
  if (!made) return;
  mine.items[side] = null;
  if (mine.pressedItem) mine.pressedItem = null;
  mine.holds = false;
  self.$keep(made.object, false);
  made.dispose();
  slot(self, `swipe$${side}Item`).write(null);
}

// What a side is given is taken while the row is closed, and `behind` not
// together with the other two. What is refused leaves the property as it
// was. A component that is replaced keeps its item, as in Qt.
function accept(self, side, component, first) {
  const mine = self.$swipe;
  component ??= null;
  if (component === mine[side]) return;
  const mixed = side === "behind" ? mine.left || mine.right : mine.behind;
  if (mixed || (!first && !nothing(now(self, "position")))) {
    console.warn(mixed ? MIXED : SHOWN);
    slot(self, `swipe$${side}`).write(mine[side]);
    return;
  }
  mine[side] = component;
  if (!component) unmake(self, side);
}

function visible(item, shown) {
  if (item) put(item, "visible", shown);
}

// Qt's `showRelevantItemForPosition`: what is under the row where it is now
// is seen, and of the two sides only that one.
function show(self, position) {
  const mine = self.$swipe;
  if (nothing(position)) return;
  if (mine.behind) {
    visible(make(self, "behind"), true);
  } else if (mine.right && position < 0) {
    visible(make(self, "right"), true);
    visible(mine.items.left?.object, false);
  } else if (mine.left && position > 0) {
    visible(make(self, "left"), true);
    visible(mine.items.right?.object, false);
  }
}

// Qt's `createRelevantItemForDistance`: the item a drag of that length shows.
// From closed it is the one on the side the drag uncovers; from open, the
// one that was open until the drag is longer than it is wide, and then the
// other.
function towards(self, distance) {
  const mine = self.$swipe;
  if (nothing(distance)) return null;
  if (mine.behind) return make(self, "behind");
  const before = mine.before;
  const far = Math.abs(distance);
  const left = mine.items.left?.object;
  const right = mine.items.right?.object;
  if (
    mine.right &&
    ((distance < 0 && before === 0) ||
      (right && before === -1 && distance < widthOf(right)) ||
      (left && before === 1 && far > widthOf(left)))
  ) {
    return make(self, "right");
  }
  if (
    mine.left &&
    ((distance > 0 && before === 0) ||
      (left && before === 1 && far < widthOf(left)) ||
      (right && before === -1 && far > widthOf(right)))
  ) {
    return make(self, "left");
  }
  return null;
}

// How far aside the content and the background are: the position, of the
// width of what it shows.
function offset(self) {
  const swipe = self.swipe;
  const position = swipe.position;
  if (nothing(position)) return 0;
  let item = null;
  if (swipe.behind) item = swipe.behindItem;
  else if (position < 0) item = swipe.right ? swipe.rightItem : null;
  else item = swipe.left ? swipe.leftItem : null;
  return item ? position * item.width : 0;
}

// Qt's transition manager stopping what it runs. A job of no set length, a
// SmoothedAnimation's, counts as finished when it is stopped, there too.
function halt(mine) {
  const job = mine.job;
  if (!job) return;
  job.stop();
  if (mine.job !== job) return;
  mine.job = null;
  mine.transition.$ran(false);
}

// Qt's `beginTransition`: the position goes to where the row opens or
// closes, at once or as `swipe.transition` takes it there.
function begin(self, position) {
  const mine = self.$swipe;
  if (mine.waiting) return;
  const transition = now(self, "transition");
  if (!transition?.$prepare || transition.enabled === false) {
    setPosition(self, position);
    finish(self);
    return;
  }
  halt(mine);
  const action = { property: mine.property, from: undefined, to: position, shown: false };
  const modified = [];
  const job = (mine.job = transition.$prepare([action], modified, false));
  mine.transition = transition;
  job.listener = mine.listener;
  transition.$ran(true);
  // What no animation of the transition takes is there at once.
  if (!modified.includes(action)) setPosition(self, position);
  job.start();
  settle();
}

function finish(self) {
  const mine = self.$swipe;
  settle();
  mine.waiting = false;
  const position = now(self, "position");
  setComplete(self, close(Math.abs(position), 1));
  if (now(self, "complete")) {
    self.swipe.opened();
  } else {
    if (nothing(position)) mine.wasComplete = false;
    self.swipe.closed();
  }
}

function open(self, side) {
  const mine = self.$swipe;
  if (close(Math.abs(now(self, "position")), 1)) return;
  if (side !== 1 && side !== -1) return;
  if (!mine.behind && !(side === 1 ? mine.left : mine.right)) return;
  begin(self, side);
  mine.wasComplete = true;
  mine.startTime = null;
  mine.before = now(self, "position");
}

function shut(self) {
  const mine = self.$swipe;
  if (nothing(now(self, "position")) || untrack(() => self.pressed)) return;
  begin(self, 0);
  // Nothing else moves the row until it is closed. As in Qt this is said
  // after the row began to close: with no transition it has closed by then,
  // and nothing unsays it, so such a row is opened and closed by `position`
  // alone from then on.
  mine.waiting = true;
  mine.wasComplete = false;
  mine.before = 0;
  mine.startTime = null;
}

// Where a swipe started and when: how fast it was is asked at its end.
function measure(mine, x, point) {
  mine.startX = x;
  mine.startTime = point ? point.time : null;
}

function velocity(mine, x, point) {
  if (mine.startTime === null || !point) return 0;
  return (x - mine.startX) / ((point.time - mine.startTime) / 1000);
}

// Qt's `getPressedItem`: the first of an item and what is in it that takes a
// press and has the pointer over it. One that is not seen takes none.
function pressedIn(item, point) {
  if (!item?.$node || !item.visible || !item.enabled) return null;
  const takes = attachedOf(item) || (typeof item.$press === "function" && item.$accepts !== 0);
  if (takes && item.contains(point.in(item))) return item;
  for (const child of item.children) {
    const found = pressedIn(child, point);
    if (found) return found;
  }
  return null;
}

// Qt's `attachedObjectsSetPressed`: the items from `from` down that have the
// pointer over them and say `SwipeDelegate.pressed` are told. One that was
// pressed and is so no longer was clicked, unless the press was taken away.
function tell(from, point, pressed, cancelled) {
  return untrack(() => {
    let found = false;
    const items = [from];
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const attached = attachedOf(item);
      if (attached && item.contains(point.in(item))) {
        const was = attached.pressed;
        if (put(attached, "pressed", pressed)) settle();
        if (was && !pressed && !cancelled) attached.clicked();
        found = true;
      }
      for (const child of item.children) if (child.$node) items.push(child);
    }
    return found;
  });
}

// None of them is pressed any longer, and none was clicked.
function forget(from) {
  if (!from) return;
  untrack(() => {
    const items = [from];
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const attached = attachedOf(item);
      if (attached && put(attached, "pressed", false)) settle();
      for (const child of item.children) if (child.$node) items.push(child);
    }
  });
}

// Qt's `forwardMouseEvent`: what is under the open row is sent what the row
// was sent, and the row is pressed unless that took it.
function forward(self, item, method, point) {
  const mine = self.$swipe;
  if (method === "$press") {
    mine.takes = mine.holds = Boolean(item.$press?.(point));
  } else if (mine.holds) {
    item[method]?.(point);
    if (method === "$release") {
      mine.holds = false;
      // A move said it was hovered, and nothing else would unsay it.
      item.$hover?.(point, false);
    }
  }
  press(self, !mine.takes);
}

// What took the press under the row has it no longer, and is not clicked.
function letGo(mine) {
  if (!mine.holds) return;
  mine.holds = false;
  const item = mine.pressedItem;
  item.$grab?.(CancelGrabExclusive, mine.point);
  item.$hover?.(mine.point, false);
}

// Qt's `handleMouseMoveEvent`, for the row and then for what is pressed
// under it. A move across of more than the distance of a drag is a swipe:
// the row keeps the pointer and follows it.
function moved(self, item, x, y, point) {
  const mine = self.$swipe;
  const button = self.$button;
  const threshold = styleHints().startDragDistance;
  if (button.holding && Math.hypot(x - button.x, y - button.y) > threshold) stopPressAndHold(self);
  if (!now(self, "enabled") || !delegates(mine)) return;
  const [width, height, pressed] = untrack(() => [self.width, self.height, self.pressed]);
  if (width === 0) return;
  if (item !== self && now(self, "complete")) forward(self, item, "$move", point);
  if (item === self && !pressed) return;
  const distance = x - button.x;
  if (!mine.keeping && Math.abs(distance) > threshold && takeExclusive(point, self)) {
    mine.keeping = true;
    press(self, true);
    setComplete(self, false);
    // Qt sends a button under the row the moves that follow, mapped the
    // wrong way, which presses it no longer without a word. Here it is told
    // that it lost the press.
    letGo(mine);
    tell(item, point, false, true);
  }
  if (!mine.keeping) {
    // No swipe yet, and above or below the row it is pressed no longer.
    if (y < 0 || y > height) press(self, false);
    return;
  }
  // A row that is open is not dragged further open: the position would go
  // round.
  const before = mine.before;
  const sides = (mine.left || mine.right) && (nothing(before) || (before === -1 ? distance >= 0 : before === 1 && distance <= 0));
  if (!mine.behind && !sides) return;
  // The item is made here, for the position is a part of its width.
  const relevant = towards(self, distance);
  const normalized = relevant ? distance / widthOf(relevant) : 0;
  let position;
  // Back where it was before the press, or dragged from open by just the
  // width of what was open.
  if (nothing(normalized)) position = nothing(distance) ? before : 0;
  else if (!mine.wasComplete) position = normalized;
  else position = distance > 0 ? normalized - 1 : normalized + 1;
  halt(mine);
  setPosition(self, position);
}

// Qt's `handleMouseReleaseEvent`: the row goes where it was let go nearest
// to, or where it was going fast. Whether it was a swipe that ended, which
// is no click.
function released(self, item, x, point) {
  const mine = self.$swipe;
  const swiped = mine.keeping;
  mine.keeping = false;
  const speed = velocity(mine, x, point);
  // `close()` leaves a row that is pressed alone, and this may close it.
  if (now(self, "position") !== 0) press(self, false);
  if (swiped) {
    press(self, false);
    stopPressRepeat(self);
    stopPressAndHold(self);
    self.$button.double = false;
    self.canceled();
  }
  if (item !== self && (now(self, "complete") || mine.wasComplete)) forward(self, item, "$release", point);
  const position = now(self, "position");
  if (position > 0.5 || (position > 0 && speed > FAST)) {
    begin(self, 1);
    mine.wasComplete = true;
  } else if (position < -0.5 || (position < 0 && speed < -FAST)) {
    begin(self, -1);
    mine.wasComplete = true;
  } else if (!mine.job) {
    // Closed already when it was only clicked.
    if (!nothing(position)) begin(self, 0);
    mine.wasComplete = false;
  }
  if (point) tell(item, point, false, false);
  return swiped;
}

export const SwipeDelegate = defineType("SwipeDelegate", ItemDelegate, {
  properties: {
    swipe: group({
      position: 0,
      complete: false,
      enabled: true,
      left: null,
      behind: null,
      right: null,
      leftItem: null,
      behindItem: null,
      rightItem: null,
      transition: null,
    }),
  },
  resolve: { swipe$position: (self, own) => clamp(own(), -1, 1) },
  enums: { Left: 1, Right: -1 },
  attached: SwipeDelegateAttached,
  methods: {
    // A swipe is the row's: a view it is in does not take it for a flick.
    $keeps() {
      return this.$swipe.keeping;
    },
    // The content is aside by as much as the row is open.
    $inside() {
      return [this.leftPadding + offset(this), this.topPadding, this.availableWidth, this.availableHeight];
    },
    $handlePress(x, y, point) {
      AbstractButton.proto.$handlePress.call(this, x, y, point);
      const mine = this.$swipe;
      if (!now(this, "enabled")) return;
      mine.before = now(this, "position");
      measure(mine, x, point);
      if (!point || !now(this, "complete")) return;
      // What is open is pressed through the row: the right side is asked
      // first, and what is behind never, as in Qt.
      const item = untrack(() => pressedIn(this.swipe.rightItem, point) ?? pressedIn(this.swipe.leftItem, point));
      mine.pressedItem = item;
      mine.point = point;
      if (!item) return;
      forward(this, item, "$press", point);
      tell(item, point, true, false);
    },
    $handleMove(x, y, point) {
      const mine = this.$swipe;
      // A row with something under it stays pressed when the pointer leaves
      // it sideways.
      if (delegates(mine)) moved(this, this, x, y, point);
      else AbstractButton.proto.$handleMove.call(this, x, y, point);
      if (mine.pressedItem) moved(this, mine.pressedItem, x, y, point);
    },
    $handleRelease(x, y, point) {
      const mine = this.$swipe;
      if (!delegates(mine) || !released(this, this, x, point)) {
        AbstractButton.proto.$handleRelease.call(this, x, y, point);
      }
      if (!mine.pressedItem) return;
      released(this, mine.pressedItem, x, point);
      letGo(mine);
      mine.pressedItem = null;
    },
    // The row is pressed no longer, and as in Qt says nothing of it: a
    // swipe that ended has said `canceled` already.
    $handleUngrab() {
      const mine = this.$swipe;
      mine.keeping = false;
      setPressed(this, false);
      stopPressRepeat(this);
      stopPressAndHold(this);
      this.$button.double = false;
      settle();
      letGo(mine);
      forget(mine.items.right?.object);
      forget(mine.items.left?.object);
      mine.pressedItem = mine.point = null;
    },
  },
  setup(self, props) {
    const swipe = self.swipe;
    const mine = (self.$swipe = {
      // The components that were taken, and what was made of them.
      left: null,
      right: null,
      behind: null,
      items: { left: null, right: null, behind: null },
      // Qt's `positionBeforePress`, `wasComplete` and `waitForTransition`.
      before: 0,
      wasComplete: false,
      waiting: false,
      // Whether a swipe is on.
      keeping: false,
      // What is pressed under the row, whether it took the press and
      // whether it still has it.
      pressedItem: null,
      point: null,
      takes: false,
      holds: false,
      startX: 0,
      startTime: null,
      job: null,
      transition: null,
      // An animation of the transition says `position`, as of Qt's `swipe`.
      property: Object.assign(new Property(self, "swipe$position"), { object: swipe, key: "position" }),
      listener: {
        finished(job) {
          if (mine.job !== job) return;
          mine.job = null;
          mine.transition.$ran(false);
          finish(self);
        },
      },
    });
    // A handler of the group is a binding as the compiler has it: reading
    // it runs it. One given as a function is called.
    const said = (key) =>
      signal(() => {
        const handler = untrack(() => props[key]);
        return typeof handler === "function" ? handler : undefined;
      });
    Object.defineProperties(swipe, {
      open: { value: (side) => open(self, side) },
      close: { value: () => shut(self) },
      opened: { value: said("swipe$onOpened") },
      closed: { value: said("swipe$onClosed") },
      completed: { value: said("swipe$onCompleted") },
    });
    for (const key in props) {
      const found = CHANGED.exec(key);
      const name = found && found[1].toLowerCase() + found[2];
      if (!name || !(name in swipe)) continue;
      onChange(swipe, name, () => {
        const handler = props[key];
        if (typeof handler === "function") handler();
      });
    }
    // A finger that goes across is the row's; up and down is the view's.
    self.$node.style.touchAction = "pan-y";
    let first = true;
    effect(
      () => [swipe.position, swipe.left, swipe.right, swipe.behind],
      ([position, left, right, behind]) =>
        untrack(() => {
          accept(self, "left", left, first);
          accept(self, "right", right, first);
          accept(self, "behind", behind, first);
          first = false;
          show(self, position);
        }),
    );
    // The background goes aside with the content. Qt puts it there whatever
    // its insets.
    let behind = null;
    effect(
      () => [self.background, offset(self)],
      ([background, x]) => {
        if (behind && behind !== background) slot(behind, "x").place(undefined);
        behind = background;
        if (background) slot(background, "x").place(x);
      },
    );
    onCleanup(() => {
      const job = mine.job;
      if (!job) return;
      mine.job = null;
      job.stop();
      mine.transition.$ran(false);
    });
  },
});

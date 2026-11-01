// PathView: the rows of a model along a path.
//
// Where a row is depends on `offset`: how many rows the view has been
// turned by. A row is at a fraction of the path, and has a delegate while
// that is less than 1; `pathItemCount` says how many are on the path at a
// time. With a highlight range that is strictly enforced, which is what Qt
// starts with, the row at `preferredHighlightBegin` is the current one:
// turning the view changes it, and choosing another turns the view.
//
// Not done: `PathPercent` (rows are spread evenly along the path's length),
// `cacheItemCount` (a row off the path has no delegate), and what Qt does
// with the highlight when the range is not enforced, where it moves it by
// its own clock: here it is where the current row is.
import { defineType, derived, effect, instantiate, QtObject, settle, slot } from "../object.js";
import { clock } from "./animation/clock.js";
import { Item } from "./Item.js";
import { LeftButton } from "./keycodes.js";
import { delegateOf, modelOf, Rows, size } from "./model.js";
import { cull } from "./placing.js";
import { canTake, CancelGrabExclusive, CancelGrabPassive, receive, takeExclusive } from "./pointer.js";
import { signal, untrack } from "#kernel";

const NONE = Object.freeze([]);
const next = (version) => version + 1;

const NoHighlightRange = 0;
const StrictlyEnforceRange = 2;
const NoSnap = 0;
const SnapOneItem = 2;
const Shortest = 0;
const Negative = 1;
const Positive = 2;
const Beginning = 0;
const Center = 1;
const End = 2;
const Contain = 4;
const SnapPosition = 5;

// Why the view last moved: the current index was set, the mouse, or
// anything else. Only the first leaves the current index alone.
const OTHER = 0;
const SET = 1;
const MOUSE = 2;

// Qt's: how far a press goes before it is a drag, how slow a release is no
// flick, and how long a point that stopped moving still has its speed.
const DRAG_THRESHOLD = 10;
const MINIMUM_FLICK_VELOCITY = 75;
const VELOCITY_DECAY = 50;

// What the view's moves are made of.
const MOVE = 0;
const JUMP = 1;
const SLOW = 2;
const CALL = 3;

const inQuad = (t) => t * t;
const outQuad = (t) => -t * (t - 2);
const inOutQuad = (t) => (t < 0.5 ? 2 * t * t : -2 * (t - 1) * (t - 1) + 1);

const mod = (value, by) => ((value % by) + by) % by;

// `QQuickPathViewPrivate::calcCurrentIndex`: the row the offset puts at the
// start of the highlight range.
const nearest = (st) => (st.rows.count ? Math.floor(st.rows.count - st.offset + 0.5) % st.rows.count : 0);

const ranged = (self) => self.preferredHighlightBegin <= self.preferredHighlightEnd;
const strict = (self) => ranged(self) && self.highlightRangeMode === StrictlyEnforceRange;
const snaps = (self) => ranged(self) && (self.highlightRangeMode !== NoHighlightRange || self.snapMode !== NoSnap);

// How many rows are on the path at a time.
function shownCount(self, st) {
  const limit = self.pathItemCount;
  return limit < 0 ? st.rows.count : Math.min(limit, st.rows.count);
}

// `positionOfIndex`: the fraction of the path a row is at, 1 or more for
// one that is off it.
function positionOf(self, st, index) {
  const count = st.rows.count;
  const limit = self.pathItemCount;
  const start = snaps(self) ? self.preferredHighlightBegin : 0;
  let along = ((index + st.offset) % count) / count;
  if (limit >= 0 && limit < count) {
    const mapped = count / limit;
    return ((along + start / mapped) % 1) * mapped;
  }
  along = (along + start) % 1;
  return along;
}

// Puts an item at a fraction of the path, by its centre. One that is off
// the path is at its end and is not seen.
function locate(st, item, percent) {
  if (!item?.$node) return;
  item.$along = percent;
  const [x, y] = st.outline.pointAt(Math.min(percent, 1));
  slot(item, "x").place(x - item.width / 2);
  slot(item, "y").place(y - item.height / 2);
  cull(item, percent >= 1);
  item.$attached?.PathView?.$move();
}

// A row is put again when it is elsewhere on the path, or of another size.
function put(st, row, percent) {
  const item = row.$item;
  const width = item?.width;
  const height = item?.height;
  if (row.$percent === percent && row.$width === width && row.$height === height) return;
  row.$percent = percent;
  row.$width = width;
  row.$height = height;
  locate(st, item, percent);
}

// Qt's `refill`: every row that is on the path has its delegate, where the
// offset puts it, and the others have none. The current row keeps its own
// wherever it is.
function refill(self, st) {
  const { rows } = st;
  const count = rows.count;
  const on = st.on;
  on.clear();
  if (st.outline && count && rows.ready) {
    const limit = self.pathItemCount;
    const place = (index) => {
      const percent = positionOf(self, st, index);
      if (!(percent >= 0 && percent < 1)) return;
      on.add(index);
      put(st, rows.row(index), percent);
    };
    if (limit >= 0 && limit < count) {
      // Only so many are on it: the ones from where the path starts.
      const start = snaps(self) ? self.preferredHighlightBegin : 0;
      const first = Math.ceil(-(st.offset + start * limit)) - 1;
      if (limit > 0) for (let step = 0; step <= limit + 1; step++) place(mod(first + step, count));
    } else {
      for (let index = 0; index < count; index++) place(index);
    }
  }
  const current = st.current;
  for (const row of [...rows.live.values()]) {
    if (on.has(row.$index)) continue;
    if (row.$index === current && st.outline) put(st, row, 1);
    else rows.release(row);
  }
  if (st.outline && rows.ready && current >= 0 && current < count && !rows.live.has(current)) put(st, rows.row(current), 1);
  const highlight = st.highlight.item;
  if (highlight && st.outline) {
    // In the range, or on the current row.
    if (strict(self)) locate(st, highlight, self.preferredHighlightBegin);
    else locate(st, highlight, rows.live.get(current)?.$percent ?? 1);
  }
  if (st.touched) {
    st.touched = false;
    st.setItems(next);
  }
}

function setCurrent(self, st, index) {
  st.current = index;
  slot(self, "currentIndex").write(index);
}

// `QQuickPathViewPrivate::setOffset`: the offset is within the rows.
function setOffset(self, st, value) {
  const count = st.rows.count;
  if (count) value = mod(value, count);
  st.offset = value;
  if (self.offset !== value) slot(self, "offset").write(value);
}

// `updateCurrent`: turned by anything but a choice of the current row, the
// view makes the row in the highlight range the current one.
function updateCurrent(self, st) {
  if (st.reason === SET || !st.rows.count || !strict(self)) return;
  const index = nearest(st);
  if (index !== st.current) setCurrent(self, st, index);
}

// `setCurrentIndex`: the row is the current one, and the view turns to it.
function setIndex(self, st, index) {
  const count = st.rows.count;
  index = count ? mod(index, count) : 0;
  if (index === st.current) {
    slot(self, "currentIndex").write(index);
    return;
  }
  setCurrent(self, st, index);
  st.reason = SET;
  if (count && strict(self)) snapTo(self, st, index, SET);
}

function setMoving(self, st, moving) {
  if (st.moving === moving) return;
  st.moving = moving;
  slot(self, "moving").write(moving);
  if (moving) self.movementStarted();
  else self.movementEnded();
}

function setFlicking(self, st, flicking) {
  if (st.flicking === flicking) return;
  st.flicking = flicking;
  slot(self, "flicking").write(flicking);
  if (flicking) self.flickStarted();
  else self.flickEnded();
}

function setDragging(self, st, dragging) {
  if (st.dragging === dragging) return;
  st.dragging = dragging;
  slot(self, "dragging").write(dragging);
  if (dragging) self.dragStarted();
  else self.dragEnded();
}

// `movementEnding`: the view has come to rest.
function ending(self, st) {
  setFlicking(self, st, false);
  if (!st.steal) setMoving(self, st, false);
  st.direction = self.movementDirection;
}

// The moves the view has yet to make, one after the other: Qt's timeline.
// It runs on the clock.
function clear(st) {
  st.ops.length = 0;
  if (!st.active) return;
  st.active = false;
  clock.remove(st.job);
}

function begin(st) {
  clear(st);
  st.value = st.offset;
  st.adjust = 0;
}

function start(self, st) {
  if (st.ticking) return;
  if (!st.active) {
    st.active = true;
    st.elapsed = 0;
    clock.add(st.job);
  }
  tick(self, st, 0);
}

const slowed = (op, ms) => op.from + (op.velocity * ms) / 1000 + (0.5 * op.rate * ms * ms) / 1e6;

function tick(self, st, delta) {
  if (st.ticking) return;
  st.ticking = true;
  const ops = st.ops;
  let left = delta;
  st.elapsed += delta;
  try {
    while (ops.length) {
      const op = ops[0];
      if (op.kind === CALL) {
        ops.shift();
        setOffset(self, st, st.value + st.adjust);
        op.work();
        continue;
      }
      if (op.kind === JUMP) {
        st.value = op.to;
        ops.shift();
        continue;
      }
      if (op.from === undefined) op.from = st.value;
      const used = Math.min(left, op.length - op.at);
      op.at += used;
      left -= used;
      if (op.at >= op.length) {
        st.value = op.kind === MOVE ? op.to : slowed(op, op.length);
        ops.shift();
        continue;
      }
      st.value = op.kind === MOVE ? op.from + (op.to - op.from) * op.ease(op.at / op.length) : slowed(op, op.at);
      break;
    }
    setOffset(self, st, st.value + st.adjust);
    updateCurrent(self, st);
  } finally {
    st.ticking = false;
  }
  if (ops.length) return;
  clear(st);
  ending(self, st);
}

const move = (st, to, ease, length) => st.ops.push({ kind: MOVE, from: undefined, to, ease, length: Math.max(0, Math.trunc(length)), at: 0 });
const jump = (st, to) => st.ops.push({ kind: JUMP, to });

// `QQuickTimeLine::accel`: on from where it is at a speed that falls off,
// no further than `distance`.
function slow(st, velocity, rate, distance) {
  if (!(Math.abs(distance) > 1e-12) || !(Math.abs(rate) > 1e-12)) return;
  rate = Math.max(rate, (velocity * velocity) / (2 * distance));
  if (velocity > 0 === rate > 0) rate = -rate;
  const length = Math.trunc((-1000 * velocity) / rate);
  if (length > 0) st.ops.push({ kind: SLOW, from: undefined, velocity, rate, length, at: 0 });
}

// `snapToIndex`: the view turns until the row is at the start of the
// highlight range, the way it is going or the shorter way round.
function snapTo(self, st, index, reason) {
  const count = st.rows.count;
  if (!count || !st.outline) return;
  const target = mod(count - index, count);
  st.reason = reason;
  begin(st);
  const offset = st.offset;
  const duration = self.highlightMoveDuration;
  // Within half a pixel there is nothing to show of a move.
  const threshold = 0.5 / (st.outline.length / shownCount(self, st));
  const direction = st.direction;
  if (!(duration > 0) || Math.abs(offset - target) < threshold || (target === 0 && Math.abs(count - offset) < threshold)) {
    jump(st, target);
  } else if (direction === Positive || (direction === Shortest && target - offset > count / 2)) {
    const distance = count - target + offset;
    if (target > offset) {
      move(st, 0, inQuad, (duration * offset) / distance);
      jump(st, count);
      move(st, target, offset === 0 ? inOutQuad : outQuad, (duration * (count - target)) / distance);
    } else {
      move(st, target, inOutQuad, duration);
    }
  } else if (direction === Negative || target - offset <= -count / 2) {
    const distance = count - offset + target;
    if (target < offset) {
      move(st, count, target === 0 ? inOutQuad : inQuad, (duration * (count - offset)) / distance);
      jump(st, 0);
      move(st, target, outQuad, (duration * target) / distance);
    } else {
      move(st, target, inOutQuad, duration);
    }
  } else {
    move(st, target, inOutQuad, duration);
  }
  start(self, st);
}

// `fixOffset`: left between two rows, the view goes on to the nearer.
function fixOffset(self, st) {
  if (!st.rows.count || !st.outline || !snaps(self)) return;
  const index = nearest(st);
  if (index !== st.current && self.highlightRangeMode === StrictlyEnforceRange) setIndex(self, st, index);
  else snapTo(self, st, index, OTHER);
}

// `pointNear`: the point of the path nearest to one of the view's, and the
// fraction of the path it is at.
function pointNear(outline, x, y) {
  const length = outline.length;
  const samples = Math.min(length / 5, 500);
  const res = length / samples;
  let [nearX, nearY] = outline.pointAt(0);
  let near = 0;
  let least = 1e10;
  const look = (at) => {
    const [px, py] = outline.pointAt(at / samples);
    const distance = (px - x) * (px - x) + (py - y) * (py - y);
    if (distance >= least) return;
    least = distance;
    near = at;
    nearX = px;
    nearY = py;
  };
  if (samples > 0) {
    for (let at = 1; at < samples; at++) look(at);
    const about = near;
    for (let at = about - 1; at < about + 1; at += 1 / (2 * res)) look(at);
  }
  return { x: nearX, y: nearY, percent: samples > 0 ? near / samples : 0 };
}

// A press on a delegate, or near enough to the path, may become a drag.
function pressed(self, st, point) {
  st.press = point.pressTime;
  if (!self.interactive || !st.rows.count || !st.outline || !st.on.size) return;
  st.sampled = false;
  let hit = false;
  for (const row of st.rows.live.values()) {
    const item = row.$item;
    if (row.$percent < 1 && item?.$node && item.contains(point.in(item))) {
      hit = true;
      break;
    }
  }
  const margin = self.dragMargin;
  if (!hit && !(margin > 0)) return;
  const at = point.in(self);
  const near = pointNear(st.outline, at.x, at.y);
  if (!hit && Math.hypot(near.x - at.x, near.y - at.y) > margin) return;
  st.startPoint = near;
  st.startPc = near.percent;
  st.startX = at.x;
  st.startY = at.y;
  // A press on a view that was flicked takes it in hand at once.
  st.steal = st.active && st.flicking && st.flickLength > 0 && st.elapsed / st.flickLength < 0.8;
  st.timing = true;
  st.lastTime = point.time;
  clear(st);
}

function dragged(self, st, point) {
  const count = st.rows.count;
  if (!self.interactive || !st.timing || !count || !st.outline) return;
  const at = point.in(self);
  const near = pointNear(st.outline, at.x, at.y);
  if (!st.steal) {
    if (Math.abs(at.x - st.startX) > DRAG_THRESHOLD || Math.abs(at.y - st.startY) > DRAG_THRESHOLD) {
      // Past the threshold: it is the view's if it went along the path.
      const along = DRAG_THRESHOLD * 0.8;
      if (Math.abs(near.x - st.startPoint.x) > along || Math.abs(near.y - st.startPoint.y) > along) st.steal = true;
    }
  } else {
    let diff = (near.percent - st.startPc) * shownCount(self, st);
    if (Math.abs(diff) > 1e-12) {
      st.reason = OTHER;
      setOffset(self, st, st.offset + diff);
      updateCurrent(self, st);
      if (diff > count / 2) diff -= count;
      else if (diff < -count / 2) diff += count;
      const elapsed = point.time - st.lastTime;
      if (elapsed > 0) {
        st.velocity = diff / (elapsed / 1000);
        st.sampled = true;
      }
    }
    st.reason = MOUSE;
    setMoving(self, st, true);
    setDragging(self, st, true);
  }
  st.startPc = near.percent;
  st.lastTime = point.time;
}

function released(self, st, point) {
  st.steal = false;
  setDragging(self, st, false);
  const count = st.rows.count;
  if (!self.interactive || !st.timing || !count || !st.outline) {
    st.timing = false;
    if (!st.active) ending(self, st);
    return;
  }
  st.timing = false;
  // A point that rested before it was let go has lost its speed.
  const rested = point.time - st.lastTime;
  let velocity = (st.sampled ? st.velocity : 0) * (Math.max(0, VELOCITY_DECAY - rested) / VELOCITY_DECAY);
  const each = st.outline.length / shownCount(self, st);
  const snap = self.snapMode;
  if (Math.abs(each * velocity) > MINIMUM_FLICK_VELOCITY) {
    const most = self.maximumFlickVelocity;
    if (Math.abs(each * velocity) > most || snap === SnapOneItem) velocity = (velocity < 0 ? -most : most) / each;
    const squared = velocity * velocity;
    let rate = self.flickDeceleration / 10;
    let distance;
    if (ranged(self) && (self.highlightRangeMode === StrictlyEnforceRange || snap !== NoSnap)) {
      const offset = st.offset;
      if (snap === SnapOneItem) {
        // One row on, the way it was going.
        distance = velocity > 0 ? Math.round(0.5 + offset) - offset : Math.round(0.5 - offset) + offset;
      } else {
        // A little further than its speed takes it, to the row there.
        distance = Math.min(count - 1, squared / (rate * 2) + 0.25);
        distance = velocity > 0 ? Math.round(distance + offset) - offset : Math.round(distance - offset) + offset;
      }
      if (distance <= 0) {
        distance = 0;
        rate = 0;
      } else {
        rate = squared / (2 * distance);
      }
    } else {
      distance = Math.min(count - 1, squared / (rate * 2));
    }
    st.flickLength = rate ? Math.trunc((1000 * Math.abs(velocity)) / rate) : 0;
    begin(st);
    slow(st, velocity, rate, distance);
    st.ops.push({ kind: CALL, work: () => fixOffset(self, st) });
    setFlicking(self, st, true);
    start(self, st);
  } else {
    fixOffset(self, st);
  }
  if (!st.active) ending(self, st);
}

// Whether the view acts on a point that is another's: what Qt asks in
// `sendMouseEvent`.
const acts = (self, st, point) => (st.steal || self.contains(point.in(self))) && canTake(point, self);

// The item of the view an attached object is for, and the view.
const viewOf = (item) => item.$delegate?.$view ?? (item.$parent?.$pv ? item.$parent : null);

// What the path says of where the item is, by the names it gives them:
// `PathView.iconScale`.
function name(attached, names) {
  for (const key of names) {
    if (key in attached) continue;
    Object.defineProperty(attached, key, {
      get() {
        this.$moved();
        const item = this.$of;
        const st = viewOf(item)?.$pv;
        if (!st?.path || item.$along === undefined || !st.names.includes(key)) return undefined;
        return st.path.$attributeAt(key, Math.min(item.$along, 1));
      },
      enumerable: true,
      configurable: true,
    });
  }
}

const PathViewAttached = defineType("PathViewAttached", QtObject, {
  properties: {
    view: derived((self) => {
      self.$moved();
      return viewOf(self.$of);
    }),
    isCurrentItem: derived((self) => {
      self.$moved();
      const view = self.$of.$delegate?.$view;
      return Boolean(view?.$pv) && view.currentItem === self.$of;
    }),
    onPath: derived((self) => {
      self.$moved();
      return (self.$of.$along ?? 1) < 1;
    }),
  },
  setup(self, props) {
    self.$of = props.$attachee;
    const [moved, setMoved] = signal(0, self.$owner);
    self.$moved = moved;
    self.$move = () => setMoved(next);
    name(self, viewOf(self.$of)?.$pv?.names ?? NONE);
  },
});

class Line {
  constructor(self, st) {
    this.self = self;
    this.st = st;
  }

  advance(delta) {
    tick(this.self, this.st, delta);
  }

  idle() {
    return 0;
  }
}

export const PathView = defineType("PathView", Item, {
  properties: {
    model: undefined,
    delegate: undefined,
    path: null,
    count: 0,
    currentIndex: 0,
    currentItem: derived((self) => {
      const st = self.$pv;
      if (!st) return null;
      st.items();
      return st.rows.live.get(self.currentIndex)?.$item ?? null;
    }),
    offset: 0,
    highlight: undefined,
    highlightItem: null,
    preferredHighlightBegin: 0,
    preferredHighlightEnd: 0,
    highlightRangeMode: StrictlyEnforceRange,
    highlightMoveDuration: 300,
    dragMargin: 0,
    maximumFlickVelocity: 2500,
    flickDeceleration: 100,
    interactive: true,
    moving: false,
    flicking: false,
    dragging: false,
    pathItemCount: -1,
    snapMode: NoSnap,
    movementDirection: Shortest,
    cacheItemCount: 0,
  },
  signals: ["movementStarted", "movementEnded", "flickStarted", "flickEnded", "dragStarted", "dragEnded"],
  enums: {
    NoHighlightRange,
    ApplyRange: 1,
    StrictlyEnforceRange,
    NoSnap,
    SnapToItem: 1,
    SnapOneItem,
    Shortest,
    Negative,
    Positive,
    Beginning,
    Center,
    End,
    Contain,
    SnapPosition,
  },
  attached: PathViewAttached,
  resolve: {
    // `pathItemCount = undefined`: as many as there are.
    pathItemCount: (self, own) => {
      const limit = own();
      return limit == null || !(limit >= 0) ? -1 : Math.trunc(limit);
    },
  },
  methods: {
    incrementCurrentIndex() {
      const st = this.$pv;
      st.direction = Positive;
      this.currentIndex = st.current + 1;
    },
    decrementCurrentIndex() {
      const st = this.$pv;
      const count = st.rows.count;
      if (!count) return;
      st.direction = Negative;
      this.currentIndex = mod(st.current - 1, count);
    },
    // Turns the view so that a row is where `mode` says: at the start of the
    // path, its middle, its end, anywhere on it, or where the current row is.
    positionViewAtIndex(index, mode) {
      const st = this.$pv;
      const count = st.rows.count;
      if (!count || !st.outline || !(mode >= Beginning && mode <= SnapPosition) || mode === 3) return;
      const limit = untrack(() => this.pathItemCount);
      if (mode === Contain && (limit < 0 || count <= limit)) return;
      const shown = limit < 0 ? count : Math.min(limit, count);
      const row = mod(Math.trunc(index) + count, count);
      const snap = untrack(() => snaps(this));
      let begin;
      let end;
      if (snap) {
        begin = count - row - Math.floor(shown * untrack(() => this.preferredHighlightBegin));
        end = begin + shown - 1;
      } else {
        begin = count - row;
        // The end of the path is where it starts, short of that.
        end = ((begin + shown) % count) - 1e-12;
      }
      let offset = st.offset;
      if (mode === Beginning) {
        offset = begin;
      } else if (mode === End) {
        offset = end;
      } else if (mode === Center) {
        offset = begin < end ? (begin + end) / 2 : (begin + end + count) / 2;
        if (snap) offset = Math.round(offset);
      } else if (mode === Contain) {
        if ((begin < end && (offset < begin || offset > end)) || (offset < begin && offset > end)) {
          const before = (begin - offset + count) % count;
          const after = (offset - end + count) % count;
          offset = before < after ? begin : end;
        }
      } else {
        offset = count - row;
      }
      clear(st);
      this.offset = offset;
    },
    // The delegate at a point of the view, and its row.
    itemAt(x, y) {
      const st = this.$pv;
      st.items();
      return untrack(() => {
        for (let index = 0; index < st.rows.count; index++) {
          const row = st.rows.live.get(index);
          const item = row?.$item;
          if (!item?.$node || !(row.$percent < 1)) continue;
          if (item.contains(item.mapFromItem(this, x, y))) return item;
        }
        return null;
      });
    },
    indexAt(x, y) {
      return this.itemAt(x, y)?.$delegate?.$index ?? -1;
    },
    // A row's delegate, if the row is on the path.
    itemAtIndex(index) {
      const st = this.$pv;
      st.items();
      const row = st.rows.live.get(index);
      return row && row.$percent < 1 ? (row.$item ?? null) : null;
    },
    // The mouse. The view takes a press that is in it, and one on something
    // inside it too, which it leaves to that until it is a drag.
    $press(point) {
      const st = this.$pv;
      if (!point.primary || point.button !== LeftButton || !this.interactive) return false;
      if (st.press !== point.pressTime) pressed(this, st, point);
      settle();
      return true;
    },
    $filter(point) {
      const st = this.$pv;
      if (!point.primary || point.button !== LeftButton || !this.interactive || !this.visible) return false;
      if (!this.contains(point.in(this))) return false;
      pressed(this, st, point);
      settle();
      return st.timing;
    },
    $move(point) {
      const st = this.$pv;
      // It takes the point on the move after the one that made it a drag.
      const stealing = st.steal;
      if (point.exclusive === this || acts(this, st, point)) {
        dragged(this, st, point);
        if (stealing && point.exclusive !== this) takeExclusive(point, this);
      } else if (st.timing) {
        st.timing = false;
        fixOffset(this, st);
      }
      settle();
    },
    $release(point) {
      const st = this.$pv;
      if (point.exclusive === this || acts(this, st, point)) {
        released(this, st, point);
      } else {
        if (st.timing) {
          st.timing = false;
          fixOffset(this, st);
        }
        st.steal = false;
      }
      settle();
    },
    // What it held was taken from it: Qt's `mouseUngrabEvent`.
    $grab(transition) {
      if (transition !== CancelGrabExclusive && transition !== CancelGrabPassive) return;
      const st = this.$pv;
      const astray = !st.flicking && this.snapMode !== NoSnap && Math.round(st.offset) !== st.offset;
      if (st.steal || astray) {
        st.steal = false;
        st.timing = false;
        fixOffset(this, st);
        setDragging(this, st, false);
        if (!st.active) ending(this, st);
      }
      st.timing = false;
      settle();
    },
    $keeps() {
      return this.$pv.steal;
    },
  },
  setup(self) {
    const [version, bump] = signal(0, self.$owner);
    const [items, setItems] = signal(0, self.$owner);
    const changed = () => {
      slot(self, "count").write(rows.count);
      st.touched = true;
      bump(next);
    };
    // `modelUpdated`: rows came, went or moved. The current row is the one
    // it was, and the view is turned so that it stays where it was.
    const updated = (current) => {
      const count = rows.count;
      if (count) st.offset = mod(st.offset, count);
      if (current < 0) current = nearest(st);
      if (!count) {
        st.offset = 0;
        clear(st);
      } else if (!st.flicking && !st.moving && strict(self)) {
        st.offset = mod(count - current, count);
      }
      if (self.offset !== st.offset) slot(self, "offset").write(st.offset);
      if (current !== st.current) setCurrent(self, st, current);
      changed();
    };
    const turn = (by) => {
      st.offset += by;
      st.adjust += by;
    };
    // The current row once `count` rows at `index` are gone.
    const without = (current, index, count, before) => {
      if (current >= index + count) current -= count;
      else if (current >= index) current = Math.min(index, before - count - 1);
      if (index > current) turn(-count);
      return current;
    };
    const rows = new Rows({
      self,
      owner: self.$owner,
      parent: () => self,
      inserted(index, count) {
        if (st.setting || !st.ready) return changed();
        let current = st.current;
        if (rows.count > count) {
          if (index <= current) current += count;
          else turn(count);
        }
        untrack(() => updated(current));
      },
      removed(index, count) {
        if (st.setting || !st.ready) return changed();
        untrack(() => updated(without(st.current, index, count, rows.count + count)));
      },
      moved(from, to, count) {
        if (st.setting || !st.ready) return changed();
        const was = st.current;
        let current = without(was, from, count, rows.count);
        if (was >= from && was < from + count) current = to + was - from;
        else if (to <= current) current += count;
        if (to > current) turn(count);
        untrack(() => updated(current));
      },
      created(row) {
        const item = row.$item;
        if (item?.$node) {
          self.$add(item);
          const attached = item.$attached?.PathView;
          if (attached) name(attached, st.names);
        }
        st.touched = true;
      },
      destroyed(row) {
        if (row.$item?.$node) self.$remove(row.$item);
        row.$percent = undefined;
        st.touched = true;
      },
    });
    const st = (self.$pv = {
      rows,
      version,
      items,
      setItems,
      // The rows that are on the path.
      on: new Set(),
      touched: false,
      // Whether the view has its model, and whether it is being given one.
      ready: false,
      setting: false,
      model: undefined,
      // What the view is at, which `offset` and `currentIndex` are told of.
      offset: 0,
      current: 0,
      reason: OTHER,
      direction: Shortest,
      path: null,
      outline: null,
      names: NONE,
      moving: false,
      flicking: false,
      dragging: false,
      // The moves it has yet to make.
      ops: [],
      job: null,
      active: false,
      ticking: false,
      value: 0,
      adjust: 0,
      elapsed: 0,
      flickLength: 0,
      // A press: when, where, and whether it has become the view's.
      press: -1,
      timing: false,
      steal: false,
      startPoint: null,
      startPc: 0,
      startX: 0,
      startY: 0,
      lastTime: 0,
      velocity: 0,
      sampled: false,
      // What stands for a row in an item that is not one's.
      aside: { $view: self, $index: -1, index: -1 },
      highlight: { component: undefined, item: null, dispose: null },
    });
    st.job = new Line(self, st);
    receive(self);
    effect(
      () => {
        const model = modelOf(self.model);
        return [model, delegateOf(self.model, self.delegate), size(model), self.highlight];
      },
      ([model, delegate, , highlight]) =>
        untrack(() => {
          const part = st.highlight;
          if (highlight !== part.component) {
            if (part.dispose) {
              self.$remove(part.item);
              part.dispose();
            }
            part.component = highlight;
            part.item = part.dispose = null;
            if (typeof highlight === "function") {
              const made = instantiate(
                (given) => {
                  const object = highlight(given);
                  // What `PathView.view` is found through.
                  if (object) object.$delegate = st.aside;
                  return object;
                },
                {},
                self,
                self.$owner,
              );
              part.item = made.object;
              part.dispose = made.dispose;
              if (part.item?.$node) self.$add(part.item);
            }
            slot(self, "highlightItem").write(part.item ?? null);
            bump(next);
          }
          // Another model starts from its first row; the same one, grown or
          // shrunk, is followed.
          const other = model !== st.model;
          st.model = model;
          st.setting = other;
          try {
            rows.set(model, delegate);
          } finally {
            st.setting = false;
          }
          const count = rows.count;
          if (!st.ready) {
            st.ready = true;
            st.direction = self.movementDirection;
            const index = self.currentIndex;
            st.current = index;
            // A current row that was given says where the view starts.
            if (count && index !== 0) setOffset(self, st, count - index);
            else setOffset(self, st, self.offset);
            updateCurrent(self, st);
          } else if (other) {
            clear(st);
            if (st.current !== 0) setCurrent(self, st, 0);
            setOffset(self, st, 0);
          }
        }),
    );
    effect(
      () => {
        version();
        const path = self.path;
        const outline = path?.$outline?.() ?? null;
        const names = path?.$attributes?.() ?? NONE;
        // The delegates there are, each by its centre.
        items();
        for (const row of rows.live.values()) {
          void row.$item?.width;
          void row.$item?.height;
        }
        void self.offset;
        void self.currentIndex;
        void self.pathItemCount;
        void self.preferredHighlightBegin;
        void self.preferredHighlightEnd;
        void self.highlightRangeMode;
        void self.snapMode;
        return [path, outline?.length > 0 ? outline : null, names];
      },
      ([path, outline, names]) =>
        untrack(() => {
          if (!st.ready) return;
          if (outline !== st.outline || names !== st.names) {
            // Another path: everything is somewhere else on it.
            st.path = path;
            st.outline = outline;
            st.names = names;
            for (const row of rows.live.values()) {
              row.$percent = undefined;
              const attached = row.$item?.$attached?.PathView;
              if (attached) name(attached, names);
            }
          }
          // What a binding gave either is the view's to act on.
          const index = self.currentIndex;
          if (index !== st.current) setIndex(self, st, Math.trunc(Number(index)) || 0);
          const offset = self.offset;
          if (offset !== st.offset) {
            st.reason = OTHER;
            setOffset(self, st, Number(offset) || 0);
            updateCurrent(self, st);
          }
          refill(self, st);
        }),
    );
  },
});

// Assigned to, they act there and then: the view has turned, and the
// current row is another, when the assignment returns.
Object.defineProperty(PathView.proto, "offset", {
  ...Object.getOwnPropertyDescriptor(PathView.proto, "offset"),
  set(value) {
    const st = this.$pv;
    if (typeof value === "function" || !st?.ready) return void slot(this, "offset").set(value);
    untrack(() => {
      st.reason = OTHER;
      const count = st.rows.count;
      const offset = count ? mod(Number(value) || 0, count) : Number(value) || 0;
      st.offset = offset;
      slot(this, "offset").write(offset);
      updateCurrent(this, st);
    });
    settle();
  },
});

Object.defineProperty(PathView.proto, "currentIndex", {
  ...Object.getOwnPropertyDescriptor(PathView.proto, "currentIndex"),
  set(value) {
    const st = this.$pv;
    if (typeof value === "function" || !st?.ready) return void slot(this, "currentIndex").set(value);
    untrack(() => setIndex(this, st, Math.trunc(Number(value)) || 0));
    settle();
  },
});

// Pointer delivery: who a press, a move, a release and the wheel go to.
//
// Qt's rules, on the DOM's pointer events. A press is offered to every item
// under the point from the topmost down: first to the item's handlers, then
// to the item, until one accepts it; after that only handlers are asked.
// Whoever takes the point holds a grab on it, exclusive (it is theirs) or
// passive (they watch it, and may take it later), and gets its moves and its
// release wherever they happen. The page is asked what is under a point, so
// what is seen there is what is hit.
import { PauseJob } from "./animation/jobs.js";
import { activate } from "./focus.js";
import { frameOf, sceneToItem } from "./geometry.js";
import { buttonOf, modifiersOf, NoButton } from "./keycodes.js";

// What waits (a long press, the time a second click may take) waits on the
// clock everything timed is on, so a test moves it with the same hand.
// `after` starts the wait over on the job it is given, and makes one if it
// is given none.
const due = { finished: (job) => job.work() };

export function after(ms, work, job = new PauseJob(0)) {
  cancel(job);
  job.length = Math.max(ms, 1);
  job.work = work;
  job.listener = due;
  job.start();
  return job;
}

export function cancel(job) {
  if (!job) return;
  job.listener = null;
  job.stop();
}

// `QPointingDevice::GrabTransition`: what `$grab` is told.
export const GrabPassive = 0x01;
export const UngrabPassive = 0x02;
export const CancelGrabPassive = 0x03;
export const OverrideGrabPassive = 0x04;
export const GrabExclusive = 0x10;
export const UngrabExclusive = 0x20;
export const CancelGrabExclusive = 0x30;

// Qt's style hints: how close in time and place two presses are one double
// click.
export const DOUBLE_CLICK_INTERVAL = 400;
const DOUBLE_CLICK_DISTANCE = 5;

// `Qt::CursorShape` as CSS.
const CURSORS = [
  "default",
  "default",
  "crosshair",
  "wait",
  "text",
  "ns-resize",
  "ew-resize",
  "nesw-resize",
  "nwse-resize",
  "move",
  "none",
  "row-resize",
  "col-resize",
  "pointer",
  "not-allowed",
  "help",
  "progress",
  "grab",
  "grabbing",
  "copy",
  "move",
  "alias",
];
export const cursorOf = (shape) => CURSORS[shape] ?? "";

// What the page itself answers a press on: under one of these nothing is
// asked. A text's link is one, as in Qt, where the text takes a press
// that lands on a link: what stands under it (a MouseArea, a
// Flickable) never takes the link's press, nor captures the pointer
// away from the link's own click.
const NATIVE = "input,textarea,select,button,[contenteditable],a[data-link]";
// And what it turns itself with the wheel: a field of one line does nothing
// with it, and what the field is in has it, as in Qt.
const SCROLLED = "textarea,select,[contenteditable]";

const remove = (list, one) => {
  const index = list.indexOf(one);
  if (index >= 0) list.splice(index, 1);
};

const parentOf = (item) => {
  const parent = item.parent;
  return parent?.$node ? parent : null;
};

const within = (item, ancestor) => {
  for (let at = item; at; at = parentOf(at)) if (at === ancestor) return true;
  return false;
};

class Point {
  constructor(id) {
    this.id = id;
    // "mouse", "touch" or "pen".
    this.type = "mouse";
    this.primary = true;
    // The element the tree it is in was mounted in.
    this.scene = null;
    this.clientX = 0;
    this.clientY = 0;
    // In the scene.
    this.x = 0;
    this.y = 0;
    this.pressX = 0;
    this.pressY = 0;
    this.pressTime = 0;
    this.time = 0;
    // The button this event is about, the ones held, the modifiers: Qt's.
    this.button = NoButton;
    this.buttons = NoButton;
    this.modifiers = 0;
    this.velocityX = 0;
    this.velocityY = 0;
    this.pressure = 0;
    this.down = false;
    // Whether this event is a move: a release says where, not that it moved.
    this.moving = false;
    // Whether this press is the second of a double click.
    this.double = false;
    this.exclusive = null;
    this.passive = [];
    // Items that see what their children are sent before they are.
    this.filters = [];
    this.hovered = [];
    this.spare = [];
    this.claimed = false;
  }

  // Where it is in an item.
  in(item) {
    return sceneToItem(item, this.x, this.y);
  }
}

const receivers = new WeakMap();
const points = new Map();
// How many things there are that hover: with none, a move of the mouse that
// nobody holds is nobody's.
let hovers = 0;

export const hoverable = (by) => void (hovers += by);

// An item that takes pointer events: `$press(point)` answers whether it
// accepts one, and it is then told `$move`, `$release` and `$grab`. One that
// has `$filter(point, receiver)` is asked before what is inside it.
export function receive(item) {
  if (receivers.has(item.$node)) return;
  receivers.set(item.$node, item);
  listen();
}

// A handler acts on the item it is declared in. The last declared is asked
// first, as in Qt.
export function handles(handler) {
  const item = handler.$parent;
  if (!item?.$node) return null;
  (item.$handlers ??= []).unshift(handler);
  receive(item);
  return item;
}

// What is destroyed holds nothing any more.
export function gone(who) {
  if (who.$parent?.$handlers) remove(who.$parent.$handlers, who);
  for (const point of points.values()) {
    if (point.exclusive === who) point.exclusive = null;
    remove(point.passive, who);
    remove(point.filters, who);
    remove(point.hovered, who);
  }
}

// Whether `who` may take the point from whoever has it: Qt's
// `approveGrabTransition`. A handler says what it takes over from and what
// it lets take over in `grabPermissions`; an item keeps what it `$keeps`.
export function canTake(point, who) {
  const holder = point.exclusive;
  if (!holder || holder === who) return true;
  const mine = who.grabPermissions;
  const theirs = holder.grabPermissions;
  if (mine === undefined) return theirs === undefined ? !holder.$keeps?.(point) : (theirs & 0x40) !== 0;
  if (theirs === undefined) return (mine & 0x04) !== 0 && !holder.$keeps?.(point);
  const same = who.$type === holder.$type;
  return (mine & (same ? 0x01 : 0x02)) !== 0 && (theirs & (same ? 0x10 : 0x20)) !== 0;
}

// The point becomes `who`'s, if whoever has it lets go; that one is told its
// grab was cancelled.
export function takeExclusive(point, who, force = false) {
  const holder = point.exclusive;
  if (holder === who) return true;
  if (!force && !canTake(point, who)) return false;
  point.exclusive = who;
  remove(point.filters, who);
  holder?.$grab?.(CancelGrabExclusive, point);
  who.$grab?.(GrabExclusive, point);
  return true;
}

// `who` is told of the point's moves and its release without it being its
// own.
export function watch(point, who) {
  if (point.passive.includes(who)) return;
  point.passive.push(who);
  who.$grab?.(GrabPassive, point);
}

// `who` gives up what it holds of the point.
export function drop(point, who) {
  if (point.exclusive === who) {
    point.exclusive = null;
    who.$grab?.(UngrabExclusive, point);
  }
  const index = point.passive.indexOf(who);
  if (index >= 0) {
    point.passive.splice(index, 1);
    who.$grab?.(UngrabPassive, point);
  }
  remove(point.filters, who);
}

// Several touches move in one event of the device and arrive here one by
// one. What acts on them together waits for the last: the touch event that
// follows them, or the next move of the same touch.
// Whoever asks is told once they have all moved: `$gathered()`.
const waiting = [];
const moved = [];

export function gather(who, point) {
  if (point.type !== "touch") return who.$gathered();
  if (!waiting.includes(who)) waiting.push(who);
  if (!moved.includes(point.id)) moved.push(point.id);
}

function gathered() {
  moved.length = 0;
  while (waiting.length) waiting.shift().$gathered();
}

// A scene is what a tree of items is shown in: the element it was mounted
// in, or a window's.
const sceneOf = (target) => target?.closest?.(".qq-window,.q-scene") ?? null;

const NONE = Object.freeze([]);

// The items that take pointer events under a point of the page, topmost
// first. `native` is what of the page's own they are not looked for under.
function hitsAt(scene, x, y, native) {
  const hits = [];
  for (const element of document.elementsFromPoint(x, y)) {
    if (element === scene) break;
    if (!scene.contains(element)) continue;
    const item = receivers.get(element);
    if (item) {
      if (item.enabled) hits.push(item);
    } else if (native && element.matches(native)) break;
  }
  return hits;
}

// The same for where a point is: for an item that passes on what it did not
// want.
export const under = (point) => hitsAt(point.scene, point.clientX, point.clientY, NATIVE);

function pointOf(event) {
  let point = points.get(event.pointerId);
  if (!point) points.set(event.pointerId, (point = new Point(event.pointerId)));
  return point;
}

function place(point, event) {
  const { left, top, zoom } = frameOf(point.scene);
  const x = (event.clientX - left) / zoom;
  const y = (event.clientY - top) / zoom;
  const time = performance.now();
  const elapsed = (time - point.time) / 1000;
  if (elapsed > 0) {
    point.velocityX = (x - point.x) / elapsed;
    point.velocityY = (y - point.y) / elapsed;
  }
  point.type = event.pointerType || "mouse";
  point.primary = event.isPrimary;
  point.clientX = event.clientX;
  point.clientY = event.clientY;
  point.x = x;
  point.y = y;
  point.time = time;
  point.buttons = event.buttons;
  point.modifiers = modifiersOf(event);
  point.pressure = event.pressure;
}

const asked = [];

// Who is told of a press before anything under it is asked: `hear(point,
// hits)` may watch the point. An overlay asks the drawers at the edges of its
// window.
const first = new Set();

export function overhear(hear) {
  first.add(hear);
  listen();
}

// The items around `item` that filter what their children are sent, nearest
// first. One that took the press is not asked again for what is under it.
function filter(point, item) {
  for (let parent = parentOf(item); parent; parent = parentOf(parent)) {
    if (!parent.$filter || asked.includes(parent) || !parent.$filter(point, item)) continue;
    asked.push(parent);
    point.filters.push(parent);
  }
}

// Whether an item around `item` keeps the press from it: one that has
// `$blocks(point, receiver)`, as a StackView has while it is busy.
function blocked(point, item) {
  for (let parent = parentOf(item); parent; parent = parentOf(parent)) {
    if (parent.$blocks?.(point, item)) return true;
  }
  return false;
}

// Qt's `deliverPressOrReleaseEvent`.
function press(point, hits) {
  let handlersOnly = false;
  asked.length = 0;
  for (const item of hits) {
    if (!handlersOnly && blocked(point, item)) continue;
    if (!handlersOnly) filter(point, item);
    let accepted = false;
    const handlers = item.$handlers;
    if (handlers) for (const handler of [...handlers]) if (handler.$press?.(point)) accepted = true;
    // An item that accepts a press has it, whatever its handlers took.
    if (!handlersOnly && item.$press?.(point)) {
      accepted = true;
      takeExclusive(point, item, true);
    }
    if (accepted) handlersOnly = true;
  }
  // Only what the holder is in goes on filtering.
  const holder = point.exclusive;
  const at = holder?.$node ? holder : holder?.$parent;
  if (!at) return;
  for (const one of [...point.filters]) {
    if (within(at, one)) continue;
    remove(point.filters, one);
    one.$grab?.(CancelGrabPassive, point);
  }
}

const order = [];

// A move or a release, to all who hold the point: the filters, the one whose
// it is (an item's own handlers before the item), then those who watch.
function deliver(point, method) {
  order.length = 0;
  for (const one of point.filters) order.push(one);
  const holder = point.exclusive;
  if (holder) {
    const handlers = holder.$handlers;
    if (handlers) for (const handler of handlers) if (point.passive.includes(handler)) order.push(handler);
    order.push(holder);
  }
  for (const one of point.passive) if (!order.includes(one)) order.push(one);
  for (let index = 0; index < order.length; index++) {
    const one = order[index];
    // What lost its grab to one before it is not told.
    if (point.exclusive === one || point.passive.includes(one) || point.filters.includes(one)) one[method]?.(point);
  }
}

function ungrab(point, cancelled) {
  const holder = point.exclusive;
  const passive = point.passive.splice(0);
  const filters = point.filters.splice(0);
  point.exclusive = null;
  holder?.$grab?.(cancelled ? CancelGrabExclusive : UngrabExclusive, point);
  for (const one of passive) one.$grab?.(cancelled ? CancelGrabPassive : UngrabPassive, point);
  if (cancelled) for (const one of filters) one.$grab?.(CancelGrabPassive, point);
}

// What the mouse is over is told so, topmost first, and what it no longer is
// over after that, in the order it came over them: Qt's. Something that
// hovers hides what is under it from the mouse, but not what it is inside of.
const over = [];
// Whether they are being told, and whether what was shown meanwhile asked
// for it again.
let telling = false;
let again = false;

function hover(point, hits) {
  over.length = 0;
  let blocker = null;
  for (const item of hits) {
    if (blocker && !within(blocker, item)) continue;
    const handlers = item.$handlers;
    if (handlers) {
      for (const handler of handlers) {
        if (!handler.$hover || !handler.$hovers(point)) continue;
        over.push(handler);
        if (handler.blocking) blocker = item;
      }
    }
    if (item.$hover && item.$hovers(point)) {
      over.push(item);
      blocker = item;
    }
  }
  const hovered = point.hovered;
  const left = point.spare;
  left.length = 0;
  for (let index = hovered.length - 1; index >= 0; index--) {
    if (over.includes(hovered[index])) continue;
    left.unshift(hovered[index]);
    hovered.splice(index, 1);
  }
  for (let index = 0; index < over.length; index++) if (!hovered.includes(over[index])) hovered.push(over[index]);
  telling = true;
  try {
    for (let index = 0; index < over.length; index++) over[index].$hover(point, true);
    for (let index = 0; index < left.length; index++) left[index].$hover(point, false);
  } finally {
    telling = false;
  }
  if (!again) return;
  again = false;
  rehover();
}

// What is under a mouse that has not moved is another thing when something
// is shown there: Qt asks again with every frame, and here whoever showed it
// asks.
export function rehover() {
  if (telling) return void (again = true);
  for (const point of points.values()) {
    if (point.type === "touch" || point.down || !point.scene?.isConnected) continue;
    if (hovers > 0 || point.hovered.length) hover(point, hitsAt(point.scene, point.clientX, point.clientY, null));
  }
}

// Where the mouse was last, in the page: Qt's `QCursor::pos()`.
export function cursor() {
  for (const point of points.values()) {
    if (point.type !== "touch" && point.scene?.isConnected) return { x: point.clientX, y: point.clientY };
  }
  return null;
}

// The last press of the first pointer: whether what the page would do with
// it is left undone.
let claimed = false;

// The press a second one makes a double click with, while there is time.
const last = { button: NoButton, scene: null, x: 0, y: 0, job: new PauseJob(0) };
const forgotten = () => void (last.button = NoButton);

function onDown(event) {
  const scene = sceneOf(event.target);
  if (!scene) return;
  if (waiting.length) gathered();
  const point = pointOf(event);
  if (point.down) return;
  point.scene = scene;
  place(point, event);
  point.button = buttonOf(event);
  point.down = true;
  point.moving = false;
  point.pressX = point.x;
  point.pressY = point.y;
  point.pressTime = point.time;
  point.double =
    point.primary &&
    point.button === last.button &&
    scene === last.scene &&
    Math.abs(point.x - last.x) <= DOUBLE_CLICK_DISTANCE &&
    Math.abs(point.y - last.y) <= DOUBLE_CLICK_DISTANCE;
  if (point.primary) {
    // The press after a double click starts over.
    last.button = point.double ? NoButton : point.button;
    last.scene = scene;
    last.x = point.x;
    last.y = point.y;
    if (point.double) cancel(last.job);
    else after(DOUBLE_CLICK_INTERVAL, forgotten, last.job);
  }
  const hits = hitsAt(scene, point.clientX, point.clientY, NATIVE);
  for (const hear of first) hear(point, hits);
  press(point, hits);
  point.claimed = Boolean(point.exclusive || point.passive.length || point.filters.length);
  if (point.primary) claimed = point.claimed;
  if (hits.length) activate(hits[0]);
  if (!point.claimed) return;
  // Its moves come here wherever they go, off the page too.
  try {
    scene.setPointerCapture(point.id);
  } catch {
    // An event the page made up has no pointer to capture.
  }
  // Keys follow: they are not for what had focus elsewhere on the page.
  const focused = document.activeElement;
  if (focused && focused !== document.body && !scene.contains(focused)) focused.blur();
}

function onMove(event) {
  let point = points.get(event.pointerId);
  const scene = point?.down ? point.scene : sceneOf(event.target);
  if (!scene) {
    if (point?.hovered.length) hover(point, NONE);
    return;
  }
  if (moved.includes(event.pointerId)) gathered();
  point ??= pointOf(event);
  point.scene = scene;
  place(point, event);
  point.moving = true;
  // A button pressed or released while another is held comes as a move.
  if (event.button >= 0 && point.down) {
    point.button = buttonOf(event);
    point.exclusive?.$chord?.(point, (point.buttons & point.button) !== 0);
    return;
  }
  point.button = NoButton;
  // Hover is for a mouse nobody holds, a button down or not.
  if (point.type !== "touch" && !point.exclusive && (hovers > 0 || point.hovered.length)) {
    hover(point, hitsAt(scene, point.clientX, point.clientY, null));
  }
  if (point.down && point.claimed) deliver(point, "$move");
}

function onUp(event) {
  const point = points.get(event.pointerId);
  if (!point?.down) return;
  if (waiting.length) gathered();
  place(point, event);
  point.button = buttonOf(event);
  point.moving = false;
  point.down = false;
  if (point.claimed) {
    deliver(point, "$release");
    ungrab(point, false);
  }
  point.claimed = false;
  if (point.type === "touch") {
    points.delete(point.id);
  } else if (hovers > 0 || point.hovered.length) {
    hover(point, hitsAt(point.scene, point.clientX, point.clientY, null));
  }
}

// The page took the pointer for itself: to scroll, mostly.
function onCancel(event) {
  const point = points.get(event.pointerId);
  if (!point) return;
  if (waiting.length) gathered();
  point.down = false;
  point.claimed = false;
  point.moving = false;
  ungrab(point, true);
  if (point.hovered.length) hover(point, NONE);
  if (point.type === "touch") points.delete(point.id);
}

function onLeave(event) {
  const point = points.get(event.pointerId);
  if (point && !point.down && point.hovered.length) hover(point, NONE);
}

// A press that was taken selects no text, drags no image and moves no focus.
function onMouseDown(event) {
  if (claimed && sceneOf(event.target)) event.preventDefault();
}

function onContextMenu(event) {
  if (claimed && sceneOf(event.target)) event.preventDefault();
}

// Qt counts the wheel in eighths of a degree, 120 to a notch, and up as
// positive; the page counts pixels, lines or pages, and down as positive.
const NOTCH = [1.2, 40, 120];
const turn = { x: 0, y: 0, angleX: 0, angleY: 0, pixelX: 0, pixelY: 0, buttons: 0, modifiers: 0, inverted: false };

function onWheel(event) {
  const scene = sceneOf(event.target);
  if (!scene) return;
  const hits = hitsAt(scene, event.clientX, event.clientY, SCROLLED);
  if (!hits.length) return;
  const { left, top, zoom } = frameOf(scene);
  const pixels = event.deltaMode === 0;
  turn.x = (event.clientX - left) / zoom;
  turn.y = (event.clientY - top) / zoom;
  turn.angleX = -event.deltaX * NOTCH[event.deltaMode] || 0;
  turn.angleY = -event.deltaY * NOTCH[event.deltaMode] || 0;
  turn.pixelX = pixels ? -event.deltaX || 0 : 0;
  turn.pixelY = pixels ? -event.deltaY || 0 : 0;
  turn.buttons = event.buttons;
  turn.modifiers = modifiersOf(event);
  for (const item of hits) {
    const handlers = item.$handlers;
    if (handlers) for (const handler of [...handlers]) if (handler.$wheel?.(turn)) return event.preventDefault();
    if (item.$wheel?.(turn)) return event.preventDefault();
  }
}

let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  document.addEventListener("pointerdown", onDown);
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onCancel);
  document.documentElement.addEventListener("pointerleave", onLeave);
  document.addEventListener("mousedown", onMouseDown);
  document.addEventListener("contextmenu", onContextMenu);
  for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"]) {
    document.addEventListener(type, gathered, { passive: true });
  }
}

// The wheel is listened for once something takes it: a page whose wheel may
// be taken scrolls less smoothly.
let wheeling = false;
export function wheels() {
  if (wheeling) return;
  wheeling = true;
  document.addEventListener("wheel", onWheel, { passive: false });
}

// Flickable: a window onto content bigger than itself.
//
// The moving is the browser's: the content item sits in an element that
// scrolls, so touch, wheel, momentum and overscroll are native and nothing
// here runs per frame but the scroll event. `contentX` and `contentY` are
// what that element is scrolled to, measured as Qt measures them: from the
// content's origin, which margins and a view's header put before zero.
import { onCleanup, runWithOwner } from "solid-js";
import { contents, defineType, derived, effect, inside, QtObject, slot } from "../object.js";
import { Item } from "./Item.js";
import { LeftButton } from "./keycodes.js";
import { CancelGrabExclusive, CancelGrabPassive, canTake, receive, takeExclusive } from "./pointer.js";
import { settle } from "./settle.js";
import { untrack } from "#kernel";

const sheet = new CSSStyleSheet();
sheet.replaceSync(`
qq-flick { position: absolute; inset: 0; display: block; overflow: hidden; scrollbar-width: none; }
qq-flick::-webkit-scrollbar { display: none; }
.qq-extent { position: absolute; left: 0; top: 0; overflow: clip; }
qq-flick.qq-snap > .qq-extent > .qq > .qq { scroll-snap-align: start; }
qq-flick.qq-snap-one > .qq-extent > .qq > .qq { scroll-snap-stop: always; }
qq-flick.qq-held { scroll-snap-type: none !important; }
`);
document.adoptedStyleSheets.push(sheet);

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const INSTANT = { left: 0, top: 0, behavior: "instant" };
const SMOOTH = { left: 0, top: 0, behavior: "smooth" };

// Puts the element where the properties say, when it may have forgotten: an
// element scrolls only while it is in the page and shown.
function restore(self, anywhere) {
  if (!anywhere && !self.$left && !self.$top) return;
  self.$set = true;
  INSTANT.left = self.$left;
  INSTANT.top = self.$top;
  self.$viewport.scrollTo(INSTANT);
}

// The element that scrolls. It is told when it is put in the page: until
// then it could not be scrolled to where the Flickable starts.
class Viewport extends HTMLElement {
  connectedCallback() {
    if (this.$flickable) restore(this.$flickable);
  }
}
if (!customElements.get("qq-flick")) customElements.define("qq-flick", Viewport);

// A Flickable shown again after being hidden.
const shown = new ResizeObserver((entries) => {
  for (const { target } of entries) {
    const self = target.$flickable;
    if (self.$set && (target.scrollLeft !== self.$left || target.scrollTop !== self.$top)) restore(self);
  }
});

// What the element is told: how much there is to scroll over, and where to.
function show(self, [minX, minY, extentWidth, extentHeight, contentX, contentY, width, height]) {
  const resized = extentWidth !== self.$extentWidth || extentHeight !== self.$extentHeight;
  if (resized) {
    self.$extentWidth = extentWidth;
    self.$extentHeight = extentHeight;
    self.$extent.style.width = `${extentWidth}px`;
    self.$extent.style.height = `${extentHeight}px`;
  }
  self.$minXShown = minX;
  self.$minYShown = minY;
  // An element scrolls no further than there is content. A position beyond
  // that is still the content's, as in Qt: it shows what is there, nothing.
  const left = clamp(contentX - minX, 0, extentWidth - width);
  const top = clamp(contentY - minY, 0, extentHeight - height);
  // The content item is at minus the content position; scrolling is what
  // moves it there, so the element takes that much back.
  self.$contentItem.$node.style.translate = `${left}px ${top}px`;
  if (left === self.$left && top === self.$top && !(resized && self.$set)) return;
  self.$left = left;
  self.$top = top;
  self.$set = true;
  INSTANT.left = left;
  INSTANT.top = top;
  self.$viewport.scrollTo(INSTANT);
  // An element that snaps goes to where an item is, and the items of rows
  // that have just come are not where they will be: it is told again once
  // what changed has settled.
  if (!self.$viewport.style.scrollSnapType || self.$again) return;
  self.$again = true;
  queueMicrotask(() => {
    self.$again = false;
    restore(self, true);
  });
}

const SCROLLEND = "onscrollend" in window;
// Without `scrollend`, a movement is over when no scroll has come for a
// while. One timer watches every Flickable that is moving.
const watched = new Set();
let timer = 0;

function poll() {
  const now = performance.now();
  for (const self of watched) if (now - self.$scrolledAt >= 150) stopped(self);
  if (!watched.size) timer = clearInterval(timer);
}

function write(self, name, value) {
  return slot(self, name).write(value);
}

// The browser has scrolled the element: by the user, or to where it was
// told to go.
function scrolled(event) {
  const viewport = event.currentTarget;
  const self = viewport.$flickable;
  const left = viewport.scrollLeft;
  const top = viewport.scrollTop;
  const set = self.$set;
  self.$set = false;
  const dx = left - self.$left;
  const dy = top - self.$top;
  // Where it was told to go, give or take the rounding of a device pixel.
  if (set ? Math.abs(dx) < 1 && Math.abs(dy) < 1 : !dx && !dy) return;
  self.$left = left;
  self.$top = top;
  if (dx) write(self, "contentX", left + self.$minXShown);
  if (dy) write(self, "contentY", top + self.$minYShown);
  const started = !self.$moving;
  self.$moving = true;
  if (dx) write(self, "movingHorizontally", true);
  if (dy) write(self, "movingVertically", true);
  const dragged = self.$touching && !self.$dragging;
  if (self.$touching) {
    self.$dragging = true;
    if (dx) write(self, "draggingHorizontally", true);
    if (dy) write(self, "draggingVertically", true);
  } else if (self.$flicking) {
    if (dx) write(self, "flickingHorizontally", true);
    if (dy) write(self, "flickingVertically", true);
  }
  settle();
  if (started) self.movementStarted();
  if (dragged) self.dragStarted();
  self.$scrolledAt = performance.now();
  if (!SCROLLEND) watch(self);
}

function watch(self) {
  watched.add(self);
  timer ||= setInterval(poll, 100);
}

// The browser says a scroll is over. It says so of the one that put the
// content where `flick()` threw it from, too: that movement has only begun.
function ended(event) {
  const viewport = event.currentTarget;
  const self = viewport.$flickable;
  const to = self.$thrown;
  if (to && (Math.abs(viewport.scrollLeft - to.left) >= 1 || Math.abs(viewport.scrollTop - to.top) >= 1)) {
    self.$scrolledAt = performance.now();
    return watch(self);
  }
  stopped(self);
}

function released(self) {
  if (!self.$dragging) return;
  self.$dragging = false;
  write(self, "draggingHorizontally", false);
  write(self, "draggingVertically", false);
  settle();
  self.dragEnded();
}

function stopped(self) {
  if (self.$touching || !self.$moving) return;
  self.$thrown = null;
  if (!self.$mouse) self.$viewport.classList.remove("qq-held");
  watched.delete(self);
  const flicked = self.$flicking;
  self.$moving = self.$flicking = false;
  for (const name of ["movingHorizontally", "movingVertically", "flickingHorizontally", "flickingVertically"]) {
    write(self, name, false);
  }
  settle();
  if (flicked) self.flickEnded();
  self.movementEnded();
}

function touched(event) {
  event.currentTarget.$flickable.$touching = true;
}

// A finger lifted from content that goes on moving has flicked it.
function lifted(event) {
  const self = event.currentTarget.$flickable;
  if (event.touches.length) return;
  self.$touching = false;
  const dragged = self.$dragging;
  released(self);
  if (!dragged || !self.$moving) return;
  self.$flicking = true;
  self.flickStarted();
}

// A wheel that only turns one way moves content that only goes the other.
function wheeled(event) {
  const viewport = event.currentTarget;
  if (event.deltaX || !event.deltaY || event.ctrlKey) return;
  if (viewport.scrollHeight > viewport.clientHeight || viewport.scrollWidth <= viewport.clientWidth) return;
  if (getComputedStyle(viewport).overflowX !== "hidden") viewport.scrollLeft += event.deltaY;
}

const PASSIVE = { passive: true };

// The mouse. A finger's drag is the browser's, and a mouse has none there:
// its drag is Qt's, which moves the content by what the mouse has moved and
// throws it on at the speed the mouse is let go at.
//
// Qt's style hints and `QQuickFlickable`'s own numbers: how far a press goes
// before it is a drag, how far and how fast one goes before it is a flick,
// and how long a mouse may rest before it is let go and still have thrown.
const DRAG_THRESHOLD = 10;
const FLICK_THRESHOLD = 15;
const SNAP_ONE_THRESHOLD = 30;
const MINIMUM_FLICK_VELOCITY = 75;
const RESTED = 100;

// Whether it may be flicked along an axis: `xflick()` and `yflick()`.
function flicks(self, horizontal) {
  const direction = self.flickableDirection;
  const more = horizontal ? self.$maxX() - self.$minX() : self.$maxY() - self.$minY();
  if (direction & AutoFlickIfNeeded) return more > 0;
  if (direction === 0) return Math.floor(more) > 0;
  return (direction & (horizontal ? HorizontalFlick : VerticalFlick)) !== 0;
}

// Whether a press is one it drags by: the first button of a mouse, on one
// that is not a ScrollView's, whose bars a mouse has instead.
function drags(self, point) {
  if (point.type !== "mouse" || !point.primary || point.button !== LeftButton) return false;
  return untrack(() => self.interactive && self.visible && self.parent?.$scrolled?.() !== self);
}

function pressed(self, point) {
  if (self.$mouse?.press === point.pressTime) return;
  self.$mouse = { press: point.pressTime, stage: 0, x: null, y: null, left: 0, top: 0, alongX: false, alongY: false, samples: [] };
  // A press on content that was thrown stops it where it is.
  if (self.$thrown) self.cancelFlick();
}

// The first move past the threshold makes it a drag, the one after that
// takes the press from whoever had it, and the content moves by what the
// mouse moves from there.
function moved(self, point) {
  const mouse = self.$mouse;
  if (!mouse) return;
  const dx = point.x - point.pressX;
  const dy = point.y - point.pressY;
  const [alongX, alongY] = untrack(() => [flicks(self, true), flicks(self, false)]);
  mouse.alongX = alongX;
  mouse.alongY = alongY;
  const overX = alongX && Math.abs(dx) > DRAG_THRESHOLD;
  const overY = alongY && Math.abs(dy) > DRAG_THRESHOLD;
  const samples = mouse.samples;
  samples.push({ x: point.x, y: point.y, time: point.time });
  while (samples.length > 2 && point.time - samples[0].time > RESTED) samples.shift();
  if (mouse.stage === 0) {
    if (overX || overY) mouse.stage = 1;
    return;
  }
  if (mouse.stage === 1) {
    if (!overX && !overY) return;
    if (point.exclusive !== self && !canTake(point, self)) return;
    mouse.stage = 2;
    self.$touching = self.$dragging = true;
    self.$viewport.classList.add("qq-held");
  }
  const began = mouse.x === null && mouse.y === null;
  untrack(() => {
    if (overX && mouse.x === null) {
      mouse.x = dx;
      mouse.left = self.contentX;
      write(self, "movingHorizontally", true);
      write(self, "draggingHorizontally", true);
    }
    if (overY && mouse.y === null) {
      mouse.y = dy;
      mouse.top = self.contentY;
      write(self, "movingVertically", true);
      write(self, "draggingVertically", true);
    }
    if (mouse.x !== null) write(self, "contentX", clamp(mouse.left - (dx - mouse.x), self.$minX(), self.$maxX()));
    if (mouse.y !== null) write(self, "contentY", clamp(mouse.top - (dy - mouse.y), self.$minY(), self.$maxY()));
  });
  const started = !self.$moving;
  self.$moving = true;
  settle();
  if (began) self.dragStarted();
  if (started) self.movementStarted();
  // Whoever had the press hears it is no longer theirs once it has moved.
  if (point.exclusive !== self) takeExclusive(point, self);
}

// How fast the mouse was going when it was let go, along an axis: over the
// last moments of its way, and not at all once it has rested or where it
// has not gone far.
function speed(mouse, point, axis) {
  const samples = mouse.samples;
  const last = samples[samples.length - 1];
  if (!mouse[axis === "x" ? "alongX" : "alongY"] || !last || point.time - last.time >= RESTED) return 0;
  if (Math.abs(axis === "x" ? point.x - point.pressX : point.y - point.pressY) <= FLICK_THRESHOLD) return 0;
  const first = samples[0];
  const velocity = last.time > first.time ? ((last[axis] - first[axis]) * 1000) / (last.time - first.time) : 0;
  return Math.abs(velocity) > MINIMUM_FLICK_VELOCITY ? velocity : 0;
}

// Where content that snaps rests, along the axis it snaps on: where one of
// its items begins, as the browser has it, and the nearest of those to where
// it was thrown. A view that goes an item at a time goes one on, the way it
// was thrown or was dragged far enough, and back if it was not.
function snapped(self, horizontal, to, velocity, from) {
  const viewport = self.$viewport;
  const padding = parseFloat(getComputedStyle(viewport)[horizontal ? "scrollPaddingLeft" : "scrollPaddingTop"]) || 0;
  const [min, max] = horizontal ? [self.$minX(), self.$maxX()] : [self.$minY(), self.$maxY()];
  const stops = [];
  for (const child of self.$contentItem.children) {
    if (child.visible) stops.push(clamp((horizontal ? child.x : child.y) - padding, min, max));
  }
  if (!stops.length) return to;
  const nearest = (to, among) => among.reduce((best, stop) => (Math.abs(stop - to) < Math.abs(best - to) ? stop : best));
  if (!viewport.classList.contains("qq-snap-one")) return nearest(to, stops);
  const at = horizontal ? self.contentX : self.contentY;
  const dragged = at - from;
  const near = nearest(at, stops);
  if (!velocity && (Math.abs(dragged) <= SNAP_ONE_THRESHOLD || (near - from) * dragged > 0)) return near;
  const on = velocity ? velocity < 0 : dragged > 0;
  const beyond = stops.filter((stop) => (on ? stop > at : stop < at));
  return beyond.length ? nearest(at, beyond) : near;
}

// The press is over: let go of, or taken away. Content that was dragged goes
// on as it was thrown, and to where it snaps.
function dropped(self, point) {
  const mouse = self.$mouse;
  self.$mouse = null;
  if (!mouse) return;
  const viewport = self.$viewport;
  // A press that went nowhere moves nothing, unless it was what stopped
  // content on its way to where it snaps.
  if (mouse.stage === 0 && !viewport.classList.contains("qq-held")) return;
  self.$touching = false;
  released(self);
  untrack(() => {
    const vx = point ? speed(mouse, point, "x") : 0;
    const vy = point ? speed(mouse, point, "y") : 0;
    if (vx || vy) viewport.classList.add("qq-held");
    let x = clamp(self.contentX + thrown(self, vx), self.$minX(), self.$maxX());
    let y = clamp(self.contentY + thrown(self, vy), self.$minY(), self.$maxY());
    const snap = viewport.style.scrollSnapType;
    if (snap.startsWith("x")) x = snapped(self, true, x, vx, mouse.x === null ? self.contentX : mouse.left);
    if (snap.startsWith("y")) y = snapped(self, false, y, vy, mouse.y === null ? self.contentY : mouse.top);
    if (send(self, x, y, vx !== 0 || vy !== 0)) return;
    if (self.$moving) stopped(self);
    else viewport.classList.remove("qq-held");
  });
}

const ratio = (part, whole) => (whole > 0 ? part / whole : 0);

// `visibleArea`: what a scroll bar shows, as fractions of the content.
const VisibleArea = defineType("VisibleArea", QtObject, {
  properties: {
    xPosition: derived(({ $of }) => ratio($of.contentX - $of.$minX(), $of.$maxX() - $of.$minX() + $of.width)),
    yPosition: derived(({ $of }) => ratio($of.contentY - $of.$minY(), $of.$maxY() - $of.$minY() + $of.height)),
    widthRatio: derived(({ $of }) => ratio($of.width, $of.$maxX() - $of.$minX() + $of.width)),
    heightRatio: derived(({ $of }) => ratio($of.height, $of.$maxY() - $of.$minY() + $of.height)),
  },
  setup(self, props) {
    self.$of = props.$of;
  },
});

const HorizontalFlick = 1;
const VerticalFlick = 2;
const AutoFlickIfNeeded = 12;
const StopAtBounds = 0;

// How far content thrown at `velocity` goes before it stops: Qt decelerates
// it evenly. A positive velocity is a finger moving down: the content
// position goes back.
function thrown(self, velocity) {
  const limit = self.maximumFlickVelocity;
  if (limit >= 0) velocity = clamp(velocity, -limit, limit);
  return (-Math.sign(velocity) * velocity * velocity) / (2 * (self.flickDeceleration || 1500));
}

// Sends the content on to where it will rest, as the browser moves it: thrown
// there, or only coming to where it snaps. Whether there was anywhere to go.
function send(self, x, y, flicked) {
  const dx = x - self.contentX;
  const dy = y - self.contentY;
  if (!dx && !dy) return false;
  const started = !self.$moving;
  self.$moving = true;
  if (flicked) self.$flicking = true;
  if (dx) {
    write(self, "movingHorizontally", true);
    if (flicked) write(self, "flickingHorizontally", true);
  }
  if (dy) {
    write(self, "movingVertically", true);
    if (flicked) write(self, "flickingVertically", true);
  }
  settle();
  if (started) self.movementStarted();
  if (flicked) self.flickStarted();
  self.$thrown = { left: x - self.$minXShown, top: y - self.$minYShown };
  SMOOTH.left = self.$thrown.left;
  SMOOTH.top = self.$thrown.top;
  self.$viewport.scrollTo(SMOOTH);
  return true;
}

export const Flickable = defineType("Flickable", Item, {
  properties: {
    // Less than nothing: as wide, as high as the Flickable.
    contentWidth: -1,
    contentHeight: -1,
    contentX: derived((self) => self.$minX()),
    contentY: derived((self) => self.$minY()),
    originX: 0,
    originY: 0,
    leftMargin: 0,
    rightMargin: 0,
    topMargin: 0,
    bottomMargin: 0,
    flickableDirection: 0,
    interactive: true,
    boundsBehavior: 3,
    flickDeceleration: 1500,
    maximumFlickVelocity: 2500,
    atXBeginning: derived((self) => self.contentX <= self.$minX()),
    atXEnd: derived((self) => self.contentX >= self.$maxX() - 0.5),
    atYBeginning: derived((self) => self.contentY <= self.$minY()),
    atYEnd: derived((self) => self.contentY >= self.$maxY() - 0.5),
    movingHorizontally: false,
    movingVertically: false,
    moving: derived((self) => self.movingHorizontally || self.movingVertically),
    flickingHorizontally: false,
    flickingVertically: false,
    flicking: derived((self) => self.flickingHorizontally || self.flickingVertically),
    draggingHorizontally: false,
    draggingVertically: false,
    dragging: derived((self) => self.draggingHorizontally || self.draggingVertically),
  },
  signals: ["movementStarted", "movementEnded", "flickStarted", "flickEnded", "dragStarted", "dragEnded"],
  enums: {
    AutoFlickDirection: 0,
    HorizontalFlick,
    VerticalFlick,
    HorizontalAndVerticalFlick: 3,
    AutoFlickIfNeeded,
    StopAtBounds,
    DragOverBounds: 1,
    OvershootBounds: 2,
    DragAndOvershootBounds: 3,
  },
  methods: {
    get contentItem() {
      return this.$contentItem;
    },
    get visibleArea() {
      return (this.$visibleArea ??= runWithOwner(this.$owner, () => untrack(() => VisibleArea({ $of: this }))));
    },
    // The content item comes first, then what was added to the Flickable
    // itself, which does not move.
    get children() {
      return [this.$contentItem, ...Object.getOwnPropertyDescriptor(Item.proto, "children").get.call(this)];
    },
    // The positions the content can be at: from the origin less the margin
    // before it to where its end, and the margin after, meet the far edge.
    $minX() {
      return this.originX - this.leftMargin;
    },
    $maxX() {
      const width = this.contentWidth;
      const end = this.originX + (width < 0 ? this.width : width) + this.rightMargin - this.width;
      return Math.max(end, this.$minX());
    },
    $minY() {
      return this.originY - this.topMargin;
    },
    $maxY() {
      const height = this.contentHeight;
      const end = this.originY + (height < 0 ? this.height : height) + this.bottomMargin - this.height;
      return Math.max(end, this.$minY());
    },
    flick(xVelocity, yVelocity) {
      untrack(() => {
        const x = clamp(this.contentX + thrown(this, xVelocity), this.$minX(), this.$maxX());
        const y = clamp(this.contentY + thrown(this, yVelocity), this.$minY(), this.$maxY());
        if (x === this.contentX && y === this.contentY) return;
        // An element that is not shown cannot be seen moving.
        if (!this.$viewport.clientWidth && !this.$viewport.clientHeight) {
          write(this, "contentX", x);
          write(this, "contentY", y);
          return settle();
        }
        send(this, x, y, true);
      });
    },
    // The mouse: a press in it is its own, and one on something inside it
    // is that one's until it is a drag.
    $press(point) {
      if (!drags(this, point)) return false;
      pressed(this, point);
      return true;
    },
    $filter(point) {
      if (!drags(this, point) || !this.contains(point.in(this))) return false;
      pressed(this, point);
      return true;
    },
    $move(point) {
      moved(this, point);
    },
    $release(point) {
      dropped(this, point);
    },
    $grab(transition) {
      if (transition === CancelGrabExclusive || transition === CancelGrabPassive) dropped(this, null);
    },
    // What it drags, nothing takes from it.
    $keeps() {
      return this.$mouse?.stage === 2;
    },
    cancelFlick() {
      const viewport = this.$viewport;
      INSTANT.left = viewport.scrollLeft;
      INSTANT.top = viewport.scrollTop;
      viewport.scrollTo(INSTANT);
      stopped(this);
    },
    returnToBounds() {
      untrack(() => {
        write(this, "contentX", clamp(this.contentX, this.$minX(), this.$maxX()));
        write(this, "contentY", clamp(this.contentY, this.$minY(), this.$maxY()));
      });
      settle();
    },
    // A new size for the content, with `center` (a point of it) staying
    // where it is in the Flickable.
    resizeContent(width, height, center) {
      untrack(() => {
        const was = this.$contentItem;
        const x = this.contentX + (was.width > 0 ? (center.x * width) / was.width - center.x : 0);
        const y = this.contentY + (was.height > 0 ? (center.y * height) / was.height - center.y : 0);
        write(this, "contentWidth", width);
        write(this, "contentHeight", height);
        write(this, "contentX", x);
        write(this, "contentY", y);
      });
      settle();
    },
  },
  setup(self) {
    const viewport = document.createElement("qq-flick");
    const extent = document.createElement("div");
    extent.className = "qq-extent";
    viewport.$flickable = self;
    self.$viewport = viewport;
    self.$extent = extent;
    self.$left = self.$top = 0;
    self.$minXShown = self.$minYShown = 0;
    self.$mouse = null;
    receive(self);
    self.$contentItem = inside(self, () =>
      untrack(() =>
        Item({
          get x() {
            return 0 - self.contentX;
          },
          get y() {
            return 0 - self.contentY;
          },
          get width() {
            const width = self.contentWidth;
            return width < 0 ? self.width : width;
          },
          get height() {
            const height = self.contentHeight;
            return height < 0 ? self.height : height;
          },
        }),
      ),
    );
    extent.append(self.$contentItem.$node);
    viewport.append(extent);
    self.$node.append(viewport);
    viewport.addEventListener("scroll", scrolled, PASSIVE);
    viewport.addEventListener("scrollend", ended, PASSIVE);
    viewport.addEventListener("wheel", wheeled, PASSIVE);
    viewport.addEventListener("touchstart", touched, PASSIVE);
    viewport.addEventListener("touchend", lifted, PASSIVE);
    viewport.addEventListener("touchcancel", lifted, PASSIVE);
    shown.observe(viewport);
    onCleanup(() => {
      shown.unobserve(viewport);
      watched.delete(self);
    });
    effect(
      () => {
        const minX = self.$minX();
        const minY = self.$minY();
        return [
          minX,
          minY,
          self.$maxX() - minX + self.width,
          self.$maxY() - minY + self.height,
          self.contentX,
          self.contentY,
          self.width,
          self.height,
        ];
      },
      (state) => show(self, state),
    );
    effect(
      () => [self.interactive, self.flickableDirection, self.boundsBehavior],
      ([interactive, direction, bounds]) => {
        const style = viewport.style;
        // Along a direction it may be flicked in, the element scrolls as far
        // as there is content, which may be no way at all.
        const x = interactive && direction !== VerticalFlick ? "auto" : "hidden";
        const y = interactive && direction !== HorizontalFlick ? "auto" : "hidden";
        const changed = viewport.isConnected && (x !== style.overflowX || y !== style.overflowY);
        style.overflowX = x;
        style.overflowY = y;
        style.overscrollBehavior = bounds === StopAtBounds ? "none" : "contain";
        if (!changed) return;
        // Chromium goes on scrolling, with a wheel, an element that was
        // scrollable when it was last laid out: lay it out again.
        style.display = "none";
        void viewport.offsetHeight;
        style.display = "";
        restore(self);
      },
    );
  },
  // What is declared in a Flickable is in its content.
  adopt(self, props) {
    const content = self.$contentItem;
    for (const child of contents(props, content)) content.$add(child);
  },
});

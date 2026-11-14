// PinchArea: an item that makes a pinch of two fingers on it.
//
// What it makes of them is what Qt's does (`QQuickPinchArea::updatePinch`):
// a pinch starts once the fingers have come apart or together, or moved, by
// the drag threshold, and from then on says how far, how much turned and
// where the middle is. Fingers on what is inside the area count too.
import { onCleanup } from "solid-js";
import { defineType, group, settle, slot } from "../object.ts";
import { itemToScene, sceneToItem } from "./geometry.js";
import { Item } from "./Item.js";
import { CancelGrabExclusive, CancelGrabPassive, gather, gone, receive, takeExclusive } from "./pointer.js";

const FLT_MAX = 3.4028234663852886e38;
const DRAG_THRESHOLD = 10;
const bound = (low, value, high) => Math.max(low, Math.min(high, value));

// `pinch.dragAxis`.
export const Pinch = Object.freeze({ NoDrag: 0, NoDragging: 0, XAxis: 1, YAxis: 2, XAndYAxis: 3, XandYAxis: 3 });

const parentOf = (item) => {
  const parent = item.parent;
  return parent?.$node ? parent : null;
};

const place = (into, self, x, y) => {
  const at = sceneToItem(self, x, y);
  into.x = at.x;
  into.y = at.y;
};

// Qt's `PinchEvent`: one per area, filled in for each signal. The points and
// centres are the area's own coordinates.
function event(self, centerX, centerY, scale, angle, rotation, count) {
  const mine = self.$mine;
  const pinch = mine.event;
  place(pinch.center, self, centerX, centerY);
  place(pinch.previousCenter, self, mine.lastCenterX, mine.lastCenterY);
  place(pinch.startCenter, self, mine.startCenterX, mine.startCenterY);
  place(pinch.startPoint1, self, mine.start1X, mine.start1Y);
  place(pinch.startPoint2, self, mine.start2X, mine.start2Y);
  place(pinch.point1, self, mine.last1X, mine.last1Y);
  place(pinch.point2, self, mine.last2X, mine.last2Y);
  pinch.scale = scale;
  pinch.previousScale = mine.lastScale;
  pinch.angle = angle;
  pinch.previousAngle = mine.lastAngle;
  pinch.rotation = rotation;
  pinch.pointCount = count;
  pinch.accepted = true;
  return pinch;
}

// The fingers are all gone.
function finish(self) {
  const mine = self.$mine;
  if (mine.inPinch) {
    mine.inPinch = false;
    const pinch = event(self, mine.lastCenterX, mine.lastCenterY, mine.lastScale, mine.lastAngle, mine.rotation, 0);
    self.pinchFinished(pinch);
    mine.startDistance = 0;
    mine.activated = false;
    if (self.pinch.target) {
      slot(self, "pinch$active").write(false);
      settle();
    }
  }
  mine.init = mine.rejected = mine.keep = false;
  mine.first = null;
}

// Qt's `updatePinchTarget`.
function follow(self) {
  const mine = self.$mine;
  const pinch = self.pinch;
  const target = pinch.target;
  if (!target) return;
  slot(target, "scale").write(bound(pinch.minimumScale, mine.startScale * mine.lastScale, pinch.maximumScale));
  const parent = parentOf(target);
  const x = mine.lastCenterX - mine.startCenterX + mine.startX;
  const y = mine.lastCenterY - mine.startCenterY + mine.startY;
  const at = parent ? sceneToItem(parent, x, y) : { x, y };
  const axis = pinch.dragAxis;
  if (axis & Pinch.XAxis) slot(target, "x").write(bound(pinch.minimumX, at.x, pinch.maximumX));
  if (axis & Pinch.YAxis) slot(target, "y").write(bound(pinch.minimumY, at.y, pinch.maximumY));
  // A target that was turned further than the limits is left as it is.
  if (mine.startRotation >= pinch.minimumRotation && mine.startRotation <= pinch.maximumRotation) {
    slot(target, "rotation").write(
      bound(pinch.minimumRotation, mine.rotation + mine.startRotation, pinch.maximumRotation),
    );
  }
  settle();
}

// The fingers as they are now; `pressed` is the one that has just come down.
function update(self, pressed) {
  const mine = self.$mine;
  const points = mine.points;
  if (points.length < 2) mine.keep = false;
  if (!points.length) return finish(self);
  const one = points[0];
  const two = points[points.length >= 2 ? 1 : 0];
  if (pressed === one) {
    mine.start1X = one.x;
    mine.start1Y = one.y;
  }
  if (pressed === two) {
    mine.start2X = two.x;
    mine.start2Y = two.y;
  }
  // A pinch can begin when the second finger comes down, both on the area.
  if (points.length === 2 && pressed && self.contains(one.in(self)) && self.contains(two.in(self))) {
    mine.first = one;
    mine.activated = mine.init = mine.keep = true;
    takeExclusive(one, self, true);
    takeExclusive(two, self, true);
  }
  if (!mine.activated || mine.rejected) return;

  const dx = two.x - one.x;
  const dy = two.y - one.y;
  const distance = Math.hypot(dx, dy);
  let centerX = (one.x + two.x) / 2;
  let centerY = (one.y + two.y) / 2;
  // The angle of the line from the first to the second, anticlockwise.
  let angle = (Math.atan2(-dy, dx) * 180) / Math.PI;
  if (angle < 0) angle += 360;
  if (points.length === 1) {
    // One finger left: it moves the middle, and turns nothing.
    const first = mine.first === one;
    centerX = mine.lastCenterX + one.x - (first ? mine.last1X : mine.last2X);
    centerY = mine.lastCenterY + one.y - (first ? mine.last1Y : mine.last2Y);
    angle = mine.lastAngle;
  }
  mine.first = one;
  if (angle > 180) angle -= 360;

  if (!mine.inPinch || mine.init) {
    if (points.length < 2) return;
    if (mine.init) {
      if (!mine.inPinch) mine.startDistance = distance;
      mine.init = false;
    }
    mine.startCenterX = mine.lastCenterX = centerX;
    mine.startCenterY = mine.lastCenterY = centerY;
    mine.lastScale = 1;
    mine.lastAngle = angle;
    mine.rotation = 0;
    mine.last1X = one.x;
    mine.last1Y = one.y;
    mine.last2X = two.x;
    mine.last2Y = two.y;
    const moved =
      Math.abs(one.x - mine.start1X) >= DRAG_THRESHOLD ||
      Math.abs(one.y - mine.start1Y) >= DRAG_THRESHOLD ||
      Math.abs(two.x - mine.start2X) >= DRAG_THRESHOLD ||
      Math.abs(two.y - mine.start2Y) >= DRAG_THRESHOLD;
    const pinch = self.pinch;
    if (Math.abs(distance - mine.startDistance) < DRAG_THRESHOLD && !(pinch.dragAxis !== Pinch.NoDrag && moved)) return;
    mine.startDistance = distance;
    const started = event(self, centerX, centerY, 1, angle, 0, points.length);
    self.pinchStarted(started);
    // A handler that wants none of it says `pinch.accepted = false`.
    if (!started.accepted) {
      mine.rejected = true;
      return;
    }
    mine.inPinch = mine.keep = true;
    takeExclusive(one, self, true);
    takeExclusive(two, self, true);
    const target = pinch.target;
    if (!target) return;
    const parent = parentOf(target);
    const at = parent ? itemToScene(parent, target.x, target.y) : target;
    mine.startX = at.x;
    mine.startY = at.y;
    mine.startScale = target.scale;
    mine.startRotation = target.rotation;
    slot(self, "pinch$active").write(true);
    settle();
    return;
  }
  if (!(mine.startDistance > 0)) return;
  const scale = distance ? distance / mine.startDistance : mine.lastScale;
  let turned = mine.lastAngle - angle;
  if (turned > 180) turned -= 360;
  else if (turned < -180) turned += 360;
  mine.rotation += turned;
  const pinch = event(self, centerX, centerY, scale, angle, mine.rotation, points.length);
  // After what was is said, the points are where they are now.
  mine.lastScale = scale;
  mine.lastCenterX = centerX;
  mine.lastCenterY = centerY;
  mine.lastAngle = angle;
  mine.last1X = one.x;
  mine.last1Y = one.y;
  mine.last2X = two.x;
  mine.last2Y = two.y;
  place(pinch.point1, self, one.x, one.y);
  place(pinch.point2, self, two.x, two.y);
  self.pinchUpdated(pinch);
  follow(self);
}

function track(self, point) {
  const points = self.$mine.points;
  if (points.includes(point)) return;
  points.push(point);
  update(self, point);
}

function untrack(self, point) {
  const points = self.$mine.points;
  const index = points.indexOf(point);
  if (index < 0) return;
  points.splice(index, 1);
  update(self, null);
}

const xy = () => ({ x: 0, y: 0 });

export const PinchArea = defineType("PinchArea", Item, {
  properties: {
    pinch: group({
      target: null,
      minimumScale: 1,
      maximumScale: 1,
      minimumRotation: 0,
      maximumRotation: 0,
      dragAxis: Pinch.NoDrag,
      minimumX: -FLT_MAX,
      maximumX: FLT_MAX,
      minimumY: -FLT_MAX,
      maximumY: FLT_MAX,
      active: false,
    }),
  },
  signals: ["pinchStarted", "pinchUpdated", "pinchFinished"],
  methods: {
    // A finger on the area is the area's: the next one makes a pinch of it.
    $press(point) {
      if (point.type !== "touch") return false;
      track(this, point);
      return true;
    },
    // One on something inside it is that thing's too, until there is a pinch.
    $filter(point) {
      if (point.type !== "touch" || !this.enabled || !this.contains(point.in(this))) return false;
      track(this, point);
      // It is told as a filter until the point is its own.
      return point.exclusive !== this;
    },
    $move(point) {
      if (this.$mine.points.includes(point)) gather(this, point);
    },
    $gathered() {
      update(this, null);
    },
    $release(point) {
      untrack(this, point);
    },
    $grab(transition, point) {
      if (transition === CancelGrabExclusive || transition === CancelGrabPassive) untrack(this, point);
    },
    // Once two fingers are on it, nothing takes them.
    $keeps() {
      return this.$mine.keep;
    },
  },
  setup(self) {
    self.$mine = {
      points: [],
      // The finger that was the first of the two at the last event.
      first: null,
      // Two fingers came down on the area; they made a pinch; a handler
      // refused it.
      activated: false,
      init: false,
      inPinch: false,
      rejected: false,
      keep: false,
      // The scene's coordinates, all of them.
      start1X: 0,
      start1Y: 0,
      start2X: 0,
      start2Y: 0,
      last1X: 0,
      last1Y: 0,
      last2X: 0,
      last2Y: 0,
      startCenterX: 0,
      startCenterY: 0,
      lastCenterX: 0,
      lastCenterY: 0,
      startDistance: 0,
      lastScale: 1,
      lastAngle: 0,
      rotation: 0,
      // What the target was when the pinch started.
      startX: 0,
      startY: 0,
      startScale: 1,
      startRotation: 0,
      event: {
        scale: 1,
        previousScale: 1,
        center: xy(),
        previousCenter: xy(),
        startCenter: xy(),
        angle: 0,
        previousAngle: 0,
        rotation: 0,
        point1: xy(),
        point2: xy(),
        startPoint1: xy(),
        startPoint2: xy(),
        pointCount: 0,
        accepted: true,
      },
    };
    receive(self);
    onCleanup(() => gone(self));
    // Two fingers on the area pinch what it says, not the page.
    self.$node.style.touchAction = "none";
  },
});

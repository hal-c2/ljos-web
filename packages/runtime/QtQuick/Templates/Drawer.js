// Drawer: a popup that slides in from an edge of its window, and that the
// mouse or a finger drags in and out. `position` says how far in it is, and
// its `enter` and `exit` are what move it.
import { defineType, effect, settle, slot } from "../../object.js";
import { Property } from "../animation/property.js";
import { canTake, takeExclusive, watch } from "../pointer.js";
import { contains, edge, itemOf, overlayOf, Popup } from "./Popup.js";
import { untrack } from "#kernel";

const TopEdge = 1;
const LeftEdge = 2;
const RightEdge = 4;
const BottomEdge = 8;
const EDGES = [TopEdge, LeftEdge, RightEdge, BottomEdge];

// How far the mouse goes before the drawer is its: further than a Flickable
// asks for, so that what is in the drawer has it first.
const THRESHOLD = 20;
// How fast, in pixels a second, a drawer is let go of for the way it was
// going to decide where it ends.
const FLICK = 300;

const across = (self) => self.edge === LeftEdge || self.edge === RightEdge;
const far = (self) => self.edge === RightEdge || self.edge === BottomEdge;

const windowOf = (self) => self.$pop.overlay ?? overlayOf(self.parent);

// How far in the drawer would be with its inner edge at a point.
function positionAt(self, point) {
  const window = windowOf(self);
  if (!window) return 0;
  switch (self.edge) {
    case TopEdge:
      return point.y / self.height;
    case LeftEdge:
      return point.x / self.width;
    case RightEdge:
      return (window.width - point.x) / self.width;
    default:
      return (window.height - point.y) / self.height;
  }
}

// How far that is from where it is: kept while it is dragged, so that it does
// not jump to the point. One pushed from outside does.
function offsetAt(self, point) {
  const position = self.position;
  const offset = positionAt(self, point) - position;
  return offset > 0 && position > 0 && !contains(self.$item, point) ? 0 : offset;
}

function inMargin(self, point) {
  const window = windowOf(self);
  if (!window) return false;
  const margin = self.dragMargin;
  switch (self.edge) {
    case TopEdge:
      return point.y <= margin;
    case LeftEdge:
      return point.x <= margin;
    case RightEdge:
      return point.x >= window.width - margin;
    default:
      return point.y >= window.height - margin;
  }
}

function pressed(self) {
  const pull = self.$pull;
  pull.pressed = true;
  pull.grabbed = pull.delayed = false;
  pull.offset = 0;
}

// Qt's `grabMouse`: a move goes to the drawer that has the point, and makes
// it the drawer's once it has gone far enough along, and not across.
function moved(self, point) {
  const pull = self.$pull;
  const item = self.$item;
  if (!pull.pressed) return;
  if (pull.grabbed) {
    if (self.position === 1 && !contains(item, point)) pull.offset = 0;
    self.position = positionAt(self, point) - pull.offset;
    return;
  }
  if (!self.interactive || !canTake(point, item)) return;
  const sideways = across(self);
  const position = self.position;
  const margin = self.dragMargin;
  let over = false;
  if (position > 0 || margin > 0) {
    const overX = Math.abs(point.x - point.pressX) > THRESHOLD;
    const overY = Math.abs(point.y - point.pressY) > THRESHOLD;
    over = sideways ? overX && !overY : overY && !overX;
  }
  // From outside one that is open, only close to its edge.
  if (over && position === 1 && !contains(item, point)) {
    over = sideways ? Math.abs(point.x - self.width) < margin : Math.abs(point.y - self.height) < margin;
  }
  if (!over) return;
  if (pull.delayed) {
    pull.delayed = false;
    self.$prepare();
  }
  takeExclusive(point, item, true);
  pull.grabbed = true;
  // Where it is let go of closes nothing: how far in it is decides.
  self.$pop.outside = self.$pop.outsideParent = false;
  pull.offset = offsetAt(self, point);
}

function settled(self, enter) {
  if (enter) self.$again();
  else self.close();
}

// Qt's `handleRelease`: it goes the rest of the way in or out, by how far in
// it is, how fast it was going, and which way.
function released(self, point) {
  const pull = self.$pull;
  const grabbed = pull.grabbed;
  pull.pressed = pull.grabbed = pull.delayed = false;
  if (!grabbed) return;
  const way = (across(self) ? point.x - point.pressX : point.y - point.pressY) * (far(self) ? -1 : 1);
  const seconds = (point.time - point.pressTime) / 1000;
  const velocity = seconds > 0 ? way / seconds : way ? way * Infinity : 0;
  const position = self.position;
  if (position > 0.7 || velocity > FLICK) settled(self, true);
  else if (position < 0.3 || velocity < -FLICK) settled(self, false);
  else settled(self, way > 0);
}

export const Drawer = defineType("Drawer", Popup, {
  properties: {
    edge: LeftEdge,
    position: 0,
    dragMargin: 10,
    interactive: true,
    modal: true,
    focus: true,
    closePolicy: Popup.CloseOnEscape | Popup.CloseOnReleaseOutside,
  },
  resolve: {
    position: (self, own) => {
      const position = own();
      return position > 0 ? Math.min(1, position) : 0;
    },
  },
  methods: {
    // It moves along its edge and is made to fit along it, and nothing but
    // `position` says where it is the other way.
    get $moveX() {
      return !across(this);
    },
    get $moveY() {
      return across(this);
    },
    get $resizeX() {
      return !across(this);
    },
    get $resizeY() {
      return across(this);
    },
    // What is behind it is as see-through as the drawer is far out.
    $fades: false,
    $relax: false,
    // Qt puts the item there, in the overlay, and then places it as it does
    // any popup's, which is in its parent: where the parent is counts twice.
    $kept(sideways, size, overlay, map) {
      const position = this.position;
      const at = far(this) ? (sideways ? overlay.width : overlay.height) - position * size : (position - 1) * size;
      return sideways ? map(at, 0).x : map(0, at).y;
    },
    $behind(overlay) {
      const item = this.$item;
      return across(this) ? [0, item.y, overlay.width, item.height] : [item.x, 0, item.width, overlay.height];
    },
    // `enter` takes it all the way in and `exit` all the way out: an
    // animation that names nothing is of `position`.
    $actions(transition, entering) {
      transition.$source = { key: "position", object: this };
      return [{ property: new Property(this, "position"), to: entering ? 1 : 0, shown: false }];
    },
    // Qt's `blockInput`.
    $bars(point) {
      if (this.$pull.grabbed) return true;
      const dimmer = this.$pop.dimmer;
      if (dimmer && !contains(dimmer, point)) return false;
      return inMargin(this, point) || this.modal;
    },
    $barred(point) {
      pressed(this);
      watch(point, this.$item);
    },
    // Qt's `startDrag`: a press at its edge is watched, and the drawer comes
    // once the mouse has gone far enough.
    $begin(point) {
      this.$pull.delayed = false;
      if (!this.interactive || !(this.dragMargin > 0) || !inMargin(this, point)) return;
      pressed(this);
      this.$pull.delayed = true;
      watch(point, this.$item);
    },
  },
  setup(self) {
    self.$pull = { pressed: false, grabbed: false, delayed: false, offset: 0 };
    edge(self);
    // Qt sets it as the position changes, and leaves it otherwise: what is
    // behind a drawer opened where it already was stays unseen.
    let was;
    effect(
      () => self.position,
      (position) => {
        if (position === was) return;
        const first = was === undefined;
        was = position;
        const dimmer = self.$pop.dimmer;
        if (dimmer && !first) slot(dimmer, "opacity").write(position);
      },
    );
  },
});

// An edge that is none is not taken.
const edgeOf = Object.getOwnPropertyDescriptor(Drawer.proto, "edge");
Object.defineProperty(Drawer.proto, "edge", {
  ...edgeOf,
  set(value) {
    if (EDGES.includes(value)) return edgeOf.set.call(this, value);
    console.warn("invalid edge value - valid values are: Qt.TopEdge, Qt.LeftEdge, Qt.RightEdge, Qt.BottomEdge");
  },
});

itemOf(Drawer, {
  methods: {
    // Tab stays in one that is modal.
    get $tabFence() {
      return untrack(() => this.$popup.modal);
    },
    $handlePress() {
      pressed(this.$popup);
    },
    $handleMove(x, y, point) {
      moved(this.$popup, point);
    },
    $handleRelease(x, y, point) {
      released(this.$popup, point);
    },
    // The page took the point while the drawer was held: Qt leaves it where
    // it is, and here it goes to the nearer end.
    $handleUngrab() {
      const drawer = this.$popup;
      const pull = drawer.$pull;
      const grabbed = pull.grabbed;
      pull.pressed = pull.grabbed = pull.delayed = false;
      if (!grabbed) return;
      settled(drawer, drawer.position >= 0.5);
      settle();
    },
    // What is in the drawer has a press, and the drawer sees where it goes.
    $filter(point) {
      const drawer = this.$popup;
      if (!point.primary || !drawer.interactive) return false;
      pressed(drawer);
      return true;
    },
    $keeps() {
      return this.$popup.$pull.grabbed;
    },
  },
});

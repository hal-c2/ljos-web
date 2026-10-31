// Popup: what is shown over everything else in its window, and Overlay, the
// item across the window that the popups of the window are in.
//
// A popup is not an item. What it shows is an item Qt makes for it, a page
// with the popup's `background` and `contentItem`: it is in the overlay while
// the popup is open and nowhere otherwise. Most of what a popup is asked, its
// size, its padding, its font, is that item's, and is kept there.
import { onCleanup, runWithOwner } from "solid-js";
import { defineType, derived, effect, group, inside, instantiate, last, QtObject, settle, signal, slot, whenComplete } from "../../object.js";
import { STOPPED } from "../animation/jobs.js";
import { Property } from "../animation/property.js";
import {
  activeFocusItem,
  arrived,
  departing,
  forceActiveFocus,
  OtherFocusReason,
  setFocus,
  tab,
  windowOf as focusWindow,
} from "../focus.js";
import { frameOf, itemToScene, sceneToItem } from "../geometry.js";
import { Item } from "../Item.js";
import { AllButtons, buttonOf, Key, RightButton, ShiftModifier } from "../keycodes.js";
import { gone, hoverable, overhear, receive, wheels } from "../pointer.js";
import { windowOf } from "../Window.js";
import { Page } from "./Pane.js";
import { signal as graphed, untrack } from "#kernel";
import { roleOf, speaks } from "../Accessible.js";

const NONE = Object.freeze([]);

// `Qt.PopupFocusReason`.
export const PopupFocusReason = 4;

const CloseOnPressOutside = 1;
const CloseOnPressOutsideParent = 2;
const CloseOnReleaseOutside = 4;
const CloseOnReleaseOutsideParent = 8;
const CloseOnEscape = 16;

// Where a popup is between being asked to open and being open, and between
// being asked to close and being gone.
const IDLE = 0;
const ENTERING = 1;
const EXITING = 2;

// What an item is in. The item of a popup that is not open is in nothing:
// it is asked for what the popup is in.
const above = (item) => {
  const parent = item.parent ?? item.$popup?.parent;
  return parent?.$node ? parent : null;
};

const overlays = new Set();

// Whether an item is in a window: what is in a popup that is not shown is
// in none.
export function housed(item) {
  for (let at = item; at; at = untrack(() => at.parent)) if (at.$popup && !at.$popup.$pop.shown) return false;
  return true;
}

// The popups asked to show over an item that is in no window: Qt shows them
// when it comes to be in one, the last made first.
const waiting = new Set();
let serial = 0;

function wake() {
  const ready = [...waiting].filter((popup) => housed(untrack(() => popup.parent)));
  ready.sort((a, b) => b.$pop.serial - a.$pop.serial);
  for (const popup of ready) waiting.delete(popup);
  for (const popup of ready) {
    if (!popup.$pop.waits) continue;
    popup.$pop.waits = false;
    show(popup);
  }
}

// What a popup is shown over left its window: the popup goes with it and
// says nothing, and comes back when it does.
function strand(overlay) {
  for (const popup of stacked(overlay)) {
    const pop = popup.$pop;
    if (!pop.overlay || housed(untrack(() => popup.parent))) continue;
    if (pop.phase === EXITING) {
      stop(pop);
      finish(popup);
      continue;
    }
    stop(pop);
    leave(popup);
    if (overlay.$lastFocusPopup === popup) overlay.$lastFocus = overlay.$lastFocusPopup = null;
    pop.visible = false;
    pop.phase = IDLE;
    pop.hadFocus = false;
    pop.lastFocus = null;
    pop.overlay = null;
    pop.waits = true;
    waiting.add(popup);
    slot(popup, "visible").changed();
    slot(popup, "opened").changed();
  }
}

// What an item is in that is in nothing itself.
function topOf(item) {
  let top = item;
  for (let up = above(top); up; up = above(top)) top = up;
  return top;
}

// The overlay of the window an item is in: made when first asked for.
export function overlayOf(item) {
  if (!item?.$node) return null;
  const top = topOf(item);
  if (top.$overlay === undefined) cover(top);
  return top.$overlay;
}

// The popups that are dragged in from an edge of their window: the drawers.
// Qt's overlay is there to see while its window has one, and they are asked
// of every press that is on nothing of the overlay's.
const edged = new Set();
const [edges, setEdges] = graphed(0);

export function edge(popup) {
  edged.add(popup);
  setEdges((version) => version + 1);
  onCleanup(() => {
    edged.delete(popup);
    setEdges((version) => version + 1);
  });
}

function drawn(overlay) {
  edges();
  const top = overlay.parent;
  for (const popup of edged) {
    const parent = popup.parent;
    if (parent && topOf(parent) === top) return true;
  }
  return false;
}

function cover(top) {
  const overlay = runWithOwner(top.$owner, () =>
    untrack(() =>
      inside(top, () =>
        Overlay({
          get width() {
            return top.width;
          },
          get height() {
            return top.height;
          },
        }),
      ),
    ),
  );
  overlay.$top = top;
  Object.defineProperty(top, "$overlay", { value: overlay });
  top.$add(overlay);
  // A modal popup keeps a press from everything it is not in.
  const blocks = top.$blocks;
  top.$blocks = function (point, receiver) {
    return overlay.$barrier !== null || blocks?.call(this, point, receiver) === true;
  };
  overlays.add(overlay);
  runWithOwner(top.$owner, () => onCleanup(() => overlays.delete(overlay)));
  listen();
}

// The overlay of what `Overlay` was attached to: an item, a popup or a
// window.
function overlayFor(object) {
  if (object?.$node) return overlayOf(object);
  if (object?.$pop) return overlayOf(object.parent);
  return overlayOf(object?.$contentItem);
}

const OverlayAttached = defineType("OverlayAttached", QtObject, {
  properties: {
    overlay: derived((self) => overlayFor(self.$for)),
    modal: null,
    modeless: null,
  },
  signals: ["pressed", "released"],
  setup(self, props) {
    self.$for = props.$attachee;
    if (!("onPressed" in props) && !("onReleased" in props)) return;
    // Only one that listens is told of a press.
    let heard = null;
    effect(
      () => self.overlay,
      (overlay) => {
        heard?.$heard.delete(self);
        heard = overlay;
        overlay?.$heard.add(self);
      },
    );
    onCleanup(() => heard?.$heard.delete(self));
  },
});

export const Overlay = defineType("Overlay", Item, {
  properties: {
    z: 1000001,
    // There is an overlay to see while something is in it.
    visible: derived((self) => self.children.length > 0 || drawn(self)),
    modal: null,
    modeless: null,
  },
  resolve: { visible: Item.spec.resolve.visible },
  signals: ["pressed", "released"],
  methods: {
    // Puts `item` in the overlay right under `over`, which is in it.
    $under(item, over) {
      const all = (this.$extra ??= []);
      const at = all.indexOf(over);
      all.splice(at < 0 ? all.length : at, 0, item);
      this.$touch((version) => version + 1);
    },
  },
  setup(self) {
    self.$heard = new Set();
    // The modal popup the press that is being delivered stops at.
    self.$barrier = null;
    // What had focus before the first popup that took it was opened, and
    // that popup.
    self.$lastFocus = null;
    self.$lastFocusPopup = null;
    // An overlay is in the way of what is the page's own, a field that is
    // typed in, only while a popup in it is modal: a press beside any other
    // is for what is under it.
    effect(
      () => self.children.some((item) => item.$popup?.modal === true),
      (modal) => {
        self.$node.style.pointerEvents = modal ? "" : "none";
      },
    );
  },
  attached: OverlayAttached,
});

// The popups of an overlay, the topmost first: Qt's `stackingOrderPopups`.
export function stacked(overlay) {
  const items = untrack(() => overlay.children).filter((item) => item.$popup);
  const order = new Map(items.map((item, index) => [item, index]));
  const z = (item) => untrack(() => item.z);
  return items.sort((a, b) => z(b) - z(a) || order.get(b) - order.get(a)).map((item) => item.$popup);
}

function inTree(root, item) {
  for (let at = item; at; at = untrack(() => at.parent)) if (at === root) return true;
  return false;
}

// Whether `self` was declared in `other`, however deep.
function declaredIn(other, self) {
  for (let at = self; at; at = at.$popup ?? at.$parent) if (at === other) return true;
  return false;
}

const always = () => true;
const nothing = () => {};

// The popup whose item is being made: the item is told as it is.
let making = null;

// What a popup shows. It takes every press and every key that reaches it,
// so that nothing under the popup has them, and Tab does not leave it.
export const PopupItem = defineType("Popup", Page, {
  methods: {
    $focusScope: true,
    $tabFence: true,
    $accepts: AllButtons,
    $hovers: always,
    $wheel: always,
    $keyPressed(event) {
      event.accepted = true;
      return this.$popup.$key(event);
    },
    $keyReleased(event) {
      event.accepted = true;
    },
  },
  setup(self) {
    const popup = (self.$popup = making);
    // What the overlay lets through, the popup does not.
    self.$node.style.pointerEvents = "auto";
    // Its font is the window's where it has none: a popup inherits nothing
    // from the item it is shown over.
    self.$around = () => {
      const window = windowOf(popup.parent);
      return window?.$fonted ? window : null;
    };
  },
});

// The properties of a popup that are its item's, declared so that each has
// its change signal.
export const forwarded = (names) => Object.fromEntries(names.map((name) => [name, undefined]));

// Makes them the item's: read there, written there, and bound there, since
// what the popup was given for them its item is given.
export function forward(Type, names) {
  Type.proto.$forwards = new Set([...(Type.proto.$forwards ?? NONE), ...names]);
  for (const name of names) {
    Type.slots[name] = (self) => slot(self.$item, name);
    Object.defineProperty(Type.proto, name, {
      get() {
        return this.$item[name];
      },
      set(value) {
        this.$item[name] = value;
      },
      enumerable: true,
      configurable: true,
    });
  }
}

// The type of the item of a type of popup. It is named as the popup is: a
// style says what font a tool tip is set in by that name.
export function itemOf(Type, spec) {
  const made = defineType(Type.typeName, Type.base.proto.$Item, spec);
  Type.proto.$Item = made;
  return made;
}

const ITEM = [
  "width",
  "height",
  "implicitWidth",
  "implicitHeight",
  "z",
  "opacity",
  "scale",
  "clip",
  "enabled",
  "transformOrigin",
  "padding",
  "horizontalPadding",
  "verticalPadding",
  "topPadding",
  "leftPadding",
  "rightPadding",
  "bottomPadding",
  "topInset",
  "leftInset",
  "rightInset",
  "bottomInset",
  "spacing",
  "locale",
  "mirrored",
  "availableWidth",
  "availableHeight",
  "background",
  "contentItem",
  "contentWidth",
  "contentHeight",
  "contentChildren",
  "contentData",
  "implicitContentWidth",
  "implicitContentHeight",
  "implicitBackgroundWidth",
  "implicitBackgroundHeight",
  "activeFocus",
];

// What the item is made with: what the popup was given of the item's.
function given(self, props) {
  const forwards = self.$forwards;
  // Qt names the item after the popup's type.
  const own = { objectName: self.$type.typeName };
  for (const key of Object.keys(props)) {
    if (!forwards.has(key) && !key.startsWith("font$") && !key.startsWith("palette$") && key !== "font") continue;
    Object.defineProperty(own, key, Object.getOwnPropertyDescriptor(props, key));
  }
  return own;
}

// What a slot was given, whatever it was placed at.
function asked(held) {
  held.asked();
  return held.assigned ? held.value : held.bound ? held.bound() : held.given;
}

// How much of a rectangle is inside another, across and down: nothing either
// way where they do not meet.
function meet(x, y, w, h, bx, by, bw, bh) {
  const across = Math.min(x + w, bx + bw) - Math.max(x, bx);
  const down = Math.min(y + h, by + bh) - Math.max(y, by);
  return across > 0 && down > 0 ? [across, down] : [0, 0];
}

// Where the popup's item goes in the overlay, and how big it is made to fit:
// Qt's `QQuickPopupPositioner::reposition`.
function position(self) {
  if (!self.$placing()) return null;
  const item = self.$item;
  const parent = self.parent;
  const overlay = self.$pop.overlay;
  if (!parent || !overlay) return null;
  const hasWidth = slot(item, "width").explicit();
  const hasHeight = slot(item, "height").explicit();
  const iw = item.implicitWidth;
  const ih = item.implicitHeight;
  const centre = self.anchors.centerIn;
  const px = slot(self, "x").asked();
  const py = slot(self, "y").asked();
  const map = (x, y) => {
    const scene = itemToScene(parent, x, y);
    return sceneToItem(overlay, scene.x, scene.y);
  };
  let w = hasWidth ? asked(slot(item, "width")) : iw;
  let h = hasHeight ? asked(slot(item, "height")) : ih;
  let x = centre ? 0 : self.$moveX ? px : self.$kept(true, w, overlay, map);
  let y = centre ? 0 : self.$moveY ? py : self.$kept(false, h, overlay, map);
  let relax = self.$relax;
  if (centre === overlay) {
    x = Math.round(overlay.width / 2) - w / 2;
    y = Math.round(overlay.height / 2) - h / 2;
    // A popup centred in the overlay is not let out of the window.
    relax = false;
  } else if (centre === parent) {
    const middle = map(Math.round(parent.width / 2), Math.round(parent.height / 2));
    x = middle.x - w / 2;
    y = middle.y - h / 2;
  } else if (centre) {
    console.warn("Popup can only be centered within its immediate parent or Overlay.overlay");
    return null;
  } else {
    ({ x, y } = map(x, y));
  }
  const left = self.leftMargin;
  const top = self.topMargin;
  const right = self.rightMargin;
  const bottom = self.bottomMargin;
  const bx = Math.max(0, left);
  const by = Math.max(0, top);
  const bw = overlay.width - bx - Math.max(0, right);
  const bh = overlay.height - by - Math.max(0, bottom);
  // What does not fit on one side of its parent is tried on the other.
  if (self.$flipX && (x < bx || x + w > bx + bw)) {
    const flipped = map(parent.width - px - w, py);
    if (meet(flipped.x, flipped.y, w, h, bx, by, bw, bh)[0] > meet(x, y, w, h, bx, by, bw, bh)[0]) x = flipped.x;
  }
  if (self.$flipY && (y < by || y + h > by + bh)) {
    const flipped = map(px, parent.height - py - h);
    if (meet(flipped.x, flipped.y, w, h, bx, by, bw, bh)[1] > meet(x, y, w, h, bx, by, bw, bh)[1]) y = flipped.y;
  }
  // A margin that was given keeps the popup inside it.
  if (self.$moveY) {
    if (top >= 0 && y < by) y = top;
    if (bottom >= 0 && y + h > by + bh) y = by + bh - h;
  }
  if (self.$moveX) {
    if (left >= 0 && x < bx) x = left;
    if (right >= 0 && x + w > bx + bw) x = bx + bw - w;
  }
  let narrowed = false;
  if (iw > 0 && (x < bx || x + w > bx + bw)) {
    if (self.$moveX && self.$flipX) {
      if (x < bx && bx + w <= bx + bw) x = bx;
      else if (x + w > bx + bw && bx + bw - w >= bx) x = bx + bw - w;
    }
    // At last it is made to fit.
    if (self.$resizeX) {
      if ((left >= 0 || !relax) && x < bx) {
        w -= bx - x;
        x = bx;
        narrowed = true;
      }
      if ((right >= 0 || !relax) && x + w > bx + bw) {
        w = bx + bw - x;
        narrowed = true;
      }
    }
  }
  let shortened = false;
  if (ih > 0 && (y < by || y + h > by + bh)) {
    if (self.$moveY && self.$flipY) {
      if (y < by && by + h <= by + bh) y = by;
      else if (y + h > by + bh && by + bh - h >= by) y = by + bh - h;
    }
    if (self.$resizeY) {
      if ((top >= 0 || !relax) && y < by) {
        h -= by - y;
        y = by;
        shortened = true;
      }
      if ((bottom >= 0 || !relax) && y + h > by + bh) {
        h = by + bh - y;
        shortened = true;
      }
    }
  }
  // Where that is for the popup, whose `x` and `y` are in its parent.
  const scene = itemToScene(overlay, x, y);
  const own = centre === overlay ? { x, y } : sceneToItem(parent, scene.x, scene.y);
  return [x, y, !hasWidth && narrowed && w > 0 ? w : undefined, !hasHeight && shortened && h > 0 ? h : undefined, own.x, own.y];
}

function placed(self, where) {
  if (!where) return;
  const [x, y, width, height, ownX, ownY] = where;
  const item = self.$item;
  const pop = self.$pop;
  slot(item, "x").place(x);
  slot(item, "y").place(y);
  slot(item, "width").place(width);
  slot(item, "height").place(height);
  if (pop.x !== ownX) {
    pop.x = ownX;
    slot(self, "x").changed();
  }
  if (pop.y !== ownY) {
    pop.y = ownY;
    slot(self, "y").changed();
  }
}

// What is behind a popup that dims: the component its `Overlay.modal` or
// `Overlay.modeless` names, else the overlay's own. A modal popup with
// neither has an item nobody sees, which the mouse does not get through.
function dimmed(self) {
  const pop = self.$pop;
  if (pop.dimmer || pop.dimKind) return;
  const overlay = pop.overlay;
  const modal = self.modal;
  pop.dimKind = modal ? 2 : 1;
  const own = self.$attached?.Overlay;
  const component = (own ? (modal ? own.modal : own.modeless) : null) ?? (modal ? overlay.modal : overlay.modeless);
  const made = component ? instantiate(component, {}, overlay, self.$owner) : modal ? instantiate(Item, {}, overlay, self.$owner) : null;
  if (!made) return;
  const dimmer = made.object;
  if (!dimmer?.$node) return made.dispose();
  overlay.$under(dimmer, self.$item);
  slot(dimmer, "z").write(self.$item.z);
  if (modal) {
    dimmer.$hovers ??= always;
    dimmer.$hover ??= nothing;
    dimmer.$wheel ??= always;
    receive(dimmer);
    hoverable(1);
    wheels();
  }
  // It comes and goes with the popup: a Behavior on its opacity fades it,
  // from nothing, which it has to see before it is told where to go.
  pop.dimmed = dimmer.opacity;
  new Property(dimmer, "opacity").write(0);
  settle();
  pop.dimmer = dimmer;
  pop.dimmerIn = overlay;
  pop.dispose = made.dispose;
  self.$setDimmer(dimmer);
}

function fade(self, on) {
  const pop = self.$pop;
  if (pop.dimmer && self.dim && self.$fades) slot(pop.dimmer, "opacity").write(on ? pop.dimmed : 0);
}

function undim(self) {
  const pop = self.$pop;
  const dimmer = pop.dimmer;
  const modal = pop.dimKind === 2;
  pop.dimKind = 0;
  if (!dimmer) return;
  pop.dimmerIn.$remove(dimmer);
  if (modal) {
    hoverable(-1);
    gone(dimmer);
  }
  pop.dispose();
  pop.dimmer = pop.dimmerIn = pop.dispose = null;
  self.$setDimmer(null);
}

const kindOf = (self) => (!self.dim ? 0 : self.modal ? 2 : 1);

// `modal` or `dim` changed while the popup is open: what is behind it is
// made again.
function dimAgain(self) {
  const pop = self.$pop;
  if (!pop.visible || kindOf(self) === pop.dimKind) return;
  undim(self);
  if (self.dim) dimmed(self);
  if (pop.phase !== EXITING) fade(self, true);
  settle();
}

function stop(pop) {
  const { job, transition } = pop;
  if (!job) return;
  pop.job = pop.transition = null;
  job.listener = null;
  job.stop();
  transition.$ran(false);
}

// Runs `enter` or `exit`, on the clock every animation runs on, and `done`
// when it ends: at once with none. What the popup has it change, and no
// animation of it took, is changed at once.
function run(self, transition, entering, done) {
  const pop = self.$pop;
  if (!transition?.enabled) return done();
  const actions = self.$actions(transition, entering);
  const modified = [];
  const job = transition.$prepare(actions, modified, false, self);
  for (const action of actions) if (!modified.includes(action)) action.property.write(action.to);
  pop.job = job;
  pop.transition = transition;
  const finished = () => {
    if (pop.job !== job) return;
    pop.job = pop.transition = null;
    transition.$ran(false);
    // Where its last step left it is where it is, before anything is told.
    settle();
    untrack(done);
    settle();
  };
  job.listener = { finished };
  transition.$ran(true);
  job.start();
  if (job.state === STOPPED) finished();
}

// Qt's `prepareEnterTransition`, in the order Qt does it: what a program
// hears of, it hears in that order. Whether there is a transition to run.
function prepare(self) {
  const pop = self.$pop;
  // One that is coming already: as it is, unless it is on its way.
  if (pop.phase === ENTERING) return !pop.job;
  const item = self.$item;
  const parent = self.parent;
  if (!parent) {
    console.warn("cannot show popup: parent is null");
    return false;
  }
  if (!pop.overlay && !housed(parent)) {
    pop.waits = true;
    waiting.add(self);
    return false;
  }
  // One that was going comes back, and one that is open comes again: Qt
  // tells of `visible` again, as it was.
  const back = pop.visible;
  if (pop.phase === EXITING) stop(pop);
  const before = activeFocusItem(parent);
  pop.visible = true;
  if (!pop.overlay) {
    const overlay = (pop.overlay = overlayOf(parent));
    // A popup opened from the one on top is over it.
    const over = stacked(overlay)[0];
    slot(item, "parent").write(overlay);
    overlay.$add(item);
    arrived(item);
    if (over && declaredIn(over, self) && !("z" in self.$props) && !slot(item, "z").assigned) {
      slot(item, "z").provide(Math.max(over.$item.z, item.z));
    }
    slot(item, "visible").write(true);
    pop.shown = true;
    self.$appeared(true);
    wheels();
    if (waiting.size) wake();
  }
  const overlay = pop.overlay;
  if (self.dim) dimmed(self);
  fade(self, true);
  self.aboutToShow();
  pop.phase = ENTERING;
  self.$setPlacing(true);
  settle();
  if (back) self.visibleChanged();
  else slot(self, "visible").changed();
  settle();
  if (before) {
    pop.lastFocus = before;
    if (!overlay.$lastFocus && !inTree(item, before)) {
      overlay.$lastFocus = before;
      overlay.$lastFocusPopup = self;
    }
  }
  if (self.focus) {
    setFocus(item, true, PopupFocusReason);
    settle();
  }
  return true;
}

// `again` is for one that is open, or on its way in by hand: a drawer let go
// of comes the rest of the way.
function show(self, again = false) {
  const pop = self.$pop;
  if (!again && pop.visible && pop.phase !== EXITING) return;
  if (!prepare(self)) return;
  run(self, self.enter, true, () => {
    pop.phase = IDLE;
    slot(self, "opened").changed();
    settle();
    self.$opened();
    self.$came();
  });
}

// Qt's `prepareExitTransition`.
function hide(self) {
  const pop = self.$pop;
  // One that never came, for it was waiting for a window: Qt tells of its
  // going all the same.
  if (pop.waits) {
    pop.waits = false;
    waiting.delete(self);
    self.aboutToHide();
    self.visibleChanged();
    settle();
    self.closed();
    return;
  }
  if (!pop.visible || pop.phase === EXITING) return;
  const item = self.$item;
  // One that was coming goes: it was not open yet, and Qt tells of `opened`
  // all the same.
  const coming = pop.phase === ENTERING;
  if (coming) stop(pop);
  pop.scale = item.scale;
  pop.opacity = item.opacity;
  pop.hadFocus ||= item.$active === true;
  if (self.focus) {
    setFocus(item, false, PopupFocusReason);
    settle();
  }
  pop.phase = EXITING;
  fade(self, false);
  self.aboutToHide();
  if (coming) self.openedChanged();
  else slot(self, "opened").changed();
  settle();
  self.$leaving();
  run(self, self.exit, false, () => finish(self));
}

// Takes the popup's item out of the overlay. One that is destroyed tells
// nobody.
function leave(self, told = true) {
  const pop = self.$pop;
  const item = self.$item;
  self.$setPlacing(false);
  departing(item);
  pop.overlay.$remove(item);
  slot(item, "parent").write(null);
  slot(item, "visible").write(false);
  pop.shown = false;
  if (told) {
    self.$appeared(false);
    strand(pop.overlay);
  }
  undim(self);
}

// Qt's `finalizeExitTransition`: the popup is gone, and focus goes to the
// popup under it that wants it, else back to what had it.
function finish(self) {
  const pop = self.$pop;
  const item = self.$item;
  const overlay = pop.overlay;
  leave(self);
  const others = stacked(overlay);
  let reset = overlay.$lastFocusPopup === self;
  if (reset) {
    for (const popup of others) {
      const saved = popup.$pop.lastFocus;
      if (popup.$pop.phase === EXITING || !saved) continue;
      if (saved !== overlay.$top && !inTree(item, saved)) overlay.$lastFocus = saved;
      overlay.$lastFocusPopup = popup;
      reset = false;
      break;
    }
  }
  if (pop.hadFocus) {
    const next = others.find((popup) => popup.$pop.phase !== EXITING && popup.focus && !popup.$item.$active);
    if (next) forceActiveFocus(next.$item, PopupFocusReason);
    else if (!focusWindow(overlay).$subFocus && overlay.$lastFocus) forceActiveFocus(overlay.$lastFocus, OtherFocusReason);
  }
  if (reset || !others.length) overlay.$lastFocus = overlay.$lastFocusPopup = null;
  pop.visible = false;
  pop.phase = IDLE;
  pop.hadFocus = false;
  pop.lastFocus = null;
  pop.overlay = null;
  slot(self, "visible").changed();
  settle();
  self.closed();
  // What `exit` made of the item it is not left as.
  if (item.scale !== pop.scale) new Property(item, "scale").write(pop.scale);
  if (item.opacity !== pop.opacity) new Property(item, "opacity").write(pop.opacity);
  settle();
}

export const contains = (item, point) => {
  const { x, y } = sceneToItem(item, point.x, point.y);
  return item.contains({ x, y });
};

// Qt's `tryClose`: a press or a release outside the popup closes it, if its
// `closePolicy` says so.
function tryClose(self, point, flags) {
  const pop = self.$pop;
  if (!pop.visible || pop.phase === EXITING || self.interactive === false) return;
  const policy = self.closePolicy & flags;
  const outside = (policy & (CloseOnPressOutside | CloseOnReleaseOutside)) !== 0;
  const outsideParent = (policy & (CloseOnPressOutsideParent | CloseOnReleaseOutsideParent)) !== 0;
  if (!(outside && pop.outside) && !(outsideParent && pop.outsideParent)) return;
  if (contains(self.$item, point)) return;
  const parent = self.parent;
  if (outsideParent && parent && contains(parent, point)) return;
  self.$dismiss();
}

function overlayAt(event) {
  const scene = event.target?.closest?.(".qq-window,.q-scene");
  if (!scene) return null;
  for (const overlay of overlays) if (overlay.$top.$node.parentElement === scene) return overlay;
  return null;
}

function pointOf(overlay, event) {
  const { left, top, zoom } = frameOf(overlay.$top.$node.parentElement);
  return { x: (event.clientX - left) / zoom, y: (event.clientY - top) / zoom };
}

const tell = (overlay, name) => {
  overlay[name]();
  for (const attached of [...overlay.$heard]) attached[name]();
};

// A press, before anything in the window has it: every popup over what was
// pressed is asked, from the top, down to one that is modal. That one keeps
// the press from everything else.
function pressed(event) {
  if (!event.isPrimary) return;
  const overlay = overlayAt(event);
  if (!overlay) return;
  untrack(() => {
    overlay.$barrier = null;
    if (!overlay.visible) return;
    if (buttonOf(event) !== RightButton) tell(overlay, "pressed");
    const point = pointOf(overlay, event);
    const popups = stacked(overlay);
    const within = popups.find((popup) => popup.$item.$node.contains(event.target));
    for (const popup of popups) {
      if (popup === within) break;
      const pop = popup.$pop;
      const parent = popup.parent;
      pop.outside = !contains(popup.$item, point);
      pop.outsideParent = pop.outside && parent ? !contains(parent, point) : false;
      tryClose(popup, point, CloseOnPressOutside | CloseOnPressOutsideParent);
      if (popup.$bars(point)) {
        overlay.$barrier = popup;
        break;
      }
    }
  });
}

function released(event) {
  if (!event.isPrimary) return;
  const overlay = overlayAt(event);
  if (!overlay) return;
  untrack(() => {
    const barrier = overlay.$barrier;
    if (overlay.visible && buttonOf(event) !== RightButton) tell(overlay, "released");
    const point = pointOf(overlay, event);
    for (const popup of barrier ? [barrier] : stacked(overlay)) {
      const pop = popup.$pop;
      if (pop.outside || pop.outsideParent) tryClose(popup, point, CloseOnReleaseOutside | CloseOnReleaseOutsideParent);
      pop.outside = pop.outsideParent = false;
      if (popup.$bars(point)) break;
    }
  });
}

// The same press, as it is about to be offered to what is under it: the
// popup that keeps it from everything else follows it, and one on nothing of
// the overlay's is what a drawer is dragged in by.
function begun(point, hits) {
  if (!point.primary) return;
  untrack(() => {
    for (const overlay of overlays) {
      if (overlay.$top.$node.parentElement === point.scene && overlay.$barrier) return void overlay.$barrier.$barred(point);
    }
    const mine = [];
    for (const popup of edged) {
      const parent = popup.parent;
      if (!parent || !housed(parent)) continue;
      const top = topOf(parent);
      if (top.$node.parentElement !== point.scene) continue;
      const overlay = top.$overlay;
      if (overlay && hits.some((item) => inTree(overlay, item))) return;
      mine.push(popup);
    }
    const z = new Map(mine.map((popup) => [popup, popup.z]));
    for (const popup of mine.sort((a, b) => z.get(b) - z.get(a))) popup.$begin(point);
  });
}

const TOLD = ["x", "y", "visible", "opened"];

let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  document.addEventListener("pointerdown", pressed, true);
  document.addEventListener("pointerup", released, true);
}

overhear(begun);

export const Popup = defineType("Popup", QtObject, {
  properties: {
    ...forwarded(ITEM),
    // Where the popup is in its parent: where it was asked to be, until it
    // is shown somewhere else to fit the window.
    x: 0,
    y: 0,
    margins: -1,
    topMargin: derived((self) => self.margins),
    leftMargin: derived((self) => self.margins),
    rightMargin: derived((self) => self.margins),
    bottomMargin: derived((self) => self.margins),
    parent: derived((self) => self.$parent),
    modal: false,
    dim: derived((self) => self.modal),
    closePolicy: CloseOnEscape | CloseOnPressOutside,
    visible: false,
    opened: false,
    focus: false,
    enter: null,
    exit: null,
    popupType: 0,
    anchors: group({ centerIn: undefined }),
  },
  resolve: {
    x: (self) => self.$pop.x,
    y: (self) => self.$pop.y,
    // The item a popup is shown over: a window's is what its items are in.
    parent: (self, own) => {
      const given = own();
      return given?.$node ? given : (given?.$contentItem ?? null);
    },
    // A popup whose item is gone is not seen, though it has yet to say so.
    visible: (self) => self.$pop.visible && self.$pop.shown,
    opened: (self) => self.$pop.visible && self.$pop.phase === IDLE,
  },
  signals: ["closed", "aboutToShow", "aboutToHide"],
  enums: {
    NoAutoClose: 0,
    CloseOnPressOutside,
    CloseOnPressOutsideParent,
    CloseOnReleaseOutside,
    CloseOnReleaseOutsideParent,
    CloseOnEscape,
    TopLeft: 0,
    Top: 1,
    TopRight: 2,
    Left: 3,
    Center: 4,
    Right: 5,
    BottomLeft: 6,
    Bottom: 7,
    BottomRight: 8,
    Item: 0,
    Window: 1,
    Native: 2,
  },
  methods: {
    // What the positioner may do to fit the popup in the window; a tool tip
    // and a menu say otherwise.
    $flipX: false,
    $flipY: false,
    $moveX: true,
    $moveY: true,
    $resizeX: true,
    $resizeY: true,
    $relax: true,
    $Item: PopupItem,
    // Whether what is behind it comes and goes with it of itself.
    $fades: true,
    // Where the popup is on an axis the positioner may not move it along:
    // where its item is.
    $kept(across) {
      return across ? this.$item.x : this.$item.y;
    },
    // The box of what is behind it: as big as the overlay, wherever it was
    // put.
    $behind(overlay) {
      return [undefined, undefined, overlay.width, overlay.height];
    },
    // What `enter` and `exit` are to change of the popup itself.
    $actions() {
      return NONE;
    },
    // Whether a press outside it stops at it.
    $bars() {
      return this.modal;
    },
    // A press it kept from everything else, and one on nothing of the
    // overlay's.
    $barred() {},
    $begin() {},
    $prepare() {
      return untrack(() => prepare(this));
    },
    $again() {
      untrack(() => show(this, true));
    },
    get palette() {
      return this.$item.palette;
    },
    open() {
      this.$show(true);
    },
    close() {
      this.$show(false);
    },
    forceActiveFocus(reason = OtherFocusReason) {
      forceActiveFocus(this.$item, reason);
    },
    $show(shown) {
      untrack(() => (shown ? show(this) : hide(this)));
    },
    // What a type of popup does when its item comes and goes, once it is
    // open, and as it begins to go: a tool tip has a clock to start and
    // stop, a menu its sub-menus to close.
    $appeared() {},
    $came() {},
    $leaving() {},
    // What closes the popup of itself: a dialog is rejected.
    $dismiss() {
      this.close();
    },
    // A key that reached the popup's item; whether the popup used it.
    $key(event) {
      const item = this.$item;
      if ((event.key === Key.Key_Escape || event.key === Key.Key_Back) && this.closePolicy & CloseOnEscape) {
        if (this.interactive !== false) this.$dismiss();
        return true;
      }
      const back = event.key === Key.Key_Backtab || (event.key === Key.Key_Tab && (event.modifiers & ShiftModifier) !== 0);
      if (!back && event.key !== Key.Key_Tab) return false;
      tab(focusWindow(item), item, !back);
      return true;
    },
  },
  setup(self, props) {
    const pop = (self.$pop = {
      phase: IDLE,
      visible: false,
      shown: false,
      waits: false,
      serial: ++serial,
      x: 0,
      y: 0,
      overlay: null,
      dimmer: null,
      dimmerIn: null,
      dispose: null,
      dimKind: 0,
      dimmed: 1,
      job: null,
      transition: null,
      lastFocus: null,
      hadFocus: false,
      outside: false,
      outsideParent: false,
      scale: 1,
      opacity: 1,
    });
    [self.$placing, self.$setPlacing] = graphed(false, self.$owner);
    [self.$dimmer, self.$setDimmer] = graphed(null, self.$owner);
    // `opened` is the property; the signal of that name is kept apart.
    self.$opened = signal(() => untrack(() => props.onOpened));
    making = self;
    try {
      self.$item = inside(null, () => self.$Item(given(self, props)));
    } finally {
      making = null;
    }
    slot(self.$item, "visible").write(false);
    // What a popup tells of as it opens is told in Qt's order: each of these
    // is heard of when it changes, and not when another does.
    whenComplete(() => {
      for (const name of TOLD) slot(self, name).changed();
    });
    effect(
      () => position(self),
      (where) => placed(self, where),
    );
    effect(
      () => {
        const dimmer = self.$dimmer();
        return dimmer ? [dimmer, ...self.$behind(pop.dimmerIn)] : null;
      },
      (box) => {
        if (!box) return;
        const [dimmer, x, y, width, height] = box;
        if (x !== undefined) {
          slot(dimmer, "x").write(x);
          slot(dimmer, "y").write(y);
        }
        slot(dimmer, "width").write(width);
        slot(dimmer, "height").write(height);
      },
    );
    effect(
      () => kindOf(self),
      (kind) => {
        if (pop.visible && kind !== pop.dimKind) last(() => dimAgain(self));
      },
    );
    // `visible: true` opens it once everything is there to open it in, and
    // a binding opens and closes it.
    if ("visible" in props) {
      let was = false;
      effect(
        () => Boolean(slot(self, "visible").asked()),
        (wanted) => {
          if (wanted === was) return;
          was = wanted;
          last(() => self.$show(wanted));
        },
      );
    }
    onCleanup(() => {
      waiting.delete(self);
      if (!pop.overlay) return;
      stop(pop);
      untrack(() => leave(self, false));
      pop.overlay = null;
    });
  },
  adopt(self, props) {
    Page.adopt(self.$item, props);
  },
});

forward(Popup, ITEM);

// `font` is a group: each part of it is the item's, and so is the whole.
for (const key in Page.slots) {
  if (key === "font" || key.startsWith("font$")) Popup.slots[key] = (self) => slot(self.$item, key);
}
Object.defineProperty(Popup.proto, "font", {
  get() {
    return this.$item.font;
  },
  set(value) {
    this.$item.font = value;
  },
  enumerable: true,
  configurable: true,
});

// Assigning `visible` opens the popup or closes it.
Object.defineProperty(Popup.proto, "visible", {
  ...Object.getOwnPropertyDescriptor(Popup.proto, "visible"),
  set(value) {
    this.$show(Boolean(value));
  },
});

// A popup is a dialog unless its type says what else; what it shows is
// what the popup is.
speaks(Popup, "Dialog");
speaks(PopupItem, (self) => roleOf(self.$popup));

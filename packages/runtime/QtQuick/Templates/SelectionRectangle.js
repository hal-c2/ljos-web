// SelectionRectangle: selects the cells of a TableView that a drag, or a
// press that is held, goes over, and puts a handle at the two corners of
// what is selected, to drag it wider with.
//
// It is Qt's (qquickselectionrectangle.cpp): it shows nothing itself, it
// puts a TapHandler and a DragHandler in the view's content, and the view
// is asked which cells a place is at. The handles are the style's.
import { onCleanup } from "solid-js";
import { defineType, effect, instantiate, memo, QtObject, settle, slot } from "../../object.js";
import { clock } from "../animation/clock.js";
import { Flickable } from "../Flickable.js";
import { DragHandler, HoverHandler, PointerDevice, TapHandler } from "../handlers.js";
import { ControlModifier, ShiftModifier } from "../keycodes.js";
import {
  hasSelection,
  normalizeSelection,
  onSelection,
  scrollTowardsPoint,
  selectionRectangle,
  setSelectionEndPos,
  setSelectionStartPos,
  startSelection,
} from "../TableView.js";
import { Control } from "./Control.js";
import { ScrollView } from "./ScrollView.js";
import { untrack } from "#kernel";

const NOTHING = Object.freeze(Object.create(null));

const Drag = 0;
const PressAndHold = 1;
const Auto = 2;

const CanTakeOverFromAnything = 0x0f;
const DragWithinBounds = 3;
const SizeFDiagCursor = 8;
const CURRENT = Object.freeze({ x: -1, y: -1 });

// The control a handle is being made for: what is attached to it is told.
let making = null;

const SelectionRectangleAttached = defineType("SelectionRectangleAttached", QtObject, {
  properties: { control: null, dragging: false },
  setup(self) {
    if (making) slot(self, "control").write(making);
  },
});

// How it selects, and with which devices a drag does: a drag where the
// view would not flick with it, a press that is held where it would.
function effective(self) {
  const target = self.target;
  const enabled = self.enabled;
  const asked = self.selectionMode;
  if (asked === Drag) return { mode: Drag, drags: enabled, devices: PointerDevice.AllDevices };
  if (asked === PressAndHold) return { mode: PressAndHold, drags: false, devices: PointerDevice.AllDevices };
  const parent = target?.parent;
  if (parent && ScrollView.proto.isPrototypeOf(parent)) return { mode: Drag, drags: enabled, devices: PointerDevice.Mouse };
  if (target && Flickable.proto.isPrototypeOf(target)) {
    if (enabled && !target.interactive) return { mode: Drag, drags: true, devices: PointerDevice.AllDevices };
    return { mode: PressAndHold, drags: false, devices: PointerDevice.AllDevices };
  }
  return { mode: Drag, drags: enabled, devices: PointerDevice.Mouse };
}

function setActive(self, active) {
  const mine = self.$selection;
  if (mine.active === active) return;
  mine.active = active;
  // The handles go where the columns and the rows go.
  const laidOut = mine.target?.layoutChanged;
  if (active) laidOut?.connect(mine.place);
  else laidOut?.disconnect(mine.place);
  slot(self, "active").write(active);
  settle();
}

function setDragging(self, dragging) {
  const mine = self.$selection;
  if (mine.dragging !== dragging) {
    mine.dragging = dragging;
    slot(self, "dragging").write(dragging);
  }
  if (mine.dragged) slot(SelectionRectangle.attached(mine.dragged), "dragging").write(dragging);
  settle();
}

// The content goes after a drag that has left the view, the faster the
// further out it is: a step for every millisecond, as Qt's timer makes.
function scrolling(self) {
  const mine = self.$selection;
  const tick = () => {
    const target = mine.target;
    if (mine.dragged && mine.dragged === mine.topLeft) setSelectionStartPos(target, mine.towards);
    else setSelectionEndPos(target, mine.towards);
    place(self);
    const far = scrollTowardsPoint(target, mine.towards, mine.speed);
    mine.towards = {
      x: mine.towards.x + (far.width > 0 ? mine.speed.width : -mine.speed.width),
      y: mine.towards.y + (far.height > 0 ? mine.speed.height : -mine.speed.height),
    };
    mine.speed = { width: Math.abs(far.width * 0.007), height: Math.abs(far.height * 0.007) };
  };
  return {
    advance(delta) {
      for (let left = Math.max(1, Math.round(delta)); left > 0 && mine.target; left--) untrack(tick);
    },
    idle: () => 0,
  };
}

function scrollTowards(self, at) {
  const mine = self.$selection;
  mine.towards = at;
  if (mine.scrolls) return;
  const far = scrollTowardsPoint(mine.target, at, mine.speed);
  if (!far.width && !far.height) return;
  mine.scrolls = true;
  clock.add(mine.job);
}

function stopScrolling(self) {
  const mine = self.$selection;
  if (!mine.scrolls) return;
  mine.scrolls = false;
  clock.remove(mine.job);
}

// A handle: the style's item in the view's content, over the cells, with
// handlers of its own that take the press from whatever is under it.
function handle(self, component, topLeft) {
  const mine = self.$selection;
  const content = mine.target.$contentItem;
  making = self;
  let made;
  try {
    made = instantiate(component, NOTHING, content, self.$owner);
  } finally {
    making = null;
  }
  const item = made.object;
  if (!item?.$node) {
    made.dispose();
    return null;
  }
  content.$add(item);
  mine.made.push(() => {
    content.$remove(item);
    made.dispose();
  });
  slot(SelectionRectangle.attached(item), "control").write(self);
  if (untrack(() => item.z) === 0) item.z = 100;
  const drag = instantiate(() => DragHandler({ target: null, grabPermissions: CanTakeOverFromAnything }), NOTHING, item).object;
  instantiate(() => HoverHandler({ target: null, cursorShape: SizeFDiagCursor, blocking: true }), NOTHING, item);
  // Taps do not go through a handle to the view.
  instantiate(() => TapHandler({ target: null, gesturePolicy: DragWithinBounds }), NOTHING, item);
  const moved = () => {
    const at = drag.centroid.position;
    const position = { x: item.x + at.x, y: item.y + at.y };
    if (topLeft) setSelectionStartPos(mine.target, position);
    else setSelectionEndPos(mine.target, position);
    return position;
  };
  drag.activeChanged.connect(() =>
    untrack(() => {
      if (!mine.target) return;
      if (drag.active) {
        moved();
        mine.dragged = item;
        place(self);
        setDragging(self, true);
      } else {
        stopScrolling(self);
        normalizeSelection(mine.target);
        setDragging(self, false);
      }
    }),
  );
  drag.centroidChanged.connect(() =>
    untrack(() => {
      if (!mine.dragging || !mine.target || mine.dragged !== item) return;
      const position = moved();
      place(self);
      scrollTowards(self, position);
    }),
  );
  return item;
}

// The handles are at the corners of what is selected, their middles on
// them. They are made when there first is something to be at.
function place(self) {
  const mine = self.$selection;
  if (!mine.target) return;
  untrack(() => {
    const rect = selectionRectangle(mine.target);
    if (!mine.topLeft && self.topLeftHandle) mine.topLeft = handle(self, self.topLeftHandle, true);
    if (!mine.bottomRight && self.bottomRightHandle) mine.bottomRight = handle(self, self.bottomRightHandle, false);
    const first = mine.topLeft;
    const second = mine.bottomRight;
    if (first) {
      first.x = rect.x - first.width / 2;
      first.y = rect.y - first.height / 2;
    }
    if (second) {
      second.x = rect.x + rect.width - second.width / 2;
      second.y = rect.y + rect.height - second.height / 2;
    }
  });
}

function handleUnder(self, at) {
  const mine = self.$selection;
  for (const item of [mine.topLeft, mine.bottomRight]) {
    if (item && item.contains({ x: at.x - item.x, y: at.y - item.y })) return item;
  }
  return null;
}

// A selection of no size has no corners to put handles at.
const sized = (rect) => rect.width !== 0 || rect.height !== 0;

// From the current cell to the pressed one, or what is selected goes on to
// there.
function extend(self, at, modifiers) {
  const target = self.$selection.target;
  if (!self.$selection.active) {
    if (!startSelection(target, at, modifiers)) return;
    setSelectionStartPos(target, CURRENT);
  }
  setSelectionEndPos(target, at);
  shown(self);
}

// The pressed cell alone. The view says whether what was selected stays.
function single(self, at, modifiers) {
  const target = self.$selection.target;
  if (handleUnder(self, at)) return;
  if (!startSelection(target, at, modifiers)) return;
  setSelectionStartPos(target, at);
  setSelectionEndPos(target, at);
  shown(self);
}

function shown(self) {
  if (!sized(selectionRectangle(self.$selection.target))) return false;
  place(self);
  setActive(self, true);
  return true;
}

// The handlers in the content of the view, which make the selection.
function follow(self, target) {
  const mine = self.$selection;
  const content = target.$contentItem;
  const owner = self.$owner;
  const made = [];
  const tap = instantiate(
    () =>
      TapHandler({
        get enabled() {
          return self.enabled;
        },
      }),
    NOTHING,
    content,
    owner,
  );
  const drag = instantiate(
    () =>
      DragHandler({
        target: null,
        get enabled() {
          return mine.how().drags;
        },
        get acceptedDevices() {
          return mine.how().devices;
        },
      }),
    NOTHING,
    content,
    owner,
  );
  made.push(tap.dispose, drag.dispose);
  const taps = tap.object;
  const drags = drag.object;
  const plain = (modifiers) => !(modifiers & ~(ControlModifier | ShiftModifier));
  taps.pressedChanged.connect(() =>
    untrack(() => {
      if (!taps.pressed) {
        // Let go with nothing selected, there is no selection to show.
        if (mine.active && !hasSelection(target)) setActive(self, false);
        return;
      }
      if (mine.how().mode !== Drag) return;
      const at = taps.point.pressPosition;
      const modifiers = taps.point.modifiers;
      if (!plain(modifiers)) return;
      if (modifiers & ShiftModifier) extend(self, at, modifiers);
      else if (modifiers & ControlModifier) single(self, at, modifiers);
    }),
  );
  taps.longPressed.connect(() =>
    untrack(() => {
      // A finger can drag a selection out in a view that does not flick.
      if (taps.$mine.point?.type === "touch" && self.selectionMode === Auto) {
        if (!target.interactive) return;
      } else if (mine.how().mode !== PressAndHold) return;
      const at = taps.point.pressPosition;
      const modifiers = taps.point.modifiers;
      // Not from on top of a handle.
      if (handleUnder(self, at)) return;
      if (modifiers === ShiftModifier) extend(self, at, modifiers);
      else single(self, at, modifiers);
    }),
  );
  drags.activeChanged.connect(() =>
    untrack(() => {
      const modifiers = drags.centroid.modifiers;
      if (!plain(modifiers)) return;
      if (!drags.active) {
        stopScrolling(self);
        normalizeSelection(target);
        return setDragging(self, false);
      }
      // A selection that is shown goes on while a modifier is held; else
      // another begins where the press was.
      if (!mine.active || !(modifiers & (ControlModifier | ShiftModifier))) {
        const from = drags.centroid.pressPosition;
        if (!startSelection(target, from, modifiers)) return;
        setSelectionStartPos(target, from);
      }
      setSelectionEndPos(target, drags.centroid.position);
      mine.dragged = null;
      if (shown(self)) setDragging(self, true);
    }),
  );
  drags.centroidChanged.connect(() =>
    untrack(() => {
      if (!mine.dragging || mine.dragged) return;
      const at = drags.centroid.position;
      setSelectionEndPos(target, at);
      place(self);
      scrollTowards(self, at);
    }),
  );
  onSelection(target, (still) => {
    if (still) place(self);
    else setActive(self, false);
  });
  return () => {
    for (const dispose of made) dispose();
    onSelection(target, null);
  };
}

export const SelectionRectangle = defineType("SelectionRectangle", Control, {
  properties: {
    selectionMode: Auto,
    target: null,
    topLeftHandle: null,
    bottomRightHandle: null,
    active: false,
    dragging: false,
  },
  enums: { Drag, PressAndHold, Auto },
  attached: SelectionRectangleAttached,
  setup(self) {
    const mine = (self.$selection = {
      target: null,
      unfollow: null,
      how: memo(() => effective(self), {}),
      active: false,
      dragging: false,
      // The handles, what made them, and the one a drag is on.
      topLeft: null,
      bottomRight: null,
      made: [],
      dragged: null,
      // Where the content is going, and how fast.
      scrolls: false,
      towards: null,
      speed: { width: 1, height: 1 },
      job: null,
      place: () => place(self),
    });
    mine.job = scrolling(self);
    const leave = () => {
      stopScrolling(self);
      if (mine.active) mine.target?.layoutChanged.disconnect(mine.place);
      mine.unfollow?.();
      mine.unfollow = null;
      for (const dispose of mine.made.splice(0)) dispose();
      mine.topLeft = mine.bottomRight = mine.dragged = null;
    };
    onCleanup(leave);
    effect(
      () => self.target,
      (target) => {
        if (target === mine.target) return;
        leave();
        // The view that is selected in, if it is one that can be.
        mine.target = target?.$table ? target : null;
        if (target && !mine.target) console.warn("QML SelectionRectangle: the assigned target is not supported by the control");
        if (!mine.target) return;
        mine.unfollow = untrack(() => follow(self, mine.target));
        // It stays active, as Qt's does, until the new view says otherwise.
        if (mine.active) mine.target.layoutChanged.connect(mine.place);
      },
    );
    // Disabled, it shows no selection and drags none.
    effect(
      () => self.enabled,
      (enabled) => {
        if (enabled) return;
        stopScrolling(self);
        setDragging(self, false);
        setActive(self, false);
      },
    );
  },
});

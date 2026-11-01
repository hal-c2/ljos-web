// Drag and DropArea: an item that is being dragged, and the places it can
// be dropped.
//
// This is the drag a program does for itself (`Drag.Internal`): an item
// says it is being dragged (`Drag.active`), and the DropArea under its hot
// spot is told as it comes, moves, leaves and is dropped. What is dragged
// into the page from outside it, and out of it, is the browser's and is not
// done here.
import { defineType, effect, group, QtObject, settle, slot } from "../object.js";
import { later } from "./animation/clock.js";
import { itemToScene, sceneToGlobal, sceneToItem, topOf } from "./geometry.js";
import { Item } from "./Item.js";
import { signal, untrack } from "#kernel";

const IgnoreAction = 0;
const MoveAction = 2;

// The DropArea of an element.
const areas = new WeakMap();

const within = (item, ancestor) => {
  for (let at = item; at?.$node; at = at.parent) if (at === ancestor) return true;
  return false;
};

// A key of an area is a pattern, as a file name is: `*` and `?` stand for
// anything.
const pattern = (key) => new RegExp(`^${String(key).replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*").replaceAll("?", ".")}$`);

// An area with no keys takes anything; one with keys, what has one of them.
function matches(area, keys) {
  const wanted = area.keys;
  if (!wanted?.length) return true;
  return [...wanted].some((key) => {
    const like = pattern(key);
    return keys.some((own) => like.test(own));
  });
}

const list = (value) => (value == null ? [] : Array.isArray(value) ? value : typeof value === "string" ? [value] : [...value]);

// What a drag has to say for itself: the keys it was given and the formats
// of its data.
const keysOf = (drag) => [...list(drag.keys), ...Object.keys(drag.mimeData ?? {})];

// What a handler is told of a drag: where it is in the area, what it is,
// and whether the area will have it.
function event(drag, area, point, dropping) {
  const { x, y } = sceneToItem(area, point.x, point.y);
  const data = drag.mimeData ?? {};
  const text = (format) => (data[format] == null ? "" : String(data[format]));
  return {
    x,
    y,
    keys: keysOf(drag),
    source: drag.source,
    // Coming and moving it is taken unless a handler says not; dropped, it
    // is taken when a handler says so.
    accepted: !dropping,
    action: drag.proposedAction,
    proposedAction: drag.proposedAction,
    supportedActions: drag.supportedActions,
    formats: Object.keys(data),
    hasText: "text/plain" in data,
    hasHtml: "text/html" in data,
    hasUrls: "text/uri-list" in data,
    hasColor: "application/x-color" in data,
    text: text("text/plain"),
    html: text("text/html"),
    urls: text("text/uri-list").split(/\r?\n/).filter(Boolean),
    colorData: data["application/x-color"],
    getDataAsString: text,
    getDataAsArrayBuffer: (format) => new TextEncoder().encode(text(format)).buffer,
    accept(action) {
      if (action !== undefined) this.action = action;
      this.accepted = true;
    },
    acceptProposedAction() {
      this.accept(this.proposedAction);
    },
  };
}

// The areas under a point of the scene the dragged item is in, the one in
// front first: those that could take the drag at all.
function under(drag, item, point) {
  const top = topOf(item);
  const { x, y } = sceneToGlobal(item, point.x, point.y);
  const keys = keysOf(drag);
  const found = [];
  for (const element of document.elementsFromPoint(x, y)) {
    const area = areas.get(element);
    // An area inside what is dragged is carried along, not dropped on.
    if (!area || !area.enabled || within(area, item) || topOf(area) !== top) continue;
    if (matches(area, keys)) found.push(area);
  }
  return found;
}

function enter(area, drag, point) {
  const told = event(drag, area, point, false);
  area.entered(told);
  if (!told.accepted) return false;
  slot(area, "drag$x").write(told.x);
  slot(area, "drag$y").write(told.y);
  slot(area, "drag$source").write(drag.source);
  slot(area, "containsDrag").write(true);
  settle();
  return true;
}

function leave(area) {
  area.exited();
  slot(area, "containsDrag").write(false);
  slot(area, "drag$source").write(null);
  settle();
}

function retarget(self, mine, target) {
  if (mine.target === target) return;
  mine.target = target;
  slot(self, "target").write(target);
  settle();
}

// The hot spot is somewhere, perhaps somewhere new: the area in front that
// will have the drag is its target, and is told so before the one that was
// is told it has gone... which Qt tells first.
function deliver(self, mine) {
  const item = mine.item;
  const point = spot(self, mine);
  mine.at = point;
  const hits = under(self, item, point);
  let target = mine.target;
  let taken = false;
  for (const area of hits) {
    if (area === target && mine.inside) {
      const told = event(self, area, point, false);
      slot(area, "drag$x").write(told.x);
      slot(area, "drag$y").write(told.y);
      settle();
      area.positionChanged(told);
      taken = true;
      break;
    }
    // One it asked already goes on not having it.
    if (mine.refused.has(area)) continue;
    // A new one in front of the target: the target is left first.
    if (mine.inside) {
      mine.inside = false;
      leave(target);
    }
    if (enter(area, self, point)) {
      target = area;
      mine.inside = taken = true;
      break;
    }
    mine.refused.add(area);
  }
  if (!taken) {
    if (mine.inside) {
      mine.inside = false;
      leave(target);
    }
    target = null;
  }
  for (const area of mine.refused) if (!hits.includes(area)) mine.refused.delete(area);
  retarget(self, mine, target);
}

// What a drag knows of itself: whether it is on, the area that has it, and
// those that would not.
function state(self) {
  if (self.$drag) return self.$drag;
  const [on, setOn] = signal(false, self.$owner);
  const item = self.$props.$attachee;
  return (self.$drag = { item, on, setOn, wanted: false, target: null, inside: false, refused: new Set(), at: null });
}

const spot = (self, mine) => itemToScene(mine.item, self.hotSpot.x, self.hotSpot.y);
const moved = (self, mine) => {
  const point = untrack(() => spot(self, mine));
  return point.x !== mine.at?.x || point.y !== mine.at?.y;
};

// It is on or off as it was asked to be.
function want(self, wanted) {
  const mine = state(self);
  if (!mine.item?.$node || wanted === untrack(mine.on)) return;
  if (wanted) start(self);
  else cancel(self);
}

function start(self, actions) {
  const mine = state(self);
  if (!mine.item?.$node) return;
  if (mine.on()) cancel(self);
  if (actions !== undefined) slot(self, "supportedActions").write(actions);
  mine.refused.clear();
  mine.inside = false;
  deliver(self, mine);
  mine.setOn(true);
  settle();
}

function cancel(self) {
  const mine = state(self);
  if (!mine.on()) return;
  if (mine.inside) {
    mine.inside = false;
    leave(mine.target);
  }
  retarget(self, mine, null);
  mine.setOn(false);
  settle();
}

function drop(self) {
  const mine = state(self);
  if (!mine.on()) return IgnoreAction;
  // It is dropped where it is, not where it last said it was.
  if (moved(self, mine)) deliver(self, mine);
  const point = mine.at;
  let action = IgnoreAction;
  let target = null;
  if (mine.inside) {
    const area = mine.target;
    const told = event(self, area, point, true);
    mine.inside = false;
    area.dropped(told);
    slot(area, "containsDrag").write(false);
    slot(area, "drag$source").write(null);
    settle();
    if (told.accepted) {
      action = told.action;
      target = area;
    }
  }
  retarget(self, mine, target);
  mine.setOn(false);
  settle();
  return action;
}

const DragAttached = defineType("DragAttached", QtObject, {
  properties: {
    active: false,
    dragType: 2,
    hotSpot: group({ x: 0, y: 0 }),
    keys: undefined,
    mimeData: undefined,
    source: null,
    target: null,
    supportedActions: 7,
    proposedAction: MoveAction,
    imageSource: "",
    imageSourceSize: undefined,
  },
  // For a drag the system does, which this is not.
  signals: ["dragStarted", "dragFinished"],
  resolve: {
    active: (self) => state(self).on(),
    // What is dragged is the item, unless it says something else is.
    source: (self, own) => own() ?? self.$props.$attachee,
    keys: (self, own) => own() ?? [],
  },
  methods: {
    start(actions) {
      untrack(() => start(this, actions));
    },
    startDrag() {},
    cancel() {
      untrack(() => cancel(this));
    },
    drop() {
      return untrack(() => drop(this));
    },
  },
  setup(self) {
    const mine = state(self);
    const { item, on } = mine;
    if (!item?.$node) return;
    // `Drag.active: area.pressed`: it starts and ends as the binding says,
    // once whatever changed it is over with.
    effect(
      () => Boolean(slot(self, "active").asked()),
      (wanted) => {
        if (wanted === mine.wanted) return;
        mine.wanted = wanted;
        later(() => untrack(() => want(self, wanted)));
      },
    );
    // Where it is: an area is told a turn after it moved, as in Qt.
    effect(
      () => (on() ? spot(self, mine) : null),
      (point) => {
        if (!point) return;
        later(() =>
          untrack(() => {
            if (on() && moved(self, mine)) deliver(self, mine);
          }),
        );
      },
    );
    // With other keys it is another drag: it leaves and comes again.
    let keyed = null;
    effect(
      () => (on() ? keysOf(self).join("\n") : null),
      (keys) => {
        const was = keyed;
        keyed = keys;
        if (keys === null || was === null || was === keys) return;
        later(() =>
          untrack(() => {
            if (!on()) return;
            if (mine.inside) {
              mine.inside = false;
              leave(mine.target);
            }
            mine.refused.clear();
            deliver(self, mine);
          }),
        );
      },
    );
  },
});

// Assigned to, it starts or ends there and then.
Object.defineProperty(DragAttached.proto, "active", {
  ...Object.getOwnPropertyDescriptor(DragAttached.proto, "active"),
  set(value) {
    const wanted = Boolean(value);
    slot(this, "active").write(wanted);
    state(this).wanted = wanted;
    untrack(() => want(this, wanted));
    settle();
  },
});

export const Drag = defineType("Drag", QtObject, {
  enums: { None: 0, Automatic: 1, Internal: 2, XAxis: 1, YAxis: 2, XAndYAxis: 3 },
  attached: DragAttached,
});

export const DropArea = defineType("DropArea", Item, {
  properties: {
    containsDrag: false,
    keys: undefined,
    drag: group({ x: 0, y: 0, source: null }),
  },
  signals: ["entered", "exited", "positionChanged", "dropped"],
  resolve: { keys: (self, own) => own() ?? [] },
  setup(self) {
    areas.set(self.$node, self);
  },
});

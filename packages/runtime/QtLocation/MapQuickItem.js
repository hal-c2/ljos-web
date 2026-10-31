// MapQuickItem: an item at a place of a map.
//
// It is where its `coordinate` is on the map, less `anchorPoint`, and as
// large as its `sourceItem`, which it keeps in an item of its own: that one
// fades the item in as the map zooms in and, for an item of a zoom level
// (`zoomLevel`), is enlarged and turned with the map.
import { defineType, effect, group, inside, settle, slot } from "../object.js";
import { INVALID } from "../QtPositioning/coordinate.js";
import { Item } from "../QtQuick/Item.js";
import { across, down, Map } from "./Map.js";
import { untrack } from "#kernel";

const NONE = Object.freeze({ ready: false });

// The map an item is on: it is in the map, or in a view of one.
function mapOf(self) {
  const parent = self.parent;
  if (!parent) return null;
  return Map.proto.isPrototypeOf(parent) ? parent : parent.$mapGroup ? mapOf(parent) : null;
}

// The camera of that map, for an item that has a place to be at.
function camera(self) {
  return self.coordinate.isValid ? (mapOf(self)?.$view() ?? NONE) : NONE;
}

// How many times its size an item of a zoom level is.
const enlarged = (self, view) => 2 ** (view.zoom - self.zoomLevel);

// Where it is, is where it was put last: with no place to be at, or nothing
// to show, it stays. One of a zoom level is at the map's corner.
function put(self, key, where, anchor) {
  if (self.zoomLevel !== 0) return (self[key] = 0);
  const view = self.sourceItem ? camera(self) : NONE;
  return view.ready ? (self[key] = where(view, self.coordinate) - anchor) : self[key];
}

const resolve = {
  x: (self) => put(self, "$left", across, self.anchorPoint.x),
  y: (self) => put(self, "$top", down, self.anchorPoint.y),
  width: (self) => self.sourceItem?.width ?? 0,
  height: (self) => self.sourceItem?.height ?? 0,
};

export const MapQuickItem = defineType("MapQuickItem", Item, {
  properties: {
    coordinate: INVALID,
    anchorPoint: group({ x: 0, y: 0 }),
    zoomLevel: 0,
    sourceItem: null,
    autoFadeIn: true,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  },
  resolve,
  methods: { $mapItem: true },
  setup(self) {
    self.$left = 0;
    self.$top = 0;
    // The camera, for an item of a zoom level: it is at the top left of
    // the map, and what holds its source item is put, enlarged and turned.
    const scaled = () => (self.zoomLevel === 0 ? NONE : camera(self));
    const holder = inside(self, () =>
      untrack(() =>
        Item({
          transformOrigin: Item.TopLeft,
          get visible() {
            return camera(self).ready;
          },
          // Qt's: an item is not on a map of the whole Earth, and is all
          // there a zoom level and a half in.
          get opacity() {
            if (!self.autoFadeIn) return 1;
            const zoom = mapOf(self)?.zoomLevel ?? 0;
            return zoom > 2.5 ? 1 : zoom > 1.5 ? zoom - 1.5 : 0;
          },
          get x() {
            const view = scaled();
            if (!view.ready) return 0;
            const anchor = self.anchorPoint;
            return across(view, self.coordinate) - (anchor.x * view.cos + anchor.y * view.sin) * enlarged(self, view);
          },
          get y() {
            const view = scaled();
            if (!view.ready) return 0;
            const anchor = self.anchorPoint;
            return down(view, self.coordinate) - (anchor.y * view.cos - anchor.x * view.sin) * enlarged(self, view);
          },
          get scale() {
            const view = scaled();
            return view.ready ? enlarged(self, view) : 1;
          },
          get rotation() {
            const view = scaled();
            return view.ready ? 0 - view.bearing : 0;
          },
        }),
      ),
    );
    // What `sourceItem` makes is made in it.
    self.$contentItem = holder;
    self.$node.append(holder.$node);
    let held = null;
    effect(
      () => self.sourceItem,
      (item) => {
        if (item === held) return;
        if (held) holder.$remove(held);
        held = item?.$node ? item : null;
        if (!held) return;
        if (held.$parent !== holder) slot(held, "parent").write(holder);
        // It is enlarged and turned from its corner, as Qt has it.
        slot(held, "transformOrigin").write(Item.TopLeft);
        holder.$add(held);
      },
    );
  },
});

// A point given whole is both its numbers, whatever either was given before.
const anchorPoint = Object.getOwnPropertyDescriptor(MapQuickItem.proto, "anchorPoint");
Object.defineProperty(MapQuickItem.proto, "anchorPoint", {
  ...anchorPoint,
  set(point) {
    if (typeof point === "function") return void anchorPoint.set.call(this, point);
    slot(this, "anchorPoint$x").write(Number(point?.x) || 0);
    slot(this, "anchorPoint$y").write(Number(point?.y) || 0);
    settle();
  },
});

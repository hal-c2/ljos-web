// Map: the Earth in Web Mercator, drawn from a provider's tiles.
//
// The Earth is a square of `256 * 2 ** zoomLevel` pixels a side, of which
// the item shows what is around `center`, turned by `bearing`. What it shows
// are pictures of 256 pixels, those of the whole zoom level below its own,
// as elements of one layer which is moved, enlarged and turned as a whole:
// a tile is an element for as long as it is in view, and the element of one
// that left is the next one's.
import { defineType, derived, effect, slot } from "../object.js";
import { coordinate, fromMercator, INVALID, latitudeAt, mercatorX, mercatorY } from "../QtPositioning/coordinate.js";
import { Point } from "../QtQml/values.js";
import { colorValue, css } from "../QtQuick/color.js";
import { lazy, rules } from "../QtQuick/compute.js";
import { Item } from "../QtQuick/Item.js";
import { elements } from "../QtQuick/richtext.js";
import { NO_MAP, sourceOf } from "./Plugin.js";
import { untrack } from "#kernel";

rules(`
.qq-tiles { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; pointer-events: none; user-select: none; }
.qq-tiles > img { position: absolute; left: 0; top: 0; width: 256px; height: 256px; visibility: hidden; }
.qq-copyright { position: absolute; left: 0; bottom: 0; font: 12px/14px sans-serif; white-space: nowrap; color: #000; background: rgba(255, 255, 255, 0.5); }
.qq-copyright a { color: #00f; text-decoration: underline; cursor: pointer; }
`);

const EMPTY = Object.freeze([]);
const TILE = 256;
// As close as a map goes: past its provider's tiles, which are enlarged.
const CLOSEST = 30;
const LONDON = coordinate(51.5073, -0.1277);
const UNSUPPORTED = "The geoservices provider is not supported.";

const kinds = (self) => self.plugin?.$kinds?.() ?? EMPTY;

// Qt's map is of whole pixels, whatever the item's size.
const wide = (self) => Math.trunc(self.width);
const high = (self) => Math.trunc(self.height);

// A map shows something once it has a provider and a size. Until then its
// zoom level and its centre are what they were given.
const ready = (self) => kinds(self).length > 0 && wide(self) > 0 && high(self) > 0;

// The Earth is never smaller than the item's longer side.
const lowest = (self) => (ready(self) ? Math.max(0, Math.log2(Math.max(wide(self), high(self)) / TILE)) : 0);

// How far the tiles of the kind of map shown go.
const deepest = (self) => self.activeMapType.cameraCapabilities.maximumZoomLevel;

const resolve = {
  zoomLevel(self, own) {
    const zoom = own();
    return ready(self) ? Math.min(Math.max(zoom, lowest(self)), CLOSEST) : zoom;
  },
  center(self, own) {
    const given = own();
    // Nowhere is not gone to: the map stays where it is.
    const place = given?.isValid ? (self.$center = given) : self.$center;
    if (!ready(self)) return place;
    // No further north or south than where the edge of the Earth is the
    // edge of the item.
    const side = TILE * 2 ** self.zoomLevel;
    const limit = latitudeAt(Math.trunc(Math.min(high(self), side)) / 2 / side);
    const latitude = Math.min(Math.max(place.latitude, -limit), limit);
    return latitude === place.latitude ? place : coordinate(latitude, place.longitude, place.altitude);
  },
  // What a program asked for is within what the tiles and the item allow.
  minimumZoomLevel: (self, own) => Math.max(Math.min(deepest(self), own()), lowest(self)),
  maximumZoomLevel: (self, own) => Math.min(Math.max(lowest(self), own()), deepest(self)),
  bearing(self, own) {
    const turn = own() % 360;
    return turn < 0 ? turn + 360 : turn + 0;
  },
  activeMapType(self, own) {
    const all = kinds(self);
    const type = own();
    return all.includes(type) ? type : (all[0] ?? NO_MAP);
  },
  color: colorValue,
};

// What the item shows of the Earth: its size, the side of the square, where
// on the square (0 to 1) the middle of the item is, and how it is turned.
const IDLE = Object.freeze({ ready: false });

function camera(self) {
  if (!ready(self)) return IDLE;
  const zoom = self.zoomLevel;
  const center = self.center;
  const bearing = self.bearing;
  const turn = (bearing * Math.PI) / 180;
  return {
    ready: true,
    width: wide(self),
    height: high(self),
    zoom,
    side: TILE * 2 ** zoom,
    x: mercatorX(center.longitude),
    y: mercatorY(center.latitude),
    bearing,
    cos: Math.cos(turn),
    sin: Math.sin(turn),
  };
}

// How far east and south of the middle a place is, in pixels of the square.
// The square is one of a row without end: the nearest of the place's is
// the one.
function east(view, place) {
  let across = mercatorX(place.longitude) - view.x;
  if (across > 0.5) across -= 1;
  else if (across < -0.5) across += 1;
  return across * view.side;
}

const south = (view, place) => (mercatorY(place.latitude) - view.y) * view.side;

// Where a place is on the item, across and down: for a map's items, which
// ask without a point being made.
export const across = (view, place) => view.width / 2 + east(view, place) * view.cos + south(view, place) * view.sin;
export const down = (view, place) => view.height / 2 - east(view, place) * view.sin + south(view, place) * view.cos;

// The place at a point of the item.
function placeAt(view, x, y) {
  x -= view.width / 2;
  y -= view.height / 2;
  const { cos, sin, side } = view;
  return fromMercator(view.x + (x * cos - y * sin) / side, view.y + (x * sin + y * cos) / side);
}

// What a map shows on it: its own items, and those of the views in it.
function gathered(item, into) {
  for (const child of item.children) {
    if (child.$mapItem) into.push(child);
    else if (child.$mapGroup) gathered(child, into);
  }
  return into;
}

// What the map takes of what it is told to be, as its type has it: a zoom
// level within its bounds stays there when the bounds move. A binding is
// left to say again.
function keep(self, name, value = untrack(() => self[name])) {
  const own = slot(self, name);
  if (own.bound && !own.assigned) return;
  if (!Object.is(own.own(), value)) own.write(value);
}

function release(tiles, image) {
  image.removeAttribute("src");
  image.style.visibility = "";
  tiles.spare.push(image);
}

function clear(tiles) {
  for (const image of tiles.shown) release(tiles, image);
  tiles.shown.length = 0;
}

function tile(layer) {
  const image = document.createElement("img");
  image.alt = "";
  image.draggable = false;
  layer.append(image);
  return image;
}

function shownAt(shown, x, y) {
  for (const image of shown) if (image.$x === x && image.$y === y) return image;
  return null;
}

// The tiles from `left` to `right` and from `top` to `bottom`, each where it
// is from the first: those there already stay, the others take the elements
// of those that left. East of the last tile is the first again.
function lay(tiles, pattern, level, left, top, right, bottom) {
  const { shown, spare, layer } = tiles;
  let kept = 0;
  for (const image of shown) {
    if (image.$x >= left && image.$x <= right && image.$y >= top && image.$y <= bottom) shown[kept++] = image;
    else release(tiles, image);
  }
  shown.length = kept;
  const count = 2 ** level;
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      let image = shownAt(shown, x, y);
      if (!image) {
        image = spare.pop() ?? tile(layer);
        image.$x = x;
        image.$y = y;
        image.src = pattern
          .replace("%z", level)
          .replace("%x", ((x % count) + count) % count)
          .replace("%y", y);
        shown.push(image);
      }
      image.style.transform = `translate(${(x - left) * TILE}px,${(y - top) * TILE}px)`;
    }
  }
}

// Puts the layer where the camera has it. Its tiles are looked at only when
// the camera has moved past one.
function draw(self) {
  const tiles = self.$tiles;
  const view = untrack(self.$view);
  const type = untrack(() => self.activeMapType);
  const pattern = view.ready ? (sourceOf(type)?.pattern ?? null) : null;
  if (view === tiles.view && pattern === tiles.pattern) return;
  tiles.view = view;
  const style = tiles.layer.style;
  if (pattern === null) {
    clear(tiles);
    tiles.pattern = null;
    style.display = "none";
    return;
  }
  const level = Math.min(Math.floor(view.zoom), type.cameraCapabilities.maximumZoomLevel);
  const count = 2 ** level;
  // A tile's side on the item, and how many of them half of the item is
  // across and down, turned as it is.
  const size = view.side / count;
  const cos = Math.abs(view.cos);
  const sin = Math.abs(view.sin);
  const half = (view.width * cos + view.height * sin) / 2 / size;
  const tall = (view.width * sin + view.height * cos) / 2 / size;
  const x = view.x * count;
  const y = view.y * count;
  const left = Math.floor(x - half);
  const right = Math.floor(x + half);
  const top = Math.max(Math.floor(y - tall), 0);
  const bottom = Math.min(Math.floor(y + tall), count - 1);
  const other = pattern !== tiles.pattern || level !== tiles.level;
  if (other) {
    clear(tiles);
    if (tiles.pattern === null) style.display = "";
    tiles.pattern = pattern;
    tiles.level = level;
  }
  if (other || left !== tiles.left || top !== tiles.top || right !== tiles.right || bottom !== tiles.bottom) {
    lay(tiles, pattern, level, left, top, right, bottom);
    tiles.left = left;
    tiles.top = top;
    tiles.right = right;
    tiles.bottom = bottom;
  }
  style.transform = `translate(${view.width / 2}px,${view.height / 2}px) rotate(${-view.bearing}deg) scale(${size / TILE}) translate(${(left - x) * TILE}px,${(top - y) * TILE}px)`;
}

const number = (value) => typeof value === "function" || value >= 0;

export const Map = defineType("Map", Item, {
  properties: {
    plugin: null,
    zoomLevel: 8,
    center: LONDON,
    minimumZoomLevel: 0,
    maximumZoomLevel: Infinity,
    bearing: 0,
    activeMapType: undefined,
    supportedMapTypes: derived(kinds),
    mapItems: derived((self) => self.$items()),
    error: derived((self) => (self.plugin?.$unknown?.() ? 1 : 0)),
    errorString: derived((self) => (self.plugin?.$unknown?.() ? UNSUPPORTED : "")),
    mapReady: derived(ready),
    copyrightsVisible: true,
    color: "#e6e6e6",
    clip: true,
  },
  signals: ["copyrightsChanged", "copyrightLinkActivated"],
  resolve,
  methods: {
    // Where a place is on the item. `clip`: nowhere, if that is not in it.
    fromCoordinate(place, clip = true) {
      const view = this.$view();
      if (!view.ready || !place?.isValid) return new Point(NaN, NaN);
      const x = across(view, place);
      const y = down(view, place);
      if (clip && (x < -0.5 || x > view.width + 0.5 || y < -0.5 || y > view.height + 0.5)) return new Point(NaN, NaN);
      return new Point(x, y);
    },
    toCoordinate(point, clip = true) {
      const view = this.$view();
      const x = Number(point?.x);
      const y = Number(point?.y);
      if (!view.ready || Number.isNaN(x) || Number.isNaN(y)) return INVALID;
      if (clip && (x < 0 || view.width < x || y < 0 || view.height < y)) return INVALID;
      return placeAt(view, x, y);
    },
    // By whole pixels, and no further than what is in view.
    pan(dx, dy) {
      const view = untrack(this.$view);
      dx = Math.trunc(dx);
      dy = Math.trunc(dy);
      if (!view.ready || !(dx || dy)) return;
      const x = Math.trunc(view.width / 2) + dx;
      const y = Math.trunc(view.height / 2) + dy;
      if (x < 0 || view.width < x || y < 0 || view.height < y) return;
      this.center = placeAt(view, x, y);
    },
    // Moves the map so that `place` is at `point` of the item.
    alignCoordinateToPoint(place, point) {
      const view = untrack(this.$view);
      const x = Number(point?.x) - view.width / 2;
      const y = Number(point?.y) - view.height / 2;
      if (!view.ready || !place?.isValid || !Number.isFinite(x) || !Number.isFinite(y)) return;
      const { cos, sin, side } = view;
      this.center = fromMercator(
        view.x + (east(view, place) - (x * cos - y * sin)) / side,
        mercatorY(place.latitude) - (x * sin + y * cos) / side,
      );
    },
  },
  setup(self) {
    const node = self.$node;
    const layer = document.createElement("div");
    layer.className = "qq-tiles";
    const notice = document.createElement("div");
    notice.className = "qq-copyright";
    node.append(layer, notice);
    self.$center = LONDON;
    self.$view = lazy(self, () => camera(self), IDLE);
    self.$items = lazy(self, () => Object.freeze(gathered(self, [])), EMPTY);
    // The elements of the tiles in view and of those that left, and what
    // was drawn last: the camera, the pattern, the level and the tiles.
    self.$tiles = { layer, shown: [], spare: [], view: IDLE, pattern: null, level: 0, left: 0, top: 0, right: 0, bottom: 0 };
    layer.style.display = "none";
    // A picture is shown once it is there, and one that is not there is
    // the map's colour. Whose the map is is said once any of it is there:
    // Qt learns it from where the tiles come from, and says nothing of a
    // map it could not reach.
    notice.style.visibility = "hidden";
    layer.addEventListener(
      "load",
      (event) => {
        event.target.style.visibility = "visible";
        notice.style.visibility = "";
      },
      true,
    );
    effect(
      () => css(self.color),
      (background) => void (node.style.background = background),
    );
    effect(
      () => (self.activeMapType, self.$view()),
      () => draw(self),
    );
    // Where the bounds put the zoom level and the centre is where they are:
    // a map made larger and smaller again has not zoomed back out. What
    // they are by now is what is kept: a bound given in the same turn may
    // have moved the zoom level since.
    effect(
      () => self.zoomLevel,
      () => keep(self, "zoomLevel"),
    );
    effect(
      () => self.center,
      () => keep(self, "center"),
    );
    // A bound a program gives, or the tiles have, holds the zoom level when
    // it is given and not after: the next zoom may pass it, as in Qt.
    const bound = (read, least) => {
      let was;
      effect(read, (limit) => {
        if (limit === was) return;
        was = limit;
        const zoom = untrack(() => self.zoomLevel);
        if (least ? zoom < limit : zoom > limit) keep(self, "zoomLevel", limit);
      });
    };
    bound(() => slot(self, "minimumZoomLevel").asked(), true);
    bound(() => slot(self, "maximumZoomLevel").asked(), false);
    bound(() => deepest(self), false);
    // Whose the map is, in a corner of it, over every item on it.
    let noticed = null;
    effect(
      () => (ready(self) ? self.activeMapType : null),
      (type) => {
        if (type === noticed) return;
        const html = sourceOf(type)?.copyright ?? "";
        notice.replaceChildren(elements(html));
        // Qt tells of the notice of another kind of map, not of the first.
        if (noticed && type) self.copyrightsChanged(html);
        noticed = type;
      },
    );
    effect(
      () => self.copyrightsVisible,
      (visible) => void (notice.style.display = visible ? "" : "none"),
    );
    let over = 0;
    effect(
      () => {
        let z = over;
        for (const child of self.children) if (child.$mapItem || child.$mapGroup) z = Math.max(z, child.z);
        return z;
      },
      (z) => {
        over = z;
        notice.style.zIndex = z + 1;
      },
    );
    notice.addEventListener("click", (event) => {
      const link = event.target.closest?.("a[data-link]")?.dataset.link;
      if (link !== undefined) self.copyrightLinkActivated(link);
    });
  },
});

// What is no zoom level, or no place, is not taken: the map stays as it is.
function taking(name, valid) {
  const property = Object.getOwnPropertyDescriptor(Map.proto, name);
  Object.defineProperty(Map.proto, name, {
    ...property,
    set(value) {
      if (valid(value)) property.set.call(this, value);
    },
  });
}

taking("zoomLevel", number);
taking("minimumZoomLevel", number);
taking("maximumZoomLevel", number);
taking("center", (value) => typeof value === "function" || value?.isValid === true);

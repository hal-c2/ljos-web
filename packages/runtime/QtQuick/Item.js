// Item: where an object is, how big, and what is inside it.
//
// An item is an absolutely positioned element. QML geometry is not CSS
// layout: `x`, `y`, `width` and `height` are properties other bindings read,
// so they are computed here, anchors included, and the element is only told
// the result.
import { onCleanup, runWithOwner } from "solid-js";
import { contents, defineType, derived, effect, flush, group, inside, kinds, parental, parented, QtObject, settle, typed } from "../object.js";
import { Rect } from "../QtQml/values.js";
import { drawing, drawn } from "./drawn.js";
import { declared, forceActiveFocus, nextItemInFocusChain, reachable, setFocus, under } from "./focus.js";
import { methods as geometry } from "./geometry.js";
import { navigable } from "./Keys.js";
import { layer, layered } from "./layer.js";
import { mirrored } from "./LayoutMirroring.js";
import { stateful } from "./states.js";
import "./style.js";
import { signal } from "#kernel";

const EMPTY = Object.freeze([]);
// `item.left`: one of an item's seven lines, for another item to anchor to.
const LINES = ["left", "right", "top", "bottom", "horizontalCenter", "verticalCenter", "baseline"];

// Half of an item's side, for the line through its middle: a whole number,
// so that what is centred lands on a pixel, unless the item's own
// `anchors.alignWhenCentered` says not to.
const half = (item, side) => (item.anchors?.alignWhenCentered === false ? side / 2 : Math.round(side / 2));

// Where a line is, in the coordinates `self` is positioned in: its parent's.
// A line across is asked only of where the item is across, and one down of
// where it is down: an item may be beside one that is below it.
function position(self, { item, edge }) {
  // An item anchors to its parent or to a sibling; the parent's own lines
  // are measured from its top left corner.
  const own = item === self.parent;
  switch (edge) {
    case "left":
      return own ? 0 : item.x;
    case "right":
      return (own ? 0 : item.x) + item.width;
    case "horizontalCenter":
      return (own ? 0 : item.x) + half(item, item.width);
    case "top":
      return own ? 0 : item.y;
    case "bottom":
      return (own ? 0 : item.y) + item.height;
    case "verticalCenter":
      return (own ? 0 : item.y) + half(item, item.height);
    default:
      return (own ? 0 : item.y) + item.baselineOffset;
  }
}

const left = (self, item) => (item === self.parent ? 0 : item.x);
const top = (self, item) => (item === self.parent ? 0 : item.y);

// A mirrored item's left is what it said of its right, and the line it is
// anchored to there is the other item's opposite one.
const OPPOSITE = { left: "right", right: "left", horizontalCenter: "horizontalCenter" };
const opposite = (line) => line && { item: line.item, edge: OPPOSITE[line.edge] ?? line.edge };

function across(self) {
  const anchors = self.anchors;
  if (!mirrored(self)) {
    return {
      left: anchors.left,
      right: anchors.right,
      center: anchors.horizontalCenter,
      leftMargin: anchors.leftMargin,
      rightMargin: anchors.rightMargin,
      offset: anchors.horizontalCenterOffset,
    };
  }
  return {
    left: opposite(anchors.right),
    right: opposite(anchors.left),
    center: opposite(anchors.horizontalCenter),
    leftMargin: anchors.rightMargin,
    rightMargin: anchors.leftMargin,
    offset: -anchors.horizontalCenterOffset,
  };
}

const resolve = {
  x(self, own) {
    const anchors = self.anchors;
    const fill = anchors.fill;
    if (fill) return left(self, fill) + (mirrored(self) ? anchors.rightMargin : anchors.leftMargin);
    const centerIn = anchors.centerIn;
    if (centerIn) {
      const offset = anchors.horizontalCenterOffset;
      return left(self, centerIn) + half(centerIn, centerIn.width) - half(self, self.width) + (mirrored(self) ? -offset : offset);
    }
    if (!anchors.left && !anchors.right && !anchors.horizontalCenter) return own();
    const lines = across(self);
    if (lines.left) return position(self, lines.left) + lines.leftMargin;
    if (lines.right) return position(self, lines.right) - lines.rightMargin - self.width;
    return position(self, lines.center) - half(self, self.width) + lines.offset;
  },
  y(self, own) {
    const anchors = self.anchors;
    const fill = anchors.fill;
    if (fill) return top(self, fill) + anchors.topMargin;
    const centerIn = anchors.centerIn;
    if (centerIn) {
      return top(self, centerIn) + half(centerIn, centerIn.height) - half(self, self.height) + anchors.verticalCenterOffset;
    }
    if (anchors.top) return position(self, anchors.top) + anchors.topMargin;
    if (anchors.bottom) return position(self, anchors.bottom) - anchors.bottomMargin - self.height;
    if (anchors.verticalCenter) {
      return position(self, anchors.verticalCenter) - half(self, self.height) + anchors.verticalCenterOffset;
    }
    if (anchors.baseline) {
      return position(self, anchors.baseline) - self.baselineOffset + anchors.baselineOffset;
    }
    return own();
  },
  width(self, own) {
    const anchors = self.anchors;
    const fill = anchors.fill;
    if (fill) return fill.width - anchors.leftMargin - anchors.rightMargin;
    if (anchors.left && anchors.right) {
      const lines = across(self);
      return position(self, lines.right) - lines.rightMargin - position(self, lines.left) - lines.leftMargin;
    }
    return own();
  },
  height(self, own) {
    const anchors = self.anchors;
    const fill = anchors.fill;
    if (fill) return fill.height - anchors.topMargin - anchors.bottomMargin;
    if (anchors.top && anchors.bottom) {
      return (
        position(self, anchors.bottom) - anchors.bottomMargin - position(self, anchors.top) - anchors.topMargin
      );
    }
    return own();
  },
  // An item inside one that is not shown is not shown, whatever it says.
  visible: (self, own) => Boolean(own()) && (self.parent?.visible ?? true),
  enabled: (self, own) => Boolean(own()) && (self.parent?.enabled ?? true),
  // Who has focus is decided among the items of a scope: see focus.js.
  focus: (self) => self.$focus === true,
  activeFocus: (self) => self.$active === true,
};

const margin = derived((self) => self.anchors.margins);

// The point `rotation` and `scale` are about, as fractions of the size.
const ORIGINS = [
  [0, 0],
  [0.5, 0],
  [1, 0],
  [0, 0.5],
  [0.5, 0.5],
  [1, 0.5],
  [0, 1],
  [0.5, 1],
  [1, 1],
];

// What Qt's `itemToParentTransform` computes, as CSS: the position, then the
// `transform` list from its last to its first, then scale and rotation about
// the transform origin.
function transform(self) {
  // An animator draws the item somewhere its properties do not say yet.
  const over = drawing(self);
  let css = `translate(${over?.x ?? self.x}px,${over?.y ?? self.y}px)`;
  const list = self.transform;
  if (list) {
    const all = Array.isArray(list) ? list : [list];
    for (let index = all.length - 1; index >= 0; index--) css += ` ${all[index].$css()}`;
  }
  const scale = over?.scale ?? self.scale;
  const rotation = over?.rotation ?? self.rotation;
  if (scale !== 1 || rotation !== 0) {
    const [fx, fy] = ORIGINS[self.transformOrigin] ?? ORIGINS[4];
    const x = fx * self.width;
    const y = fy * self.height;
    css += ` translate(${x}px,${y}px) scale(${scale}) rotate(${rotation}deg) translate(${-x}px,${-y}px)`;
  }
  return css;
}

// The items inside one, in order. A child may stand for others that come
// before it (`$siblings`): a Repeater's are its parent's children.
function children(self) {
  self.$track();
  const all = self.$extra ? [...self.$static, ...self.$extra] : self.$static;
  const items = [];
  for (const child of all) {
    if (child.$siblings) items.push(...child.$siblings());
    if (child.$node) items.push(child);
  }
  return items;
}

// Puts `nodes` in `container` in that order, after what the type itself
// keeps there, moving only what is out of place.
function arrange(container, nodes, previous) {
  const wanted = new Set(nodes);
  // One that is gone may be another item's by now: a ParentChange moved it.
  for (const node of previous) if (!wanted.has(node) && node.parentNode === container) node.remove();
  let cursor = null;
  for (let index = nodes.length - 1; index >= 0; index--) {
    const node = nodes[index];
    if (node.parentNode !== container || node.nextSibling !== cursor) container.insertBefore(node, cursor);
    cursor = node;
  }
}

// Keeps the element's children those of the item. Only an item that has
// some needs it.
function arranged(self) {
  if (self.$arranged) return;
  self.$arranged = true;
  let previous = EMPTY;
  runWithOwner(self.$owner, () =>
    effect(
      // An item's effect is drawn under it: its element comes first.
      () => children(self).flatMap((item) => (item.$layerEffect ? [item.$layerEffect, item.$node] : [item.$node])),
      (nodes) => {
        arrange(self.$content ?? self.$node, nodes, previous);
        previous = nodes;
      },
    ),
  );
}

// What an item that is mounted is in, as the root of a QQuickView is in the
// view's content item: an item as large as the element, which is the root's
// `parent`. A root that says `anchors.fill: parent` fills the element.
function viewed(self, host) {
  const [width, setWidth] = signal(host.clientWidth, self.$owner);
  const [height, setHeight] = signal(host.clientHeight, self.$owner);
  const view = inside(null, () =>
    Item({
      get width() {
        return width();
      },
      get height() {
        return height();
      },
    }),
  );
  host.append(view.$node);
  // The element is another size when the page is, with nothing here asking.
  const observer = new ResizeObserver(() => {
    setWidth(host.clientWidth);
    setHeight(host.clientHeight);
    flush();
  });
  observer.observe(host);
  onCleanup(() => {
    observer.disconnect();
    view.$node.remove();
  });
  under(self, view);
  self.parent = view;
}

export const Item = defineType("Item", QtObject, {
  properties: {
    x: typed(kinds.place, 0),
    y: typed(kinds.place, 0),
    z: typed(kinds.real, 0),
    width: typed(kinds.place, derived((self) => self.implicitWidth)),
    height: typed(kinds.place, derived((self) => self.implicitHeight)),
    implicitWidth: 0,
    implicitHeight: 0,
    // What is given these is made the number or the yes-or-no they are:
    // `opacity: over && won` is 0 or 1, `visible: model.count` is whether
    // there are any.
    opacity: typed(kinds.share, 1),
    visible: typed(kinds.bool, true),
    enabled: typed(kinds.bool, true),
    clip: typed(kinds.bool, false),
    rotation: typed(kinds.real, 0),
    scale: typed(kinds.real, 1),
    transformOrigin: 4,
    transform: undefined,
    baselineOffset: 0,
    smooth: typed(kinds.bool, true),
    antialiasing: typed(kinds.bool, false),
    focus: false,
    activeFocus: false,
    activeFocusOnTab: typed(kinds.bool, false),
    parent: derived((self) => self.$parent),
    ...stateful.properties,
    anchors: group({
      fill: undefined,
      centerIn: undefined,
      left: undefined,
      right: undefined,
      top: undefined,
      bottom: undefined,
      horizontalCenter: undefined,
      verticalCenter: undefined,
      baseline: undefined,
      margins: 0,
      leftMargin: margin,
      rightMargin: margin,
      topMargin: margin,
      bottomMargin: margin,
      horizontalCenterOffset: 0,
      verticalCenterOffset: 0,
      baselineOffset: 0,
      alignWhenCentered: true,
    }),
    layer,
  },
  enums: {
    TopLeft: 0,
    Top: 1,
    TopRight: 2,
    Left: 3,
    Center: 4,
    Right: 5,
    BottomLeft: 6,
    Bottom: 7,
    BottomRight: 8,
  },
  resolve,
  methods: {
    // The items inside this one: a list that changes as they come and go.
    get children() {
      return children(this);
    },
    // The rectangle they take together, seen or not; nothing at the origin
    // when there are none.
    get childrenRect() {
      let left = Infinity;
      let top = Infinity;
      let right = -Infinity;
      let bottom = -Infinity;
      for (const child of children(this)) {
        const { x, y } = child;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x + child.width);
        bottom = Math.max(bottom, y + child.height);
      }
      if (left === Infinity) return new Rect(0, 0, 0, 0);
      return new Rect(left, top, Math.max(right - left, 0), Math.max(bottom - top, 0));
    },
    // Adds an item made after this one was: `Component.createObject(parent)`.
    $add(item) {
      (this.$extra ??= []).push(item);
      arranged(this);
      this.$touch((version) => version + 1);
    },
    // Takes one out, whether it was made with this or added later.
    $remove(item) {
      const index = this.$extra?.indexOf(item) ?? -1;
      if (index >= 0) this.$extra.splice(index, 1);
      else if (this.$static.includes(item)) this.$static = this.$static.filter((child) => child !== item);
      else return;
      this.$touch((version) => version + 1);
    },
    // Called by `mount` for the object it mounted.
    $mounted(host) {
      viewed(this, host);
    },
    // `mapToItem`, `mapFromItem`, `mapToGlobal`, `mapFromGlobal`, `contains`
    // and `childAt`.
    ...geometry,
    forceActiveFocus() {
      forceActiveFocus(this);
    },
    nextItemInFocusChain(forward = true) {
      return nextItemInFocusChain(this, forward);
    },
  },
  setup(self, props) {
    const node = document.createElement("div");
    node.className = "qq";
    self.$node = node;
    self.$static = EMPTY;
    stateful.setup(self, props);
    parented(self, props, (self) => self.$parent);
    effect(
      () => [transform(self), self.width, self.height],
      ([css, width, height]) => {
        node.style.transform = css;
        node.style.width = `${width}px`;
        node.style.height = `${height}px`;
      },
    );
    effect(
      () => [self.visible, drawn(self, "opacity"), self.z, self.clip],
      ([visible, opacity, z, clip]) => {
        node.style.display = visible ? "" : "none";
        node.style.opacity = opacity === 1 ? "" : opacity;
        node.style.zIndex = z === 0 ? "" : z;
        node.style.overflow = clip ? "hidden" : "";
      },
    );
    layered(self, props);
    if ("focus" in props) declared(self, props);
    if ("activeFocusOnTab" in props) reachable(self);
    navigable(self, props);
  },
  adopt(self, props) {
    self.$static = contents(props, self);
    if (self.$static.length) arranged(self);
  },
});

// Assigning `focus` takes it from whichever item of the scope had it.
Object.defineProperty(Item.proto, "focus", {
  ...Object.getOwnPropertyDescriptor(Item.proto, "focus"),
  set(value) {
    setFocus(this, value);
    settle();
  },
});

// Assigning `parent` puts it among that one's children.
parental(Item);

// `state` reads as the state the item is in, and assigning it enters one.
Object.defineProperties(Item.proto, Object.getOwnPropertyDescriptors(stateful.methods));

for (const edge of LINES) {
  Object.defineProperty(Item.proto, edge, {
    get() {
      return ((this.$lines ??= {})[edge] ??= { item: this, edge });
    },
    enumerable: true,
    configurable: true,
  });
}

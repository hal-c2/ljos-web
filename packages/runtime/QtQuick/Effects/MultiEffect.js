// MultiEffect: another item shown changed: its colours, a blur, a shadow,
// a mask.
//
// Qt draws the source into a texture and the effect paints that texture.
// A page has no picture of an element to paint, and a copy of the source's
// elements would have to be made again whenever anything in it changed. So
// the effect is done to the source's own element, where it stands: a CSS
// `filter` and an SVG mask, which the browser applies to whatever the
// element shows, each frame, at no cost here.
//
// What follows from that is what differs from Qt:
//
// - A source that is hidden (`visible: false`, as one is that is only to be
//   seen through its effect) is shown after all, moved and scaled to the
//   effect's rectangle. It keeps its own place among its siblings, not the
//   effect's.
// - A source that is shown is drawn twice by Qt, itself and through the
//   effect. Here it is drawn once, with the effect on it: what a shadow or
//   a change of colour of the same rectangle looks like in Qt too. A blur
//   or a mask of it would be hidden behind or in front of the item itself
//   there, and is left out here.
// - The effect of an item's layer (`layer.effect: MultiEffect {}`) is what
//   Qt draws of the item, where the item is: all of it is done to the item.
import { allowedStyle, allowedUrl } from "../../guard.js";
import { onCleanup } from "solid-js";
import { Rect } from "../../QtQml/values.js";
import { defineType, derived, effect, slot } from "../../object.ts";
import { colorValue } from "../color.js";
import { rules } from "../compute.js";
import { Item } from "../Item.js";
import { Rectangle } from "../Rectangle.js";

const SVG = "http://www.w3.org/2000/svg";
const svg = (name) => document.createElementNS(SVG, name);

// An item writes `display: none` and its opacity on its own element: what
// shows a hidden source has to say more. The texture Qt makes of a source is
// of its own rectangle and without its opacity, and nothing can be pressed
// through an effect.
rules(`
.qq-effect { position: absolute; width: 0; height: 0; overflow: hidden; }
.qq.qq-effect-shown { display: block !important; }
.qq.qq-effect-source { opacity: 1 !important; contain: paint; pointer-events: none; }
`);

let made = 0;

const number = (value) => Number(value) || 0;
const unit = (value) => Math.min(1, Math.max(0, number(value)));
const round = (value) => Math.round(value * 1e4) / 1e4 + 0;

// What `source` gave: an item that has an element, which the item a layer
// is of has.
const item = (value) => (value?.$layer ?? (value?.$node ? value : null));

// Whether an item says of itself that it is shown, whatever its parent is.
function saysVisible(object) {
  const visible = slot(object, "visible");
  // Read, so that a change of it is seen.
  visible.explicit();
  return Boolean(visible.own());
}

// How far a blur of `amount` (0 to 1) reaches, as the standard deviation CSS
// blurs by. Qt blends six copies of the source, each half the size of the
// one before, by weights that depend on the square root of `amount *
// blurMax`: twice the reach for every fifth of that scale. The numbers are
// fitted to what Qt draws: 1.5, 2.75, 7.25 and 21 pixels for 8, 16, 32 and
// 64.
function reach(self, amount) {
  const pixels = unit(amount) * Math.max(0, number(self.blurMax));
  if (!(pixels > 0)) return 0;
  return 0.35 * 2 ** (0.75 * Math.sqrt(pixels)) * (1 + Math.max(0, number(self.blurMultiplier)));
}

// The weights of grey Qt's shader uses.
const GREY = [0.299, 0.587, 0.114];

// The colours as an `feColorMatrix`, or "" when they stay as they are. In
// Qt's shader: contrast about the middle, then brightness, then towards the
// grey of that in the colorization colour, then away from the same grey by
// the saturation. All of it is linear, so it is one matrix. `strength` is
// how much of it shows: 1, or less for an effect that is not opaque.
function matrix(self, strength) {
  const brightness = number(self.brightness);
  const contrast = number(self.contrast);
  const saturation = number(self.saturation);
  const tint = self.colorizationColor;
  const tinted = number(self.colorization) * tint.a;
  if (!brightness && !contrast && !saturation && !tinted) return "";
  if (!(strength > 0)) return "";
  const gain = 1 + contrast;
  const lift = 0.5 * (1 - gain) + brightness;
  const kept = (1 + saturation) * (1 - tinted);
  const rows = [tint.r, tint.g, tint.b].map((channel, row) => {
    const grey = (1 + saturation) * tinted * channel - saturation;
    const cells = GREY.map((weight, column) => (row === column ? kept * gain : 0) + grey * gain * weight);
    cells.push(0, (kept + grey) * lift);
    return cells.map((cell, column) => round(strength * cell + (column === row ? 1 - strength : 0)));
  });
  rows.push([0, 0, 0, 1, 0]);
  return rows.map((row) => row.join(" ")).join(" ");
}

const smooth = (from, to, value) => {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

// How much is shown where the mask is `alpha` opaque, for every alpha there
// is: an `feFuncA` table. With no spread a threshold is an edge, and by
// default everything the mask is not clear in is shown whole.
function levels(self) {
  const low = unit(self.maskThresholdMin);
  const lowSpread = Math.max(0, number(self.maskSpreadAtMin));
  const high = unit(self.maskThresholdMax);
  const highSpread = Math.max(0, number(self.maskSpreadAtMax));
  const from = low * (1 + lowSpread) - lowSpread;
  const until = (1 - high) * (1 + highSpread) - highSpread;
  const inverted = Boolean(self.maskInverted);
  const table = [];
  for (let step = 0; step < 256; step++) {
    const alpha = step / 255;
    const above = lowSpread > 0 ? smooth(from, from + lowSpread, alpha) : alpha > from ? 1 : 0;
    const below = highSpread > 0 ? smooth(until, until + highSpread, 1 - alpha) : 1 - alpha >= until ? 1 : 0;
    const shown = above * below;
    table.push(Math.round((inverted ? 1 - shown : shown) * 1000) / 1000);
  }
  return table.join(" ");
}

// What the mask is a picture of, stretched over the effect as Qt stretches
// its texture: an Image's picture, or a Rectangle's shape. Of anything else
// there is no picture to be had.
function shape(mask) {
  if (mask.$image) {
    const record = mask.$image.record();
    // Nothing is shown through a picture that is not there.
    return record && record.status() === 1 ? { url: record.url } : {};
  }
  if (mask.$type.chain.includes(Rectangle)) {
    const width = mask.width;
    const height = mask.height;
    if (!(width > 0 && height > 0)) return {};
    const radius = Math.min(Math.max(0, number(mask.radius)), width / 2, height / 2);
    return { rx: round(radius / width), ry: round(radius / height), alpha: Math.round(mask.color.a * 1000) / 1000 };
  }
  return null;
}

// Where an item's corner is, in the item at the top of its tree.
function origin(object) {
  let x = 0;
  let y = 0;
  for (let each = object; each?.$node; each = each.parent) {
    x += each.x;
    y += each.y;
  }
  return [x, y];
}

// The elements of a hidden source that have to be shown after all: its own,
// and those of what is inside it and not hidden itself.
function hidden(source, into) {
  into.push(source.$node);
  for (const child of source.children) if (saysVisible(child)) hidden(child, into);
  return into;
}

const padded = (self) => Boolean(self.blurEnabled || self.shadowEnabled);

// The rectangle Qt paints in: the effect's own, and around it the room a
// blur or a shadow may need.
function painted(self) {
  const extra = self.paddingRect;
  const auto = self.autoPaddingEnabled && padded(self);
  const room = auto ? Math.max(0, number(self.blurMax)) * (1 + Math.max(0, number(self.blurMultiplier))) : 0;
  const left = room + number(extra?.x);
  const top = room + number(extra?.y);
  const right = room + number(extra?.width);
  const bottom = room + number(extra?.height);
  return new Rect(-left, -top, self.width + left + right, self.height + top + bottom);
}

// Everything the source's element is to be given, or null when the effect
// shows nothing.
function wanted(self, names) {
  const source = item(self.source);
  if (!source || !self.visible) return null;
  // Shown only through the effect, or shown as well. An item with a layer
  // is seen through the layer's effect alone and stays where it is, as
  // clear as it is itself: Qt gives the effect the item's opacity, and the
  // item's element has it here.
  const layered = self.source?.$layer === source;
  const alone = layered || !saysVisible(source);
  const opacity = layered ? 1 : unit(self.opacity);
  const filters = [];
  const colours = matrix(self, alone ? 1 : opacity);
  if (colours) filters.push(`url(#${names.colours})`);
  const soft = alone && self.blurEnabled ? reach(self, self.blur) : 0;
  if (soft > 0) filters.push(`blur(${round(soft)}px)`);
  if (self.shadowEnabled) {
    const colour = self.shadowColor;
    const alpha = colour.a * unit(self.shadowOpacity) * (alone ? 1 : opacity);
    // The shadow is cast by the source as it was before it was blurred;
    // CSS casts it from what the blur left, which is that much softer.
    const cast = Math.sqrt(Math.max(0, reach(self, self.shadowBlur) ** 2 - soft ** 2));
    const [red, green, blue] = [colour.r, colour.g, colour.b].map((channel) => Math.round(channel * 255));
    filters.push(
      `drop-shadow(${round(number(self.shadowHorizontalOffset))}px ${round(number(self.shadowVerticalOffset))}px ` +
        `${round(cast)}px rgba(${red}, ${green}, ${blue}, ${round(alpha)}))`,
    );
  }
  const next = { node: source.$node, filter: filters.join(" "), colours, shown: null, mask: null, levels: "" };
  if (!alone) return next;
  if (opacity < 1) next.filter += `${next.filter ? " " : ""}opacity(${round(opacity)})`;
  let sx = 1;
  let sy = 1;
  if (!layered) {
    next.shown = hidden(source, []);
    // From the source's rectangle to the effect's. CSS does `translate` and
    // `scale` before the `transform` the item itself keeps.
    const wide = source.width;
    const tall = source.height;
    sx = wide > 0 ? self.width / wide : 1;
    sy = tall > 0 ? self.height / tall : 1;
    const [ex, ey] = origin(self);
    const [px, py] = origin(source.parent);
    const tx = ex - px - sx * source.x;
    const ty = ey - py - sy * source.y;
    next.scale = sx === 1 && sy === 1 ? "" : `${round(sx)} ${round(sy)}`;
    next.translate = Math.abs(tx) < 1e-6 && Math.abs(ty) < 1e-6 ? "" : `${round(tx)}px ${round(ty)}px`;
  }
  // With no room around it, a blur and a shadow end where the effect does,
  // but for what `paddingRect` adds.
  if (!self.autoPaddingEnabled && padded(self)) {
    const extra = self.paddingRect;
    const edges = [number(extra?.y) / sy, number(extra?.width) / sx, number(extra?.height) / sy, number(extra?.x) / sx];
    next.clip = `inset(${edges.map((edge) => `${round(-edge)}px`).join(" ")})`;
  }
  const mask = self.maskEnabled ? item(self.maskSource) : null;
  if (mask) {
    next.mask = shape(mask);
    if (next.mask) next.levels = levels(self);
  }
  return next;
}

export const MultiEffect = defineType("MultiEffect", Item, {
  properties: {
    source: null,
    autoPaddingEnabled: true,
    paddingRect: Object.freeze(new Rect(0, 0, 0, 0)),
    brightness: 0,
    contrast: 0,
    saturation: 0,
    colorization: 0,
    colorizationColor: "red",
    blurEnabled: false,
    blur: 0,
    blurMax: 32,
    blurMultiplier: 0,
    shadowEnabled: false,
    shadowOpacity: 1,
    shadowBlur: 1,
    shadowHorizontalOffset: 0,
    shadowVerticalOffset: 0,
    shadowColor: "black",
    shadowScale: 1,
    maskEnabled: false,
    maskSource: null,
    maskThresholdMin: 0,
    maskSpreadAtMin: 0,
    maskThresholdMax: 1,
    maskSpreadAtMax: 0,
    maskInverted: false,
    itemRect: derived(painted),
    // Qt wraps a source that has no texture of its own in one: a picture
    // has, an item has not.
    hasProxySource: derived((self) => {
      const source = item(self.source);
      return Boolean(source) && !source.$image;
    }),
  },
  resolve: { colorizationColor: colorValue, shadowColor: colorValue },
  setup(self) {
    const id = ++made;
    const names = { colours: `qq-effect-${id}-colours`, levels: `qq-effect-${id}-levels`, mask: `qq-effect-${id}-mask` };
    // What the filter and the mask name, made when first needed.
    let defs = null;
    let colours = null;
    let mask = null;
    const define = (element) => {
      if (!defs) {
        defs = svg("svg");
        defs.setAttribute("class", "qq-effect");
        self.$node.append(defs);
      }
      defs.append(element);
      return element;
    };
    const within = (element) => {
      for (const side of ["x", "y"]) element.setAttribute(side, 0);
      for (const side of ["width", "height"]) element.setAttribute(side, 1);
      return element;
    };

    function tint(values) {
      if (!colours) {
        const filter = define(svg("filter"));
        filter.id = names.colours;
        filter.setAttribute("color-interpolation-filters", "sRGB");
        colours = filter.appendChild(svg("feColorMatrix"));
        colours.setAttribute("type", "matrix");
      }
      colours.setAttribute("values", values);
    }

    function cut(shape, table) {
      if (!mask) {
        const filter = within(define(svg("filter")));
        filter.id = names.levels;
        filter.setAttribute("color-interpolation-filters", "sRGB");
        const transfer = filter.appendChild(svg("feComponentTransfer"));
        const alpha = transfer.appendChild(svg("feFuncA"));
        alpha.setAttribute("type", "table");
        // The source's own box is the unit: the mask is stretched over it.
        const element = within(define(svg("mask")));
        element.id = names.mask;
        element.setAttribute("maskContentUnits", "objectBoundingBox");
        element.style.maskType = "alpha";
        mask = { alpha, element };
      }
      mask.alpha.setAttribute("tableValues", table);
      let picture = null;
      if (shape.url) {
        picture = svg("image");
        picture.setAttribute("href", allowedUrl(shape.url));
        picture.setAttribute("preserveAspectRatio", "none");
      } else if (shape.alpha !== undefined) {
        picture = svg("rect");
        picture.setAttribute("rx", shape.rx);
        picture.setAttribute("ry", shape.ry);
        picture.setAttribute("fill", "black");
        picture.setAttribute("fill-opacity", shape.alpha);
      } else {
        // No picture: clear all over, which the levels may still turn round.
        picture = svg("rect");
        picture.setAttribute("fill", "black");
        picture.setAttribute("fill-opacity", 0);
      }
      within(picture).setAttribute("filter", `url(#${names.levels})`);
      mask.element.replaceChildren(picture);
    }

    // What the source's element was last given.
    let last = null;
    const show = (nodes, shown) => {
      for (const [index, node] of nodes.entries()) {
        node.classList.toggle("qq-effect-shown", shown);
        if (index === 0) node.classList.toggle("qq-effect-source", shown);
      }
    };
    const clear = (given) => {
      const style = given.node.style;
      style.filter = style.mask = style.translate = style.scale = style.clipPath = ""; // guarded: cleared
      if (given.shown) show(given.shown, false);
    };

    effect(
      () => wanted(self, names),
      (next) => {
        if (last && (!next || next.node !== last.node)) clear(last);
        if (last?.shown && next?.node === last.node) show(last.shown, false);
        last = next;
        if (!next) return;
        if (next.colours) tint(next.colours);
        if (next.mask) cut(next.mask, next.levels);
        const style = next.node.style;
        style.filter = allowedStyle(next.filter);
        style.mask = next.mask ? allowedStyle(`url(#${names.mask})`) : "";
        style.translate = next.translate ?? "";
        style.scale = next.scale ?? "";
        style.clipPath = allowedStyle(next.clip ?? "");
        if (next.shown) show(next.shown, true);
      },
    );
    onCleanup(() => {
      if (last) clear(last);
      last = null;
    });
  },
});

// A property as what changes it over time sees it: an animation, a
// Behavior, a state.
//
// A property a type declares has a slot. What an animation of its own
// writes there is an assignment. What a Behavior or a transition shows is
// not: the property already has the value it is moving to (`target()`), and
// the slot's `shown` is what it reads as on the way.
//
// A property a component declares (`property real progress`) is an accessor
// on its object and no more: it can be read and assigned to, which is how it
// is animated.
import { slot as slotOf } from "../../object.js";
import { css } from "../color.js";
import { untrack } from "#kernel";

// What a slot reads as while something animates it.
class Display {
  constructor(slot) {
    this.slot = slot;
    this.value = undefined;
    // The Behavior on the property, which shows it for as long as it is
    // enabled, and whether a transition has taken it over for now.
    this.behavior = null;
    this.held = false;
    this.read = () => this.value;
  }

  show(value) {
    if (Object.is(this.value, value)) return;
    this.value = value;
    this.slot.changed();
  }

  // Keeps the property reading as it does now, whatever it is given.
  hold() {
    const slot = this.slot;
    if (!slot.shown) {
      this.value = untrack(() => slot.get());
      slot.shown = this.read;
    }
    this.held = true;
    this.behavior?.$interrupt();
  }

  // Lets go of it: it reads as its value again. With a Behavior that value
  // is still shown by it, so `animate` says whether it moves there or is
  // there at once.
  release(animate) {
    if (!this.held) return;
    this.held = false;
    if (this.behavior) return this.behavior.$follow(animate);
    this.slot.shown = null;
    this.slot.changed();
  }
}

const displays = new WeakMap();

export function display(slot) {
  let found = displays.get(slot);
  if (!found) displays.set(slot, (found = new Display(slot)));
  return found;
}

// `anchors.margins` is the slot `anchors$margins`, and a value source is
// told its property that way already.
export const keyOf = (name) => (name.includes(".") ? name.replaceAll(".", "$") : name);


export class Property {
  constructor(object, name) {
    let key = keyOf(name);
    let slot = (object?.$slots && slotOf(object, key)) || null;
    // `backButton.opacity`: of the object a property holds.
    for (let at = key.indexOf("$"); !slot && at > 0 && object?.$slots; at = key.indexOf("$")) {
      const held = untrack(() => object[key.slice(0, at)]);
      if (!held?.$type) break;
      object = held;
      key = key.slice(at + 1);
      slot = slotOf(object, key) || null;
    }
    this.object = object;
    this.key = key;
    this.slot = slot;
    this.read = () => (this.slot ? this.slot.get() : this.object[this.key]);
  }

  get valid() {
    return this.slot !== null || (this.object != null && this.key in this.object);
  }

  is(object, key) {
    return this.object === object && this.key === key;
  }

  // What it reads as now.
  get() {
    return untrack(this.read);
  }

  // The value it has, whatever is shown; tracked, for what follows it.
  target() {
    if (!this.slot) return this.object[this.key];
    this.slot.follow();
    return this.slot.target();
  }

  // An assignment that settles nothing: the caller flushes. Where a
  // Behavior shows the property, this is shown at once, as in Qt, where an
  // animation's writes pass the Behavior by.
  write(value) {
    const slot = this.slot;
    if (!slot) {
      this.object[this.key] = value;
      return;
    }
    const wrote = slot.write(value);
    if (!slot.shown) return;
    const shown = displays.get(slot);
    if (!shown || shown.held) return;
    shown.behavior?.$interrupt();
    if (Object.is(shown.value, value)) return;
    shown.value = value;
    if (!wrote) slot.changed();
  }

  // What it reads as while it is on its way to its value.
  show(value) {
    if (this.slot) display(this.slot).show(value);
    else this.object[this.key] = value;
  }
}

// Colours, for mixing them. QML's are strings (`"red"`, `"#80ff0000"`) or
// objects with `r`, `g`, `b` and `a` from 0 to 1; mixed, they are strings.
const parsed = new Map();
let context = null;

function fromHex(text) {
  const digits = text.slice(1);
  if (!/^[0-9a-f]+$/i.test(digits)) return null;
  const at = (index, width) => {
    const value = parseInt(digits.slice(index, index + width), 16);
    return width === 1 ? value * 17 : value;
  };
  if (digits.length === 3) return [at(0, 1), at(1, 1), at(2, 1), 255];
  if (digits.length === 6) return [at(0, 2), at(2, 2), at(4, 2), 255];
  if (digits.length === 8) return [at(2, 2), at(4, 2), at(6, 2), at(0, 2)];
  return null;
}

// The browser knows the names; a canvas gives back what it made of one, and
// leaves what it was set to before when it made nothing of it.
function fromName(text) {
  context ??= document.createElement("canvas").getContext("2d");
  const value = css(text);
  context.fillStyle = "#000000";
  context.fillStyle = value;
  const first = context.fillStyle;
  context.fillStyle = "#ffffff";
  context.fillStyle = value;
  if (context.fillStyle !== first) return null;
  if (first[0] === "#") return fromHex(first);
  const parts = /^rgba?\(([^)]+)\)$/.exec(first)?.[1].split(",").map(Number);
  return parts ? [parts[0], parts[1], parts[2], Math.round((parts[3] ?? 1) * 255)] : null;
}

// `[r, g, b, a]` from 0 to 255, or null for what is not a colour.
export function rgba(color) {
  if (typeof color === "string") {
    let found = parsed.get(color);
    if (found === undefined) {
      found = color === "" ? null : color[0] === "#" ? fromHex(color) : fromName(color);
      parsed.set(color, found);
    }
    return found;
  }
  if (color && typeof color.r === "number" && typeof color.g === "number" && typeof color.b === "number") {
    return [color.r * 255, color.g * 255, color.b * 255, (color.a ?? 1) * 255];
  }
  return null;
}

const HEX = Array.from({ length: 256 }, (_, value) => value.toString(16).padStart(2, "0"));
const byte = (value) => HEX[Math.max(0, Math.min(255, Math.round(value)))];

export function mix(from, to, progress) {
  const r = byte(from[0] + (to[0] - from[0]) * progress);
  const g = byte(from[1] + (to[1] - from[1]) * progress);
  const b = byte(from[2] + (to[2] - from[2]) * progress);
  const a = byte(from[3] + (to[3] - from[3]) * progress);
  return a === "ff" ? `#${r}${g}${b}` : `#${a}${r}${g}${b}`;
}

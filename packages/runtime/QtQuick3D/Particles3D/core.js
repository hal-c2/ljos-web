// What the types of the module share: the list of everything a particle
// system may own, vectors a program binds member by member, and chance.
import { onCleanup } from "solid-js";
import { slot } from "../../object.js";
import { Vector3d } from "../../QtQml/values.js";
import * as math from "../math.js";
import { signal } from "#kernel";

// Every emitter, affector and particle there is. A system finds its own
// among them: what is declared inside it, and what names it as `system`
// wherever it was declared.
const all = new Set();
const [version, touch] = signal(0);

export function enrol(self) {
  all.add(self);
  touch((count) => count + 1);
  onCleanup(() => {
    all.delete(self);
    touch((count) => count + 1);
  });
}

export function enrolled() {
  version();
  return all;
}

// The system an emitter or an affector is in when it names none: the one
// it was declared in.
export const within = (self) => (self.parent?.$particles ? self.parent : null);

export const list = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);

export const three = (value) => [Number(value?.x) || 0, Number(value?.y) || 0, Number(value?.z) || 0];

const AXES = ["x", "y", "z"];

// `direction`, `extents` and their like are vectors a program reads as one
// (`direction.times(2)`) and whose members it binds one by one
// (`direction.y: 3`): groups that are also vectors. The result is what a
// type's `setup` calls to give an object its own.
export function vectors(names, axes = AXES, Kind = Vector3d) {
  const views = names.map((name) => {
    const view = Object.create(Kind.prototype);
    for (const axis of axes) {
      const key = `${name}$${axis}`;
      Object.defineProperty(view, axis, {
        get() {
          return slot(this.$self, key).get();
        },
        set(value) {
          slot(this.$self, key).set(value);
        },
        enumerable: true,
      });
    }
    return [name, view];
  });
  return (self) => {
    for (const [name, view] of views) self.$groups[name] = Object.create(view, { $self: { value: self } });
  };
}

// What chance decides of a particle, each from a number of its own.
export const LIFE = 0;
export const SCALE = 1;
export const END_SCALE = 2;
export const TURN = 3;
export const SPIN = 6;
export const COLOR = 9;
export const VELOCITY = 13;
export const TARGET = 16;
export const MAGNITUDE = 19;
export const SHAPE = 20;
export const FRAME = 24;
export const LENGTH = 26;
export const WANDER = 27;
export const ATTRACT = 34;
export const AMOUNT = 38;

// A number from nought up to one: the same whenever it is asked for with
// the same seed, particle and purpose, so that a particle is the same
// particle at whatever time it is looked at. Qt's are from a table it fills
// from the seed; which numbers come is not something a program can count
// on, only that they stay.
export function random(seed, index, channel) {
  let hash = (seed ^ Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(channel + 1, 0x85ebca6b)) | 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

// The same from minus one up to one.
export const spread = (seed, index, channel) => random(seed, index, channel) * 2 - 1;

// Where a node is as its system sees it: the two need not be one inside
// the other.
export function seenFrom(system, node) {
  const from = math.inverse(system.$world());
  return from ? math.multiply(from, node.$world()) : node.$world();
}

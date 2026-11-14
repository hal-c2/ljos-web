// ParticleSystem: the particles, and the time they live in.
//
// A particle is a row of numbers, not an object: where it was emitted, how
// fast, under what acceleration, when and for how long. Where it is now
// follows from those and the time, so nothing moves it from frame to frame;
// an affector that changes its course rewrites the row so that the particle
// is where it was at this instant and goes on differently.
//
// A system is a job on the clock the animations are on, and only while it
// has something to do: a live particle, or an emitter that is emitting.
import { onCleanup } from "solid-js";
import { defineType, derived, effect, slot } from "../../object.ts";
import { clock } from "../animation/clock.js";
import { Item } from "../Item.js";
import { generator } from "./random.js";

// A particle's row: the position, velocity and acceleration it was emitted
// with, the time of that in seconds, its life in seconds, its two sizes.
export const X = 0;
export const Y = 1;
export const VX = 2;
export const VY = 3;
export const AX = 4;
export const AY = 5;
export const T = 6;
export const LIFE = 7;
export const SIZE = 8;
export const END = 9;
export const STRIDE = 10;

// `Emitter.InfiniteLife`, in milliseconds: no particle is given more.
export const INFINITE = 600000;
// How long an endless particle goes before its life is put off.
const EXTEND = (2 * INFINITE) / 3;

// The particles of one group (`group: "smoke"`), in slots that are used
// again when a particle is gone.
export class Group {
  constructor(name, id) {
    this.name = name;
    this.id = id;
    // How many slots there are for emitters that keep to a limit: what the
    // group's emitters can have alive at once, as Qt counts it.
    this.size = 0;
    this.capacity = 0;
    this.data = new Float64Array(0);
    this.used = new Uint8Array(0);
    // Which particle is in a slot: every emission has a number of its own.
    this.serial = new Uint32Array(0);
    // What a painter needs of a particle beyond its course: red, green, blue
    // and alpha as bytes, rotation and rotation per second in radians, and
    // whether it turns to face where it is going.
    this.color = new Uint8Array(0);
    this.spin = new Float32Array(0);
    this.facing = new Uint8Array(0);
    // The painter whose colours (and rotations) those are: the first one
    // that has any to give. Another one keeps its own.
    this.colorOwner = null;
    this.spinOwner = null;
    // No slot below `next` is free, and none at or above `high` is used.
    this.next = 0;
    this.high = 0;
    this.alive = 0;
    this.painters = [];
  }

  reserve(capacity) {
    if (capacity <= this.capacity) return;
    capacity = Math.max(capacity, this.capacity * 2, 16);
    const grown = (old, made) => (made.set(old), made);
    this.data = grown(this.data, new Float64Array(capacity * STRIDE));
    this.used = grown(this.used, new Uint8Array(capacity));
    this.serial = grown(this.serial, new Uint32Array(capacity));
    this.color = grown(this.color, new Uint8Array(capacity * 4));
    this.spin = grown(this.spin, new Float32Array(capacity * 2));
    this.facing = grown(this.facing, new Uint8Array(capacity));
    this.capacity = capacity;
  }

  // A slot for a new particle: the lowest free one. When there is none, an
  // emitter that keeps to a limit gets nothing and the others get room.
  alloc(limited) {
    const used = this.used;
    let index = this.next;
    while (index < this.size && used[index]) index++;
    if (index >= this.size) {
      this.next = index;
      if (limited) return -1;
      this.size += 10;
      this.reserve(this.size);
    }
    this.used[index] = 1;
    this.next = index + 1;
    if (index >= this.high) this.high = index + 1;
    this.alive++;
    this.color.fill(255, index * 4, index * 4 + 4);
    this.spin[index * 2] = this.spin[index * 2 + 1] = 0;
    this.facing[index] = 0;
    return index;
  }

  free(index) {
    if (!this.used[index]) return;
    this.used[index] = 0;
    this.alive--;
    if (index < this.next) this.next = index;
  }

  // Frees the slots of the particles whose life is over at `now`, in
  // milliseconds. True if none is left.
  recycle(now) {
    const { data, used } = this;
    let high = 0;
    for (let index = 0, at = 0; index < this.high; index++, at += STRIDE) {
      if (!used[index]) continue;
      if (data[at + LIFE] * 1000 >= INFINITE) {
        // `Emitter.InfiniteLife`: its life is put off for as long as it
        // lasts, without moving it.
        while (Math.round(data[at + T] * 1000) + EXTEND <= now) extend(data, at, now / 1000, INFINITE / 3000);
        high = index + 1;
      } else if (Math.round((data[at + T] + data[at + LIFE]) * 1000) <= now) this.free(index);
      else high = index + 1;
    }
    this.high = high;
    return this.alive === 0;
  }

  clear() {
    this.used.fill(0);
    this.size = this.next = this.high = this.alive = 0;
    this.colorOwner = this.spinOwner = null;
  }
}

// Where a particle is at `age` seconds, along one axis: `at` is its row's
// offset plus `X` or `Y`.
export const position = (data, at, age) => data[at] + data[at + 2] * age + 0.5 * data[at + 4] * age * age;
export const velocity = (data, at, age) => data[at + 2] + data[at + 4] * age;

// Qt's `setInstantaneous…`: the row is rewritten so that the particle is
// where it was at this instant and has, from now on, the given acceleration,
// velocity or position.
export function accelerate(data, at, age, value) {
  const speed = velocity(data, at, age);
  const place = position(data, at, age);
  data[at + 2] = speed - age * value;
  data[at + 4] = value;
  data[at] = place - age * data[at + 2] - 0.5 * age * age * value;
}

export function propel(data, at, age, value) {
  const place = position(data, at, age);
  const acceleration = data[at + 4];
  data[at + 2] = value - age * acceleration;
  data[at] = place - age * data[at + 2] - 0.5 * age * age * acceleration;
}

export function move(data, at, age, value) {
  data[at] = value - age * data[at + 2] - 0.5 * age * age * data[at + 4];
}

// Emitted `seconds` later than it was, and still where it is and as fast.
function extend(data, at, time, seconds) {
  const age = time - data[at + T];
  const x = position(data, at + X, age);
  const y = position(data, at + Y, age);
  const vx = velocity(data, at + X, age);
  const vy = velocity(data, at + Y, age);
  data[at + T] += seconds;
  const elapsed = age - seconds;
  data[at + VX] = vx - elapsed * data[at + AX];
  data[at + VY] = vy - elapsed * data[at + AY];
  data[at + X] = x - elapsed * data[at + VX] - 0.5 * elapsed * elapsed * data[at + AX];
  data[at + Y] = y - elapsed * data[at + VY] - 0.5 * elapsed * elapsed * data[at + AY];
}

// What a system keeps apart from its properties, for the frame to read
// without asking a signal: the time, the groups, and who takes part.
class Simulation {
  constructor(system) {
    this.system = system;
    // Milliseconds since the system started, and the same in whole ones:
    // Qt's particles are timed in those.
    this.time = 0;
    this.now = 0;
    this.groups = [];
    this.named = new Map();
    this.emitters = [];
    this.affectors = [];
    this.painters = [];
    this.random = generator();
    this.serial = 0;
    this.empty = true;
    this.running = false;
    this.paused = false;
    // Whether it is on the clock.
    this.awake = false;
    // What repaints once when nothing is moving: a picture arrived, the
    // system was stopped.
    this.still = { advance: () => (clock.remove(this.still), this.paint()), idle: () => 0 };
    this.group("");
  }

  group(name) {
    let group = this.named.get(name);
    if (!group) {
      this.named.set(name, (group = new Group(name, this.groups.length)));
      this.groups.push(group);
    }
    return group;
  }

  join(list, member) {
    if (!list.includes(member)) list.push(member);
  }

  leave(list, member) {
    const index = list.indexOf(member);
    if (index >= 0) list.splice(index, 1);
  }

  // Qt's `emittersChanged`: a group has room for what its emitters can have
  // alive at once, and never less than it had.
  sizes() {
    for (const group of this.groups) {
      let size = 0;
      for (const emitter of this.emitters) if (emitter.$group === group) size += emitter.$count;
      if (size > group.size) {
        group.size = size;
        group.reserve(size);
      }
    }
  }

  // A slot for a new particle of `group`, or -1.
  alloc(group, limited) {
    const index = group.alloc(limited);
    if (index < 0) return -1;
    group.serial[index] = ++this.serial;
    this.empty = false;
    return index;
  }

  // The particle is emitted: its painters give it what they paint it with.
  emitted(group, index) {
    const painters = group.painters;
    for (let each = 0; each < painters.length; each++) painters[each].$load(group, index, this.random);
  }

  // The system has something to do.
  wake() {
    if (!this.running || this.paused || this.awake) return;
    clock.remove(this.still);
    this.awake = true;
    clock.add(this);
  }

  // Something that is painted changed while nothing moves.
  refresh() {
    if (!this.awake) clock.add(this.still);
  }

  // Back to no particles at time zero.
  reset() {
    this.time = this.now = 0;
    for (const group of this.groups) group.clear();
    this.sizes();
    for (const emitter of this.emitters) emitter.$restart();
    for (const painter of this.painters) painter.$reset?.();
    this.empty = true;
  }

  idle() {
    return 0;
  }

  advance(elapsed) {
    this.time += elapsed;
    const before = this.now;
    const now = (this.now = Math.floor(this.time));
    const { groups, emitters, affectors } = this;
    const was = this.empty;
    let empty = true;
    for (let index = 0; index < groups.length; index++) empty = groups[index].recycle(now) && empty;
    this.empty = empty;
    let emitting = false;
    for (let index = 0; index < emitters.length; index++) emitting = emitters[index].$emit(this, now) || emitting;
    const seconds = (now - before) / 1000;
    for (let index = 0; index < affectors.length; index++) affectors[index].$affect(this, seconds);
    this.paint();
    if (this.empty !== was) slot(this.system, "empty").write(this.empty);
    // Nothing alive and nothing to come: asleep until an emitter wakes it.
    if (this.empty && !emitting) this.sleep();
  }

  sleep() {
    this.awake = false;
    clock.remove(this);
  }

  paint() {
    const painters = this.painters;
    for (let index = 0; index < painters.length; index++) painters[index].$paint(this);
  }
}

// The system an emitter, a painter or an affector belongs to when it is not
// told: the one it was declared in.
export const found = derived((self) => (self.parent?.$sim ? self.parent : undefined));

// Whether two of what a `compute` returns say the same: values, or lists of
// them.
function same(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return Object.is(a, b);
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index++) if (!same(a[index], b[index])) return false;
  return true;
}

// Keeps `self` among its system's emitters, painters or affectors (`kind`),
// whichever system that is at the time. `compute` reads what the frame needs
// of the object's properties, and `apply(sim, state, old)` keeps it where
// the frame finds it without asking: `self.$in` is the system's simulation.
export function belongs(self, kind, compute, apply) {
  self.$in = null;
  let last;
  effect(
    () => [self.system, compute()],
    ([system, state]) => {
      const sim = system?.$sim ?? null;
      const old = self.$in;
      // Asked again for what it already has: a property that was never
      // written is read as the whole object, so any other one wakes this.
      if (sim === old && same(state, last)) return;
      last = state;
      if (sim !== old) {
        old?.leave(old[kind], self);
        self.$in = sim;
        sim?.join(sim[kind], self);
      }
      apply(sim, state, old);
    },
  );
  onCleanup(() => {
    const sim = self.$in;
    self.$in = null;
    if (sim) {
      sim.leave(sim[kind], self);
      apply(null, null, sim);
    }
  });
}

// Whether anybody listens to a signal: what only a handler would see is not
// made otherwise.
export const heard = (self, name, handler) => handler in self.$props || name in self.$signals;

// What `groups: ["a", "b"]` names, which may be written as one name.
export const names = (groups) => (groups == null ? [] : Array.isArray(groups) ? groups : [groups]);

export const ParticleSystem = defineType("ParticleSystem", Item, {
  properties: { running: true, paused: false, empty: true },
  methods: {
    start() {
      this.running = true;
    },
    stop() {
      this.running = false;
    },
    restart() {
      this.running = false;
      this.running = true;
    },
    pause() {
      this.paused = true;
    },
    resume() {
      this.paused = false;
    },
    reset() {
      const sim = this.$sim;
      sim.reset();
      slot(this, "empty").set(true);
      sim.refresh();
      sim.wake();
    },
    // Not Qt's: starts the system's random numbers from a known place, so
    // that a test sees the same particles every time.
    $seed(value) {
      this.$sim.random.seed(value);
    },
  },
  setup(self) {
    const sim = (self.$sim = new Simulation(self));
    let first = true;
    effect(
      () => [Boolean(self.running), Boolean(self.paused)],
      ([running, paused]) => {
        if (running !== sim.running) {
          sim.running = running;
          // A system that is started or stopped starts from nothing, and, as
          // in Qt, is no longer paused.
          const held = slot(self, "paused");
          if (!first && paused && !held.bound) {
            held.write(false);
            paused = false;
          }
          sim.reset();
          slot(self, "empty").write(true);
          sim.refresh();
        }
        first = false;
        sim.paused = paused;
        if (running && !paused) sim.wake();
        else sim.sleep();
      },
    );
    onCleanup(() => {
      clock.remove(sim);
      clock.remove(sim.still);
    });
  },
});

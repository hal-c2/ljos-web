// Affectors: what changes the course of particles that are already under
// way. Each is an item; with a size it affects the particles inside it, and
// without one all of them.
//
// A particle's course is a formula, so an affector acts in steps: every
// frame, and within a long frame every 20 ms as Qt does, it rewrites the
// particle's row so that it goes on from where it is with another velocity
// or acceleration.
import { sourced } from "../../guard.js";
import { defineType, derived, effect } from "../../object.js";
import { Item } from "../Item.js";
import { between } from "./geometry.js";
import { Particle } from "./particle.js";
import { generator } from "./random.js";
import { contains } from "./shapes.js";
import {
  accelerate,
  AX,
  AY,
  belongs,
  END,
  found,
  heard,
  LIFE,
  move,
  names,
  position,
  propel,
  SIZE,
  STRIDE,
  T,
  velocity,
  X,
  Y,
} from "./system.js";

// Qt's `simulationDelta` and `simulationCutoff`, in seconds.
const STEP = 0.02;
const CUTOFF = 1;
const RADIANS = Math.PI / 180;
const MAP = new Float64Array(6);
const VECTOR = { x: 0, y: 0 };
const NONE = Object.freeze([]);

const alive = (data, at, time) => data[at + T] + data[at + LIFE] - 0.001 > time;

// How big a particle is at `time`: between its two sizes.
function sized(data, at, time) {
  const life = data[at + LIFE];
  return life ? data[at + SIZE] + (data[at + END] - data[at + SIZE]) * ((time - data[at + T]) / life) : 0;
}

// Whether the particle overlaps one of the groups named, each particle
// taken as the square it is painted in.
function colliding(sim, others, data, at, time) {
  const age = time - data[at + T];
  const x = position(data, at + X, age);
  const y = position(data, at + Y, age);
  const half = sized(data, at, time) / 2;
  for (let each = 0; each < others.length; each++) {
    const other = sim.named.get(others[each]);
    if (!other) continue;
    const { data: rows, used } = other;
    for (let index = 0, row = 0; index < other.high; index++, row += STRIDE) {
      if (!used[index] || !alive(rows, row, time)) continue;
      const since = time - rows[row + T];
      const reach = half + sized(rows, row, time) / 2;
      if (Math.abs(position(rows, row + X, since) - x) < reach && Math.abs(position(rows, row + Y, since) - y) < reach) return true;
    }
  }
  return false;
}

// Which particles of a group an affector with `once` has affected already:
// the number of the emission in each slot.
function marks(self, group) {
  let seen = self.$marks.get(group);
  if (!seen || seen.length < group.capacity) {
    const grown = new Uint32Array(group.capacity);
    if (seen) grown.set(seen);
    self.$marks.set(group, (seen = grown));
  }
  return seen;
}

export const ParticleAffector = defineType("ParticleAffector", Item, {
  properties: {
    system: found,
    groups: NONE,
    whenCollidingWith: NONE,
    // Its own, as in Qt: not what the items around it say.
    enabled: true,
    once: false,
    shape: undefined,
  },
  signals: ["affected"],
  methods: {
    // Reads what the frame needs of the type's own properties. False if
    // there is nothing for it to do.
    $prepare() {
      return true;
    },
    // Changes the course of the particle whose row is at `at`, over `dt`
    // seconds that end at `now`. True if it did.
    $particle() {
      return true;
    },
    // The particle was affected.
    $after(group, index, time) {
      if (this.$once) marks(this, group)[index] = group.serial[index];
      if (!heard(this, "affected", "onAffected")) return;
      const data = group.data;
      const at = index * STRIDE;
      const age = time - data[at + T];
      this.affected(position(data, at + X, age), position(data, at + Y, age));
    },
    // A particle it affects: over the time since the last frame, in steps.
    $chosen(sim, group, index, seconds, time) {
      const at = index * STRIDE;
      let affected = false;
      let left = seconds;
      if (left < CUTOFF) {
        let now = time - left;
        while (left > STEP) {
          now += STEP;
          const data = group.data;
          // Only for the part of the time it was alive in.
          if (data[at + T] <= now && alive(data, at, now)) affected = this.$particle(sim, group, at, STEP, now) || affected;
          left -= STEP;
        }
      }
      if (left > 0) affected = this.$particle(sim, group, at, left, time) || affected;
      if (affected) this.$after(group, index, time);
    },
    $affect(sim, seconds) {
      if (!this.$enabled || this.$prepare(sim) === false) return;
      const once = this.$once;
      // Once is all at once: a second's worth.
      if (once) seconds = 1;
      const width = this.width;
      const height = this.height;
      const everywhere = width === 0 || height === 0;
      // Where the affector is in the system, which the particles are in.
      const mapped = between(this, sim.system, MAP);
      const left = (this.$left = mapped ? MAP[4] : 0);
      const top = (this.$top = mapped ? MAP[5] : 0);
      const shape = this.$shape;
      const wanted = this.$names;
      const others = this.$others;
      const time = sim.now / 1000;
      const groups = sim.groups;
      for (let each = 0; each < groups.length; each++) {
        const group = groups[each];
        if (wanted.length && !wanted.includes(group.name)) continue;
        const seen = once ? marks(this, group) : null;
        for (let index = 0, at = 0; index < group.high; index++, at += STRIDE) {
          if (!group.used[index]) continue;
          const data = group.data;
          if (!alive(data, at, time) || (once && seen[index] === group.serial[index])) continue;
          if (!everywhere) {
            const age = time - data[at + T];
            if (!contains(shape, left, top, width, height, position(data, at + X, age), position(data, at + Y, age))) continue;
          }
          if (others.length && !colliding(sim, others, data, at, time)) continue;
          this.$chosen(sim, group, index, seconds, time);
        }
      }
    },
  },
  setup(self) {
    self.$enabled = false;
    self.$once = false;
    self.$shape = null;
    self.$names = self.$others = NONE;
    self.$left = self.$top = 0;
    self.$marks = new Map();
    belongs(
      self,
      "affectors",
      () => [
        Boolean(self.enabled),
        Boolean(self.once),
        self.shape,
        names(self.groups).map(String),
        names(self.whenCollidingWith).map(String),
      ],
      (sim, state) => {
        if (!state) return;
        self.$enabled = state[0];
        self.$once = state[1];
        self.$shape = state[2] ?? null;
        self.$names = state[3];
        self.$others = state[4];
      },
    );
  },
});

// Sets how long the particles have left to live, by saying they were emitted
// at another time. They go on from where they are, unless `advancePosition`
// (the default) moves them to where they would have been by then.
export const Age = defineType("Age", ParticleAffector, {
  properties: { lifeLeft: 0, advancePosition: true },
  methods: {
    $prepare() {
      this.$remaining = this.lifeLeft / 1000;
      this.$advance = Boolean(this.advancePosition);
      return true;
    },
    $particle(sim, group, at, dt, now) {
      const data = group.data;
      if (!alive(data, at, now)) return false;
      const remaining = this.$remaining;
      const emitted = now - (data[at + LIFE] - remaining);
      if (this.$advance || remaining <= 0) {
        data[at + T] = emitted;
        return true;
      }
      const age = now - data[at + T];
      const x = position(data, at + X, age);
      const y = position(data, at + Y, age);
      const vx = velocity(data, at + X, age);
      const vy = velocity(data, at + Y, age);
      data[at + T] = emitted;
      const aged = now - emitted;
      move(data, at + X, aged, x);
      move(data, at + Y, aged, y);
      propel(data, at + X, aged, vx);
      propel(data, at + Y, aged, vy);
      return true;
    },
  },
});

// An acceleration of every particle, in one direction.
export const Gravity = defineType("Gravity", ParticleAffector, {
  properties: {
    // Qt's defaults, odd as they are. `acceleration` is the name the
    // magnitude had before.
    magnitude: derived((self) => self.acceleration),
    acceleration: -10,
    angle: 90,
  },
  methods: {
    $prepare() {
      const magnitude = this.magnitude;
      const angle = this.angle * RADIANS;
      this.$dx = magnitude * Math.cos(angle);
      this.$dy = magnitude * Math.sin(angle);
      return Boolean(magnitude);
    },
    $particle(sim, group, at, dt, now) {
      const data = group.data;
      const age = now - data[at + T];
      propel(data, at + X, age, velocity(data, at + X, age) + this.$dx * dt);
      propel(data, at + Y, age, velocity(data, at + Y, age) + this.$dy * dt);
      return true;
    },
  },
});

const sign = (value) => (value >= 0 ? 1 : -1);
const EPSILON = 0.00001;

// Slows particles down in proportion to their speed, down to `threshold`.
export const Friction = defineType("Friction", ParticleAffector, {
  properties: { factor: 0, threshold: 0 },
  methods: {
    $prepare() {
      this.$factor = this.factor;
      this.$threshold = this.threshold;
      return Boolean(this.$factor);
    },
    $particle(sim, group, at, dt, now) {
      const data = group.data;
      const age = now - data[at + T];
      const vx = velocity(data, at + X, age);
      const vy = velocity(data, at + Y, age);
      if (!vx && !vy) return false;
      const threshold = this.$threshold;
      let slowedX = vx - vx * this.$factor * dt;
      let slowedY = vy - vy * this.$factor * dt;
      if (!threshold) {
        // Friction stops a particle; it does not send it back.
        if (sign(vx) !== sign(slowedX)) slowedX = 0;
        if (sign(vy) !== sign(slowedY)) slowedY = 0;
      } else {
        if (Math.hypot(vx, vy) <= threshold + EPSILON) return false;
        if (Math.hypot(slowedX, slowedY) <= threshold + EPSILON || sign(vx) !== sign(slowedX) || sign(vy) !== sign(slowedY)) {
          const theta = Math.atan2(vy, vx);
          slowedX = threshold * Math.cos(theta);
          slowedY = threshold * Math.sin(theta);
        }
      }
      propel(data, at + X, age, slowedX);
      propel(data, at + Y, age, slowedY);
      return true;
    },
  },
});

const POSITION = 0;
const VELOCITY = 1;
const ACCELERATION = 2;
const PARAMETERS = { Position: POSITION, Velocity: VELOCITY, Acceleration: ACCELERATION };

const CONSTANT = 0;
const LINEAR = 1;
const QUADRATIC = 2;
const INVERSE_LINEAR = 3;
const INVERSE_QUADRATIC = 4;

// Pulls particles towards a point of the affector.
export const Attractor = defineType("Attractor", ParticleAffector, {
  properties: {
    pointX: 0,
    pointY: 0,
    strength: 0,
    affectedParameter: VELOCITY,
    proportionalToDistance: LINEAR,
  },
  enums: {
    ...PARAMETERS,
    Constant: CONSTANT,
    Linear: LINEAR,
    Quadratic: QUADRATIC,
    InverseLinear: INVERSE_LINEAR,
    InverseQuadratic: INVERSE_QUADRATIC,
  },
  methods: {
    $prepare() {
      this.$x = this.pointX;
      this.$y = this.pointY;
      this.$strength = this.strength;
      this.$parameter = this.affectedParameter;
      this.$proportion = this.proportionalToDistance;
      return this.$strength !== 0;
    },
    $particle(sim, group, at, dt, now) {
      const data = group.data;
      const age = now - data[at + T];
      const dx = this.$x + this.$left - position(data, at + X, age);
      const dy = this.$y + this.$top - position(data, at + Y, age);
      const distance = Math.hypot(dx, dy);
      const theta = Math.atan2(dy, dx);
      const strength = this.$strength;
      const proportion = this.$proportion;
      const pull =
        dt *
        (proportion === INVERSE_QUADRATIC
          ? strength / Math.max(1, distance * distance)
          : proportion === INVERSE_LINEAR
            ? strength / Math.max(1, distance)
            : proportion === QUADRATIC
              ? strength * Math.max(1, distance * distance)
              : proportion === LINEAR
                ? strength * Math.max(1, distance)
                : strength);
      const pullX = pull * Math.cos(theta);
      const pullY = pull * Math.sin(theta);
      const parameter = this.$parameter;
      if (parameter === POSITION) {
        data[at + X] += pullX;
        data[at + Y] += pullY;
      } else if (parameter === ACCELERATION) {
        accelerate(data, at + X, age, data[at + AX] + pullX);
        accelerate(data, at + Y, age, data[at + AY] + pullY);
      } else {
        propel(data, at + X, age, velocity(data, at + X, age) + pullX);
        propel(data, at + Y, age, velocity(data, at + Y, age) + pullY);
      }
      return true;
    },
  },
});

// Pushes particles about at random, as far as the variances allow.
export const Wander = defineType("Wander", ParticleAffector, {
  properties: { pace: 0, xVariance: 0, yVariance: 0, affectedParameter: VELOCITY },
  enums: PARAMETERS,
  methods: {
    $prepare() {
      this.$pace = this.pace;
      this.$wide = this.xVariance;
      this.$tall = this.yVariance;
      this.$parameter = this.affectedParameter;
      return true;
    },
    $particle(sim, group, at, dt, now) {
      const data = group.data;
      const age = now - data[at + T];
      const dx = dt * this.$pace * (2 * sim.random() - 1);
      const dy = dt * this.$pace * (2 * sim.random() - 1);
      const wide = this.$wide;
      const tall = this.$tall;
      const parameter = this.$parameter;
      if (parameter === POSITION) {
        if (wide > Math.abs(position(data, at + X, age) + dx)) data[at + X] += dx;
        if (tall > Math.abs(position(data, at + Y, age) + dy)) data[at + Y] += dy;
      } else if (parameter === ACCELERATION) {
        if (wide > Math.abs(data[at + AX] + dx)) accelerate(data, at + X, age, data[at + AX] + dx);
        if (tall > Math.abs(data[at + AY] + dy)) accelerate(data, at + Y, age, data[at + AY] + dy);
      } else {
        const vx = velocity(data, at + X, age) + dx;
        const vy = velocity(data, at + Y, age) + dy;
        if (wide > Math.abs(vx)) propel(data, at + X, age, vx);
        if (tall > Math.abs(vy)) propel(data, at + Y, age, vy);
      }
      return true;
    },
  },
});

let scratch;

// The greys of an image stretched over a square of `size` pixels, a column
// after another; null if it cannot be read.
function greys(image, size) {
  scratch ??= document.createElement("canvas");
  scratch.width = scratch.height = size;
  const context = scratch.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, size, size);
  let pixels;
  try {
    pixels = context.getImageData(0, 0, size, size).data;
  } catch {
    return null;
  }
  const field = new Float32Array(size * size);
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      const at = (y * size + x) * 4;
      // Qt's qGray.
      field[x * size + y] = (pixels[at] * 11 + pixels[at + 1] * 16 + pixels[at + 2] * 5) >> 5;
    }
  }
  return field;
}

// Without an image: smooth noise, the same every time. Qt has a picture of
// noise for this, which is not ours to ship.
function noise(size) {
  const random = generator(0x7075);
  const field = new Float32Array(size * size);
  for (let cells = 4, weight = 0.5; cells <= 32 && cells < size; cells *= 2, weight /= 2) {
    const side = cells + 1;
    const lattice = new Float32Array(side * side);
    for (let index = 0; index < lattice.length; index++) lattice[index] = random();
    for (let x = 0; x < size; x++) {
      const u = (x / size) * cells;
      const column = Math.floor(u);
      const s = (u - column) * (u - column) * (3 - 2 * (u - column));
      for (let y = 0; y < size; y++) {
        const v = (y / size) * cells;
        const row = Math.floor(v);
        const t = (v - row) * (v - row) * (3 - 2 * (v - row));
        const a = lattice[column * side + row];
        const b = lattice[(column + 1) * side + row];
        const c = lattice[column * side + row + 1];
        const d = lattice[(column + 1) * side + row + 1];
        field[x * size + y] += weight * 255 * (a + (b - a) * s + (c - a) * t + (a - b - c + d) * s * t);
      }
    }
  }
  return field;
}

// Pushes particles along the slopes of a field of noise as big as the
// affector.
export const Turbulence = defineType("Turbulence", ParticleAffector, {
  properties: { strength: 10, noiseSource: "" },
  methods: {
    $prepare() {
      const size = Math.trunc(Math.max(this.width, this.height));
      if (size !== this.$size) {
        this.$size = size;
        this.$field = size > 0 ? ((this.$image && greys(this.$image, size)) ?? noise(size)) : null;
      }
      this.$strength = this.strength;
      return size > 0;
    },
    $affect(sim, seconds) {
      this.$elapsed = seconds;
      ParticleAffector.proto.$affect.call(this, sim, seconds);
    },
    // The push is what the frame's time makes it, in one step.
    $chosen(sim, group, index, seconds, time) {
      const data = group.data;
      const at = index * STRIDE;
      const age = time - data[at + T];
      const size = this.$size;
      const x = Math.round(position(data, at + X, age) - this.$left);
      const y = Math.round(position(data, at + Y, age) - this.$top);
      if (x <= 0 || y <= 0 || x >= size - 1 || y >= size - 1) return;
      const field = this.$field;
      const here = field[x * size + y];
      const fx = (field[(x - 1) * size + y] - here) * this.$strength;
      const fy = (here - field[x * size + y - 1]) * this.$strength;
      if (!fx && !fy) return;
      const dt = this.$elapsed;
      propel(data, at + X, age, velocity(data, at + X, age) + fx * dt);
      propel(data, at + Y, age, velocity(data, at + Y, age) + fy * dt);
      this.$after(group, index, time);
    },
  },
  setup(self) {
    self.$size = -1;
    self.$field = null;
    self.$image = self.$loading = null;
    self.$from = undefined;
    self.$elapsed = 0;
    effect(
      () => self.noiseSource,
      (source) => {
        // Asked again whenever any of its properties is written.
        if (source === self.$from) return;
        self.$from = source;
        self.$image = self.$loading = null;
        self.$size = -1;
        if (!source) return;
        const image = (self.$loading = new Image());
        image.onload = () => {
          if (self.$loading !== image) return;
          self.$image = image;
          self.$size = -1;
        };
        sourced(image, String(source));
      },
    );
  },
});

// Adds to (or, without `relative`, sets) the position, velocity or
// acceleration of the particles, or hands them to a handler to do anything.
export const Affector = defineType("Affector", ParticleAffector, {
  properties: { position: undefined, velocity: undefined, acceleration: undefined, relative: true },
  signals: ["affectParticles"],
  methods: {
    $prepare() {
      this.$position = this.position ?? null;
      this.$velocity = this.velocity ?? null;
      this.$acceleration = this.acceleration ?? null;
      this.$relative = Boolean(this.relative);
      this.$handled = heard(this, "affectParticles", "onAffectParticles");
      // With nothing to do to them, it only says which particles are here.
      this.$telling =
        !this.$handled && !this.$position && !this.$velocity && !this.$acceleration && heard(this, "affected", "onAffected");
      return true;
    },
    $particle(sim, group, at, dt, now) {
      const data = group.data;
      const age = now - data[at + T];
      const x = position(data, at + X, age);
      const y = position(data, at + Y, age);
      const relative = this.$relative;
      const random = sim.random;
      let changed = false;
      if (this.$acceleration) {
        this.$acceleration.$sample(x, y, random, VECTOR);
        const ax = data[at + AX];
        const ay = data[at + AY];
        const toX = relative ? VECTOR.x * dt + ax : VECTOR.x;
        const toY = relative ? VECTOR.y * dt + ay : VECTOR.y;
        if (toX !== ax || toY !== ay) {
          accelerate(data, at + X, age, toX);
          accelerate(data, at + Y, age, toY);
          changed = true;
        }
      }
      if (this.$velocity) {
        this.$velocity.$sample(x, y, random, VECTOR);
        const vx = velocity(data, at + X, age);
        const vy = velocity(data, at + Y, age);
        const toX = relative ? VECTOR.x * dt + vx : VECTOR.x;
        const toY = relative ? VECTOR.y * dt + vy : VECTOR.y;
        if (toX !== vx || toY !== vy) {
          propel(data, at + X, age, toX);
          propel(data, at + Y, age, toY);
          changed = true;
        }
      }
      if (this.$position) {
        this.$position.$sample(x, y, random, VECTOR);
        const toX = relative ? VECTOR.x * dt + x : VECTOR.x;
        const toY = relative ? VECTOR.y * dt + y : VECTOR.y;
        if (toX !== x || toY !== y) {
          move(data, at + X, age, toX);
          move(data, at + Y, age, toY);
          changed = true;
        }
      }
      return changed;
    },
    $chosen(sim, group, index, seconds, time) {
      if (this.$handled) this.$picked.push(new Particle(sim, group, index));
      else if (this.$telling) this.$after(group, index, time);
      else ParticleAffector.proto.$chosen.call(this, sim, group, index, seconds, time);
    },
    // A step for the handler: the properties' doing first, then its own.
    $step(sim, dt) {
      const picked = this.$picked;
      for (const particle of picked) {
        if (this.$particle(sim, particle.$group, particle.$index * STRIDE, dt, sim.now / 1000)) particle.update = true;
      }
      this.affectParticles(picked, dt);
    },
    $affect(sim, seconds) {
      const picked = (this.$picked = []);
      ParticleAffector.proto.$affect.call(this, sim, seconds);
      if (!picked.length) return;
      let left = this.$once ? 1 : seconds;
      if (left >= CUTOFF || left <= STEP) this.$step(sim, left);
      else {
        // The handler reads the particles at the time of each step.
        const now = sim.now;
        sim.now = Math.trunc(now - left * 1000);
        while (left > STEP) {
          sim.now += STEP * 1000;
          left -= STEP;
          this.$step(sim, STEP);
        }
        sim.now = now;
        if (left > 0) this.$step(sim, left);
      }
      // What the handler says it changed counts as affected.
      for (const particle of picked) if (particle.update) this.$after(particle.$group, particle.$index, sim.now / 1000);
    },
  },
  setup(self) {
    self.$picked = NONE;
  },
});

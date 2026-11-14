// What bends a particle's way once it is under way. An affector says what
// it does to a particle of a given age; nothing is carried from one moment
// to the next, so a system shows the same at a time however it came to it.
//
// The sums are Qt's, found by asking Qt 6.11 where a particle is at a time
// with each affector alone.
//
// Not here: a ScaleAffector3D's `easingCurve`, which is kept and does
// nothing, and an Attractor3D's `useCachedPositions` and `positionsAmount`,
// there being nothing to cache: a particle's place in the shape is its own
// whenever it is asked for.
import { defineType, derived, group } from "../../object.ts";
import * as math from "../math.js";
import { Node } from "../Node.js";
import { ATTRACT, enrol, list, random, seenFrom, spread, three, vectors, WANDER, within } from "./core.js";

// `particles` names the kinds of particle an affector is for; none named,
// it is for all of the system's.
export const Affector3D = defineType("Affector3D", Node, {
  properties: {
    system: derived(within),
    particles: undefined,
    enabled: true,
  },
  methods: {
    // What it does to one particle: `(datum, current, seconds)`, where
    // `current` is the particle as it is so far at that age. Null when it
    // does nothing.
    $prepare() {
      return null;
    },
    $affects(particle) {
      const named = list(this.particles);
      return named.length === 0 || named.includes(particle);
    },
  },
  setup(self) {
    self.$affector = true;
    enrol(self);
  },
});

// Falls as far as anything falls in the time: half the pull times the time
// squared, the way `direction` points.
export const Gravity3D = defineType("Gravity3D", Affector3D, {
  properties: {
    magnitude: 100,
    direction: group({ x: 0, y: -1, z: 0 }),
  },
  methods: {
    $prepare() {
      const [x, y, z] = math.normalized(three(this.direction));
      const half = 0.5 * this.magnitude;
      return (datum, current, seconds) => {
        const far = half * seconds * seconds;
        current.x += x * far;
        current.y += y * far;
        current.z += z * far;
      };
    },
  },
  setup: vectors(["direction"]),
});

// Goes round a point, `magnitude` degrees a second about the line
// `direction` gives.
export const PointRotator3D = defineType("PointRotator3D", Affector3D, {
  properties: {
    magnitude: 10,
    direction: group({ x: 0, y: 1, z: 0 }),
    pivotPoint: group({ x: 0, y: 0, z: 0 }),
  },
  methods: {
    $prepare() {
      const axis = math.normalized(three(this.direction));
      const pivot = three(this.pivotPoint);
      const { magnitude } = this;
      return (datum, current, seconds) => {
        const turn = math.rotation(math.fromAxis(axis[0], axis[1], axis[2], seconds * magnitude));
        const [x, y, z] = math.point(turn, current.x - pivot[0], current.y - pivot[1], current.z - pivot[2]);
        current.x = x + pivot[0];
        current.y = y + pivot[1];
        current.z = z + pivot[2];
      };
    },
  },
  setup: vectors(["direction", "pivotPoint"]),
});

const TURN = 2 * Math.PI;

// Sways: all particles together (`global…`), and each its own way
// (`unique…`), so far along each axis and so many times a second. Eased in
// and out at a particle's beginning and end when it is given the time to.
export const Wander3D = defineType("Wander3D", Affector3D, {
  properties: {
    globalAmount: group({ x: 0, y: 0, z: 0 }),
    globalPace: group({ x: 0, y: 0, z: 0 }),
    globalPaceStart: group({ x: 0, y: 0, z: 0 }),
    uniqueAmount: group({ x: 0, y: 0, z: 0 }),
    uniquePace: group({ x: 0, y: 0, z: 0 }),
    uniqueAmountVariation: 0,
    uniquePaceVariation: 0,
    fadeInDuration: 0,
    fadeOutDuration: 0,
  },
  methods: {
    $prepare(system) {
      const amount = three(this.globalAmount);
      const pace = three(this.globalPace);
      const start = three(this.globalPaceStart);
      const ownAmount = three(this.uniqueAmount);
      const ownPace = three(this.uniquePace);
      const { uniqueAmountVariation, uniquePaceVariation, fadeInDuration, fadeOutDuration } = this;
      const seed = system.$seed();
      const AXES = ["x", "y", "z"];
      return (datum, current, seconds) => {
        let smooth = 1;
        if (fadeInDuration > 0) smooth = Math.min(1, (seconds * 1000) / fadeInDuration);
        if (fadeOutDuration > 0) smooth = Math.min(smooth, (datum.life - seconds * 1000) / fadeOutDuration);
        for (let axis = 0; axis < 3; axis++) {
          if (amount[axis] !== 0 && pace[axis] !== 0) current[AXES[axis]] += smooth * Math.sin(start[axis] + seconds * TURN * pace[axis]) * amount[axis];
          if (ownAmount[axis] !== 0 && ownPace[axis] !== 0) {
            const faster = 1 + uniquePaceVariation * spread(seed, datum.index, WANDER + axis);
            const further = 1 + uniqueAmountVariation * spread(seed, datum.index, WANDER + 3 + axis);
            const from = random(seed, datum.index, WANDER + 6) * TURN;
            current[AXES[axis]] += smooth * Math.sin(from + faster * seconds * TURN * ownPace[axis]) * further * ownAmount[axis];
          }
        }
      };
    },
  },
  setup: vectors(["globalAmount", "globalPace", "globalPaceStart", "uniqueAmount", "uniquePace"]),
});

// Draws a particle to where the attractor is, or to a place in its `shape`:
// there after `duration`, which is the particle's life when none is given.
export const Attractor3D = defineType("Attractor3D", Affector3D, {
  properties: {
    positionVariation: group({ x: 0, y: 0, z: 0 }),
    shape: null,
    duration: -1,
    durationVariation: 0,
    hideAtEnd: false,
    useCachedPositions: true,
    positionsAmount: 0,
  },
  methods: {
    $prepare(system) {
      const placed = seenFrom(system, this);
      const variation = three(this.positionVariation);
      const { shape, duration, durationVariation, hideAtEnd } = this;
      const seed = system.$seed();
      return (datum, current, seconds) => {
        let whole = duration < 0 ? datum.life : duration;
        if (durationVariation) whole += durationVariation * spread(seed, datum.index, ATTRACT + 3);
        const done = whole > 0 ? Math.min(1, Math.max(0, (seconds * 1000) / whole)) : 1;
        if (hideAtEnd && done >= 1) {
          current.a = 0;
          return;
        }
        const inside = shape?.$position?.(seed, datum.index) ?? [0, 0, 0];
        const to = math.point(placed, inside[0], inside[1], inside[2]);
        for (let axis = 0; axis < 3; axis++) to[axis] += variation[axis] * spread(seed, datum.index, ATTRACT + axis);
        current.x += (to[0] - current.x) * done;
        current.y += (to[1] - current.y) * done;
        current.z += (to[2] - current.z) * done;
      };
    },
  },
  setup: vectors(["positionVariation"]),
});

const smoothstep = (value) => {
  const within = Math.min(1, Math.max(0, value));
  return within * within * (3 - 2 * within);
};

// Pushes a particle away from where the repeller is: by `strength` inside
// `radius`, by nothing beyond `outerRadius`, and smoothly less between.
export const Repeller3D = defineType("Repeller3D", Affector3D, {
  properties: {
    radius: 0,
    outerRadius: 50,
    strength: 50,
  },
  methods: {
    $prepare(system) {
      const at = seenFrom(system, this).slice(12, 15);
      const { radius, outerRadius, strength } = this;
      return (datum, current) => {
        const away = [current.x - at[0], current.y - at[1], current.z - at[2]];
        const far = Math.hypot(...away);
        if (far === 0) return;
        const push = (strength * smoothstep(outerRadius > radius ? 1 - (far - radius) / (outerRadius - radius) : far <= radius ? 1 : 0)) / far;
        current.x += away[0] * push;
        current.y += away[1] * push;
        current.z += away[2] * push;
      };
    },
  },
});

const Linear = 0;
const SewSaw = 1;
const SineWave = 2;
const AbsSineWave = 3;
const Step = 4;
const SmoothStep = 5;

// Makes a particle bigger and smaller between `minSize` and `maxSize`
// times its size, again every `duration`.
export const ScaleAffector3D = defineType("ScaleAffector3D", Affector3D, {
  properties: {
    minSize: 1,
    maxSize: 1,
    duration: 1000,
    type: Linear,
    easingCurve: undefined,
  },
  enums: { Linear, SewSaw, SineWave, AbsSineWave, Step, SmoothStep },
  methods: {
    $prepare() {
      const { minSize, maxSize, duration, type } = this;
      if (!(duration > 0)) return null;
      return (datum, current, seconds) => {
        const times = (seconds * 1000) / duration;
        const through = times - Math.floor(times);
        let share;
        if (type === SewSaw) share = 1 - Math.abs(1 - 2 * through);
        else if (type === SineWave) share = 0.5 + 0.5 * Math.sin(TURN * through);
        else if (type === AbsSineWave) share = Math.abs(Math.sin(TURN * through));
        else if (type === Step) share = through < 0.5 ? 0 : 1;
        else if (type === SmoothStep) share = smoothstep(through);
        else share = through;
        current.scale *= minSize + (maxSize - minSize) * share;
      };
    },
  },
});

// The animations of a property: from a value to a value over a time and along
// a curve, or on a spring, or at a velocity.
import { defineType, group } from "../../object.ts";
import { Animation } from "./Animation.js";
import { curve } from "./easing.js";
import { ActionJob, AnimatorJob, ContinuingJob, put, SmoothedJob, SpringJob } from "./jobs.js";
import { keyOf, Property, rgba } from "./property.js";

const NONE = Object.freeze([]);

const list = (value) => (value == null ? NONE : Array.isArray(value) ? value : [value]);

// What an animation animates, as Qt decides it. One that says where to
// (`to`) animates the properties it names, on its targets. One that does
// not is for a transition or a Behavior: of the changes being made it takes
// those to the properties it names, or of the type it is for when it names
// none, and animates each to where it was going.
function select(self, actions, modified, defaultTarget, from, to, typed, defaults) {
  const names = [];
  const properties = self.properties;
  if (properties) for (const name of properties.split(",")) names.push(keyOf(name.trim()));
  if (self.property) names.push(keyOf(self.property));
  const targets = [...list(self.targets)];
  if (self.target) targets.push(self.target);
  const exclude = list(self.exclude);
  const source = self.$source;
  if (source && !names.length && !targets.length && !exclude.length) {
    names.push(source.key);
    targets.push(source.object);
  }
  const byType = typed && !names.length;
  if (defaultTarget && !targets.length) targets.push(defaultTarget);
  if (!names.length && defaults) names.push(...defaults);
  const mine = [];
  if (to !== undefined) {
    for (const name of names) {
      for (const target of targets) {
        if (target == null) continue;
        const property = new Property(target, name);
        if (!property.valid) continue;
        // A change of the same property is this animation's to show.
        const change = actions.find((action) => action.property?.is(target, property.key));
        if (change) modified.push(change);
        mine.push({ property, from, to, shown: change?.shown ?? false, kind: 0, a: null, b: null });
      }
    }
  }
  if (mine.length) return mine;
  for (const action of actions) {
    const property = action.property;
    if (!property) continue;
    if (targets.length && !targets.includes(property.object)) continue;
    if (exclude.includes(property.object)) continue;
    if (!names.includes(property.key) && !(byType && typed(action.to))) continue;
    const end = to !== undefined ? to : action.to;
    mine.push({ property, from, to: end, shown: action.shown, kind: 0, a: null, b: null });
    modified.push(action);
    // What comes after this one in a sequence starts from where it ends.
    action.from = end;
  }
  return mine;
}

export const PropertyAction = defineType("PropertyAction", Animation, {
  properties: {
    target: undefined,
    targets: undefined,
    property: "",
    properties: "",
    exclude: undefined,
    value: undefined,
  },
  methods: {
    $make(actions, modified, reverse, defaultTarget) {
      const mine = select(this, actions, modified, defaultTarget, undefined, this.value, null, null);
      if (!mine.length) return new ActionJob(null);
      return new ActionJob(() => {
        for (const action of mine) put(action, action.to);
      });
    },
  },
});

export const PropertyAnimation = defineType("PropertyAnimation", Animation, {
  properties: {
    duration: 250,
    from: undefined,
    to: undefined,
    target: undefined,
    targets: undefined,
    property: "",
    properties: "",
    exclude: undefined,
    easing: group({
      type: 0,
      amplitude: 1,
      overshoot: 1.70158,
      period: 0.3,
      bezierCurve: undefined,
    }),
  },
  methods: {
    // With no property named, in a transition: the changes it is for.
    $typed: null,
    $defaults: null,
    $rotate() {
      return null;
    },
    $select(actions, modified, defaultTarget) {
      return select(this, actions, modified, defaultTarget, this.from, this.to, this.$typed, this.$defaults);
    },
    $curve() {
      const easing = this.easing;
      return curve(easing.type, easing.amplitude, easing.overshoot, easing.period, easing.bezierCurve);
    },
    $make(actions, modified, reverse, defaultTarget) {
      const duration = this.duration;
      const job = new AnimatorJob(Math.max(0, duration), this.$curve(), this.$select(actions, modified, defaultTarget));
      job.fromDefined = this.from !== undefined;
      job.mirrored = reverse;
      job.rotate = this.$rotate();
      // What it was made from, to tell when that has changed.
      job.said = [duration, this.from, this.to];
      return job;
    },
    $stale(job) {
      const said = job.said;
      return !said || said[0] !== this.duration || !Object.is(said[1], this.from) || !Object.is(said[2], this.to);
    },
  },
});

const number = (value) => typeof value === "number";
// A colour is a string or an object; so are other things, so it has to be
// one a colour can be made of.
const colour = (value) => typeof value !== "number" && rgba(value) !== null;

export const NumberAnimation = defineType("NumberAnimation", PropertyAnimation, {
  methods: { $typed: number },
});

export const ColorAnimation = defineType("ColorAnimation", PropertyAnimation, {
  methods: { $typed: colour },
});

// The way round, for each `direction`: where it ends up is the same angle,
// how it gets there is not.
export const ROTATIONS = [
  null,
  (from, to, progress) => {
    let diff = to - from;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    return from + diff * progress;
  },
  (from, to, progress) => {
    let diff = to - from;
    while (diff < 0) diff += 360;
    return from + diff * progress;
  },
  (from, to, progress) => {
    let diff = to - from;
    while (diff > 0) diff -= 360;
    return from + diff * progress;
  },
];

export const RotationAnimation = defineType("RotationAnimation", PropertyAnimation, {
  properties: { direction: 0 },
  enums: { Numerical: 0, Shortest: 1, Clockwise: 2, Counterclockwise: 3 },
  methods: {
    $defaults: ["rotation", "angle"],
    $rotate() {
      return ROTATIONS[this.direction] ?? null;
    },
  },
});

// The job of a property that is still moving goes on in the next run, so
// that it keeps its velocity; the others are made.
function continuing(self, mine, Job) {
  const active = self.$active ?? NONE;
  const used = [];
  const group = new ContinuingJob();
  for (const action of mine) {
    const { object, key } = action.property;
    let job = active.find((running) => running.action.property.is(object, key));
    const moving = job !== undefined;
    if (moving) job.action = action;
    else job = new Job(action);
    group.add(job);
    self.$tune(job, action);
    if (moving) job.retarget();
    used.push(job);
  }
  self.$active = used;
  return group;
}

export const SpringAnimation = defineType("SpringAnimation", NumberAnimation, {
  properties: {
    velocity: 0,
    spring: 0,
    damping: 0,
    epsilon: 0.01,
    modulus: 0,
    mass: 1,
  },
  methods: {
    $tune(job, action) {
      job.to = Number(action.to);
      job.maxVelocity = this.velocity;
      job.spring = this.spring;
      job.damping = Math.min(1, this.damping);
      job.epsilon = this.epsilon;
      job.modulus = this.modulus;
      job.mass = this.mass > 0 ? this.mass : 1;
      job.value = Number(action.from !== undefined ? action.from : action.property.get());
      job.length = -1;
      if (!(job.spring > 0) && job.maxVelocity !== 0) {
        let distance = Math.abs(job.value - job.to);
        if (job.modulus && distance > job.modulus / 2) distance = job.modulus - (distance % job.modulus);
        job.length = (distance * 1000) / job.maxVelocity;
      }
    },
    $make(actions, modified, reverse, defaultTarget) {
      return continuing(this, this.$select(actions, modified, defaultTarget), SpringJob);
    },
  },
});

export const SmoothedAnimation = defineType("SmoothedAnimation", NumberAnimation, {
  properties: {
    // No time is set: `velocity` decides it.
    duration: -1,
    velocity: 200,
    reversingMode: 0,
    maximumEasingTime: -1,
  },
  enums: { Eased: 0, Immediate: 1, Sync: 2 },
  methods: {
    $tune(job, action) {
      job.to = Number(action.to);
      job.velocity = this.velocity;
      job.userDuration = this.duration;
      job.maximumEasingTime = this.maximumEasingTime;
      job.reversingMode = this.reversingMode;
      job.initialVelocity = job.trackVelocity;
    },
    $make(actions, modified, reverse, defaultTarget) {
      return continuing(this, this.$select(actions, modified, defaultTarget), SmoothedJob);
    },
  },
});

// For AnchorChanges: the anchors change at once, and where that puts the
// item is what is animated.
export const AnchorAnimation = defineType("AnchorAnimation", Animation, {
  properties: {
    targets: undefined,
    duration: 250,
    easing: group({
      type: 0,
      amplitude: 1,
      overshoot: 1.70158,
      period: 0.3,
      bezierCurve: undefined,
    }),
  },
  methods: {
    $make(actions, modified, reverse) {
      const targets = list(this.targets);
      const mine = [];
      for (const action of actions) {
        if (action.event !== "anchors") continue;
        if (targets.length && !targets.includes(action.target)) continue;
        for (const moved of action.moved) {
          mine.push({ property: moved.property, from: undefined, to: moved.to, shown: true, kind: 0, a: null, b: null });
          modified.push(moved);
        }
      }
      const easing = this.easing;
      const ease = curve(easing.type, easing.amplitude, easing.overshoot, easing.period, easing.bezierCurve);
      const job = new AnimatorJob(Math.max(0, this.duration), ease, mine);
      job.mirrored = reverse;
      return job;
    },
  },
});

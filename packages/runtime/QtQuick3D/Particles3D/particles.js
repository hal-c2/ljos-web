// The kinds of particle: what one looks like, and how many of it there may
// be at once. A particle keeps what its emitters gave each one it emitted;
// where one is at a time, how big and what colour, is worked out from that
// and the time alone (`evaluate`), as Qt works it out.
//
// A ModelParticle3D draws a model for each, a SpriteParticle3D a picture
// that faces the eye or lies in the system's plane, a LineParticle3D a
// ribbon along the way each one came (`paint.js`).
//
// Not here: a sprite's `lights`, `castsReflections` and a particle's
// `hasTransparency` are kept and do nothing, and so is all of
// ModelBlendParticle3D, which draws nothing.
import { onCleanup } from "solid-js";
import { defineType, derived, effect, group, inside, instantiate, QtObject } from "../../object.js";
import { Quaternion, Vector3d, Vector4d } from "../../QtQml/values.js";
import { rgba } from "../../QtQuick/color.js";
import * as math from "../math.js";
import { kept, Object3D } from "../Node.js";
import { enrol, enrolled, three, vectors, within } from "./core.js";
import { untrack } from "#kernel";

const NOTHING = Object.freeze({});

const FadeNone = 0;
const FadeOpacity = 1;
const FadeScale = 2;
const AlignNone = 0;
const AlignTowardsTarget = 1;
const AlignTowardsStartVelocity = 2;
const SortNone = 0;
const SortNewest = 1;
const SortOldest = 2;
const SortDistance = 3;

const unit = (value) => Math.min(1, Math.max(0, value));

const variation = vectors(["colorVariation"], ["x", "y", "z", "w"], Vector4d);
const target = vectors(["alignTargetPosition"]);

// One turn after another: `a b` turns by `b` first.
const product = ([aw, ax, ay, az], [bw, bx, by, bz]) => [
  aw * bw - ax * bx - ay * by - az * bz,
  aw * bx + ax * bw + ay * bz - az * by,
  aw * by - ax * bz + ay * bw + az * bx,
  aw * bz + ax * by - ay * bx + az * bw,
];

// The turn that brings the z axis round to a direction by the shortest way:
// `QQuaternion::rotationTo`.
function towards([x, y, z]) {
  const length = Math.hypot(x, y, z);
  if (length === 0) return null;
  [x, y, z] = [x / length, y / length, z / length];
  const facing = z + 1;
  // Straight behind: half a turn, about any line across.
  if (facing < 1e-6) return [0, 0, 1, 0];
  const root = Math.sqrt(2 * facing);
  // The line the two are turned about is across both: z cross the way.
  const turn = [root / 2, -y / root, x / root, 0];
  const whole = Math.hypot(...turn);
  return turn.map((part) => part / whole);
}

// The turn that faces a particle away from a point: about the line across
// the way and the system's forward, by the angle between them.
function facing(way) {
  const [x, y, z] = math.normalized(way);
  if (x === 0 && y === 0 && z === 0) return null;
  let axis = [y, -x, 0];
  if (Math.hypot(...axis) === 0) axis = [0, 1, 0];
  return math.fromAxis(axis[0], axis[1], axis[2], (Math.acos(Math.min(1, Math.max(-1, -z))) * 180) / Math.PI);
}

// What a particle is so far at an age: where its start and its speed alone
// put it, how its turning has turned it, and nothing yet of size or colour
// but what the affectors make of them.
export function moved(datum, seconds, affecting, current) {
  current.x = datum.x + datum.vx * seconds;
  current.y = datum.y + datum.vy * seconds;
  current.z = datum.z + datum.vz * seconds;
  current.rx = datum.rx + datum.sx * seconds;
  current.ry = datum.ry + datum.sy * seconds;
  current.rz = datum.rz + datum.sz * seconds;
  current.scale = 1;
  current.a = 1;
  for (const affect of affecting) affect(datum, current, seconds);
  return current;
}

// What looks at a kind's particles at `now`: given what an emitter gave one
// and its place in the table, where it is then, its turn, its size and its
// colour, or nothing when it is not there. One is there from the moment it
// starts to the moment its life is over, both included, as in Qt.
export function looking(particle, system, now) {
  const affecting = system.$affecting(particle);
  const { fadeInEffect, fadeOutEffect, fadeInDuration, fadeOutDuration, alignMode } = particle;
  const aim = alignMode === AlignTowardsTarget ? three(particle.alignTargetPosition) : null;
  // A sprite that faces the eye is not turned towards anything else.
  const flat = Boolean(particle.$sprite && particle.billboard);
  // The time in seconds, in a number of 32 bits as Qt has it and as the
  // starts are.
  const time = Math.fround(now / 1000);
  return (datum, place) => {
    if (!datum || time < datum.begin || time > datum.end) return null;
    const age = Math.fround(time - datum.begin) * 1000;
    // A particle that goes backwards is at the end of its way when it
    // starts and at the beginning when its life is over.
    const seconds = (datum.reversed ? datum.life - age : age) / 1000;
    const current = moved(datum, seconds, affecting, { datum, age, seconds, place });
    let turn = math.fromEuler(current.rx, current.ry, current.rz);
    const aligned = flat
      ? null
      : alignMode === AlignTowardsStartVelocity
        ? towards([datum.vx, datum.vy, datum.vz])
        : aim
          ? facing([current.x - aim[0], current.y - aim[1], current.z - aim[2]])
          : null;
    if (aligned) turn = product(aligned, turn);
    current.turn = turn;
    current.aligned = Boolean(aligned);
    const through = datum.life > 0 ? (seconds * 1000) / datum.life : 0;
    let scale = (datum.from + (datum.to - datum.from) * through) * current.scale;
    let alpha = current.a;
    // It comes and goes by the time of its way, so one that goes backwards
    // goes as it starts and comes as its life is over, as in Qt.
    const gone = seconds * 1000;
    if (fadeInEffect !== FadeNone && fadeInDuration > 0) {
      const fade = unit(gone / fadeInDuration);
      if (fadeInEffect === FadeScale) scale *= fade;
      else alpha *= fade;
    }
    if (fadeOutEffect !== FadeNone && fadeOutDuration > 0) {
      const fade = unit((datum.life - gone) / fadeOutDuration);
      if (fadeOutEffect === FadeScale) scale *= fade;
      else alpha *= fade;
    }
    current.scale = scale;
    // A colour is four whole numbers out of 255, as Qt keeps it.
    current.a = Math.trunc(datum.a * alpha);
    return current;
  };
}

// The particles of one kind that there are at `now`, in the order of their
// places in its table. Not one that was emitted where another is after its
// kind was looked at for this time (`trail` in emitters.js): Qt has that
// one to see from the next time on.
export function evaluate(particle, system, now) {
  const data = particle.$data;
  const alive = [];
  if (data.length === 0) return alive;
  const look = looking(particle, system, now);
  const round = system.$updates;
  for (let place = 0; place < data.length; place++) {
    const datum = data[place];
    if (datum?.unseen === round) continue;
    const current = look(datum, place);
    if (current) alive.push(current);
  }
  return alive;
}

// The system a particle is of: the one it was declared in, or the one of
// an emitter that emits it. It has no `system` of its own to name one by.
function owner(self) {
  const own = within(self);
  if (own) return own;
  for (const other of enrolled()) {
    if (other.$emitter && other.particle === self && other.system) return other.system;
  }
  return null;
}

export const Particle3D = defineType("Particle3D", Object3D, {
  properties: {
    maxAmount: 100,
    color: "#ffffff",
    colorVariation: group({ x: 0, y: 0, z: 0, w: 0 }),
    unifiedColorVariation: false,
    fadeInEffect: FadeOpacity,
    fadeOutEffect: FadeOpacity,
    fadeInDuration: 250,
    fadeOutDuration: 250,
    alignMode: AlignNone,
    alignTargetPosition: group({ x: 0, y: 0, z: 0 }),
    hasTransparency: true,
    sortMode: SortNone,
  },
  enums: { FadeNone, FadeOpacity, FadeScale, AlignNone, AlignTowardsTarget, AlignTowardsStartVelocity, SortNone, SortNewest, SortOldest, SortDistance },
  methods: {
    // The place in the table the next one emitted takes: the one after the
    // last, and when the table is full the oldest's, which is then no more.
    // Those of a burst that is there from the start are at the front and
    // keep their places.
    $take(kept) {
      const most = Math.max(0, Math.floor(this.maxAmount));
      if (this.$data.length > most) this.$data.length = most;
      if (kept) {
        if (this.$kept >= most) return -1;
        this.$next = Math.max(this.$next, this.$kept + 1);
        return (this.$last = this.$kept++);
      }
      if (this.$kept >= most) return -1;
      if (this.$next >= most) this.$next = this.$kept;
      return (this.$last = this.$next++);
    },
    $clear() {
      this.$data = [];
      this.$next = 0;
      this.$kept = 0;
      this.$last = 0;
      // How far through its life each sprite was and how big, when the
      // system last looked: what tells a start and an end to those that
      // follow it.
      this.$aged = [];
      // And the lines there were of it, where it is one of lines.
      this.$trails = [];
      this.$fading = [];
      this.$traced = undefined;
    },
  },
  setup(self) {
    self.$particle = true;
    self.$clear();
    enrol(self);
    variation(self);
    target(self);
    self.$system = kept(self, () => owner(self));
    // What there is of it now. Asking brings the system up to the time
    // first; what is found is found again when the time, the system or
    // anything a particle's look is worked out from has changed.
    self.$alive = kept(self, () => {
      const system = self.$system();
      if (!system) return [];
      const now = system.$upTo();
      return system.$begun ? evaluate(self, system, now) : [];
    });
  },
});

// A colour in linear light from one out of 255, by Qt's own sum.
const light = (byte) => {
  const c = byte / 255;
  return c * (c * (c * 0.305306011 + 0.682171111) + 0.012522878);
};

// What a Model draws once for each particle: where each is, its turn, its
// size and its colour. A program reads them one by one, and a Model asks
// for them all as a table (`$table`).
const ParticleInstancing = defineType("Instancing", Object3D, {
  properties: {
    instanceCountOverride: -1,
    hasTransparency: false,
    depthSortingEnabled: false,
    shadowBoundsMinimum: undefined,
    shadowBoundsMaximum: undefined,
  },
  methods: {
    get instanceCount() {
      return this.$of.$alive().length;
    },
    instancePosition(index) {
      const one = this.$of.$alive()[index];
      return one ? new Vector3d(one.x, one.y, one.z) : new Vector3d(0, 0, 0);
    },
    instanceScale(index) {
      const one = this.$of.$alive()[index];
      return one ? new Vector3d(one.scale, one.scale, one.scale) : new Vector3d(0, 0, 0);
    },
    instanceRotation(index) {
      const one = this.$of.$alive()[index];
      return one ? math.quaternion(one.turn) : new Quaternion(1, 0, 0, 0);
    },
    // The colour as the model is tinted with it: in linear light.
    instanceColor(index) {
      const one = this.$of.$alive()[index];
      return one ? rgba(light(one.datum.r), light(one.datum.g), light(one.datum.b), one.a / 255) : rgba(0, 0, 0, 0);
    },
    instanceCustomData() {
      return new Vector4d(0, 0, 0, 0);
    },
    // The same as numbers, twenty to a particle, as Qt keeps a table of
    // instances: three rows of where it is, turned and sized, its colour
    // in linear light, and four numbers of its own. Made anew each time,
    // so `fresh`.
    $table() {
      const alive = this.$of.$alive();
      const data = new Float32Array(alive.length * 20);
      alive.forEach((each, index) => {
        const size = each.scale;
        const m = math.placed([each.x, each.y, each.z], [size, size, size], [0, 0, 0], each.turn);
        data.set([m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14], light(each.datum.r), light(each.datum.g), light(each.datum.b), each.a / 255], index * 20);
      });
      return { data, count: alive.length, sheer: Boolean(this.$of.hasTransparency), sorted: false, fresh: true };
    },
  },
});

// A model for each particle: the one `delegate` makes, in the system, and
// any other whose `instancing` is the particle's `instanceTable`.
export const ModelParticle3D = defineType("ModelParticle3D", Particle3D, {
  properties: {
    delegate: null,
    instanceTable: derived((self) => self.$table),
  },
  setup(self) {
    self.$table = inside(null, () => ParticleInstancing({}));
    self.$table.$of = self;
    let made = null;
    const unmake = () => {
      if (!made) return;
      made.above.$remove(made.object);
      made.dispose();
      made = null;
    };
    effect(
      () => [self.delegate, self.$system()],
      ([component, system]) => {
        unmake();
        if (!component?.$component || !system) return;
        const { object, dispose } = instantiate(component, NOTHING, system, self.$owner);
        made = { object, dispose, above: system };
        // Every model there is in what was made is drawn for each.
        const each = (node) => {
          if (node?.$model) node.instancing = self.$table;
          for (const child of node?.children ?? []) each(child);
        };
        untrack(() => each(object));
        system.$add(object);
      },
    );
    onCleanup(unmake);
  },
});

const SourceOver = 0;
const Screen = 1;
const Multiply = 2;

export const SpriteParticle3D = defineType("SpriteParticle3D", Particle3D, {
  properties: {
    blendMode: SourceOver,
    sprite: null,
    spriteSequence: null,
    billboard: false,
    particleScale: 5,
    colorTable: null,
    lights: undefined,
    offsetX: 0,
    offsetY: 0,
    castsReflections: true,
  },
  enums: { SourceOver, Screen, Multiply },
  setup(self) {
    self.$sprite = true;
  },
});

const Absolute = 0;
const Relative = 1;
const Fill = 2;

export const LineParticle3D = defineType("LineParticle3D", SpriteParticle3D, {
  properties: {
    segmentCount: 1,
    alphaFade: 0,
    scaleMultiplier: 1,
    texcoordMultiplier: 1,
    length: -1,
    lengthVariation: 0,
    lengthDeltaMin: 10,
    eolFadeOutDuration: 0,
    texcoordMode: Absolute,
  },
  enums: { Absolute, Relative, Fill },
  setup(self) {
    self.$line = true;
  },
});

export const ModelBlendParticle3D = defineType("ModelBlendParticle3D", Particle3D, {
  properties: {
    maxAmount: 0,
    fadeInEffect: FadeNone,
    fadeOutEffect: FadeNone,
    delegate: null,
    endNode: null,
    modelBlendMode: 0,
    endTime: 0,
    activationNode: null,
    emitMode: 0,
  },
  enums: { Explode: 0, Construct: 1, Transfer: 2, Sequential: 0, Random: 1, Activation: 2 },
});

const Normal = 0;
const Reverse = 1;
const Alternate = 2;
const AlternateReverse = 3;
const SingleFrame = 4;

// A sprite whose picture is several side by side: which of them a particle
// shows goes through them once in `duration`, or in the particle's life.
export const SpriteSequence3D = defineType("SpriteSequence3D", QtObject, {
  properties: {
    frameCount: 1,
    frameIndex: 0,
    interpolate: true,
    duration: -1,
    durationVariation: 0,
    randomStart: false,
    animationDirection: Normal,
  },
  enums: { Normal, Reverse, Alternate, AlternateReverse, SingleFrame },
});

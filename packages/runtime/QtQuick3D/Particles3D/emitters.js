// What makes particles: an emitter gives each one it emits a start, a life,
// a place, a speed, a turn, a size and a colour, and the particle's kind
// keeps them. So many a second, and in bursts.
//
// How many and when is Qt's own arithmetic, found by asking Qt 6.11 for the
// particles there are after the time was moved in steps: what was emitted
// since the last time is spread evenly over the time since, an emitter that
// has not a whole particle to emit waits where it was, and no more of the
// past is made up for than a particle's longest life.
//
// Emitters and affectors do their work the last declared first, as Qt's
// do, where each comes to its system when it is complete and the last made
// is complete first. And an emitter that has bursts empties its kind of
// particle before the first thing it emits, as Qt's does: of several
// emitters of one kind that have bursts, what the earlier declared emits
// first is all there is then.
//
// A TrailEmitter3D is Qt 6.11's step for step (`trail`), and so not what
// its documentation says: a burst that is to come when a particle followed
// starts or ends comes at its `time` as well; of a model, the one for an
// end comes again every time the system moves on while the particle that
// ended has its place in the table, and the one for a start only for a
// particle with no life at all; of a sprite or a line both come once.
//
// Not here: `emitMode` and `depthBias` are kept and do nothing: a particle
// sets off as `velocity` says whatever surface it starts on.
import { defineType, derived, group, QtObject } from "../../object.js";
import { color } from "../../QtQuick/color.js";
import * as math from "../math.js";
import { Node } from "../Node.js";
import { AMOUNT, COLOR, END_SCALE, enrol, LIFE, list, random, SCALE, seenFrom, SPIN, spread, three, TURN, vectors, within } from "./core.js";
import { looking } from "./particles.js";
import { untrack } from "#kernel";

const HERE = Object.freeze([0, 0, 0]);

const TriggerTime = 0;
const TriggerStart = 1;
const TriggerEnd = 2;

// So many particles at a time: there from the start of the system, the
// first at `time` and the rest spread over `duration`.
export const EmitBurst3D = defineType("EmitBurst3D", QtObject, {
  properties: {
    time: 0,
    amount: 0,
    duration: 0,
  },
  setup(self) {
    self.$burst = true;
  },
});

// The same, emitted when the system's time comes past `time`: again when
// it comes past it again, and not at all while it is not `enabled`. The
// time is the system's `time`, without its `startTime`, and `triggerMode`
// is nothing to that: it adds a start or an end of a particle followed.
export const DynamicBurst3D = defineType("DynamicBurst3D", EmitBurst3D, {
  properties: {
    enabled: true,
    amountVariation: 0,
    triggerMode: TriggerTime,
  },
  enums: { TriggerTime, TriggerStart, TriggerEnd },
  setup(self) {
    self.$dynamic = true;
  },
});

// An emitter's bursts: those `emitBursts` names and those declared in it.
// The last comes first, as in Qt, where each tells its emitter of itself
// when it is complete and the last made is complete first: of two bursts
// that are there from the start, the later one's particles are before the
// earlier one's in the table.
function bursts(emitter) {
  const found = new Set(list(emitter.emitBursts));
  for (const child of emitter.$static ?? []) if (child?.$burst) found.add(child);
  return [...found].filter((burst) => burst?.$burst).reverse();
}

// A whole number out of 255.
const byte = (value) => Math.min(255, Math.max(0, Math.trunc(value)));

// When one of several starts that are spread over a time: `share` of the
// way through `span` from `from`. In seconds, and summed as Qt sums it, in
// numbers of 32 bits: one that is to start at the very time it is emitted
// may so come out a hair after it, and is then not there until the time
// has moved on, as in Qt.
const { fround } = Math;
const when = (from, share, span) => fround(fround(from / 1000) + fround(fround(share) * fround(span / 1000)));

// One particle, to start at `begin` seconds. `placed` is the emitter as
// the system sees it and `turned` its turn alone; with `around`, the
// particle starts that far from where they put it.
function emit(system, emitter, particle, begin, placed, turned, around, kept) {
  const place = particle.$take(kept);
  if (place < 0) return place;
  const seed = system.$seed();
  const index = system.$numbered++;
  const inside = emitter.shape?.$position?.(seed, index) ?? HERE;
  const at = placed ? math.point(placed, inside[0], inside[1], inside[2]) : [...inside];
  if (around) for (let axis = 0; axis < 3; axis++) at[axis] += around[axis];
  const speed = emitter.velocity?.$sample?.(seed, index, at) ?? HERE;
  const [vx, vy, vz] = math.turned(turned, speed[0], speed[1], speed[2]);
  // A turn is kept as a whole number of 127ths of a full one, and how fast
  // it turns as the whole root of the degrees a second.
  const turn = three(emitter.particleRotation);
  const turnVariation = three(emitter.particleRotationVariation);
  const spin = three(emitter.particleRotationVelocity);
  const spinVariation = three(emitter.particleRotationVelocityVariation);
  const angles = [0, 1, 2].map((axis) => (Math.trunc(((turn[axis] + turnVariation[axis] * spread(seed, index, TURN + axis)) * 127) / 360) * 360) / 127);
  const spins = [0, 1, 2].map((axis) => {
    const wanted = spin[axis] + spinVariation[axis] * spread(seed, index, SPIN + axis);
    const root = Math.max(-127, Math.min(127, Math.trunc(Math.sign(wanted) * Math.sqrt(Math.abs(wanted)))));
    return Math.abs(root) * root;
  });
  // Each channel of the colour is drawn towards chance by as much as its
  // variation says: all by the same chance when the variation is unified.
  const tint = color(particle.color);
  const variation = particle.colorVariation;
  const together = random(seed, index, COLOR + 3);
  const chance = (channel) => (particle.unifiedColorVariation ? together : random(seed, index, COLOR + channel)) * 256;
  const mixed = (value, by, channel) => byte(value * 255 * (1 - by) + chance(channel) * by);
  const by = emitter.particleScaleVariation * spread(seed, index, SCALE);
  const end = emitter.particleEndScale < 0 ? emitter.particleScale : emitter.particleEndScale;
  const endBy = emitter.particleEndScaleVariation < 0 ? by : emitter.particleEndScaleVariation * spread(seed, index, END_SCALE);
  const life = Math.max(0, emitter.lifeSpan + emitter.lifeSpanVariation * spread(seed, index, LIFE));
  particle.$data[place] = {
    index,
    begin,
    end: fround(begin + fround(life / 1000)),
    start: begin * 1000,
    life,
    x: at[0],
    y: at[1],
    z: at[2],
    vx,
    vy,
    vz,
    rx: angles[0],
    ry: angles[1],
    rz: angles[2],
    sx: spins[0],
    sy: spins[1],
    sz: spins[2],
    r: mixed(tint.r, Number(variation.x) || 0, 0),
    g: mixed(tint.g, Number(variation.y) || 0, 1),
    b: mixed(tint.b, Number(variation.z) || 0, 2),
    a: mixed(tint.a, Number(variation.w) || 0, 3),
    from: Math.max(0, emitter.particleScale + by),
    to: Math.max(0, end + endBy),
    reversed: Boolean(emitter.reversed),
  };
  return place;
}

// How an emitter lies in its system: where it puts a place of its own, and
// which way it turns a direction, which no scale makes longer.
function lie(system, emitter) {
  const placed = seenFrom(system, emitter);
  const turn = math.unscaled(placed);
  return { placed, turned: [turn[0], turn[1], turn[2], turn[4], turn[5], turn[6], turn[8], turn[9], turn[10]] };
}

// How many a burst is of, give or take its variation.
function amountOf(system, burst) {
  const amount = Math.max(0, Math.floor(burst.amount));
  if (!burst.amountVariation) return amount;
  return Math.max(0, Math.round(amount + burst.amountVariation * spread(system.$seed(), system.$numbered, AMOUNT)));
}

// What an emitter keeps from one time to the next: when it last emitted
// and when it last looked at its bursts, what its rate has left over, the
// bursts that are under way, and the bursts it had when it emitted those
// that are there from the start.
export const fresh = (from, generated = null) => ({ previous: from, burstBefore: from, owed: 0, spreading: [], idle: false, rate: undefined, generated });

// How many the emitter's rate gives for the time since it last emitted,
// with what was left over of the times before.
function owing(emitter, state, now) {
  const rate = Number(emitter.emitRate) || 0;
  if (!(rate > 0)) return 0;
  const exact = ((now - state.previous) * rate) / 1000;
  let amount = Math.floor(exact);
  if (amount > 0) state.owed += exact - amount;
  if (state.owed >= 1) {
    amount++;
    state.owed -= 1;
  }
  return amount;
}

function due(emitter, state, now) {
  // Time gone back is begun from again; and of time that jumped ahead, no
  // more is made up for than a particle lives.
  if (now < state.previous) state.previous = now;
  state.previous = Math.max(state.previous, now - (emitter.lifeSpan + emitter.lifeSpanVariation));
  return owing(emitter, state, now);
}

// The bursts whose time came since the emitter last looked, the time then
// and the time now both included, as Qt includes them: all at once, or a
// share with each step until their `duration` is over. With a `trigger`,
// those that are for a start or an end of a particle followed instead.
function dynamic(system, emitter, state, trigger) {
  let amount = 0;
  const now = system.$time();
  const since = state.burstBefore;
  for (const each of bursts(emitter)) {
    if (!each.$dynamic || !each.enabled) continue;
    const timed = trigger === TriggerTime && since <= each.time && each.time <= now;
    if (!timed && !(trigger !== TriggerTime && each.triggerMode === trigger)) continue;
    const many = amountOf(system, each);
    if (many <= 0) continue;
    if (timed && each.duration > 0) state.spreading.push({ end: now + each.duration, duration: each.duration, amount: many, emitted: 0, previous: since });
    else amount += many;
  }
  for (let index = 0; index < state.spreading.length; index++) {
    const spreading = state.spreading[index];
    if (now >= spreading.end) {
      amount += spreading.amount - spreading.emitted;
      // The one after it in the list is passed over this once, as in Qt.
      state.spreading.splice(index, 1);
      continue;
    }
    // Its share for the time since, and no more than is left of it: one
    // that has no share yet waits where it was.
    const share = Math.min(spreading.amount - spreading.emitted, Math.trunc((spreading.amount * (now - spreading.previous)) / spreading.duration));
    if (share <= 0) continue;
    spreading.emitted += share;
    spreading.previous = now;
    amount += share;
  }
  state.burstBefore = now;
  return amount;
}

// The bursts that are there from the start, before the first thing the
// emitter emits and again when it has other bursts than it had. An emitter
// with bursts, of whatever sort, empties its kind of particle first, as
// Qt's does; and one with a burst of none begins again every time.
function generate(system, emitter, state, particle) {
  const all = bursts(emitter);
  if (state.generated && state.generated.length === all.length && all.every((each, index) => each === state.generated[index])) return;
  if (all.length > 0) {
    particle.$clear();
    const { placed, turned } = lie(system, emitter);
    for (const each of all) {
      if (each.$dynamic) continue;
      const many = Math.min(Math.floor(each.amount), particle.maxAmount);
      if (!(many > 0)) return;
      for (let index = 0; index < many; index++) emit(system, emitter, particle, when(each.time, index / many, each.duration), placed, turned, null, true);
    }
  }
  state.generated = all;
}

const turns = vectors(["particleRotation", "particleRotationVariation", "particleRotationVelocity", "particleRotationVelocityVariation"]);

export const ParticleEmitter3D = defineType("ParticleEmitter3D", Node, {
  properties: {
    system: derived(within),
    emitBursts: undefined,
    velocity: null,
    particle: null,
    enabled: true,
    shape: null,
    emitRate: 0,
    lifeSpan: 1000,
    lifeSpanVariation: 0,
    particleScale: 1,
    particleEndScale: -1,
    particleScaleVariation: 0,
    particleEndScaleVariation: -1,
    particleRotation: group({ x: 0, y: 0, z: 0 }),
    particleRotationVariation: group({ x: 0, y: 0, z: 0 }),
    particleRotationVelocity: group({ x: 0, y: 0, z: 0 }),
    particleRotationVelocityVariation: group({ x: 0, y: 0, z: 0 }),
    depthBias: 0,
    reversed: false,
    emitMode: 0,
  },
  enums: { Default: 0, SurfaceNormal: 1, SurfaceReflected: 2 },
  methods: {
    // So many particles now, or spread over `duration` from now, and with
    // `position` that far from where the emitter would start them. They
    // are there to see when the time next moves, as in Qt.
    burst(count, duration = 0, position = null) {
      const system = this.system;
      const particle = this.particle;
      if (!system || !particle || !this.enabled) return;
      const now = untrack(() => system.$sync());
      const many = Math.min(Math.max(0, Math.floor(count)), particle.maxAmount);
      const { placed, turned } = lie(system, this);
      const around = position ? three(position) : null;
      for (let index = 0; index < many; index++) emit(system, this, particle, when(now, (1 + index) / many, Math.max(0, duration)), placed, turned, around);
    },
    // What the time up to `now` has it emit.
    $emit(system, state, now) {
      const particle = this.particle;
      if (!particle) return;
      generate(system, this, state, particle);
      const amount = Math.min(due(this, state, now) + dynamic(system, this, state, TriggerTime), particle.maxAmount);
      if (amount <= 0) return;
      const { placed, turned } = lie(system, this);
      const span = now - state.previous;
      for (let index = 0; index < amount; index++) emit(system, this, particle, when(state.previous, (1 + index) / amount, span), placed, turned);
      state.previous = now;
    },
  },
  setup(self) {
    self.$emitter = true;
    turns(self);
    enrol(self);
  },
});

// Emits where the particles of another kind are: its rate for each of them
// there is, and its bursts (`trail`).
export const TrailEmitter3D = defineType("TrailEmitter3D", ParticleEmitter3D, {
  properties: {
    follow: null,
  },
  methods: {
    // So many for each of the particles followed, when the time next
    // moves: started at the time it was asked.
    burst(count) {
      const system = this.system;
      if (!system || !this.enabled) return;
      this.$asked.push({ amount: Math.max(0, Math.floor(count)), time: untrack(() => system.$sync()) });
    },
    $emit() {},
  },
  setup(self) {
    self.$trail = true;
    self.$asked = [];
  },
});

const unit = (value) => Math.min(1, Math.max(0, value));

// Has those that follow a particle emit what one at `at` gives them: so
// many, and what their bursts add for the time or for a start or an end.
// Whatever the rate owes is spread from the time the emitter last emitted,
// the first at that time; what was asked for starts when it was asked.
function follow(system, { emitter, state }, at, amount, trigger, now, mark) {
  if (!emitter.enabled) return;
  const particle = emitter.particle;
  if (particle?.$particle) {
    amount = Math.min(amount + dynamic(system, emitter, state, trigger), particle.maxAmount);
    // Its own turn alone turns the way they set off.
    const turn = math.unscaled(emitter.$local());
    const turned = [turn[0], turn[1], turn[2], turn[4], turn[5], turn[6], turn[8], turn[9], turn[10]];
    const from = fround(state.previous / 1000);
    const step = fround(fround((now - state.previous) / 1000) / amount);
    for (let index = 0; index < amount; index++) mark(particle, emit(system, emitter, particle, fround(from + fround(step * index)), null, turned, at));
    for (const asked of emitter.$asked) {
      const many = Math.min(asked.amount, particle.maxAmount);
      for (let index = 0; index < many; index++) mark(particle, emit(system, emitter, particle, fround(asked.time / 1000), null, turned, at));
    }
  }
  state.previous = now;
}

// What the emitters that follow particles emit when their system has come
// to `now`, after the others have emitted. Qt's own way, step for step:
// the kinds of particle one after the other, in the order their emitters
// came to the system, and of each every place in its table: one that is
// there has its followers emit where it is, and one whose life is over
// where it ended. What goes into a kind that was looked at already is not
// there to see before the next time.
export function trail(system, emitters, states, now) {
  const trailing = emitters.filter((emitter) => emitter.$trail);
  if (trailing.length === 0) return;
  const kinds = [];
  for (const emitter of emitters) {
    const kind = emitter.particle;
    if (kind?.$particle && !kinds.includes(kind)) kinds.push(kind);
  }
  const time = fround(now / 1000);
  for (let number = 0; number < kinds.length; number++) {
    const kind = kinds[number];
    const followers = trailing.filter((emitter) => emitter.follow === kind);
    if (followers.length === 0) continue;
    const emits = [];
    for (const emitter of followers) {
      const state = states.get(emitter);
      const amount = emitter.enabled ? owing(emitter, state, now) : 0;
      if (amount > 0 || emitter.$asked.length > 0 || bursts(emitter).some((each) => each.$dynamic)) emits.push({ emitter, state, amount });
    }
    const sprite = Boolean(kind.$sprite);
    if (emits.length === 0 && !sprite) continue;
    const look = looking(kind, system, now);
    const data = kind.$data;
    const most = Math.max(0, Math.floor(kind.maxAmount));
    for (let place = 0; place < most; place++) {
      const datum = data[place];
      if (!datum) continue;
      const mark = (particle, at) => {
        if (at < 0) return;
        const where = kinds.indexOf(particle);
        if (where < number || (where === number && at < place)) particle.$data[at].unseen = system.$updates;
      };
      const aged = sprite ? (kind.$aged[place] ??= { age: 0, size: 0 }) : null;
      if (time < datum.begin || time > datum.end) {
        // A sprite's end is told once, when it is first found gone; a
        // model's for as long as it has its place.
        if (time > datum.end && (sprite ? aged.age > 0 : datum.life > 0)) {
          const whole = datum.reversed ? 0 : datum.life / 1000;
          const ended = [datum.x + datum.vx * whole, datum.y + datum.vy * whole, datum.z + datum.vz * whole];
          for (const each of emits) follow(system, each, ended, 0, TriggerEnd, now, mark);
        }
        if (sprite && aged.size > 0) aged.age = aged.size = 0;
        continue;
      }
      // And a sprite's start when it is first found there; a model's only
      // when it has no life to be through.
      if (sprite ? time < datum.end && aged.age === 0 : datum.life <= 0) {
        for (const each of emits) follow(system, each, [datum.x, datum.y, datum.z], 0, TriggerStart, now, mark);
      }
      const current = look(datum, place);
      for (const each of emits) follow(system, each, [current.x, current.y, current.z], each.amount, TriggerTime, now, mark);
      if (sprite) {
        aged.age = datum.life > 0 ? unit((current.seconds * 1000) / datum.life) : 0;
        aged.size = current.scale;
      }
    }
  }
  for (const emitter of trailing) emitter.$asked = [];
}

// Emitter: where particles come from, how many a second, and what each is
// given to start with. TrailEmitter does the same from every particle of
// another group.
//
// The arithmetic is Qt's `emitWindow`, kept as it is: particles are emitted
// at the instants they were due since the last frame, not all at the frame's,
// so that a slow frame leaves no gap in a stream.
import { defineType } from "../../object.ts";
import { Item } from "../Item.js";
import { between } from "./geometry.js";
import { Particle } from "./particle.js";
import { contains, extrude } from "./shapes.js";
import { AX, AY, belongs, END, found, heard, INFINITE, LIFE, position, SIZE, STRIDE, T, VX, VY, X, Y } from "./system.js";

const POINT = { x: 0, y: 0 };
const VECTOR = { x: 0, y: 0 };
const MAP = new Float64Array(6);
const IDENTITY = [1, 0, 0, 1, 0, 0];
const NONE = Object.freeze([]);

// The life of one particle in seconds, and what an endless one costs: an
// emitter of those stops when it has emitted as many as it can have.
function life(self, lifeSpan, variation, random) {
  const seconds = (lifeSpan + (Math.floor(random() * (variation * 2 + 1)) - variation)) / 1000;
  if (seconds < INFINITE) return seconds;
  if (self.$cap === -1) self.$cap = self.$count;
  self.$cap--;
  return INFINITE;
}

// What the time since the last frame is to a pulse: used up, and the frame
// cut short where the pulse ends.
function pulsed(self, stamp, always) {
  if (!self.$pulse) return stamp;
  self.$pulse -= stamp - self.$lastTime * 1000;
  if (self.$pulse < 0) {
    if (always) stamp += self.$pulse;
    self.$pulse = 0;
  }
  return stamp;
}

export const Emitter = defineType("Emitter", Item, {
  properties: {
    system: found,
    group: "",
    shape: undefined,
    // Its own, as in Qt: not what the items around it say.
    enabled: true,
    startTime: 0,
    emitRate: 10,
    lifeSpan: 1000,
    lifeSpanVariation: 0,
    maximumEmitted: -1,
    size: 16,
    endSize: -1,
    sizeVariation: 0,
    velocity: undefined,
    acceleration: undefined,
    velocityFromMovement: 0,
  },
  enums: { InfiniteLife: INFINITE },
  signals: ["emitParticles"],
  methods: {
    // Emits for this long, if it is not emitting anyway.
    pulse(milliseconds) {
      if (this.enabled) return;
      this.$pulse = milliseconds;
      this.$in?.wake();
    },
    // Emits `count` particles at once: where the emitter is, or at a place
    // given in the coordinates the emitter is positioned in.
    burst(count, x = this.x, y = this.y) {
      this.$bursts.push({ count, x, y });
      this.$in?.wake();
    },
    $restart() {
      this.$resetLast = true;
    },
    $counted(most) {
      this.$count = most;
    },
    // Whether the emitter emits without being asked to.
    $emitting() {
      return Boolean(this.enabled) && this.emitRate > 0;
    },
    // How many particles it can have alive at once.
    $most() {
      const most = this.maximumEmitted;
      return most >= 0 ? most : Math.trunc(this.emitRate * ((this.lifeSpan + this.lifeSpanVariation) / 1000));
    },
    // Emits what is due at `stamp`, the system's time in milliseconds. False
    // when it has nothing more to emit until it is told to.
    $emit(sim, stamp) {
      const bursts = this.$bursts;
      if (!this.$live && !this.$pulse && !bursts.length) {
        this.$resetLast = true;
        return false;
      }
      const enabled = Boolean(this.enabled);
      const x = this.x;
      const y = this.y;
      if (this.$resetLast) {
        this.$lastX = this.$beforeX = x;
        this.$lastY = this.$beforeY = y;
        // `startTime` is how long it has been emitting when it first does.
        this.$lastTime = this.$lastTime === -1 ? (stamp - this.startTime) / 1000 : stamp / 1000;
        this.$lastEmission = this.$lastTime;
        this.$resetLast = false;
        this.$cap = -1;
      }
      stamp = pulsed(this, stamp, !enabled);
      const time = stamp / 1000;
      const interval = 1 / this.emitRate;
      const lifeSpan = this.lifeSpan;
      const variation = this.lifeSpanVariation;
      const longest = (lifeSpan + variation) / 1000;
      let due = this.$lastEmission;
      // What would be dead by now is not emitted.
      if (due + longest < time) due = time - longest;
      const first = due;
      const span = time - this.$lastTime || 0.000001;
      const lastX = this.$lastX;
      const lastY = this.$lastY;
      // The emitter's own movement, as a curve through where it was.
      const fromX = (this.$beforeX + lastX) / 2;
      const fromY = (this.$beforeY + lastY) / 2;
      const toX = (x + lastX) / 2;
      const toY = (y + lastY) / 2;
      const size = this.size;
      const endSize = this.endSize >= 0 ? this.endSize : size;
      const sizeVariation = this.sizeVariation;
      const width = this.width;
      const height = this.height;
      const shape = this.shape;
      const velocity = this.velocity;
      const acceleration = this.acceleration;
      const fromMovement = this.velocityFromMovement;
      const group = this.$group;
      const limited = this.maximumEmitted >= 0;
      const random = sim.random;
      const listening = heard(this, "emitParticles", "onEmitParticles");
      const mapped = between(this, sim.system, MAP);
      let emitted = null;
      if (bursts.length && !this.$pulse && !enabled) due = time;
      while ((due < time && this.$cap) || bursts.length) {
        const burst = bursts.length ? bursts[0] : null;
        const index = sim.alloc(group, limited);
        if (index >= 0) {
          const data = group.data;
          const at = index * STRIDE;
          const done = (due - first) / span;
          const left = 1 - done;
          data[at + T] = due;
          data[at + LIFE] = life(this, lifeSpan, variation, random);
          // Where in the emitter, which was elsewhere when this was due.
          if (burst) extrude(shape, burst.x - x, burst.y - y, width, height, random, POINT);
          else extrude(shape, lastX - x + (x - lastX) * done, lastY - y + (y - lastY) * done, width, height, random, POINT);
          const px = POINT.x;
          const py = POINT.y;
          VECTOR.x = VECTOR.y = 0;
          velocity?.$sample(px, py, random, VECTOR);
          data[at + VX] = VECTOR.x + fromMovement * (-2 * fromX * (1 - left) + 2 * lastX * (1 - 2 * left) + 2 * toX * left);
          data[at + VY] = VECTOR.y + fromMovement * (-2 * fromY * (1 - left) + 2 * lastY * (1 - 2 * left) + 2 * toY * left);
          VECTOR.x = VECTOR.y = 0;
          acceleration?.$sample(px, py, random, VECTOR);
          data[at + AX] = VECTOR.x;
          data[at + AY] = VECTOR.y;
          const varied = -sizeVariation + random() * sizeVariation * 2;
          data[at + SIZE] = Math.max(0, size + varied);
          data[at + END] = Math.max(0, endSize + varied);
          // The system's coordinates are what a particle lives in.
          data[at + X] = mapped ? MAP[0] * px + MAP[2] * py + MAP[4] : px;
          data[at + Y] = mapped ? MAP[1] * px + MAP[3] * py + MAP[5] : py;
          sim.emitted(group, index);
          if (listening) (emitted ??= []).push(new Particle(sim, group, index));
        }
        if (!burst) due += interval;
        else if (--burst.count <= 0) bursts.shift();
      }
      // As Qt does: every frame it emits in, with or without particles.
      if (listening) this.emitParticles(emitted ?? NONE);
      this.$lastEmission = due;
      this.$beforeX = lastX;
      this.$beforeY = lastY;
      this.$lastX = x;
      this.$lastY = y;
      this.$lastTime = time;
      return this.$live || this.$pulse > 0 || bursts.length > 0;
    },
  },
  setup(self) {
    self.$group = null;
    self.$count = 0;
    self.$live = false;
    self.$pulse = 0;
    self.$bursts = [];
    self.$resetLast = true;
    self.$lastTime = -1;
    self.$lastEmission = 0;
    self.$cap = -1;
    self.$lastX = self.$lastY = self.$beforeX = self.$beforeY = 0;
    belongs(
      self,
      "emitters",
      // The direction and shape objects are read so that they exist, and a
      // mask has its picture, before the first particle needs them.
      () => [String(self.group ?? ""), self.$most(), self.$emitting(), self.velocity, self.acceleration, self.shape],
      (sim, state) => {
        self.$group = sim && state ? sim.group(state[0]) : null;
        self.$counted(state ? state[1] : 0);
        self.$live = state ? state[2] : false;
        if (!sim) return;
        sim.sizes();
        if (self.$live) sim.wake();
      },
    );
  },
});

// What a trail is emitted around: the particle's place, or its size too.
const PARTICLE_SIZE = -2;
const NEVER = [0, 0];

export const TrailEmitter = defineType("TrailEmitter", Emitter, {
  properties: {
    follow: "",
    emitRatePerParticle: 10,
    emitShape: undefined,
    emitWidth: 0,
    emitHeight: 0,
  },
  enums: { ParticleSize: PARTICLE_SIZE },
  signals: ["emitFollowParticles"],
  methods: {
    $emitting() {
      return Boolean(this.enabled) && this.emitRatePerParticle > 0;
    },
    $counted(each) {
      this.$each = each || NEVER;
      this.$followed = -1;
    },
    $restart() {
      this.$followed = -1;
      this.$lastTime = 0;
    },
    // Known only when the followed group's size is: `$emit` works it out.
    $most() {
      return [this.maximumEmitted, this.emitRatePerParticle * ((this.lifeSpan + this.lifeSpanVariation) / 1000), this.emitShape];
    },
    $emit(sim, stamp) {
      const bursts = this.$bursts;
      if (!this.$live && !this.$pulse && !bursts.length) return false;
      const followed = sim.group(String(this.follow ?? ""));
      // Room for what every followed particle can leave behind.
      if (this.$followed !== followed.size) {
        this.$followed = followed.size;
        const [most, each] = this.$each;
        this.$count = most >= 0 ? most : Math.trunc(each * followed.size);
        sim.sizes();
        const since = new Float64Array(followed.capacity).fill(this.$lastTime);
        this.$since = since;
      }
      const since = this.$since;
      stamp = pulsed(this, stamp, true);
      const time = stamp / 1000;
      const interval = 1 / this.emitRatePerParticle;
      const lifeSpan = this.lifeSpan;
      const variation = this.lifeSpanVariation;
      const longest = (lifeSpan + variation) / 1000;
      const shown = this.enabled ? 1 : 0;
      const size = this.size;
      const endSize = this.endSize >= 0 ? this.endSize : size;
      const sizeVariation = this.sizeVariation;
      const width = this.width;
      const height = this.height;
      const shape = this.shape;
      const emitShape = this.emitShape;
      const emitWidth = this.emitWidth;
      const emitHeight = this.emitHeight;
      const velocity = this.velocity;
      const acceleration = this.acceleration;
      const fromMovement = this.velocityFromMovement;
      const group = this.$group;
      const limited = this.maximumEmitted >= 0;
      const random = sim.random;
      const following = heard(this, "emitFollowParticles", "onEmitFollowParticles");
      const listening = following || heard(this, "emitParticles", "onEmitParticles");
      // Where the emitter is in the system: only the particles inside it
      // leave a trail, if it has a size at all.
      const mapped = between(this, sim.system, MAP);
      const [a, b, c, d, e, f] = mapped ? MAP : IDENTITY;
      for (let index = 0; index < followed.high && index < since.length; index++) {
        // Read again every time: a trail in the group it follows makes it grow.
        let from = followed.data;
        const row = index * STRIDE;
        if (!followed.used[index] || !(from[row + T] + from[row + LIFE] - 0.001 > time)) {
          // It leaves a trail from when it is alive again.
          since[index] = time;
          continue;
        }
        let due = Math.max(since[index], from[row + T]);
        if (due + longest < time) due = time - longest;
        const age = time - from[row + T];
        const x = position(from, row + X, age);
        const y = position(from, row + Y, age);
        if ((width || height) && !contains(shape, e, f, width, height, x, y)) {
          since[index] = time;
          continue;
        }
        const life = from[row + LIFE];
        const now = life ? from[row + SIZE] + (from[row + END] - from[row + SIZE]) * (age / life) : 0;
        const wide = emitWidth < 0 ? now : emitWidth;
        const tall = emitHeight < 0 ? now : emitHeight;
        let emitted = null;
        while (due < time || bursts.length) {
          const made = sim.alloc(group, limited);
          if (made >= 0) {
            from = followed.data;
            const data = group.data;
            const at = made * STRIDE;
            data[at + T] = due;
            data[at + LIFE] = (lifeSpan + (Math.floor(random() * (variation * 2 + 1)) - variation)) / 1000;
            // Around where the followed particle was when this one was due,
            // in the emitter's coordinates.
            const then = due - from[row + T];
            extrude(
              emitShape,
              position(from, row + X, then) - e - wide / 2,
              position(from, row + Y, then) - f - tall / 2,
              wide,
              tall,
              random,
              POINT,
            );
            const px = POINT.x;
            const py = POINT.y;
            VECTOR.x = VECTOR.y = 0;
            velocity?.$sample(px, py, random, VECTOR);
            data[at + VX] = VECTOR.x + fromMovement * from[row + VX];
            data[at + VY] = VECTOR.y + fromMovement * from[row + VY];
            VECTOR.x = VECTOR.y = 0;
            acceleration?.$sample(px, py, random, VECTOR);
            data[at + AX] = VECTOR.x;
            data[at + AY] = VECTOR.y;
            const varied = -sizeVariation + random() * sizeVariation * 2;
            // What a trail emits in a pulse or a burst has no size, as in Qt.
            data[at + SIZE] = Math.max(0, size + varied) * shown;
            data[at + END] = Math.max(0, endSize + varied) * shown;
            data[at + X] = a * px + c * py + e;
            data[at + Y] = b * px + d * py + f;
            sim.emitted(group, made);
            if (listening) (emitted ??= []).push(new Particle(sim, group, made));
          }
          if (!bursts.length) due += interval;
          else if (--bursts[0].count <= 0) bursts.shift();
        }
        if (following) this.emitFollowParticles(emitted ?? NONE, new Particle(sim, followed, index));
        else if (listening) this.emitParticles(emitted ?? NONE);
        since[index] = due;
      }
      this.$lastTime = time;
      // It has nothing to emit from when nothing is alive: it keeps no
      // system awake.
      return false;
    },
  },
  setup(self) {
    self.$since = new Float64Array(0);
    self.$followed = -1;
    self.$lastTime = 0;
  },
});

// ParticleSystem3D: the time particles live in. It has the emitters, the
// affectors and the kinds of particle that are declared in it or name it as
// their `system`, and what there is of each kind is what the emitters have
// emitted by its time and what the affectors make of that at its time.
//
// While it is `running` the time goes by itself, from nought; stopped, the
// time is what `time` is given, and a system whose time is moved to and
// fro shows at each time what it was brought to by the times before, as in
// Qt: emitting is done once for each time it comes to, and looking at a
// particle is done from its start alone.
//
// The `time` a system is declared with is not its time, in Qt: every
// system is at nought when it is made, and at the time it is given from
// when that is first another.
//
// Unlike Qt: a time that is set is the system's time at once, where Qt's
// system comes to it with the next frame. An emitter that is enabled or
// asked for a burst right after the time was set starts from the new time
// here, and from the old one in Qt. And `time` reads as what it was
// declared to be until it is changed, where Qt's reads as nought.
import { onCleanup } from "solid-js";
import { defineType, derived, effect, inside, last, QtObject, settle, slot } from "../../object.js";
import { clock } from "../../QtQuick/animation/clock.js";
import { kept, Node } from "../Node.js";
import { enrolled } from "./core.js";
import { fresh, trail } from "./emitters.js";
import { painted } from "./paint.js";
import { signal, untrack } from "#kernel";

// What a system says of itself while it is `logging`: how many times it
// was brought up to date in the last `loggingInterval`, how long that took,
// and how many particles there may be and are.
const ParticleSystem3DLogging = defineType("ParticleSystem3DLogging", QtObject, {
  properties: {
    loggingInterval: 1000,
    updates: 0,
    particlesMax: 0,
    particlesUsed: 0,
    time: 0,
    timeAverage: 0,
    timeDeviation: 0,
  },
});

export const ParticleSystem3D = defineType("ParticleSystem3D", Node, {
  properties: {
    running: true,
    paused: false,
    startTime: 0,
    time: 0,
    useRandomSeed: true,
    seed: derived((self) => self.$chance),
    logging: false,
    loggingData: derived((self) => self.$log),
  },
  methods: {
    // Empties the system: no particle is left, not those of the bursts
    // that were there from the start either, and what the time has passed
    // comes again. When the time next moves, as in Qt: until then what
    // there was is still to be seen.
    reset() {
      const { emitters, particles } = untrack(() => this.$members());
      for (const particle of particles) particle.$clear();
      // Not the bursts that are there from the start: those an emitter has
      // emitted it does not emit again.
      for (const emitter of emitters) this.$states.set(emitter, fresh(0, this.$states.get(emitter)?.generated));
      this.$before = 0;
      this.$numbered = 0;
    },
    $seed() {
      return this.useRandomSeed ? this.$chance : Math.trunc(Number(this.seed) || 0);
    },
    // What the affectors that are for a kind of particle each do to one.
    $affecting(particle) {
      const found = [];
      for (const affector of this.$members().affectors) {
        if (!affector.enabled || !affector.$affects(particle)) continue;
        const affect = affector.$prepare(this);
        if (affect) found.push(affect);
      }
      return found;
    },
    // The time it is, with everything emitted that is to be by then. What
    // asks is asked again when the time or what the system has changes.
    $upTo() {
      this.$made();
      this.$members();
      void this.$time();
      void this.startTime;
      void this.running;
      return untrack(() => this.$sync());
    },
    // Has the emitters emit what the time since it was last here gives.
    // The time the system is at without `startTime`: nought until `time`
    // is something else than it was declared to be.
    $time() {
      const { time } = this;
      if (this.$declared === undefined) return 0;
      if (this.$declared !== null) {
        if (Object.is(time, this.$declared)) return 0;
        this.$declared = null;
      }
      return time;
    },
    $sync() {
      const now = this.$time() + this.startTime;
      if (!untrack(this.$made)) return now;
      const { emitters } = this.$members();
      for (const emitter of emitters) {
        let state = this.$states.get(emitter);
        // One that comes into the system starts from the time it is.
        if (!state) this.$states.set(emitter, (state = fresh(this.$before)));
        // And one that was not enabled from the time it is when it is, and
        // one that had no rate from the time it is when it has.
        if (!emitter.enabled) state.idle = true;
        else if (state.idle) {
          state.idle = false;
          state.previous = state.burstBefore = this.$before;
        }
        const rate = Number(emitter.emitRate) || 0;
        if (state.rate === 0 && rate !== 0) state.previous = this.$before;
        state.rate = rate;
      }
      // A system that is not running and whose time is nought has not
      // begun: there is nothing in it until its time is something. One
      // that was declared with a time has, at nought, as in Qt, which
      // brings a system to a time whenever its time changes, and whose
      // setting that time to nought is such a change. So has one with an
      // affector in it: an affector that comes to a system has Qt bring
      // the system to its time again.
      if (!this.$begun && now === 0 && !this.running && !this.$timed && !this.$members().affectors.length) return now;
      this.$begun = true;
      if (this.$at === now) return now;
      this.$updates++;
      for (const emitter of emitters) if (!emitter.$trail && emitter.enabled) emitter.$emit(this, this.$states.get(emitter), now);
      // Those that follow particles come after those that make them.
      trail(this, emitters, this.$states, now);
      this.$before = now;
      this.$at = now;
      return now;
    },
    // What a View3D draws of the system besides the models in it: its
    // sprites and its lines.
    $paint(opacity) {
      return painted(this, opacity);
    },
  },
  setup(self) {
    self.$particles = true;
    self.$chance = Math.floor(Math.random() * 0x7fffffff);
    self.$states = new Map();
    self.$before = 0;
    self.$numbered = 0;
    self.$at = null;
    self.$updates = 0;
    self.$begun = false;
    self.$log = inside(null, () => ParticleSystem3DLogging({}));
    // Nothing is emitted before all that was made with the system is as it
    // was declared, whatever asks what there is in it before then: a
    // particle is of the colour its kind is given where the system is used
    // (`Sparks { kind.color: "red" }`), as it is in Qt, whose systems begin
    // with the first frame.
    const [made, setMade] = signal(false, self.$owner);
    self.$made = made;
    last(() => {
      self.$declared = self.time;
      self.$timed = self.$declared !== 0;
      setMade(true);
      settle();
    });
    // What is the system's. Its emitters and its affectors the last made
    // first: the order Qt's do their work in, each of which comes to its
    // system when it is complete, and what was made last is complete first.
    self.$members = kept(self, () => {
      const emitters = [];
      const affectors = [];
      const particles = [];
      for (const other of enrolled()) {
        if (other.$particle) {
          if (other.$system() === self) particles.push(other);
        } else if (other.system === self) (other.$emitter ? emitters : affectors).push(other);
      }
      return { emitters: emitters.reverse(), affectors: affectors.reverse(), particles };
    });
    // The time goes while the system runs and is not paused: from nought
    // each time it is set running.
    let gone = 0;
    const job = {
      advance(delta) {
        gone += delta;
        slot(self, "time").write(Math.floor(gone));
      },
      idle: () => 0,
    };
    // To stop a system or start it is to have it not paused, and one that
    // is started again begins with nothing in it, as Qt's does.
    let ran = null;
    effect(
      () => Boolean(self.running),
      (running) => {
        if (running === ran) return;
        const again = ran !== null;
        ran = running;
        if (again) slot(self, "paused").write(false);
        if (!running) return;
        if (again) self.reset();
        gone = 0;
        slot(self, "time").write(0);
      },
    );
    effect(
      () => Boolean(self.running) && !self.paused,
      (going) => (going ? clock.add(job) : clock.remove(job)),
    );
    onCleanup(() => clock.remove(job));
    // A system nothing looks at emits all the same, so that what it has
    // when it is looked at is what the times it went through gave it.
    let since = 0;
    let longest = 0;
    let whole = 0;
    let squares = 0;
    effect(
      () => {
        for (const emitter of self.$members().emitters) void emitter.enabled;
        const before = self.$updates;
        const began = performance.now();
        const now = self.$upTo();
        return { now, took: self.$updates > before ? performance.now() - began : -1, logging: Boolean(self.logging) };
      },
      ({ now, took, logging }) => {
        if (!logging || took < 0) return;
        const log = self.$log;
        const count = self.$updates - since;
        longest = Math.max(longest, took);
        whole += took;
        squares += took * took;
        const every = untrack(() => log.loggingInterval);
        if (Math.floor(now / every) === Math.floor(self.$logged / every) && now >= self.$logged) return;
        self.$logged = now;
        const { particles } = untrack(() => self.$members());
        const average = count > 0 ? whole / count : 0;
        slot(log, "updates").write(count);
        slot(log, "particlesMax").write(particles.reduce((sum, particle) => sum + untrack(() => particle.maxAmount), 0));
        slot(log, "particlesUsed").write(particles.reduce((sum, particle) => sum + untrack(() => particle.$alive().length), 0));
        slot(log, "time").write(longest);
        slot(log, "timeAverage").write(average);
        slot(log, "timeDeviation").write(count > 0 ? Math.sqrt(Math.max(0, squares / count - average * average)) : 0);
        since = self.$updates;
        longest = whole = squares = 0;
      },
    );
    self.$logged = 0;
  },
});

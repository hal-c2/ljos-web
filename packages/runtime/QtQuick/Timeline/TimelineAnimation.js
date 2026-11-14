// TimelineAnimation: a NumberAnimation of a timeline's `currentFrame`.
//
// What it adds, as Qt does it:
// - It is the animation of the timeline whose `animations` it is in, and
//   starting it stops the timeline's others.
// - `finished` is its own signal, and comes whenever it stops, on its own or
//   told to: after `stopped`, before `running` is told to have changed.
// - `pingPong`: there and back again is one loop. Each way is a run of its
//   own, started when the one before has stopped, so `stopped` and `started`
//   come between them and `finished` only after the last; while it goes on,
//   `loops` reads 1, and on the way back `from` and `to` read each other's.
//   `running` is told again, as true, each time it turns round. Stopped by
//   hand it is over.
//
// Not here: `pingPong` does nothing in an animation that is not in a
// timeline's `animations`; what Qt makes of one there was not measured.
import { defineType, derived, slot } from "../../object.ts";
import { Animation } from "../animation/Animation.js";
import { NumberAnimation, PropertyAnimation } from "../animation/PropertyAnimation.js";
import { owning } from "./Timeline.js";

const inherited = (Type, name) => Object.getOwnPropertyDescriptor(Type.proto, name);
const FINISHED = inherited(Animation, "finished");
const LOOPS = inherited(Animation, "loops");
const TRANSITION = inherited(Animation, "$transition").value;
const ENDS = { from: inherited(PropertyAnimation, "from"), to: inherited(PropertyAnimation, "to") };

function turn(self, reversed) {
  self.$pong.reversed = reversed;
  slot(self, "from").changed();
  slot(self, "to").changed();
}

// Qt's `handleStarted`.
function started(self) {
  const timeline = self.$timeline;
  if (!timeline) return;
  for (const other of [...timeline.$timeline.made]) if (other !== self) other.stop();
  const pong = self.$pong;
  if (!self.pingPong || !pong.first) return;
  // Each way is run once; how many times there and back is counted here.
  pong.loops = LOOPS.get.call(self);
  pong.loop = 0;
  pong.first = false;
  pong.reversed = false;
  const job = self.$anim.job;
  if (job) job.loops = 1;
  slot(self, "loops").changed();
}

// Qt's `handleStopped`.
function stopped(self) {
  const pong = self.$pong;
  if (!self.pingPong || pong.loops === null) return void FINISHED.get.call(self)();
  if (pong.reversed) pong.loop++;
  const job = self.$anim.job;
  // It got to the end of its way, and there are ways left to go.
  if (job && !(job.time < job.duration()) && (pong.loop < pong.loops || pong.loops === -1)) {
    turn(self, !pong.reversed);
    self.start();
    self.runningChanged();
    return;
  }
  if (pong.reversed) turn(self, false);
  pong.first = true;
  pong.loops = null;
  slot(self, "loops").changed();
  FINISHED.get.call(self)();
}

export const TimelineAnimation = defineType("TimelineAnimation", NumberAnimation, {
  properties: {
    pingPong: false,
    property: "currentFrame",
    target: derived((self) => self.$timeline ?? undefined),
  },
  methods: {
    // What Animation emits when its job is over is not this signal: Qt's
    // TimelineAnimation has one of its own by the name, emitted above.
    get finished() {
      const emit = FINISHED.get.call(this);
      return (this.$pong.quiet ??= Object.assign(() => {}, { connect: emit.connect, disconnect: emit.disconnect }));
    },
    // `from` on the way back is what `to` was given, and the other way round.
    get from() {
      return ENDS[this.$pong.reversed ? "to" : "from"].get.call(this);
    },
    set from(value) {
      ENDS[this.$pong.reversed ? "to" : "from"].set.call(this, value);
    },
    get to() {
      return ENDS[this.$pong.reversed ? "from" : "to"].get.call(this);
    },
    set to(value) {
      ENDS[this.$pong.reversed ? "from" : "to"].set.call(this, value);
    },
    get loops() {
      return this.$pong.loops === null ? LOOPS.get.call(this) : 1;
    },
    set loops(loops) {
      LOOPS.set.call(this, loops);
    },
    $transition(actions, modified, reverse, defaultTarget) {
      const job = TRANSITION.call(this, actions, modified, reverse, defaultTarget);
      if (this.$pong.loops !== null) job.loops = 1;
      return job;
    },
  },
  setup(self) {
    self.$pong = { first: true, reversed: false, loop: 0, loops: null, quiet: null };
    self.$timeline = owning();
    self.$timeline?.$timeline.made.push(self);
    self.started.connect(() => started(self));
    self.stopped.connect(() => stopped(self));
  },
});

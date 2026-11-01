// Animation: what every animation is, and the ones that are about order and
// time rather than a property: the groups, the pause, the script.
//
// An animation object says what should happen. What happens is a job
// (jobs.js), made anew each time: when the animation starts, and when a
// Transition or a Behavior uses it for a change of theirs. `$transition` makes
// it, from the changes there are to animate (`actions`); what the animation
// takes of them it adds to `modified`, and the rest is not its business.
import { createEffect, createMemo, onCleanup } from "solid-js";
import { contents, defineType, flush, QtObject, slot, whenComplete } from "../../object.js";
import { drain, later } from "./clock.js";
import { ActionJob, ParallelJob, PauseJob, RUNNING, SequentialJob } from "./jobs.js";
import { signal, untrack } from "#kernel";

const SYNC = { sync: true };
const DEFER = { defer: true };
const NONE = Object.freeze([]);
const next = (version) => version + 1;

// `Animation.Infinite` is -2, and `loops` reads as -1 once it is set to it.
const loopsOf = (self) => {
  const loops = slot(self, "loops").get();
  return loops < 0 ? -1 : loops;
};

// Does what a binding says: now, and whenever it says otherwise.
export function follow(value, apply) {
  apply(untrack(value));
  createEffect(value, (next) => later(() => apply(next)), DEFER);
}

function commence(self) {
  const anim = self.$anim;
  const old = anim.job;
  if (old) {
    old.listener = null;
    old.stop();
  }
  const job = (anim.job = self.$transition(NONE, [], false, null));
  job.listener = anim.listener;
  flush();
  self.started();
  job.start();
}

// Qt's `setRunning`, to the letter: what `running` reads and which signal
// comes first depend on it. Stopping an animation that always runs to its
// end only shortens it, and starting one that is on its last loop for that
// reason gives it its loops back.
function setRunning(self, run) {
  const anim = self.$anim;
  if (!anim.complete) {
    anim.early = run;
    return;
  }
  drain();
  // One in a group, a Transition or a Behavior runs when that does.
  if (anim.running === run || self.$group) return;
  untrack(() => {
    anim.running = run;
    const loops = loopsOf(self);
    const job = anim.job;
    if (run) {
      if (self.alwaysRunToEnd && loops !== 1 && job?.state === RUNNING) {
        job.loops = loops < 0 ? -1 : job.loop + loops;
      } else {
        commence(self);
      }
    } else {
      if (anim.paused) {
        anim.paused = false;
        anim.bump(next);
      }
      if (job) {
        if (self.alwaysRunToEnd) {
          if (loops !== 1) job.loops = job.loop + 1;
        } else {
          job.stop();
          flush();
          self.stopped();
        }
      }
    }
    // An animation with no duration has ended by the time it has started.
    if (anim.running !== run) anim.running = anim.job?.state === RUNNING;
    anim.bump(next);
    flush();
  });
}

function setPaused(self, paused) {
  const anim = self.$anim;
  if (anim.paused === paused || !anim.running || self.$group) return;
  anim.paused = paused;
  if (!anim.job) return;
  if (paused) anim.job.pause();
  else anim.job.resume();
  anim.bump(next);
  flush();
}

function ended(self) {
  const anim = self.$anim;
  setRunning(self, false);
  untrack(() => {
    if (self.alwaysRunToEnd) {
      flush();
      self.stopped();
      const loops = loopsOf(self);
      if (loops !== 1) anim.job.loops = loops;
    }
    flush();
    self.finished();
  });
}

// A loop has ended. If what the animation says changed while it ran, the
// next loop is as it says now: the job is made again and put where it was.
function relooped(self, job) {
  const anim = self.$anim;
  if (job !== anim.job || !untrack(() => self.$stale(job))) return;
  const loop = job.loop;
  job.listener = null;
  job.stop();
  const fresh = (anim.job = untrack(() => self.$transition(NONE, [], false, null)));
  fresh.listener = anim.listener;
  fresh.start();
  const duration = fresh.duration();
  if (duration > 0) fresh.setCurrentTime(loop * duration);
}

export const Animation = defineType("Animation", QtObject, {
  properties: {
    running: false,
    paused: false,
    alwaysRunToEnd: false,
    loops: 1,
  },
  signals: ["started", "stopped", "finished"],
  enums: { Infinite: -2 },
  methods: {
    // These read what the animation is doing, not what it was told.
    get running() {
      const anim = this.$anim;
      anim.version();
      return anim.running;
    },
    set running(run) {
      // From here on a binding it had does not decide.
      this.$anim.assigned = true;
      setRunning(this, Boolean(run));
    },
    get paused() {
      const anim = this.$anim;
      anim.version();
      return anim.paused;
    },
    set paused(paused) {
      setPaused(this, Boolean(paused));
    },
    get loops() {
      return loopsOf(this);
    },
    set loops(loops) {
      slot(this, "loops").set(loops);
    },
    start() {
      setRunning(this, true);
    },
    stop() {
      setRunning(this, false);
    },
    restart() {
      setRunning(this, false);
      setRunning(this, true);
    },
    pause() {
      setPaused(this, true);
    },
    resume() {
      setPaused(this, false);
    },
    // To the end of the loop it is in, as Qt does.
    complete() {
      const anim = this.$anim;
      if (!anim.running || !anim.job) return;
      anim.job.setCurrentTime(anim.job.duration());
      flush();
    },
    $transition(actions, modified, reverse, defaultTarget) {
      const job = this.$make(actions, modified, reverse, defaultTarget);
      job.loops = loopsOf(this);
      return job;
    },
    $make() {
      return new ActionJob(null);
    },
    $stale() {
      return false;
    },
    // What a Behavior tells its animation, which it runs itself.
    $ran(running) {
      const anim = this.$anim;
      if (anim.running === running) return;
      anim.running = running;
      anim.bump(next);
    },
  },
  setup(self, props) {
    const [version, bump] = signal(0, self.$owner);
    const anim = (self.$anim = {
      running: false,
      paused: false,
      job: null,
      complete: false,
      early: undefined,
      assigned: false,
      version,
      bump,
      listener: {
        finished: () => ended(self),
        loopChanged: (job) => relooped(self, job),
      },
    });
    // The group, Transition or Behavior it is in, and the property it is the
    // value source of or was told to default to.
    self.$group = null;
    self.$source = null;
    whenComplete(() => {
      anim.complete = true;
      if (self.$group) return;
      if (props.$property) self.$source = { object: untrack(() => props.$target), key: props.$property };
      // `NumberAnimation on x {}` runs unless it says otherwise.
      const given = slot(self, "running");
      const wanted = createMemo(() => (given.explicit() ? Boolean(given.own()) : self.$source !== null), SYNC);
      follow(wanted, (run) => {
        if (!anim.assigned) setRunning(self, run);
      });
      const paused = slot(self, "paused");
      follow(
        createMemo(() => Boolean(paused.own() && wanted()), SYNC),
        (hold) => setPaused(self, hold),
      );
      if (anim.early !== undefined) setRunning(self, anim.early);
      onCleanup(() => {
        anim.complete = false;
        if (!anim.job) return;
        anim.job.listener = null;
        anim.job.stop();
      });
    });
  },
});

export const PauseAnimation = defineType("PauseAnimation", Animation, {
  properties: { duration: 250 },
  methods: {
    $make() {
      return new PauseJob(Math.max(0, this.duration));
    },
    $stale(job) {
      return job.length !== this.duration;
    },
  },
});

// In a transition, `scriptName` names the StateChangeScript of the state
// being entered that is to run at this point of it rather than at once.
export const ScriptAction = defineType("ScriptAction", Animation, {
  properties: { script: undefined, scriptName: "" },
  methods: {
    $make(actions, modified, reverse) {
      const name = this.scriptName;
      if (name) {
        for (const action of actions) {
          if (action.event !== "script" || action.name !== name) continue;
          action.done = true;
          // On the way back the state's script is not run again.
          return new ActionJob(reverse ? null : action.run);
        }
      }
      return new ActionJob(() => untrack(() => this.script)?.());
    },
  },
});

// The jobs of a group's animations, in the order they claim what there is
// to animate: backwards, the last one first.
function jobs(self, actions, modified, reverse, defaultTarget) {
  const animations = self.$animations;
  const made = [];
  for (let index = 0; index < animations.length; index++) {
    const animation = animations[reverse ? animations.length - 1 - index : index];
    if (self.$source) animation.$source = self.$source;
    made.push(animation.$transition(actions, modified, reverse, defaultTarget));
  }
  return made;
}

// Animations side by side. Run backwards they end together where forwards
// they start together, so each waits for as long as it is shorter.
export function parallel(self, actions, modified, reverse, defaultTarget) {
  const group = new ParallelJob();
  const made = jobs(self, actions, modified, reverse, defaultTarget);
  let longest = 0;
  if (reverse) {
    for (const job of made) {
      const total = job.totalDuration();
      if (total < 0) {
        longest = -1;
        break;
      }
      if (total > longest) longest = total;
    }
  }
  for (const job of made) {
    const wait = longest > 0 ? longest - job.totalDuration() : 0;
    if (wait > 0) {
      const delayed = new SequentialJob();
      delayed.add(new PauseJob(wait));
      delayed.add(job);
      group.add(delayed);
    } else {
      group.add(job);
    }
  }
  return group;
}

const grouping = {
  $stale(job) {
    const animations = this.$animations;
    for (let index = 0; index < animations.length; index++) {
      if (animations[index].$stale(job.children[index])) return true;
    }
    return false;
  },
};

function adopt(self, props) {
  self.$animations = contents(props);
  for (const animation of self.$animations) animation.$group = self;
}

function setup(self) {
  self.$animations = NONE;
}

export const SequentialAnimation = defineType("SequentialAnimation", Animation, {
  methods: {
    ...grouping,
    $make(actions, modified, reverse, defaultTarget) {
      const group = new SequentialJob();
      for (const job of jobs(this, actions, modified, reverse, defaultTarget)) group.add(job);
      return group;
    },
  },
  setup,
  adopt,
});

export const ParallelAnimation = defineType("ParallelAnimation", Animation, {
  methods: {
    ...grouping,
    $make(actions, modified, reverse, defaultTarget) {
      return parallel(this, actions, modified, reverse, defaultTarget);
    },
  },
  setup,
  adopt,
});

// Timer and FrameAnimation: something to do after a while, and something to
// do every frame. Both are on the clock the animations are on, so a timer
// and an animation of the same length end in the same frame, and a test
// moves them with the same hand.
import { createEffect, createMemo, createRenderEffect, onCleanup } from "solid-js";
import { defineType, flush, QtObject, slot, whenComplete } from "../../object.js";
import { follow } from "./Animation.js";
import { clock, drain } from "./clock.js";
import { PauseJob } from "./jobs.js";
import { signal, untrack } from "#kernel";

const SYNC = { sync: true };
const next = (version) => version + 1;

// Starts the wait over, as it is now: Qt does on every change to a timer.
function update(self) {
  const timer = self.$timer;
  if (!timer.complete) return;
  const job = timer.job;
  job.listener = null;
  job.stop();
  if (!timer.running) return;
  untrack(() => {
    job.length = Math.max(0, self.interval);
    job.loops = self.repeat ? -1 : 1;
    job.listener = timer.listener;
    job.start();
    // Not from inside `start()`: once whoever started it is done.
    if (self.triggeredOnStart && timer.first && timer.running) queueMicrotask(() => ticked(self));
  });
}

function setRunning(self, run) {
  const timer = self.$timer;
  drain();
  if (timer.running === run) return;
  timer.running = run;
  timer.first = true;
  timer.bump(next);
  update(self);
  flush();
}

function ticked(self) {
  const timer = self.$timer;
  const due = timer.running && (timer.job.total > 0 || (timer.first && untrack(() => self.triggeredOnStart)));
  timer.first = false;
  if (!due) return;
  flush();
  self.triggered();
}

// A timer that does not repeat has stopped by the time it says so.
function finished(self) {
  const timer = self.$timer;
  if (!timer.running || untrack(() => self.repeat)) return;
  timer.running = false;
  timer.first = false;
  flush();
  self.triggered();
  timer.bump(next);
  flush();
}

export const Timer = defineType("Timer", QtObject, {
  properties: {
    interval: 1000,
    repeat: false,
    running: false,
    triggeredOnStart: false,
  },
  signals: ["triggered"],
  methods: {
    get running() {
      const timer = this.$timer;
      timer.version();
      return timer.running;
    },
    set running(run) {
      this.$timer.assigned = true;
      setRunning(this, Boolean(run));
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
  },
  setup(self) {
    const [version, bump] = signal(0, self.$owner);
    const timer = (self.$timer = {
      running: false,
      first: true,
      complete: false,
      assigned: false,
      job: new PauseJob(0),
      version,
      bump,
      listener: {
        finished: () => finished(self),
        loopChanged: () => ticked(self),
      },
    });
    whenComplete(() => {
      // What it was told before it was complete, it does now.
      const early = timer.running;
      timer.running = false;
      timer.complete = true;
      const given = slot(self, "running");
      follow(
        createMemo(() => Boolean(given.get()), SYNC),
        (run) => {
          if (!timer.assigned) setRunning(self, run);
        },
      );
      createEffect(
        () => [self.interval, self.repeat, self.triggeredOnStart],
        () => update(self),
        { defer: true },
      );
      if (early) setRunning(self, true);
      onCleanup(() => {
        timer.complete = false;
        timer.job.listener = null;
        timer.job.stop();
      });
    });
  },
});

// Tells the time between frames. The properties are for reading: each
// frame writes them, and then says so.
class FrameJob {
  constructor(self) {
    this.self = self;
    this.skew = 0;
    this.first = true;
    this.frame = 0;
    this.smooth = 0;
    this.elapsed = 0;
  }

  idle() {
    return 0;
  }

  advance(delta) {
    const self = this.self;
    const frameTime = delta / 1000;
    this.smooth = 0.1 * frameTime + 0.9 * this.smooth;
    this.elapsed += frameTime;
    this.frame = this.first && this.frame > 0 ? 0 : this.frame + 1;
    this.first = false;
    this.publish(frameTime);
    flush();
    self.triggered();
  }

  publish(frameTime) {
    const self = this.self;
    slot(self, "frameTime").write(frameTime);
    slot(self, "smoothFrameTime").write(this.smooth);
    slot(self, "elapsedTime").write(this.elapsed);
    slot(self, "currentFrame").write(this.frame);
  }
}

export const FrameAnimation = defineType("FrameAnimation", QtObject, {
  properties: {
    running: false,
    paused: false,
    currentFrame: 0,
    frameTime: 0,
    smoothFrameTime: 0,
    elapsedTime: 0,
  },
  signals: ["triggered"],
  methods: {
    start() {
      this.running = true;
    },
    stop() {
      slot(this, "running").write(false);
      slot(this, "paused").write(false);
      flush();
    },
    restart() {
      this.stop();
      this.start();
    },
    pause() {
      this.paused = true;
    },
    resume() {
      this.paused = false;
    },
    reset() {
      const job = this.$frames;
      job.elapsed = 0;
      job.frame = 0;
      slot(this, "elapsedTime").write(0);
      slot(this, "currentFrame").write(0);
      flush();
    },
  },
  setup(self) {
    const job = (self.$frames = new FrameJob(self));
    let ran = false;
    whenComplete(() => {
      createRenderEffect(
        () => [Boolean(self.running), Boolean(self.paused)],
        ([running, paused]) => {
          // Each run starts counting again; a pause does not.
          if (running !== ran) job.first = true;
          ran = running;
          if (running && !paused) {
            if (job.first) job.elapsed = 0;
            clock.add(job);
          } else {
            clock.remove(job);
          }
        },
      );
      onCleanup(() => clock.remove(job));
    });
  },
});

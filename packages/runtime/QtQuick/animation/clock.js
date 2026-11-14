// The one clock everything timed runs on: animations, timers, frame
// callbacks. It asks the browser for frames only while something moves, and
// sleeps until the next deadline when all that is left is waiting.
//
// What runs on it is a job: `advance(delta)` moves it on by that many
// milliseconds, `idle()` says how long it only has to wait (0: it needs
// every frame). What a frame wrote is settled once, when all have run.
import { flush } from "../../object.ts";

const jobs = new Set();
// When the jobs were last advanced, and what is pending to do it again.
let last = 0;
let frame = 0;
let timeout = 0;
// The time being handed out while the jobs are advanced: a job started by
// another is not given it again.
let stepping = -1;
// Time stands still and a test moves it: `clock.stop()`, `clock.advance(ms)`.
let manual = false;

// A frame in a test is as long as one of Qt's.
const FRAME = 16;

// What a binding decides (`running: held`, a state's `when`) is found out by
// an effect, inside Solid's flush: nothing can be settled there, and a handler
// that assigned to a property could not either. So it is done after the
// flush: before time moves on, and before the browser gets a turn.
const pending = [];
let draining = false;
let queued = false;

export function later(work) {
  pending.push(work);
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    drain();
  });
}

// Does what was put off, in the order it was. What is told to happen now
// (`start()`, `state = "open"`) calls this first, to keep that order.
export function drain() {
  if (draining) return;
  draining = true;
  try {
    for (let index = 0; index < pending.length; index++) pending[index]();
  } finally {
    pending.length = 0;
    draining = false;
  }
}

function step(delta) {
  stepping = delta;
  try {
    for (const job of jobs) {
      const due = delta - job.skew;
      job.skew = 0;
      if (due > 0) job.advance(due);
    }
  } finally {
    stepping = -1;
  }
  flush();
  drain();
}

function elapsed() {
  const now = performance.now();
  const delta = Math.max(0, now - last);
  last = now;
  return delta;
}

function onFrame() {
  frame = 0;
  step(elapsed());
  schedule();
}

function onTimeout() {
  timeout = 0;
  step(elapsed());
  schedule();
}

// How long every job can be left alone: 0 when one needs the next frame.
function rest() {
  let wait = Infinity;
  for (const job of jobs) {
    const idle = job.idle();
    if (idle < wait) wait = idle;
    if (wait <= 0) return 0;
  }
  return wait;
}

function schedule() {
  if (manual || !jobs.size) return;
  const wait = rest();
  if (wait <= 0) {
    if (!frame) frame = requestAnimationFrame(onFrame);
    return;
  }
  if (timeout) clearTimeout(timeout);
  timeout = setTimeout(onTimeout, Math.max(0, wait - (performance.now() - last)));
}

function cancel() {
  if (frame) cancelAnimationFrame(frame);
  if (timeout) clearTimeout(timeout);
  frame = timeout = 0;
}

export const clock = {
  add(job) {
    if (jobs.has(job)) return;
    if (!jobs.size && !manual) last = performance.now();
    // A job starts now, not when the others were last advanced.
    job.skew = stepping >= 0 ? stepping : manual ? 0 : Math.max(0, performance.now() - last);
    jobs.add(job);
    schedule();
  },

  remove(job) {
    if (jobs.delete(job) && !jobs.size) cancel();
  },

  // What a job that was only waiting does when it has something to do.
  wake() {
    schedule();
  },

  get running() {
    return jobs.size > 0;
  },

  // For tests: time passes only when `advance` says so.
  stop() {
    manual = true;
    cancel();
  },

  resume() {
    manual = false;
    last = performance.now();
    schedule();
  },

  // Lets `ms` pass, a frame at a time, stopping at each deadline on the way
  // so that a timer fires when it is due and not at the frame after.
  advance(ms) {
    drain();
    let left = ms;
    while (left > 0) {
      if (!jobs.size) return;
      const wait = rest();
      const delta = Math.min(left, wait > 0 ? wait : FRAME);
      step(delta);
      left -= delta;
    }
  },
};

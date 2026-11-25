// Where playback is, as arithmetic on ticks.
//
// Qt steps a Lottie animation one frame per tick of `1000 / frameRate`
// milliseconds (rounded down), and the last frame is part of the run: twenty
// frames at ten a second show frame 20 at 2000 ms and finish at 2100 ms, on
// the tick that would step past it. A loop starts again on that same tick.
// Counted in ticks, any number of them can be moved at once (after being
// hidden, or when the clock comes late) without waking for each.

export const INFINITE = -1;

export class Playback {
  constructor({ start = 0, end = 0, direction = 1, loops = 1 } = {}) {
    this.start = start;
    this.end = end;
    this.direction = direction < 0 ? -1 : 1;
    this.loops = loops;
    this.frame = start;
    this.loopsDone = 0;
    this.playing = false;
  }

  get forward() {
    return this.direction >= 0;
  }

  // The frame a run starts on, and the one it ends on, in its direction.
  first() {
    return this.forward ? this.start : this.end;
  }

  last() {
    return this.forward ? this.end : this.start;
  }

  // Ticks in one whole run: every frame from first to last, then the tick
  // that wraps.
  runTicks() {
    return Math.floor(Math.max(this.end - this.start, 0)) + 1;
  }

  ticksToWrap() {
    const left = this.forward ? this.end - this.frame : this.frame - this.start;
    return Math.floor(Math.max(left, 0)) + 1;
  }

  get endless() {
    return this.loops === INFINITE;
  }

  // Runs still to wrap before it finishes, the one under way among them.
  runsLeft() {
    return Math.max(Math.max(this.loops, 1) - this.loopsDone, 1);
  }

  // Ticks from now to the one that finishes, or Infinity when it plays for
  // ever or is not playing.
  ticksToFinish() {
    if (!this.playing || this.endless) return Infinity;
    return this.ticksToWrap() + (this.runsLeft() - 1) * this.runTicks();
  }

  // Moves `ticks` ticks on. Whether one of them finished the animation,
  // which leaves it on its last frame and not playing.
  advance(ticks) {
    while (this.playing) {
      const step = this.forward ? 1 : -1;
      const toWrap = this.ticksToWrap();
      if (ticks < toWrap) {
        this.frame += step * ticks;
        return false;
      }
      ticks -= toWrap;
      this.loopsDone++;
      if (!this.endless && this.loopsDone >= Math.max(this.loops, 1)) {
        this.frame = this.last();
        this.playing = false;
        return true;
      }
      // Whole runs in between change nothing but the count.
      const run = this.runTicks();
      let whole = Math.floor(ticks / run);
      if (!this.endless) whole = Math.min(whole, this.runsLeft() - 1);
      ticks -= whole * run;
      this.loopsDone = this.endless ? 0 : this.loopsDone + whole;
      this.frame = this.first();
    }
    return false;
  }

  // Back to the first frame of a run, playing: what `start()` does.
  restart() {
    this.frame = this.first();
    this.loopsDone = 0;
    this.playing = true;
  }

  clamp(frame) {
    return Math.min(Math.max(frame, this.start), Math.max(this.end, this.start));
  }
}

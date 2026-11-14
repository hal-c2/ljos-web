// What runs when an animation does. An `Animation` object is a description;
// each time it starts, and each time a transition or a Behavior uses it, it
// makes a job from what it says then. Jobs keep time the way Qt's do (loops,
// groups, animations with no set length), so that what a QML file observes
// (which value at which moment, which signal first) is what Qt would show.
//
// Times are milliseconds. A job in a group is driven by the group; one on
// its own is on the clock.
import { draw, drawing } from "../drawn.ts";
import { clock } from "./clock.js";
import { mix, rgba } from "./property.js";

export const STOPPED = 0;
export const PAUSED = 1;
export const RUNNING = 2;

export class Job {
  constructor() {
    // -1: for ever.
    this.loops = 1;
    this.group = null;
    this.state = STOPPED;
    // Time since the start, and within the current loop.
    this.total = 0;
    this.time = 0;
    this.loop = 0;
    // For a job with no set length: when it turned out to end, once it has.
    this.finishTime = -1;
    this.loopStart = 0;
    // Told when the job finishes, changes state or starts a loop:
    // `finished(job)`, `stateChanged(job, state, old)`, `loopChanged(job)`.
    this.listener = null;
    this.skew = 0;
  }

  // -1: until the job says so (a spring settles when it settles).
  duration() {
    return 0;
  }

  totalDuration() {
    const duration = this.duration();
    if (duration <= 0) return duration;
    return this.loops < 0 ? -1 : duration * this.loops;
  }

  // For the clock: how long the job only waits. 0: it needs every frame.
  idle() {
    return 0;
  }

  advance(delta) {
    this.setCurrentTime(this.total + delta);
  }

  setState(state) {
    if (this.state === state || this.loops === 0) return;
    const old = this.state;
    const oldTime = this.time;
    const oldLoop = this.loop;
    if (old === STOPPED) {
      this.total = this.time = 0;
      this.finishTime = -1;
      if (!this.group) this.loopStart = 0;
    }
    this.state = state;
    const top = !this.group || this.group.state === STOPPED;
    if (old === RUNNING) clock.remove(this);
    else if (state === RUNNING && top) clock.add(this);
    // Starting counts as starting a loop.
    if (state === RUNNING && old === STOPPED && !this.group) this.startLoop();
    this.updateState(state, old);
    if (state !== this.state) return;
    // What waited for all of it to be over: see DrawnJob.
    if (state === STOPPED && this.waiting) {
      const waiting = this.waiting;
      this.waiting = null;
      for (const job of waiting) job.settle();
    }
    this.listener?.stateChanged?.(this, state, old);
    if (state !== this.state) return;
    if (state === RUNNING) {
      if (old !== STOPPED) return;
      this.loop = 0;
      // So that what the job sets at its start is set now, not a frame on.
      if (top) this.setCurrentTime(this.total);
    } else if (state === STOPPED) {
      const duration = this.duration();
      if (duration === -1 || this.loops < 0 || oldTime * (oldLoop + 1) === duration * this.loops) this.finished();
    }
  }

  setCurrentTime(time) {
    if (time < 0) time = 0;
    const duration = this.duration();
    const oldLoop = this.loop;
    let end;
    if (duration < 0) {
      end = -1;
      if (this.finishTime >= 0 && time >= this.finishTime) {
        time = this.finishTime;
        if (this.loop === this.loops - 1) {
          end = this.finishTime;
        } else {
          this.loop++;
          this.loopStart = time;
          this.finishTime = -1;
        }
      }
      this.total = time;
      this.time = time - this.loopStart;
    } else {
      end = duration <= 0 ? duration : this.loops < 0 ? -1 : duration * this.loops;
      if (end !== -1 && time > end) time = end;
      this.total = time;
      this.loop = duration <= 0 ? 0 : Math.floor(time / duration);
      if (this.loop === this.loops) {
        this.time = Math.max(0, duration);
        this.loop = Math.max(0, this.loops - 1);
      } else {
        this.time = duration <= 0 ? time : time % duration;
      }
    }
    if (this.loop !== oldLoop && !this.group) this.startLoop();
    this.updateTime(this.time);
    if (this.loop !== oldLoop) this.listener?.loopChanged?.(this);
    if (this.total === end) this.stop();
  }

  startLoop() {
    this.finishTime = -1;
    if (this.group) this.loopStart = 0;
    this.loopStarted();
  }

  start() {
    this.setState(RUNNING);
  }

  stop() {
    this.setState(STOPPED);
  }

  pause() {
    if (this.state !== STOPPED) this.setState(PAUSED);
  }

  resume() {
    if (this.state === PAUSED) this.setState(RUNNING);
  }

  finished() {
    this.listener?.finished?.(this);
    // A group cannot tell from the time that this one is done.
    if (this.group && (this.duration() === -1 || this.loops < 0)) this.group.childFinished(this);
  }

  updateState() {}
  updateTime() {}
  loopStarted() {}
  childFinished() {}
}

// PauseAnimation, and a Timer's interval.
export class PauseJob extends Job {
  constructor(length) {
    super();
    this.length = length;
  }

  duration() {
    return this.length;
  }

  idle() {
    return this.length - this.time;
  }
}

// ScriptAction, PropertyAction: no time, something done when it is reached.
export class ActionJob extends Job {
  constructor(run) {
    super();
    this.run = run;
  }

  updateState(state) {
    if (state === RUNNING) this.run?.();
  }
}

const NUMBER = 1;
const COLOUR = 2;
const OTHER = 3;

function put(action, value) {
  if (action.shown) action.property.show(value);
  else action.property.write(value);
}

// The value `progress` of the way from an action's `from` to its `to`.
// Numbers and colours are on the way; anything else stays where it is until
// the end.
function between(action, progress, rotate) {
  if (!action.kind) {
    const { from, to } = action;
    if (typeof from === "number" && typeof to === "number") {
      action.kind = NUMBER;
    } else {
      action.a = rgba(from);
      action.b = rgba(to);
      action.kind = action.a && action.b ? COLOUR : OTHER;
    }
  }
  if (action.kind === NUMBER) {
    return rotate ? rotate(action.from, action.to, progress) : action.from + (action.to - action.from) * progress;
  }
  return action.kind === COLOUR ? mix(action.a, action.b, progress) : undefined;
}

// A PropertyAnimation at work: `actions` are `{ property, from, to, shown }`,
// each property going from one value to the other along the curve.
export class AnimatorJob extends Job {
  constructor(length, ease, actions) {
    super();
    this.length = length;
    this.ease = ease;
    this.actions = actions;
    // `from` was given, rather than being where the property is at the start.
    this.fromDefined = false;
    this.sourced = false;
    // In a transition run backwards the curve is too: it ends as it began.
    this.mirrored = false;
    this.rotate = null;
  }

  duration() {
    return this.length;
  }

  updateTime(time) {
    if (this.state === STOPPED || !this.actions.length) return;
    const t = this.length === 0 ? 1 : Math.min(1, Math.max(0, time / this.length));
    const progress = this.mirrored ? 1 - this.ease(1 - t) : this.ease(t);
    for (const action of this.actions) {
      if (progress === 1) {
        put(action, action.to);
        continue;
      }
      if (!this.sourced && !this.fromDefined) {
        action.from = action.property.get();
        action.kind = 0;
      }
      const value = between(action, progress, this.rotate);
      if (value !== undefined) put(action, value);
    }
    this.sourced = true;
  }

  // An animation that runs once starts from where the property is each
  // time; one that loops, from where it was the first time.
  loopStarted() {
    if (this.loops === 1) this.sourced = false;
  }
}

// An animator at work: what is drawn goes from one value to the other, and
// the property is told where it got to when the job is over. In a group that
// is when the whole group is, as in Qt.
export class DrawnJob extends AnimatorJob {
  constructor(length, ease, actions) {
    super(length, ease, actions);
    this.at = null;
    // Clockwise ends where it was told to, the other ways where they got to.
    this.exact = true;
  }

  updateTime(time) {
    if (this.state === STOPPED || !this.actions.length) return;
    const t = this.length === 0 ? 1 : Math.min(1, Math.max(0, time / this.length));
    const progress = this.ease(t);
    this.at ??= new Array(this.actions.length);
    this.actions.forEach((action, index) => {
      const { object, key } = action.property;
      if (!this.sourced && !this.fromDefined) {
        const over = drawing(object)?.[key];
        action.from = over === undefined ? action.property.get() : over;
        action.kind = 0;
      }
      const value = progress === 1 && this.exact ? action.to : between(action, progress, this.rotate);
      if (value === undefined) return;
      this.at[index] = value;
      if (object.$touch) draw(object, key, value);
    });
    this.sourced = true;
  }

  updateState(state) {
    if (state !== STOPPED) return;
    let top = this;
    while (top.group) top = top.group;
    if (top === this || top.state === STOPPED) this.settle();
    else (top.waiting ??= new Set()).add(this);
  }

  settle() {
    const at = this.at;
    if (!at) return;
    this.at = null;
    this.actions.forEach((action, index) => {
      const { object, key } = action.property;
      if (object.$touch) draw(object, key, undefined);
      if (at[index] !== undefined) put(action, at[index]);
    });
  }
}

class GroupJob extends Job {
  constructor() {
    super();
    this.children = [];
  }

  add(child) {
    child.group?.remove(child);
    child.group = this;
    this.children.push(child);
  }

  remove(child) {
    const index = this.children.indexOf(child);
    if (index < 0) return;
    this.children.splice(index, 1);
    child.group = null;
    child.finishTime = -1;
    if (!this.children.length) {
      this.time = 0;
      this.stop();
    }
  }

  loopStarted() {
    for (const child of this.children) child.startLoop();
  }
}

// How long a child takes: what it says, or what it turned out to take.
function taken(child) {
  const total = child.totalDuration();
  if (total === -1) {
    const done = child.finishTime;
    if (done >= 0 && (child.loops - 1 === child.loop || child.state === STOPPED)) return done;
  }
  return total;
}

export class SequentialJob extends GroupJob {
  constructor() {
    super();
    this.current = -1;
    this.previousLoop = 0;
    // Where `locate` found the time to be.
    this.found = 0;
    this.offset = 0;
    this.after = false;
  }

  add(child) {
    super.add(child);
    if (this.current < 0) this.current = 0;
  }

  duration() {
    let sum = 0;
    for (const child of this.children) {
      const total = child.totalDuration();
      if (total === -1) return -1;
      sum += total;
    }
    return sum;
  }

  idle() {
    return this.current < 0 ? 0 : this.children[this.current].idle();
  }

  // The child the group's time falls in, and when that child starts.
  locate() {
    const children = this.children;
    let offset = 0;
    let duration = 0;
    this.after = false;
    for (let index = 0; index < children.length; index++) {
      duration = taken(children[index]);
      if (duration === -1 || this.time < offset + duration) {
        this.found = index;
        this.offset = offset;
        return;
      }
      if (index === this.current) this.after = true;
      offset += duration;
    }
    // Past the end, or nothing here takes any time: the last one.
    this.found = children.length - 1;
    this.offset = offset - duration;
  }

  atEnd() {
    const child = this.children[this.current];
    return this.loop === this.loops - 1 && this.current === this.children.length - 1 && child.time === taken(child);
  }

  // Runs each child passed over to its end, so that what it sets is set
  // and what it does is done.
  skipTo(found) {
    const children = this.children;
    if (this.previousLoop < this.loop) {
      for (let index = this.current; index < children.length; index++) {
        this.setCurrent(index, true);
        children[index].setCurrentTime(taken(children[index]));
      }
      if (children.length === 1) this.activate();
      else this.setCurrent(0, true);
    }
    for (let index = this.current; index < children.length && index !== found; index++) {
      this.setCurrent(index, true);
      children[index].setCurrentTime(taken(children[index]));
    }
  }

  updateTime(time) {
    if (this.current < 0) return;
    this.locate();
    const found = this.found;
    const offset = this.offset;
    if (this.previousLoop < this.loop || (this.current !== found && this.after)) this.skipTo(found);
    this.setCurrent(found);
    const child = this.children[this.current];
    const at = time - offset;
    child.setCurrentTime(at);
    if (this.state !== STOPPED && this.atEnd()) {
      this.time += child.time - at;
      this.stop();
    }
    this.previousLoop = this.loop;
  }

  updateState(state, old) {
    if (this.current < 0) return;
    const child = this.children[this.current];
    if (state === STOPPED) child.stop();
    else if (old === child.state && old !== STOPPED) child.setState(state);
    else this.restart();
  }

  restart() {
    this.previousLoop = 0;
    if (this.current === 0) this.activate();
    else this.setCurrent(0);
  }

  setCurrent(index, intermediate) {
    if (index === this.current) return;
    this.children[this.current]?.stop();
    this.current = index;
    this.activate(intermediate);
  }

  activate(intermediate) {
    if (this.current < 0 || this.state === STOPPED) return;
    const child = this.children[this.current];
    child.stop();
    if (child.totalDuration() === -1) child.finishTime = -1;
    child.start();
    if (!intermediate && this.state === PAUSED) child.pause();
  }

  childFinished(child) {
    const children = this.children;
    child.finishTime = child.time;
    let total = this.time;
    const index = children.indexOf(child);
    if (this.current + 1 < children.length) this.setCurrent(this.current + 1);
    for (let next = index + 1; next < children.length; next++) {
      const duration = children[next].duration();
      if (duration === -1) {
        total = -1;
        break;
      }
      total += duration;
    }
    if (total >= 0) this.finishTime = total;
    if (this.state !== STOPPED && this.atEnd()) this.stop();
  }

  remove(child) {
    super.remove(child);
    this.current = this.children.length ? 0 : -1;
  }
}

const open = (child) => child.duration() === -1 || child.loops < 0;

export class ParallelJob extends GroupJob {
  constructor() {
    super();
    this.previousLoop = 0;
    this.previousTime = 0;
  }

  duration() {
    let longest = 0;
    for (const child of this.children) {
      const total = child.totalDuration();
      if (total === -1) return -1;
      if (total > longest) longest = total;
    }
    return longest;
  }

  idle() {
    let wait = Infinity;
    for (const child of this.children) {
      if (child.state !== RUNNING) continue;
      const idle = child.idle();
      if (idle < wait) wait = idle;
    }
    return wait === Infinity ? 0 : wait;
  }

  updateTime() {
    const children = this.children;
    if (!children.length) return;
    const looped = this.loop > this.previousLoop;
    if (looped) {
      // The loop that ended ends for each child still on its way.
      let duration = this.duration();
      if (duration < 0) {
        for (const child of children) duration = Math.max(duration, child.totalDuration());
      }
      if (duration > 0) {
        for (const child of children) if (child.state !== STOPPED) child.setCurrentTime(duration);
      }
    }
    for (const child of children) {
      const total = child.totalDuration();
      if (looped || this.shouldStart(child, this.previousTime > total)) this.match(child);
      if (child.state === this.state) {
        child.setCurrentTime(this.time);
        if (total > 0 && this.time > total) child.stop();
      }
    }
    this.previousLoop = this.loop;
    this.previousTime = this.time;
  }

  updateState(state, old) {
    for (const child of this.children) {
      if (state === STOPPED) {
        child.stop();
      } else if (state === PAUSED) {
        if (child.state === RUNNING) child.pause();
      } else {
        if (old === STOPPED) {
          child.stop();
          this.previousLoop = 0;
          this.previousTime = 0;
        }
        child.finishTime = -1;
        if (this.shouldStart(child, old === STOPPED)) child.start();
      }
    }
  }

  shouldStart(child, alsoAtEnd) {
    const total = child.totalDuration();
    if (total === -1) return child.finishTime === -1;
    return alsoAtEnd ? this.time <= total : this.time < total;
  }

  match(child) {
    if (this.state === RUNNING) child.start();
    else if (this.state === PAUSED) child.pause();
  }

  childFinished(finished) {
    let waiting = 0;
    for (const child of this.children) {
      if (child === finished) child.finishTime = child.time;
      else if (open(child) && child.finishTime === -1) waiting++;
    }
    if (waiting) return;
    let longest = 0;
    let running = false;
    for (const child of this.children) {
      if (child.state === RUNNING) running = true;
      longest = Math.max(longest, child.totalDuration());
    }
    this.finishTime = Math.max(longest + this.loopStart, this.time);
    if (!running && this.loop === this.loops - 1) this.stop();
  }
}

// What a SpringAnimation or a SmoothedAnimation runs its properties in:
// each goes on until it has arrived, and the group until all have. A
// property already moving is taken into the next group as it is, which is
// how its velocity survives a new destination.
export class ContinuingJob extends GroupJob {
  duration() {
    return -1;
  }

  updateTime() {
    for (const child of this.children) {
      if (child.state === this.state) child.setCurrentTime(this.time);
    }
  }

  updateState(state) {
    if (state === STOPPED) {
      for (const child of [...this.children]) child.stop();
    } else if (state === PAUSED) {
      for (const child of this.children) if (child.state === RUNNING) child.pause();
    } else if (this.children.length) {
      for (const child of [...this.children]) {
        child.finishTime = -1;
        child.start();
      }
    } else {
      this.stop();
    }
  }

  childFinished(finished) {
    let waiting = 0;
    for (const child of this.children) {
      if (child === finished) child.finishTime = child.time;
      else if (child.finishTime === -1) waiting++;
    }
    if (waiting) return;
    this.finishTime = this.time;
    this.stop();
  }
}

// One property on a spring. Qt steps it 16 ms at a time whatever the frame
// rate, so the same is done here: the motion is then the same.
const TICK = 16;

export class SpringJob extends Job {
  constructor(action) {
    super();
    this.action = action;
    this.value = 0;
    this.to = 0;
    this.velocity = 0;
    this.startTime = 0;
    this.lastTime = 0;
    // For a move at a set velocity: how long it takes.
    this.length = -1;
    this.spring = 0;
    this.damping = 0;
    this.mass = 1;
    this.epsilon = 0.01;
    this.modulus = 0;
    this.maxVelocity = 0;
    this.skip = false;
  }

  duration() {
    return -1;
  }

  // A new destination while moving: time starts over, the velocity stays.
  retarget() {
    this.skip = this.state === RUNNING;
    if (this.skip) this.lastTime = this.startTime = 0;
  }

  updateState(state) {
    if (state === RUNNING) this.lastTime = this.startTime = 0;
  }

  // The shorter way round, for a value that wraps (an angle).
  distance(to) {
    let diff = to - this.value;
    const modulus = this.modulus;
    if (modulus && Math.abs(diff) > modulus / 2) diff += diff < 0 ? modulus : -modulus;
    return diff;
  }

  updateTime(time) {
    if (this.skip) {
      this.skip = false;
      return;
    }
    const springy = this.spring > 0;
    if (!springy && this.maxVelocity === 0) return this.stop();
    const elapsed = time - this.lastTime;
    if (!elapsed) return;
    const count = Math.floor(elapsed / TICK);
    if (springy) {
      if (elapsed < TICK) return;
      this.lastTime = time - (elapsed - count * TICK);
    } else {
      this.lastTime = time;
    }
    const modulus = this.modulus;
    let to = this.to;
    let stopped = false;
    if (modulus) {
      this.value %= modulus;
      to %= modulus;
    }
    if (springy) {
      for (let tick = 0; tick < count; tick++) {
        const force = this.spring * this.distance(to) - this.damping * this.velocity;
        this.velocity += this.mass === 1 ? force : force / this.mass;
        if (this.maxVelocity > 0) {
          this.velocity = Math.max(-this.maxVelocity, Math.min(this.maxVelocity, this.velocity));
        }
        this.value += (this.velocity * TICK) / 1000;
        if (modulus) {
          this.value %= modulus;
          if (this.value < 0) this.value += modulus;
        }
      }
      if (Math.abs(this.velocity) < this.epsilon && Math.abs(to - this.value) < this.epsilon) {
        this.velocity = 0;
        this.value = to;
        stopped = true;
      }
    } else {
      const moved = (elapsed * this.maxVelocity) / 1000;
      if (this.distance(to) > 0) {
        this.value += moved;
        if (modulus) this.value %= modulus;
      } else {
        this.value -= moved;
        if (modulus && this.value < 0) this.value = (this.value % modulus) + modulus;
      }
      if (this.lastTime - this.startTime >= this.length) {
        this.value = this.to;
        stopped = true;
      }
    }
    put(this.action, this.value);
    if (stopped) this.stop();
  }
}

// One property following its value at a velocity, easing in and out of it.
export class SmoothedJob extends Job {
  constructor(action) {
    super();
    this.action = action;
    this.to = 0;
    this.velocity = 200;
    this.userDuration = -1;
    this.maximumEasingTime = -1;
    // What to do when the value turns back: 0 ease round, 1 stop and go the
    // other way, 2 be there at once.
    this.reversingMode = 0;
    this.initialVelocity = 0;
    this.trackVelocity = 0;
    this.initialValue = 0;
    this.invert = false;
    this.lastTime = 0;
    this.skip = false;
    // The move: its length `tf`, the accelerations `a` and `d`, when the
    // cruise starts and ends (`tp`, `td`), its velocity and where it is then.
    this.s = this.vi = this.tf = this.a = this.d = this.tp = this.td = this.vp = this.sp = this.sd = 0;
  }

  duration() {
    return -1;
  }

  retarget() {
    this.initialVelocity = this.trackVelocity;
    this.skip = this.state === RUNNING;
    if (this.skip) {
      this.init();
      this.lastTime = 0;
    }
  }

  updateState(state) {
    if (state === RUNNING) this.init();
  }

  init() {
    if (this.velocity === 0) return this.stop();
    this.initialValue = Number(this.action.property.get());
    this.lastTime = this.time;
    if (this.to === this.initialValue) return this.stop();
    const reversed = this.trackVelocity !== 0 && !this.invert === this.initialValue - this.to > 0;
    if (reversed) {
      if (this.reversingMode === 2) {
        put(this.action, this.to);
        this.trackVelocity = 0;
        return this.stop();
      }
      this.initialVelocity = this.reversingMode === 1 ? 0 : -this.trackVelocity;
    }
    this.trackVelocity = this.initialVelocity;
    this.invert = this.to < this.initialValue;
    if (!this.plan()) {
      put(this.action, this.to);
      this.stop();
    }
  }

  plan() {
    const s = (this.s = (this.invert ? -1 : 1) * (this.to - this.initialValue));
    const vi = (this.vi = this.initialVelocity);
    const limit = this.userDuration / 1000;
    let tf;
    if (this.userDuration >= 0 && this.velocity > 0) tf = Math.min(s / this.velocity, limit);
    else if (this.userDuration >= 0) tf = limit;
    else if (this.velocity > 0) tf = s / this.velocity;
    else return false;
    this.tf = tf;
    const easing = this.maximumEasingTime / 1000;
    if (this.maximumEasingTime === 0) {
      this.a = this.d = this.tp = this.sp = 0;
      this.td = tf;
      this.vp = this.velocity;
      this.sd = s;
    } else if (this.maximumEasingTime !== -1 && tf > easing) {
      // Up to the cruising velocity over half the easing time, and down
      // from it over the other half.
      const ta = easing / 2;
      this.a = (s - (vi * tf - 0.5 * vi * ta)) / (tf * ta - ta * ta);
      this.vp = vi + this.a * ta;
      this.d = this.vp / ta;
      this.tp = ta;
      this.sp = vi * ta + 0.5 * this.a * ta * ta;
      this.sd = this.sp + this.vp * (tf - 2 * ta);
      this.td = tf - ta;
    } else {
      // No cruise: accelerate to the middle, decelerate from it.
      const c1 = 0.25 * tf * tf;
      const c2 = 0.5 * vi * tf - s;
      const c3 = -0.25 * vi * vi;
      const a = (-c2 + Math.sqrt(c2 * c2 - 4 * c1 * c3)) / (2 * c1);
      const tp = 0.5 * tf - (0.5 * vi) / a;
      this.a = this.d = a;
      this.tp = this.td = tp;
      this.vp = a * tp + vi;
      this.sp = this.sd = 0.5 * a * tp * tp + vi * tp;
    }
    return true;
  }

  updateTime(time) {
    if (this.skip) {
      this.skip = false;
      return;
    }
    if (this.state === STOPPED) return;
    let t = (time - this.lastTime) / 1000;
    let moved;
    let arrived = false;
    if (t < this.tp) {
      this.trackVelocity = this.vi + t * this.a;
      moved = 0.5 * this.a * t * t + this.vi * t;
    } else if (t < this.td) {
      t -= this.tp;
      this.trackVelocity = this.vp;
      moved = this.sp + t * this.vp;
    } else if (t < this.tf) {
      t -= this.td;
      this.trackVelocity = this.vp - t * this.a;
      moved = this.sd - 0.5 * this.d * t * t + this.vp * t;
    } else {
      this.trackVelocity = 0;
      moved = this.s;
      arrived = true;
    }
    put(this.action, arrived ? this.to : this.initialValue + (this.invert ? -moved : moved));
    if (arrived) this.stop();
  }
}

export { put };

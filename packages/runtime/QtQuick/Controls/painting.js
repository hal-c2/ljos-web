// What a style paints in C++ and not in QML: a busy indicator, the bar of a
// progress bar, a dial. In Qt these are items with a painter or scene graph
// nodes of their own; here a canvas where a painter is the only way, and
// elements otherwise. What moves is moved by the clock.
import { onCleanup } from "solid-js";
import { effect, slot } from "../../object.ts";
import { clock } from "../animation/clock.js";
import { rules } from "../compute.js";

rules(`
.qq-pictured { position: absolute; left: 0; top: 0; }
.qq-part { position: absolute; left: 0; top: 0; box-sizing: border-box; }
`);

// An element of a painter's own, in the item and under what is inside it.
export function part(parent, name = "") {
  const made = document.createElement("div");
  made.className = name ? `qq-part ${name}` : "qq-part";
  parent.append(made);
  return made;
}

// A canvas over the item. What is given back makes it of a size and empty,
// and answers the context to paint it with.
export function canvas(self) {
  const made = document.createElement("canvas");
  made.className = "qq-pictured";
  self.$node.append(made);
  const context = made.getContext("2d");
  return (width, height) => {
    // As fine as the screen is.
    const ratio = window.devicePixelRatio || 1;
    const wide = Math.max(0, Math.ceil(width * ratio));
    const tall = Math.max(0, Math.ceil(height * ratio));
    if (made.width === wide && made.height === tall) context.reset();
    else {
      // Giving a canvas its size empties it.
      made.width = wide;
      made.height = tall;
      made.style.width = `${wide / ratio}px`;
      made.style.height = `${tall / ratio}px`;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return context;
  };
}

// Qt's QQuickPaintedItem: a picture as large as the item, painted again
// when anything `read` reads changes. `read` answers what `paint` needs, or
// nothing when there is nothing to paint.
export function pictured(self, read, paint) {
  const sized = canvas(self);
  effect(
    () => ({ width: self.width, height: self.height, state: read() }),
    ({ width, height, state }) => {
      const context = sized(width, height);
      if (state && width > 0 && height > 0) paint(context, state, width, height);
    },
  );
}

const RADIANS = Math.PI / 180;

// `QPainterPath::arcTo`: an arc of the ellipse in a rectangle, from an
// angle and on by another, in degrees. A painter's angles go the other way
// around from a canvas's, from the same three o'clock.
export function arc(context, x, y, width, height, start, sweep) {
  context.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, -start * RADIANS, -(start + sweep) * RADIANS, sweep > 0);
}

// Qt's QQuickAnimatedNode, going around: time passes while there is
// something to move, and starts over when it is past `span`.
//
// `read` answers what there is to paint, or nothing: `moving` in it says
// whether time passes. `sync` is told when that changed, `move` what time
// it is, each time it is another. Time stays where it was while there is
// nothing to paint when `kept`; otherwise each run starts at none.
export function looped(self, span, read, sync, move, kept = false) {
  let time = 0;
  let state = null;
  let moving = false;
  const job = {
    skew: 0,
    advance(delta) {
      time += delta;
      if (time >= span) time = 0;
      move(state, Math.trunc(time));
    },
    idle: () => 0,
  };
  onCleanup(() => clock.remove(job));
  effect(read, (next) => {
    state = next ?? null;
    const moves = Boolean(state?.moving);
    if (moves && !moving && !kept) time = 0;
    moving = moves;
    if (moves) clock.add(job);
    else clock.remove(job);
    sync(state);
    if (state) move(state, Math.trunc(time));
  });
}

// Something that takes a while, once: `move` is told how much of the time
// has passed, from none of it to all, and nothing after that.
export function timed() {
  let time = 0;
  let span = 0;
  let move = null;
  function stop() {
    move = null;
    clock.remove(job);
  }
  const job = {
    skew: 0,
    advance(delta) {
      time = Math.min(time + delta, span);
      const told = move;
      if (time >= span) stop();
      told(time, span);
    },
    idle: () => 0,
  };
  onCleanup(stop);
  return {
    start(duration, work) {
      time = 0;
      span = duration;
      move = work;
      clock.add(job);
      work(0, span);
    },
    stop,
    running: () => move !== null,
    // How much of the time is still to pass.
    left: () => (move ? span - time : 0),
  };
}

// What a property was given, whatever it reads as: for one a type answers
// in its own way (`running` of something that runs while it is shown).
export function given(self, name) {
  const held = slot(self, name);
  // Asked for what tells when it is given another.
  held.explicit();
  return held.own();
}

// `running` of a busy indicator: it shows itself when it is to run, and a
// style fades it out when it is not, by its `opacity`: it hides itself when
// that has come to nothing, unless it is to run again by then.
export function hiding(self) {
  let was = false;
  let before = 1;
  effect(
    () => [Boolean(given(self, "running")), self.opacity],
    ([running, opacity]) => {
      if (running && !was) slot(self, "visible").write(true);
      else if (!running && opacity !== before && Math.abs(opacity) < 1e-12) slot(self, "visible").write(false);
      was = running;
      before = opacity;
    },
  );
}

// Whether there is anything to paint an item on.
export const shown = (self) => self.visible && self.width > 0 && self.height > 0;

// A bar that only says it is busy has parts that come from outside it and
// leave it: it clips while it is that, as Qt's does.
export function clipping(self) {
  let clipped = false;
  effect(
    () => Boolean(self.indeterminate),
    (indeterminate) => {
      if (indeterminate !== clipped) slot(self, "clip").write(indeterminate);
      clipped = indeterminate;
    },
  );
}

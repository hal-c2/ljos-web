// LottieAnimation: a Lottie (Bodymovin) file, played.
//
// The file is read here (model.js), each frame is worked out as paths
// (render.js) and the browser draws them as one SVG in the item. Playback
// is counted in Qt's ticks (playback.js) on the page's one clock, which has
// the animation as a job only while it plays: one at rest asks for no time.
//
// As in Qt, the file sets the frame rate, the first and last frames and the
// item's size once it is read, and what is painted is the file at its own
// size from the item's top left corner, scaled by `contentsScale`.
//
// Not as in Qt:
// - The file is fetched, so it is never ready by the time the component is
//   complete: `status` is Loading then, and Ready later.
// - An endless animation that cannot be seen holds its time, and goes on
//   from where it was when it is seen again. One that ends still ends on
//   time while it cannot be seen.
// - Image and text layers, masks and mattes are not drawn, as in Ljós; each
//   is said once, as information, when the file is read.
import { onCleanup } from "solid-js";
import { signal, untrack } from "#kernel";
import { guardedFetch } from "../../../guard.js";
import { defineType, effect, flush, located, native, slot, whenCompleted } from "../../../object.ts";
import { clock } from "../../../QtQuick/animation/clock.js";
import { css } from "../../../QtQuick/color.ts";
import { rules } from "../../../QtQuick/compute.ts";
import { PaintedItem, paintArea } from "../../../QtQuick/PaintedItem.js";
import { LoadError, parse } from "./model.js";
import { INFINITE, Playback } from "./playback.js";
import { render } from "./render.js";

const NULL = 0;
const LOADING = 1;
const READY = 2;
const ERROR = 3;
const LOW = 0;

const CATEGORY = "qt.lottieqt.lottie.parser";
const SVG = "http://www.w3.org/2000/svg";

rules(`
.qq-lottie { position: absolute; left: 0; top: 0; overflow: hidden; pointer-events: none; }
`);

// How long a tick is: `1000 / frameRate` ms, rounded down as Qt's timer.
const tickOf = (rate) => Math.max(1, Math.floor(1000 / Math.max(Math.trunc(rate) || 0, 1)));

// The file at `url`: its composition, or why there is none.
async function fetched(url) {
  let response;
  try {
    response = await guardedFetch(url);
  } catch {
    response = null;
  }
  if (!response?.ok) throw new LoadError(`Cannot open ${url}`);
  return parse(await response.text());
}

// Whether `self` can be seen: it has an area, and neither it nor an item it
// is in is hidden or fully transparent.
function seen(self) {
  if (!(self.width > 0 && self.height > 0) || !native(self, "visible")) return false;
  for (let at = self; at; at = at.parent) if (at.opacity <= 0) return false;
  return true;
}

const number = (v) => Math.round(v * 1000) / 1000;
const d = (path) => path.map((c) => c[0] + c.slice(1).map(number).join(" ")).join("");
const rgb = ([r, g, b]) => `rgb(${number(r * 255)} ${number(g * 255)} ${number(b * 255)})`;
let made = 0;

// The SVG of one frame. Its elements are kept from frame to frame, one for
// each path in the order they are painted, and only what changed is set.
function painter(face) {
  const root = document.createElementNS(SVG, "svg");
  root.setAttribute("class", "qq-lottie");
  const defs = document.createElementNS(SVG, "defs");
  const fill = document.createElementNS(SVG, "rect");
  const drawing = document.createElementNS(SVG, "g");
  root.append(defs, fill, drawing);
  // Under the item's children, which are drawn over what it paints.
  face.prepend(root);
  const paths = [];
  const gradients = [];
  const set = (element, name, value) => {
    if (value === null || value === undefined) {
      if (element.hasAttribute(name)) element.removeAttribute(name);
    } else if (element.getAttribute(name) !== String(value)) element.setAttribute(name, value);
  };
  // The gradient element at `index`, of the kind asked for.
  const gradient = (index, kind) => {
    let element = gradients[index];
    if (element?.localName !== kind) {
      const next = document.createElementNS(SVG, kind);
      next.id = `qq-lottie-${++made}`;
      next.setAttribute("gradientUnits", "userSpaceOnUse");
      if (element) element.replaceWith(next);
      else defs.append(next);
      gradients[index] = element = next;
    }
    return element;
  };
  const paint = (element, attribute, op, index) => {
    if (op.color) {
      set(element, attribute, rgb(op.color));
      set(element, `${attribute}-opacity`, op.color[3] < 1 ? number(op.color[3]) : null);
      return;
    }
    const g = op.gradient;
    const radial = Boolean(g.radial);
    const element2 = gradient(index, radial ? "radialGradient" : "linearGradient");
    if (radial) {
      const [cx, cy, r, fx, fy] = g.radial.map(number);
      Object.entries({ cx, cy, r, fx, fy }).forEach(([k, v]) => set(element2, k, v));
    } else {
      const [x1, y1, x2, y2] = g.linear.map(number);
      Object.entries({ x1, y1, x2, y2 }).forEach(([k, v]) => set(element2, k, v));
    }
    const stops = element2.children;
    while (stops.length > g.stops.length) stops[stops.length - 1].remove();
    g.stops.forEach((stop, i) => {
      const element3 = stops[i] ?? element2.appendChild(document.createElementNS(SVG, "stop"));
      set(element3, "offset", number(stop.offset));
      set(element3, "stop-color", rgb(stop.color));
      set(element3, "stop-opacity", number(stop.color[3]));
    });
    set(element, attribute, `url(#${element2.id})`);
    set(element, `${attribute}-opacity`, null);
  };
  return {
    root,
    draw({ ops, width, height, scale, color, low }) {
      set(root, "width", number(width));
      set(root, "height", number(height));
      root.style.width = `${number(width)}px`;
      root.style.height = `${number(height)}px`;
      set(root, "shape-rendering", low ? "optimizeSpeed" : null);
      set(fill, "width", number(width));
      set(fill, "height", number(height));
      set(fill, "fill", color);
      set(drawing, "transform", scale === 1 ? null : `scale(${number(scale)})`);
      while (paths.length > ops.length) paths.pop().remove();
      let used = 0;
      ops.forEach((op, i) => {
        let element = paths[i];
        if (!element) drawing.append((paths[i] = element = document.createElementNS(SVG, "path")));
        set(element, "d", d(op.path));
        const index = op.gradient ? used++ : -1;
        if (op.stroke) {
          const s = op.stroke;
          set(element, "fill", "none");
          set(element, "fill-rule", null);
          paint(element, "stroke", op, index);
          set(element, "stroke-width", number(s.width));
          set(element, "stroke-linecap", s.cap);
          set(element, "stroke-linejoin", s.join);
          set(element, "stroke-miterlimit", s.join === "miter" ? number(s.miter) : null);
          set(element, "stroke-dasharray", s.dashes ? s.dashes.map(number).join(" ") : null);
          set(element, "stroke-dashoffset", s.dashes && s.offset ? number(s.offset) : null);
        } else {
          for (const name of ["stroke", "stroke-opacity", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset"]) {
            set(element, name, null);
          }
          paint(element, "fill", op, index);
          set(element, "fill-rule", op.fill === "evenodd" ? "evenodd" : null);
        }
      });
      while (gradients.length > used) gradients.pop().remove();
    },
  };
}

export const LottieAnimation = defineType("LottieAnimation", PaintedItem, {
  properties: {
    source: "",
    status: NULL,
    frameRate: 30,
    autoPlay: true,
    loops: 1,
    quality: 2,
    direction: 1,
    startFrame: 0,
    endFrame: 0,
  },
  enums: {
    Null: NULL,
    Loading: LOADING,
    Ready: READY,
    Error: ERROR,
    LowQuality: 0,
    MediumQuality: 1,
    HighQuality: 2,
    Forward: 1,
    Reverse: -1,
    Infinite: INFINITE,
  },
  signals: ["finished"],
  methods: {
    // From the first frame (the last, in reverse), playing.
    start() {
      const state = this.$lottie;
      if (!state.composition) return;
      state.playback.restart();
      state.moved();
    },
    // Plays on from the frame shown.
    play() {
      const state = this.$lottie;
      if (!state.composition || state.playback.playing) return;
      state.playback.playing = true;
      state.spent = 0;
      state.moved();
    },
    pause() {
      const state = this.$lottie;
      state.playback.playing = false;
      state.moved();
    },
    togglePause() {
      if (this.$lottie.playback.playing) this.pause();
      else this.play();
    },
    // Back to the first frame, not playing, and nothing said of finishing.
    stop() {
      const { playback, moved } = this.$lottie;
      playback.playing = false;
      playback.loopsDone = 0;
      playback.frame = playback.start;
      moved();
    },
    // To a frame, or the frame of a marker by that name, and on from there:
    // whether there is such a marker.
    gotoAndPlay(frame) {
      return this.$lottie.goto(frame, true);
    },
    gotoAndStop(frame) {
      return this.$lottie.goto(frame, false);
    },
    // How long one run is: in seconds, or in frames when `inFrames`.
    getDuration(inFrames) {
      const frames = this.endFrame - this.startFrame;
      if (inFrames) return frames;
      return this.frameRate > 0 ? frames / this.frameRate : 0;
    },
  },
  setup(self) {
    const [painted, repaint] = signal(0, self.$owner);
    const [shown, setShown] = signal(false, self.$owner);
    // Loading is told as a change, as Qt tells it. A file given as the
    // object is made starts loading before its handlers listen, so that is
    // said once they do: as it is complete, unless the file came first.
    let complete = false;
    let loading = 0;
    whenCompleted(() => {
      complete = true;
      if (loading && loading === state.generation && !state.composition && untrack(() => self.status) === NULL) slot(self, "status").write(LOADING);
    });
    const state = (self.$lottie = {
      composition: null,
      playback: new Playback(),
      // Time handed out since the last tick, in ms.
      spent: 0,
      generation: 0,
      moved() {
        state.spent = 0;
        sync();
        repaint((n) => n + 1);
      },
      goto(to, playing) {
        const comp = state.composition;
        if (!comp) return false;
        let frame;
        let answer;
        if (typeof to === "string") {
          const marker = comp.markers.find((m) => m.name === to);
          if (!marker) return false;
          frame = marker.frame;
          answer = true;
        } else frame = Number(to);
        if (Number.isNaN(frame)) return answer;
        const { playback } = state;
        playback.frame = playback.clamp(Math.trunc(frame));
        playback.loopsDone = 0;
        playback.playing = playing;
        state.moved();
        return answer;
      },
    });
    const tick = () => tickOf(untrack(() => self.frameRate));
    // On the clock while it plays and either is seen or will finish.
    const job = {
      advance(ms) {
        const { playback } = state;
        if (!playback.playing) return;
        state.spent += ms;
        const length = tick();
        const ticks = Math.floor(state.spent / length);
        if (!ticks) return;
        state.spent -= ticks * length;
        const before = playback.frame;
        const finished = playback.advance(ticks);
        if (playback.frame !== before) repaint((n) => n + 1);
        if (finished) {
          sync();
          self.finished();
        }
      },
      idle() {
        const { playback } = state;
        const length = tick();
        if (untrack(shown)) return Math.max(length - state.spent, 0);
        return playback.ticksToFinish() * length - state.spent;
      },
    };
    function sync() {
      const { playback } = state;
      const wanted = Boolean(state.composition && playback.playing && (untrack(shown) || !playback.endless));
      if (wanted) {
        clock.add(job);
        clock.wake();
      } else clock.remove(job);
    }
    onCleanup(() => clock.remove(job));

    function arrived(generation, comp, error) {
      if (generation !== state.generation) return;
      if (error) {
        if (error instanceof LoadError && error.json) console.warn(`${CATEGORY}: ${error.message}`);
        slot(self, "status").write(ERROR);
        flush();
        return;
      }
      if (!comp.layers.length) console.warn(`${CATEGORY}: Layers are empty`);
      for (const warning of comp.warnings) console.info(`${CATEGORY}: ${warning}`);
      const start = Math.round(comp.inPoint);
      const end = Math.round(comp.outPoint);
      const { loops, direction, autoPlay } = untrack(() => ({ loops: self.loops, direction: self.direction, autoPlay: self.autoPlay }));
      state.composition = comp;
      state.playback = new Playback({ start, end, direction, loops });
      state.spent = 0;
      slot(self, "startFrame").write(start);
      slot(self, "endFrame").write(end);
      self.frameRate = Math.round(comp.frameRate);
      self.width = comp.width;
      self.height = comp.height;
      slot(self, "status").write(READY);
      if (autoPlay && state.generation === generation) state.playback.restart();
      state.moved();
      flush();
    }

    effect(
      () => located(String(self.source ?? "")),
      (url) => {
        const generation = ++state.generation;
        state.composition = null;
        state.playback.playing = false;
        state.moved();
        if (!url) {
          slot(self, "status").write(NULL);
          return;
        }
        if (complete) slot(self, "status").write(LOADING);
        else loading = generation;
        fetched(url).then(
          (comp) => arrived(generation, comp, null),
          (error) => arrived(generation, null, error),
        );
      },
    );
    // A new pace counts from now.
    effect(
      () => self.frameRate,
      () => {
        state.spent = 0;
        sync();
      },
    );
    effect(
      () => [self.loops, self.direction],
      ([loops, direction]) => {
        state.playback.loops = loops;
        state.playback.direction = direction < 0 ? -1 : 1;
        sync();
      },
    );
    effect(
      () => seen(self),
      (now) => {
        setShown(now);
        sync();
      },
    );

    let face = null;
    effect(
      () => {
        painted();
        const comp = state.composition;
        if (!shown()) return null;
        const scale = Number(self.contentsScale) || 0;
        if (scale <= 0) return null;
        const [width, height] = paintArea(self);
        // Without a file there is only the fill.
        const ops = comp ? render(comp, state.playback.frame) : [];
        return { ops, width, height, scale, color: css(self.fillColor), low: self.quality === LOW };
      },
      (frame) => {
        if (!frame) {
          if (face) face.root.style.display = "none";
          return;
        }
        face ??= painter(self.$node);
        face.root.style.display = "";
        face.draw(frame);
      },
    );
  },
});

// What the file says, a program cannot say instead: as Qt refuses an
// assignment to a read-only property, so is one here. The runtime writes
// them through their slots.
for (const name of ["status", "startFrame", "endFrame"]) {
  const { get } = Object.getOwnPropertyDescriptor(LottieAnimation.proto, name);
  Object.defineProperty(LottieAnimation.proto, name, {
    get,
    set() {
      throw new TypeError(`Cannot assign to read-only property "${name}"`);
    },
    enumerable: true,
    configurable: true,
  });
}

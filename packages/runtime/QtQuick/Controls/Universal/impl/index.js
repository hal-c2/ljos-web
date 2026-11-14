// `import QtQuick.Controls.Universal.impl`: what the Universal style paints
// in C++. The numbers are Qt's (`qquickuniversalbusyindicator.cpp`,
// `…progressbar.cpp`, `…focusrectangle.cpp`), so that each is where Qt has
// it at every moment.
import { defineType } from "../../../../object.ts";
import { curve } from "../../../animation/easing.js";
import { colorValue, css } from "../../../color.ts";
import { rules } from "../../../compute.ts";
import { Item } from "../../../Item.js";
import { clipping, looped, part, pictured, shown } from "../../painting.js";

rules(`
.qq-universal-busy > div, .qq-universal-bar > div + div { border-radius: 50%; }
`);

// A curve from nothing to all of it by two points, as `QEasingCurve` has it.
const bezier = (x1, y1, x2, y2) => curve(45, -1, -1, -1, [x1, y1, x2, y2, 1, 1]);
const linear = (progress) => progress;
const within = (progress) => Math.min(Math.max(progress, 0), 1);

// Which of the phases something that started at `begin` is in at a time,
// each given by how long it lasts: that, and how far into it.
function phase(phases, time, begin) {
  let index = 0;
  let remain = time;
  let elapsed = 0;
  for (; index < phases.length - 1; index++) {
    if (remain <= phases[index][0] + begin) break;
    remain -= phases[index][0];
    elapsed += phases[index][0];
  }
  return [phases[index], within((time - elapsed - begin) / phases[index][0])];
}

// FocusRectangle: a line of dots around what has the focus, black and white
// by turns from a white one at the top left, a pixel each.
export const FocusRectangle = defineType("FocusRectangle", Item, {
  setup(self) {
    pictured(
      self,
      () => (self.visible ? {} : null),
      (context, state, width, height) => {
        const wide = Math.ceil(width);
        // Qt paints it into a picture as high as it is wide: of a taller
        // one there is no more than that.
        const tall = Math.ceil(height);
        const seen = Math.min(tall, wide);
        const dot = (x, y) => {
          if (y >= seen) return;
          context.fillStyle = (x + y) % 2 ? "#000000" : "#ffffff";
          context.fillRect(x, y, 1, 1);
        };
        for (let x = 0; x < wide; x++) {
          dot(x, 0);
          dot(x, tall - 1);
        }
        for (let y = 1; y < tall - 1; y++) {
          dot(0, y);
          dot(wide - 1, y);
        }
      },
    );
  },
});

// How long a dot lasts in each part of its way around, the angles it goes
// from and to, and how. Each dot sets off this long after the one before.
const TURNS = [
  [433, -110, 10, bezier(0.02, 0.33, 0.38, 0.77)],
  [767, 10, 93, linear],
  [417, 93, 205, bezier(0.57, 0.17, 0.95, 0.75)],
  [400, 205, 357, bezier(0.0, 0.19, 0.07, 0.72)],
  [766, 357, 439, linear],
  [434, 439, 585, bezier(0.0, 0.0, 0.95, 0.37)],
];
const INTERVAL = 167;
const LAP = 4052;

// BusyIndicatorImpl: dots that chase each other around a circle, bunching
// up at the top and at the bottom.
export const BusyIndicatorImpl = defineType("BusyIndicatorImpl", Item, {
  properties: { count: 5, color: "#000000" },
  resolve: { color: colorValue },
  setup(self) {
    // In the middle of the item: the dots turn about it.
    const holder = part(self.$node, "qq-universal-busy");
    const dots = [];
    looped(
      self,
      LAP,
      () => (shown(self) ? { moving: true, width: self.width, height: self.height, count: self.count, colour: css(self.color) } : null),
      (state) => {
        holder.style.display = state ? "" : "none";
        if (!state) return;
        holder.style.left = `${state.width / 2}px`;
        holder.style.top = `${state.height / 2}px`;
        while (dots.length < state.count) dots.push(part(holder));
        while (dots.length > Math.max(0, state.count)) dots.pop().remove();
        const size = Math.min(state.width, state.height);
        const diameter = size / 10;
        const offset = (size - diameter * 2) / Math.PI;
        for (const { style } of dots) {
          style.left = style.top = `${offset}px`;
          style.width = style.height = `${diameter}px`;
          style.transformOrigin = `${-offset}px ${-offset}px`;
          style.backgroundColor = state.colour;
        }
      },
      (state, time) => {
        dots.forEach(({ style }, index) => {
          const begin = index * INTERVAL;
          const visible = time >= begin && time <= LAP - (TURNS.length - index - 1) * INTERVAL;
          style.opacity = visible ? "" : "0";
          if (!visible) return;
          const [[, from, to, eased], progress] = phase(TURNS, time, begin);
          // Each is as many degrees behind the one before as there are dots.
          style.transform = `rotate(${from + (to - from) * eased(progress) - index * dots.length}deg)`;
        });
      },
      true,
    );
  },
});

// The dots of a bar that says nothing of how far it is: five, four wide and
// four apart, on something that drifts to the right all the while. Each
// comes in to a third of the way, waits, and goes on out.
const DOTS = 5;
const DOT = 4;
const APART = 4;
const ROUND = 3917;
const SEEN = 3000;
const DRIFT_FROM = -34;
const DRIFT = 0.435222;
const WELL = 1 / 3;
const OUT = 2 / 3;
const PUSHES = [
  [500, -50, 0],
  [1500, 0, 0],
  [1000, 0, 100],
  [917, 100, 100],
];
const SLIDES = [
  [1000, 0, WELL],
  [1000, WELL, WELL],
  [1000, WELL, OUT],
  [1000, WELL, OUT],
];
const slid = bezier(0.4, 0.0, 0.6, 1.0);

// ProgressBarImpl: a bar as tall as its implicit height, in the middle of
// the item, as wide as the progress; or the dots.
export const ProgressBarImpl = defineType("ProgressBarImpl", Item, {
  properties: { color: "#000000", progress: 0, indeterminate: false },
  resolve: { color: colorValue },
  setup(self) {
    clipping(self);
    const holder = part(self.$node, "qq-universal-bar");
    const bar = part(holder);
    const dots = Array.from({ length: DOTS }, () => part(holder));
    looped(
      self,
      ROUND,
      () =>
        shown(self)
          ? {
              moving: Boolean(self.indeterminate),
              width: self.width,
              height: self.height,
              tall: self.implicitHeight,
              progress: self.progress,
              colour: css(self.color),
            }
          : null,
      (state) => {
        holder.style.display = state ? "" : "none";
        if (!state) return;
        bar.style.display = state.moving ? "none" : "";
        bar.style.top = `${(state.height - state.tall) / 2}px`;
        bar.style.width = `${Math.max(0, state.progress * state.width)}px`;
        bar.style.height = `${state.tall}px`;
        bar.style.backgroundColor = state.colour;
        for (const { style } of dots) {
          style.display = state.moving ? "" : "none";
          style.top = `${(state.height - DOT) / 2}px`;
          style.width = style.height = `${DOT}px`;
          style.backgroundColor = state.colour;
        }
      },
      (state, time) => {
        if (!state.moving) return;
        const drift = DRIFT_FROM + DRIFT * state.width * (time / ROUND);
        dots.forEach(({ style }, index) => {
          const begin = index * INTERVAL;
          const visible = time >= begin && time <= SEEN + begin;
          style.opacity = visible ? "" : "0";
          if (!visible) return;
          const [[, pushFrom, pushTo], pushed] = phase(PUSHES, time, begin);
          const [[, slideFrom, slideTo], sliding] = phase(SLIDES, time, begin);
          const push = pushFrom + (pushTo - pushFrom) * pushed;
          const slide = (slideFrom + (slideTo - slideFrom) * slid(sliding)) * state.width;
          style.left = `${(DOTS - index - 1) * (DOT + APART) + drift + push + slide}px`;
        });
      },
    );
  },
});

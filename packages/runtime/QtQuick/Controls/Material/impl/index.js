// `import QtQuick.Controls.Material.impl`: what the Material style has in
// C++ besides `Material` itself. The numbers are Qt's
// (`qquickmaterialbusyindicator.cpp`, `…progressbar.cpp`), so that each is
// where Qt has it at every moment. The rest of the module is QML, and Qt's
// own files.
import { onCleanup } from "solid-js";
import { defineType, effect } from "../../../../object.ts";
import { clock } from "../../../animation/clock.js";
import { curve } from "../../../animation/easing.js";
import { colorValue, css } from "../../../color.js";
import { Item } from "../../../Item.js";
import { arc, canvas, hiding, looped, part, shown } from "../../painting.js";

export { FloatingPlaceholderText, MaterialTextContainer } from "./fields.js";
export { Ripple } from "./Ripple.js";

const inQuad = curve(1);
const outQuad = curve(2);
const outCubic = curve(6);

// The arc grows for this long and shrinks for as long, six times while it
// goes around twice. Angles are in sixteenths of a degree, as a painter's.
const SPAN = 700;
const LAP = SPAN * 6;
const TURNS = 720;
const DEGREE = 16;
const SHORT = 10 * DEGREE;
const LONG = 300 * DEGREE;

// BusyIndicatorImpl: an arc that goes around, growing from its head and
// shrinking from its tail.
export const BusyIndicatorImpl = defineType("BusyIndicatorImpl", Item, {
  properties: { color: "#000000", running: false },
  resolve: { color: colorValue },
  setup(self) {
    hiding(self);
    const sized = canvas(self);
    let state = null;
    let alive = false;
    let elapsed = 0;
    // Where the arc started and ended when it last grew or shrank: whole
    // numbers, cut and not rounded, as Qt has them.
    let lastStart = 0;
    let lastEnd = 0;

    function paint() {
      const { width, height, colour } = state;
      const size = Math.min(width, height);
      const context = sized(width, height);
      const pen = Math.ceil(size / 12);
      const half = Math.trunc(pen / 2);
      const time = Math.trunc(elapsed);
      const done = (time % SPAN) / SPAN;
      let start;
      let end;
      if (Math.trunc(time / SPAN) % 2 === 0) {
        if (lastStart > 360 * DEGREE) lastStart -= 360 * DEGREE;
        start = lastStart;
        end = lastEnd = Math.trunc(lastStart + SHORT + outQuad(done) * (LONG - SHORT));
      } else {
        start = lastStart = Math.trunc(lastEnd - LONG + inQuad(done) * (LONG - SHORT));
        end = lastEnd;
      }
      const rotation = DEGREE * (time / LAP) * -TURNS;
      start = Math.trunc(start - rotation);
      end = Math.trunc(end - rotation);
      context.translate((width - size) / 2, (height - size) / 2);
      context.strokeStyle = colour;
      context.lineWidth = pen;
      context.lineCap = "square";
      context.beginPath();
      arc(context, half, half, size - pen, size - pen, -start / DEGREE, -(end - start) / DEGREE);
      context.stroke();
    }

    const job = {
      skew: 0,
      advance(delta) {
        elapsed += delta;
        if (elapsed >= LAP) elapsed = 0;
        paint();
      },
      idle: () => 0,
    };
    onCleanup(() => clock.remove(job));

    effect(
      () => ({ running: Boolean(self.running), visible: self.visible, width: self.width, height: self.height, colour: css(self.color) }),
      (next) => {
        const before = state;
        state = next;
        const room = next.width > 0 && next.height > 0;
        if (next.running && room) alive = true;
        // Told to stop, it goes on until something else about it changes:
        // that is how a style fades it out while it still turns.
        else if (!room || !before || ["visible", "width", "height", "colour"].some((name) => before[name] !== next[name])) alive = false;
        if (alive) {
          clock.add(job);
          paint();
        } else {
          clock.remove(job);
          lastStart = lastEnd = 0;
          sized(0, 0);
        }
      },
    );
  },
});

// A bar that only says it is busy has two, the second after the first: each
// starts at the left with no width and leaves to the right.
const SLIDE = 1240;
const PAUSE = 520;

// ProgressBarImpl: a bar as tall as its implicit height, in the middle of
// the item, as wide as the progress; or the two that pass.
export const ProgressBarImpl = defineType("ProgressBarImpl", Item, {
  properties: { color: "#000000", progress: 0, indeterminate: false },
  resolve: { color: colorValue },
  setup(self) {
    const holder = part(self.$node);
    const bars = [part(holder), part(holder)];
    looped(
      self,
      SLIDE + PAUSE,
      () =>
        shown(self)
          ? {
              moving: Boolean(self.indeterminate),
              width: self.width,
              top: (self.height - self.implicitHeight) / 2,
              tall: self.implicitHeight,
              progress: self.progress,
              colour: css(self.color),
            }
          : null,
      (state) => {
        holder.style.display = state ? "" : "none";
        if (!state) return;
        holder.style.top = `${state.top}px`;
        for (const { style } of bars) {
          style.height = `${state.tall}px`;
          style.backgroundColor = state.colour;
          // One that has just been told to pass has not come in yet.
          style.left = "0px";
          style.width = "0px";
        }
        bars[1].style.display = state.moving ? "" : "none";
        if (!state.moving) bars[0].style.width = `${Math.max(0, state.progress * state.width)}px`;
      },
      (state, time) => {
        if (!state.moving) return;
        [Math.min(1, time / SLIDE), Math.max(0, (time - PAUSE) / SLIDE)].forEach((progress, index) => {
          const value = outCubic(progress);
          const x = value * state.width;
          bars[index].style.left = `${x}px`;
          bars[index].style.width = `${value * (state.width - x)}px`;
        });
      },
    );
  },
});

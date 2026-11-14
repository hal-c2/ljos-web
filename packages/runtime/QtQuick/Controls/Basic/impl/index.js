// `import QtQuick.Controls.Basic.impl`: what the Basic style paints in C++.
// The numbers are Qt's (`qquickbasicbusyindicator.cpp`, `…progressbar.cpp`,
// `…dial.cpp`), so that each is where Qt has it at every moment.
import { defineType } from "../../../../object.ts";
import { curve } from "../../../animation/easing.js";
import { colorValue, css } from "../../../color.js";
import { rules } from "../../../compute.js";
import { Item } from "../../../Item.js";
import { arc, clipping, hiding, looped, part, pictured, shown } from "../../painting.js";

rules(`
.qq-basic-busy > div { border-style: solid; border-width: 1px; border-radius: 50%; background-clip: padding-box; }
`);

const CIRCLES = 10;

// BusyIndicatorImpl: ten circles in a circle, filled one after the other
// and emptied again the same way, each lap in two seconds.
export const BusyIndicatorImpl = defineType("BusyIndicatorImpl", Item, {
  properties: { pen: "#000000", fill: "#000000", running: false },
  resolve: {
    pen: colorValue,
    fill: colorValue,
    // It runs while it is shown, whatever it was told.
    running: (self) => self.visible,
  },
  setup(self) {
    hiding(self);
    const holder = part(self.$node, "qq-basic-busy");
    const circles = Array.from({ length: CIRCLES }, () => part(holder));
    looped(
      self,
      2000,
      () => (shown(self) ? { moving: true, width: self.width, height: self.height, pen: css(self.pen), fill: css(self.fill) } : null),
      (state) => {
        holder.style.display = state ? "" : "none";
        if (!state) return;
        const size = Math.min(state.width, state.height);
        const radius = Math.trunc(size / 12);
        const reach = size / 2 - radius;
        circles.forEach(({ style }, index) => {
          const angle = ((2 * Math.PI) / CIRCLES) * index;
          style.left = `${(state.width - size) / 2 + reach + reach * Math.sin(angle)}px`;
          style.top = `${(state.height - size) / 2 + reach - reach * Math.cos(angle)}px`;
          style.width = style.height = `${radius * 2}px`;
          style.borderColor = state.pen;
        });
      },
      (state, time) => {
        const done = time / 2000;
        const first = done <= 0.5 ? done * 2 : 0;
        const second = done > 0.5 ? (done - 0.5) * 2 : 0;
        circles.forEach(({ style }, index) => {
          const filled = first > index / CIRCLES || (second > 0 && second < index / CIRCLES);
          style.backgroundColor = filled ? state.fill : "transparent";
        });
      },
      true,
    );
  },
});

// The blocks of a bar that says nothing of how far it is: four, sixteen
// wide. They come in from the left 48 apart, rest in the middle 4 apart, and
// leave to the right as they came.
const BLOCKS = 4;
const WIDE = 16;
const RESTING = 4;
const MOVING = 48;
const SPAN = BLOCKS * (WIDE + RESTING) - RESTING;
const SECOND = 1600;
const THIRD = 2400;
const inQuad = curve(1);

const startX = (index) => (index + 1) * -WIDE - index * MOVING;
const restX = (index, width) => width / 2 + SPAN / 2 - (index + 1) * WIDE - index * RESTING;
const endX = (index, width) => width - startX(BLOCKS - 1 - index) - WIDE;

// Where a block is at a time: the bar's width is how far one goes in a
// second.
function blockX(index, width, time) {
  const rest = restX(index, width);
  if (time < SECOND) return Math.min(startX(index) + width * (inQuad(time / SECOND) * (SECOND / 1000)), rest);
  if (time < THIRD) return rest;
  // They leave one after the other, a block's distance in time apart.
  const kick = Math.trunc((MOVING / width) * 1000);
  if (Math.trunc((time - THIRD) / kick) < index) return rest;
  return Math.min(rest + width * ((time - THIRD) / 1000 - (kick / 1000) * index), endX(index, width));
}

// ProgressBarImpl: a bar as tall as its implicit height, in the middle of
// the item, as wide as the progress; or the blocks.
export const ProgressBarImpl = defineType("ProgressBarImpl", Item, {
  properties: { progress: 0, indeterminate: false, color: "#000000" },
  resolve: { color: colorValue },
  setup(self) {
    const holder = part(self.$node);
    const blocks = Array.from({ length: BLOCKS }, () => part(holder));
    clipping(self);
    looped(
      self,
      4000,
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
        blocks.forEach(({ style }, index) => {
          style.display = state.moving || index === 0 ? "" : "none";
          style.height = `${state.tall}px`;
          style.backgroundColor = state.colour;
          if (state.moving) style.width = `${WIDE}px`;
        });
        if (state.moving) return;
        blocks[0].style.left = "0px";
        blocks[0].style.width = `${Math.max(0, state.progress * state.width)}px`;
      },
      (state, time) => {
        if (!state.moving) return;
        blocks.forEach(({ style }, index) => {
          style.left = `${blockX(index, state.width, time)}px`;
        });
      },
    );
  },
});

// The square the arc of a dial is in: the pen's width and a pixel inside
// the smaller side.
const side = (width, height) => Math.min(width, height) - 10;

// One side of it on whole pixels: where it starts moved in to one, and what
// is left of its length cut to one.
function whole(start, length) {
  if (start - Math.trunc(start) > 0) {
    length -= Math.ceil(start) - start;
    start = Math.ceil(start);
  }
  return [start, length - Math.trunc(length) > 0 ? Math.floor(length) : length];
}

// DialImpl: a circle, and on it a thick arc from where the dial starts to
// where it is.
export const DialImpl = defineType("DialImpl", Item, {
  properties: { progress: 0, startAngle: -140, endAngle: 140, color: "#000000" },
  resolve: { color: colorValue },
  setup(self) {
    pictured(
      self,
      () => ({ progress: self.progress, start: self.startAngle, end: self.endAngle, colour: css(self.color) }),
      (context, state, width, height) => {
        const [x, wide] = whole((width - side(width, height)) / 2, side(width, height));
        const [y, tall] = whole((height - side(width, height)) / 2, side(width, height));
        context.strokeStyle = state.colour;
        context.lineWidth = 8;
        context.lineCap = "butt";
        context.beginPath();
        arc(context, x, y, wide, tall, 90 - state.start, state.progress * (state.start - state.end));
        context.stroke();
        context.lineWidth = 1;
        context.beginPath();
        arc(context, x - 4, y - 4, wide + 8, tall + 8, 0, 360);
        context.stroke();
      },
    );
  },
});

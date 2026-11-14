// `import QtQuick.Controls.Fusion.impl`: what the Fusion style paints in
// C++, each with a painter: a busy indicator, a dial and its knob. What is
// painted is what Qt's painter is told (`qquickfusionbusyindicator.cpp`,
// `…dial.cpp`, `…knob.cpp`), said to a canvas.
import { defineType } from "../../../../object.ts";
import { colorValue } from "../../../color.js";
import { Item } from "../../../Item.js";
import { arc, hiding, pictured } from "../../painting.js";
import { darker, degrees, eight, hsv, lighter } from "../shades.js";

const FULL = 2 * Math.PI;

function ellipse(context, x, y, width, height) {
  context.beginPath();
  context.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, FULL);
}

// A colour of the palette as these are painted with it: no more saturated
// than this and no darker than that.
const tamed = (colour, saturation, value) =>
  hsv(degrees(colour.hsvHue), Math.min(saturation, eight(colour.hsvSaturation)), Math.max(value, eight(colour.hsvValue)));

// BusyIndicatorImpl: a ring that fades away behind its head. The style's
// QML turns it.
export const BusyIndicatorImpl = defineType("BusyIndicatorImpl", Item, {
  properties: { color: "#000000", running: false },
  resolve: {
    color: colorValue,
    // It runs while it is shown, whatever it was told.
    running: (self) => self.visible,
  },
  setup(self) {
    hiding(self);
    pictured(
      self,
      () => (self.visible ? { colour: self.color.css(), none: self.color.alpha(0).css() } : null),
      (context, { colour, none }, width, height) => {
        const size = Math.min(width, height);
        const left = (width - size) / 2;
        const top = (height - size) / 2;
        const half = Math.round(Math.max(1, size / 14));
        const pen = 2 * half;
        const side = size - pen - 1;
        // A painter's gradient goes around the other way.
        const faded = context.createConicGradient(0, left + size / 2, top + size / 2);
        faded.addColorStop(0, none);
        faded.addColorStop(0.9, colour);
        faded.addColorStop(1, colour);
        context.translate(0.5, 0.5);
        context.lineWidth = pen;
        context.strokeStyle = faded;
        context.beginPath();
        arc(context, left + half, top + half, side, side, 0, 360);
        context.stroke();
        context.strokeStyle = colour;
        context.lineCap = "round";
        context.beginPath();
        arc(context, left + half, top + half, side, side, 0, 20);
        context.stroke();
      },
    );
  },
});

// DialImpl: a button that is round, lit from above, with a shadow under it
// when it can be turned and a ring around it when it has the focus.
export const DialImpl = defineType("DialImpl", Item, {
  properties: { highlight: false },
  setup(self) {
    pictured(
      self,
      () => {
        if (!self.visible) return null;
        const button = tamed(self.palette.button, 140, 180);
        return {
          enabled: self.enabled,
          button: button.css(),
          lit: lighter(button, 110).css(),
          shaded: darker(button, 102).css(),
          dark: darker(button, 115).css(),
          outline: darker(button, 280).css(),
          ring: self.highlight ? tamed(self.palette.highlight, 160, 230).alpha(127 / 255).css() : null,
        };
      },
      (context, state, wide, tall) => {
        // In whole pixels, as Qt takes the size here.
        const width = Math.trunc(wide);
        const height = Math.trunc(tall);
        if (width <= 0 || height <= 0) return;
        let radius = Math.min(width, height) / 2;
        radius -= radius / 50;
        const pen = radius / 20;
        const inset = radius / 6;
        const top = inset + (height - 2 * radius) / 2 + 1;
        const x = inset + (width - 2 * radius) / 2 + 1 + 0.5;
        const y = top + 0.5;
        const side = Math.trunc(radius * 2 - 2 * inset - 2);
        context.lineWidth = 1;
        ellipse(context, x, y, side, side);
        if (state.enabled) {
          const shadow = Math.max(1, pen / 2);
          const under = context.createRadialGradient(x + side / 2, y + side / 2, 0, x + side / 2, y + side / 2, side / 2 + 2 * shadow);
          under.addColorStop(0.91, "rgba(0, 0, 0, 0.157)");
          under.addColorStop(1, "rgba(0, 0, 0, 0)");
          context.save();
          context.translate(shadow, shadow);
          context.fillStyle = under;
          ellipse(context, x - 2 * shadow, y - 2 * shadow, side + 4 * shadow, side + 4 * shadow);
          context.fill();
          context.restore();
          // Lighter above a line across the middle than below it.
          const face = context.createRadialGradient(x + side / 2, y, 0, x + side / 2 - side / 3, top, side * 1.3);
          face.addColorStop(0, state.lit);
          face.addColorStop(0.5, state.button);
          face.addColorStop(0.501, state.shaded);
          face.addColorStop(1, state.dark);
          context.fillStyle = face;
          ellipse(context, x, y, side, side);
          context.fill();
        }
        context.strokeStyle = state.outline;
        context.stroke();
        context.strokeStyle = state.lit;
        ellipse(context, x + 1, y + 1, side - 2, side - 2);
        context.stroke();
        if (state.ring) {
          context.strokeStyle = state.ring;
          context.lineWidth = 2;
          ellipse(context, x - 1, y - 1, side + 2, side + 2);
          context.stroke();
        }
      },
    );
  },
});

// KnobImpl: the dent in a dial that shows where it is turned to.
export const KnobImpl = defineType("KnobImpl", Item, {
  setup(self) {
    pictured(
      self,
      () => {
        const colour = lighter(tamed(self.palette.button, 140, 180), 104).alpha(0.8);
        return { outer: darker(colour, 140).css(), middle: darker(colour, 120).css(), inner: darker(colour, 110).css() };
      },
      (context, state, width, height) => {
        const size = Math.min(width, height);
        const x = (width - size) / 2;
        const y = (height - size) / 2;
        const dent = context.createRadialGradient(width / 2, height / 2, 0, width / 2 + size / 2, height / 2 + size, size * 2);
        dent.addColorStop(0, state.inner);
        dent.addColorStop(0.4, state.middle);
        dent.addColorStop(1, state.outer);
        context.fillStyle = dent;
        context.lineWidth = 1;
        // Each of the two is filled: the second over the first.
        context.strokeStyle = "rgba(255, 255, 255, 0.588)";
        ellipse(context, x, y, size, size);
        context.fill();
        context.stroke();
        context.strokeStyle = "rgba(0, 0, 0, 0.314)";
        ellipse(context, x + 1, y + 1, size - 2, size - 2);
        context.fill();
        context.stroke();
      },
    );
  },
});

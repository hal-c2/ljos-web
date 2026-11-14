// What a ShapePath is filled with when not one colour: LinearGradient,
// RadialGradient, ConicalGradient.
//
// The first two are SVG's own, in the coordinates of the path. SVG has no
// conical gradient and CSS has, so a path filled with one shows a box with
// that background through its own outline (`Shape.js`).
import { defineType, effect } from "../../object.ts";
import { css } from "../color.ts";
import { Gradient } from "../Rectangle.js";

const SVG = "http://www.w3.org/2000/svg";
const SPREADS = ["pad", "reflect", "repeat"];

let made = 0;

// A gradient's stops in order: `[position, colour]`.
function stops(self) {
  return [...(self.stops ?? self.$stops)]
    .filter((stop) => stop && typeof stop === "object" && "position" in stop)
    .map((stop) => [Math.min(1, Math.max(0, Number(stop.position) || 0)), css(stop.color)])
    .sort((a, b) => a[0] - b[0]);
}

// The SVG element of a gradient, kept up to date: `self.$element`. The path
// it fills puts it in the page and names it by its id.
function paint(self, name) {
  const element = document.createElementNS(SVG, name);
  element.id = `qq-gradient-${++made}`;
  element.setAttribute("gradientUnits", "userSpaceOnUse");
  self.$element = element;
  effect(
    () => SPREADS[self.spread] ?? "pad",
    (spread) => element.setAttribute("spreadMethod", spread),
  );
  effect(
    () => stops(self),
    (list) => {
      while (element.childElementCount > list.length) element.lastElementChild.remove();
      while (element.childElementCount < list.length) element.append(document.createElementNS(SVG, "stop"));
      list.forEach(([position, colour], index) => {
        const stop = element.children[index];
        stop.setAttribute("offset", position);
        stop.setAttribute("stop-color", colour);
      });
    },
  );
  return element;
}

const numbers = (values) => values.map((value) => Number(value) || 0);

export const ShapeGradient = defineType("ShapeGradient", Gradient, {
  properties: { spread: 0 },
  enums: { PadSpread: 0, ReflectSpread: 1, RepeatSpread: 2 },
});

export const LinearGradient = defineType("LinearGradient", ShapeGradient, {
  properties: { x1: 0, y1: 0, x2: 0, y2: 0 },
  setup(self) {
    const element = paint(self, "linearGradient");
    effect(
      () => numbers([self.x1, self.y1, self.x2, self.y2]),
      ([x1, y1, x2, y2]) => {
        element.setAttribute("x1", x1);
        element.setAttribute("y1", y1);
        element.setAttribute("x2", x2);
        element.setAttribute("y2", y2);
      },
    );
  },
});

export const RadialGradient = defineType("RadialGradient", ShapeGradient, {
  properties: { centerX: 0, centerY: 0, centerRadius: 0, focalX: 0, focalY: 0, focalRadius: 0 },
  setup(self) {
    const element = paint(self, "radialGradient");
    effect(
      () => numbers([self.centerX, self.centerY, self.centerRadius, self.focalX, self.focalY, self.focalRadius]),
      ([cx, cy, r, fx, fy, fr]) => {
        element.setAttribute("cx", cx);
        element.setAttribute("cy", cy);
        element.setAttribute("r", r);
        element.setAttribute("fx", fx);
        element.setAttribute("fy", fy);
        element.setAttribute("fr", fr);
      },
    );
  },
});

export const ConicalGradient = defineType("ConicalGradient", ShapeGradient, {
  properties: { centerX: 0, centerY: 0, angle: 0 },
  methods: {
    // The gradient as the background of a box whose corner is at `x`, `y`.
    // Qt's angles turn counter-clockwise from three o'clock, CSS's clockwise
    // from twelve: the stops are the same ones the other way round.
    $conic(x, y) {
      const list = stops(this)
        .reverse()
        .map(([position, colour]) => `${colour} ${Math.round((1 - position) * 1e6) / 1e4}%`);
      if (!list.length) return "none";
      const [cx, cy, angle] = numbers([this.centerX, this.centerY, this.angle]);
      return `conic-gradient(from ${90 - angle}deg at ${cx - x}px ${cy - y}px,${list.join(",")})`;
    },
  },
});

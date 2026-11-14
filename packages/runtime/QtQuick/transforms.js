// What an item's `transform` list holds. Each says what it does as a CSS
// transform function list, about its own origin; Item puts them together.
import { defineType, group, QtObject } from "../object.ts";

const about = (x, y, css) => (x || y ? `translate(${x}px,${y}px) ${css} translate(${-x}px,${-y}px)` : css);

export const Rotation = defineType("Rotation", QtObject, {
  properties: {
    angle: 0,
    origin: group({ x: 0, y: 0 }),
    axis: group({ x: 0, y: 0, z: 1 }),
  },
  methods: {
    $css() {
      const { x, y, z } = this.axis;
      const rotate = x || y ? `rotate3d(${x},${y},${z},${this.angle}deg)` : `rotate(${z < 0 ? -this.angle : this.angle}deg)`;
      return about(this.origin.x, this.origin.y, rotate);
    },
  },
});

export const Scale = defineType("Scale", QtObject, {
  properties: {
    xScale: 1,
    yScale: 1,
    origin: group({ x: 0, y: 0 }),
  },
  methods: {
    $css() {
      return about(this.origin.x, this.origin.y, `scale(${this.xScale},${this.yScale})`);
    },
  },
});

export const Translate = defineType("Translate", QtObject, {
  properties: { x: 0, y: 0 },
  methods: {
    $css() {
      return `translate(${this.x}px,${this.y}px)`;
    },
  },
});

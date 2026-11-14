// Which way a particle sets off, and how fast: an emitter's `velocity`.
import { defineType, group, QtObject } from "../../object.ts";
import { MAGNITUDE, spread, TARGET, three, vectors, VELOCITY } from "./core.js";

export const Direction3D = defineType("Direction3D", QtObject, {});

// The way it is told, give or take so much along each axis. With
// `normalized`, whatever chance made of it is as long as `direction` is.
export const VectorDirection3D = defineType("VectorDirection3D", Direction3D, {
  properties: {
    direction: group({ x: 0, y: 100, z: 0 }),
    directionVariation: group({ x: 0, y: 0, z: 0 }),
    normalized: false,
  },
  methods: {
    $sample(seed, index) {
      const direction = three(this.direction);
      const variation = three(this.directionVariation);
      const way = direction.map((along, axis) => along + variation[axis] * spread(seed, index, VELOCITY + axis));
      if (!this.normalized) return way;
      const length = Math.hypot(...way);
      const wanted = Math.hypot(...direction);
      return length === 0 ? way : way.map((along) => (along * wanted) / length);
    },
  },
  setup: vectors(["direction", "directionVariation"]),
});

// Towards a place in the system: as fast as it is far, times `magnitude`,
// or with `normalized` at `magnitude` whatever the distance.
export const TargetDirection3D = defineType("TargetDirection3D", Direction3D, {
  properties: {
    position: group({ x: 0, y: 0, z: 0 }),
    positionVariation: group({ x: 0, y: 0, z: 0 }),
    normalized: false,
    magnitude: 1,
    magnitudeVariation: 0,
  },
  methods: {
    $sample(seed, index, from) {
      const position = three(this.position);
      const variation = three(this.positionVariation);
      let way = position.map((along, axis) => along + variation[axis] * spread(seed, index, TARGET + axis) - from[axis]);
      if (this.normalized) {
        const length = Math.hypot(...way);
        if (length > 0) way = way.map((along) => along / length);
      }
      const magnitude = this.magnitude + this.magnitudeVariation * spread(seed, index, MAGNITUDE);
      return way.map((along) => along * magnitude);
    },
  },
  setup: vectors(["position", "positionVariation"]),
});

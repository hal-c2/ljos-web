// What an emitter's `velocity` and `acceleration` are: a vector with some
// chance in it. `$sample(x, y, random, out)` draws one for a particle at
// (x, y) in the emitter and puts it in `out`; the draws are Qt's, in Qt's
// order, so that a seeded system gives the same vectors every time.
import { contents, defineType, QtObject } from "../../object.ts";
import { between } from "./geometry.js";

const RADIANS = Math.PI / 180;
const MAP = new Float64Array(6);
const PART = { x: 0, y: 0 };

export const PointDirection = defineType("PointDirection", QtObject, {
  properties: { x: 0, y: 0, xVariation: 0, yVariation: 0 },
  methods: {
    $sample(x, y, random, out) {
      const xVariation = this.xVariation;
      const yVariation = this.yVariation;
      out.x = this.x - xVariation + random() * xVariation * 2;
      out.y = this.y - yVariation + random() * yVariation * 2;
    },
  },
});

export const AngleDirection = defineType("AngleDirection", QtObject, {
  properties: { angle: 0, magnitude: 0, angleVariation: 0, magnitudeVariation: 0 },
  methods: {
    $sample(x, y, random, out) {
      const angleVariation = this.angleVariation * RADIANS;
      const magnitudeVariation = this.magnitudeVariation;
      const theta = this.angle * RADIANS - angleVariation + random() * angleVariation * 2;
      const magnitude = this.magnitude - magnitudeVariation + random() * magnitudeVariation * 2;
      out.x = magnitude * Math.cos(theta);
      out.y = magnitude * Math.sin(theta);
    },
  },
});

export const TargetDirection = defineType("TargetDirection", QtObject, {
  properties: {
    targetX: 0,
    targetY: 0,
    targetItem: undefined,
    targetVariation: 0,
    proportionalMagnitude: false,
    magnitude: 0,
    magnitudeVariation: 0,
  },
  methods: {
    $sample(x, y, random, out) {
      let targetX = this.targetX;
      let targetY = this.targetY;
      const item = this.targetItem;
      if (item) {
        // The middle of the item, seen from the emitter the direction is in.
        targetX = item.width / 2;
        targetY = item.height / 2;
        const emitter = this.$parent;
        if (emitter?.$node && between(item, emitter, MAP)) {
          const mapped = MAP[0] * targetX + MAP[2] * targetY + MAP[4];
          targetY = MAP[1] * targetX + MAP[3] * targetY + MAP[5];
          targetX = mapped;
        } else {
          targetX += item.x;
          targetY += item.y;
        }
      }
      const targetVariation = this.targetVariation;
      const magnitudeVariation = this.magnitudeVariation;
      targetX += -x - targetVariation + random() * targetVariation * 2;
      targetY += -y - targetVariation + random() * targetVariation * 2;
      const theta = Math.atan2(targetY, targetX);
      let magnitude = this.magnitude + random() * magnitudeVariation * 2 - magnitudeVariation;
      if (this.proportionalMagnitude) magnitude *= Math.hypot(targetX, targetY);
      out.x = magnitude * Math.cos(theta);
      out.y = magnitude * Math.sin(theta);
    },
  },
});

// The sum of the directions declared inside it.
export const CumulativeDirection = defineType("CumulativeDirection", QtObject, {
  methods: {
    get directions() {
      return this.$directions;
    },
    $sample(x, y, random, out) {
      let sumX = 0;
      let sumY = 0;
      for (const direction of this.$directions) {
        direction.$sample(x, y, random, PART);
        sumX += PART.x;
        sumY += PART.y;
      }
      out.x = sumX;
      out.y = sumY;
    },
  },
  setup(self) {
    self.$directions = [];
  },
  adopt(self, props) {
    self.$directions = contents(props);
  },
});

// Quaternion: the turns QML makes by name (`Quaternion.fromEulerAngles(0,
// 45, 0)`), which the `quaternion` value has no way to say of itself. There
// is one of it, and it is read through its type.
import { singleton } from "../QtQml/application.js";
import { defineType, QtObject } from "../object.ts";
import * as math from "./math.js";

const RADIANS = Math.PI / 180;
// What Qt takes for nothing in a length.
const NOTHING = 0.00001;

// An axis is a vector, or its three numbers.
const about = (args) => (typeof args[0] === "object" ? [[args[0]?.x ?? 0, args[0]?.y ?? 0, args[0]?.z ?? 0], ...args.slice(1)] : [args.slice(0, 3), ...args.slice(3)]);
const turn = (axis, degrees) => math.quaternion(math.fromAxis(axis[0], axis[1], axis[2], Number(degrees) || 0));

export const Quaternion = defineType("Quaternion", QtObject, {
  methods: {
    fromAxisAndAngle(...args) {
      const [axis, degrees] = about(args);
      return turn(axis, degrees);
    },
    fromEulerAngles(...args) {
      const [[x, y, z]] = about(args);
      return math.quaternion(math.fromEuler(Number(x) || 0, Number(y) || 0, Number(z) || 0));
    },
    // Two turns or three, the first of them made first.
    fromAxesAndAngles(...args) {
      let made = null;
      for (let at = 0; at + 1 < args.length; at += 2) {
        const [axis] = about([args[at]]);
        made = made ? turn(axis, args[at + 1]).times(made) : turn(axis, args[at + 1]);
      }
      return made ?? math.quaternion([1, 0, 0, 0]);
    },
    // The turn that points what faces `forward` from one place at another:
    // a camera at what it is to look at. Facing straight at it or straight
    // away there is no one line to turn about, and it is `up`.
    lookAt(from, to, forward = { x: 0, y: 0, z: -1 }, up = { x: 0, y: 1, z: 0 }) {
      const toward = math.normalized([to.x - from.x, to.y - from.y, to.z - from.z]);
      const ahead = math.normalized([forward.x, forward.y, forward.z]);
      let axis = [ahead[1] * toward[2] - ahead[2] * toward[1], ahead[2] * toward[0] - ahead[0] * toward[2], ahead[0] * toward[1] - ahead[1] * toward[0]];
      if (Math.hypot(...axis) <= NOTHING) axis = [up.x, up.y, up.z];
      const dot = Math.min(1, Math.max(-1, ahead[0] * toward[0] + ahead[1] * toward[1] + ahead[2] * toward[2]));
      return turn(axis, Math.acos(dot) / RADIANS);
    },
  },
});

singleton(Quaternion);

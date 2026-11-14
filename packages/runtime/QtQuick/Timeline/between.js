// What a property is between two keyframes, by the type of the property.
//
// Qt asks the property for its type and interpolates what `QVariantAnimation`
// can: numbers, colours, points, sizes, rectangles, vectors and quaternions.
// Anything else keeps the value of the keyframe before until the next one is
// reached. Here a property has no type to ask for, so it is taken from the
// value the property had when the timeline took it over.
//
// Not here, for that reason:
// - `property int`: Qt cuts what it interpolates down to a whole number; here
//   it is a number like any other.
// - `property var`: Qt interpolates nothing and the property reads undefined
//   up to its last keyframe; here it goes by the value it holds.
// - a property with no value yet (a `property color` nothing was given)
//   jumps from keyframe to keyframe.
import { Point, Quaternion, Rect, Size, Vector2d, Vector3d, Vector4d } from "../../QtQml/values.ts";
import { Color, color, equal, mix } from "../color.js";

const f = Math.fround;

// What a keyframe's value is when it cannot be one of the property's type,
// and what a group with no keyframes evaluates to: nothing to write.
export const NOTHING = Symbol("nothing");

// A kind is `take`, what a keyframe's value is as one of the type; `between`,
// the value `progress` of the way from one to the next; and `same`, whether
// the property still reads what was written to it. One whose values are
// objects has `keep`, the value a property holds as one that stays what it
// is: a node's `scale` is read as a vector that changes when the node's does.

const NUMBER = {
  take(value) {
    if (typeof value === "number") return value;
    const number = typeof value === "string" && value.trim() === "" ? NaN : Number(value);
    return value == null || Number.isNaN(number) ? NOTHING : number;
  },
  between: (from, to, progress) => from + (to - from) * progress,
  same: (written, read) => written === read,
};

// Each of the eight-bit channels on its own, cut down to a whole number.
const COLOUR = {
  take(value) {
    const made = color(value);
    return made.valid ? made : NOTHING;
  },
  between: mix,
  same: (written, read) => color(read).valid && equal(written, read),
};

// Qt's vectors are single precision, and so is the sum.
const single = (Type, members) => ({
  keep: (value) => new Type(...members.map((member) => value[member])),
  take: (value) => (value instanceof Type ? value : NOTHING),
  between(from, to, progress) {
    const by = f(progress);
    return new Type(...members.map((member) => f(from[member] + f(f(to[member] - from[member]) * by))));
  },
  same: (written, read) => read instanceof Type && members.every((member) => written[member] === read[member]),
});

const double = (Type, members) => ({
  keep: (value) => new Type(...members.map((member) => value[member])),
  take: (value) => (value instanceof Type ? value : NOTHING),
  between: (from, to, progress) => new Type(...members.map((member) => from[member] + (to[member] - from[member]) * progress)),
  same: (written, read) => read instanceof Type && members.every((member) => written[member] === read[member]),
});

const TURN = ["scalar", "x", "y", "z"];

// `QQuaternion::slerp`: along the shorter arc, and straight where the two
// are too close for the arc to be told from it.
function slerp(from, to, progress) {
  const t = f(progress);
  if (t <= 0) return from;
  if (t >= 1) return to;
  let dot = f(f(f(f(from.scalar * to.scalar) + f(from.x * to.x)) + f(from.y * to.y)) + f(from.z * to.z));
  const sign = dot < 0 ? -1 : 1;
  dot = sign * dot;
  let first = f(1 - t);
  let second = t;
  if (1 - dot > 0.0000001) {
    const angle = f(Math.acos(dot));
    const sine = f(Math.sin(angle));
    if (sine > 0.0000001) {
      first = f(f(Math.sin(f(f(1 - t) * angle))) / sine);
      second = f(f(Math.sin(f(t * angle))) / sine);
    }
  }
  return new Quaternion(...TURN.map((member) => f(f(from[member] * first) + f(sign * to[member] * second))));
}

const KINDS = [
  [Quaternion, { ...single(Quaternion, TURN), between: slerp }],
  [Vector2d, single(Vector2d, ["x", "y"])],
  [Vector3d, single(Vector3d, ["x", "y", "z"])],
  [Vector4d, single(Vector4d, ["x", "y", "z", "w"])],
  [Point, double(Point, ["x", "y"])],
  [Size, double(Size, ["width", "height"])],
  [Rect, double(Rect, ["x", "y", "width", "height"])],
];

// Not interpolated: the keyframe before, until the next is reached.
const jump = (take) => ({
  take,
  between: (from, to, progress) => (progress < 1 ? from : to),
  same: Object.is,
});

// As QVariant makes a bool of a string.
const FLAG = jump((value) => (typeof value === "string" ? !(value === "" || value === "0" || value === "false") : Boolean(value)));
const TEXT = jump((value) => (value == null ? NOTHING : String(value)));
const OTHER = jump((value) => value);

// The kind of a property that held `original`, in the slot `held` if it has
// one. A colour a component's own property holds is a string, as any text
// is: it is taken for a colour when it is one and the property was not
// declared a string.
export function kindOf(original, held) {
  if (typeof original === "number") return NUMBER;
  if (typeof original === "boolean") return FLAG;
  if (original instanceof Color) return COLOUR;
  if (typeof original === "string") return typeof held?.initial !== "string" && color(original).valid ? COLOUR : TEXT;
  for (const [Type, kind] of KINDS) if (original instanceof Type) return kind;
  return OTHER;
}

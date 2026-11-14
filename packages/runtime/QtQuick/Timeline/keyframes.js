// The keyframes of a group: the order Qt puts them in, and the ones it reads
// from a file (`keyframeSource`).
import { Point, Quaternion, Rect, Size, Vector2d, Vector3d, Vector4d } from "../../QtQml/values.ts";
import { color } from "../color.ts";

// Qt sorts a group's keyframes by frame with `std::sort`, which does not keep
// those of one frame in the order they were written, and which of them comes
// last decides what the group is past that frame. This is libstdc++'s, step
// for step, so that they come out as they do in Qt: an insertion sort up to
// sixteen, and above that a quicksort on the median of three that leaves
// runs of sixteen for an insertion sort at the end.
//
// Not here: its way out of a quicksort that goes too deep, a heap sort.
// Sorted then as far as the quicksort got, by the insertion sort at the end.
export function sort(list, less) {
  const count = list.length;
  const swap = (a, b) => {
    const kept = list[a];
    list[a] = list[b];
    list[b] = kept;
  };
  // Puts the one at `last` among those before it, of which one is known not
  // to come after it.
  const insert = (last) => {
    const value = list[last];
    let next = last - 1;
    while (less(value, list[next])) {
      list[last] = list[next];
      last = next;
      next--;
    }
    list[last] = value;
  };
  const insertion = (first, last) => {
    for (let index = first + 1; index < last; index++) {
      if (less(list[index], list[first])) {
        const value = list[index];
        for (let at = index; at > first; at--) list[at] = list[at - 1];
        list[first] = value;
      } else insert(index);
    }
  };
  const quick = (first, last, depth) => {
    while (last - first > 16) {
      if (depth-- === 0) return;
      const middle = first + ((last - first) >> 1);
      const a = first + 1;
      const c = last - 1;
      // The median of three goes first, to split by.
      if (less(list[a], list[middle])) {
        if (less(list[middle], list[c])) swap(first, middle);
        else if (less(list[a], list[c])) swap(first, c);
        else swap(first, a);
      } else if (less(list[a], list[c])) swap(first, a);
      else if (less(list[middle], list[c])) swap(first, c);
      else swap(first, middle);
      let low = first + 1;
      let high = last;
      for (;;) {
        while (less(list[low], list[first])) low++;
        high--;
        while (less(list[first], list[high])) high--;
        if (!(low < high)) break;
        swap(low, high);
        low++;
      }
      quick(low, last, depth);
      last = low;
    }
  };
  if (count > 16) {
    quick(0, count, Math.floor(Math.log2(count)) * 2);
    insertion(0, 16);
    for (let index = 16; index < count; index++) insert(index);
  } else insertion(0, count);
  return list;
}

// The file is CBOR: `["QTimelineKeyframes", 1, type, [frame, easing,
// value...]]`, the value as many numbers as its type has members. Only what
// such a file is made of is read: arrays, numbers, text, true and false.
function decode(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  const half = () => {
    const bits = view.getUint16(at);
    const exponent = (bits >> 10) & 31;
    const fraction = bits & 1023;
    const size = exponent === 0 ? fraction * 2 ** -24 : exponent === 31 ? (fraction ? NaN : Infinity) : (fraction + 1024) * 2 ** (exponent - 25);
    return bits & 0x8000 ? -size : size;
  };
  const argument = (info) => {
    if (info < 24) return info;
    const width = 1 << (info - 24);
    if (info > 27 || at + width > view.byteLength) throw new Error("unexpected end");
    const value = width === 1 ? view.getUint8(at) : width === 2 ? view.getUint16(at) : width === 4 ? view.getUint32(at) : Number(view.getBigUint64(at));
    at += width;
    return value;
  };
  const item = () => {
    if (at >= view.byteLength) throw new Error("unexpected end");
    const first = view.getUint8(at++);
    const major = first >> 5;
    const info = first & 31;
    if (major === 0) return argument(info);
    if (major === 1) return -1 - argument(info);
    if (major === 3) {
      const length = argument(info);
      const text = new TextDecoder().decode(bytes.subarray(at, at + length));
      at += length;
      return text;
    }
    if (major === 4) {
      const list = [];
      if (info === 31) {
        while (view.getUint8(at) !== 0xff) list.push(item());
        at++;
      } else for (let left = argument(info); left > 0; left--) list.push(item());
      return list;
    }
    if (major === 7) {
      if (info === 20 || info === 21) return info === 21;
      const width = info === 25 ? 2 : info === 26 ? 4 : info === 27 ? 8 : 0;
      if (!width || at + width > view.byteLength) throw new Error("unsupported value");
      const value = width === 2 ? half() : width === 4 ? view.getFloat32(at) : view.getFloat64(at);
      at += width;
      return value;
    }
    throw new Error("unsupported value");
  };
  return item();
}

const whole = (value) => Math.trunc(Number(value)) || 0;
const real = (value) => Number(value);
const digits = (value) => Math.max(0, Math.min(255, whole(value))).toString(16).padStart(2, "0");

// The types a file may be of, by Qt's number for each: how many numbers a
// value takes, and the value they make.
const TYPES = {
  // bool, int, double, float.
  1: [1, (at) => at(0)],
  2: [1, (at) => at(0)],
  6: [1, (at) => at(0)],
  38: [1, (at) => at(0)],
  // QRect, QRectF, QSize, QSizeF, QPoint, QPointF.
  19: [4, (at) => new Rect(whole(at(0)), whole(at(1)), whole(at(2)), whole(at(3)))],
  20: [4, (at) => new Rect(real(at(0)), real(at(1)), real(at(2)), real(at(3)))],
  21: [2, (at) => new Size(whole(at(0)), whole(at(1)))],
  22: [2, (at) => new Size(real(at(0)), real(at(1)))],
  25: [2, (at) => new Point(whole(at(0)), whole(at(1)))],
  26: [2, (at) => new Point(real(at(0)), real(at(1)))],
  // QColor: red, green, blue and alpha from 0 to 255.
  0x1003: [4, (at) => color(`#${digits(at(3))}${digits(at(0))}${digits(at(1))}${digits(at(2))}`)],
  // QVector2D, QVector3D, QVector4D, QQuaternion.
  0x1012: [2, (at) => new Vector2d(real(at(0)), real(at(1)))],
  0x1013: [3, (at) => new Vector3d(real(at(0)), real(at(1)), real(at(2)))],
  0x1014: [4, (at) => new Vector4d(real(at(0)), real(at(1)), real(at(2)), real(at(3)))],
  0x1015: [4, (at) => new Quaternion(real(at(0)), real(at(1)), real(at(2)), real(at(3)))],
};

// The keyframes a file holds, as `{ frame, type, value }`, `type` being the
// easing curve's. Throws what Qt warns of, in its words.
export function keyframes(bytes) {
  let file;
  try {
    file = decode(bytes);
  } catch {
    file = null;
  }
  if (!Array.isArray(file)) throw new Error("invalid format.(array expected)");
  if (file.length !== 4) throw new Error("invalid data size");
  if (file[0] !== "QTimelineKeyframes") throw new Error("invalid keyframeSource header string");
  if (file[1] !== 1) throw new Error(`invalid keyframeSource version ${whole(file[1])}`);
  const type = TYPES[whole(file[2])];
  if (!type) throw new Error("unsupported property type");
  const [members, make] = type;
  const size = members + 2;
  const data = Array.isArray(file[3]) ? file[3] : [];
  if (data.length % size !== 0) throw new Error("invalid keyframe array");
  const found = [];
  for (let index = 0; index < data.length; index += size) {
    if (!Number.isInteger(data[index + 1])) throw new Error("");
    found.push({ frame: real(data[index]), type: data[index + 1], value: make((member) => data[index + 2 + member]) });
  }
  return found;
}

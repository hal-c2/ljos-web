// The sums of a scene in space: matrices of four by four, as sixteen
// numbers column by column (what OpenGL takes), vectors as three, and
// turns as quaternions `[scalar, x, y, z]`.
import { Matrix4x4, Quaternion, Vector3d } from "../QtQml/values.js";

export const IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

const RADIANS = Math.PI / 180;

// What `a b` does to a point is `b` first, then `a`.
export function multiply(a, b) {
  const out = new Array(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[column * 4 + k];
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

// The matrix that undoes `m`: null when nothing does.
export function inverse(m) {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  const whole = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (whole === 0) return null;
  const by = 1 / whole;
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * by,
    (a02 * b10 - a01 * b11 - a03 * b09) * by,
    (a31 * b05 - a32 * b04 + a33 * b03) * by,
    (a22 * b04 - a21 * b05 - a23 * b03) * by,
    (a12 * b08 - a10 * b11 - a13 * b07) * by,
    (a00 * b11 - a02 * b08 + a03 * b07) * by,
    (a32 * b02 - a30 * b05 - a33 * b01) * by,
    (a20 * b05 - a22 * b02 + a23 * b01) * by,
    (a10 * b10 - a11 * b08 + a13 * b06) * by,
    (a01 * b08 - a00 * b10 - a03 * b06) * by,
    (a30 * b04 - a31 * b02 + a33 * b00) * by,
    (a21 * b02 - a20 * b04 - a23 * b00) * by,
    (a11 * b07 - a10 * b09 - a12 * b06) * by,
    (a00 * b09 - a01 * b07 + a02 * b06) * by,
    (a31 * b01 - a30 * b03 - a32 * b00) * by,
    (a20 * b03 - a21 * b01 + a22 * b00) * by,
  ];
}

// Where `m` takes a point, as four numbers: the last is what the others
// are still to be divided by.
export function transform(m, x, y, z, w = 1) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12] * w,
    m[1] * x + m[5] * y + m[9] * z + m[13] * w,
    m[2] * x + m[6] * y + m[10] * z + m[14] * w,
    m[3] * x + m[7] * y + m[11] * z + m[15] * w,
  ];
}

// The point itself.
export function point(m, x, y, z) {
  const [px, py, pz, w] = transform(m, x, y, z);
  return w === 1 || w === 0 ? [px, py, pz] : [px / w, py / w, pz / w];
}

// What `m` does to the way a surface faces: its upper three by three,
// inverted and transposed, as nine numbers column by column. It is `m`'s
// own when nothing undoes that.
export function normal(m) {
  const [a, b, c, , d, e, f, , g, h, i] = m;
  const whole = a * (e * i - f * h) - d * (b * i - c * h) + g * (b * f - c * e);
  if (whole === 0) return [a, b, c, d, e, f, g, h, i];
  const by = 1 / whole;
  return [
    (e * i - f * h) * by,
    (f * g - d * i) * by,
    (d * h - e * g) * by,
    (c * h - b * i) * by,
    (a * i - c * g) * by,
    (b * g - a * h) * by,
    (b * f - c * e) * by,
    (c * d - a * f) * by,
    (a * e - b * d) * by,
  ];
}

// The same, into `out`, for what does it for many things each picture.
export function normalInto(out, m) {
  const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
  const whole = a * (e * i - f * h) - d * (b * i - c * h) + g * (b * f - c * e);
  if (whole === 0) {
    out[0] = a;
    out[1] = b;
    out[2] = c;
    out[3] = d;
    out[4] = e;
    out[5] = f;
    out[6] = g;
    out[7] = h;
    out[8] = i;
    return out;
  }
  const by = 1 / whole;
  out[0] = (e * i - f * h) * by;
  out[1] = (f * g - d * i) * by;
  out[2] = (d * h - e * g) * by;
  out[3] = (c * h - b * i) * by;
  out[4] = (a * i - c * g) * by;
  out[5] = (b * g - a * h) * by;
  out[6] = (b * f - c * e) * by;
  out[7] = (c * d - a * f) * by;
  out[8] = (a * e - b * d) * by;
  return out;
}

// A direction through nine such numbers.
export const turned = (n, x, y, z) => [n[0] * x + n[3] * y + n[6] * z, n[1] * x + n[4] * y + n[7] * z, n[2] * x + n[5] * y + n[8] * z];

export function normalized([x, y, z]) {
  const length = Math.hypot(x, y, z);
  return length === 0 ? [0, 0, 0] : [x / length, y / length, z / length];
}

// Whether `m` turns a shape inside out: a scale below nothing in one
// direction does, and what faced the front then goes round the other way.
export function mirrors(m) {
  return m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]) < 0;
}

// A turn from the angles about x, y and z, in degrees: about z first, then
// x, then y, as `QQuaternion::fromEulerAngles` has it.
export function fromEuler(pitch, yaw, roll) {
  const p = pitch * RADIANS * 0.5;
  const y = yaw * RADIANS * 0.5;
  const r = roll * RADIANS * 0.5;
  const c1 = Math.cos(y);
  const s1 = Math.sin(y);
  const c2 = Math.cos(r);
  const s2 = Math.sin(r);
  const c3 = Math.cos(p);
  const s3 = Math.sin(p);
  const c1c2 = c1 * c2;
  const s1s2 = s1 * s2;
  return [c1c2 * c3 + s1s2 * s3, c1c2 * s3 + s1s2 * c3, s1 * c2 * c3 - c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3];
}

// And the angles of a turn, as `QQuaternion::toEulerAngles` finds them.
export function toEuler([w, x, y, z]) {
  const length = Math.hypot(w, x, y, z);
  if (length > 1e-6) [w, x, y, z] = [w / length, x / length, y / length, z / length];
  const sine = -2 * (y * z - x * w);
  if (Math.abs(sine) < 1 - 0.00001) {
    return [
      Math.asin(sine) / RADIANS,
      Math.atan2(2 * (x * z + y * w), 1 - 2 * (x * x + y * y)) / RADIANS,
      Math.atan2(2 * (x * y + z * w), 1 - 2 * (x * x + z * z)) / RADIANS,
    ];
  }
  // Straight up or down: the other two turn about the same line.
  return [Math.sign(sine) * 90, (2 * Math.atan2(y, w)) / RADIANS, 0];
}

export function fromAxis(x, y, z, degrees) {
  const length = Math.hypot(x, y, z);
  if (length === 0) return [1, 0, 0, 0];
  const half = degrees * RADIANS * 0.5;
  const sine = Math.sin(half) / length;
  return [Math.cos(half), x * sine, y * sine, z * sine];
}

// A turn as a matrix.
export function rotation([w, x, y, z]) {
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  return [
    1 - 2 * (yy + zz),
    2 * (xy + wz),
    2 * (xz - wy),
    0,
    2 * (xy - wz),
    1 - 2 * (xx + zz),
    2 * (yz + wx),
    0,
    2 * (xz + wy),
    2 * (yz - wx),
    1 - 2 * (xx + yy),
    0,
    0,
    0,
    0,
    1,
  ];
}

// The turn in a matrix that only turns, as `QQuaternion::fromRotationMatrix`
// finds it.
export function turnOf(m) {
  const at = (row, column) => m[column * 4 + row];
  const trace = at(0, 0) + at(1, 1) + at(2, 2);
  let w;
  const v = [0, 0, 0];
  if (trace > 0.00000001) {
    const s = 2 * Math.sqrt(trace + 1);
    w = 0.25 * s;
    v[0] = (at(2, 1) - at(1, 2)) / s;
    v[1] = (at(0, 2) - at(2, 0)) / s;
    v[2] = (at(1, 0) - at(0, 1)) / s;
  } else {
    let i = 0;
    if (at(1, 1) > at(0, 0)) i = 1;
    if (at(2, 2) > at(i, i)) i = 2;
    const j = (i + 1) % 3;
    const k = (j + 1) % 3;
    const s = 2 * Math.sqrt(at(i, i) - at(j, j) - at(k, k) + 1);
    v[i] = 0.25 * s;
    w = (at(k, j) - at(j, k)) / s;
    v[j] = (at(j, i) + at(i, j)) / s;
    v[k] = (at(k, i) + at(i, k)) / s;
  }
  const length = Math.hypot(w, v[0], v[1], v[2]);
  return length === 0 ? [1, 0, 0, 0] : [w / length, v[0] / length, v[1] / length, v[2] / length];
}

// A node's own matrix, as Qt puts one together: scaled about its pivot,
// turned, then moved to where it is.
export function placed(position, scale, pivot, turn) {
  const m = rotation(turn);
  const [sx, sy, sz] = scale;
  const ox = -pivot[0] * sx;
  const oy = -pivot[1] * sy;
  const oz = -pivot[2] * sz;
  const out = [
    m[0] * sx,
    m[1] * sx,
    m[2] * sx,
    0,
    m[4] * sy,
    m[5] * sy,
    m[6] * sy,
    0,
    m[8] * sz,
    m[9] * sz,
    m[10] * sz,
    0,
    m[0] * ox + m[4] * oy + m[8] * oz + position[0],
    m[1] * ox + m[5] * oy + m[9] * oz + position[1],
    m[2] * ox + m[6] * oy + m[10] * oz + position[2],
    1,
  ];
  return out;
}

// The matrix with each of its three directions made one long: what is left
// is where it is and which way it is turned.
export function unscaled(m) {
  const out = [...m];
  for (let column = 0; column < 3; column++) {
    const length = Math.hypot(m[column * 4], m[column * 4 + 1], m[column * 4 + 2], m[column * 4 + 3]);
    if (length === 0) continue;
    for (let row = 0; row < 4; row++) out[column * 4 + row] = m[column * 4 + row] / length;
  }
  return out;
}

// How far a matrix stretches each of its three directions.
export const scaleOf = (m) => [Math.hypot(m[0], m[1], m[2]), Math.hypot(m[4], m[5], m[6]), Math.hypot(m[8], m[9], m[10])];

// What a camera that narrows with distance sees: `QMatrix4x4::perspective`.
export function perspective(degrees, aspect, near, far) {
  const radians = (degrees / 2) * RADIANS;
  const sine = Math.sin(radians);
  if (near === far || aspect === 0 || sine === 0) return [...IDENTITY];
  const cotangent = Math.cos(radians) / sine;
  const clip = far - near;
  return [cotangent / aspect, 0, 0, 0, 0, cotangent, 0, 0, 0, 0, -(near + far) / clip, -1, 0, 0, -(2 * near * far) / clip, 0];
}

// What one that does not sees: `QMatrix4x4::ortho`.
export function ortho(left, right, bottom, top, near, far) {
  if (left === right || bottom === top || near === far) return [...IDENTITY];
  const width = right - left;
  const height = top - bottom;
  const clip = far - near;
  return [2 / width, 0, 0, 0, 0, 2 / height, 0, 0, 0, 0, -2 / clip, 0, -(left + right) / width, -(top + bottom) / height, -(near + far) / clip, 1];
}

export function frustum(left, right, bottom, top, near, far) {
  if (left === right || bottom === top || near === far) return [...IDENTITY];
  const width = right - left;
  const height = top - bottom;
  const clip = far - near;
  return [(2 * near) / width, 0, 0, 0, 0, (2 * near) / height, 0, 0, (left + right) / width, (top + bottom) / height, -(near + far) / clip, -1, 0, 0, -(2 * near * far) / clip, 0];
}

// As the values a program reads.
export const vector = ([x, y, z]) => new Vector3d(x, y, z);
export const quaternion = ([w, x, y, z]) => new Quaternion(w, x, y, z);
export function matrix(m) {
  const rows = [];
  for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) rows.push(m[column * 4 + row]);
  return new Matrix4x4(rows);
}

// And of one a program gives: a matrix column by column.
export function columns(given) {
  const out = [];
  for (let column = 1; column <= 4; column++) for (let row = 1; row <= 4; row++) out.push(given?.[`m${row}${column}`] ?? (row === column ? 1 : 0));
  return out;
}

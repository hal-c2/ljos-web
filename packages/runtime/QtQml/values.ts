// QML's value types that are not colours: what `Qt.point`, `Qt.rect`,
// `Qt.vector3d`, `Qt.matrix4x4` and the like make.
//
// They are plain objects with the properties and methods QML gives them.
// Vectors, quaternions and matrices are single precision in Qt, and so are
// these: `Qt.vector2d(1, 2).length()` is Qt's number, not JavaScript's.
const f = Math.fround;

const strip = (text: string): string => (text.includes(".") ? text.replace(/\.?0+$/, "") : text);

// A number as Qt writes one (C's `%g`): six significant digits, and an
// exponent of at least two when it takes one.
export function general(value: number, precision = 6): string {
  if (!Number.isFinite(value)) return Number.isNaN(value) ? "nan" : value > 0 ? "inf" : "-inf";
  if (value === 0) return "0";
  const [mantissa, exponent] = value.toExponential(precision - 1).split("e");
  const power = Number(exponent);
  if (power < -4 || power >= precision) {
    return `${strip(mantissa!)}e${power < 0 ? "-" : "+"}${String(Math.abs(power)).padStart(2, "0")}`;
  }
  return strip(value.toFixed(precision - 1 - power));
}

// Qt's qHypot, in single precision: scaled by the largest member so far, so
// lengths come out as Qt's to the last bit.
function hypot(...members: number[]): number {
  let scale = Math.abs(members[0]!);
  let total = 1;
  for (let index = 1; index < members.length; index++) {
    const next = Math.abs(members[index]!);
    if (next > scale) {
      const ratio = f(scale / next);
      total = f(f(f(total * ratio) * ratio) + 1);
      scale = next;
    } else if (scale !== 0) {
      const ratio = f(next / scale);
      total = f(total + f(ratio * ratio));
    }
  }
  return f(scale * f(Math.sqrt(total)));
}

const list = (name: string, values: number[]): string => `${name}(${values.map((value) => general(value)).join(", ")})`;
const near = (a: number, b: number, epsilon: number): boolean => Math.abs(a - b) <= epsilon;

export class Point {
  declare x: number;
  declare y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
  toString() {
    return list("QPointF", [this.x, this.y]);
  }
}

export class Size {
  declare width: number;
  declare height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  toString() {
    return list("QSizeF", [this.width, this.height]);
  }
}

export class Rect {
  declare x: number;
  declare y: number;
  declare width: number;
  declare height: number;
  constructor(x: number, y: number, width: number, height: number) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }
  get left() {
    return this.x;
  }
  get right() {
    return this.x + this.width;
  }
  get top() {
    return this.y;
  }
  get bottom() {
    return this.y + this.height;
  }
  toString() {
    return list("QRectF", [this.x, this.y, this.width, this.height]);
  }
  toJSON() {
    const { x, y, width, height, left, right, top, bottom } = this;
    return { x, y, width, height, left, right, top, bottom };
  }
}

export class Vector2d {
  declare x: number;
  declare y: number;
  constructor(x: number, y: number) {
    this.x = f(x);
    this.y = f(y);
  }
  dotProduct(other: Vector2d): number {
    return f(this.x * other.x + this.y * other.y);
  }
  // By a number, or by a vector member by member.
  times(by: number | Vector2d) {
    return typeof by === "number" ? new Vector2d(this.x * by, this.y * by) : new Vector2d(this.x * by.x, this.y * by.y);
  }
  plus(other: Vector2d): Vector2d {
    return new Vector2d(this.x + other.x, this.y + other.y);
  }
  minus(other: Vector2d): Vector2d {
    return new Vector2d(this.x - other.x, this.y - other.y);
  }
  normalized() {
    const length = hypot(this.x, this.y);
    return length === 0 ? new Vector2d(0, 0) : new Vector2d(this.x / length, this.y / length);
  }
  length() {
    return hypot(this.x, this.y);
  }
  toVector3d() {
    return new Vector3d(this.x, this.y, 0);
  }
  toVector4d() {
    return new Vector4d(this.x, this.y, 0, 0);
  }
  fuzzyEquals(other: Vector2d, epsilon = 0.00001) {
    return near(this.x, other.x, epsilon) && near(this.y, other.y, epsilon);
  }
  toString() {
    return list("QVector2D", [this.x, this.y]);
  }
}

export class Vector3d {
  declare x: number;
  declare y: number;
  declare z: number;
  constructor(x: number, y: number, z: number) {
    this.x = f(x);
    this.y = f(y);
    this.z = f(z);
  }
  crossProduct(other: Vector3d): Vector3d {
    return new Vector3d(
      this.y * other.z - this.z * other.y,
      this.z * other.x - this.x * other.z,
      this.x * other.y - this.y * other.x,
    );
  }
  dotProduct(other: Vector3d): number {
    return f(this.x * other.x + this.y * other.y + this.z * other.z);
  }
  // By a number, by a vector member by member, or (a row) by a matrix.
  times(by: number | Vector3d | Matrix4x4) {
    if (typeof by === "number") return new Vector3d(this.x * by, this.y * by, this.z * by);
    if (!(by instanceof Matrix4x4)) return new Vector3d(this.x * by.x, this.y * by.y, this.z * by.z);
    const { x, y, z } = this;
    const w = x * by.m14 + y * by.m24 + z * by.m34 + by.m44;
    const scale = w === 1 ? 1 : 1 / w;
    return new Vector3d(
      (x * by.m11 + y * by.m21 + z * by.m31 + by.m41) * scale,
      (x * by.m12 + y * by.m22 + z * by.m32 + by.m42) * scale,
      (x * by.m13 + y * by.m23 + z * by.m33 + by.m43) * scale,
    );
  }
  plus(other: Vector3d): Vector3d {
    return new Vector3d(this.x + other.x, this.y + other.y, this.z + other.z);
  }
  minus(other: Vector3d): Vector3d {
    return new Vector3d(this.x - other.x, this.y - other.y, this.z - other.z);
  }
  normalized() {
    const length = hypot(this.x, this.y, this.z);
    return length === 0 ? new Vector3d(0, 0, 0) : new Vector3d(this.x / length, this.y / length, this.z / length);
  }
  length() {
    return hypot(this.x, this.y, this.z);
  }
  toVector2d() {
    return new Vector2d(this.x, this.y);
  }
  toVector4d() {
    return new Vector4d(this.x, this.y, this.z, 0);
  }
  fuzzyEquals(other: Vector3d, epsilon = 0.00001) {
    return near(this.x, other.x, epsilon) && near(this.y, other.y, epsilon) && near(this.z, other.z, epsilon);
  }
  toString() {
    return list("QVector3D", [this.x, this.y, this.z]);
  }
}

export class Vector4d {
  declare x: number;
  declare y: number;
  declare z: number;
  declare w: number;
  constructor(x: number, y: number, z: number, w: number) {
    this.x = f(x);
    this.y = f(y);
    this.z = f(z);
    this.w = f(w);
  }
  dotProduct(other: Vector4d): number {
    return f(this.x * other.x + this.y * other.y + this.z * other.z + this.w * other.w);
  }
  times(by: number | Vector4d | Matrix4x4) {
    if (typeof by === "number") return new Vector4d(this.x * by, this.y * by, this.z * by, this.w * by);
    if (!(by instanceof Matrix4x4)) return new Vector4d(this.x * by.x, this.y * by.y, this.z * by.z, this.w * by.w);
    const { x, y, z, w } = this;
    return new Vector4d(
      x * by.m11 + y * by.m21 + z * by.m31 + w * by.m41,
      x * by.m12 + y * by.m22 + z * by.m32 + w * by.m42,
      x * by.m13 + y * by.m23 + z * by.m33 + w * by.m43,
      x * by.m14 + y * by.m24 + z * by.m34 + w * by.m44,
    );
  }
  plus(other: Vector4d): Vector4d {
    return new Vector4d(this.x + other.x, this.y + other.y, this.z + other.z, this.w + other.w);
  }
  minus(other: Vector4d): Vector4d {
    return new Vector4d(this.x - other.x, this.y - other.y, this.z - other.z, this.w - other.w);
  }
  normalized() {
    const length = hypot(this.x, this.y, this.z, this.w);
    if (length === 0) return new Vector4d(0, 0, 0, 0);
    return new Vector4d(this.x / length, this.y / length, this.z / length, this.w / length);
  }
  length() {
    return hypot(this.x, this.y, this.z, this.w);
  }
  toVector2d() {
    return new Vector2d(this.x, this.y);
  }
  toVector3d() {
    return new Vector3d(this.x, this.y, this.z);
  }
  fuzzyEquals(other: Vector4d, epsilon = 0.00001) {
    return (
      near(this.x, other.x, epsilon) &&
      near(this.y, other.y, epsilon) &&
      near(this.z, other.z, epsilon) &&
      near(this.w, other.w, epsilon)
    );
  }
  toString() {
    return list("QVector4D", [this.x, this.y, this.z, this.w]);
  }
}

const DEGREES = 180 / Math.PI;

export class Quaternion {
  declare scalar: number;
  declare x: number;
  declare y: number;
  declare z: number;
  constructor(scalar: number, x: number, y: number, z: number) {
    this.scalar = f(scalar);
    this.x = f(x);
    this.y = f(y);
    this.z = f(z);
  }
  dotProduct(other: Quaternion): number {
    return f(this.scalar * other.scalar + this.x * other.x + this.y * other.y + this.z * other.z);
  }
  // By a number, by another quaternion, or a vector turned by this one.
  times(by: number | Quaternion): Quaternion;
  times(by: Vector3d): Vector3d;
  times(by: number | Quaternion | Vector3d): Quaternion | Vector3d {
    const { scalar: w, x, y, z } = this;
    if (typeof by === "number") return new Quaternion(w * by, x * by, y * by, z * by);
    if (by instanceof Quaternion) {
      return new Quaternion(
        w * by.scalar - x * by.x - y * by.y - z * by.z,
        w * by.x + x * by.scalar + y * by.z - z * by.y,
        w * by.y + y * by.scalar + z * by.x - x * by.z,
        w * by.z + z * by.scalar + x * by.y - y * by.x,
      );
    }
    const turned = this.times(new Quaternion(0, by.x, by.y, by.z)).times(this.conjugated());
    return new Vector3d(turned.x, turned.y, turned.z);
  }
  plus(other: Quaternion): Quaternion {
    return new Quaternion(this.scalar + other.scalar, this.x + other.x, this.y + other.y, this.z + other.z);
  }
  minus(other: Quaternion): Quaternion {
    return new Quaternion(this.scalar - other.scalar, this.x - other.x, this.y - other.y, this.z - other.z);
  }
  normalized() {
    const length = hypot(this.scalar, this.x, this.y, this.z);
    if (length === 0) return new Quaternion(0, 0, 0, 0);
    return new Quaternion(this.scalar / length, this.x / length, this.y / length, this.z / length);
  }
  inverted() {
    const square = this.scalar ** 2 + this.x ** 2 + this.y ** 2 + this.z ** 2;
    if (square === 0) return new Quaternion(0, 0, 0, 0);
    return new Quaternion(this.scalar / square, -this.x / square, -this.y / square, -this.z / square);
  }
  conjugated() {
    return new Quaternion(this.scalar, -this.x, -this.y, -this.z);
  }
  length() {
    return hypot(this.scalar, this.x, this.y, this.z);
  }
  // Pitch, yaw and roll, in degrees. Qt's sums, in Qt's precision.
  toEulerAngles() {
    const length = hypot(this.scalar, this.x, this.y, this.z);
    const rescale = Math.abs(length - 1) > 0.00001 && length > 0.00001;
    const x = rescale ? f(this.x / length) : this.x;
    const y = rescale ? f(this.y / length) : this.y;
    const z = rescale ? f(this.z / length) : this.z;
    const w = rescale ? f(this.scalar / length) : this.scalar;
    const sine = f(-2 * f(f(y * z) - f(x * w)));
    // Looking straight up or down the turn has no one answer.
    if (Math.abs(sine) >= 0.99999) {
      return new Vector3d(Math.sign(sine) * 90, f(2 * f(Math.atan2(y, w))) * DEGREES, 0);
    }
    const xx = f(x * x);
    const yaw = Math.atan2(f(2 * f(f(x * z) + f(y * w))), f(1 - f(2 * f(xx + f(y * y)))));
    const roll = Math.atan2(f(2 * f(f(x * y) + f(z * w))), f(1 - f(2 * f(xx + f(z * z)))));
    return new Vector3d(f(Math.asin(sine)) * DEGREES, f(yaw) * DEGREES, f(roll) * DEGREES);
  }
  toVector4d() {
    return new Vector4d(this.x, this.y, this.z, this.scalar);
  }
  fuzzyEquals(other: Quaternion, epsilon = 0.00001) {
    return (
      near(this.scalar, other.scalar, epsilon) &&
      near(this.x, other.x, epsilon) &&
      near(this.y, other.y, epsilon) &&
      near(this.z, other.z, epsilon)
    );
  }
  toString() {
    return list("QQuaternion", [this.scalar, this.x, this.y, this.z]);
  }
}

// `m23` is row 2, column 3.
type Cell = `m${1 | 2 | 3 | 4}${1 | 2 | 3 | 4}`;
const CELLS: Cell[] = [];
for (let row = 1; row <= 4; row++) for (let column = 1; column <= 4; column++) CELLS.push(`m${row}${column}` as Cell);

const cells = (matrix: Matrix4x4): number[] => CELLS.map((name) => matrix[name]);

function product(a: number[], b: number[]): number[] {
  const out: number[] = new Array(16);
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[row * 4 + k]! * b[k * 4 + column]!;
      out[row * 4 + column] = sum;
    }
  }
  return out;
}

// The matrix with one row and one column left out, as a determinant.
function minor(m: number[], row: number, column: number): number {
  const rows = [0, 1, 2, 3].filter((each) => each !== row);
  const columns = [0, 1, 2, 3].filter((each) => each !== column);
  const at = (r: number, c: number): number => m[rows[r]! * 4 + columns[c]!]!;
  return (
    at(0, 0) * (at(1, 1) * at(2, 2) - at(1, 2) * at(2, 1)) -
    at(0, 1) * (at(1, 0) * at(2, 2) - at(1, 2) * at(2, 0)) +
    at(0, 2) * (at(1, 0) * at(2, 1) - at(1, 1) * at(2, 0))
  );
}

function determinant(m: number[]): number {
  let sum = 0;
  for (let column = 0; column < 4; column++) sum += (column & 1 ? -1 : 1) * m[column]! * minor(m, 0, column);
  return sum;
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export class Matrix4x4 {
  declare m11: number;
  declare m12: number;
  declare m13: number;
  declare m14: number;
  declare m21: number;
  declare m22: number;
  declare m23: number;
  declare m24: number;
  declare m31: number;
  declare m32: number;
  declare m33: number;
  declare m34: number;
  declare m41: number;
  declare m42: number;
  declare m43: number;
  declare m44: number;
  constructor(values: readonly number[] = IDENTITY) {
    this.$set(values);
  }
  $set(values: readonly number[]): void {
    for (let index = 0; index < 16; index++) this[CELLS[index]!] = f(values[index]!);
  }
  // These three change the matrix they are called on, as in QML.
  translate(by: Vector3d): void {
    this.$set(product(cells(this), [1, 0, 0, by.x, 0, 1, 0, by.y, 0, 0, 1, by.z, 0, 0, 0, 1]));
  }
  rotate(angle: number, axis: Vector3d): void {
    const length = Math.hypot(axis.x, axis.y, axis.z);
    if (length === 0) return;
    const x = axis.x / length;
    const y = axis.y / length;
    const z = axis.z / length;
    // Quarter turns are exact, as in Qt.
    const quarter = angle % 90 === 0 ? ((angle / 90) % 4 + 4) % 4 : -1;
    const sine = quarter < 0 ? Math.sin(angle / DEGREES) : [0, 1, 0, -1][quarter]!;
    const cosine = quarter < 0 ? Math.cos(angle / DEGREES) : [1, 0, -1, 0][quarter]!;
    const rest = 1 - cosine;
    this.$set(
      product(cells(this), [
        x * x * rest + cosine,
        x * y * rest - z * sine,
        x * z * rest + y * sine,
        0,
        y * x * rest + z * sine,
        y * y * rest + cosine,
        y * z * rest - x * sine,
        0,
        z * x * rest - y * sine,
        z * y * rest + x * sine,
        z * z * rest + cosine,
        0,
        0,
        0,
        0,
        1,
      ]),
    );
  }
  // By one factor, by three, or by a vector's.
  scale(x: number | Vector3d, y?: number, z?: number): void {
    if (typeof x !== "number") ({ x, y, z } = x);
    else if (y === undefined) y = z = x;
    this.$set(product(cells(this), [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z ?? 1, 0, 0, 0, 0, 1]));
  }
  lookAt(eye: Vector3d, center: Vector3d, up: Vector3d): void {
    const forward = center.minus(eye).normalized();
    const side = forward.crossProduct(up).normalized();
    const above = side.crossProduct(forward);
    const view = [
      side.x,
      side.y,
      side.z,
      0,
      above.x,
      above.y,
      above.z,
      0,
      -forward.x,
      -forward.y,
      -forward.z,
      0,
      0,
      0,
      0,
      1,
    ];
    this.$set(product(cells(this), view));
    this.translate(new Vector3d(-eye.x, -eye.y, -eye.z));
  }
  // By a number, a matrix, or a vector (a column).
  times(by: number | Matrix4x4 | Vector3d | Vector4d) {
    const m = cells(this);
    if (typeof by === "number") return new Matrix4x4(m.map((cell) => cell * by));
    if (by instanceof Matrix4x4) return new Matrix4x4(product(m, cells(by)));
    const column = by instanceof Vector4d ? [by.x, by.y, by.z, by.w] : [by.x, by.y, by.z, 1];
    const out = [0, 1, 2, 3].map((row) => column.reduce((sum, value, k) => sum + m[row * 4 + k]! * value, 0)) as [number, number, number, number];
    if (by instanceof Vector4d) return new Vector4d(...out);
    const scale = out[3] === 1 ? 1 : 1 / out[3];
    return new Vector3d(out[0] * scale, out[1] * scale, out[2] * scale);
  }
  plus(other: Matrix4x4): Matrix4x4 {
    const b = cells(other);
    return new Matrix4x4(cells(this).map((cell, index) => cell + b[index]!));
  }
  minus(other: Matrix4x4): Matrix4x4 {
    const b = cells(other);
    return new Matrix4x4(cells(this).map((cell, index) => cell - b[index]!));
  }
  row(index: number): Vector4d {
    return new Vector4d(...(cells(this).slice(index * 4, index * 4 + 4) as [number, number, number, number]));
  }
  column(index: number): Vector4d {
    const m = cells(this);
    return new Vector4d(m[index]!, m[4 + index]!, m[8 + index]!, m[12 + index]!);
  }
  determinant() {
    return f(determinant(cells(this)));
  }
  // The identity for a matrix that has no inverse, as in Qt.
  inverted() {
    const m = cells(this);
    const whole = determinant(m);
    if (whole === 0) return new Matrix4x4();
    const out: number[] = new Array(16);
    for (let row = 0; row < 4; row++) {
      for (let column = 0; column < 4; column++) {
        out[column * 4 + row] = (((row + column) & 1 ? -1 : 1) * minor(m, row, column)) / whole;
      }
    }
    return new Matrix4x4(out);
  }
  transposed() {
    const m = cells(this);
    return new Matrix4x4(m.map((_, index) => m[(index % 4) * 4 + (index >> 2)]!));
  }
  map(point: { x: number; y: number }): Point {
    const { x, y } = point;
    const w = this.m41 * x + this.m42 * y + this.m44;
    const scale = w === 1 ? 1 : 1 / w;
    return new Point(
      (this.m11 * x + this.m12 * y + this.m14) * scale,
      (this.m21 * x + this.m22 * y + this.m24) * scale,
    );
  }
  // The rectangle around where the four corners go.
  mapRect(rect: Rect): Rect {
    const corners = [
      this.map(new Point(rect.left, rect.top)),
      this.map(new Point(rect.right, rect.top)),
      this.map(new Point(rect.left, rect.bottom)),
      this.map(new Point(rect.right, rect.bottom)),
    ];
    const xs = corners.map((corner) => corner.x);
    const ys = corners.map((corner) => corner.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return new Rect(left, top, Math.max(...xs) - left, Math.max(...ys) - top);
  }
  fuzzyEquals(other: Matrix4x4, epsilon = 0.00001) {
    const b = cells(other);
    return cells(this).every((cell, index) => near(cell, b[index]!, epsilon));
  }
  toString() {
    return list("QMatrix4x4", cells(this));
  }
}

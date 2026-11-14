// An outline: what the elements of a Path draw, as Qt keeps it.
//
// Qt turns every path element into moves, lines and cubic curves
// (QPainterPath), arcs included, and answers "where is the point at this
// fraction of the length" from those. The same is done here with Qt's
// arithmetic, so that a point along a path is where Qt has it, and the SVG
// path a Shape draws is made from the same parts.

const MOVE = 0;
const LINE = 1;
const CURVE = 2;

// A curve is its eight numbers: where it starts, its two control points and
// where it ends.
type Curve = [number, number, number, number, number, number, number, number];
export type Point = [number, number];

// What a path is made of, as QPainterPath keeps it.
type Part =
  | { kind: typeof MOVE; x: number; y: number }
  | { kind: typeof LINE; x: number; y: number }
  | { kind: typeof CURVE; x1: number; y1: number; x2: number; y2: number; x: number; y: number };

// A line or a curve, where it starts along the outline and how long it is.
type Segment =
  | { line: true; x0: number; y0: number; x1: number; y1: number; before: number; length: number }
  | { line: false; b: Curve; before: number; length: number };

interface Measured {
  segments: Segment[];
  length: number;
}

// Qt's QT_PATH_KAPPA: how far a quarter circle's control points are out.
const KAPPA = 0.5522847498;

// qFuzzyIsNull and qFuzzyCompare, of doubles.
const isNull = (value: number): boolean => Math.abs(value) <= 1e-12;
const same = (a: number, b: number): boolean => Math.abs(a - b) * 1e12 <= Math.min(Math.abs(a), Math.abs(b));

const finite = (...values: number[]): boolean => values.every(Number.isFinite);
const distance = (x1: number, y1: number, x2: number, y2: number): number => Math.hypot(x2 - x1, y2 - y1);

// The point of a curve at `t`. A curve is its eight numbers.
function curvePoint(b: Curve, t: number): Point {
  const m = 1 - t;
  const a = m * m * m;
  const c = 3 * m * m * t;
  const d = 3 * m * t * t;
  const e = t * t * t;
  return [a * b[0] + c * b[2] + d * b[4] + e * b[6], a * b[1] + c * b[3] + d * b[5] + e * b[7]];
}

// The direction a curve goes in at `t`.
function curveTangent(b: Curve, t: number): Point {
  const m = 1 - t;
  const a = 3 * m * m;
  const c = 6 * m * t;
  const d = 3 * t * t;
  return [
    a * (b[2] - b[0]) + c * (b[4] - b[2]) + d * (b[6] - b[4]),
    a * (b[3] - b[1]) + c * (b[5] - b[3]) + d * (b[7] - b[5]),
  ];
}

// Cuts `b` at `t`: returns what is before, and leaves in `b` what is after
// (QBezier::parameterSplitLeft).
function splitLeft(b: Curve, t: number): Curve {
  const left = new Array(8) as Curve;
  for (let axis = 0; axis < 2; axis++) {
    left[axis] = b[axis]!;
    left[2 + axis] = b[axis]! + t * (b[2 + axis]! - b[axis]!);
    b[2 + axis] = b[2 + axis]! + t * (b[4 + axis]! - b[2 + axis]!);
    b[4 + axis] = b[4 + axis]! + t * (b[6 + axis]! - b[4 + axis]!);
    left[4 + axis] = left[2 + axis]! + t * (b[2 + axis]! - left[2 + axis]!);
    b[2 + axis] = b[2 + axis]! + t * (b[4 + axis]! - b[2 + axis]!);
    left[6 + axis] = b[axis] = left[4 + axis]! + t * (b[2 + axis]! - left[4 + axis]!);
  }
  return left;
}

// The part of a curve between two of its parameters.
function interval(b: Curve, from: number, to: number): Curve {
  if (from === 0 && to === 1) return b;
  const rest = b.slice() as Curve;
  splitLeft(rest, from);
  return splitLeft(rest, (to - from) / (1 - from));
}

// A curve's length as Qt measures it (QBezier::length): halved until the
// control polygon is within 0.01 of the chord, then the polygons added up.
function curveLength(b: Curve): number {
  const polygon =
    distance(b[0], b[1], b[2], b[3]) + distance(b[2], b[3], b[4], b[5]) + distance(b[4], b[5], b[6], b[7]);
  if (polygon - distance(b[0], b[1], b[6], b[7]) <= 0.01) return polygon;
  const right = b.slice() as Curve;
  const left = splitLeft(right, 0.5);
  return curveLength(left) + curveLength(right);
}

// The parameter of a quarter circle's curve at an angle of it in degrees
// (qt_t_for_arc_angle): two steps of Newton's method for the cosine, two
// for the sine, and the middle of the two.
function arcParameter(angle: number): number {
  if (isNull(angle)) return 0;
  if (same(angle, 90)) return 1;
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  let tc = angle / 90;
  for (let step = 0; step < 2; step++) {
    tc -=
      (((2 - 3 * KAPPA) * tc + 3 * (KAPPA - 1)) * tc * tc + 1 - cos) / (((6 - 9 * KAPPA) * tc + 6 * (KAPPA - 1)) * tc);
  }
  let ts = tc;
  for (let step = 0; step < 2; step++) {
    ts -=
      ((((3 * KAPPA - 2) * ts - 6 * KAPPA + 3) * ts + 3 * KAPPA) * ts - sin) /
      (((9 * KAPPA - 6) * ts + 12 * KAPPA - 6) * ts + 3 * KAPPA);
  }
  return 0.5 * (tc + ts);
}

// The point of the ellipse in a rectangle at an angle, counter-clockwise
// from three o'clock as Qt's angles are (qt_find_ellipse_coords).
function ellipsePoint(x: number, y: number, width: number, height: number, angle: number): Point {
  const turn = angle - 360 * Math.floor(angle / 360);
  let t = turn / 90;
  const quadrant = Math.trunc(t);
  t = arcParameter(90 * (t - quadrant));
  if (quadrant & 1) t = 1 - t;
  const m = 1 - t;
  const a = m * m * m;
  const b = 3 * m * m * t;
  const c = 3 * m * t * t;
  const d = t * t * t;
  let px = a + b + c * KAPPA;
  let py = d + c + b * KAPPA;
  if (quadrant === 1 || quadrant === 2) px = -px;
  if (quadrant === 0 || quadrant === 1) py = -py;
  return [x + width / 2 + (width / 2) * px, y + height / 2 + (height / 2) * py];
}

// The curves of an arc of the ellipse in a rectangle, and where the first
// starts (qt_curves_for_arc). Angles in degrees, counter-clockwise.
function arcCurves(
  x: number,
  y: number,
  w: number,
  h: number,
  startAngle: number,
  sweep: number,
): { start: Point; curves: Curve[] } {
  const curves: Curve[] = [];
  const w2 = w / 2;
  const w2k = w2 * KAPPA;
  const h2 = h / 2;
  const h2k = h2 * KAPPA;
  const points: Point[] = [
    [x + w, y + h2],
    [x + w, y + h2 + h2k],
    [x + w2 + w2k, y + h],
    [x + w2, y + h],
    [x + w2 - w2k, y + h],
    [x, y + h2 + h2k],
    [x, y + h2],
    [x, y + h2 - h2k],
    [x + w2 - w2k, y],
    [x + w2, y],
    [x + w2 + w2k, y],
    [x + w, y + h2 - h2k],
    [x + w, y + h2],
  ];
  const curve = (...indices: number[]): Curve => indices.flatMap((index) => points[index]!) as Curve;
  if (sweep > 360) sweep = 360;
  else if (sweep < -360) sweep = -360;
  if (startAngle === 0) {
    if (same(sweep, 360)) {
      for (let index = 12; index >= 3; index -= 3) curves.push(curve(index, index - 1, index - 2, index - 3));
      return { start: points[12]!, curves };
    }
    if (same(sweep, -360)) {
      for (let index = 0; index <= 9; index += 3) curves.push(curve(index, index + 1, index + 2, index + 3));
      return { start: points[0]!, curves };
    }
  }
  let startSegment = Math.floor(startAngle / 90);
  let endSegment = Math.floor((startAngle + sweep) / 90);
  let startT = (startAngle - startSegment * 90) / 90;
  let endT = (startAngle + sweep - endSegment * 90) / 90;
  const delta = sweep > 0 ? 1 : -1;
  if (delta < 0) {
    startT = 1 - startT;
    endT = 1 - endT;
  }
  // Not an empty part at either end.
  if (isNull(startT - 1)) {
    startT = 0;
    startSegment += delta;
  }
  if (isNull(endT)) {
    endT = 1;
    endSegment -= delta;
  }
  startT = arcParameter(startT * 90);
  endT = arcParameter(endT * 90);
  const splitAtStart = !isNull(startT);
  const splitAtEnd = !isNull(endT - 1);
  const end = endSegment + delta;
  const quarter = (segment: number): number => 3 * (3 - (((segment % 4) + 4) % 4));
  // Nothing to draw.
  if (startSegment === end) {
    const at = quarter(startSegment);
    return { start: delta > 0 ? points[at + 3]! : points[at]!, curves };
  }
  const start = ellipsePoint(x, y, w, h, startAngle);
  for (let segment = startSegment; segment !== end; segment += delta) {
    const at = quarter(segment);
    let b = delta > 0 ? curve(at + 3, at + 2, at + 1, at) : curve(at, at + 1, at + 2, at + 3);
    if (startSegment === endSegment && same(startT, endT)) return { start, curves: [] };
    if (segment === startSegment) {
      if (segment === endSegment && splitAtEnd) b = interval(b, startT, endT);
      else if (splitAtStart) b = interval(b, startT, 1);
    } else if (segment === endSegment && splitAtEnd) {
      b = interval(b, 0, endT);
    }
    curves.push(b);
  }
  const [ex, ey] = ellipsePoint(x, y, w, h, startAngle + sweep);
  const last = curves.at(-1)!;
  last[6] = ex;
  last[7] = ey;
  return { start, curves };
}

// A number of an SVG path, short: the outline is exact, what is written to
// the page need not be.
const number = (value: number): string => {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
};

// Where a curve's coordinate along one axis turns back: its extremes.
function turns(p0: number, p1: number, p2: number, p3: number, into: number[]): void {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) into.push(-c / b);
    return;
  }
  const root = b * b - 4 * a * c;
  if (root < 0) return;
  const square = Math.sqrt(root);
  into.push((-b + square) / (2 * a), (-b - square) / (2 * a));
}

export class Outline {
  declare parts: Part[];
  declare first: number;
  declare shut: boolean;
  declare measured: Measured | null;

  constructor() {
    // Qt's path is never empty once something is added: it starts at 0,0.
    this.parts = [{ kind: MOVE, x: 0, y: 0 }];
    // Where the subpath being drawn started, and whether it was closed: what
    // comes after a closed one starts a new one where that ended.
    this.first = 0;
    this.shut = false;
    this.measured = null;
  }

  get x(): number {
    return this.parts.at(-1)!.x;
  }

  get y(): number {
    return this.parts.at(-1)!.y;
  }

  begin(): void {
    if (!this.shut) return;
    this.shut = false;
    this.parts.push({ kind: MOVE, x: this.x, y: this.y });
  }

  moveTo(x: number, y: number): void {
    if (!finite(x, y)) return;
    this.shut = false;
    const last = this.parts.at(-1)!;
    // A move after a move replaces it.
    if (last.kind === MOVE) {
      last.x = x;
      last.y = y;
    } else {
      this.parts.push({ kind: MOVE, x, y });
    }
    this.first = this.parts.length - 1;
  }

  lineTo(x: number, y: number): void {
    if (!finite(x, y)) return;
    this.begin();
    if (x === this.x && y === this.y) return;
    this.parts.push({ kind: LINE, x, y });
  }

  cubicTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void {
    if (!finite(x1, y1, x2, y2, x, y)) return;
    const fromX = this.x;
    const fromY = this.y;
    // A curve that goes nowhere is no curve.
    if (fromX === x1 && fromY === y1 && x1 === x2 && y1 === y2 && x2 === x && y2 === y) return;
    this.begin();
    this.parts.push({ kind: CURVE, x1, y1, x2, y2, x, y });
  }

  quadTo(cx: number, cy: number, x: number, y: number): void {
    if (!finite(cx, cy, x, y)) return;
    const fromX = this.x;
    const fromY = this.y;
    if (fromX === cx && fromY === cy && cx === x && cy === y) return;
    this.cubicTo((fromX + 2 * cx) / 3, (fromY + 2 * cy) / 3, (x + 2 * cx) / 3, (y + 2 * cy) / 3, x, y);
  }

  close(): void {
    if (this.parts.length === 1) return;
    this.shut = true;
    const first = this.parts[this.first]!;
    const last = this.parts.at(-1)!;
    if (first.x === last.x && first.y === last.y) return;
    if (same(first.x, last.x) && same(first.y, last.y)) {
      last.x = first.x;
      last.y = first.y;
    } else {
      this.parts.push({ kind: LINE, x: first.x, y: first.y });
    }
  }

  // QPainterPath::arcMoveTo and arcTo: an arc of the ellipse in a rectangle.
  arcMoveTo(x: number, y: number, width: number, height: number, angle: number): void {
    if (!finite(x, y, width, height, angle) || (width === 0 && height === 0)) return;
    this.moveTo(...ellipsePoint(x, y, width, height, angle));
  }

  arcTo(x: number, y: number, width: number, height: number, startAngle: number, sweep: number): void {
    if (!finite(x, y, width, height, startAngle, sweep) || (width === 0 && height === 0)) return;
    const { start, curves } = arcCurves(x, y, width, height, startAngle, sweep);
    this.lineTo(start[0], start[1]);
    for (const b of curves) this.cubicTo(b[2], b[3], b[4], b[5], b[6], b[7]);
  }

  addRect(x: number, y: number, width: number, height: number): void {
    if (!finite(x, y, width, height) || (width === 0 && height === 0)) return;
    this.moveTo(x, y);
    this.parts.push(
      { kind: LINE, x: x + width, y },
      { kind: LINE, x: x + width, y: y + height },
      { kind: LINE, x, y: y + height },
      { kind: LINE, x, y },
    );
    this.shut = true;
  }

  // An SVG arc from where the outline is, as Qt's SVG code draws one: curves
  // of at most a quarter turn each.
  svgArc(rx: number, ry: number, rotation: number, large: unknown, sweep: unknown, x: number, y: number): void {
    if (!finite(rx, ry, rotation, x, y)) return;
    const curX = this.x;
    const curY = this.y;
    // No radius: a line, which is what Qt draws.
    if (!rx || !ry) return this.lineTo(x, y);
    rx = Math.abs(rx);
    ry = Math.abs(ry);
    const sin = Math.sin((rotation * Math.PI) / 180);
    const cos = Math.cos((rotation * Math.PI) / 180);
    const dx = (curX - x) / 2;
    const dy = (curY - y) / 2;
    const dx1 = cos * dx + sin * dy;
    const dy1 = -sin * dx + cos * dy;
    // Radii too small to reach are made large enough.
    const check = (dx1 * dx1) / (rx * rx) + (dy1 * dy1) / (ry * ry);
    if (check > 1) {
      rx *= Math.sqrt(check);
      ry *= Math.sqrt(check);
    }
    const a00 = cos / rx;
    const a01 = sin / rx;
    const a10 = -sin / ry;
    const a11 = cos / ry;
    const x0 = a00 * curX + a01 * curY;
    const y0 = a10 * curX + a11 * curY;
    const x1 = a00 * x + a01 * y;
    const y1 = a10 * x + a11 * y;
    // In this space the arc is of a circle of radius one.
    const d = (x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0);
    if (!d) return;
    let factor = Math.sqrt(Math.max(0, 1 / d - 0.25));
    if (Boolean(sweep) === Boolean(large)) factor = -factor;
    const xc = 0.5 * (x0 + x1) - factor * (y1 - y0);
    const yc = 0.5 * (y0 + y1) + factor * (x1 - x0);
    const th0 = Math.atan2(y0 - yc, x0 - xc);
    const th1 = Math.atan2(y1 - yc, x1 - xc);
    let arc = th1 - th0;
    if (arc < 0 && sweep) arc += 2 * Math.PI;
    else if (arc > 0 && !sweep) arc -= 2 * Math.PI;
    const count = Math.ceil(Math.abs(arc / (Math.PI * 0.5 + 0.001)));
    const b00 = cos * rx;
    const b01 = -sin * ry;
    const b10 = sin * rx;
    const b11 = cos * ry;
    for (let index = 0; index < count; index++) {
      const from = th0 + (index * arc) / count;
      const to = th0 + ((index + 1) * arc) / count;
      const half = 0.5 * (to - from);
      const t = ((8 / 3) * Math.sin(half * 0.5) * Math.sin(half * 0.5)) / Math.sin(half);
      const px1 = xc + Math.cos(from) - t * Math.sin(from);
      const py1 = yc + Math.sin(from) + t * Math.cos(from);
      const px3 = xc + Math.cos(to);
      const py3 = yc + Math.sin(to);
      const px2 = px3 + t * Math.sin(to);
      const py2 = py3 - t * Math.cos(to);
      this.cubicTo(
        b00 * px1 + b01 * py1,
        b10 * px1 + b11 * py1,
        b00 * px2 + b01 * py2,
        b10 * px2 + b11 * py2,
        b00 * px3 + b01 * py3,
        b10 * px3 + b11 * py3,
      );
    }
  }

  // `Path.scale`: every coordinate, from the origin.
  scale(sx: number, sy: number): void {
    for (const part of this.parts) {
      part.x *= sx;
      part.y *= sy;
      if (part.kind !== CURVE) continue;
      part.x1 *= sx;
      part.y1 *= sy;
      part.x2 *= sx;
      part.y2 *= sy;
    }
    this.measured = null;
  }

  // The point `back` parts before the end: what a smooth curve bends from.
  before(back: number): Point {
    const part = this.parts[this.parts.length - 1 - back];
    return part ? [part.x, part.y] : [this.parts[0]!.x, this.parts[0]!.y];
  }

  // The lines and curves, each with where it starts and how long it is.
  measure(): Measured {
    if (this.measured) return this.measured;
    const segments: Segment[] = [];
    let length = 0;
    let x = 0;
    let y = 0;
    for (const part of this.parts) {
      if (part.kind === LINE) {
        const own = distance(x, y, part.x, part.y);
        segments.push({ line: true, x0: x, y0: y, x1: part.x, y1: part.y, before: length, length: own });
        length += own;
      } else if (part.kind === CURVE) {
        const b: Curve = [x, y, part.x1, part.y1, part.x2, part.y2, part.x, part.y];
        const own = curveLength(b);
        segments.push({ line: false, b, before: length, length: own });
        length += own;
      }
      x = part.x;
      y = part.y;
    }
    return (this.measured = { segments, length });
  }

  get length(): number {
    return this.measure().length;
  }

  // How long its first `count` parts are.
  lengthAt(count: number): number {
    const { segments } = this.measure();
    let drawn = 0;
    for (let index = 0; index < count && index < this.parts.length; index++) if (this.parts[index]!.kind !== MOVE) drawn++;
    const last = segments[drawn - 1];
    return last ? last.before + last.length : 0;
  }

  // The segment a fraction of the length falls in, and how far along it:
  // by length for a line, by the curve's own parameter for a curve, which is
  // how Qt has it.
  locate(fraction: unknown): { segment: Segment; along: number } | null {
    const { segments, length } = this.measure();
    if (!segments.length || !(length > 0)) return null;
    const t = Math.min(1, Math.max(0, Number(fraction) || 0));
    const target = length * t;
    let segment = segments.at(-1)!;
    for (const each of segments) {
      if (each.before + each.length >= target) {
        segment = each;
        break;
      }
    }
    const along = segment.length > 0 ? Math.min(1, Math.max(0, (target - segment.before) / segment.length)) : 0;
    return { segment, along };
  }

  // The point at a fraction of the length, 0 to 1.
  pointAt(fraction: unknown): Point {
    const found = this.locate(fraction);
    if (!found) return [this.parts[0]!.x, this.parts[0]!.y];
    const { segment, along } = found;
    if (segment.line) {
      return [segment.x0 + (segment.x1 - segment.x0) * along, segment.y0 + (segment.y1 - segment.y0) * along];
    }
    return curvePoint(segment.b, along);
  }

  // The direction the outline goes in there, in degrees clockwise from
  // pointing right, 0 to 360: the rotation of something that follows it.
  angleAt(fraction: unknown): number {
    const found = this.locate(fraction);
    if (!found) return 0;
    const { segment, along } = found;
    let dx: number;
    let dy: number;
    if (segment.line) {
      dx = segment.x1 - segment.x0;
      dy = segment.y1 - segment.y0;
    } else {
      const b = segment.b;
      [dx, dy] = curveTangent(b, along);
      // Where control points meet the ends there is no tangent: a little
      // further along there is.
      if (dx === 0 && dy === 0) [dx, dy] = curveTangent(b, along < 0.5 ? along + 0.001 : along - 0.001);
    }
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    return angle < 0 ? angle + 360 : angle + 0;
  }

  // The rectangle the outline is in: the curves themselves, not their
  // control points.
  bounds(): { x: number; y: number; width: number; height: number } {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    const take = (x: number, y: number): void => {
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    };
    let x = 0;
    let y = 0;
    for (const part of this.parts) {
      take(part.x, part.y);
      if (part.kind === CURVE) {
        const b: Curve = [x, y, part.x1, part.y1, part.x2, part.y2, part.x, part.y];
        const at: number[] = [];
        turns(b[0], b[2], b[4], b[6], at);
        turns(b[1], b[3], b[5], b[7], at);
        for (const t of at) if (t > 0 && t < 1) take(...curvePoint(b, t));
      }
      x = part.x;
      y = part.y;
    }
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  // Whether anything is drawn at all.
  get empty(): boolean {
    return this.parts.length === 1;
  }

  // The outline as an SVG path. A subpath that ends where it started is
  // closed: Qt joins its ends when it strokes one.
  toString(): string {
    const text: string[] = [];
    let start: Part | null = null;
    let drawn = false;
    const finish = (last: Part): void => {
      if (drawn && start && last.x === start.x && last.y === start.y) text.push("Z");
    };
    let previous: Part | null = null;
    for (const part of this.parts) {
      if (part.kind === MOVE) {
        if (previous) finish(previous);
        start = part;
        drawn = false;
        text.push(`M${number(part.x)} ${number(part.y)}`);
      } else if (part.kind === LINE) {
        drawn = true;
        text.push(`L${number(part.x)} ${number(part.y)}`);
      } else {
        drawn = true;
        text.push(
          `C${number(part.x1)} ${number(part.y1)} ${number(part.x2)} ${number(part.y2)} ${number(part.x)} ${number(part.y)}`,
        );
      }
      previous = part;
    }
    if (previous) finish(previous);
    return drawn || text.length > 1 ? text.join("") : "";
  }
}

const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
const COMMAND = /([a-zA-Z])([^a-zA-Z]*)/g;

// Draws SVG path data into an outline, as Qt's parser does (PathSvg): the
// data's coordinates start from 0,0 whatever the outline has already.
// Returns whether all of it was understood.
export function svgPath(outline: Outline, data: unknown): boolean {
  let x0 = 0;
  let y0 = 0;
  let x = 0;
  let y = 0;
  let control: Point = [0, 0];
  let lastMode = "";
  for (const [, letter, text] of String(data ?? "").matchAll(COMMAND)) {
    const numbers = (text!.match(NUMBER) ?? []).map(Number);
    let mode = letter!;
    if (mode === "z" || mode === "Z") numbers.push(0);
    let at = 0;
    const left = () => numbers.length - at;
    const take = (): number => numbers[at++]!;
    while (left() > 0) {
      const relative = mode === mode.toLowerCase();
      const ox = relative ? x : 0;
      const oy = relative ? y : 0;
      const needs = ({ m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 1 } as Record<string, number | undefined>)[mode.toLowerCase()];
      if (needs === undefined) return false;
      if (left() < needs) break;
      switch (mode.toLowerCase()) {
        case "m":
          x = x0 = take() + ox;
          y = y0 = take() + oy;
          outline.moveTo(x, y);
          // More pairs after a move are lines.
          mode = relative ? "l" : "L";
          lastMode = relative ? "m" : "M";
          continue;
        case "z":
          take();
          x = x0;
          y = y0;
          outline.close();
          break;
        case "l":
          x = take() + ox;
          y = take() + oy;
          outline.lineTo(x, y);
          break;
        case "h":
          x = take() + ox;
          outline.lineTo(x, y);
          break;
        case "v":
          y = take() + oy;
          outline.lineTo(x, y);
          break;
        case "c": {
          const x1 = take() + ox;
          const y1 = take() + oy;
          control = [take() + ox, take() + oy];
          x = take() + ox;
          y = take() + oy;
          outline.cubicTo(x1, y1, control[0], control[1], x, y);
          break;
        }
        case "s": {
          const smooth = "cCsS".includes(lastMode) && lastMode !== "";
          const x1 = smooth ? 2 * x - control[0] : x;
          const y1 = smooth ? 2 * y - control[1] : y;
          control = [take() + ox, take() + oy];
          x = take() + ox;
          y = take() + oy;
          outline.cubicTo(x1, y1, control[0], control[1], x, y);
          break;
        }
        case "q":
          control = [take() + ox, take() + oy];
          x = take() + ox;
          y = take() + oy;
          outline.quadTo(control[0], control[1], x, y);
          break;
        case "t": {
          const smooth = "qQtT".includes(lastMode) && lastMode !== "";
          control = smooth ? [2 * x - control[0], 2 * y - control[1]] : [x, y];
          x = take() + ox;
          y = take() + oy;
          outline.quadTo(control[0], control[1], x, y);
          break;
        }
        case "a": {
          const rx = take();
          const ry = take();
          const rotation = take();
          const large = take();
          const sweep = take();
          const ex = take() + ox;
          const ey = take() + oy;
          outline.svgArc(rx, ry, rotation, large, sweep, ex, ey);
          x = ex;
          y = ey;
          break;
        }
      }
      lastMode = mode;
    }
  }
  return true;
}

// Path and its elements: lines, arcs and curves, one after the other.
//
// A path is not drawn by itself: a ShapePath draws one, a PathView puts its
// items along one. What it gives either is its outline (`$outline()`), made
// again when an element changes.
import { Point, Size } from "../QtQml/values.js";
import { contents, defineType, derived, effect, QtObject, settle, slot } from "../object.js";
import { lazy } from "./compute.js";
import { Outline, svgPath } from "./outline.js";
import { signal } from "#kernel";

const next = (version) => version + 1;

// Where an element ends: what it is given from the point before it
// (`relativeX`) if it was, else where it says (`x`), which is 0 unsaid.
const along = (self, name, relative, from) => {
  const offset = self[relative];
  return offset === undefined ? Number(self[name]) || 0 : from + Number(offset);
};
const end = (self, x, y) => [along(self, "x", "relativeX", x), along(self, "y", "relativeY", y)];

// A control point, which is relative to where the element starts.
const control = (self, name, x, y) => {
  const relative = `relative${name[0].toUpperCase()}${name.slice(1)}`;
  return [along(self, `${name}X`, `${relative}X`, x), along(self, `${name}Y`, `${relative}Y`, y)];
};

// An element draws itself into the outline: `$draw(outline, at)`, where
// `at` says which of the path's elements it is (`at.curves[at.index]`).
const PathElement = defineType("PathElement", QtObject, {});

const Curve = defineType("Curve", PathElement, {
  properties: { x: 0, y: 0, relativeX: undefined, relativeY: undefined },
});

export const PathLine = defineType("PathLine", Curve, {
  methods: {
    $draw(outline) {
      outline.lineTo(...end(this, outline.x, outline.y));
    },
  },
});

export const PathMove = defineType("PathMove", Curve, {
  methods: {
    $draw(outline) {
      outline.moveTo(...end(this, outline.x, outline.y));
    },
  },
});

export const PathQuad = defineType("PathQuad", Curve, {
  properties: { controlX: 0, controlY: 0, relativeControlX: undefined, relativeControlY: undefined },
  methods: {
    $draw(outline) {
      const { x, y } = outline;
      outline.quadTo(...control(this, "control", x, y), ...end(this, x, y));
    },
  },
});

export const PathCubic = defineType("PathCubic", Curve, {
  properties: {
    control1X: 0,
    control1Y: 0,
    control2X: 0,
    control2Y: 0,
    relativeControl1X: undefined,
    relativeControl1Y: undefined,
    relativeControl2X: undefined,
    relativeControl2Y: undefined,
  },
  methods: {
    $draw(outline) {
      const { x, y } = outline;
      outline.cubicTo(...control(this, "control1", x, y), ...control(this, "control2", x, y), ...end(this, x, y));
    },
  },
});

// A curve through its end point that bends smoothly into its neighbours: a
// Catmull-Rom spline, which Qt draws as the cubic through the same points.
export const PathCurve = defineType("PathCurve", Curve, {
  methods: {
    $draw(outline, { index, curves }) {
      const smooth = (curve) => Boolean(curve?.$type?.chain.includes(PathCurve));
      const first = outline.parts[0];
      const prev = [outline.x, outline.y];
      let far = prev;
      if (smooth(curves[index - 1])) {
        far = outline.before(1);
      } else if (index === 0 && curves.length > 1 && smooth(curves.at(-1))) {
        // A path that starts and ends with these and comes back to where it
        // started bends through that point too.
        let at = prev;
        let before = prev;
        for (let other = 0; other < curves.length; other++) {
          at = end(curves[other], at[0], at[1]);
          if (other === curves.length - 2) before = at;
        }
        if (at[0] === first.x && at[1] === first.y) far = before;
      }
      const point = end(this, prev[0], prev[1]);
      let after = point;
      if (smooth(curves[index + 1])) {
        after = end(curves[index + 1], point[0], point[1]);
      } else if (point[0] === first.x && point[1] === first.y && smooth(curves[0]) && outline.parts.length >= 2) {
        after = [outline.parts[1].x, outline.parts[1].y];
      }
      outline.cubicTo(
        far[0] * -0.167 + prev[0] + point[0] * 0.167,
        far[1] * -0.167 + prev[1] + point[1] * 0.167,
        prev[0] * 0.167 + point[0] + after[0] * -0.167,
        prev[1] * 0.167 + point[1] + after[1] * -0.167,
        point[0],
        point[1],
      );
    },
  },
});

const CLOCKWISE = 0;

export const PathArc = defineType("PathArc", Curve, {
  properties: { radiusX: 0, radiusY: 0, useLargeArc: false, direction: CLOCKWISE, xAxisRotation: 0 },
  enums: { Clockwise: CLOCKWISE, Counterclockwise: 1 },
  methods: {
    $draw(outline) {
      const [x, y] = end(this, outline.x, outline.y);
      outline.svgArc(
        Number(this.radiusX),
        Number(this.radiusY),
        Number(this.xAxisRotation) || 0,
        this.useLargeArc,
        this.direction === CLOCKWISE,
        x,
        y,
      );
    },
  },
});

// An arc by its centre and angles, clockwise from three o'clock.
export const PathAngleArc = defineType("PathAngleArc", Curve, {
  properties: { centerX: 0, centerY: 0, radiusX: 0, radiusY: 0, startAngle: 0, sweepAngle: 0, moveToStart: true },
  methods: {
    $draw(outline) {
      const rx = Number(this.radiusX);
      const ry = Number(this.radiusY);
      const x = this.centerX - rx;
      const y = this.centerY - ry;
      if (this.moveToStart) outline.arcMoveTo(x, y, rx * 2, ry * 2, -this.startAngle);
      outline.arcTo(x, y, rx * 2, ry * 2, -this.startAngle, -this.sweepAngle);
    },
  },
});

export const PathSvg = defineType("PathSvg", Curve, {
  properties: { path: "" },
  methods: {
    $draw(outline) {
      svgPath(outline, this.path);
    },
  },
});

const pointOf = (value) => (Array.isArray(value) ? value : [value?.x, value?.y]);
const listOf = (value) => (value == null ? [] : Array.isArray(value) ? value : Array.from(value));

function polyline(outline, points) {
  if (points.length < 2) return;
  outline.moveTo(...pointOf(points[0]));
  for (let index = 1; index < points.length; index++) outline.lineTo(...pointOf(points[index]));
}

export const PathPolyline = defineType("PathPolyline", Curve, {
  properties: {
    path: undefined,
    start: derived((self) => {
      const [x, y] = pointOf(listOf(self.path)[0]);
      return new Point(x ?? 0, y ?? 0);
    }),
  },
  methods: {
    $draw(outline) {
      polyline(outline, listOf(this.path));
    },
  },
});

export const PathMultiline = defineType("PathMultiline", Curve, {
  properties: {
    paths: undefined,
    start: derived((self) => {
      const [x, y] = pointOf(listOf(listOf(self.paths)[0])[0]);
      return new Point(x ?? 0, y ?? 0);
    }),
  },
  methods: {
    $draw(outline) {
      for (const points of listOf(this.paths)) polyline(outline, listOf(points));
    },
  },
});

// A corner's radius, or the one all four have; and whether it is cut
// straight instead of rounded.
const corner = (self, name) => Number(self[`${name}Radius`] ?? self.radius) || 0;
const cut = (self, name) => Boolean(self[`${name}Bevel`] ?? self.bevel);

export const PathRectangle = defineType("PathRectangle", Curve, {
  properties: {
    width: 0,
    height: 0,
    strokeAdjustment: 0,
    radius: 0,
    topLeftRadius: undefined,
    topRightRadius: undefined,
    bottomLeftRadius: undefined,
    bottomRightRadius: undefined,
    bevel: false,
    topLeftBevel: undefined,
    topRightBevel: undefined,
    bottomLeftBevel: undefined,
    bottomRightBevel: undefined,
  },
  methods: {
    $draw(outline) {
      const inset = this.strokeAdjustment * 0.5;
      const [x, y] = end(this, outline.x, outline.y);
      const left = x + inset;
      const top = y + inset;
      const width = this.width - 2 * inset;
      const height = this.height - 2 * inset;
      if (!(width > 0 && height > 0)) return;
      const right = left + width;
      const bottom = top + height;
      const most = Math.min(width, height);
      const size = (name) => Math.min(2 * Math.max(0, corner(this, name)), most);
      const tl = size("topLeft");
      const tr = size("topRight");
      const br = size("bottomRight");
      const bl = size("bottomLeft");
      if (!tl && !tr && !br && !bl) return outline.addRect(left, top, width, height);
      // Clockwise from the top left corner, as Qt goes round. A corner is
      // an arc in its square, or the line between the arc's ends, or a point.
      outline.moveTo(left + tl * 0.5, top);
      const turn = (name, size, ax, ay, angle, from, to, point) => {
        if (!size) outline.lineTo(...point);
        else if (cut(this, name)) {
          outline.lineTo(...from);
          outline.lineTo(...to);
        } else outline.arcTo(ax, ay, size, size, angle, -90);
      };
      turn("topRight", tr, right - tr, top, 90, [right - tr * 0.5, top], [right, top + tr * 0.5], [right, top]);
      turn("bottomRight", br, right - br, bottom - br, 0, [right, bottom - br * 0.5], [right - br * 0.5, bottom], [
        right,
        bottom,
      ]);
      turn("bottomLeft", bl, left, bottom - bl, 270, [left + bl * 0.5, bottom], [left, bottom - bl * 0.5], [left, bottom]);
      turn("topLeft", tl, left, top, 180, [left, top + tl * 0.5], [left + tl * 0.5, top], [left, top]);
      outline.close();
    },
  },
});

// What a PathView reads along a path: they draw nothing.
export const PathAttribute = defineType("PathAttribute", PathElement, {
  properties: { name: "", value: 0 },
});

export const PathPercent = defineType("PathPercent", PathElement, {
  properties: { value: 0 },
});

// The list of a path's elements, which a program may add to and replace
// (`path.pathElements.push(arc)`): the path is drawn again when it does.
const CHANGES = new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin"]);

function listed(elements, changed) {
  return new Proxy(elements, {
    get(target, key) {
      const value = target[key];
      if (typeof value !== "function" || !CHANGES.has(key)) return value;
      return (...args) => {
        const result = value.apply(target, args);
        changed();
        return result;
      };
    },
    set(target, key, value) {
      target[key] = value;
      changed();
      return true;
    },
  });
}

function build(self) {
  const outline = new Outline();
  const startX = Number(self.startX) || 0;
  const startY = Number(self.startY) || 0;
  outline.moveTo(startX, startY);
  const curves = self.pathElements.filter((element) => typeof element?.$draw === "function");
  // How many parts there were as each curve ended: where it ends.
  const ends = [];
  curves.forEach((curve, index) => {
    curve.$draw(outline, { index, curves });
    ends.push(outline.parts.length);
  });
  outline.ends = ends;
  outline.loop = outline.length > 0 && outline.x === startX && outline.y === startY;
  const scale = self.scale;
  const sx = Number(scale?.width ?? 1);
  const sy = Number(scale?.height ?? 1);
  if (sx !== 1 || sy !== 1) outline.scale(sx, sy);
  return outline;
}

// What the path's `PathAttribute`s say: a value at the start of the path or
// at the end of a curve, the one it is declared after. Between two it goes
// evenly from one to the other; before the first that names it, it grows
// from 0, and after the last it is what it was at the start. Qt's.
function attributes(self) {
  const outline = self.$outline();
  const whole = outline.length;
  const points = [{ percent: 0, values: {} }];
  const names = [];
  let curve = 0;
  for (const element of self.pathElements) {
    if (typeof element?.$draw === "function") {
      const percent = whole > 0 ? outline.lengthAt(outline.ends[curve++]) / whole : 0;
      points.push({ percent, values: {} });
    } else if (element?.$type === PathAttribute) {
      const name = String(element.name);
      if (!names.includes(name)) names.push(name);
      points.at(-1).values[name] = Number(element.value) || 0;
    }
  }
  for (const name of names) {
    let last = 0;
    let lastPercent = 0;
    let from = 0;
    for (let index = 0; index < points.length; index++) {
      const point = points[index];
      if (!(name in point.values)) continue;
      const value = point.values[name];
      for (let before = from; before < index; before++) {
        const span = point.percent - lastPercent;
        points[before].values[name] = span > 0 ? last + ((value - last) * (points[before].percent - lastPercent)) / span : last;
      }
      last = value;
      lastPercent = point.percent;
      from = index + 1;
    }
    const first = points[0].values[name] ?? 0;
    for (let after = from; after < points.length; after++) points[after].values[name] = first;
  }
  return { names, points };
}

// The value of an attribute at a fraction of the path's length.
function attributeAt({ points }, name, percent) {
  if (percent < 0 || percent > 1) return 0;
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    if (point.percent === percent) return point.values[name];
    if (point.percent < percent) continue;
    const before = points[index - 1];
    const last = before?.values[name] ?? 0;
    const lastPercent = before?.percent ?? 0;
    return last + ((point.values[name] - last) * (percent - lastPercent)) / (point.percent - lastPercent);
  }
  return 0;
}

export const Path = defineType("Path", QtObject, {
  properties: {
    startX: 0,
    startY: 0,
    pathElements: undefined,
    scale: new Size(1, 1),
    simplify: false,
    asynchronous: false,
    // Whether it ends where it started.
    closed: derived((self) => self.$outline().loop),
  },
  signals: ["changed"],
  methods: {
    get pathElements() {
      const path = this.$path;
      path.version();
      if (path.assigned) return path.assigned;
      const bound = slot(this, "pathElements").get();
      if (bound == null) return path.declared;
      return (path.wrapped.get(bound) ?? path.wrapped.set(bound, path.list(listOf(bound))).get(bound));
    },
    set pathElements(elements) {
      const path = this.$path;
      path.assigned = path.list([...listOf(elements)]);
      path.bump(next);
      settle();
    },
    // The point at a fraction of the path's length, 0 to 1.
    pointAtPercent(fraction) {
      const [x, y] = this.$outline().pointAt(fraction);
      return new Point(x, y);
    },
  },
  setup(self) {
    const [version, bump] = signal(0, self.$owner);
    const list = (elements) =>
      listed(elements, () => {
        bump(next);
        settle();
      });
    self.$path = { version, bump, list, assigned: null, declared: list([]), wrapped: new WeakMap() };
    self.$outline = lazy(self, () => build(self));
    // The names of its attributes, and what they are at a fraction of it.
    const told = lazy(self, () => attributes(self));
    self.$attributes = () => told().names;
    self.$attributeAt = (name, percent) => attributeAt(told(), name, percent);
    // `changed`: the path is another one than it was.
    let drawn = false;
    effect(
      () => self.$outline(),
      () => {
        if (drawn) self.changed();
        drawn = true;
      },
    );
  },
  adopt(self, props) {
    self.$path.declared = self.$path.list(contents(props));
  },
});

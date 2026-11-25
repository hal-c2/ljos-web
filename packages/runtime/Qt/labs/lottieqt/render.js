// One frame of a composition as filled and stroked paths.
//
// The order is the format's: the first layer of a list is on top, and so is
// the first item of a shape group. A fill or a stroke paints every path
// before it in its group, those of groups inside it too, each with its
// group's transform; a trim cuts the paths before it. What comes out is
// bottom first, each path already in the composition's coordinates.
//
// A path is a list of commands: ["M", x, y], ["L", x, y],
// ["C", x1, y1, x2, y2, x, y] and ["Z"].

// How deep compositions may hold each other: a file whose assets hold
// themselves stops here.
const MAX_DEPTH = 16;
const KAPPA = 0.5522847498307936;

// [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f.
const IDENTITY = [1, 0, 0, 1, 0, 0];
const times = (m, n) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const translate = (x, y) => [1, 0, 0, 1, x, y];
const rotate = (a) => [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
const scale = (x, y) => [x, 0, 0, y, 0, 0];
const skew = (kx, ky) => [1, ky, kx, 1, 0, 0];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const radians = (deg) => (deg * Math.PI) / 180;
// How much `m` scales lengths, on average over directions.
const meanScale = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

function mapped(path, m) {
  return path.map((c) => {
    if (c[0] === "Z") return c;
    const out = [c[0]];
    for (let i = 1; i < c.length; i += 2) out.push(...apply(m, c[i], c[i + 1]));
    return out;
  });
}

// The time inside a layer: its keyframes count from its start time, at its
// stretch.
const localTime = (layer, t) => (t - layer.startTime) / layer.stretch;

// Position, then rotation, skew and scale about the anchor.
function matrix(tr, t) {
  const [ax, ay] = tr.anchor.point(t);
  const [px, py] = tr.position.joined ? tr.position.joined.point(t) : [tr.position.x.num(t, 0, 0), tr.position.y.num(t, 0, 0)];
  const s = tr.scale.at(t);
  const sx = (s[0] ?? 100) / 100;
  const sy = (s[1] ?? sx * 100) / 100;
  let m = times(translate(px, py), rotate(radians(tr.rotation.num(t, 0, 0))));
  const sk = tr.skew.num(t, 0, 0);
  if (sk !== 0) {
    const axis = radians(tr.skewAxis.num(t, 0, 0));
    m = times(times(times(m, rotate(axis)), skew(Math.tan(-radians(sk)), 0)), rotate(-axis));
  }
  return times(times(m, scale(sx, sy)), translate(-ax, -ay));
}

// A layer's transform with its parents', each at its own time. Parents lend
// their transform, never their opacity.
function layerMatrix(list, layer, t, depth) {
  const own = matrix(layer.transform, localTime(layer, t));
  const parent = layer.parent !== null && depth < MAX_DEPTH ? list.find((l) => l.index === layer.parent) : null;
  return parent ? times(layerMatrix(list, parent, t, depth + 1), own) : own;
}

// The shapes of `comp` at `frame`, bottom first.
export function render(comp, frame) {
  // The last frame is part of the run, but a layer's out point is not: the
  // end is drawn just before it, where the layers still are.
  const t = frame >= comp.outPoint ? comp.outPoint - 1e-3 : frame;
  const out = [];
  layers(comp, comp.layers, t, IDENTITY, 1, 0, out);
  return out;
}

function layers(comp, list, t, m, alpha, depth, out) {
  if (depth > MAX_DEPTH) return;
  for (let i = list.length - 1; i >= 0; i--) {
    const layer = list[i];
    if (layer.hidden || t < layer.inPoint || t >= layer.outPoint) continue;
    const local = localTime(layer, t);
    const a = alpha * (layer.transform.opacity.num(local, 0, 100) / 100);
    if (a <= 0) continue;
    const world = times(m, layerMatrix(list, layer, t, 0));
    if (layer.shapes) group(layer.shapes, local, world, a, out);
    else if (layer.precomp !== undefined) {
      const inner = comp.assets.get(layer.precomp);
      if (!inner) continue;
      const innerT = layer.remap ? layer.remap.num(local, 0, 0) * comp.frameRate : local;
      layers(comp, inner, innerT, world, a, depth + 1, out);
    } else if (layer.solid) {
      const { width, height } = layer;
      const path = mapped([["M", 0, 0], ["L", width, 0], ["L", width, height], ["L", 0, height], ["Z"]], world);
      const [r, g, b] = layer.solid;
      out.push({ path, fill: "nonzero", color: [r, g, b, a] });
    }
  }
}

// The transform and opacity a group's `tr` gives everything in it.
function groupTransform(items, t) {
  const tr = items.find((s) => s.kind === "transform")?.transform;
  return tr ? [matrix(tr, t), tr.opacity.num(t, 0, 100) / 100] : [IDENTITY, 1];
}

function group(items, t, m, alpha, out) {
  const [own, opacity] = groupTransform(items, t);
  m = times(m, own);
  alpha *= opacity;
  if (alpha <= 0) return;
  // Bottom first: the last item of a group is the lowest.
  for (let j = items.length - 1; j >= 0; j--) {
    const item = items[j];
    if (item.kind === "group") group(item.items, t, m, alpha, out);
    else if (item.kind === "fill" || item.kind === "stroke") {
      const path = paths(items.slice(0, j), t, m).flat();
      if (!path.length) continue;
      const a = (alpha * item.opacity.num(t, 0, 100)) / 100;
      const paint = brush(item.paint, t, m, a);
      if (!paint) continue;
      if (item.kind === "fill") out.push({ path, fill: item.evenOdd ? "evenodd" : "nonzero", ...paint });
      else {
        const stroke = strokeOf(item.style, t, m);
        if (stroke) out.push({ path, stroke, ...paint });
      }
    }
  }
}

// The paths `items` make, mapped by `m`, trims applied.
function paths(items, t, m) {
  let out = [];
  for (const item of items) {
    if (item.kind === "group") out.push(...paths(item.items, t, times(m, groupTransform(item.items, t)[0])));
    else if (item.kind === "trim") {
      out = trim(out, item.start.num(t, 0, 0) / 100, item.end.num(t, 0, 100) / 100, item.offset.num(t, 0, 0) / 360, item.sequential);
    } else {
      const path = geometry(item, t);
      if (path?.length) out.push(mapped(path, m));
    }
  }
  return out;
}

function rectangle(x0, y0, x1, y1, r) {
  if (!(r > 0)) return [["M", x0, y0], ["L", x1, y0], ["L", x1, y1], ["L", x0, y1], ["Z"]];
  const sx = Math.sign(x1 - x0) || 1;
  const sy = Math.sign(y1 - y0) || 1;
  const k = r * (1 - KAPPA);
  return [
    ["M", x0 + sx * r, y0],
    ["L", x1 - sx * r, y0],
    ["C", x1 - sx * k, y0, x1, y0 + sy * k, x1, y0 + sy * r],
    ["L", x1, y1 - sy * r],
    ["C", x1, y1 - sy * k, x1 - sx * k, y1, x1 - sx * r, y1],
    ["L", x0 + sx * r, y1],
    ["C", x0 + sx * k, y1, x0, y1 - sy * k, x0, y1 - sy * r],
    ["L", x0, y0 + sy * r],
    ["C", x0, y0 + sy * k, x0 + sx * k, y0, x0 + sx * r, y0],
    ["Z"],
  ];
}

function ellipse(cx, cy, rx, ry) {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    ["M", cx + rx, cy],
    ["C", cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry],
    ["C", cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy],
    ["C", cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry],
    ["C", cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy],
    ["Z"],
  ];
}

function geometry(shape, t) {
  switch (shape.kind) {
    case "rect": {
      const [w, h] = [shape.size.num(t, 0, 0), shape.size.num(t, 1, 0)];
      const [x, y] = shape.position.point(t);
      const r = Math.min(shape.roundness.num(t, 0, 0), Math.min(Math.abs(w), Math.abs(h)) / 2);
      return rectangle(x - w / 2, y - h / 2, x + w / 2, y + h / 2, r);
    }
    case "ellipse": {
      const [w, h] = [shape.size.num(t, 0, 0), shape.size.num(t, 1, 0)];
      const [x, y] = shape.position.point(t);
      return ellipse(x, y, w / 2, h / 2);
    }
    case "path":
      return bezPath(shape.path.at(t));
    case "star": {
      const n = Math.max(Math.round(shape.points.num(t, 0, 5)), 2);
      const [cx, cy] = shape.position.point(t);
      const outer = shape.outer.num(t, 0, 0);
      const inner = shape.inner.num(t, 0, 0);
      const start = radians(shape.rotation.num(t, 0, 0) - 90);
      const corners = shape.star ? 2 * n : n;
      const step = (2 * Math.PI) / corners;
      const path = [];
      for (let k = 0; k < corners; k++) {
        const r = shape.star && k % 2 === 1 ? inner : outer;
        const a = start + step * k;
        path.push([k ? "L" : "M", cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      path.push(["Z"]);
      return path;
    }
    default:
      return null;
  }
}

function bezPath(b) {
  const v = b.vertices;
  if (!v.length) return [];
  const tangent = (list, k) => list[k] ?? [0, 0];
  const path = [["M", v[0][0], v[0][1]]];
  const segment = (a, z) => {
    const o = tangent(b.outTangents, a);
    const i = tangent(b.inTangents, z);
    if (!o[0] && !o[1] && !i[0] && !i[1]) path.push(["L", v[z][0], v[z][1]]);
    else path.push(["C", v[a][0] + o[0], v[a][1] + o[1], v[z][0] + i[0], v[z][1] + i[1], v[z][0], v[z][1]]);
  };
  for (let k = 1; k < v.length; k++) segment(k - 1, k);
  if (b.closed && v.length > 1) {
    segment(v.length - 1, 0);
    path.push(["Z"]);
  }
  return path;
}

// A colour of the file: components 0 to 1, or 0 to 255 in some files.
function color(v) {
  const [r = 0, g = 0, b = 0] = v;
  return r > 1 || g > 1 || b > 1 ? [r / 255, g / 255, b / 255] : [r, g, b];
}

function brush(paint, t, m, alpha) {
  if (alpha <= 0) return null;
  if (paint.color) {
    const v = paint.color.at(t);
    const [r, g, b] = color(v);
    return { color: [r, g, b, Math.min(v[3] ?? 1, 1) * alpha] };
  }
  return { gradient: gradientOf(paint.gradient, t, m, alpha) };
}

function gradientOf(g, t, m, alpha) {
  const values = g.colors.at(t);
  const count = Math.min(g.count, Math.floor(values.length / 4));
  const opacities = [];
  for (let i = count * 4; i + 1 < values.length; i += 2) opacities.push([values[i], values[i + 1]]);
  const opacityAt = (offset) => {
    if (!opacities.length) return 1;
    if (opacities.length === 1) return opacities[0][1];
    const i = opacities.findIndex((s) => s[0] > offset);
    if (i === 0) return opacities[0][1];
    if (i < 0) return opacities.at(-1)[1];
    const [a, b] = [opacities[i - 1], opacities[i]];
    const u = b[0] > a[0] ? (offset - a[0]) / (b[0] - a[0]) : 0;
    return a[1] + (b[1] - a[1]) * u;
  };
  const stops = [];
  for (let i = 0; i < count; i++) {
    const [offset, r, gr, b] = values.slice(i * 4, i * 4 + 4);
    stops.push({ offset: Math.min(Math.max(offset, 0), 1), color: [r, gr, b, opacityAt(offset) * alpha] });
  }
  const start = g.start.point(t);
  const end = g.end.point(t);
  if (!g.radial) return { linear: [...apply(m, ...start), ...apply(m, ...end)], stops };
  const radius = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const towards = Math.min(Math.max(g.highlight.num(t, 0, 0) / 100, -0.99), 0.99) * radius;
  const angle = radians(g.angle.num(t, 0, 0)) + Math.atan2(end[1] - start[1], end[0] - start[0]);
  const focal = [start[0] + Math.cos(angle) * towards, start[1] + Math.sin(angle) * towards];
  return { radial: [...apply(m, ...start), radius * meanScale(m), ...apply(m, ...focal)], stops };
}

const CAPS = { 1: "butt", 3: "square" };
const JOINS = { 1: "miter", 3: "bevel" };

function strokeOf(style, t, m) {
  const s = meanScale(m);
  const width = style.width.num(t, 0, 0) * s;
  if (!(width > 0)) return null;
  let offset = 0;
  const pattern = [];
  for (const [kind, v] of style.dashes) {
    const length = v.num(t, 0, 0) * s;
    if (kind === "offset") offset = length;
    else pattern.push(Math.max(length, 0));
  }
  if (pattern.length % 2) pattern.push(...pattern);
  const dashed = pattern.reduce((a, b) => a + b, 0) > 0;
  return { width, cap: CAPS[style.cap] ?? "round", join: JOINS[style.join] ?? "round", miter: style.miter, dashes: dashed ? pattern : null, offset };
}

// What trims measure: each segment, as so many straight pieces.
const PIECES = 16;

// The segments of a path: [kind, start, ...points], closing lines included.
function segments(path) {
  const out = [];
  let at = null;
  let begin = null;
  for (const c of path) {
    if (c[0] === "M") at = begin = [c[1], c[2]];
    else if (c[0] === "L") {
      out.push(["L", at, [c[1], c[2]]]);
      at = [c[1], c[2]];
    } else if (c[0] === "C") {
      out.push(["C", at, [c[1], c[2]], [c[3], c[4]], [c[5], c[6]]]);
      at = [c[5], c[6]];
    } else if (c[0] === "Z" && at && begin) {
      if (at[0] !== begin[0] || at[1] !== begin[1]) out.push(["L", at, begin]);
      at = begin;
    }
  }
  return out;
}

function pointOn(seg, s) {
  if (seg[0] === "L") return [seg[1][0] + (seg[2][0] - seg[1][0]) * s, seg[1][1] + (seg[2][1] - seg[1][1]) * s];
  const [, p0, p1, p2, p3] = seg;
  const r = 1 - s;
  const a = r * r * r;
  const b = 3 * r * r * s;
  const c = 3 * r * s * s;
  const d = s * s * s;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}

// A segment's lengths so far, at each of its pieces.
function measure(seg) {
  if (seg[0] === "L") {
    const length = Math.hypot(seg[2][0] - seg[1][0], seg[2][1] - seg[1][1]);
    return { length, at: (d) => (length > 0 ? d / length : 0) };
  }
  const lengths = [0];
  let last = seg[1];
  for (let k = 1; k <= PIECES; k++) {
    const p = pointOn(seg, k / PIECES);
    lengths.push(lengths[k - 1] + Math.hypot(p[0] - last[0], p[1] - last[1]));
    last = p;
  }
  const length = lengths[PIECES];
  const at = (d) => {
    let k = 1;
    while (k < PIECES && lengths[k] < d) k++;
    const span = lengths[k] - lengths[k - 1];
    return (k - 1 + (span > 0 ? (d - lengths[k - 1]) / span : 0)) / PIECES;
  };
  return { length, at };
}

// The part of a segment from parameter s0 to s1.
function piece(seg, s0, s1) {
  if (seg[0] === "L") return ["L", pointOn(seg, s0), pointOn(seg, s1)];
  const lerp = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  // de Casteljau: split at s1, then the first half at s0 / s1.
  const split = ([, p0, p1, p2, p3], u) => {
    const a = lerp(p0, p1, u);
    const b = lerp(p1, p2, u);
    const c = lerp(p2, p3, u);
    const d = lerp(a, b, u);
    const e = lerp(b, c, u);
    const f = lerp(d, e, u);
    return [["C", p0, a, d, f], ["C", f, e, c, p3]];
  };
  const head = s1 < 1 ? split(seg, s1)[0] : seg;
  return s0 > 0 && s1 > 0 ? split(head, s0 / s1)[1] : head;
}

function length(path) {
  return segments(path).reduce((sum, seg) => sum + measure(seg).length, 0);
}

// The part of `path` from length `from` to length `to`.
function subPath(path, from, to) {
  const out = [];
  let at = 0;
  let last = null;
  for (const seg of segments(path)) {
    const { length: len, at: param } = measure(seg);
    const a = Math.max(from, at);
    const b = Math.min(to, at + len);
    if (b > a && len > 0) {
      const part = piece(seg, param(a - at), param(b - at));
      const p0 = part[1];
      if (!last || Math.hypot(last[0] - p0[0], last[1] - p0[1]) > 1e-6) out.push(["M", p0[0], p0[1]]);
      if (part[0] === "L") out.push(["L", part[2][0], part[2][1]]);
      else out.push(["C", part[2][0], part[2][1], part[3][0], part[3][1], part[4][0], part[4][1]]);
      last = part.at(-1);
    }
    at += len;
    if (at >= to) break;
  }
  return out;
}

// `paths` cut down to the stretch from `start` to `end` (fractions of their
// length) moved on by `offset`: each on its own, or all as one long path
// when `sequential`.
function trim(paths, start, end, offset, sequential) {
  if (start > end) [start, end] = [end, start];
  if (end - start >= 1) return paths;
  if (end - start <= 0) return [];
  const shift = Math.floor(start + offset);
  const s = start + offset - shift;
  const e = end + offset - shift;
  // Past the end the stretch goes on from the start.
  const ranges = e <= 1 ? [[s, e]] : [[s, 1], [0, e - 1]];
  let cut;
  if (sequential) {
    const lengths = paths.map(length);
    const total = lengths.reduce((a, b) => a + b, 0);
    let at = 0;
    cut = paths.map((path, i) => {
      const parts = ranges.flatMap(([a, b]) => {
        const from = Math.max(a * total - at, 0);
        const to = Math.min(b * total - at, lengths[i]);
        return to > from ? subPath(path, from, to) : [];
      });
      at += lengths[i];
      return parts;
    });
  } else {
    cut = paths.map((path) => {
      const len = length(path);
      return ranges.flatMap(([a, b]) => subPath(path, a * len, b * len));
    });
  }
  return cut.filter((p) => p.length);
}

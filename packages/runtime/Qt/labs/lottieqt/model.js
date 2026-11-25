// A Lottie (Bodymovin) file read into what drawing it needs, and the values
// in it that change over time.
//
// The JSON is walked by hand: the format writes the same property as a
// number, an array, a keyframe list or an object, depending on the exporter
// and its age, and a part that is unknown or broken drops that part, not the
// whole file. Only text that is not JSON, or JSON that is not an animation,
// is an error.

export class LoadError extends Error {
  constructor(message, json = false) {
    super(message);
    this.json = json;
  }
}

// `y` at `x` on the easing curve from (0, 0) to (1, 1) through (x1, y1) and
// (x2, y2), solved as CSS solves `cubic-bezier`.
export function bezierEase(x1, y1, x2, y2, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  x1 = Math.min(Math.max(x1, 0), 1);
  x2 = Math.min(Math.max(x2, 0), 1);
  const cubic = (a, b, s) => {
    const r = 1 - s;
    return 3 * r * r * s * a + 3 * r * s * s * b + s * s * s;
  };
  // x(s) rises from 0 to 1 when both control xs are in the unit range, so
  // bisection always finds the one s; Newton's steps first are fast in the
  // common case.
  let s = x;
  for (let step = 0; step < 8; step++) {
    const err = cubic(x1, x2, s) - x;
    if (Math.abs(err) < 1e-7) return cubic(y1, y2, s);
    const r = 1 - s;
    const slope = 3 * r * r * x1 + 6 * r * s * (x2 - x1) + 3 * s * s * (1 - x2);
    if (Math.abs(slope) < 1e-6) break;
    s = Math.min(Math.max(s - err / slope, 0), 1);
  }
  let lo = 0;
  let hi = 1;
  s = x;
  for (let step = 0; step < 60; step++) {
    const v = cubic(x1, x2, s);
    if (Math.abs(v - x) < 1e-9) break;
    if (v < x) lo = s;
    else hi = s;
    s = (lo + hi) / 2;
  }
  return cubic(y1, y2, s);
}

// One easing tangent's point for component `c`; none for linear.
function easeAt(ease, c) {
  const x = ease?.x?.[c] ?? ease?.x?.[0];
  const y = ease?.y?.[c] ?? ease?.y?.[0];
  return x === undefined || y === undefined ? null : [x, y];
}

// The in tangent of a segment: on the key it starts from, as the format
// has it (`i` beside `o`); on the next key where the first has none.
const nextIn = (key, next, c) => easeAt(key.inEase, c) ?? easeAt(next.inEase, c);

function blendNumbers(a, b, progress) {
  return a.map((value, c) => value + ((b[c] ?? value) - value) * progress(c));
}

function blendBez(a, b, progress) {
  const u = progress(0);
  const mix = (from, to) => from.map((p, i) => {
    const q = to[i] ?? p;
    return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
  });
  return { closed: a.closed, vertices: mix(a.vertices, b.vertices), inTangents: mix(a.inTangents, b.inTangents), outTangents: mix(a.outTangents, b.outTangents) };
}

// A value that may change over time: `{ value }`, or `{ keys }` with at
// least one key.
export class Anim {
  constructor(value, keys = null, blend = blendNumbers) {
    this.value = value;
    this.keys = keys;
    this.blend = blend;
  }

  get still() {
    return !this.keys || this.keys.length < 2;
  }

  // The last key at or before `t`.
  segment(t) {
    const keys = this.keys;
    let lo = 0;
    let hi = keys.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (keys[mid].t <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo - 1;
  }

  at(t) {
    const keys = this.keys;
    if (!keys) return this.value;
    const first = keys[0];
    if (keys.length === 1 || t <= first.t) return first.start;
    const i = Math.max(0, this.segment(t));
    const key = keys[i];
    const next = keys[i + 1];
    // Past the last key: what the one before it ended on, when the last key
    // carries no value of its own.
    if (!next) return key.start;
    const to = key.end ?? next.start;
    if (key.hold || next.t <= key.t) return key.start;
    const u = (t - key.t) / (next.t - key.t);
    const progress = (c) => {
      const out = easeAt(key.outEase, c);
      const into = nextIn(key, next, c);
      return out && into ? bezierEase(out[0], out[1], into[0], into[1], u) : u;
    };
    return this.blend(key.start, to, progress);
  }

  // Component `c` at `t`, or `or` when the value has none.
  num(t, c = 0, or = 0) {
    return this.at(t)?.[c] ?? or;
  }

  // A point at `t`, along a curved motion path where the keys give one.
  point(t) {
    const curved = this.keys ? this.alongPath(t) : null;
    if (curved) return curved;
    const v = this.at(t);
    return [v?.[0] ?? 0, v?.[1] ?? 0];
  }

  alongPath(t) {
    const i = this.segment(t);
    if (i < 0) return null;
    const key = this.keys[i];
    const next = this.keys[i + 1];
    if (!next || !key.spatial) return null;
    const [to, ti] = key.spatial;
    if (key.hold || next.t <= key.t || (!to[0] && !to[1] && !ti[0] && !ti[1])) return null;
    const end = key.end ?? next.start;
    if (key.start.length < 2 || end.length < 2) return null;
    const a = [key.start[0], key.start[1]];
    const b = [end[0], end[1]];
    const curve = [a, [a[0] + to[0], a[1] + to[1]], [b[0] + ti[0], b[1] + ti[1]], b];
    const u = (t - key.t) / (next.t - key.t);
    const out = easeAt(key.outEase, 0);
    const into = nextIn(key, next, 0);
    const eased = out && into ? bezierEase(out[0], out[1], into[0], into[1], u) : u;
    return cubicAtLength(curve, Math.min(Math.max(eased, 0), 1));
  }
}

const SAMPLES = 24;

function cubicPoint([p0, p1, p2, p3], s) {
  const r = 1 - s;
  const a = r * r * r;
  const b = 3 * r * r * s;
  const c = 3 * r * s * s;
  const d = s * s * s;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}

// The point a `fraction` of the way along a cubic's length.
function cubicAtLength(curve, fraction) {
  const lengths = [0];
  let last = curve[0];
  for (let k = 1; k <= SAMPLES; k++) {
    const p = cubicPoint(curve, k / SAMPLES);
    lengths.push(lengths[k - 1] + Math.hypot(p[0] - last[0], p[1] - last[1]));
    last = p;
  }
  const want = fraction * lengths[SAMPLES];
  let k = 1;
  while (k < SAMPLES && lengths[k] < want) k++;
  const span = lengths[k] - lengths[k - 1];
  const s = (k - 1 + (span > 0 ? (want - lengths[k - 1]) / span : 0)) / SAMPLES;
  return cubicPoint(curve, s);
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const number = (v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const f = (o, k, or) => number(o?.[k]) ?? or;
const truthy = (v) => (typeof v === "boolean" ? v : typeof v === "number" && v !== 0);

function numbers(v) {
  if (typeof v === "number") return [v];
  if (Array.isArray(v) && v.every((n) => typeof n === "number")) return v;
  return undefined;
}

function ease(v) {
  if (!isObject(v)) return null;
  return { x: numbers(v.x) ?? [], y: numbers(v.y) ?? [] };
}

function pair(v) {
  const n = v === undefined ? undefined : numbers(v);
  return n && n.length >= 2 ? [n[0], n[1]] : null;
}

function keyframes(o) {
  const k = o.k;
  if (!Array.isArray(k) || !k.length) return null;
  const keyed = "a" in o ? truthy(o.a) : isObject(k[0]) && "t" in k[0];
  return keyed ? k : null;
}

function anim(v, value, or, blend) {
  if (!isObject(v)) return new Anim(value(v) ?? or, null, blend);
  const list = keyframes(v);
  if (!list) return new Anim(value(v.k) ?? or, null, blend);
  const keys = [];
  for (const k of list) {
    if (!isObject(k)) continue;
    const start = value(k.s) ?? (keys.length ? (keys.at(-1).end ?? keys.at(-1).start) : undefined);
    if (start === undefined) continue;
    const to = pair(k.to);
    const ti = pair(k.ti);
    keys.push({
      t: number(k.t) ?? 0,
      start,
      end: value(k.e),
      hold: truthy(k.h),
      outEase: ease(k.o),
      inEase: ease(k.i),
      spatial: to && ti ? [to, ti] : null,
    });
  }
  return keys.length ? new Anim(null, keys, blend) : new Anim(or, null, blend);
}

export const prop = (v, or = []) => anim(v, (x) => (x === undefined ? undefined : numbers(x)), or, blendNumbers);
const get = (o, k, or) => (o && k in o ? prop(o[k], or) : new Anim(or));

function bez(v) {
  if (Array.isArray(v)) v = v[0];
  if (!isObject(v)) return undefined;
  const points = (k) => (Array.isArray(v[k]) ? v[k].map((p) => pair(p) ?? [0, 0]) : []);
  return { closed: truthy(v.c), vertices: points("v"), inTangents: points("i"), outTangents: points("o") };
}

const NO_PATH = Object.freeze({ closed: false, vertices: [], inTangents: [], outTangents: [] });

function transform(o) {
  const p = o?.p;
  const position = isObject(p) && truthy(p.s) ? { x: get(p, "x", []), y: get(p, "y", []) } : { joined: get(o, "p", [0, 0]) };
  return {
    anchor: get(o, "a", [0, 0]),
    position,
    scale: get(o, "s", [100, 100]),
    rotation: o && ("r" in o || "rz" in o) ? prop(o.r ?? o.rz, [0]) : new Anim([0]),
    opacity: get(o, "o", [100]),
    skew: get(o, "sk", [0]),
    skewAxis: get(o, "sa", [0]),
  };
}

function hexColor(s) {
  if (typeof s !== "string" || !s.startsWith("#") || s.length < 7) return null;
  const v = Number.parseInt(s.slice(1, 7), 16);
  if (Number.isNaN(v)) return null;
  return [((v >> 16) & 0xff) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255, 1];
}

function gradient(o) {
  const g = isObject(o.g) ? o.g : null;
  return {
    radial: o.t === 2,
    start: get(o, "s", []),
    end: get(o, "e", []),
    highlight: get(o, "h", []),
    angle: get(o, "a", []),
    count: Math.max(0, Math.trunc(number(g?.p) ?? 0)),
    colors: g && "k" in g ? prop(g.k) : new Anim([]),
  };
}

const int = (o, k, or) => {
  const v = o[k];
  return Number.isInteger(v) && v >= 0 && v < 256 ? v : or;
};

const DASHES = { d: "dash", g: "gap", o: "offset" };

function shape(o, warnings) {
  const opacity = () => get(o, "o", [100]);
  switch (o.ty) {
    case "gr":
      return { kind: "group", items: shapes(o.it, warnings) };
    case "rc":
      return { kind: "rect", position: get(o, "p", []), size: get(o, "s", []), roundness: get(o, "r", []) };
    case "el":
      return { kind: "ellipse", position: get(o, "p", []), size: get(o, "s", []) };
    case "sh":
      return { kind: "path", path: "ks" in o ? anim(o.ks, bez, NO_PATH, blendBez) : new Anim(NO_PATH, null, blendBez) };
    case "sr":
      return { kind: "star", star: int(o, "sy", 1) === 1, points: get(o, "pt", []), position: get(o, "p", []), rotation: get(o, "r", []), outer: get(o, "or", []), inner: get(o, "ir", []) };
    case "fl":
      return { kind: "fill", paint: { color: get(o, "c", []) }, opacity: opacity(), evenOdd: int(o, "r", 1) === 2 };
    case "gf":
      return { kind: "fill", paint: { gradient: gradient(o) }, opacity: opacity(), evenOdd: int(o, "r", 1) === 2 };
    case "st":
    case "gs":
      return {
        kind: "stroke",
        paint: o.ty === "gs" ? { gradient: gradient(o) } : { color: get(o, "c", []) },
        opacity: opacity(),
        style: {
          width: get(o, "w", []),
          cap: int(o, "lc", 2),
          join: int(o, "lj", 2),
          miter: f(o, "ml", 4),
          dashes: (Array.isArray(o.d) ? o.d : []).flatMap((d) => (isObject(d) && DASHES[d.n] && "v" in d ? [[DASHES[d.n], prop(d.v)]] : [])),
        },
      };
    case "tr":
      return { kind: "transform", transform: transform(o) };
    case "tm":
      return { kind: "trim", start: get(o, "s", []), end: get(o, "e", [100]), offset: get(o, "o", []), sequential: int(o, "m", 1) === 2 };
    default:
      // A type that is not a string is said as none: what JSON gives
      // (`{"toString": 1}`) may not be made into one.
      warnings.push(`shapes of type ${JSON.stringify(typeof o.ty === "string" ? o.ty : "")} are not drawn`);
      return { kind: "other" };
  }
}

function shapes(list, warnings) {
  return (Array.isArray(list) ? list : []).filter((s) => isObject(s) && !truthy(s.hd)).map((s) => shape(s, warnings));
}

function layer(o, warnings) {
  let kind;
  switch (o.ty) {
    case 4:
      kind = { shapes: shapes(o.shapes, warnings) };
      break;
    case 0:
      kind = { precomp: typeof o.refId === "string" ? o.refId : "", remap: "tm" in o ? prop(o.tm) : null };
      break;
    case 1:
      kind = { solid: hexColor(o.sc) ?? [0, 0, 0, 1], width: f(o, "sw", 0), height: f(o, "sh", 0) };
      break;
    case 2:
      warnings.push("image layers are not drawn");
      kind = {};
      break;
    case 5:
      warnings.push("text layers are not drawn");
      kind = {};
      break;
    default:
      kind = {};
  }
  if (Array.isArray(o.masksProperties) && o.masksProperties.length) warnings.push("masks are not applied");
  if ("tt" in o) warnings.push("track mattes are not applied");
  return {
    ...kind,
    index: Number.isInteger(o.ind) ? o.ind : null,
    parent: Number.isInteger(o.parent) ? o.parent : null,
    inPoint: f(o, "ip", 0),
    outPoint: f(o, "op", Infinity),
    startTime: f(o, "st", 0),
    stretch: Math.max(f(o, "sr", 1), 1e-6),
    transform: transform(isObject(o.ks) ? o.ks : null),
    hidden: truthy(o.hd) || truthy(o.td),
  };
}

const layersOf = (list, warnings) => list.filter(isObject).map((l) => layer(l, warnings));

// The composition in `text`, or a LoadError.
export function parse(text) {
  let root;
  try {
    root = JSON.parse(text);
  } catch (error) {
    throw new LoadError(`JSON parse error: "${error.message}"`, true);
  }
  if (!isObject(root)) throw new LoadError("not a Lottie animation: no object");
  const num = (k) => {
    const v = number(root[k]);
    if (v === undefined) throw new LoadError(`not a Lottie animation: no ${k}`);
    return v;
  };
  const width = num("w");
  const height = num("h");
  const frameRate = num("fr");
  const inPoint = num("ip");
  const outPoint = num("op");
  if (!Array.isArray(root.layers)) throw new LoadError("not a Lottie animation: no layers");
  const warnings = [];
  const layers = layersOf(root.layers, warnings);
  const assets = new Map();
  for (const asset of Array.isArray(root.assets) ? root.assets : []) {
    if (!isObject(asset)) continue;
    if (typeof asset.id === "string" && Array.isArray(asset.layers)) assets.set(asset.id, layersOf(asset.layers, warnings));
    else if ("p" in asset) warnings.push("image assets are not drawn");
  }
  const markers = (Array.isArray(root.markers) ? root.markers : []).flatMap((m) =>
    isObject(m) && typeof m.cm === "string" && number(m.tm) !== undefined ? [{ name: m.cm, frame: m.tm }] : [],
  );
  return { width, height, frameRate, inPoint, outPoint, layers, assets, markers, warnings };
}

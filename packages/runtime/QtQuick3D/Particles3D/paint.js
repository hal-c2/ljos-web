// What a View3D draws of a particle system besides its models: the sprites,
// each a square of `particleScale` times the particle's size with the
// picture on it, and the lines, each a ribbon along the way a particle
// came. They are drawn among what is seen through in the view, a system
// as far away as it is itself, with a program of their own: behind what is
// nearer, and in front of nothing as far as what is drawn later can tell.
//
// As Qt draws a sprite: where the particle is in the system is where the
// middle of the square is, and the square itself is turned as the particle
// is and no other way, in the scene (`billboard` not set: it lies in the
// scene's own plane whichever way the system is turned and however big it
// is) or before the eye (`billboard`). Its colour is taken as it is for
// light and goes through the view's tone mapping.
//
// And a line: it is kept from one time the system is brought to to the
// next, a point of it put down where the particle is each time it has come
// far enough from the last, so what a line is depends on the times the
// system went through, as it does in Qt. Its sums are Qt's. Unlike Qt, a
// line is only kept while a view draws it: one that nothing looked at
// begins where it is first seen.
import * as math from "../math.js";
import { LENGTH, random, FRAME } from "./core.js";

const VERTEX = `#version 300 es
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec3 a_place;
layout(location = 2) in vec4 a_turn;
layout(location = 3) in vec4 a_color;
layout(location = 4) in vec4 a_look;
uniform mat4 u_world;
uniform mat4 u_view;
uniform mat4 u_projection;
uniform int u_mode;
out vec2 v_at;
out vec4 v_color;
out vec4 v_look;
flat out float v_row;
uniform float u_facing;

vec3 turned(vec4 q, vec3 v) {
  return v + 2.0 * cross(q.yzw, cross(q.yzw, v) + q.x * v);
}

void main() {
  v_color = a_color;
  v_look = a_look;
  if (u_mode == 2) {
    // A point of a line, to one side of it by half its width: across the
    // line in the system, or across what the eye sees of that.
    v_at = a_corner;
    v_row = fract(sin(a_look.x * 12.9898) * 43758.5453);
    vec4 seen = u_view * u_world * vec4(a_place + (1.0 - u_facing) * a_turn.xyz * a_turn.w, 1.0);
    vec3 across = (transpose(inverse(u_view * u_world)) * vec4(a_turn.xyz, 0.0)).xyz;
    across.z = 0.0;
    // Qt's own sum, which makes nothing of a point that has no way across
    // it, whichever way it is to face: nor is anything drawn that has such a
    // point for a corner, as a line's first is until it has a second.
    seen.xyz += normalize(across) * a_turn.w * u_facing;
    gl_Position = u_projection * seen;
    return;
  }
  v_at = a_corner + 0.5;
  // Which row of the colour table is its: Qt's own sum, of how many are
  // drawn before it.
  v_row = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453);
  vec3 across = vec3(a_corner * a_look.x, 0.0);
  vec4 place = u_world * vec4(a_place, 1.0);
  if (u_mode == 0) place.xyz += turned(a_turn, across);
  place = u_view * place;
  // Before the eye it is turned the other way round, as Qt has it.
  if (u_mode == 1) place.xyz += turned(vec4(a_turn.x, -a_turn.yzw), across);
  gl_Position = u_projection * place;
}`;

// The sums of tone mapping are those of the program models are drawn with.
const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_picture;
uniform sampler2D u_table;
uniform bool u_pictured;
uniform bool u_tabled;
uniform bool u_straight;
uniform float u_frames;
uniform float u_blend;
uniform float u_opacity;
uniform int u_tonemap;
in vec2 v_at;
in vec4 v_color;
in vec4 v_look;
flat in float v_row;
out vec4 color;

vec3 toLinear(vec3 c) {
  return c * (c * (c * 0.305306011 + 0.682171111) + 0.012522878);
}

vec3 toScreen(vec3 c) {
  vec3 s1 = sqrt(c);
  vec3 s2 = sqrt(s1);
  vec3 s3 = sqrt(s2);
  return 0.585122381 * s1 + 0.783140355 * s2 - 0.368262736 * s3;
}

vec3 filmic(vec3 c) {
  return ((c * (0.15 * c + 0.05) + 0.004) / (c * (0.15 * c + 0.5) + 0.06)) - 0.02 / 0.3;
}

vec3 tonemap(vec3 c) {
  if (u_tonemap == 1) return toScreen(c);
  if (u_tonemap == 2) return toScreen(clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0));
  if (u_tonemap == 3) {
    c = max(vec3(0.0), c - 0.004);
    return (c * (6.2 * c + 0.5)) / (c * (6.2 * c + 1.7) + 0.06);
  }
  if (u_tonemap == 4) return toScreen(filmic(c * 2.0) / filmic(vec3(11.2)));
  return c;
}

vec4 pictured(float frame) {
  vec4 texel = texture(u_picture, vec2(clamp(frame / u_frames, 0.0, 1.0) + v_at.x / u_frames, v_at.y));
  return vec4(toLinear(texel.rgb), texel.a);
}

void main() {
  vec4 tint = v_color;
  if (u_tabled) {
    // The nearest of the table, and none from over its edge.
    ivec2 size = textureSize(u_table, 0);
    vec4 texel = texelFetch(u_table, min(ivec2(vec2(fract(v_look.y), v_row) * vec2(size)), size - 1), 0);
    tint *= vec4(toLinear(texel.rgb), texel.a);
  }
  if (u_pictured) {
    // How far through the frames it is, as Qt works it out: through one
    // fewer when one frame goes over into the next, so that the last is
    // reached and nothing after it.
    float frame = (u_frames - u_blend) * v_look.w;
    float between = fract(frame);
    tint *= mix(pictured(frame - between), pictured(frame - between + 1.0), between * u_blend);
  }
  float alpha = tint.a * u_opacity;
  color = vec4(tonemap(tint.rgb) * (u_straight ? 1.0 : alpha), alpha);
}`;

const UNIFORMS = ["u_world", "u_view", "u_projection", "u_mode", "u_facing", "u_picture", "u_table", "u_pictured", "u_tabled", "u_straight", "u_frames", "u_blend", "u_opacity", "u_tonemap"];

// What one particle is in the row of numbers a sprite is drawn from: where
// it is, its turn, its colour, and its size with how far through its life
// it is, a place for the row of the colour table that is its own and how
// far through the frames of its picture it is.
export const EACH = 15;
// And one corner of a ribbon: where in the picture, where the point of the
// line is, the way across it with how far that way the corner is, the
// colour, and which point it is with how far through its life and through
// the frames of its picture the particle is.
const CORNER = 17;

// The program and what it draws from, once for each context there is.
const made = new WeakMap();
function tools(gl) {
  let own = made.get(gl);
  if (own !== undefined) return own;
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, VERTEX],
    [gl.FRAGMENT_SHADER, FRAGMENT],
  ]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) console.warn(`ParticleSystem3D: ${gl.getShaderInfoLog(shader)}`);
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn(`ParticleSystem3D: ${gl.getProgramInfoLog(program)}`);
    made.set(gl, null);
    return null;
  }
  const at = {};
  for (const name of UNIFORMS) at[name] = gl.getUniformLocation(program, name);
  const FLOAT = 4;

  // A square, drawn once for each particle from a row of its own.
  const squares = gl.createVertexArray();
  gl.bindVertexArray(squares);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const rows = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, rows);
  [
    [1, 3, 0],
    [2, 4, 3],
    [3, 4, 7],
    [4, 4, 11],
  ].forEach(([location, count, offset]) => {
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, count, gl.FLOAT, false, EACH * FLOAT, offset * FLOAT);
    gl.vertexAttribDivisor(location, 1);
  });

  // Ribbons: two corners to a point of a line, each with all that is its
  // own, one strip of triangles through them all.
  const ribbons = gl.createVertexArray();
  gl.bindVertexArray(ribbons);
  const corners = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, corners);
  [
    [0, 2, 0],
    [1, 3, 2],
    [2, 4, 5],
    [3, 4, 9],
    [4, 4, 13],
  ].forEach(([location, count, offset]) => {
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, count, gl.FLOAT, false, CORNER * FLOAT, offset * FLOAT);
  });
  gl.bindVertexArray(null);

  // What is sampled where there is no picture: a white one.
  const blank = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, blank);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

  made.set(gl, (own = { program, at, squares, rows, ribbons, corners, blank }));
  return own;
}

const SourceOver = 0;
const Screen = 1;
const Multiply = 2;
const SortNewest = 1;
const SortOldest = 2;
const SortDistance = 3;
const Reverse = 1;
const Alternate = 2;
const AlternateReverse = 3;
const SingleFrame = 4;
const Absolute = 0;
const Fill = 2;

const single = Math.fround;

// How far through the frames of a sequence a particle is when it has been
// for `seconds`: from nought, the beginning of the first, up to one, the
// end of the last. The sums are Qt's, in numbers of 32 bits as its are.
function frame(sequence, seed, datum, seconds) {
  const count = Math.max(1, Math.floor(sequence.frameCount));
  const direction = sequence.animationDirection;
  let first = 0;
  if (sequence.randomStart) first = single(random(seed, datum.index, FRAME));
  else if (count > 1 && sequence.frameIndex > 0) {
    const index = Math.min(Math.floor(sequence.frameIndex), count - 1);
    first = direction === SingleFrame ? single(index / single(count - 1 + 0.0001)) : single(index / count);
  }
  // All of them once in the sequence's time, or in the particle's life.
  let whole = single(datum.life / 1000);
  if (sequence.duration > 0) {
    const varied = single(sequence.durationVariation / 1000);
    whole = Math.max(single(0.001), single(single(sequence.duration / 1000) + single(varied - single(2 * random(seed, datum.index, FRAME + 1) * varied))));
  }
  const gone = single(single(seconds) / whole);
  const nearly = single(0.9999);
  let through = first;
  if (direction === Reverse) through = single(single(first + nearly - (gone % 1)) % 1);
  else if (direction === Alternate) through = Math.abs(single(single(1 + single(first + gone)) % 2) - 1);
  else if (direction === AlternateReverse) through = Math.abs(single(Math.abs(single(1 + single((single(first + nearly) % 1) - gone))) % 2) - 1);
  else if (direction !== SingleFrame) through = single(single(first + gone) % 1);
  return Math.min(nearly, Math.max(0, through));
}

// The order the particles of a kind are drawn in, the last on top. As Qt
// has it: unsorted they are in the order of their places in the table; the
// newest first is from the place that was written last back through the
// table; and the oldest first is from that same place on through it, which
// has the newest of all first and the oldest after it.
function ordered(kind, alive) {
  const { sortMode } = kind;
  if (sortMode !== SortNewest && sortMode !== SortOldest) return alive;
  const most = Math.max(1, Math.floor(kind.maxAmount));
  const from = kind.$last;
  const after = sortMode === SortNewest ? (one) => (from - one.place + most) % most : (one) => (one.place - from + most) % most;
  return [...alive].sort((a, b) => after(a) - after(b));
}

// The turn of a sprite from its three angles: about z first, then y, then
// x, which is the order Qt draws a sprite with and not the one it turns a
// node or a model by. A sprite that is turned towards something has the
// angles of that turn in a node's order, and is drawn by them in this one,
// as in Qt.
function about([pitch, yaw, roll]) {
  const half = Math.PI / 360;
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(pitch * half), Math.sin(pitch * half), Math.cos(yaw * half), Math.sin(yaw * half), Math.cos(roll * half), Math.sin(roll * half)];
  const [w, x, y, z] = [cx * cy, sx * cy, cx * sy, sx * sy];
  return [w * cz - z * sz, x * cz + y * sz, y * cz - x * sz, w * sz + z * cz];
}

// The sprites there are of a kind, as the numbers they are drawn from.
function sprites(kind, system) {
  const picture = kind.sprite;
  const map = picture?.$texture?.() ?? null;
  // A picture that is not here yet is waited for.
  if (picture && !map) return null;
  const table = kind.colorTable?.$texture?.() ?? null;
  const alive = kind.$alive();
  if (!alive.length) return null;
  const sequence = map ? kind.spriteSequence : null;
  const seed = system.$seed();
  const size = Number(kind.particleScale) || 0;
  const aside = [Number(kind.offsetX) || 0, Number(kind.offsetY) || 0];
  const order = ordered(kind, alive);
  const rows = new Float32Array(order.length * EACH);
  order.forEach((one, index) => {
    const { datum } = one;
    const at = index * EACH;
    // `offsetX` and `offsetY` move it in the system, by so many times its
    // own size.
    rows[at] = one.x + aside[0] * one.scale;
    rows[at + 1] = one.y + aside[1] * one.scale;
    rows[at + 2] = one.z;
    rows.set(about(one.aligned ? math.toEuler(one.turn) : [one.rx, one.ry, one.rz]), at + 3);
    rows[at + 7] = datum.r / 255;
    rows[at + 8] = datum.g / 255;
    rows[at + 9] = datum.b / 255;
    rows[at + 10] = one.a / 255;
    rows[at + 11] = one.scale * size;
    rows[at + 12] = datum.life > 0 ? Math.min(1, Math.max(0, (one.seconds * 1000) / datum.life)) : 0;
    rows[at + 14] = sequence ? frame(sequence, seed, datum, one.seconds) : 0;
  });
  return {
    rows,
    count: order.length,
    map,
    table,
    frames: sequence ? Math.max(1, Math.floor(sequence.frameCount)) : 1,
    blended: Boolean(sequence?.interpolate),
    blend: kind.blendMode,
    mode: kind.billboard ? 1 : 0,
    far: kind.sortMode === SortDistance,
  };
}

const unit = (value) => Math.min(1, Math.max(0, value));
const minus = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// A way of length one, or none where there is no way: `QVector3D::normalized`.
const along = (way) => {
  const long = Math.hypot(...way);
  return long > 1e-6 ? way.map((value) => value / long) : [0, 0, 0];
};

// The way a line faces from how its particle is turned: across that and
// the way the line goes is the way it is wide. Qt's own sum, which has one
// that is not turned face the other way from one that is turned by nothing
// to speak of.
function faced([pitch, yaw]) {
  const x = (pitch * Math.PI) / 180;
  const y = (yaw * Math.PI) / 180;
  if (Math.abs(x) <= 1e-5 && Math.abs(y) <= 1e-5) return [0, 0, -1];
  return [Math.sin(y), -Math.sin(x) * Math.cos(y), Math.cos(x) * Math.cos(y)];
}

// A point of a line that has not been put down, and a particle there is
// nothing of.
const point = () => ({ position: [0, 0, 0], size: 0, color: [0, 0, 0, 0], tangent: [0, 0, 0], binormal: [0, 0, 0], length: 0 });
const NONE = Object.freeze({ position: [0, 0, 0], rotation: [0, 0, 0], color: [0, 0, 0, 0], size: 0, age: 0, frame: -1 });

// Puts down where a particle is as a point of its line, if it has come far
// enough from the last: `lengthDeltaMin`, or as far as leaves the line its
// `length` over all its pieces. A line of one piece has its one point
// behind the particle instead, as far as that, on the way back to where
// the point was.
function put(trail, head, segments, apart) {
  let at = trail.current;
  const before = trail.count ? trail.points[at] : null;
  if (before && segments > 1) {
    const far = Math.hypot(...minus(before.position, head.position));
    if (far < (trail.limit >= 0 ? trail.limit / (segments - 1) : apart)) return;
  }
  if (trail.count < segments) trail.count++;
  if (before) at = (at + 1) % segments;
  trail.current = at;
  const here = trail.points[at];
  const normal = faced(head.rotation);
  here.color = head.color;
  here.size = head.size;
  if (before && segments === 1) {
    const way = minus(before.position, head.position);
    const far = Math.hypot(...way);
    const back = along(way);
    const behind = trail.limit >= 0 ? trail.limit : apart;
    here.position = head.position.map((value, axis) => value + behind * back[axis]);
    here.length += far;
    here.tangent = back;
    here.binormal = cross(normal, back);
  } else {
    here.position = [...head.position];
    here.length = 0;
  }
  if (before && before !== here) {
    const way = minus(before.position, head.position);
    const far = Math.hypot(...way);
    before.tangent = way.map((value) => value / far);
    here.length = far + before.length;
    here.binormal = cross(normal, before.tangent);
    before.binormal = trail.count === 1 ? here.binormal : along(before.binormal.map((value, axis) => value + here.binormal[axis]));
  }
}

// The points a line is drawn through: where its particle is, and the points
// that were put down from the last back to the first, one more than it has
// pieces. What is left of them when the line is shorter has no width. Each
// has how far along the line it is, for the picture: from where the system
// began (`Absolute`), from the particle back (`Relative`), or as a share of
// the whole (`Fill`).
function through(head, trail, alpha, segments, width, mode) {
  const { points, limit } = trail;
  let at = trail.current;
  const way = minus(points[at].position, head.position);
  const partial = Math.hypot(...way);
  const first = {
    position: head.position,
    size: head.size * width,
    color: [head.color[0], head.color[1], head.color[2], head.color[3] * alpha],
    binormal: cross(faced(head.rotation), along(way)),
    length: 0,
  };
  let from = points[at].length + partial;
  let scale = -1;
  if (mode === Absolute) {
    first.length = from;
    from = 0;
  }
  if (mode === Fill) {
    if (limit > 0) scale = -1 / limit;
    else {
      const oldest = (at + 1 + segments - trail.count) % segments;
      let whole = points[at].length - points[oldest].length;
      if (trail.count < segments) whole += partial;
      if (Math.abs(whole) > 1e-5) scale = -1 / whole;
    }
  }
  const found = [first];
  let good = first;
  let goodAt = 0;
  let last = first;
  let index = 0;
  let whole = 0;
  let before = points[at].length + partial;
  for (; index < trail.count && (limit < 0 || whole < limit); index++) {
    const one = points[at];
    if (one.size * width > 0) {
      last = {
        position: [...one.position],
        size: one.size * width,
        color: [one.color[0], one.color[1], one.color[2], one.color[3] * alpha],
        binormal: one.binormal,
        length: (from - one.length) * scale,
      };
      if (limit >= 0) {
        // No further than the line may be long: its last piece is cut short.
        let piece = before - one.length;
        before = one.length;
        if (whole + piece > limit) {
          const over = whole + piece - limit;
          last.position = last.position.map((value, axis) => value - one.tangent[axis] * over);
          last.length -= over * scale;
          piece -= over;
        }
        whole += piece;
      }
      good = last;
      goodAt = at;
    } else last = { ...good, size: 0 };
    found.push(last);
    at = at ? at - 1 : segments - 1;
  }
  for (; index < segments; index++) found.push((last = { ...good, size: 0, length: 0 }));
  // A line with all its pieces and no `length` ends as far short of its
  // first point as the particle is past its last, so that it is as long
  // from one moment to the next.
  if (good === last && limit < 0 && segments > 1) {
    good.position = good.position.map((value, axis) => value - points[goodAt].tangent[axis] * partial);
    if (mode !== Fill) good.length -= partial * scale;
  }
  return found;
}

// The lines there are of a kind at `now`, each as the points it is drawn
// through. Coming to a time that is not the one it was last at puts down
// what there is to put down for each particle; one whose life is over is
// still to be seen for `eolFadeOutDuration`, where it was, going.
function lines(kind, system, now) {
  const picture = kind.sprite;
  const map = picture?.$texture?.() ?? null;
  const table = kind.colorTable?.$texture?.() ?? null;
  const alive = kind.$alive();
  const seed = system.$seed();
  const width = Number(kind.particleScale) || 0;
  const segments = Math.max(1, Math.floor(kind.segmentCount));
  const apart = Math.max(0, Number(kind.lengthDeltaMin) || 0);
  const { length, lengthVariation, texcoordMode } = kind;
  const eol = Math.max(0, Math.floor(kind.eolFadeOutDuration));
  const sequence = map ? kind.spriteSequence : null;
  const frames = sequence ? Math.max(1, Math.floor(sequence.frameCount)) : 1;
  const aside = [Number(kind.offsetX) || 0, Number(kind.offsetY) || 0];
  const time = Math.fround(now / 1000);
  if (kind.$pieces !== segments) {
    kind.$trails = [];
    kind.$fading = [];
    kind.$pieces = segments;
    kind.$traced = undefined;
  }
  const trails = kind.$trails;
  if (kind.$traced !== now && system.$begun) {
    kind.$traced = now;
    const here = new Map();
    for (const one of alive) here.set(one.place, one);
    const data = kind.$data;
    for (let place = 0; place < data.length; place++) {
      const datum = data[place];
      if (!datum) continue;
      let trail = trails[place];
      // A particle that has taken the place of another begins a line.
      if (trail?.datum !== datum) {
        trail = trails[place] = {
          datum,
          head: trail?.head ?? NONE,
          count: 0,
          current: 0,
          limit: length > 0 ? Math.max(0, length + lengthVariation * (random(seed, datum.index, LENGTH) - 0.5)) : -1,
          shown: true,
          points: Array.from({ length: segments }, point),
        };
      }
      const one = here.get(place);
      if (!one) {
        if (time > datum.end && trail.head.age > 0 && eol > 0 && trail.count > 0) {
          kind.$fading.push({ head: trail.head, begin: time, end: time + eol * 0.001, count: trail.count, current: trail.current, limit: trail.limit, points: trail.points });
          // And is no line any more, as in Qt, should the time go back to
          // when the particle was.
          trail.points = Array.from({ length: segments }, point);
          trail.limit = -1;
          trail.shown = false;
        }
        trail.count = 0;
        trail.current = 0;
        if (trail.head.size > 0) trail.head = NONE;
        continue;
      }
      const head = {
        position: [one.x + aside[0] * one.scale, one.y + aside[1] * one.scale, one.z],
        rotation: one.aligned ? math.toEuler(one.turn) : [one.rx, one.ry, one.rz],
        color: [datum.r / 255, datum.g / 255, datum.b / 255, one.a / 255],
        size: one.scale,
        age: datum.life > 0 ? unit((one.seconds * 1000) / datum.life) : 0,
        frame: sequence ? frame(sequence, seed, datum, one.seconds) : 0,
      };
      const moved = head.size > 0 || trail.head.size > 0;
      trail.head = head;
      if (moved) put(trail, head, segments, apart);
    }
    kind.$fading = kind.$fading.filter((gone) => time >= gone.begin && time < gone.end);
  }
  // A picture that is not here yet is waited for.
  if (picture && !map) return null;
  const found = [];
  for (const trail of trails) if (trail?.count && trail.shown) found.push({ points: through(trail.head, trail, 1, segments, width, texcoordMode), head: trail.head });
  for (const gone of kind.$fading) found.push({ points: through(gone.head, gone, 1 - ((time - gone.begin) * 1000) / eol, segments, width, texcoordMode), head: gone.head });
  if (!found.length) return null;
  // How much of the picture there is to a length of line: as wide as the
  // line is to one picture, or the whole of it once; times the picture's
  // height to its width, as Qt has it, whichever.
  const element = map?.element;
  const high = element ? element.naturalHeight || element.videoHeight || element.height : 0;
  const broad = element ? element.naturalWidth || element.videoWidth || element.width : 0;
  const multiplier = Number(kind.texcoordMultiplier) || 0;
  return {
    lines: found,
    map,
    table,
    blend: kind.blendMode,
    fade: 1 - unit(Number(kind.alphaFade) || 0),
    grow: Math.min(2, Math.max(0, Number(kind.scaleMultiplier) || 0)),
    stretch: (texcoordMode === Fill ? frames : width !== 0 ? frames / width : 0) * multiplier * (high > 0 && broad > 0 ? high / broad : 1),
    frames,
    blended: Boolean(sequence?.interpolate),
    facing: kind.billboard ? 1 : 0,
  };
}

// The corners of the ribbons of a kind: two to each point of each line, one
// to each side, in one strip, with corners said twice between one line and
// the next so that nothing is drawn from the one to the other. Each point
// is as wide and as much to be seen as the one before it times
// `scaleMultiplier` and one less `alphaFade`.
function ribbons(kind) {
  const each = kind.lines[0].points.length;
  const corners = new Float32Array(kind.lines.length * (each + 1) * 2 * CORNER);
  let at = 0;
  let number = 0;
  const corner = (one, head, index, side, wide, alpha) => {
    corners[at] = one.length * kind.stretch;
    corners[at + 1] = side;
    corners.set(one.position, at + 2);
    corners.set(one.binormal, at + 5);
    corners[at + 8] = (side - 0.5) * wide;
    corners[at + 9] = one.color[0];
    corners[at + 10] = one.color[1];
    corners[at + 11] = one.color[2];
    corners[at + 12] = alpha;
    corners[at + 13] = number + index;
    corners[at + 14] = head.age;
    corners[at + 16] = head.frame;
    at += CORNER;
  };
  for (const { points, head } of kind.lines) {
    let grown = 1;
    let faded = 1;
    points.forEach((one, index) => {
      const wide = one.size * grown;
      const alpha = one.color[3] * faded;
      if (index === 0) corner(one, head, index, 0, wide, alpha);
      corner(one, head, index, 0, wide, alpha);
      corner(one, head, index, 1, wide, alpha);
      if (index === each - 1) corner(one, head, index, 1, wide, alpha);
      grown *= kind.grow;
      faded *= kind.fade;
    });
    number += each;
  }
  return corners;
}

// The way particles are sorted by how far they are: the way the eye looks,
// as it is in the system. Qt takes that way through the system's matrix as
// if it were a place, so a system that is not where the scene begins sorts
// its particles along a way that is not quite the eye's, and so is it here.
export function away(world, view) {
  const way = math.point(math.inverse(world), -view[2], -view[6], -view[10]);
  const long = Math.hypot(...way);
  return long > 0 ? way.map((value) => value / long) : [0, 0, 0];
}

// The rows of a kind's sprites with the farthest that way first.
export function farthest(kind, way) {
  const { rows, count } = kind;
  const far = new Float32Array(count);
  for (let index = 0; index < count; index++) {
    const at = index * EACH;
    far[index] = way[0] * rows[at] + way[1] * rows[at + 1] + way[2] * rows[at + 2];
  }
  const order = Array.from(far.keys()).sort((a, b) => far[b] - far[a]);
  const sorted = new Float32Array(rows.length);
  order.forEach((from, to) => sorted.set(rows.subarray(from * EACH, (from + 1) * EACH), to * EACH));
  return sorted;
}

// What is drawn of a kind now, for a renderer that does the drawing itself.
export function drawnOf(kind, system) {
  return kind.$line ? lines(kind, system, system.$upTo()) : sprites(kind, system);
}

// What a View3D calls to have a system's sprites and lines drawn, with
// what the renderer has: null when there is none of either. Found while
// the view looks at what it is to draw, so that the view draws again when
// any of it is otherwise; the drawing itself asks nothing.
export function painted(system, opacity) {
  const kinds = [];
  let now = null;
  for (const kind of system.$members().particles) {
    if (!kind.$sprite) continue;
    if (kind.$line) now ??= system.$upTo();
    const drawn = kind.$line ? lines(kind, system, now) : sprites(kind, system);
    if (drawn) kinds.push(drawn);
  }
  if (!kinds.length) return null;
  const world = system.$world();
  const paint = ({ gl, view, projection, tonemap, bound }) => {
    const own = tools(gl);
    if (!own) return;
    const { at } = own;
    gl.useProgram(own.program);
    gl.uniformMatrix4fv(at.u_world, false, world);
    gl.uniformMatrix4fv(at.u_view, false, view);
    gl.uniformMatrix4fv(at.u_projection, false, projection);
    gl.uniform1i(at.u_tonemap, tonemap);
    gl.uniform1f(at.u_opacity, opacity);
    gl.uniform1i(at.u_picture, 0);
    gl.uniform1i(at.u_table, 1);
    gl.disable(gl.CULL_FACE);
    for (const kind of kinds) {
      // A colour table is the second picture, the sprite's own the first.
      gl.uniform1i(at.u_tabled, kind.table ? 1 : 0);
      if (kind.table) bound(kind.table);
      const table = kind.table ? gl.getParameter(gl.TEXTURE_BINDING_2D) : own.blank;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, table);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(at.u_pictured, kind.map ? 1 : 0);
      if (kind.map) bound(kind.map);
      else gl.bindTexture(gl.TEXTURE_2D, own.blank);
      // What is drawn is already times its own alpha, but for what
      // multiplies: that darkens by its colour however much of it there is.
      gl.uniform1i(at.u_straight, kind.blend === Multiply ? 1 : 0);
      if (kind.blend === Screen) gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE);
      else if (kind.blend === Multiply) gl.blendFuncSeparate(gl.DST_COLOR, gl.ZERO, gl.ONE, gl.ONE);
      else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform1f(at.u_frames, kind.frames);
      gl.uniform1f(at.u_blend, kind.blended ? 1 : 0);
      if (kind.lines) {
        const corners = ribbons(kind);
        gl.uniform1i(at.u_mode, 2);
        gl.uniform1f(at.u_facing, kind.facing);
        gl.bindVertexArray(own.ribbons);
        gl.bindBuffer(gl.ARRAY_BUFFER, own.corners);
        gl.bufferData(gl.ARRAY_BUFFER, corners, gl.DYNAMIC_DRAW);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, corners.length / CORNER);
      } else {
        gl.uniform1i(at.u_mode, kind.mode);
        gl.bindVertexArray(own.squares);
        gl.bindBuffer(gl.ARRAY_BUFFER, own.rows);
        gl.bufferData(gl.ARRAY_BUFFER, kind.far ? farthest(kind, away(world, view)) : kind.rows, gl.DYNAMIC_DRAW);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, kind.count);
      }
    }
  };
  // Where it is, for the view to draw it after what is farther away.
  paint.at = world.slice(12, 15);
  return paint;
}

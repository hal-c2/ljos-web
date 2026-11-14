// The shapes QtQuick3D.Helpers works out from a few numbers: a plane, a
// cuboid, a sphere, a cylinder, a cone, a torus and a grid of lines, and
// ProceduralMesh, whose corners a program gives as lists.
//
// Each is worked out as Qt works it out, corner for corner and in the same
// order, so that where a picture lies on one and which way a face of it
// turns are Qt's. One whose numbers make no shape (a width of nothing, too
// few segments) is empty, as it is in Qt.
//
// Not here: CapsuleGeometry, HeightFieldGeometry and ExtrudedTextGeometry.
// A shape is here as soon as it is asked for, whatever `asynchronous` says,
// so `status` is never `Loading`, and nothing says that one has changed
// (`geometryChanged`).
import { defineType, derived } from "../../object.ts";
import { Size } from "../../QtQml/values.js";
import { EMPTY, Geometry } from "../Geometry.js";
import { kept, Object3D } from "../Node.js";

const { PositionSemantic, NormalSemantic, TexCoord0Semantic, TangentSemantic, BinormalSemantic, TexCoord1Semantic, ColorSemantic, JointSemantic, WeightSemantic, IndexSemantic, U16Type, U32Type, F32Type, Lines, Triangles } = Geometry;

const Null = 0;
const Ready = 1;
const STATUS = { Null, Ready, Loading: 2, Error: 3 };

const BOUNDLESS = () => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
// The box the corners fit in, a corner being `row` numbers that begin with
// where it is.
function fit(corners, row) {
  const { min, max } = BOUNDLESS();
  for (let at = 0; at + 2 < corners.length; at += row) {
    for (let axis = 0; axis < 3; axis++) {
      const value = Math.fround(corners[at + axis]);
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }
  return { min, max };
}

// Where a corner is, where in a picture and which way it faces, in rows of
// eight numbers, joined by an order of whole numbers.
const ROW = [
  { semantic: PositionSemantic, offset: 0, componentType: F32Type },
  { semantic: TexCoord0Semantic, offset: 12, componentType: F32Type },
  { semantic: NormalSemantic, offset: 20, componentType: F32Type },
];
function made(corners, order, bounds = fit(corners, 8), wide = false) {
  return {
    vertices: new Uint8Array(new Float32Array(corners).buffer),
    indices: new Uint8Array((wide ? new Uint32Array(order) : new Uint16Array(order)).buffer),
    stride: 32,
    attributes: [...ROW, { semantic: IndexSemantic, offset: 0, componentType: wide ? U32Type : U16Type }],
    primitive: Triangles,
    subsets: [],
    ...bounds,
  };
}

// What a helper holds as a Geometry is what its numbers make.
function helper(name, properties, enums, shape) {
  return defineType(name, Geometry, {
    signals: ["geometryChanged"],
    properties: {
      ...properties,
      asynchronous: true,
      status: derived((self) => (self.$shape() ? Ready : Null)),
    },
    enums: { ...STATUS, ...enums },
    setup(self) {
      self.$held = kept(self, () => shape(self) ?? EMPTY);
    },
  });
}

const whole = (value) => Math.trunc(Number(value) || 0);

// Squares in rows, each of two triangles, their corners counted from
// `first`: anticlockwise seen from the side they face, or the other way.
function squares(order, first, across, up, flipped) {
  for (let y = 0; y < up; y++) {
    for (let x = 0; x < across; x++) {
      const a = first + y * (across + 1) + x;
      const b = a + across + 1;
      const c = b + 1;
      const d = a + 1;
      if (flipped) order.push(a, b, d, b, c, d);
      else order.push(a, d, b, b, d, c);
    }
  }
}

const XY = 0;
const XZ = 1;
const ZY = 2;

export const PlaneGeometry = helper(
  "PlaneGeometry",
  { width: 100, height: 100, meshResolution: new Size(2, 2), plane: XY, reversed: false, mirrored: false },
  { XY, XZ, ZY },
  ({ width, height, meshResolution, plane, reversed, mirrored }) => {
    const across = whole(meshResolution?.width);
    const up = whole(meshResolution?.height);
    if (!(width > 0) || !(height > 0) || across <= 0 || up <= 0) return null;
    const corners = [];
    const order = [];
    const facing = (plane === XZ ? [0, 1, 0] : plane === ZY ? [1, 0, 0] : [0, 0, 1]).map((n) => (reversed ? -n : n));
    for (let y = 0; y <= up; y++) {
      for (let x = 0; x <= across; x++) {
        let u = x / across;
        let v = y / up;
        const px = width * (u - 0.5);
        const py = height * (v - 0.5);
        if (mirrored) v = 1 - v;
        if (reversed) u = 1 - u;
        corners.push(...(plane === XZ ? [px, 0, -py] : plane === ZY ? [0, py, -px] : [px, py, 0]), u, v, ...facing);
      }
    }
    squares(order, 0, across, up, reversed);
    return made(corners, order);
  },
);

// The faces of a cuboid: where the middle of each is, what is across and up
// in it, which way it faces, and which of the three resolutions it has.
const FACES = [
  [[1, 0, 0], [0, 0, -1], [0, 1, 0], "yz"],
  [[-1, 0, 0], [0, 0, 1], [0, 1, 0], "yz"],
  [[0, 1, 0], [-1, 0, 0], [0, 0, 1], "xz"],
  [[0, -1, 0], [1, 0, 0], [0, 0, 1], "xz"],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0], "xy"],
  [[0, 0, -1], [-1, 0, 0], [0, 1, 0], "xy"],
];

export const CuboidGeometry = helper(
  "CuboidGeometry",
  { xExtent: 100, yExtent: 100, zExtent: 100, yzMeshResolution: new Size(2, 2), xzMeshResolution: new Size(2, 2), xyMeshResolution: new Size(2, 2) },
  {},
  ({ xExtent, yExtent, zExtent, yzMeshResolution, xzMeshResolution, xyMeshResolution }) => {
    if (!(xExtent > 0) || !(yExtent > 0)) return null;
    const half = [xExtent / 2, yExtent / 2, zExtent / 2];
    const sizes = { yz: [zExtent, yExtent, yzMeshResolution], xz: [xExtent, zExtent, xzMeshResolution], xy: [xExtent, yExtent, xyMeshResolution] };
    const corners = [];
    const order = [];
    for (const [facing, right, top, which] of FACES) {
      const [width, height, resolution] = sizes[which];
      const across = whole(resolution?.width);
      const up = whole(resolution?.height);
      const first = corners.length / 8;
      for (let y = 0; y <= up; y++) {
        for (let x = 0; x <= across; x++) {
          const u = x / across;
          const v = y / up;
          for (let axis = 0; axis < 3; axis++) corners.push(facing[axis] * half[axis] + right[axis] * (u * width - width / 2) + top[axis] * (v * height - height / 2));
          corners.push(u, v, ...facing);
        }
      }
      squares(order, first, across, up, false);
    }
    return made(corners, order, { min: half.map((h) => -h), max: half });
  },
);

export const SphereGeometry = helper("SphereGeometry", { radius: 100, rings: 16, segments: 32 }, {}, ({ radius, rings, segments }) => {
  if (radius < 0 || rings < 1 || segments < 3) return null;
  const corners = [];
  const order = [];
  for (let i = 0; i <= rings; i++) {
    const phi = Math.fround((Math.PI * i) / rings);
    const y = radius * Math.cos(phi);
    const ring = radius * Math.sin(phi);
    for (let j = 0; j <= segments; j++) {
      const theta = Math.fround((2 * Math.PI * j) / segments);
      const x = ring * Math.cos(theta);
      const z = ring * Math.sin(theta);
      const length = Math.hypot(x, y, z) || 1;
      corners.push(x, y, z, 1 - j / segments, 1 - i / rings, x / length, y / length, z / length);
    }
  }
  squares(order, 0, segments, rings, false);
  return made(corners, order);
});

// The side of a cylinder or a cone: rings of corners from the bottom up,
// each going round from x toward z. A picture's upper half lies on the side
// of a cylinder and of a cone with its top cut off; a cone with a point has
// a circle of the picture's lower half folded over it.
function sides(corners, order, rings, slices, top, bottom, length, cone) {
  const first = corners.length / 8;
  const lean = Math.tan(Math.PI / 2 - Math.atan(length / (bottom - top)));
  for (let ring = 0; ring < rings; ring++) {
    const y = -length / 2 + (ring * length) / (rings - 1);
    const t = (y + length / 2) / length;
    const radius = bottom * (1 - t) + t * top;
    for (let slice = 0; slice <= slices; slice++) {
      const theta = Math.fround(slice * Math.fround((Math.PI * 2) / slices));
      const ct = Math.cos(theta);
      const st = Math.sin(theta);
      const size = Math.hypot(ct, lean, st);
      let u = slice / slices;
      let v = 0.5 + t / 2;
      if (cone && top === 0) {
        const from = 1 - ring / (rings - 1);
        u = 0.25 + from * ct * 0.25;
        v = 0.25 - from * st * 0.25;
      } else if (cone && bottom === 0) {
        const from = ring / (rings - 1);
        u = 0.75 + from * ct * 0.25;
        v = 0.25 + from * st * 0.25;
      }
      corners.push(radius * ct, y, radius * st, u, v, ct / size, lean / size, st / size);
    }
  }
  for (let ring = 0; ring < rings - 1; ring++) {
    const here = first + ring * (slices + 1);
    const next = here + slices + 1;
    for (let slice = 0; slice < slices; slice++) order.push(here + slice, next + slice, here + slice + 1, here + slice + 1, next + slice, next + slice + 1);
  }
}

// An end of one: a corner in the middle and a ring of them round it, with
// a circle of the picture's lower half on it.
function disc(corners, slices, top, bottom, length, y) {
  const up = y < 0 ? -1 : 1;
  corners.push(0, y, 0, y < 0 ? 0.75 : 0.25, 0.25, 0, up, 0);
  const t = (y + length / 2) / length;
  const radius = bottom * (1 - t) + t * top;
  for (let slice = 0; slice <= slices; slice++) {
    const theta = Math.fround(slice * Math.fround((Math.PI * 2) / slices));
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    corners.push(radius * ct, y, radius * st, (y < 0 ? 0.75 : 0.25) + 0.25 * ct, 0.25 + 0.25 * (y < 0 ? st : -st), 0, up, 0);
  }
}

// The triangles of an end, each from the middle: round one way or the
// other.
function fan(order, middle, slices, forward) {
  if (forward) for (let i = 0; i < slices; i++) order.push(middle, middle + i + 1, i === slices - 1 ? middle + 1 : middle + i + 2);
  else for (let i = slices - 1; i >= 0; i--) order.push(middle, middle + i + 1, i === 0 ? middle + slices : middle + i);
}

export const CylinderGeometry = helper("CylinderGeometry", { radius: 50, length: 100, rings: 0, segments: 20 }, {}, ({ radius, length, rings, segments }) => {
  if (!(radius > 0) || !(length > 0) || rings < 0 || segments < 3) return null;
  const corners = [];
  const order = [];
  sides(corners, order, rings + 2, segments, radius, radius, length, false);
  let middle = corners.length / 8;
  disc(corners, segments, radius, radius, length, -length / 2);
  fan(order, middle, segments, true);
  middle = corners.length / 8;
  disc(corners, segments, radius, radius, length, length / 2);
  fan(order, middle, segments, false);
  return made(corners, order);
});

export const ConeGeometry = helper("ConeGeometry", { topRadius: 0, bottomRadius: 50, length: 100, rings: 0, segments: 20 }, {}, ({ topRadius, bottomRadius, length, rings, segments }) => {
  if (topRadius < 0 || bottomRadius < 0 || (topRadius <= 0 && bottomRadius <= 0) || !(length > 0) || rings < 0 || segments < 3) return null;
  const corners = [];
  const order = [];
  sides(corners, order, rings + 2, segments, topRadius, bottomRadius, length, true);
  // An end is there where it is more than a point.
  if (bottomRadius > 0) {
    const middle = corners.length / 8;
    disc(corners, segments, topRadius, bottomRadius, length, -length / 2);
    fan(order, middle, segments, true);
  }
  if (topRadius > 0) {
    const middle = corners.length / 8;
    disc(corners, segments, topRadius, bottomRadius, length, length / 2);
    fan(order, middle, segments, false);
  }
  return made(corners, order);
});

export const TorusGeometry = helper("TorusGeometry", { rings: 50, segments: 50, radius: 100, tubeRadius: 10 }, {}, ({ rings, segments, radius, tubeRadius }) => {
  if (rings <= 0 || segments <= 0 || !(radius > 0) || !(tubeRadius > 0)) return null;
  const corners = [];
  const order = [];
  for (let i = 0; i <= rings; i++) {
    for (let j = 0; j <= segments; j++) {
      const u = Math.fround((i / rings) * Math.PI * 2);
      const v = Math.fround((j / segments) * Math.PI * 2);
      const cx = radius * Math.cos(u);
      const cz = radius * Math.sin(u);
      const x = cx + tubeRadius * Math.cos(v) * Math.cos(u);
      const y = tubeRadius * Math.sin(v);
      const z = cz + tubeRadius * Math.cos(v) * Math.sin(u);
      const length = Math.hypot(x - cx, y, z - cz) || 1;
      corners.push(x, y, z, 1 - i / rings, j / segments, (x - cx) / length, y / length, (z - cz) / length);
    }
  }
  squares(order, 0, segments, rings, false);
  return made(corners, order, undefined, true);
});

// Lines across and lines up, in the plane that faces z. The box Qt says it
// fits in is not the one it does: halves of the counts of lines, as whole
// numbers, times the steps the other way round.
export const GridGeometry = defineType("GridGeometry", Geometry, {
  properties: {
    horizontalLines: 1000,
    verticalLines: 1000,
    horizontalStep: 0.1,
    verticalStep: 0.1,
  },
  setup(self) {
    self.$held = kept(self, () => {
      const { horizontalLines: across, verticalLines: up, horizontalStep, verticalStep } = self;
      const corners = [];
      const y0 = -(across - 1) * horizontalStep * 0.5;
      const x0 = -(up - 1) * verticalStep * 0.5;
      for (let i = 0; i < across; i++) corners.push(x0, y0 + i * horizontalStep, 0, 1, 0, 0, 1, 0, -x0, y0 + i * horizontalStep, 0, 1, 0, 0, 1, 0);
      for (let i = 0; i < up; i++) corners.push(x0 + i * verticalStep, y0, 0, 1, 0, 0, 1, 0, x0 + i * verticalStep, -y0, 0, 1, 0, 0, 1, 0);
      return {
        vertices: new Uint8Array(new Float32Array(corners).buffer),
        indices: new Uint8Array(0),
        stride: 32,
        attributes: [
          { semantic: PositionSemantic, offset: 0, componentType: F32Type },
          { semantic: NormalSemantic, offset: 16, componentType: F32Type },
        ],
        primitive: Lines,
        subsets: [],
        min: [-Math.trunc(up / 2) * horizontalStep, -Math.trunc(across / 2) * horizontalStep, 0],
        max: [Math.trunc(up / 2) * verticalStep, Math.trunc(across / 2) * verticalStep, 0],
      };
    });
  },
});

export const ProceduralMeshSubset = defineType("ProceduralMeshSubset", Object3D, {
  properties: {
    offset: 0,
    count: 0,
    name: "",
  },
});

const list = (value) => (value == null ? [] : Array.isArray(value) ? value : Array.from(value));
const AXES = ["x", "y", "z", "w"];

// What a corner has, in the order the parts of it are said to be in a row,
// and how many numbers each is. Qt writes which way a picture goes down
// before which way it goes across, though it says them the other way round:
// with both given, each is read as the other.
const GIVEN = [
  ["positions", PositionSemantic, 3],
  ["normals", NormalSemantic, 3],
  ["tangents", TangentSemantic, 3],
  ["binormals", BinormalSemantic, 3],
  ["uv0s", TexCoord0Semantic, 2],
  ["uv1s", TexCoord1Semantic, 2],
  ["colors", ColorSemantic, 4],
  ["joints", JointSemantic, 4],
  ["weights", WeightSemantic, 4],
];
const WRITTEN = ["positions", "normals", "binormals", "tangents", "uv0s", "uv1s", "colors", "joints", "weights"];

export const ProceduralMesh = defineType("ProceduralMesh", Geometry, {
  signals: ["geometryChanged"],
  properties: {
    positions: undefined,
    normals: undefined,
    tangents: undefined,
    binormals: undefined,
    uv0s: undefined,
    uv1s: undefined,
    colors: undefined,
    joints: undefined,
    weights: undefined,
    indexes: undefined,
    subsets: undefined,
    primitiveMode: Triangles,
  },
  enums: { Points: Geometry.Points, LineStrip: Geometry.LineStrip, Lines, TriangleStrip: Geometry.TriangleStrip, TriangleFan: Geometry.TriangleFan, Triangles },
  setup(self) {
    self.$held = kept(self, () => {
      const positions = list(self.positions);
      const count = positions.length;
      if (count === 0) return EMPTY;
      // A list shorter than the corners are many is left out.
      const have = GIVEN.filter(([name]) => list(self[name]).length >= count);
      const attributes = [];
      let stride = 0;
      for (const [, semantic, numbers] of have) {
        attributes.push({ semantic, offset: stride, componentType: F32Type });
        stride += numbers * 4;
      }
      const lists = WRITTEN.filter((name) => have.some(([given]) => given === name)).map((name) => [list(self[name]), GIVEN.find(([given]) => given === name)[2]]);
      const corners = new Float32Array((count * stride) / 4);
      let at = 0;
      for (let index = 0; index < count; index++) {
        for (const [values, numbers] of lists) for (let part = 0; part < numbers; part++) corners[at++] = Number(values[index]?.[AXES[part]]) || 0;
      }
      // The box is about the middle of the shape's space as well as its
      // corners, which is where Qt starts it from.
      const box = (indexes) => {
        const min = [0, 0, 0];
        const max = [0, 0, 0];
        for (const index of indexes) {
          AXES.slice(0, 3).forEach((axis, which) => {
            const value = Math.fround(Number(positions[index]?.[axis]) || 0);
            min[which] = Math.min(min[which], value);
            max[which] = Math.max(max[which], value);
          });
        }
        return { min, max };
      };
      const indexes = list(self.indexes).map(Number);
      if (indexes.length > 0) attributes.push({ semantic: IndexSemantic, offset: 0, componentType: U32Type });
      const subsets = [];
      for (const subset of list(self.subsets)) {
        const run = Array.from({ length: subset.count }, (_, index) => subset.offset + index);
        const reached = indexes.length > 0 ? run.map((index) => indexes[index]) : run;
        if (reached.some((index) => !(index < count))) console.warn("Skipping invalid subset: Out of Range");
        else subsets.push({ offset: subset.offset, count: subset.count, name: String(subset.name ?? ""), ...box(reached) });
      }
      return {
        vertices: new Uint8Array(corners.buffer),
        indices: new Uint8Array(new Uint32Array(indexes).buffer),
        stride,
        attributes,
        primitive: self.primitiveMode,
        subsets,
        ...box(positions.keys()),
      };
    });
  },
});

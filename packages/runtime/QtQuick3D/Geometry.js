// Geometry: the shape of a Model handed over as its numbers rather than
// named as a mesh file. In Qt it is a C++ class a program derives from, and
// what the derived class calls there it calls here: `setStride`,
// `addAttribute`, `setVertexData`, `setIndexData`, `setPrimitiveType`,
// `setBounds`, `addSubset` and `clear`. The numbers are an ArrayBuffer, or
// an array with numbers of one kind in it.
//
// A corner is a row of `stride` bytes, and an attribute says where in the
// row one thing about it is and of what kind its numbers are. How many
// numbers each has is fixed: three for where it is and which way it faces,
// two for where in a picture it is, four for a colour, joints and weights.
//
// Not here: what a morph target moves (the `Target` attributes are taken
// and not drawn), and a row in which a part does not start at a multiple of
// what its numbers are long, which OpenGL does not read.
import { defineType, flush } from "../object.js";
import * as math from "./math.js";
import { Triangles } from "./mesh.js";
import { Object3D } from "./Node.js";
import { signal } from "#kernel";

const PRIMITIVES = { Points: 0, LineStrip: 1, Lines: 2, TriangleStrip: 3, TriangleFan: 4, Triangles: 5 };
const SEMANTICS = {
  IndexSemantic: 0,
  PositionSemantic: 1,
  NormalSemantic: 2,
  TexCoordSemantic: 3,
  TangentSemantic: 4,
  BinormalSemantic: 5,
  JointSemantic: 6,
  WeightSemantic: 7,
  ColorSemantic: 8,
  TargetPositionSemantic: 9,
  TargetNormalSemantic: 10,
  TargetTangentSemantic: 11,
  TargetBinormalSemantic: 12,
  TexCoord1Semantic: 13,
  TexCoord0Semantic: 3,
};
const COMPONENTS = { U16Type: 0, U32Type: 1, I32Type: 2, F32Type: 3 };

// What each is in a mesh file: the name of a part of a corner and how many
// numbers it has, the number for a kind of number, and for a way of joining
// corners.
const PARTS = {
  1: ["attr_pos", 3],
  2: ["attr_norm", 3],
  3: ["attr_uv0", 2],
  4: ["attr_textan", 3],
  5: ["attr_binormal", 3],
  6: ["attr_joints", 4],
  7: ["attr_weights", 4],
  8: ["attr_color", 4],
  13: ["attr_uv1", 2],
};
const KINDS = [3, 5, 6, 10];
const MODES = [1, 2, 4, 5, 6, Triangles];
const ORDERS = [Uint16Array, Uint32Array];

const bytes = (data) => (data instanceof ArrayBuffer ? new Uint8Array(data) : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : Uint8Array.from(data ?? []));
const triple = (value) => [Number(value?.x) || 0, Number(value?.y) || 0, Number(value?.z) || 0];

// The numbers as the renderer takes a mesh, or null where there is nothing
// to draw: no corners, no row length, or nothing said of where a corner is.
function shaped({ vertices, indices, stride, attributes, primitive, min, max, subsets }) {
  if (!(stride > 0) || vertices.byteLength < stride) return null;
  const entries = {};
  let order = null;
  for (const { semantic, offset, componentType } of attributes) {
    if (semantic === SEMANTICS.IndexSemantic) order = ORDERS[componentType] ?? null;
    else if (PARTS[semantic]) entries[PARTS[semantic][0]] = { type: KINDS[componentType], count: PARTS[semantic][1], offset };
  }
  if (!entries.attr_pos) return null;
  const joined = order && indices.byteLength >= order.BYTES_PER_ELEMENT ? new order(indices.buffer.slice(indices.byteOffset, indices.byteOffset + indices.byteLength - (indices.byteLength % order.BYTES_PER_ELEMENT))) : null;
  const count = joined ? joined.length : Math.floor(vertices.byteLength / stride);
  return {
    entries,
    stride,
    vertices,
    indices: joined,
    // With no subsets said it is all one.
    subsets: subsets.length > 0 ? subsets.map((subset) => ({ ...subset })) : [{ count, offset: 0, min, max }],
    drawMode: MODES[primitive] ?? Triangles,
    winding: 2,
  };
}

export const EMPTY = { vertices: new Uint8Array(0), indices: new Uint8Array(0), stride: 0, attributes: [], primitive: PRIMITIVES.Triangles, min: [0, 0, 0], max: [0, 0, 0], subsets: [] };

// `data` laid over what is there from `offset` on, as Qt's two-argument
// setters do it: nothing is made longer.
function over(there, offset, data) {
  const made = new Uint8Array(there);
  made.set(data.subarray(0, Math.max(0, there.length - offset)), offset);
  return made;
}

export const Geometry = defineType("Geometry", Object3D, {
  signals: ["geometryNodeDirty"],
  enums: { ...PRIMITIVES, ...SEMANTICS, ...COMPONENTS },
  methods: {
    vertexData() {
      return this.$held().vertices.slice().buffer;
    },
    indexData() {
      return this.$held().indices.slice().buffer;
    },
    attributeCount() {
      return this.$held().attributes.length;
    },
    attribute(index) {
      return { ...this.$held().attributes[index] };
    },
    primitiveType() {
      return this.$held().primitive;
    },
    boundsMin() {
      return math.vector(this.$held().min);
    },
    boundsMax() {
      return math.vector(this.$held().max);
    },
    stride() {
      return this.$held().stride;
    },
    setVertexData(offset, data) {
      this.$hold({ vertices: data === undefined ? bytes(offset) : over(this.$held().vertices, offset, bytes(data)) });
    },
    setIndexData(offset, data) {
      this.$hold({ indices: data === undefined ? bytes(offset) : over(this.$held().indices, offset, bytes(data)) });
    },
    setStride(stride) {
      this.$hold({ stride: Number(stride) || 0 });
    },
    setBounds(min, max) {
      this.$hold({ min: triple(min), max: triple(max) });
    },
    setPrimitiveType(primitive) {
      this.$hold({ primitive });
    },
    // `addAttribute(semantic, offset, componentType)`, or one object with
    // the three in it.
    addAttribute(semantic, offset, componentType) {
      const added = typeof semantic === "object" ? { ...semantic } : { semantic, offset, componentType };
      this.$hold({ attributes: [...this.$held().attributes, { semantic: added.semantic ?? SEMANTICS.PositionSemantic, offset: added.offset ?? -1, componentType: added.componentType ?? COMPONENTS.F32Type }] });
    },
    // A run of the corners, or of the order they are joined in, that is
    // drawn with a material of its own.
    addSubset(offset, count, min, max, name = "") {
      this.$hold({ subsets: [...this.$held().subsets, { offset, count, min: triple(min), max: triple(max), name: String(name) }] });
    },
    subsetBoundsMin(subset) {
      return math.vector(this.$held().subsets[subset]?.min ?? [0, 0, 0]);
    },
    subsetBoundsMax(subset) {
      return math.vector(this.$held().subsets[subset]?.max ?? [0, 0, 0]);
    },
    subsetOffset(subset) {
      return this.$held().subsets[subset]?.offset ?? 0;
    },
    subsetCount(subset) {
      return subset === undefined ? this.$held().subsets.length : (this.$held().subsets[subset]?.count ?? 0);
    },
    subsetName(subset) {
      return this.$held().subsets[subset]?.name ?? "";
    },
    clear() {
      this.$hold(EMPTY);
    },
    update() {},
  },
  setup(self) {
    const [held, setHeld] = signal(EMPTY, self.$owner);
    let made = null;
    self.$held = held;
    // Qt says a shape has changed when it next takes it up to draw it:
    // once for all that was changed since.
    let told = false;
    self.$hold = (changed) => {
      setHeld({ ...held(), ...changed });
      flush();
      if (told) return;
      told = true;
      queueMicrotask(() => {
        told = false;
        self.geometryNodeDirty();
      });
    };
    // One shape for as long as nothing of it changes, so that what the
    // renderer made of it is kept.
    self.$shape = () => {
      const now = self.$held();
      if (made?.of !== now) made = { of: now, shape: shaped(now) };
      return made.shape;
    };
  },
});

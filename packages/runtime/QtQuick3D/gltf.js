// What picking needs of a glTF file: each node of its scene with a mesh,
// its name, where the file places it, and its mesh's corners and
// triangles as a shape of `mesh.js`'s (only `attr_pos`). The renderer that
// draws such files reads them itself (`wgpu.js`); this is the page's own
// reading, made only once a pick asks.
import * as math from "./math.js";
import { Triangles } from "./mesh.js";

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const TRIANGLES = 4;
const TRIANGLE_STRIP = 5;
const TRIANGLE_FAN = 6;
const FLOAT = 5126;

// A file's description and, in a binary one, its own buffer: `{ json,
// bin }`, or what is wrong as `{ error }`.
export function header(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (bytes.length >= 12 && view.getUint32(0, true) === 0x46546c67) {
    let json = null;
    let bin = null;
    for (let at = 12; at + 8 <= bytes.length; ) {
      const length = view.getUint32(at, true);
      const kind = view.getUint32(at + 4, true);
      const chunk = bytes.subarray(at + 8, at + 8 + length);
      if (kind === JSON_CHUNK) json = JSON.parse(new TextDecoder().decode(chunk));
      else if (kind === BIN_CHUNK) bin = chunk;
      at += 8 + length + ((4 - (length % 4)) % 4);
    }
    return json ? { json, bin } : { error: "it has no description" };
  }
  return { json: JSON.parse(new TextDecoder().decode(bytes)), bin: null };
}

// Where each buffer's bytes are: in the binary file, in the description
// (`data:`), or in a file of their own beside it, named relative to it.
export function buffers({ json, bin }, address) {
  return (json.buffers ?? []).map((buffer, index) => {
    if (buffer.uri === undefined) return index === 0 && bin ? { bytes: bin } : { error: `its buffer ${index} has nothing in it` };
    const data = /^data:[^,]*;base64,(.*)$/s.exec(buffer.uri);
    if (data) return { bytes: Uint8Array.from(atob(data[1]), (letter) => letter.charCodeAt(0)) };
    return { url: new URL(buffer.uri, new URL(address, globalThis.location?.href)).href };
  });
}

// The nodes with a mesh, given each buffer's bytes: `[{ name, index,
// placed, shape }]`, `placed` where the file puts the node in the file's
// own space.
export function parts(json, bytes) {
  const shapes = new Map();
  const shapeOf = (mesh) => {
    if (!shapes.has(mesh)) shapes.set(mesh, shaped(json, bytes, json.meshes?.[mesh]));
    return shapes.get(mesh);
  };
  const found = [];
  const walk = (index, above, seen) => {
    const node = json.nodes?.[index];
    if (!node || seen.has(index)) return;
    seen.add(index);
    const placed = math.multiply(above, own(node));
    if (node.mesh !== undefined) {
      const shape = shapeOf(node.mesh);
      if (shape) found.push({ name: node.name ?? "", index, placed, shape });
    }
    for (const child of node.children ?? []) walk(child, placed, seen);
    seen.delete(index);
  };
  for (const root of roots(json)) walk(root, math.IDENTITY, new Set());
  return found;
}

// The nodes the file's scene starts from, or, with no scene, those that
// are inside no other.
function roots(json) {
  const scene = json.scenes?.[json.scene ?? 0];
  if (scene) return scene.nodes ?? [];
  const inner = new Set((json.nodes ?? []).flatMap((node) => node.children ?? []));
  return (json.nodes ?? []).map((_, index) => index).filter((index) => !inner.has(index));
}

function own(node) {
  if (node.matrix) return [...node.matrix];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  return math.placed(node.translation ?? [0, 0, 0], node.scale ?? [1, 1, 1], [0, 0, 0], [w, x, y, z]);
}

// The triangles of a strip or a fan of `count` corners, as a list: glTF
// 2.0's own rule, so a strip's every other triangle is turned the same
// way as the first.
function listed(mode, count) {
  const list = [];
  for (let at = 0; at + 2 < count; at++) {
    if (mode === TRIANGLE_FAN) list.push(at + 1, at + 2, 0);
    else if (at % 2) list.push(at, at + 2, at + 1);
    else list.push(at, at + 1, at + 2);
  }
  return list;
}

// A mesh's triangles, a run of them for each of its parts drawn as
// triangles, a strip or a fan of them: null when it has none.
function shaped(json, bytes, mesh) {
  const corners = [];
  const indices = [];
  const subsets = [];
  for (const primitive of mesh?.primitives ?? []) {
    const mode = primitive.mode ?? TRIANGLES;
    if (mode !== TRIANGLES && mode !== TRIANGLE_STRIP && mode !== TRIANGLE_FAN) continue;
    const at = read(json, bytes, primitive.attributes?.POSITION);
    if (!at || at.type !== FLOAT || at.width !== 3) continue;
    const first = corners.length / 3;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let row = 0; row < at.count; row++) {
      for (let axis = 0; axis < 3; axis++) {
        const value = at.get(row, axis);
        corners.push(value);
        min[axis] = Math.min(min[axis], value);
        max[axis] = Math.max(max[axis], value);
      }
    }
    const offset = indices.length;
    const order = primitive.indices === undefined ? null : read(json, bytes, primitive.indices);
    const corner = order ? (row) => order.get(row, 0) : (row) => row;
    const count = order ? order.count : at.count;
    if (mode === TRIANGLES) for (let row = 0; row < count; row++) indices.push(first + corner(row));
    else for (const row of listed(mode, count)) indices.push(first + corner(row));
    if (indices.length > offset) subsets.push({ count: indices.length - offset, offset, min, max });
  }
  if (!subsets.length) return null;
  return {
    entries: { attr_pos: { type: 10, count: 3, offset: 0 } },
    stride: 12,
    vertices: new Uint8Array(Float32Array.from(corners).buffer),
    indices: Uint32Array.from(indices),
    subsets,
    drawMode: Triangles,
  };
}

const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const GET = { 5120: "getInt8", 5121: "getUint8", 5122: "getInt16", 5123: "getUint16", 5125: "getUint32", 5126: "getFloat32" };

// An accessor's numbers: `get(row, column)`. Null when it says nothing a
// pick can read (no view, a kind not known, past its buffer's end).
function read(json, bytes, index) {
  const accessor = json.accessors?.[index];
  const view = json.bufferViews?.[accessor?.bufferView];
  const buffer = bytes[view?.buffer];
  const width = WIDTH[accessor?.type];
  const size = SIZE[accessor?.componentType];
  if (!view || !buffer || !width || !size) return null;
  const stride = view.byteStride || width * size;
  const start = buffer.byteOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const count = accessor.count ?? 0;
  if (count && (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + (count - 1) * stride + width * size > buffer.byteLength) return null;
  const data = new DataView(buffer.buffer);
  const get = GET[accessor.componentType];
  return { type: accessor.componentType, width, count, get: (row, column) => data[get](start + row * stride + column * size, true) };
}

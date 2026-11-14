// What moves the bodies: PhysX, which Qt moves them with too, as it is built
// for a browser (`physx-js-webidl`).
//
// It is some megabytes, so a page fetches it only when a program makes a
// PhysicsWorld: `load()` asks for it, once, and `engine()` is null until it
// is here. What every world shares is made with the first, as Qt makes it:
// the one object worlds are made of, with that world's `typicalLength` and
// `typicalSpeed`.
//
// Not here: more than one thread. The engine runs on the page's own.
import glue from "physx-js-webidl/physx-js-webidl.mjs?url";
import wasm from "physx-js-webidl/physx-js-webidl.wasm?url";
import { awaited } from "../../object.ts";

let PhysX = null;
let loading = null;

export const engine = () => PhysX;

export function load() {
  return (loading ??= awaited(
    import(/* @vite-ignore */ glue)
      .then(({ default: make }) => make({ locateFile: () => wasm }))
      .then((module) => (PhysX = module)),
  ));
}

// One of the engine's named numbers: `flag("PxSceneFlagEnum", "eENABLE_CCD")`.
// Two of its lists may have the same name in them, so it is asked of the list.
const flags = new Map();
export function flag(list, name) {
  const key = `${list}_${name}`;
  let value = flags.get(key);
  if (value === undefined) flags.set(key, (value = PhysX[`_emscripten_enum_${key}`]()));
  return value;
}

// What the engine calls of its own that is not a method of anything.
export const top = () => PhysX.PxTopLevelFunctions.prototype;

let shared = null;

// What all worlds share: `{ physics, dispatcher, cooking, material }`.
export function sdk(length, speed) {
  if (shared) return shared;
  const version = top().PHYSICS_VERSION;
  const foundation = top().CreateFoundation(version, new PhysX.PxDefaultAllocator(), new PhysX.PxDefaultErrorCallback());
  const scale = new PhysX.PxTolerancesScale();
  scale.length = length;
  scale.speed = speed;
  const physics = top().CreatePhysics(version, foundation, scale);
  // Meshes are cooked for the lengths the engine has when it is told
  // nothing, whatever the world's are: Qt's are.
  const cooking = new PhysX.PxCookingParams(new PhysX.PxTolerancesScale());
  shared = {
    physics,
    dispatcher: top().DefaultCpuDispatcherCreate(0),
    cooking,
    // What a body with no material of its own is made of.
    material: physics.createMaterial(0.5, 0.5, 0.5),
  };
  return shared;
}

// The engine's own vectors, turns and poses, to hand it numbers in. They
// are the same few objects every time: what takes one copies it.
const scratch = {};
const held = (name, make) => (scratch[name] ??= make());

export function vec(x, y, z, which = 0) {
  const v = held(`v${which}`, () => new PhysX.PxVec3(0, 0, 0));
  v.x = x;
  v.y = y;
  v.z = z;
  return v;
}

// A turn is `[scalar, x, y, z]` here and `x, y, z, w` there.
export function quat([w, x, y, z]) {
  const q = held("q", () => new PhysX.PxQuat(0, 0, 0, 1));
  q.x = x;
  q.y = y;
  q.z = z;
  q.w = w;
  return q;
}

export function pose(position, turn) {
  const t = held("t", () => new PhysX.PxTransform(flag("PxIDENTITYEnum", "PxIdentity")));
  t.p = vec(position[0], position[1], position[2], 9);
  t.q = quat(turn);
  return t;
}

export const three = (v) => [v.x, v.y, v.z];
export const four = (q) => [q.w, q.x, q.y, q.z];

// A mesh as the engine collides with one, made once for each file that is
// one: null when the engine can make nothing of it.
const cooked = new Map();
export function cook(kind, key, mesh) {
  const name = `${kind} ${key}`;
  if (cooked.has(name)) return cooked.get(name);
  const count = mesh.points.length / 3;
  const points = new PhysX.PxArray_PxVec3(count);
  for (let index = 0; index < count; index++) points.set(index, vec(mesh.points[index * 3], mesh.points[index * 3 + 1], mesh.points[index * 3 + 2]));
  let made = null;
  if (kind === "convex") {
    const desc = new PhysX.PxConvexMeshDesc();
    desc.points.count = count;
    desc.points.stride = 12;
    desc.points.data = points.begin();
    const hull = new PhysX.PxConvexFlags(flag("PxConvexFlagEnum", "eCOMPUTE_CONVEX"));
    desc.flags = hull;
    made = top().CreateConvexMesh(shared.cooking, desc);
    PhysX.destroy(hull);
    PhysX.destroy(desc);
  } else {
    const desc = new PhysX.PxTriangleMeshDesc();
    desc.points.count = count;
    desc.points.stride = 12;
    desc.points.data = points.begin();
    // With no order to join them in, the corners are triangles as they come.
    const corners = mesh.indices ? new PhysX.PxArray_PxU32(mesh.indices.length) : null;
    if (corners) {
      mesh.indices.forEach((corner, index) => corners.set(index, corner));
      desc.triangles.count = Math.floor(mesh.indices.length / 3);
      desc.triangles.stride = 12;
      desc.triangles.data = corners.begin();
    }
    made = top().CreateTriangleMesh(shared.cooking, desc);
    PhysX.destroy(desc);
    if (corners) PhysX.destroy(corners);
  }
  PhysX.destroy(points);
  if (!made || made.ptr === 0) made = null;
  cooked.set(name, made);
  return made;
}

// A field of heights likewise: `heights` are whole numbers, a column after
// another.
export function field(key, rows, columns, heights) {
  const name = `field ${key}`;
  if (cooked.has(name)) return cooked.get(name);
  const samples = new PhysX.PxArray_PxHeightFieldSample(heights.length);
  for (let index = 0; index < heights.length; index++) {
    const sample = samples.get(index);
    sample.height = heights[index];
    sample.materialIndex0 = 0;
    sample.materialIndex1 = 0;
  }
  const desc = new PhysX.PxHeightFieldDesc();
  desc.format = flag("PxHeightFieldFormatEnum", "eS16_TM");
  desc.nbRows = rows;
  desc.nbColumns = columns;
  desc.samples.stride = 4;
  desc.samples.data = samples.begin();
  let made = top().CreateHeightField(desc);
  PhysX.destroy(desc);
  PhysX.destroy(samples);
  if (!made || made.ptr === 0) made = null;
  cooked.set(name, made);
  return made;
}

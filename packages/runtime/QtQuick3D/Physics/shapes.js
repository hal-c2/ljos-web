// The shapes a body collides as: a box, a ball, a capsule, a plane with no
// end, the hull of a mesh, the mesh itself, and a field of heights.
//
// A shape is a node inside its body. What the engine is given of it is what
// Qt gives it: its size times the scale it has in the scene, at its own
// position times that scale, turned as it is itself. So a scale stretches a
// box and a mesh along each direction, a ball by its `x` alone, and a
// capsule's width by its `y` and its length by its `x`; a plane's position
// is not scaled at all. A plane faces the way a Rectangle does, and a
// capsule lies along `x`.
//
// A body asks its shapes each frame what they are (`$form`), and makes
// them again when one says something else. A shape that is a file is read
// by the page, and the world waits until it has been (`$waiting`).
//
// Not here: `enableDebugDraw`, which is kept and draws nothing; a mesh
// shape's `geometry` (a shape made by a program), which is taken for no
// shape; and a HeightFieldShape's `image`.
import { guardedFetch } from "../../guard.js";
import { awaited, defineType, derived, located } from "../../object.js";
import { Vector3d } from "../../QtQml/values.js";
import * as math from "../math.js";
import { column, read } from "../mesh.js";
import { Node } from "../Node.js";
import { cook, engine, field, quat, vec } from "./engine.js";

// A file, once read: null until it is here, then what `took` made of it,
// or `{ error }`. The scene's own files are read the same way, by what
// draws them: a mesh both draws and collides is fetched once by the browser.
const files = new Map();
function file(url, took) {
  if (files.has(url)) return files.get(url);
  files.set(url, null);
  awaited(
    guardedFetch(url)
      .then((answer) => (answer.ok ? answer.arrayBuffer() : Promise.reject(new Error(`${answer.status}`))))
      .then((buffer) => took(buffer))
      .catch((error) => ({ error: `could not be read: ${error.message}` }))
      .then((made) => {
        if (made.error) console.warn(`CollisionShape: ${url}: ${made.error}`);
        files.set(url, made);
      }),
  );
  return null;
}

// What of a mesh file the engine is given: where its corners are, and the
// order they are joined into triangles in.
function corners(buffer) {
  const mesh = read(buffer);
  if (mesh.error) return mesh;
  const points = column(mesh, "attr_pos", 3);
  if (!points) return { error: "it has no corners" };
  return { points, indices: mesh.indices ? Uint32Array.from(mesh.indices) : null };
}

// How bright each dot of a picture is, from 0 to 1, a row after another.
async function brightness(buffer) {
  const picture = await createImageBitmap(new Blob([buffer]));
  const { width, height } = picture;
  const paper = new OffscreenCanvas(width, height).getContext("2d");
  paper.drawImage(picture, 0, 0);
  const { data } = paper.getImageData(0, 0, width, height);
  const values = new Float32Array(width * height);
  for (let at = 0; at < values.length; at++) values[at] = Math.max(data[at * 4], data[at * 4 + 1], data[at * 4 + 2]) / 255;
  return { width, height, values };
}

const turnOf = (shape) => {
  const { scalar, x, y, z } = shape.rotation;
  return [scalar, x, y, z];
};

// One turn after another: `b` first.
const turns = (a, b) => math.turnOf(math.multiply(math.rotation(a), math.rotation(b)));

// A quarter turn about `y`: the engine's plane faces along `x`, Qt's as a
// Rectangle does.
const FACING = math.fromEuler(0, -90, 0);

export const CollisionShape = defineType("CollisionShape", Node, {
  properties: { enableDebugDraw: false },
  methods: {
    // What the engine is to make of the shape, as numbers and names to tell
    // one from another by: null while there is nothing to make. `scale` is
    // the shape's in the scene.
    $form() {
      return null;
    },
    // The engine's own shape of that, which whoever asked gives back.
    $geometry() {
      return null;
    },
    // Whether the shape is a file that is still being read.
    $waiting() {
      return false;
    },
    // Where in its body the shape is, and how it is turned there.
    $pose(scale) {
      return [this.x * scale[0], this.y * scale[1], this.z * scale[2], ...turnOf(this)];
    },
  },
  setup(self) {
    // Whether a body that moves by itself can be of this shape.
    self.$fixed = false;
  },
});

export const BoxShape = defineType("BoxShape", CollisionShape, {
  properties: { extents: new Vector3d(100, 100, 100) },
  methods: {
    $form(scale) {
      const { x, y, z } = this.extents;
      return ["box", x * scale[0] * 0.5, y * scale[1] * 0.5, z * scale[2] * 0.5];
    },
    $geometry(form) {
      return new (engine().PxBoxGeometry)(form[1], form[2], form[3]);
    },
  },
});

export const SphereShape = defineType("SphereShape", CollisionShape, {
  properties: { diameter: 100 },
  methods: {
    $form(scale) {
      return ["sphere", this.diameter * 0.5 * scale[0]];
    },
    $geometry(form) {
      return new (engine().PxSphereGeometry)(form[1]);
    },
  },
});

export const CapsuleShape = defineType("CapsuleShape", CollisionShape, {
  properties: { diameter: 100, height: 100 },
  methods: {
    $form(scale) {
      return ["capsule", scale[1] * this.diameter * 0.5, scale[0] * this.height * 0.5];
    },
    $geometry(form) {
      return new (engine().PxCapsuleGeometry)(form[1], form[2]);
    },
  },
});

export const PlaneShape = defineType("PlaneShape", CollisionShape, {
  methods: {
    $form() {
      return ["plane"];
    },
    $geometry() {
      return new (engine().PxPlaneGeometry)();
    },
    $pose() {
      return [this.x, this.y, this.z, ...turns(FACING, turnOf(this))];
    },
  },
  setup(self) {
    self.$fixed = true;
  },
});

// A shape that is a mesh file's: its hull, or its triangles.
export const MeshShape = defineType("MeshShape", CollisionShape, {
  properties: { source: "", geometry: null },
  methods: {
    $waiting() {
      const given = String(this.source ?? "");
      return given !== "" && file(located(given), corners) === null;
    },
    $form(scale) {
      const given = String(this.source ?? "");
      if (!given) return null;
      const url = located(given);
      const mesh = file(url, corners);
      if (!mesh || mesh.error) return null;
      return [this.$kind, url, scale[0], scale[1], scale[2]];
    },
    $geometry(form) {
      const PhysX = engine();
      const [kind, url, x, y, z] = form;
      const made = cook(kind, url, files.get(url));
      if (!made) {
        console.warn(`${kind === "convex" ? "ConvexMeshShape" : "TriangleMeshShape"}: ${url} could not be made a shape of`);
        return null;
      }
      const scale = new PhysX.PxMeshScale(vec(x, y, z), quat([1, 0, 0, 0]));
      const geometry = kind === "convex" ? new PhysX.PxConvexMeshGeometry(made, scale) : new PhysX.PxTriangleMeshGeometry(made, scale);
      PhysX.destroy(scale);
      return geometry;
    },
  },
});

export const ConvexMeshShape = defineType("ConvexMeshShape", MeshShape, {
  setup(self) {
    self.$kind = "convex";
  },
});

export const TriangleMeshShape = defineType("TriangleMeshShape", MeshShape, {
  setup(self) {
    self.$kind = "triangles";
    self.$fixed = true;
  },
});

// A field of heights: a picture whose brightness is how high the ground is,
// from half the field's height below where the shape is to half above it.
// As wide and as deep as its `extents`, which when not given are 100 along
// the longer side of the picture.
export const HeightFieldShape = defineType("HeightFieldShape", CollisionShape, {
  properties: {
    extents: derived((self) => {
      const picture = heights(self);
      if (!picture || picture.width === picture.height) return new Vector3d(100, 100, 100);
      const { width: columns, height: rows } = picture;
      return rows < columns ? new Vector3d(100, 100, (100 * rows) / columns) : new Vector3d((100 * columns) / rows, 100, 100);
    }),
    source: "",
    image: null,
  },
  methods: {
    $waiting() {
      const given = String(this.source ?? "");
      return given !== "" && file(located(given), brightness) === null;
    },
    $form(scale) {
      const picture = heights(this);
      if (!picture || picture.width < 2 || picture.height < 2) return null;
      const { x, y, z } = this.extents;
      return ["field", located(String(this.source)), picture.height, picture.width, x * scale[0], y * scale[1], z * scale[2]];
    },
    $geometry(form) {
      const PhysX = engine();
      const [, url, rows, columns, x, y, z] = form;
      const { values } = files.get(url);
      // Qt reads the picture a column after another, and tells the engine
      // its rows are columns: so does this.
      const samples = new Int16Array(rows * columns);
      for (let i = 0; i < columns; i++) {
        for (let j = 0; j < rows; j++) samples[i * rows + j] = Math.trunc(0xffff * (values[j * columns + i] - 0.5));
      }
      const made = field(url, columns, rows, samples);
      if (!made) return null;
      const none = new PhysX.PxMeshGeometryFlags(0);
      const geometry = new PhysX.PxHeightFieldGeometry(made, none, y / 0x10000, x / (columns - 1), z / (rows - 1));
      PhysX.destroy(none);
      return geometry;
    },
    // Moved so that its middle is where the shape is.
    $pose(scale) {
      const { x, z } = this.extents;
      return [this.x - (x * scale[0]) / 2, this.y, this.z - (z * scale[2]) / 2, ...turnOf(this)];
    },
  },
  setup(self) {
    self.$fixed = true;
  },
});

function heights(self) {
  const given = String(self.source ?? "");
  if (!given) return null;
  const picture = file(located(given), brightness);
  return picture && !picture.error ? picture : null;
}

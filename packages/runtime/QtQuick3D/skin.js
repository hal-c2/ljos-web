// What bends a shape: a Skin, whose joints are nodes anywhere in the scene,
// and the older Skeleton, whose joints are the Joint nodes inside it. Each
// corner of a mesh says which joints it goes with and how much with each
// (`attr_joints`, `attr_weights`), and is moved as they are.
//
// What a joint does to a corner is where the joint is in the scene now,
// after its inverse bind pose: where it was when the mesh was made, undone.
// A shape that is bent is placed by its joints alone: where its own Model is
// does not come into it, as it does not in Qt.
//
// A MorphTarget is how much a Model goes towards one of the other shapes its
// mesh has of itself: the first of a Model's is for the mesh's first, and so
// on. What it says it is of (`attributes`) is kept and changes nothing
// drawn, as it changes nothing in Qt 6.11: a shape goes towards all its mesh
// has for a target.
import { defineType } from "../object.ts";
import * as math from "./math.js";
import { kept, Node, Object3D } from "./Node.js";

const list = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);

// The joints as the renderer takes them: for each, the matrix that moves a
// corner and the one that turns the way it faces, sixteen numbers each, in
// rows of a square as wide as holds them all, which is how Qt lays them out.
function bones(matrices) {
  const width = Math.ceil(Math.sqrt(matrices.length * 8));
  const data = new Float32Array(width * width * 4);
  matrices.forEach((matrix, index) => {
    if (!matrix) return;
    data.set(matrix, index * 32);
    const n = math.normal(matrix);
    data.set([n[0], n[1], n[2], 0, n[3], n[4], n[5], 0, n[6], n[7], n[8]], index * 32 + 16);
  });
  return { data, width, count: matrices.length };
}

export const Skin = defineType("Skin", Object3D, {
  properties: {
    joints: undefined,
    inverseBindPoses: undefined,
  },
  setup(self) {
    // A joint with no pose of its own has none to undo.
    self.$bones = kept(self, () => {
      const poses = list(self.inverseBindPoses);
      const joints = list(self.joints).filter((joint) => joint?.$spatial);
      if (joints.length === 0) return null;
      return bones(joints.map((joint, index) => (poses[index] ? math.multiply(joint.$world(), math.columns(poses[index])) : joint.$world())));
    });
  },
});

export const Joint = defineType("Joint", Node, {
  properties: {
    index: 0,
    skeletonRoot: null,
  },
  setup(self) {
    self.$joint = true;
  },
});

// The joints of a skeleton are the Joint nodes in it, however deep, each at
// the place its `index` says. The poses are the Model's.
export const Skeleton = defineType("Skeleton", Node, {
  methods: {
    $bones(poses) {
      const matrices = [];
      const walk = (node) => {
        if (node.$joint) {
          const index = node.index;
          matrices[index] = poses[index] ? math.multiply(node.$world(), math.columns(poses[index])) : node.$world();
        }
        for (const child of node.children) walk(child);
      };
      for (const child of this.children) walk(child);
      return matrices.length > 0 ? bones(Array.from(matrices, (matrix) => matrix ?? null)) : null;
    },
  },
});

const Position = 1;
const Normal = 2;
const Tangent = 4;
const Binormal = 8;
const TexCoord0 = 16;
const TexCoord1 = 32;
const Color = 64;

export const MorphTarget = defineType("MorphTarget", Object3D, {
  properties: {
    weight: 0,
    attributes: Position,
  },
  enums: { Position, Normal, Tangent, Binormal, TexCoord0, TexCoord1, Color },
});

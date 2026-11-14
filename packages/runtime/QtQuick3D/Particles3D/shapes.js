// Where a particle starts, when it is not where its emitter is: somewhere
// in a shape, or on it. A shape answers in the space of the node that holds
// it, which puts the place where it is itself, turned and scaled as it is.
//
// Not here: ParticleCustomShape3D reads no file, and ParticleSceneShape3D
// does not look at the scene. Both start every particle where the emitter
// is, as Qt's scene shape did too for the one scene it was asked about.
import { onCleanup } from "solid-js";
import { defineType, group, instantiate, QtObject } from "../../object.ts";
import * as math from "../math.js";
import { column, Triangles } from "../mesh.js";
import { kept } from "../Node.js";
import { random, SHAPE, three, vectors } from "./core.js";

const NOTHING = Object.freeze({});
const HERE = Object.freeze([0, 0, 0]);

export const ParticleAbstractShape3D = defineType("ParticleAbstractShape3D", QtObject, {
  methods: {
    $position() {
      return HERE;
    },
  },
});

const Cube = 0;
const Sphere = 1;
const Cylinder = 2;

// A box, a ball or a tube, `extents` from its middle to its sides. With
// `fill` a particle starts anywhere inside; without, on the surface: one of
// the box's six sides, the ball's skin, the tube's wall.
export const ParticleShape3D = defineType("ParticleShape3D", ParticleAbstractShape3D, {
  properties: {
    fill: true,
    type: Cube,
    extents: group({ x: 50, y: 50, z: 50 }),
  },
  enums: { Cube, Sphere, Cylinder },
  methods: {
    $position(seed, index) {
      const extents = three(this.extents);
      const chance = (channel) => random(seed, index, SHAPE + channel);
      let place;
      if (this.type === Sphere) {
        const angle = chance(0) * 2 * Math.PI;
        const height = chance(1) * 2 - 1;
        const round = Math.sqrt(1 - height * height);
        const far = this.fill ? Math.cbrt(chance(2)) : 1;
        place = [round * Math.cos(angle) * far, round * Math.sin(angle) * far, height * far];
      } else if (this.type === Cylinder) {
        const angle = chance(0) * 2 * Math.PI;
        const far = this.fill ? Math.sqrt(chance(2)) : 1;
        place = [Math.cos(angle) * far, chance(1) * 2 - 1, Math.sin(angle) * far];
      } else {
        place = [chance(0) * 2 - 1, chance(1) * 2 - 1, chance(2) * 2 - 1];
        if (!this.fill) {
          const side = Math.floor(chance(3) * 6);
          place[side >> 1] = side & 1 ? 1 : -1;
        }
      }
      return place.map((along, axis) => along * extents[axis]);
    },
  },
  setup: vectors(["extents"]),
});

// The triangles of a mesh and how much of its surface each is, so that a
// place on it can be picked evenly.
function surface(mesh) {
  if (!mesh || mesh.drawMode !== Triangles) return null;
  const corners = column(mesh, "attr_pos", 3);
  if (!corners) return null;
  const count = Math.floor((mesh.indices ? mesh.indices.length : corners.length / 3) / 3);
  const at = (corner) => (mesh.indices ? mesh.indices[corner] : corner) * 3;
  const upTo = new Float64Array(count);
  let whole = 0;
  for (let triangle = 0; triangle < count; triangle++) {
    const a = at(triangle * 3);
    const b = at(triangle * 3 + 1);
    const c = at(triangle * 3 + 2);
    const u = [corners[b] - corners[a], corners[b + 1] - corners[a + 1], corners[b + 2] - corners[a + 2]];
    const v = [corners[c] - corners[a], corners[c + 1] - corners[a + 1], corners[c + 2] - corners[a + 2]];
    whole += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
    upTo[triangle] = whole;
  }
  return count > 0 && whole > 0 ? { corners, at, upTo, whole, count } : null;
}

// The surface of a model, or with `fill` anywhere between it and the
// model's middle. The model is made from `delegate` and is not drawn.
export const ParticleModelShape3D = defineType("ParticleModelShape3D", ParticleAbstractShape3D, {
  properties: {
    fill: true,
    delegate: null,
  },
  methods: {
    $position(seed, index) {
      const model = this.$made();
      const found = model && this.$surface();
      if (!found) return HERE;
      const chance = (channel) => random(seed, index, SHAPE + channel);
      // Which triangle, by how much of the surface comes before it.
      const wanted = chance(0) * found.whole;
      let low = 0;
      let high = found.count - 1;
      while (low < high) {
        const middle = (low + high) >> 1;
        if (found.upTo[middle] < wanted) low = middle + 1;
        else high = middle;
      }
      // And where in it: evenly over the triangle.
      const root = Math.sqrt(chance(1));
      const along = chance(2);
      const weights = [1 - root, root * (1 - along), root * along];
      const place = [0, 0, 0];
      for (let corner = 0; corner < 3; corner++) {
        const from = found.at(low * 3 + corner);
        for (let axis = 0; axis < 3; axis++) place[axis] += found.corners[from + axis] * weights[corner];
      }
      const far = this.fill ? Math.cbrt(chance(3)) : 1;
      return math.point(model.$local(), place[0] * far, place[1] * far, place[2] * far);
    },
  },
  setup(self) {
    self.$made = kept(self, () => {
      const component = self.delegate;
      if (!component?.$component) return null;
      const { object, dispose } = instantiate(component, NOTHING, null, self.$owner);
      onCleanup(dispose);
      return object?.$model ? object : null;
    });
    self.$surface = kept(self, () => surface(self.$made()?.$shape()));
  },
});

export const ParticleCustomShape3D = defineType("ParticleCustomShape3D", ParticleAbstractShape3D, {
  properties: {
    source: "",
    randomizeData: false,
  },
});

export const ParticleSceneShape3D = defineType("ParticleSceneShape3D", ParticleAbstractShape3D, {
  properties: {
    scene: null,
    sceneCenter: group({ x: 0, y: 0, z: 0 }),
    sceneExtents: group({ x: 0, y: 0, z: 0 }),
    shapeResolution: 10,
    excludedNodes: undefined,
    geometry: null,
  },
  setup: vectors(["sceneCenter", "sceneExtents"]),
});

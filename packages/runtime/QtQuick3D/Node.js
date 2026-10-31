// Node: where something is in space, which way it is turned and how big it
// is, all of it in the node it is inside. A node draws nothing: a Model, a
// light and a camera are nodes that do.
//
// What Qt computes for a node is computed here, as Qt does: its own matrix
// from its position, turn, scale and pivot, and the scene's from its
// parent's. A View3D reads those of the nodes inside it to draw them.
//
// Not here: `layers` and `staticFlags` do nothing.
import { runWithOwner } from "solid-js";
import { contents, defineType, derived, group, memo, parental, parented, QtObject, settle, slot } from "../object.js";
import { Vector3d } from "../QtQml/values.js";
import { stateful } from "../QtQuick/states.js";
import * as math from "./math.js";

const LocalSpace = 0;
const ParentSpace = 1;
const SceneSpace = 2;

const AXES = ["x", "y", "z"];

// A value worked out when it is first asked for and again when what it was
// worked out from changed: a node nothing draws works nothing out.
export function kept(self, compute) {
  let read;
  return () => (read ??= runWithOwner(self.$owner, () => memo(compute, {})))();
}

// What is declared inside an object in space is in it: its children are
// those of them that are in space themselves.
// What a node is in that was given no parent: a view's scene, for one
// declared in the view.
const DECLARED = (self) => self.$parent?.$scene ?? self.$parent ?? null;

export const Object3D = defineType("Object3D", QtObject, {
  properties: {
    parent: derived(DECLARED),
    // An object in space has states and the ways between them as an item
    // has: a door of a car is open in one, and swings there.
    ...stateful.properties,
  },
  methods: {
    get children() {
      return inside(this);
    },
    // Adds one made after this one was: `Component.createObject(parent)`.
    $add(child) {
      (this.$extra ??= []).push(child);
      this.$touch((version) => version + 1);
    },
    // Takes one out, whether it was made with this or added later.
    $remove(child) {
      const index = this.$extra?.indexOf(child) ?? -1;
      if (index >= 0) this.$extra.splice(index, 1);
      else if (this.$static?.includes(child)) this.$static = this.$static.filter((other) => other !== child);
      else return;
      this.$touch((version) => version + 1);
    },
  },
  setup(self, props) {
    stateful.setup(self, props);
    parented(self, props, DECLARED);
  },
  adopt(self, props) {
    self.$static = contents(props, self);
  },
});

parental(Object3D);

// `state` reads as the state the object is in, and assigning it enters one.
Object.defineProperties(Object3D.proto, Object.getOwnPropertyDescriptors(stateful.methods));

// The nodes inside one, in order. A child may stand for others that come
// before it (`$siblings`), as a repeater's do.
export function inside(self) {
  self.$track();
  const all = self.$extra ? [...(self.$static ?? []), ...self.$extra] : (self.$static ?? []);
  const nodes = [];
  for (const child of all) {
    if (child.$siblings) nodes.push(...child.$siblings());
    if (child.$spatial) nodes.push(child);
  }
  return nodes;
}

// The turn `rotation` was given, when it was.
function assigned(self) {
  const held = slot(self, "rotation");
  const given = held.explicit() ? held.asked() : null;
  return given ? [given.scalar ?? 1, given.x ?? 0, given.y ?? 0, given.z ?? 0] : null;
}

// Puts a turn that was given as `rotation` into the node's angles, which
// are what it turns by from then on.
function angled(self) {
  const given = assigned(self);
  if (!given) return;
  const angles = math.toEuler(given);
  slot(self, "rotation").reset();
  AXES.forEach((axis, index) => slot(self, `eulerRotation$${axis}`).write(angles[index]));
}

// `scale`, `eulerRotation` and `pivot` are vectors a program reads as one
// (`node.scale.times(2)`) and whose members it binds and animates one by
// one (`eulerRotation.y`): a group that is also a vector.
function vectorGroup(name) {
  const view = Object.create(Vector3d.prototype);
  for (const axis of AXES) {
    const key = `${name}$${axis}`;
    Object.defineProperty(view, axis, {
      get() {
        const given = name === "eulerRotation" ? assigned(this.$self) : null;
        return given ? math.toEuler(given)[AXES.indexOf(axis)] : slot(this.$self, key).get();
      },
      set(value) {
        // An angle assigned is the node's turn again: with the other two
        // as the `rotation` assigned before has them.
        if (name === "eulerRotation") angled(this.$self);
        slot(this.$self, key).set(value);
      },
      enumerable: true,
    });
  }
  return view;
}

const GROUPS = { scale: vectorGroup("scale"), eulerRotation: vectorGroup("eulerRotation"), pivot: vectorGroup("pivot") };

const three = (value) => [Number(value?.x) || 0, Number(value?.y) || 0, Number(value?.z) || 0];

// The turn a node has: what `rotation` was given, else its angles.
function turn(self) {
  const given = assigned(self);
  if (given) return given;
  return math.fromEuler(...AXES.map((axis) => slot(self, `eulerRotation$${axis}`).get()));
}

// The turn of a node in the scene, as a matrix. From the scene's matrix
// when every node above scales the same in each direction, and otherwise
// from the turns one by one, as Qt does.
function sceneTurn(self) {
  let even = true;
  for (let above = self.parent; above?.$spatial; above = above.parent) {
    const { x, y, z } = above.scale;
    if (Math.abs(x - y) > 1e-5 * Math.max(Math.abs(x), Math.abs(y)) || Math.abs(x - z) > 1e-5 * Math.max(Math.abs(x), Math.abs(z))) even = false;
  }
  if (even) return math.unscaled(self.$world());
  const own = math.rotation(turn(self));
  const above = self.parent;
  return above?.$spatial ? math.multiply(sceneTurn(above), own) : own;
}

export const Node = defineType("Node", Object3D, {
  properties: {
    // `position` is `x`, `y` and `z` as one.
    x: derived((self) => slot(self, "position").asked()?.x ?? 0),
    y: derived((self) => slot(self, "position").asked()?.y ?? 0),
    z: derived((self) => slot(self, "position").asked()?.z ?? 0),
    position: undefined,
    rotation: derived((self) => math.quaternion(turn(self))),
    eulerRotation: group({ x: 0, y: 0, z: 0 }),
    scale: group({ x: 1, y: 1, z: 1 }),
    pivot: group({ x: 0, y: 0, z: 0 }),
    opacity: 1,
    visible: true,
    staticFlags: 0,
    layers: 1,
    forward: derived((self) => self.mapDirectionToScene(new Vector3d(0, 0, -1)).normalized()),
    up: derived((self) => self.mapDirectionToScene(new Vector3d(0, 1, 0)).normalized()),
    right: derived((self) => self.mapDirectionToScene(new Vector3d(1, 0, 0)).normalized()),
    scenePosition: derived((self) => math.vector(self.$world().slice(12, 15))),
    sceneRotation: derived((self) => math.quaternion(math.turnOf(sceneTurn(self)))),
    sceneScale: derived((self) => math.vector(math.scaleOf(self.$world()))),
    sceneTransform: derived((self) => math.matrix(self.$world())),
  },
  enums: { LocalSpace, ParentSpace, SceneSpace },
  methods: {
    get position() {
      return new Vector3d(this.x, this.y, this.z);
    },
    set position(value) {
      for (const axis of AXES) slot(this, axis).write(Number(value?.[axis]) || 0);
      settle();
    },
    // Turns the node by so many degrees about an axis: its own, its
    // parent's, or the scene's.
    rotate(degrees, axis, space = LocalSpace) {
      const added = math.rotation(math.fromAxis(axis.x, axis.y, axis.z, degrees));
      const own = math.rotation(turn(this));
      let turned;
      if (space === ParentSpace) turned = math.multiply(added, own);
      else if (space === SceneSpace && this.parent?.$spatial) {
        const above = sceneTurn(this.parent);
        turned = math.multiply(math.multiply(math.multiply(math.inverse(above) ?? math.IDENTITY, added), above), own);
      } else turned = math.multiply(own, added);
      this.rotation = math.quaternion(math.turnOf(turned));
    },
    // What Qt has as slots, which a program may call: each assigns the
    // property it is named for.
    setPosition(value) {
      this.position = value;
    },
    setX(value) {
      this.x = value;
    },
    setY(value) {
      this.y = value;
    },
    setZ(value) {
      this.z = value;
    },
    setRotation(value) {
      this.rotation = value;
    },
    setEulerRotation(value) {
      this.eulerRotation = value;
    },
    setScale(value) {
      this.scale = value;
    },
    setPivot(value) {
      this.pivot = value;
    },
    setLocalOpacity(value) {
      this.opacity = value;
    },
    setVisible(value) {
      this.visible = value;
    },
    setStaticFlags(value) {
      this.staticFlags = value;
    },
    setLayers(value) {
      this.layers = value;
    },
    mapPositionToScene(local) {
      return math.vector(math.point(this.$world(), local.x, local.y, local.z));
    },
    mapPositionFromScene(scene) {
      return math.vector(math.point(math.inverse(this.$world()) ?? math.IDENTITY, scene.x, scene.y, scene.z));
    },
    mapPositionToNode(node, local) {
      const scene = this.mapPositionToScene(local);
      return node ? node.mapPositionFromScene(scene) : scene;
    },
    mapPositionFromNode(node, local) {
      return this.mapPositionFromScene(node ? node.mapPositionToScene(local) : local);
    },
    // A direction keeps its length: where the node is and how big it is
    // do not come into it.
    mapDirectionToScene(local) {
      return math.vector(math.turned(math.normal(this.$world()), local.x, local.y, local.z));
    },
    mapDirectionFromScene(scene) {
      const m = this.$world();
      return new Vector3d(
        m[0] * scene.x + m[1] * scene.y + m[2] * scene.z,
        m[4] * scene.x + m[5] * scene.y + m[6] * scene.z,
        m[8] * scene.x + m[9] * scene.y + m[10] * scene.z,
      );
    },
    mapDirectionToNode(node, local) {
      const scene = this.mapDirectionToScene(local);
      return node ? node.mapDirectionFromScene(scene) : scene;
    },
    mapDirectionFromNode(node, local) {
      return this.mapDirectionFromScene(node ? node.mapDirectionToScene(local) : local);
    },
  },
  setup(self, props) {
    self.$spatial = true;
    for (const [name, view] of Object.entries(GROUPS)) self.$groups[name] = Object.create(view, { $self: { value: self } });
    // `position.x: -3`: a member of the position is the node's `x`.
    for (const axis of AXES) if (`position$${axis}` in props) slot(self, axis).bind(props, `position$${axis}`);
    self.$local = kept(self, () => math.placed([self.x, self.y, self.z], three(self.scale), three(self.pivot), turn(self)));
    self.$world = kept(self, () => {
      const above = self.parent;
      return above?.$spatial ? math.multiply(above.$world(), self.$local()) : self.$local();
    });
  },
});

// Assigning one of the vectors assigns its members, whatever they were
// bound to.
for (const name of Object.keys(GROUPS)) {
  Object.defineProperty(Node.proto, name, {
    ...Object.getOwnPropertyDescriptor(Node.proto, name),
    set(value) {
      if (name === "eulerRotation") slot(this, "rotation").reset();
      for (const axis of AXES) slot(this, `${name}$${axis}`).write(Number(value?.[axis]) || 0);
      settle();
    },
  });
}

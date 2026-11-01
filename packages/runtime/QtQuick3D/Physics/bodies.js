// The bodies of a physics world: what stands still (StaticRigidBody), what
// the world moves (DynamicRigidBody), what only notices who is in it
// (TriggerBody), and what a program walks about (CharacterController).
//
// These say what a body is. A PhysicsWorld finds the bodies inside its
// scene, hands them to the engine and writes back where the engine put
// them: `backend.js` is what is done with each, every frame.
//
// As in Qt, what a program asks of a moving body (`applyCentralImpulse`,
// `reset`) is done when the next frame of the world is over, in the order
// it was asked. How heavy the body is, whether it is kinematic and whether
// gravity pulls it are asked the same way, when the property is given: so a
// body pushed before it was given a mass is pushed as the engine's own, of
// mass 1, which is what one pushed in `Component.onCompleted` is when it
// goes by the world's density.
import { onCleanup } from "solid-js";
import { defineType, derived, effect, inside as within, QtObject, settle, slot } from "../../object.js";
import { Vector3d } from "../../QtQml/values.js";
import * as math from "../math.js";
import { Node } from "../Node.js";
import { untrack } from "#kernel";

// Every body there is, in a world or waiting for one.
export const bodies = new Set();

export const list = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);

export const PhysicsMaterial = defineType("PhysicsMaterial", QtObject, {
  properties: { staticFriction: 0.5, dynamicFriction: 0.5, restitution: 0.5 },
  resolve: {
    staticFriction: (self, own) => Math.max(0, Number(own()) || 0),
    dynamicFriction: (self, own) => Math.max(0, Number(own()) || 0),
    restitution: (self, own) => Math.min(1, Math.max(0, Number(own()) || 0)),
  },
});

export const PhysicsNode = defineType("PhysicsNode", Node, {
  properties: {
    collisionShapes: derived(() => []),
    sendContactReports: false,
    receiveContactReports: false,
    sendTriggerReports: false,
    receiveTriggerReports: false,
    filterGroup: 0,
    filterIgnoreGroups: 0,
  },
  signals: ["bodyContact", "enteredTriggerBody", "exitedTriggerBody"],
  setup(self) {
    // What the body is in the engine, once a world has taken it.
    self.$body = null;
    bodies.add(self);
    onCleanup(() => {
      bodies.delete(self);
      if (self.$body) self.$body.removed = true;
    });
  },
});

export const PhysicsBody = defineType("PhysicsBody", PhysicsNode, {
  properties: { physicsMaterial: null, simulationEnabled: true },
  setup(self, props) {
    if (!("physicsMaterial" in props)) slot(self, "physicsMaterial").provide(within(null, () => PhysicsMaterial({})));
  },
});

export const StaticRigidBody = defineType("StaticRigidBody", PhysicsBody, {
  setup(self) {
    self.$kind = "static";
  },
});

const DefaultDensity = 0;
const CustomDensity = 1;
const Mass = 2;
const MassAndInertiaTensor = 3;
const MassAndInertiaMatrix = 4;

const numbers = (value) => [Number(value?.x) || 0, Number(value?.y) || 0, Number(value?.z) || 0];

// How heavy a body is to be, as what its `massMode` goes by says: a density
// (null for the world's), a mass, or a mass and how hard it is to turn.
export function weight(self) {
  const mass = Math.max(Number(self.mass) || 0, 0);
  switch (self.massMode) {
    case CustomDensity:
      return ["density", self.density];
    case Mass:
      return ["mass", mass];
    case MassAndInertiaTensor: {
      const { scalar, x, y, z } = self.centerOfMassRotation;
      return ["tensor", mass, ...numbers(self.inertiaTensor), ...numbers(self.centerOfMassPosition), scalar, x, y, z];
    }
    case MassAndInertiaMatrix: {
      const given = list(self.inertiaMatrix);
      const nine = Array.from({ length: 9 }, (_, index) => Number(given[index]) || 0);
      return ["matrix", mass, ...nine, ...numbers(self.centerOfMassPosition)];
    }
    default:
      return ["density", null];
  }
}

// What a body's properties ask of the engine, each asked when it is not
// what was asked last.
const ASKED = {
  weigh: weight,
  kinematic: (self) => [Boolean(self.isKinematic)],
  gravity: (self) => [Boolean(self.gravityEnabled)],
};

const asked = (self) => Object.keys(ASKED).map((what) => ASKED[what](self));

function ask(self, all) {
  Object.keys(ASKED).forEach((what, index) => {
    const wanted = all[index];
    const had = self.$asked[what];
    if (wanted.length === had.length && wanted.every((value, at) => value === had[at])) return;
    self.$asked[what] = wanted;
    self.$commands.push([what, ...wanted]);
  });
}

// The turn a kinematic body is to have: `kinematicRotation`, or the angles
// of `kinematicEulerRotation`, whichever was given.
export function kinematicTurn(self) {
  const turn = slot(self, "kinematicRotation");
  if (turn.explicit()) {
    const given = turn.asked();
    return [given?.scalar ?? 1, given?.x ?? 0, given?.y ?? 0, given?.z ?? 0];
  }
  const angles = slot(self, "kinematicEulerRotation");
  return angles.explicit() ? math.fromEuler(...numbers(angles.asked())) : [1, 0, 0, 0];
}

export const DynamicRigidBody = defineType("DynamicRigidBody", PhysicsBody, {
  properties: {
    mass: 1,
    density: 0.001,
    linearAxisLock: 0,
    angularAxisLock: 0,
    isKinematic: false,
    gravityEnabled: true,
    massMode: DefaultDensity,
    inertiaTensor: new Vector3d(0, 0, 0),
    centerOfMassPosition: new Vector3d(0, 0, 0),
    centerOfMassRotation: math.quaternion([1, 0, 0, 0]),
    inertiaMatrix: derived(() => []),
    kinematicPosition: new Vector3d(0, 0, 0),
    // One turn, as a turn and as its angles.
    kinematicRotation: derived((self) => math.quaternion(kinematicTurn(self))),
    kinematicEulerRotation: derived((self) => math.vector(math.toEuler(kinematicTurn(self)))),
    kinematicPivot: new Vector3d(0, 0, 0),
    isSleeping: false,
  },
  resolve: {
    // A mass below nothing is not taken: the body keeps the one it had.
    mass(self, own) {
      const given = Number(own());
      if (given >= 0) self.$mass = given;
      return self.$mass ?? 1;
    },
  },
  enums: {
    DefaultDensity,
    CustomDensity,
    Mass,
    MassAndInertiaTensor,
    MassAndInertiaMatrix,
    LockNone: 0,
    LockX: 1,
    LockY: 2,
    LockZ: 4,
  },
  methods: {
    applyCentralForce(force) {
      this.$commands.push(["force", numbers(force)]);
    },
    applyForce(force, position) {
      this.$commands.push(["forceAt", numbers(force), numbers(position)]);
    },
    applyTorque(torque) {
      this.$commands.push(["torque", numbers(torque)]);
    },
    applyCentralImpulse(impulse) {
      this.$commands.push(["impulse", numbers(impulse)]);
    },
    applyImpulse(impulse, position) {
      this.$commands.push(["impulseAt", numbers(impulse), numbers(position)]);
    },
    applyTorqueImpulse(impulse) {
      this.$commands.push(["torqueImpulse", numbers(impulse)]);
    },
    setLinearVelocity(velocity) {
      this.$commands.push(["linearVelocity", numbers(velocity)]);
    },
    setAngularVelocity(velocity) {
      this.$commands.push(["angularVelocity", numbers(velocity)]);
    },
    // Puts the body somewhere, turned some way, and at rest.
    reset(position, eulerRotation) {
      this.$commands.push(["reset", numbers(position), numbers(eulerRotation)]);
    },
  },
  setup(self) {
    self.$kind = "dynamic";
    self.$commands = [];
    // As a body is when nothing was said of it.
    self.$asked = { weigh: ["density", null], kinematic: [false], gravity: [true] };
    effect(
      () => asked(self),
      (all) => ask(self, all),
    );
  },
});

// Assigned, one of these is asked of the engine there and then: before what
// the program asks next.
for (const name of ["mass", "density", "massMode", "inertiaTensor", "inertiaMatrix", "centerOfMassPosition", "centerOfMassRotation", "isKinematic", "gravityEnabled"]) {
  Object.defineProperty(DynamicRigidBody.proto, name, {
    ...Object.getOwnPropertyDescriptor(DynamicRigidBody.proto, name),
    set(value) {
      // What stands still by itself cannot be the shape of what does not.
      if (name === "isKinematic" && !value && list(this.collisionShapes).some((shape) => shape?.$fixed)) {
        return void console.warn("Cannot make body containing trimesh/heightfield/plane non-kinematic, ignoring.");
      }
      slot(this, name).set(value);
      ask(this, untrack(() => asked(this)));
    },
  });
}

// Given one of the two, the other is no longer what was given.
for (const [name, other] of [
  ["kinematicRotation", "kinematicEulerRotation"],
  ["kinematicEulerRotation", "kinematicRotation"],
]) {
  Object.defineProperty(DynamicRigidBody.proto, name, {
    ...Object.getOwnPropertyDescriptor(DynamicRigidBody.proto, name),
    set(value) {
      slot(this, other).reset();
      slot(this, name).set(value);
    },
  });
}

export const TriggerBody = defineType("TriggerBody", PhysicsNode, {
  properties: { collisionCount: 0 },
  signals: ["bodyEntered", "bodyExited"],
  setup(self) {
    self.$kind = "trigger";
    // The bodies in it.
    self.$inside = new Set();
  },
});

// A body came into a trigger, or left it: the trigger tells of it once for
// each body, however many of its shapes did. A body that is no more while
// it is inside is not told of as leaving and is counted still, as in Qt.
export function entered(trigger, other) {
  if (trigger.$inside.has(other)) return;
  trigger.$inside.add(other);
  slot(trigger, "collisionCount").write(trigger.$inside.size);
  settle();
  trigger.bodyEntered(other);
}

export function left(trigger, other) {
  if (!trigger.$inside.delete(other)) return;
  slot(trigger, "collisionCount").write(trigger.$inside.size);
  settle();
  trigger.bodyExited(other);
}

const None = 0;
const Side = 1;
const Up = 2;
const Down = 4;

export const CharacterController = defineType("CharacterController", PhysicsBody, {
  properties: {
    movement: new Vector3d(0, 0, 0),
    gravity: new Vector3d(0, 0, 0),
    midAirControl: true,
    collisions: None,
    enableShapeHitCallback: false,
  },
  signals: ["shapeHit"],
  enums: { None, Side, Up, Down },
  methods: {
    // Puts the character somewhere, whatever is in the way.
    teleport(position) {
      this.$teleport = numbers(position);
      this.$falling = [0, 0, 0];
    },
    // How far the character is to go in so many seconds: the way it was
    // told to move, and what falling adds while nothing is under it.
    $displacement(seconds) {
      const turned = this.sceneRotation.times(this.movement);
      let moved = [turned.x * seconds, turned.y * seconds, turned.z * seconds];
      const pull = numbers(this.gravity);
      const falling = this.$falling;
      if (pull[0] || pull[1] || pull[2]) {
        const hit = this.collisions;
        const grounded =
          hit !== None &&
          ((pull[1] < 0 && (hit & Down || (hit & Up && falling[1] > 0))) ||
            (pull[1] > 0 && (hit & Up || (hit & Down && falling[1] < 0))) ||
            ((pull[0] !== 0 || pull[2] !== 0) && hit & Side));
        if (!grounded) {
          if (!this.midAirControl) moved = [0, 0, 0];
          for (let axis = 0; axis < 3; axis++) {
            moved[axis] += falling[axis] * seconds;
            falling[axis] += pull[axis] * seconds;
          }
        } else {
          for (let axis = 0; axis < 3; axis++) falling[axis] = moved[axis] / seconds + pull[axis] * seconds;
          if (this.midAirControl) {
            // Only what of it is along the pull: the rest the character
            // steers itself.
            const along = math.normalized(pull);
            const speed = falling[0] * along[0] + falling[1] * along[1] + falling[2] * along[2];
            for (let axis = 0; axis < 3; axis++) falling[axis] = speed * along[axis];
          }
        }
        for (let axis = 0; axis < 3; axis++) moved[axis] += 0.5 * seconds * seconds * pull[axis];
      }
      return moved;
    },
  },
  setup(self) {
    self.$kind = "character";
    self.$teleport = null;
    self.$falling = [0, 0, 0];
  },
});

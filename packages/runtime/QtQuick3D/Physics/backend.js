// What a body is in the engine, and what is done with it when a frame of
// its world is over: its shapes are made again if they are not what they
// were, the engine is told what the body's properties say, and the body is
// put where the engine has it.
//
// This is done by asking, every frame, as Qt asks a shape where it is: a
// world of a few hundred bodies reads a few thousand numbers a frame.
//
// A body is made where its node is in the scene, turned as it is there. A
// static one follows its node from then on, and so does a trigger; a
// moving one's node follows it, in its parent, and only `reset` or the
// `kinematic` properties move it otherwise.
//
// Not here: a body inside a body that moved this frame is placed by where
// its parent was the frame before.
import { slot } from "../../object.ts";
import * as math from "../math.js";
import { kinematicTurn, list, weight } from "./bodies.js";
import { engine, flag, four, pose, sdk, three, vec } from "./engine.js";

const next = (version) => version + 1;
const f = Math.fround;

const turnOf = ({ scalar, x, y, z }) => [scalar, x, y, z];
const vectorOf = ({ x, y, z }) => [Number(x) || 0, Number(y) || 0, Number(z) || 0];

// One turn after another: `b` first.
function turns([aw, ax, ay, az], [bw, bx, by, bz]) {
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}

const same = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
// Numbers that are as good as the same: a scale read off a turned matrix
// is not twice the same to the last place. What is not a number is told
// apart as it is.
const alike = (one, other) => (typeof one === "number" && typeof other === "number" ? Math.abs(one - other) <= 1e-5 * Math.max(1, Math.abs(one), Math.abs(other)) : one === other);
const close = (a, b) => a.length === b.length && a.every((value, index) => alike(value, b[index]));

// Where a node is in the scene and how it is turned there: seven numbers.
function placed(node) {
  const world = node.$world();
  return [world[12], world[13], world[14], ...turnOf(node.sceneRotation)];
}

const posed = (seven) => pose(seven, seven.slice(3));

// Hands a body to the engine. A character is made when it has its one
// capsule; anything else is made now and given its shapes after.
export function begin(sim, body) {
  const { physics, material } = sdk();
  const node = body.node;
  const given = node.physicsMaterial;
  body.material = given ? physics.createMaterial(given.staticFriction, given.dynamicFriction, given.restitution) : material;
  if (node.$kind === "character") return character(sim, body);
  body.at = placed(node);
  body.actor = node.$kind === "static" ? physics.createRigidStatic(posed(body.at)) : physics.createRigidDynamic(posed(body.at));
  sim.actors.set(body.actor.ptr, node);
  sim.scene.addActor(body.actor);
  body.shapes = [];
  body.forms = null;
}

// Takes one back from it.
export function end(sim, body) {
  if (body.controller) {
    sim.actors.delete(body.controller.getActor().ptr);
    sim.characters.delete(body.controller.ptr);
    body.controller.release();
    body.controller = null;
  }
  if (body.actor) {
    sim.actors.delete(body.actor.ptr);
    sim.scene.removeActor(body.actor);
    body.actor.release();
    body.actor = null;
  }
  if (body.material && body.material !== sdk().material) body.material.release();
  body.material = null;
}

// What a frame of the world does with one body: `seconds` is how long the
// frame was.
export function sync(sim, body, seconds) {
  const node = body.node;
  if (node.$kind === "character") return walk(sim, body, seconds);
  const rebuilt = shape(body);
  filter(body);
  if (node.$kind === "static") still(body);
  else if (node.$kind === "trigger") follow(body);
  else move(sim, body, rebuilt);
  const given = node.physicsMaterial;
  if (!given || body.material === sdk().material) return;
  const { staticFriction, dynamicFriction, restitution } = given;
  if (body.material.getStaticFriction() !== f(staticFriction)) body.material.setStaticFriction(staticFriction);
  if (body.material.getDynamicFriction() !== f(dynamicFriction)) body.material.setDynamicFriction(dynamicFriction);
  if (body.material.getRestitution() !== f(restitution)) body.material.setRestitution(restitution);
}

// The scale a shape has in the scene. A shape made for a body's
// `collisionShapes` is inside that body, as Qt puts it there.
function scaleOf(node, shape) {
  if (!shape.$parent) {
    shape.$parent = node;
    shape.$touch(next);
  }
  return math.scaleOf(shape.$parent === node ? math.multiply(node.$world(), shape.$local()) : shape.$world());
}

// Makes the body's shapes again when one of them is something else than it
// was, or somewhere else in the body, or there are more or fewer of them:
// all of them, as Qt does. Whether it did. Other shapes given in the place
// of as many, each where the one before it was, are not seen as a change, in
// Qt or here: the body is the shapes it had until one of the new ones
// changes.
function shape(body) {
  const PhysX = engine();
  const { node, actor } = body;
  const wanted = list(node.collisionShapes).filter((one) => one?.$form);
  const forms = [];
  const poses = [];
  for (const one of wanted) {
    const scale = scaleOf(node, one);
    const form = one.$form(scale);
    forms.push(form);
    poses.push(form ? one.$pose(scale) : null);
  }
  // What each shape was when the body last looked at it.
  const known = (body.known ??= new WeakMap());
  const changed = (one, index) => {
    const pose = poses[index];
    const was = body.poses[index];
    if (pose && was ? !close(pose, was) : pose !== was) return true;
    if (!known.has(one)) return false;
    const form = forms[index];
    const had = known.get(one);
    return form && had ? !close(form, had) : form !== had;
  };
  const dirty = body.forms?.length !== forms.length || wanted.some(changed);
  wanted.forEach((one, index) => known.set(one, forms[index]));
  if (!dirty) return false;
  for (const made of body.shapes) {
    actor.detachShape(made);
    made.release();
  }
  body.shapes = [];
  body.forms = forms;
  body.poses = poses;
  body.filters = [node.filterGroup, node.filterIgnoreGroups];
  // What does not move by itself cannot be the shape of what does.
  body.fixed = wanted.some((one) => one.$fixed);
  if (node.$kind === "dynamic") {
    if (body.fixed && !node.isKinematic) {
      console.warn("Cannot make body containing trimesh/heightfield/plane non-kinematic, forcing kinematic.");
      slot(node, "isKinematic").write(true);
    }
    const on = Boolean(body.fixed || node.isKinematic);
    kinematic(body, on);
    // Only what moves by itself can be swept along its way: what a program
    // moves is looked ahead of instead.
    if (body.world.enableCCD) {
      actor.setRigidBodyFlag(flag("PxRigidBodyFlagEnum", "eENABLE_CCD"), !on);
      actor.setRigidBodyFlag(flag("PxRigidBodyFlagEnum", "eENABLE_SPECULATIVE_CCD"), on);
    }
  }
  const data = new PhysX.PxFilterData(body.filters[0], body.filters[1], 0, 0);
  wanted.forEach((one, index) => {
    const form = forms[index];
    const geometry = form && one.$geometry(form);
    if (!geometry) return;
    const made = sdk().physics.createShape(geometry, body.material, true);
    PhysX.destroy(geometry);
    if (!made || made.ptr === 0) return;
    if (node.$kind === "trigger") {
      made.setFlag(flag("PxShapeFlagEnum", "eSIMULATION_SHAPE"), false);
      made.setFlag(flag("PxShapeFlagEnum", "eTRIGGER_SHAPE"), true);
    }
    made.setSimulationFilterData(data);
    made.setLocalPose(posed(poses[index]));
    actor.attachShape(made);
    body.shapes.push(made);
  });
  PhysX.destroy(data);
  return true;
}

// The groups a body is in and the ones it passes through.
function filter(body) {
  const { filterGroup, filterIgnoreGroups } = body.node;
  if (body.filters[0] === filterGroup && body.filters[1] === filterIgnoreGroups) return;
  const PhysX = engine();
  body.filters = [filterGroup, filterIgnoreGroups];
  const data = new PhysX.PxFilterData(filterGroup, filterIgnoreGroups, 0, 0);
  for (const made of body.shapes) made.setSimulationFilterData(data);
  PhysX.destroy(data);
}

// Whether the engine leaves the body out altogether: true when it has just
// been let in again.
function enable(body) {
  const enabled = Boolean(body.node.simulationEnabled);
  if ((body.enabled ?? true) === enabled) return false;
  body.enabled = enabled;
  body.actor.setActorFlag(flag("PxActorFlagEnum", "eDISABLE_SIMULATION"), !enabled);
  return enabled;
}

function still(body) {
  const at = placed(body.node);
  if (!close(at, body.at)) body.actor.setGlobalPose(posed((body.at = at)));
  enable(body);
}

function follow(body) {
  body.actor.setGlobalPose(posed(placed(body.node)));
}

function kinematic(body, on) {
  if (body.kinematic === on) return;
  body.kinematic = on;
  body.actor.setRigidBodyFlag(flag("PxRigidBodyFlagEnum", "eKINEMATIC"), on);
}

// Puts a node where the engine has its body: in its parent.
function put(body, position, turn) {
  const node = body.node;
  const above = node.parent;
  if (above?.$spatial) {
    position = math.point(math.inverse(above.$world()) ?? math.IDENTITY, ...position);
    const [w, x, y, z] = turnOf(above.sceneRotation);
    turn = turns([w, -x, -y, -z], turn);
  }
  slot(node, "x").write(f(position[0]));
  slot(node, "y").write(f(position[1]));
  slot(node, "z").write(f(position[2]));
  if (body.turn && same(body.turn, turn)) return;
  body.turn = turn;
  slot(node, "rotation").write(math.quaternion(turn));
}

// Makes a body as heavy as it was asked to be.
function weigh(body, [how, amount, ...rest]) {
  const PhysX = engine();
  const actor = body.actor;
  if (body.fixed) return void console.warn("Cannot set mass or density on a body containing trimesh/heightfield/plane, ignoring.");
  if (how === "density") {
    amount ??= body.world.defaultDensity;
    // Qt clamps a density to something above nothing, and when it had to,
    // says so and leaves the body as heavy as it was.
    if (!(amount >= 1e-7)) return void console.warn("Clamping density ", amount);
    PhysX.PxRigidBodyExt.prototype.updateMassAndInertia(actor, amount);
  } else if (how === "mass") {
    PhysX.PxRigidBodyExt.prototype.setMassAndUpdateInertia(actor, amount);
  } else if (how === "tensor") {
    actor.setMass(amount);
    actor.setCMassLocalPose(pose(rest.slice(3, 6), rest.slice(6)));
    actor.setMassSpaceInertiaTensor(vec(rest[0], rest[1], rest[2]));
  } else {
    const [along, frame] = diagonal(rest.slice(0, 9));
    if (along.some((value) => !(value > 0))) return;
    actor.setCMassLocalPose(pose(rest.slice(9), frame));
    actor.setMass(amount);
    actor.setMassSpaceInertiaTensor(vec(along[0], along[1], along[2]));
  }
}

// The three directions a body turns about by itself, and how hard it is to
// turn about each: the engine's own way of finding them (`PxDiagonalize`),
// which its build for a browser leaves out. `m` is nine numbers, and
// `[three numbers, the turn the directions are]` comes back.
function diagonal(m) {
  let q = [1, 0, 0, 0];
  // `d[i][j]`: column `i`, row `j`.
  let d = [m.slice(0, 3), m.slice(3, 6), m.slice(6, 9)];
  for (let round = 0; round < 24; round++) {
    const turn = math.rotation(q);
    const axes = [turn.slice(0, 3), turn.slice(4, 7), turn.slice(8, 11)];
    // The matrix as the directions found so far see it.
    d = [0, 1, 2].map((i) =>
      [0, 1, 2].map((j) => {
        let sum = 0;
        for (let k = 0; k < 3; k++) for (let l = 0; l < 3; l++) sum += axes[j][k] * m[l * 3 + k] * axes[i][l];
        return sum;
      }),
    );
    // About the direction the largest number off the diagonal is across.
    const [d0, d1, d2] = [Math.abs(d[1][2]), Math.abs(d[0][2]), Math.abs(d[0][1])];
    const axis = d0 > d1 && d0 > d2 ? 0 : d1 > d2 ? 1 : 2;
    const a1 = (axis + 1) % 3;
    const a2 = (a1 + 1) % 3;
    if (d[a1][a2] === 0 || Math.abs(d[a1][a1] - d[a2][a2]) > 2e6 * Math.abs(2 * d[a1][a2])) break;
    const w = (d[a1][a1] - d[a2][a2]) / (2 * d[a1][a2]);
    const r = [1, 0, 0, 0];
    if (Math.abs(w) > 1000) r[axis + 1] = 1 / (4 * w);
    else {
      const t = 1 / (Math.abs(w) + Math.sqrt(w * w + 1));
      const h = 1 / Math.sqrt(t * t + 1);
      r[axis + 1] = Math.sqrt((1 - h) / 2) * Math.sign(w);
      r[0] = Math.sqrt((1 + h) / 2);
    }
    q = turns(q, r);
    const length = Math.hypot(...q);
    q = q.map((value) => value / length);
  }
  return [[d[0][0], d[1][1], d[2][2]], q];
}

// What a program asked of a body, done.
function run(body, [what, a, b, ...rest]) {
  const PhysX = engine();
  const actor = body.actor;
  const impulse = flag("PxForceModeEnum", "eIMPULSE");
  const pushed = () => !actor.getRigidBodyFlags().isSet(flag("PxRigidBodyFlagEnum", "eKINEMATIC"));
  switch (what) {
    case "weigh":
      weigh(body, [a, b, ...rest]);
      break;
    case "kinematic":
      if (body.fixed && !a) console.warn("Cannot make a body containing trimesh/heightfield/plane non-kinematic, ignoring.");
      else kinematic(body, a);
      break;
    case "gravity":
      actor.setActorFlag(flag("PxActorFlagEnum", "eDISABLE_GRAVITY"), !a);
      break;
    case "force":
      if (pushed()) actor.addForce(vec(...a));
      break;
    case "forceAt":
      if (pushed()) PhysX.PxRigidBodyExt.prototype.addForceAtPos(actor, vec(...a), vec(...b, 1));
      break;
    case "torque":
      if (pushed()) actor.addTorque(vec(...a));
      break;
    case "impulse":
      if (pushed()) actor.addForce(vec(...a), impulse);
      break;
    case "impulseAt":
      if (pushed()) PhysX.PxRigidBodyExt.prototype.addForceAtPos(actor, vec(...a), vec(...b, 1), impulse);
      break;
    case "torqueImpulse":
      if (pushed()) actor.addTorque(vec(...a), impulse);
      break;
    case "linearVelocity":
      actor.setLinearVelocity(vec(...a));
      break;
    case "angularVelocity":
      actor.setAngularVelocity(vec(...a));
      break;
    case "reset": {
      actor.setLinearVelocity(vec(0, 0, 0));
      actor.setAngularVelocity(vec(0, 0, 0));
      // The position is in the body's parent; the turn is taken as it is.
      const above = body.node.parent;
      const at = above?.$spatial ? math.point(above.$world(), ...a) : a;
      actor.setGlobalPose(pose(at, math.fromEuler(...b)));
      break;
    }
  }
}

// The matrix a kinematic body is to have in the scene: its own from its
// `kinematic` properties, and those above it from theirs.
function target(node) {
  let own;
  if (node.$kind === "dynamic") {
    if (!node.isKinematic) console.warn("Non-kinematic body as a parent of a kinematic body is unsupported");
    own = math.placed(vectorOf(node.kinematicPosition), vectorOf(node.scale), vectorOf(node.kinematicPivot), kinematicTurn(node));
  } else own = node.$local();
  const above = node.parent;
  return above?.$spatial ? math.multiply(target(above), own) : own;
}

function move(sim, body, rebuilt) {
  const PhysX = engine();
  const { node, actor } = body;
  const now = actor.getGlobalPose();
  put(body, three(now.p), four(now.q));

  // The world's density, when it is another, is asked of what goes by it;
  // and shapes made again are weighed again, after all that was asked.
  const usual = body.world.defaultDensity;
  if (body.usual !== undefined && body.usual !== usual && node.massMode === 0) node.$commands.push(["weigh", "density", null]);
  body.usual = usual;
  if (rebuilt && !body.fixed) node.$commands.push(["weigh", ...weight(node)]);
  const asked = node.$commands;
  if (asked.length) {
    node.$commands = [];
    for (const command of asked) run(body, command);
  }

  if (body.kinematic) {
    const matrix = target(node);
    actor.setKinematicTarget(pose(matrix.slice(12, 15), math.turnOf(math.unscaled(matrix))));
  } else {
    const { linearAxisLock: linear, angularAxisLock: angular } = node;
    const lock = (name) => flag("PxRigidDynamicLockFlagEnum", name);
    const locks =
      (angular & 1 ? lock("eLOCK_ANGULAR_X") : 0) |
      (angular & 2 ? lock("eLOCK_ANGULAR_Y") : 0) |
      (angular & 4 ? lock("eLOCK_ANGULAR_Z") : 0) |
      (linear & 1 ? lock("eLOCK_LINEAR_X") : 0) |
      (linear & 2 ? lock("eLOCK_LINEAR_Y") : 0) |
      (linear & 4 ? lock("eLOCK_LINEAR_Z") : 0);
    if (body.locks !== locks) {
      const held = new PhysX.PxRigidDynamicLockFlags(locks);
      actor.setRigidDynamicLockFlags(held);
      PhysX.destroy(held);
      body.locks = locks;
    }
  }
  if (enable(body) && !body.kinematic) actor.wakeUp();
  slot(node, "isSleeping").write(actor.isSleeping());
}

const CAPSULE = "CharacterController: collision shape is not a capsule.";
const ONE = "CharacterController: invalid collision shapes list.";

// The one capsule a character is, or null with why said.
function capsule(node) {
  const shapes = list(node.collisionShapes);
  if (shapes.length !== 1) return void console.warn(ONE);
  if (shapes[0]?.$type?.typeName !== "CapsuleShape") return void console.warn(CAPSULE);
  return shapes[0];
}

function character(sim, body) {
  const PhysX = engine();
  const node = body.node;
  const shape = capsule(node);
  if (!shape) return;
  const [radiusScale, heightScale] = math.scaleOf(node.$world());
  const desc = new PhysX.PxCapsuleControllerDesc();
  desc.radius = 0.5 * radiusScale * shape.diameter;
  desc.height = heightScale * shape.height;
  desc.stepOffset = 0.25 * desc.height;
  desc.material = body.material;
  desc.reportCallback = sim.hits;
  const at = node.$world();
  const where = new PhysX.PxExtendedVec3(at[12], at[13], at[14]);
  desc.position = where;
  const made = sim.controllers.createController(desc);
  PhysX.destroy(where);
  PhysX.destroy(desc);
  if (!made || made.ptr === 0) return void console.warn("QtQuick3DPhysics internal error: could not create controller.");
  body.controller = PhysX.castObject(made, PhysX.PxCapsuleController);
  sim.actors.set(body.controller.getActor().ptr, node);
  sim.characters.set(body.controller.ptr, node);
}

// A character's frame: it is put where the engine has it, and then moved
// on by what it is told to move by, or put where it was told to be.
function walk(sim, body, seconds) {
  const PhysX = engine();
  const { node, controller } = body;
  if (!controller) return;
  const shapes = list(node.collisionShapes);
  if (shapes.length !== 1) console.warn(ONE);
  else if (shapes[0]?.$type?.typeName !== "CapsuleShape") console.warn(CAPSULE);
  else {
    const [radiusScale, heightScale] = math.scaleOf(node.$world());
    const height = f(heightScale * shapes[0].height);
    if (!close([controller.getHeight()], [height])) controller.resize(height);
    const radius = f(0.5 * radiusScale * shapes[0].diameter);
    if (!close([controller.getRadius()], [radius])) controller.setRadius(radius);
    const step = f(0.25 * height);
    if (!close([controller.getStepOffset()], [step])) controller.setStepOffset(step);
  }
  const now = controller.getPosition();
  let position = [now.x, now.y, now.z];
  const above = node.parent;
  if (above?.$spatial) position = math.point(math.inverse(above.$world()) ?? math.IDENTITY, ...position);
  slot(node, "x").write(f(position[0]));
  slot(node, "y").write(f(position[1]));
  slot(node, "z").write(f(position[2]));

  const to = node.$teleport;
  if (to) {
    node.$teleport = null;
    const where = new PhysX.PxExtendedVec3(to[0], to[1], to[2]);
    controller.setPosition(where);
    PhysX.destroy(where);
  } else if (seconds > 0) {
    const moved = node.$displacement(seconds);
    const filters = (sim.filters ??= new PhysX.PxControllerFilters());
    const hit = controller.move(vec(...moved), Math.hypot(...moved) / 100, seconds, filters);
    const flags = ["eCOLLISION_SIDES", "eCOLLISION_UP", "eCOLLISION_DOWN"];
    let collisions = 0;
    for (const name of flags) if (hit.isSet(flag("PxControllerCollisionFlagEnum", name))) collisions |= flag("PxControllerCollisionFlagEnum", name);
    slot(node, "collisions").write(collisions);
  }
}

// PhysicsWorld: what moves the bodies inside its `scene`.
//
// A world steps as Qt's does. Each frame of the page it takes what the step
// before came to, puts the bodies where that left them and tells of it
// (`frameDone`), then starts a step as long as the time since the last one:
// none when that is less than `minimumTimestep`, and never more than
// `maximumTimestep`. The first step of all is `minimumTimestep` long and
// has nothing in it: bodies are handed to the engine when a step is over,
// those made later too.
//
// The engine is fetched when the first world is made (`engine.js`). Until
// it is here nothing moves and nothing is told; the world starts when it
// is. It waits likewise for a file one of its bodies' shapes is, which Qt
// reads there and then: a table that is a mesh is under the dice when they
// begin to fall.
//
// What touches what is told when the step is over (`bodyContact`); what
// came into a trigger or left it, as soon as the engine has found it.
//
// Not here: `forceDebugDraw` and `viewport`, which are kept and draw
// nothing; `numThreads`, which is kept, the engine having one thread. A
// world that was stopped steps by `maximumTimestep` when it runs again,
// however short the stop.
import { onCleanup } from "solid-js";
import { defineType, effect, QtObject, settle, slot } from "../../object.js";
import { Vector3d } from "../../QtQml/values.js";
import { clock } from "../../QtQuick/animation/clock.js";
import * as math from "../math.js";
import { begin, end, sync } from "./backend.js";
import { bodies, entered, left, list } from "./bodies.js";
import { engine, flag, load, sdk, three, top, vec } from "./engine.js";
import { untrack } from "#kernel";

// The worlds there are.
const worlds = new Set();

const pair = (name) => flag("PxPairFlagEnum", name);

// What the engine is told of two shapes that may touch: nothing, when one
// is in a group the other passes through, and otherwise to keep them apart
// and say when they meet. A world that looks for what moves too fast to be
// seen touching (`enableCCD`) does not look at the groups, as Qt's does not.
function shader(PhysX, ccd) {
  const made = new PhysX.PassThroughFilterShaderImpl();
  let told = pair("eSOLVE_CONTACT") | pair("eDETECT_DISCRETE_CONTACT") | pair("eNOTIFY_TOUCH_FOUND") | pair("eNOTIFY_TOUCH_LOST") | pair("eNOTIFY_CONTACT_POINTS");
  if (ccd) told |= pair("eDETECT_CCD_CONTACT");
  const suppress = flag("PxFilterFlagEnum", "eSUPPRESS");
  made.filterShader = (attributes0, group0, ignored0, w02, w03, attributes1, group1, ignored1) => {
    if (!ccd && group0 < 32 && group1 < 32 && ((ignored0 >>> group1) & 1 || (ignored1 >>> group0) & 1)) return suppress;
    made.outputPairFlags = told;
    return 0;
  };
  return made;
}

// What the engine calls when two bodies meet, and when one comes into a
// trigger or leaves it.
function listener(PhysX, sim) {
  const made = new PhysX.PxSimulationEventCallbackImpl();
  const helper = PhysX.NativeArrayHelpers.prototype;
  const found = pair("eNOTIFY_TOUCH_FOUND");
  const lost = pair("eNOTIFY_TOUCH_LOST");
  const points = new PhysX.PxArray_PxContactPairPoint(64);
  made.onConstraintBreak = made.onWake = made.onSleep = () => {};
  made.onContact = (headerAt, pairsAt, count) => {
    const header = PhysX.wrapPointer(headerAt, PhysX.PxContactPairHeader);
    const pairs = PhysX.wrapPointer(pairsAt, PhysX.PxContactPair);
    for (let index = 0; index < count; index++) {
      const one = helper.getContactPairAt(pairs, index);
      if (!one.events.isSet(found)) continue;
      const first = sim.actors.get(header.get_actors(0).ptr);
      const second = sim.actors.get(header.get_actors(1).ptr);
      if (!first || !second || first.$body?.removed || second.$body?.removed) continue;
      const firstHears = untrack(() => first.receiveContactReports && second.sendContactReports);
      const secondHears = untrack(() => second.receiveContactReports && first.sendContactReports);
      if (!firstHears && !secondHears) continue;
      const positions = [];
      const impulses = [];
      const normals = [];
      const turned = [];
      const length = one.extractContacts(points.begin(), 64);
      for (let at = 0; at < length; at++) {
        const point = points.get(at);
        positions.push(math.vector(three(point.position)));
        impulses.push(math.vector(three(point.impulse)));
        const normal = three(point.normal);
        normals.push(math.vector(normal));
        turned.push(new Vector3d(-normal[0], -normal[1], -normal[2]));
      }
      if (firstHears) sim.contacts.push([second, first, positions, impulses, normals]);
      if (secondHears) sim.contacts.push([first, second, positions, impulses, turned]);
    }
  };
  made.onTrigger = (pairsAt, count) => {
    const pairs = PhysX.wrapPointer(pairsAt, PhysX.PxTriggerPair);
    const gone = [flag("PxTriggerPairFlagEnum", "eREMOVED_SHAPE_TRIGGER"), flag("PxTriggerPairFlagEnum", "eREMOVED_SHAPE_OTHER")];
    // Whether they met or parted is read of the first of them, for all of
    // them: Qt reads it so.
    const status = count > 0 ? helper.getTriggerPairAt(pairs, 0).status : 0;
    for (let index = 0; index < count; index++) {
      const one = helper.getTriggerPairAt(pairs, index);
      if (gone.some((removed) => one.flags.isSet(removed))) continue;
      const trigger = sim.actors.get(one.triggerActor.ptr);
      const other = sim.actors.get(one.otherActor.ptr);
      if (!trigger || !other || trigger.$body?.removed || other.$body?.removed) continue;
      sim.triggers.push([status === found ? "found" : status === lost ? "lost" : "", trigger, other]);
    }
  };
  return made;
}

// A character's own: what it walked into.
function hits(PhysX, sim) {
  const made = new PhysX.PxUserControllerHitReportImpl();
  made.onControllerHit = made.onObstacleHit = () => {};
  made.onShapeHit = (hitAt) => {
    const hit = PhysX.wrapPointer(hitAt, PhysX.PxControllerShapeHit);
    const other = sim.actors.get(hit.actor.ptr);
    const character = sim.characters.get(hit.controller.ptr);
    if (!other || !character || !untrack(() => character.enableShapeHitCallback)) return;
    const { worldPos: at, dir, length } = hit;
    sim.hit.push([character, other, new Vector3d(at.x, at.y, at.z), new Vector3d(dir.x * length, dir.y * length, dir.z * length), math.vector(three(hit.worldNormal))]);
  };
  return made;
}

// Makes the world in the engine.
function make(self) {
  const PhysX = engine();
  const { physics, dispatcher } = sdk(self.typicalLength, self.typicalSpeed);
  const ccd = Boolean(self.enableCCD);
  const sim = {
    // The nodes of this world's bodies, and by what the engine calls each.
    bodies: new Set(),
    actors: new Map(),
    characters: new Map(),
    // What the engine told of during a step, to tell of after it.
    contacts: [],
    triggers: [],
    hit: [],
    // Whether a step is under way, how long it is, and the time since it
    // was started.
    stepping: false,
    step: 0,
    waited: 0,
    ccd,
    length: self.typicalLength,
    speed: self.typicalSpeed,
  };
  const desc = new PhysX.PxSceneDesc(physics.getTolerancesScale());
  const { x, y, z } = self.gravity;
  desc.gravity = vec(x, y, z);
  desc.cpuDispatcher = dispatcher;
  desc.solverType = flag("PxSolverTypeEnum", "eTGS");
  desc.simulationEventCallback = listener(PhysX, sim);
  if (ccd) desc.flags.raise(flag("PxSceneFlagEnum", "eENABLE_CCD"));
  const keep = flag("PxPairFilteringModeEnum", "eKEEP");
  if (self.reportKinematicKinematicCollisions) desc.kineKineFilteringMode = keep;
  if (self.reportStaticKinematicCollisions) desc.staticKineFilteringMode = keep;
  top().setupPassThroughFilterShader(desc, shader(PhysX, ccd));
  sim.scene = physics.createScene(desc);
  PhysX.destroy(desc);
  sim.controllers = top().CreateControllerManager(sim.scene);
  sim.hits = hits(PhysX, sim);
  return sim;
}

// Whether a node is inside the world's scene.
function within(self, node) {
  const scene = self.scene;
  if (!scene) return false;
  for (let above = node; above; above = above.parent) if (above === scene) return true;
  return false;
}

// Whether a shape of one of the world's bodies is a file not here yet.
function waiting(self) {
  for (const node of bodies) {
    if (node.$body ? node.$body.world !== self : !within(self, node)) continue;
    if (list(node.collisionShapes).some((shape) => shape?.$waiting?.())) return true;
  }
  return false;
}

// What is done when a step is over.
function finished(self, seconds) {
  const sim = self.$sim;
  // Bodies no world has, that are in this one's scene.
  const fresh = [];
  for (const node of bodies) {
    if (node.$body || !within(self, node)) continue;
    node.$body = { world: self, node, removed: false };
    fresh.push(node.$body);
  }
  for (const [sender, receiver, positions, impulses, normals] of sim.contacts.splice(0)) {
    if (sender.$body?.removed || receiver.$body?.removed) continue;
    receiver.bodyContact(sender, positions, impulses, normals);
  }
  for (const body of [...sim.bodies]) {
    if (!body.removed) continue;
    sim.bodies.delete(body);
    end(sim, body);
    if (body.node.$body === body) body.node.$body = null;
  }
  for (const body of fresh) {
    begin(sim, body);
    sim.bodies.add(body);
  }
  for (const body of sim.bodies) sync(sim, body, seconds);
  settle();
  for (const [character, ...told] of sim.hit.splice(0)) character.shapeHit(...told);
  self.frameDone(seconds * 1000);
}

// What a trigger found during a step, told now the step is over.
function triggered(sim) {
  for (const [what, trigger, other] of sim.triggers.splice(0)) {
    if (trigger.$body?.removed || other.$body?.removed) continue;
    if (what === "found") {
      if (other.sendTriggerReports) entered(trigger, other);
      if (other.receiveTriggerReports) other.enteredTriggerBody(trigger);
    } else if (what === "lost") {
      if (other.sendTriggerReports) left(trigger, other);
      if (other.receiveTriggerReports) other.exitedTriggerBody(trigger);
    }
  }
}

// A frame of the page.
function frame(self, delta) {
  const sim = self.$sim;
  if (!sim || waiting(self)) return;
  const { minimumTimestep, maximumTimestep } = self;
  if (!sim.begun) {
    sim.begun = true;
    sim.waited = 0;
    sim.step = minimumTimestep * 0.001;
    sim.scene.simulate(sim.step);
    sim.stepping = true;
    return;
  }
  if (sim.stepping) {
    sim.scene.fetchResults(true);
    sim.stepping = false;
    triggered(sim);
    finished(self, sim.step);
  }
  sim.waited += delta;
  if (sim.waited < minimumTimestep) return;
  sim.step = Math.min(sim.waited, maximumTimestep) * 0.001;
  sim.waited = 0;
  sim.scene.simulate(sim.step);
  sim.stepping = true;
}

// Lets go of every body the world has: they are no world's until one
// finds them in its scene.
function release(self) {
  const sim = self.$sim;
  if (!sim) return;
  for (const body of sim.bodies) {
    end(sim, body);
    if (body.node.$body === body) body.node.$body = null;
  }
  sim.bodies.clear();
}

export const PhysicsWorld = defineType("PhysicsWorld", QtObject, {
  properties: {
    gravity: new Vector3d(0, -981, 0),
    running: true,
    forceDebugDraw: false,
    enableCCD: false,
    typicalLength: 100,
    typicalSpeed: 1000,
    defaultDensity: 0.001,
    viewport: null,
    minimumTimestep: 1,
    maximumTimestep: 33.333,
    scene: null,
    numThreads: -1,
    reportKinematicKinematicCollisions: false,
    reportStaticKinematicCollisions: false,
  },
  resolve: {
    maximumTimestep: (self, own) => Math.max(0, Number(own()) || 0),
    minimumTimestep: (self, own) => Math.min(Math.max(0, Number(own()) || 0), self.maximumTimestep),
  },
  signals: ["frameDone"],
  setup(self) {
    // The world in the engine, once the engine is here and the world runs.
    self.$sim = null;
    let over = false;
    const job = { advance: (delta) => untrack(() => frame(self, delta)), idle: () => 0 };
    worlds.add(self);
    onCleanup(() => {
      over = true;
      worlds.delete(self);
      clock.remove(job);
      const sim = self.$sim;
      if (!sim) return;
      if (sim.stepping) sim.scene.fetchResults(true);
      release(self);
      sim.controllers.release();
      sim.scene.release();
      self.$sim = null;
    });

    effect(
      () => Boolean(self.running),
      (running) => {
        if (!running) return void clock.remove(job);
        if (self.$sim) {
          self.$sim.waited = untrack(() => self.maximumTimestep);
          return void clock.add(job);
        }
        load().then(() => {
          if (over || self.$sim || !untrack(() => self.running)) return;
          self.$sim = untrack(() => make(self));
          clock.add(job);
        });
      },
    );
    effect(
      () => self.gravity,
      ({ x, y, z }) => self.$sim?.scene.setGravity(vec(x, y, z)),
    );
    // Another scene has other bodies in it.
    let had;
    effect(
      () => self.scene,
      (scene) => {
        if (scene === had) return;
        had = scene;
        for (const other of worlds) {
          if (other !== self && scene && untrack(() => other.scene) === scene) console.warn("Warning: scene already associated with physics world");
        }
        release(self);
      },
    );
    for (const [name, held] of [
      ["enableCCD", "ccd"],
      ["typicalLength", "length"],
      ["typicalSpeed", "speed"],
    ]) {
      effect(
        () => self[name],
        (value) => {
          if (self.$sim && self.$sim[held] !== value) console.warn(`Warning: Changing '${name}' after physics is initialized will have no effect`);
        },
      );
    }
    effect(
      () => [Number(slot(self, "minimumTimestep").asked()), Number(slot(self, "maximumTimestep").asked())],
      ([least, most]) => {
        if (most < 0) console.warn("Maximum timestep less than zero, value clamped");
        if (least < 0) console.warn("Minimum timestep less than zero, value clamped");
        else if (least > Math.max(0, most)) console.warn("Minimum timestep greater than maximum timestep, value clamped");
      },
    );
  },
});

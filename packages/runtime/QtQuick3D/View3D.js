// View3D: the item a scene in space is seen in. The nodes declared inside
// it are the scene, a camera among them is what it is seen through, and the
// items declared inside it lie over the picture as in any item.
//
// What is under a place in the view, or along a ray through the scene, is
// found among the models that are for picking (`pick.js`). As in Qt one
// that is not shown is found too, where its shape is one that something
// shown is drawn with, and one that bends by a skin is found where it is
// unbent. Qt answers by the picture it last drew; here it is by the scene
// as it is.
//
// Not here: picking among one model or a list of them, in a rectangle, or
// nearest a place, and the items in a scene, of which none is picked; the
// picture is drawn in the item whatever `renderMode` says, and of the ways
// of smoothing edges there is one.
import { defineType, effect, inside as within, QtObject, settle, slot } from "../object.js";
import { Vector2d, Vector3d } from "../QtQml/values.js";
import { lazy } from "../QtQuick/compute.js";
import { Item } from "../QtQuick/Item.js";
import * as math from "./math.js";
import { inside, Node } from "./Node.js";
import { met } from "./pick.js";
import { draw } from "./render.js";
import { SceneEnvironment } from "./scene.js";
import { signal, untrack } from "#kernel";

const sheet = new CSSStyleSheet();
sheet.replaceSync(`.qq-view3d { position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; }`);
document.adoptedStyleSheets.push(sheet);

// What a node gives the view that draws it, and what each node inside it
// gives: nothing where it is not shown. The node keeps it, and it is worked
// out again only when something of the node changed or of one inside it, so
// a view follows the few nodes at the top of its scene and not each property
// of every node in it. How much is seen through what the node is inside of
// is not in it: a node inside one that fades is what it was.
function given(node) {
  node.$given ??= lazy(node, () => {
    if (!node.visible) return null;
    let model = null;
    let light = null;
    let probe = null;
    let camera = false;
    if (node.$model) {
      const shape = node.$shape();
      if (shape) {
        model = {
          node,
          shape,
          world: node.$world(),
          bones: node.$bones(),
          weights: node.$weights(),
          bias: Number(node.depthBias) || 0,
          instances: node.$instances(),
          materials: node.$materials().map(drawnWith),
          mirrors: Boolean(node.receivesReflections),
          mirrored: Boolean(node.castsReflections),
        };
      }
    } else if (node.$light) light = node.$light();
    else if (node.$mirror) probe = node.$mirror();
    else if (node.$camera) camera = true;
    return { node, opacity: node.opacity, model, light, probe, camera, inside: inside(node).map(given) };
  });
  return node.$given() ?? null;
}

// What a material has a shape drawn with, which the material keeps: many
// shapes are drawn with one, and each of them is told when it changes and
// not of each thing the material was worked out from.
function drawnWith(material) {
  if (!material?.$material) return null;
  material.$drawn ??= lazy(material, () => material.$material());
  return material.$drawn() ?? null;
}

// What a view draws: the shapes and lights among the nodes that are shown,
// the places some of the shapes mirror the others from, and the first
// camera there is.
function found(self) {
  const models = [];
  const lights = [];
  const paints = [];
  const probes = [];
  let camera = null;
  const walk = (part, above) => {
    if (!part) return;
    const { node } = part;
    const opacity = above * part.opacity;
    if (part.model) models.push({ ...part.model, opacity });
    else if (part.light) lights.push(part.light);
    else if (part.probe) probes.push(part.probe);
    else if (part.camera) camera ??= node;
    // What a node draws by itself.
    const paint = node.$paint?.(opacity);
    if (paint) paints.push(paint);
    for (const child of part.inside) walk(child, opacity);
  };
  const tops = inside(self.$scene).map(given);
  if (self.importScene?.$spatial) tops.push(given(self.importScene));
  for (const top of tops) walk(top, 1);
  // A light that is for a node lights what is that node or inside it: a
  // model has the lights that are for everything and those that are for it.
  if (lights.some((light) => light.scope)) {
    const scopes = new Set(lights.map((light) => light.scope));
    const under = [];
    let index = 0;
    const lit = (part) => {
      if (!part) return;
      const scope = scopes.has(part.node);
      if (scope) under.push(part.node);
      if (part.model) models[index++].lights = lights.filter((light) => !light.scope || under.includes(light.scope));
      for (const child of part.inside) lit(child);
      if (scope) under.pop();
    };
    for (const top of tops) lit(top);
  }
  return { models, lights, paints, probes, camera };
}

// The models a ray is tried against: those for picking, shown or not, of
// a shape that something shown is drawn with. A shape's triangles are what
// is met where a model that is for picking, or is inside one that is, is
// shown with it and not shown through wholly.
function pickable(self) {
  const drawn = new Set();
  const exact = new Set();
  for (const { node, shape, opacity } of found(self).models) {
    drawn.add(shape);
    if (opacity > 0.01 && forPicking(node)) exact.add(shape);
  }
  const models = [];
  const walk = (node) => {
    const shape = node.$model && node.pickable ? node.$shape() : null;
    if (shape && drawn.has(shape)) models.push({ node, shape, exact: exact.has(shape), placed: node.$world(), instances: node.$instances() });
    for (const child of inside(node)) walk(child);
  };
  for (const node of inside(self.$scene)) walk(node);
  if (self.importScene?.$spatial) walk(self.importScene);
  return models;
}

function forPicking(node) {
  for (let at = node; at; at = at.parent) if (at.pickable) return true;
  return false;
}

// The ray a place in the view is seen along, or null where the place is
// not in the view. A camera with no depth sees along its own way from
// across and up of where it is; any other from where it is.
function through(self, x, y) {
  const camera = self.$seeing();
  const { width, height } = self;
  const up = height - y;
  if (!camera || !(x >= 0 && x < width && up >= 0 && up < height)) return null;
  const projection = camera.$projection(width, height);
  const across = (x / (width / 2) - 1) / projection[0];
  const rise = (up / (height / 2) - 1) / projection[5];
  const world = camera.$world();
  const flat = Boolean(camera.$flat);
  return {
    origin: flat ? math.point(world, across, rise, 0) : math.point(world, 0, 0, 0),
    direction: math.normalized(math.turned(math.normal(world), flat ? 0 : across, flat ? 0 : rise, -1)),
  };
}

const three = (value) => [Number(value?.x) || 0, Number(value?.y) || 0, Number(value?.z) || 0];

// Everything a ray meets, the nearest first: nothing where there is no ray.
function along(self, ray) {
  return ray ? untrack(() => met(pickable(self), ray.origin, ray.direction)) : [];
}

const NOWHERE = () => new Vector3d(0, 0, 0);

// What is told of a place a ray met, or of its having met nothing.
function told(hit) {
  if (!hit) return { objectHit: null, itemHit: null, distance: 0, instanceIndex: -1, hitType: 0, uvPosition: new Vector2d(0, 0), scenePosition: NOWHERE(), position: NOWHERE(), normal: NOWHERE(), sceneNormal: NOWHERE() };
  return {
    objectHit: hit.node,
    itemHit: null,
    distance: Math.sqrt(hit.distance),
    instanceIndex: hit.instance,
    hitType: 1,
    uvPosition: new Vector2d(hit.uv[0], hit.uv[1]),
    scenePosition: math.vector(hit.scene),
    position: math.vector(hit.local),
    normal: math.vector(hit.normal),
    sceneNormal: math.vector(hit.sceneNormal),
  };
}

export const View3D = defineType("View3D", Item, {
  properties: {
    camera: null,
    environment: null,
    importScene: null,
    renderMode: 0,
    renderFormat: 0,
    extensions: undefined,
    explicitTextureWidth: 0,
    explicitTextureHeight: 0,
  },
  enums: { Offscreen: 0, Underlay: 1, Overlay: 2, Inline: 3 },
  methods: {
    // The node the nodes declared in the view are in.
    get scene() {
      return this.$scene;
    },
    get renderStats() {
      return this.$stats;
    },
    get effectiveTextureSize() {
      return { width: this.width, height: this.height };
    },
    // Where in the view a place in the scene is seen, and how far away.
    mapFrom3DScene(scene) {
      const camera = this.$seeing();
      const { width, height } = this;
      if (!camera || !(width > 0) || !(height > 0)) return NOWHERE();
      const seen = camera.$seen(scene, width, height);
      return new Vector3d(seen.x * width, seen.y * height, seen.z);
    },
    // And the place in the scene seen there, that far away.
    mapTo3DScene(view) {
      const camera = this.$seeing();
      const { width, height } = this;
      if (!camera || !(width > 0) || !(height > 0)) return NOWHERE();
      return camera.$place(new Vector3d(view.x / width, view.y / height, view.z), width, height);
    },
    // What is nearest under a place in the view, and everything under it.
    pick(x, y) {
      return told(along(this, untrack(() => through(this, Number(x), Number(y))))[0]);
    },
    pickAll(x, y) {
      return along(this, untrack(() => through(this, Number(x), Number(y)))).map(told);
    },
    // And along a ray from a place in the scene.
    rayPick(origin, direction) {
      return told(along(this, { origin: three(origin), direction: three(direction) })[0]);
    },
    rayPickAll(origin, direction) {
      return along(this, { origin: three(origin), direction: three(direction) }).map(told);
    },
    setTouchpoint() {},
    bakeLightmap() {},
    rebuildExtensionList() {},
  },
  setup(self, props) {
    const canvas = document.createElement("canvas");
    canvas.className = "qq-view3d";
    canvas.width = canvas.height = 0;
    self.$node.append(canvas);
    const paper = canvas.getContext("bitmaprenderer");

    // The scene is a node of its own, whose children are the view's.
    const scene = (self.$scene = within(null, () => Node({})));
    Object.defineProperties(scene, {
      $static: { get: () => self.$static },
      $extra: { get: () => self.$extra },
      $track: { value: () => self.$track() },
    });
    if (!("environment" in props)) slot(self, "environment").provide(within(null, () => SceneEnvironment({})));

    let first = null;
    self.$seeing = () => self.camera ?? first;

    // The picture is drawn once for all that changed together, as Qt draws
    // one for a frame: when what changed it is done, and not for each thing
    // of several that a frame's animations and timers set.
    //
    // Drawing holds the page up, where Qt draws on a thread of its own: so
    // where pictures take long, one is not drawn again until as long has
    // gone by as the last took, and the page has half its time for
    // everything else, what it fetches and what is pressed among it. What
    // changes meanwhile is in the picture that is drawn then.
    //
    // One slow picture is not pictures taking long: the first of a scene
    // is slow for the programs that are made for it, and the next is
    // drawn as soon as something changes, as every picture is of a scene
    // that is quick to draw.
    let due = null;
    let rested = 0;
    let slow = false;
    const stats = (self.$stats = within(null, () => RenderStats({})));
    const frame = counted(stats);
    const drawn = () => {
      const from = performance.now();
      // A timer may ring a little early.
      if (rested - from > 1) return void setTimeout(drawn, rested - from);
      const scene = due;
      due = null;
      draw(scene, canvas, paper, ways);
      last = scene;
      if (ways) setTimes((times) => times + 1);
      const ended = performance.now();
      frame(from, ended);
      const took = ended - from;
      rested = slow && took > SLOW ? ended + Math.min(took, REST) : 0;
      slow = took > SLOW;
    };

    // The view is a picture to what takes it for one (a Texture's item),
    // the right way up or upside down, and that is drawn again when the
    // view is: but a view that reads its own picture, as one does that lays
    // each picture over its last, is not drawn again for having been
    // drawn. A picture first asked for after the view was drawn is drawn
    // again to be kept.
    const [times, setTimes] = signal(0, self.$owner);
    let own = false;
    let ways = 0;
    let last = null;
    self.$canvas = { element: canvas };
    self.$view = (down) => {
      const way = down ? 2 : 1;
      if (!(ways & way)) {
        ways |= way;
        if (!due && last) {
          queueMicrotask(drawn);
          due = last;
        }
      }
      return own ? 0 : times();
    };

    effect(
      () => {
        own = true;
        try {
          return sight();
        } finally {
          own = false;
        }
      },
      (seen) => {
        // A camera maps to the view it was last seen through.
        first = seen.camera;
        if (seen.camera) Object.assign(seen.camera, { $width: seen.width, $height: seen.height });
        if (!due) queueMicrotask(drawn);
        due = { ...seen, camera: seen.eye };
      },
    );

    function sight() {
      const { width, height } = self;
      const { models, lights, paints, probes, camera: any } = found(self);
      const camera = self.camera ?? any;
      return {
        width,
        height,
        camera,
        models,
        lights,
        paints,
        probes,
        eye: camera?.$world() ?? null,
        projection: camera?.$projection(width, height) ?? null,
        far: camera?.clipFar ?? 0,
        near: camera?.clipNear ?? 0,
        environment: (self.environment ?? SceneEnvironment).$environment?.() ?? PLAIN,
      };
    }
  },
});

// A picture is slow that takes longer than this to draw, in milliseconds,
// and the longest the page is left to itself after one.
const SLOW = 50;
const REST = 1000;

// What a view says of how fast it draws. The times are of the frame drawn
// last and are told five times a second; how many frames a second had and
// the longest of them are told once the second is over, so both are nothing
// until then, as they are in Qt. What Qt counts only when
// `extendedDataCollectionEnabled` is on is not counted.
export const RenderStats = defineType("RenderStats", QtObject, {
  properties: {
    fps: 0,
    frameTime: 0,
    renderTime: 0,
    renderPrepareTime: 0,
    syncTime: 0,
    maxFrameTime: 0,
    extendedDataCollectionEnabled: false,
    drawCallCount: 0,
    drawVertexCount: 0,
    imageDataSize: 0,
    meshDataSize: 0,
    renderPassCount: 0,
    renderPassDetails: "",
    textureDetails: "",
    meshDetails: "",
    pipelineCount: 0,
    materialGenerationTime: 0,
    effectGenerationTime: 0,
    pipelineCreationTime: 0,
    vmemAllocCount: 0,
    vmemUsedBytes: 0,
    graphicsApiName: "OpenGL",
    lastCompletedGpuTime: 0,
  },
  methods: { releaseCachedResources() {} },
});

const TOLD = 200;
const SECOND = 1000;

// What a frame drawn from `began` until `ended` makes of `stats`.
function counted(stats) {
  let last = performance.now();
  let frames = 0;
  let longest = 0;
  let second = 0;
  let since = 0;
  return (began, ended) => {
    const took = ended - last;
    last = ended;
    frames++;
    longest = Math.max(longest, took);
    second += took;
    since += took;
    const told = {};
    if (since >= TOLD) {
      since -= TOLD;
      Object.assign(told, { frameTime: took, renderTime: ended - began });
    }
    if (second >= SECOND) {
      second -= SECOND;
      Object.assign(told, { fps: frames, maxFrameTime: longest });
      frames = longest = 0;
    }
    let any = false;
    for (const key in told) if (slot(stats, key).write(told[key])) any = true;
    if (any) settle();
  };
}

const PLAIN = { clear: [0, 0, 0, 0], probe: null, sky: false, blur: 0, samples: 0, tonemap: 1, depth: true };

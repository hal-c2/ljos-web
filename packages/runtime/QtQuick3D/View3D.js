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
import { defineType, effect, inside as within, QtObject, settle, slot } from "../object.ts";
import { Vector2d, Vector3d } from "../QtQml/values.ts";
import { lazy } from "../QtQuick/compute.ts";
import { Item } from "../QtQuick/Item.js";
import * as math from "./math.js";
import { inside, Node } from "./Node.js";
import { met } from "./pick.js";
import { draw, restored } from "./render.js";
import { readsAhead, SceneEnvironment } from "./scene.js";
import { paced } from "./paced.js";
import { chosen, drawOn, gave, gaveNow, readable, renderer } from "./wgpu.js";
import { signal, untrack } from "#kernel";
import { createRoot, getOwner, onCleanup, runWithOwner } from "solid-js";

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
    return { node, opacity: node.opacity, model, light, probe, camera, unread: Boolean(node.$unread?.()), inside: inside(node).map(given) };
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
// camera there is; the models and painters as they are declared, whether
// their shapes are here or not; and those that name what only wgpu reads
// (`$unread`). It asks for none of those files: a pick and wgpu's view
// come through here too.
function found(self) {
  const models = [];
  const lights = [];
  const paints = [];
  const probes = [];
  const declared = [];
  const loaders = [];
  let camera = null;
  const walk = (part, above) => {
    if (!part) return;
    const { node } = part;
    if (part.unread) loaders.push(node);
    if (node.$model || node.$paint) declared.push(node);
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
  return { models, lights, paints, probes, declared, loaders, camera };
}

// Geometry's I32Type.
const SIGNED = 2;

// Whether a scene shows what is left to the JavaScript renderer, which draws
// it as Qt does: such a view is not turned to wgpu for a model from a file.
//
// DECISION: that is fog, an effect, a light probe, a reflection probe, a
// skin, particles, a CustomMaterial, a Mask or Opaque material seen through
// by an opacity, a picture of numbers other than RGBA8 (a KTX one too) and
// a Geometry of I32. It is what is recorded as failing on wgpu
// (docs/LJOS_WEB.md, "What fails") and fog, and is wider where a part of
// one cannot be told by itself (morph targets in a CustomMaterial, a probe's
// blurred sky, affectors). That a scene is of very many nodes is not asked:
// there is no number that says it.
function scriptAlone(self, { models, probes, declared }) {
  const environment = self.environment;
  if (environment?.fog?.$fog?.() || environment?.lightProbe) return true;
  // An ExtendedSceneEnvironment's own (`$kind`) are no effects to run.
  if ([].concat(environment?.effects ?? []).some((each) => each && !each.$kind)) return true;
  if (probes.length) return true;
  if (models.some(({ opacity, materials }) => materials.some((drawn) => drawn?.solid && (opacity < 1 || drawn.opacity < 1)))) return true;
  return declared.some((node) => {
    if (node.$paint || node.skin || node.skeleton) return true;
    if (node.geometry?.$held?.().attributes.some(({ componentType }) => componentType === SIGNED)) return true;
    return node.$materials().some((material) => {
      if (material?.$custom) return true;
      const drawn = drawnWith(material);
      if (!drawn) return false;
      return [drawn.map, ...Object.values(drawn.maps ?? {})].some((map) => map?.data && map.data.format !== "RGBA8");
    });
  });
}

// The models a ray is tried against: those for picking, shown or not, of
// a shape that something shown is drawn with. A shape's triangles are what
// is met where a model that is for picking, or is inside one that is, is
// shown with it and not shown through wholly. What a loader read is met
// where the loader is shown, at its triangles: the renderer that draws it
// draws it whole.
function pickable(self) {
  const drawn = new Set();
  const exact = new Set();
  for (const { node, shape, opacity } of found(self).models) {
    drawn.add(shape);
    if (opacity > 0.01 && forPicking(node)) exact.add(shape);
  }
  const models = [];
  const walk = (node, shown) => {
    const shape = node.$model && node.pickable ? node.$shape() : null;
    if (shape && drawn.has(shape)) models.push({ node, shape, exact: exact.has(shape), placed: node.$world(), instances: node.$instances() });
    const seen = shown && node.visible !== false;
    if (seen && node.$picks) for (const part of node.$picks()) models.push({ ...part, exact: true, instances: null });
    for (const child of inside(node)) walk(child, seen);
  };
  for (const node of inside(self.$scene)) walk(node, true);
  if (self.importScene?.$spatial) walk(self.importScene, true);
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
    const canvasFor = () => {
      const made = document.createElement("canvas");
      made.className = "qq-view3d";
      made.width = made.height = 0;
      return made;
    };
    let canvas = canvasFor();
    self.$node.append(canvas);
    // A canvas has one kind of context: a renderer that follows another
    // which took one draws on a canvas in its place.
    const renew = () => {
      const made = canvasFor();
      canvas.replaceWith(made);
      canvas = made;
    };

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
    // Where pictures take long, they are paced (`paced`).
    let due = null;
    const stats = (self.$stats = within(null, () => RenderStats({})));
    const frame = counted(stats);
    const owner = getOwner();
    let released = false;
    if (owner) onCleanup(() => (released = true));
    // Whether the JavaScript renderer may still hand the view to wgpu for
    // what only that reads. Once, and it may be handed back once
    // (`overtaken`): each change costs a canvas and all it holds.
    let mayTurn = readable();
    // Told to what takes the view's picture when it is handed back.
    const [handovers, setHandovers] = signal(0, self.$owner);
    // wgpu taken for want of an ask, and WebGPU with no adapter for the
    // page: the JavaScript renderer draws on the same canvas, untaken.
    if (renderer() === "wgpu") byWgpu(chosen() ? undefined : () => runWithOwner(owner, byScript));
    else byScript();

    // wgpu draws the view. `handover`, if the view was handed to it, is
    // told of its pictures and of its giving up.
    function byWgpu(unadapted, handover) {
      self.$canvas = { element: canvas };
      self.$view = () => 0;
      // wgpu not to be had, or its GPU not again: the JavaScript renderer
      // draws on the canvas instead, or on one in its place where wgpu took
      // the canvas's context (`taken`).
      const instead = chosen()
        ? undefined
        : (taken) =>
            runWithOwner(owner, () => {
              mayTurn = false;
              handover?.gaveUp();
              if (taken) renew();
              byScript();
            });
      const framed = (from, to) => {
        handover?.drew();
        frame(from, to);
      };
      const dispose = drawOn(self, canvas, framed, instead, unadapted);
      if (getOwner()) onCleanup(dispose);
      // What the picture does not need but mapping does: the camera a view
      // is seen through, and the view it was last seen in.
      effect(
        () => ({ camera: self.camera ?? found(self).camera, width: self.width, height: self.height }),
        ({ camera, width, height }) => {
          first = camera;
          if (camera) Object.assign(camera, { $width: width, $height: height });
        },
      );
    }

    // wgpu draws a view the JavaScript renderer handed it, under a root of
    // its own: on a canvas beneath that renderer's last picture, which stays
    // until wgpu has one. It is handed back, for good, when the scene comes
    // to show what is left to that renderer (`scriptAlone`).
    function overtaken(end, ahead) {
      const before = canvas;
      canvas = canvasFor();
      before.before(canvas);
      const uncover = () => before.remove();
      onCleanup(uncover);
      // What was read ahead, for wgpu to take (`Host.fetched`).
      self.$ahead = ahead;
      const letGo = () => {
        ahead.end();
        self.$ahead = null;
      };
      onCleanup(letGo);
      let left = false;
      byWgpu(undefined, {
        drew: uncover,
        gaveUp() {
          left = true;
          uncover();
          letGo();
        },
      });
      const view = self.$view;
      self.$view = (down) => {
        handovers();
        return view(down);
      };
      effect(
        () => {
          const seen = found(self);
          return { alone: scriptAlone(self, seen), named: seen.loaders.map((node) => node.$named()) };
        },
        ({ alone, named }) => {
          ahead.keep(named);
          if (!alone || left) return;
          // After this effect, which is of the root that ends.
          queueMicrotask(() => {
            if (released || left) return;
            left = true;
            end();
            runWithOwner(owner, () => {
              renew();
              byScript();
            });
            setHandovers((times) => times + 1);
          });
        },
      );
    }

    // The JavaScript renderer draws the view, under a root of its own: it
    // ends with the view, or before it where wgpu is turned to.
    function byScript() {
      createRoot(scripted);
    }
    function scripted(end) {
      let over = false;
      const ahead = readsAhead();
      let handed = false;
      const paper = canvas.getContext("bitmaprenderer");
      // What a test or a tool may ask, as of the wgpu renderer's view
      // (`drawOn`): `probe` is told of each sight taken ("sync") and each
      // picture drawn ("draw"); `view` is the View3D itself, to read what it
      // shows from; `held` counts the draws put off to the next frame, and
      // `due` says a picture asked for is still to be drawn.
      const state = (canvas.$view3d = { renderer: "js", backend: "webgl2", frames: 0, held: 0, builds: 0, error: null, probe: null, view: self, get due() { return over || due !== null; } });
      // Drawn once what asked for it has settled, in the same task; one that
      // gave its picture on in this task waits for the next frame, as the
      // wgpu renderer's does (`gaveNow`).
      let waiting = 0;
      let resting = 0;
      const pace = paced();
      const soon = () => {
        if (!gaveNow.has(state)) return void queueMicrotask(drawn);
        state.held++;
        waiting = requestAnimationFrame(() => {
          waiting = 0;
          drawn();
        });
      };
      // A context lost and given back draws the last picture asked for again.
      const unheard = restored(() => {
        if (due || !last) return;
        due = last;
        soon();
      });
      if (getOwner())
        onCleanup(() => {
          if (!handed) ahead.end();
          unheard();
          if (waiting) cancelAnimationFrame(waiting);
          clearTimeout(resting);
        });
      const drawn = () => {
        // One asked for before wgpu was turned to has nothing to draw on.
        if (over) return;
        const from = performance.now();
        const wait = pace.wait(from);
        if (wait) return void (resting = setTimeout(drawn, wait));
        const scene = due;
        due = null;
        const drew = draw(scene, canvas, paper, ways);
        last = scene;
        if (ways) {
          gave(state);
          setTimes((times) => times + 1);
        }
        const ended = performance.now();
        // A picture never drawn is no frame, so what waits for the first
        // (a still picture standing in for the view) goes on waiting.
        if (drew) {
          frame(from, ended);
          state.frames++;
        }
        state.probe?.("draw", from, ended);
        pace.drew(from, ended);
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
            soon();
            due = last;
          }
        }
        return own ? 0 : times();
      };

      effect(
        () => {
          const from = state.probe ? performance.now() : 0;
          own = true;
          try {
            return sight();
          } finally {
            own = false;
            state.builds++;
            state.probe?.("sync", from, performance.now());
          }
        },
        (seen) => {
          if (over) return;
          // A camera maps to the view it was last seen through.
          first = seen.camera;
          if (seen.camera) Object.assign(seen.camera, { $width: seen.width, $height: seen.height });
          // Known once the scene is made or changed, or a file it waits for
          // is here: turned to after this effect has ended, which is of the
          // root that ends.
          if (seen.turn && mayTurn) {
            mayTurn = false;
            over = true;
            return void queueMicrotask(turned);
          }
          if (!due) soon();
          due = { ...seen, camera: seen.eye };
        },
      );

      function turned() {
        if (released) return;
        handed = true;
        end();
        ahead.hand();
        // A picture still asked for (the last, by what takes the view's) is
        // not drawn here, and would keep a script that draws after a failure
        // from asking for its own.
        due = null;
        runWithOwner(owner, () => createRoot((done) => overtaken(done, ahead)));
        // What took the view's picture asks it again, of what draws now.
        setTimes((times) => times + 1);
      }

      function sight() {
        const { width, height } = self;
        const seen = found(self);
        const { models, lights, paints, probes, loaders, camera: any } = seen;
        const camera = self.camera ?? any;
        let turn = false;
        // A view about to turn has handed on what it read, or is about to.
        if (!over) {
          ahead.sighting();
          // Every file is asked of, so they are fetched together: but none
          // by a view that could not turn, or that has what keeps it here.
          const could = mayTurn && loaders.length > 0 && !scriptAlone(self, seen);
          const shown = could ? loaders.map((node) => node.$ready(ahead)) : [];
          ahead.sighted();
          // Turned to once none is on the way and one can be shown: a file
          // that failed is wgpu's to tell of.
          if (!shown.includes(null)) {
            turn = shown.includes(true);
            if (!turn) ahead.spend();
          }
        }
        return {
          width,
          height,
          camera,
          turn,
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
    }
  },
});

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
  // The first frame's times are said at once, however soon it comes:
  // what waits for a view's first picture hears of it.
  let since = TOLD;
  // The first second begins with the first frame: the time the view took to
  // be made, which may be long where its renderer is fetched, is no frame's.
  let first = true;
  return (began, ended) => {
    const took = ended - last;
    last = ended;
    since += took;
    const told = {};
    if (since >= TOLD) {
      since -= TOLD;
      Object.assign(told, { frameTime: took, renderTime: ended - began });
    }
    if (first) first = false;
    else {
      frames++;
      longest = Math.max(longest, took);
      second += took;
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

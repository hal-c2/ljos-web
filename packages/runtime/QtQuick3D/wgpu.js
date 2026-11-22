// View3D drawn by `ljos_3d`'s renderer, the one the native toolkit draws
// with, built to wasm (`crates/ljos_web_3d`). The chunk is fetched the first
// time a page makes such a view, so a page with none fetches nothing of it.
//
// The objects stay here. `Host` is a view's registry of them, and what the
// wasm reads through it. The wasm keeps each object's answers, and a build
// asks only of the objects that changed since the last: each object is
// followed on its own, by reading again what the mapping read of it, and a
// read of those that gives something else marks that read and builds: the
// wasm asks that read again and keeps the rest. The build reads again only
// the pieces of the view (a node, the view's own members, its environment)
// that read what is marked, and patches the scene where they changed, so a
// model turned among a thousand costs that model's turn. It reads
// untracked. An unset member answers nothing, so that the defaults are
// the mapping's own. A build that draws the same draws nothing; one that
// draws differently is drawn once it settles. Nothing here runs otherwise.
import { createRenderEffect, createRoot, getOwner, runWithOwner } from "solid-js";
import { flush, located, slot, effect } from "../object.ts";
import { color } from "../QtQuick/color.ts";
import { adapted, made } from "./early.js";
import { signal, untrack } from "#kernel";
import { CustomMaterial } from "./CustomMaterial.js";
import { handed, text } from "./effects.js";
import { inside } from "./Node.js";
import { done, late, paced, POLL } from "./paced.js";
import { fetched, taken } from "./scene.js";
import { Format } from "./TextureData.js";

// Which renderer a View3D has is said where the page asks for it early.
export { chosen, renderer } from "./early.js";

// A glob, as an import of a file a build of JavaScript alone has not got
// would fail, for the renderer it does not ask for.
const chunks = import.meta.glob("./wgpu/ljos_web_3d.js");

let module = null;
let drawnModels = null;
let memory = null;
async function chunk() {
  const load = chunks["./wgpu/ljos_web_3d.js"];
  if (!load) throw new Error("View3D: the renderer is not built (mise run build:wasm-3d)");
  // Fetched with it: a page on the other renderer does not carry these shaders.
  ({ drawnModels } = await import("./Particles3D/drawn.js"));
  // Kept only once it works: a next view asks again after a failed fetch.
  const loaded = await load();
  // What the page compiled as it loaded, so the wasm is fetched once.
  const compiled = await made();
  ({ memory } = await loaded.default(compiled && { module_or_path: compiled }));
  NAMES = loaded.propNames();
  module = loaded;
}
let NAMES = null;

// Why the renderer stopped, once a call into it trapped. A trap (a panic,
// which aborts) leaves what the wasm held mid-call still held, so every
// call into it after traps too: none is made, and each view it drew stops
// where it stood, its last picture kept. Uncaught, a trap in a build (as a
// device lost on a loaded machine gave) halted every binding on the page,
// as Solid stops all of them on an error nothing catches.
let stopped = null;
const stopping = new Set();
function trapped(error) {
  if (!(error instanceof WebAssembly.RuntimeError)) return false;
  if (!stopped) {
    stopped = `the renderer stopped: ${error}`;
    console.error(`View3D: ${stopped}`);
    for (const stop of stopping) stop();
  }
  return true;
}
// `call` into the renderer, or `otherwise` once it stopped. What else a call
// throws (a binding's own error, read through the wasm) is not the
// renderer's, and is thrown on.
function into(call, otherwise) {
  if (stopped) return otherwise;
  try {
    return call();
  } catch (error) {
    if (trapped(error)) return otherwise;
    throw error;
  }
}

// Views are made one after another: the first makes the page's device, and
// the others share it.
let queue = Promise.resolve();

const NOTHING = 0xffffffff;

// What the wasm asks of an object, by the reader that answers: what reading an
// object again to follow it calls. Pixels and a shape's numbers are not: what
// names them is, and they are new when that is.
// In the order of the wasm's own kinds (answers.rs `Kind`): a member said
// changed is told by its kind's number.
const READS = ["number", "boolean", "color", "vector", "quaternion", "url", "object", "objects", "slots", "authored", "matrices", "snippets", "passes", "table", "arrivals", "pictureId", "geometryId", "tableId"];
const READ = Object.fromEntries(READS.map((name, kind) => [name, kind]));
const MEMBERS = 0x10000;
// What a read that threw gives: never the same as another.
const THREW = Symbol("threw");
// Whether a read gives what it gave: numbers, words and the wasm's arrays
// by what they hold, anything else (a shader's pieces) only if it is the
// very one, so that it is asked again.
const same = (a, b) => {
  if (Object.is(a, b)) return a !== THREW;
  if (!ArrayBuffer.isView(a) || !ArrayBuffer.isView(b) || a.constructor !== b.constructor || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
};
const GROUP = (name, o) => ["x", "y", "z"].some((axis) => slot(o, `${name}$${axis}`)?.explicit());
const said = (o, name) => Boolean(slot(o, name)?.explicit()) || GROUP(name, o);
const isList = (v) => v && typeof v.length === "number" && typeof v !== "string" && !v.$type;
const listed = (v) => (v == null ? [] : isList(v) ? Array.from(v) : [v]);

// A serial number for what stays the same object as long as it says the same.
const serials = new WeakMap();
let serial = 0;
function serialOf(thing) {
  let number = serials.get(thing);
  if (number === undefined) serials.set(thing, (number = ++serial));
  return number;
}

// An element's pixels as they are now.
function readPixels(element) {
  const width = element.naturalWidth ?? element.videoWidth ?? element.width;
  const height = element.naturalHeight ?? element.videoHeight ?? element.height;
  const context = new OffscreenCanvas(width, height).getContext("2d", { willReadFrequently: true });
  context.drawImage(element, 0, 0);
  return { width, height, pixels: new Uint8Array(context.getImageData(0, 0, width, height).data.buffer) };
}

// A decoded picture's pixels, once.
const decoded = new WeakMap();
function pixelsOf(element) {
  let made = decoded.get(element);
  if (!made) decoded.set(element, (made = readPixels(element)));
  return made;
}

// The same pixels with the last row first, once.
const upsideDown = new WeakMap();
function flipped(shot) {
  let made = upsideDown.get(shot);
  if (!made) {
    const { width, height, pixels } = shot;
    const rows = new Uint8Array(pixels.length);
    for (let row = 0; row < height; row++) rows.set(pixels.subarray(row * width * 4, (row + 1) * width * 4), (height - 1 - row) * width * 4);
    upsideDown.set(shot, (made = { width, height, pixels: rows }));
  }
  return made;
}

// A shader's numbers, flat.
const numbers = (value) => (typeof value === "number" ? [value] : value);
const toUniform = ({ name, type, value }) => ({ name, type, value: Float32Array.from(numbers(value)) });
const plain = (uniforms) => uniforms.filter(({ type }) => type !== "sampler2D").map(toUniform);

// An ExtendedSceneEnvironment is Qt's own QML here. Its properties are
// declared in that file with its defaults and aliased to its effect, so
// what it holds is what counts, said or not.
const written = (object) => object.$type.chain.some((type) => type.typeName === "SceneEffectEnvironment");

function joined(sides) {
  const all = new Uint8Array(sides.reduce((sum, side) => sum + side.byteLength, 0));
  let at = 0;
  for (const side of sides) {
    all.set(new Uint8Array(side.buffer, side.byteOffset, side.byteLength), at);
    at += side.byteLength;
  }
  return all;
}

class Host {
  constructor(view, setArrivals, arrivals, ask, lost) {
    this.view = view;
    this.setArrivals = setArrivals;
    this.count = arrivals;
    this.ask = ask;
    this.lose = lost;
    this.handles = new Map([[view, 0]]);
    this.objectsBy = new Map([[0, view]]);
    this.pixelReads = new WeakMap();
    this.reading = 0;
    this.next = 1;
    // What the wasm asked of each object, as kind and member, and the
    // objects asked something new in this build.
    this.asked = new Map();
    this.grown = new Set();
    // Textures whose picture may be another by the next build unseen.
    this.unsteady = new Set();
    // How many reads crossed in this build.
    this.crossed = 0;
    this.again = false;
    // The handle each object new to the view is to have, given when it was
    // read again to follow before the build met it.
    this.unmet = new WeakMap();
  }
  // A read of what `o` is asked of `kind`, by the wasm or again to follow it.
  note(o, kind, p = 0) {
    if (this.again) return;
    this.crossed++;
    let asked = this.asked.get(o);
    if (!asked) this.asked.set(o, (asked = new Set()));
    const key = kind * MEMBERS + p;
    if (!asked.has(key)) {
      asked.add(key);
      this.grown.add(o);
    }
  }
  // Reads again all that the wasm asked of `o`, so that what runs this does
  // follow it, and returns what each read gives, by key. A read that throws
  // (of an object on its way out) is still followed up to where it threw,
  // and gives what nothing else is.
  readAgain(o) {
    const asked = this.asked.get(o);
    const given = new Map();
    if (!asked) return given;
    this.again = true;
    try {
      for (const key of asked) {
        try {
          given.set(key, this[READS[Math.floor(key / MEMBERS)]](o, key % MEMBERS));
        } catch {
          given.set(key, THREW);
        }
      }
    } finally {
      this.again = false;
    }
    return given;
  }
  handle(object) {
    let handle = this.handles.get(object);
    if (handle !== undefined) return handle;
    // Read again to follow, an object new to the view is not made one: the
    // build that follows meets it. It is told by the handle it is to have,
    // so that it is never the same as another new one or a hole, and is the
    // same once the build has made it.
    handle = this.unmet.get(object);
    if (handle === undefined) {
      handle = this.next++;
      if (this.again) this.unmet.set(object, handle);
    }
    if (this.again) return handle;
    this.unmet.delete(object);
    this.handles.set(object, handle);
    this.objectsBy.set(handle, object);
    return handle;
  }
  // What a build no longer reached is gone from the scene: it is let go, and
  // the handles of what is made later are others.
  drop(handle) {
    const object = this.objectsBy.get(handle);
    this.objectsBy.delete(handle);
    this.handles.delete(object);
    this.asked.delete(handle);
    this.grown.delete(handle);
    this.unsteady.delete(handle);
  }
  chain(o) {
    const object = this.objectsBy.get(o);
    const names = object.$type.chain.map((type) => type.typeName);
    // An object of a type of the page's own, as XrCamera, may say which
    // of the renderer's it is drawn as.
    if (object.$drawnAs) names.push(object.$drawnAs);
    // Qt's own QML of an ExtendedSceneEnvironment is what is run here, an
    // object of the type it is written on, whatever name it is imported by.
    return names.includes("SceneEffectEnvironment") ? [...names, "ExtendedSceneEnvironment"] : names;
  }
  number(o, p) {
    this.note(o, READ.number, p);
    const object = this.objectsBy.get(o);
    const name = NAMES[p];
    // What such an object tells the renderer though no one said it.
    const told = object.$told;
    if (told && name in told) return Number(told[name]);
    // A node's x is a part of its position, whichever of them was said.
    if (name === "x" || name === "y" || name === "z") {
      if (!slot(object, name)?.explicit() && !said(object, "position")) return undefined;
      return Number(object[name]);
    }
    if (name === "refreshTurn") return object.$asked?.[0]() ?? 0;
    if (written(object)) return name in object ? Number(object[name]) : undefined;
    const own = slot(object, name);
    if (!own?.explicit()) return undefined;
    const value = Number(own.get());
    return Number.isNaN(value) ? undefined : value;
  }
  boolean(o, p) {
    this.note(o, READ.boolean, p);
    const object = this.objectsBy.get(o);
    if (written(object)) return NAMES[p] in object ? Boolean(object[NAMES[p]]) : undefined;
    const own = slot(object, NAMES[p]);
    return own?.explicit() ? Boolean(own.get()) : undefined;
  }
  color(o, p) {
    this.note(o, READ.color, p);
    const object = this.objectsBy.get(o);
    if (written(object)) {
      if (!(NAMES[p] in object)) return undefined;
      const { r, g, b, a } = color(object[NAMES[p]]);
      return Float32Array.of(r, g, b, a);
    }
    const own = slot(object, NAMES[p]);
    if (!own?.explicit()) return undefined;
    const { r, g, b, a } = color(own.get());
    return Float32Array.of(r, g, b, a);
  }
  vector(o, p) {
    this.note(o, READ.vector, p);
    const object = this.objectsBy.get(o);
    const name = NAMES[p];
    // The mapping takes x, y and z where it is not told a position.
    if (name === "position" || !said(object, name)) return undefined;
    const { x, y, z } = object[name];
    return Float32Array.of(x, y, z);
  }
  quaternion(o, p) {
    this.note(o, READ.quaternion, p);
    const own = slot(this.objectsBy.get(o), NAMES[p]);
    if (!own?.explicit()) return undefined;
    const { x, y, z, scalar } = own.get();
    return Float32Array.of(x, y, z, scalar);
  }
  url(o, p) {
    this.note(o, READ.url, p);
    const own = slot(this.objectsBy.get(o), NAMES[p]);
    if (!own?.explicit()) return undefined;
    const value = own.get();
    return value == null ? undefined : String(value);
  }
  object(o, p) {
    this.note(o, READ.object, p);
    const value = slot(this.objectsBy.get(o), NAMES[p])?.get();
    return value?.$type ? this.handle(value) : undefined;
  }
  objects(o, p) {
    this.note(o, READ.objects, p);
    const object = this.objectsBy.get(o);
    const name = NAMES[p];
    let all;
    if (name === "data" && object === this.view) all = inside(object.$scene);
    else if (name === "data" && object.$particles) all = [...inside(object), ...drawnModels(object, this, () => this.view.environment?.tonemapMode ?? 1, () => this.eye())];
    else if (name === "data" && object.$spatial !== undefined) all = inside(object);
    else all = listed(slot(object, name)?.get());
    return Uint32Array.from(all.filter((each) => each?.$type).map((each) => this.handle(each)));
  }
  // Where the eye is: the view's camera, else the first in its scene.
  eye() {
    const first = (nodes) => {
      for (const node of nodes) {
        const camera = node.$projection ? node : first(inside(node));
        if (camera) return camera;
      }
      return null;
    };
    return (this.view.camera ?? first(inside(this.view.$scene)))?.$world() ?? null;
  }
  slots(o, p) {
    this.note(o, READ.slots, p);
    const all = listed(slot(this.objectsBy.get(o), NAMES[p])?.get());
    return Uint32Array.from(all.map((each) => (each?.$type ? this.handle(each) : NOTHING)));
  }
  authored(o, p) {
    this.note(o, READ.authored, p);
    return said(this.objectsBy.get(o), NAMES[p]);
  }
  matrices(o, p) {
    this.note(o, READ.matrices, p);
    const all = listed(slot(this.objectsBy.get(o), NAMES[p])?.get());
    return Float32Array.from(all.flatMap((m) => (m ? [m.m11, m.m21, m.m31, m.m41, m.m12, m.m22, m.m32, m.m42, m.m13, m.m23, m.m33, m.m43, m.m14, m.m24, m.m34, m.m44] : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])));
  }
  // What a Texture shows, where that is pixels: what a view last drew is here
  // once it has drawn.
  shown(o, texture = this.objectsBy.get(o).$texture?.()) {
    if (!texture || (texture.view && !texture.element.$drawn)) return null;
    // An element of no size has no picture yet: reading it throws, where
    // the JavaScript renderer uploads the empty canvas and draws on.
    if (!texture.data && !texture.view && texture.element) {
      const { element } = texture;
      const width = element.naturalWidth ?? element.videoWidth ?? element.width;
      const height = element.naturalHeight ?? element.videoHeight ?? element.height;
      if (!width || !height) return null;
    }
    return texture.data || texture.element ? texture : null;
  }
  // Each way up of what a view drew is a picture, and so is what an item has
  // on it each time this scene is read, as it says nothing of being drawn on.
  pictureId(o) {
    this.note(o, READ.pictureId);
    const made = this.objectsBy.get(o).$texture?.();
    // What an item or a view has on it changes with nothing to follow: it
    // is asked again in each build.
    if (!this.again && (made?.live || made?.view)) this.unsteady.add(o);
    const texture = this.shown(o, made);
    if (!texture) return undefined;
    if (texture.view) return serialOf(texture.down ? flipped(texture.element.$drawn) : texture.element.$drawn);
    return texture.live ? serialOf(this.liveRead(texture.element)) : serialOf(texture.data ?? texture.element);
  }
  liveRead(element) {
    const read = this.pixelReads.get(element);
    if (read?.reading === this.reading) return read;
    const made = { ...readPixels(element), reading: this.reading };
    this.pixelReads.set(element, made);
    return made;
  }
  picture(o) {
    const texture = this.shown(o);
    if (!texture) return undefined;
    const { data } = texture;
    if (data) {
      // Its own numbers: the wasm reads them as what the format says they are.
      const { width, height, pixels, format } = data;
      // Surroundings baked into a file: each level's sides, one after another.
      const baked = data.baked && data.sides === 6 ? data.levels?.map(joined) : undefined;
      return { width, height, depth: data.depth ?? 0, pixels: new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength), format: Format[format], opaque: !texture.sheer, baked };
    }
    if (texture.view) return { ...(texture.down ? flipped(texture.element.$drawn) : texture.element.$drawn), opaque: !texture.sheer };
    if (texture.live) return { ...this.liveRead(texture.element), opaque: !texture.sheer };
    return { ...pixelsOf(texture.element), opaque: !texture.sheer };
  }
  geometryId(o) {
    this.note(o, READ.geometryId);
    const held = this.objectsBy.get(o).$held?.();
    return held?.stride > 0 ? serialOf(held) : undefined;
  }
  geometry(o) {
    return this.objectsBy.get(o).$held?.();
  }
  tableId(o) {
    this.note(o, READ.tableId);
    const table = this.objectsBy.get(o).$table?.();
    return table ? serialOf(table.data) : undefined;
  }
  table(o) {
    this.note(o, READ.table);
    return this.objectsBy.get(o).$table?.();
  }
  // Samplers, each with what it shows.
  samplers(object, uniforms) {
    return uniforms
      .filter(({ type }) => type === "sampler2D")
      .map(({ name }) => {
        const input = object[name];
        const texture = input?.enabled ? input.texture : null;
        return { name, texture: texture?.$type ? this.handle(texture) : NOTHING };
      });
  }
  snippets(o) {
    this.note(o, READ.snippets);
    const material = this.objectsBy.get(o);
    const piece = (file, code) => (String(file ?? "") ? text(file, material) : String(code ?? ""));
    const vertex = piece(material.vertexShader, material.__vertexShaderCode);
    const fragment = piece(material.fragmentShader, material.__fragmentShaderCode);
    const { uniforms, waiting } = handed(material, CustomMaterial);
    if (vertex === null || fragment === null || waiting) return undefined;
    return {
      vertex,
      fragment,
      shaded: material.shadingMode !== 0,
      uniforms: plain(uniforms),
      textures: this.samplers(material, uniforms),
      sourceBlend: material.sourceBlend,
      sourceAlphaBlend: material.sourceAlphaBlend,
      destinationAlphaBlend: material.destinationAlphaBlend,
      destinationBlend: material.destinationBlend,
      depthDraw: material.depthDrawMode,
      cullMode: material.cullMode,
    };
  }
  passes(o) {
    this.note(o, READ.passes);
    const effect = this.objectsBy.get(o);
    const { uniforms, passes, waiting } = effect.$passes();
    if (waiting) return undefined;
    const buffers = [];
    const at = (buffer) => {
      let index = buffers.findIndex(({ name }) => name === buffer.name);
      if (index < 0) index = buffers.push(buffer) - 1;
      return index;
    };
    return {
      uniforms: plain(uniforms),
      textures: this.samplers(effect, uniforms),
      passes: passes.map((pass) => {
        const named = pass.reads.filter(({ buffer }) => buffer);
        const given = named.find(({ sampler }) => !sampler);
        return {
          vertex: pass.source.vertex,
          fragment: pass.source.fragment,
          set: plain(pass.set),
          reads: named.filter(({ sampler }) => sampler).map(({ buffer, sampler }) => ({ sampler, buffer: at(buffer) })),
          input: given ? at(given.buffer) : undefined,
          output: pass.output ? at(pass.output) : undefined,
          leaves: pass.format,
        };
      }),
      buffers,
    };
  }
  // What arrived is the wasm's to look at: the count says when to.
  arrivals(o) {
    this.note(o, READ.arrivals);
    return this.count();
  }
  arrived() {
    this.setArrivals((count) => count + 1);
  }
  // The page's own fetch, which what it makes of the file shares.
  async fetched(url) {
    const address = located(url);
    const file = fetched(address);
    await file.done;
    if (file.failed) throw file.failed.told ?? file.failed;
    // The wasm keeps a copy of what this gives it, so the bytes are let go
    // here unless the page is already waiting on them. A page that asks
    // for the same file later (a Model's bounds or picking, read only
    // when asked, so mostly after the wasm drew it) fetches it again,
    // once: its parse is kept, and the browser's cache usually answers.
    // That second fetch is the price of not holding every texture and
    // glTF, which the page never reads, for as long as the page lives.
    taken(address, file);
    return new Uint8Array(file.bytes);
  }
  report(url, error) {
    console.warn(`${this.view.$type.typeName}: ${url}: ${error}`);
  }
  // Asked in the build's effect, and what this writes may be read by what
  // the build reads: so after it.
  loaderStatus(o, status, error) {
    const loader = this.objectsBy.get(o);
    if (loader.status === status && loader.errorString === error) return;
    queueMicrotask(() => {
      loader.status = status;
      loader.errorString = error;
      flush();
    });
  }
  request() {
    this.ask();
  }
  lost(message) {
    this.lose(message);
  }
}

// How many times the page's views are made again for a GPU lost, within
// `LOSSES_IN` milliseconds of the first: past that, the GPU is taken as gone.
const LOSSES = 3;
const LOSSES_IN = 60_000;

// The GPU lost is the page's, as its device is: each loss counts once,
// whatever views it took, and once it is lost too often, or has no adapter
// after, WebGPU is given up for the page (`givenUp`, why). Every view then
// does alike, the ones there and any made after, so none shows a picture
// one on the other renderer drew.
let losses = [];
let counting = false;
let givenUp = null;
// The views that draw on the JavaScript renderer once WebGPU is given up,
// each by what retires it from wgpu: one already made again on wgpu when
// another found WebGPU gone goes with it.
const retiring = new Set();
function lostOnce(message) {
  if (givenUp || counting) return givenUp;
  // The views of one device are told of losing it in the same task.
  counting = true;
  setTimeout(() => (counting = false));
  const now = performance.now();
  losses = losses.filter((at) => now - at < LOSSES_IN);
  losses.push(now);
  if (losses.length > LOSSES) givenUp = `the GPU was lost: ${message}`;
  return givenUp;
}

// The views that gave a new picture to what shows it in this task. One
// asked to draw again in it waits for the next animation frame: views that
// take each other's picture, each draw a new picture for the other, then go
// round once a frame and the page paints, where in microtasks they would go
// round without end. The JavaScript renderer's views are paced by it too
// (View3D.js), so a view of either kind showing one of the other is.
export const gaveNow = new Set();
let ending = null;
export const gave = (view) => {
  gaveNow.add(view);
  if (ending) return;
  ending = new MessageChannel();
  ending.port1.onmessage = () => {
    gaveNow.clear();
    ending.port1.close();
    ending = null;
  };
  ending.port2.postMessage(0);
};

// Draws `self` on `canvas`. What a test or a tool may ask (the backend, how
// many frames and builds, how many reads the last build asked of the page
// and how many pieces of the view it read again, how many objects the view
// holds) is on the canvas, and so is `probe`: what
// a tool that times the view (tests/perf3d) puts there is told of each build
// ("sync": the scene read into the renderer), each frame drawn ("draw"),
// and, on WebGL 2, each frame's GPU work ("gpu", until it was done, as the
// view is paced by), from when until when. Unset, nothing is timed for it. Where WebGPU gives
// the page no adapter, `instead`, if given, is called in place of drawing.
export function drawOn(self, canvas, told, instead) {
  const [made, setMade] = signal(null, self.$owner);
  const [arrivals, setArrivals] = signal(0, self.$owner);
  const [draws, setDraws] = signal(0, self.$owner);
  // Objects whose reads changed since the last build, whole or by the keys
  // of the reads that give something else, and a count that says there are
  // some.
  const changed = new Set();
  const members = new Map();
  const [changes, setChanges] = signal(0, self.$owner);
  // Each object's follower, by handle, and what owns them: a follower is
  // made while a build applies, where Solid has no owner to give it.
  const followers = new Map();
  const following = runWithOwner(self.$owner ?? null, () => createRoot((end) => ({ owner: getOwner(), end })));
  let due = false;
  let frame = 0;
  let gone = false;
  // Whether WebGPU was given the canvas: what draws instead then draws on
  // one of its own.
  let gaveCanvas = false;
  let wanted = false;
  let own = false;
  const state = (canvas.$view3d = {
    renderer: "wgpu",
    backend: null,
    view: self,
    frames: 0,
    // Draws put off to the next animation frame because the view gave its
    // picture on in this task or frame (`gaveNow`, `sameFrame`): what a test
    // counts to say a view was or was not made to wait, where a deadline
    // would count the machine's speed too.
    held: 0,
    // Whether a picture asked for is still to be drawn (resting, behind the
    // GPU's last, or waiting for a frame): what a host waits on to read the
    // view's pixels, where a number of frames would only pass the time.
    get due() {
      return due;
    },
    builds: 0,
    // How many times the GPU the view drew with was lost, and the view made
    // again on another.
    lost: 0,
    reads: 0,
    pieces: 0,
    objects: () => host.objectsBy.size,
    error: null,
    probe: null,
    memory: () => memory?.buffer.byteLength ?? 0,
  });
  // A view that reads itself reads what it drew before and is not drawn again
  // for that. One first read after it drew is drawn again, as what it drew
  // has left the surface.
  self.$view = () => {
    wanted = true;
    if (!canvas.$drawn) into(() => made()?.again());
    return own ? 0 : draws();
  };
  // A picture on WebGL 2 is the GPU's work, done after the call that asks
  // for it returns: a software GPU (SwiftShader, where a browser has no GPU
  // of its own) draws for far longer than that call, and a view that asked
  // for a picture each frame kept it drawing without end, so the page's
  // own pictures waited behind the view's for seconds. A picture's time on
  // WebGL 2 is until its GPU work is done, read from a fence, and no other
  // is asked for until it is.
  const pace = paced();
  let resting = 0;
  let gl = null;
  let fence = null;
  let finishing = 0;
  // The animation frame the view last gave its picture on in, by the
  // timeline's time, which is the same in every task between two frames.
  let givenIn = null;
  const sameFrame = () => {
    const now = document.timeline?.currentTime;
    return givenIn !== null && now != null && givenIn === now;
  };
  // `time` is the animation frame's, where one called it.
  const draw = (time) => {
    frame = 0;
    resting = 0;
    // A frame asked for may come after the picture it was for was drawn.
    if (gone || stopped || !due) return;
    // One whose picture others read gives it on once an animation frame:
    // what finishes or rests on a timer would otherwise draw it again
    // before the page paints, and two views that show each other's would
    // go round as fast as the GPU lets them.
    if (time === undefined && sameFrame()) {
      state.held++;
      return void (frame = requestAnimationFrame(draw));
    }
    const from = performance.now();
    // Still due while it rests or the last is with the GPU, so that what
    // asks meanwhile is in it.
    const wait = pace.wait(from);
    if (wait) return void (resting = setTimeout(draw, wait));
    if (fence) return;
    due = false;
    if (into(() => made()?.frame(), false)) {
      state.frames++;
      const to = performance.now();
      told(from, to);
      state.probe?.("draw", from, to);
      // The picture leaves the surface for the page once drawn: what
      // takes this view as a texture is handed a copy made before it does.
      if (wanted) {
        canvas.$drawn = readPixels(canvas);
        givenIn = document.timeline?.currentTime ?? null;
        gave(state);
        setDraws((times) => times + 1);
      }
    }
    fence = gl?.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) ?? null;
    if (fence) {
      drawnFrom = from;
      busy = performance.now();
      busyAtFrame = inFrame;
      finished();
    } else pace.drew(from, performance.now());
  };
  // The GPU is asked whether it is done, without waiting for it, a few
  // milliseconds apart, only while a picture is with it, and again as each
  // frame of the page's is laid out and once it is made (`watch`). What else
  // held the page meanwhile is not the picture's time (`done`); the page's
  // frame, made while the picture was with the GPU, is.
  let drawnFrom = 0;
  // When the GPU was last seen at work on the picture, and whether that was
  // while a frame of the page's was being made.
  let busy = 0;
  let busyAtFrame = false;
  const settled = () => gl.isContextLost() || gl.getSyncParameter(fence, gl.SYNC_STATUS) === gl.SIGNALED;
  const finished = () => {
    clearTimeout(finishing);
    finishing = 0;
    const now = performance.now();
    if (!settled()) {
      busy = now;
      busyAtFrame = inFrame;
      finishing = setTimeout(finished, POLL);
      if (watching) watch();
      return;
    }
    gl.deleteSync(fence);
    fence = null;
    const to = done(busy, now, busyAtFrame ? madeBy : null);
    watching = late(busy, now);
    state.probe?.("gpu", drawnFrom, to);
    pace.drew(drawnFrom, to);
    // Drawn now if asked for meanwhile, unless an animation frame asked
    // for is still to come and draws it.
    if (due && !frame) draw();
  };
  // The browser makes the page's frame after its animation frame callbacks
  // and its layout, and there waits for what the GPU still has to do for the
  // canvas: no timer rings meanwhile, so a picture checked only by them was
  // seen done after a gap the page seemed to fill, and counted quick however
  // long the GPU held every frame of the page's. So once a picture was seen
  // done late, and while the view draws, each frame says when it was laid
  // out (a resize observer's first look at the canvas, which comes after
  // every animation frame callback, style and layout, and checks the picture
  // too) and when it was made (a message posted there, the first task after
  // it): a picture still with the GPU once the frame was laid out is
  // `inFrame`, and the check after the gap is the message. What the page's
  // own callbacks and layout took comes before, and is the page's. A page
  // held long may begin its next frame before the message: then that frame
  // began once the last was made, and what its callbacks take is the page's
  // too (`madeBy`). A view whose pictures are seen done on time asks for no
  // frames of its own.
  let watching = false;
  let framing = 0;
  let inFrame = false;
  let madeBy = Infinity;
  // Pictures drawn by the last frame's start: a view drawing in animation
  // frames may have none with the GPU, and none due, as one begins.
  let framesSeen = 0;
  const frameMade = new MessageChannel();
  frameMade.port1.onmessage = () => {
    inFrame = false;
    if (fence) finished();
  };
  const laidOut = new ResizeObserver(() => {
    laidOut.unobserve(canvas);
    if (gone) return;
    inFrame = true;
    madeBy = Infinity;
    frameMade.port2.postMessage(0);
    if (fence) finished();
  });
  const watch = () => {
    if (framing || gone) return;
    framing = requestAnimationFrame((began) => {
      framing = 0;
      if (inFrame) madeBy = began;
      inFrame = false;
      laidOut.observe(canvas);
      if (fence) finished();
      const drawing = fence || due || state.frames !== framesSeen;
      framesSeen = state.frames;
      if (watching && drawing) watch();
    });
  };
  // Drawn once what asked for it has settled, in the same task: a build in
  // an animation frame is drawn in that frame, as the JavaScript renderer's
  // is, and asks for no frame of its own. One that gave its picture on in
  // this task waits for the next frame.
  const request = () => {
    // A stopped renderer draws no more: what it started before it trapped
    // may still ask, and a view due for a picture never drawn holds what
    // waits to read its pixels.
    if (due || stopped) return;
    due = true;
    if (!gaveNow.has(state)) return void queueMicrotask(draw);
    state.held++;
    frame = requestAnimationFrame(draw);
  };
  // A view whose GPU was lost is made again on the same canvas, as the
  // first was, with a host of its own: the new view asks for the whole
  // scene. Freed after the task that told it, which may be in one of its
  // own calls.
  //
  // One no one asked a renderer of, whose GPU is not to be had again (a
  // browser whose GPU process gave up may have no adapter after) or is lost
  // too often to go on, draws on the JavaScript renderer instead, as where
  // WebGPU had no adapter from the start: on a canvas of its own, as this
  // one keeps WebGPU's context, if it was given it. One a renderer was asked
  // of says why it stops.
  const giveUp = (why) => {
    if (!instead) {
      state.error = why;
      return void console.error(`View3D: ${state.error}`);
    }
    gone = true;
    // On the JavaScript renderer now, there is nothing left to retire.
    retiring.delete(retire);
    instead(gaveCanvas);
    setDraws((times) => times + 1);
  };
  // A loss told while the view is made, before it is kept, is acted on
  // in place of keeping it.
  let lostWhileMade = null;
  // The view kept, as `setMade` keeps it but read at once: a `setMade`
  // write reads back only once Solid flushes it, so a loss told between
  // the two would read no view and be put off with no make left to act on
  // it.
  let kept = null;
  const lost = (message) => {
    const view = kept;
    if (gone || stopped) return;
    if (!view) return void (lostWhileMade ??= message);
    remake(view, message);
  };
  // `view` is handed over, not read: the call that made the view has not
  // kept it.
  const remake = (view, message) => {
    lostWhileMade = null;
    kept = null;
    setMade(null);
    queueMicrotask(() => into(() => view.free()));
    for (const end of followers.values()) end();
    followers.clear();
    changed.clear();
    members.clear();
    const why = lostOnce(message);
    if (why) return void giveUp(why);
    state.lost++;
    host = new Host(self, setArrivals, arrivals, request, lost);
    make();
  };
  let host = new Host(self, setArrivals, arrivals, request, lost);
  const retire = () => {
    if (gone) return;
    end();
    instead(gaveCanvas);
    setDraws((times) => times + 1);
  };
  if (instead) retiring.add(retire);
  const stop = () => {
    state.error = stopped;
    due = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    clearTimeout(resting);
    resting = 0;
  };
  if (stopped) stop();
  else stopping.add(stop);

  // Follows what the wasm asked of `o`: a change to any of it marks the
  // reads of `o` that give something else, which the wasm alone asks again,
  // and builds; a node that turned is asked its turn. Its own root, apart
  // from whatever ran the build, ends when `o` leaves the view or the view
  // goes; one that was asked something new is made again to follow that too.
  const follow = (o) => {
    followers.get(o)?.();
    const end = runWithOwner(following.owner, () =>
      createRoot((end) => {
        let gave = null;
        createRenderEffect(
          () => {
            own = true;
            try {
              return host.readAgain(o);
            } finally {
              own = false;
            }
          },
          (given) => {
            const before = gave;
            gave = given;
            if (!before) return;
            let keys = members.get(o);
            for (const [key, value] of given) {
              if (before.has(key) && same(before.get(key), value)) continue;
              if (!keys) members.set(o, (keys = new Set()));
              keys.add(key);
            }
            if (keys) setChanges((count) => count + 1);
          },
        );
        return end;
      }),
    );
    followers.set(o, end);
  };
  const unfollow = (o) => {
    followers.get(o)?.();
    followers.delete(o);
  };

  const size = (width, height) => [Math.max(1, Math.round(width * devicePixelRatio)), Math.max(1, Math.round(height * devicePixelRatio))];
  [canvas.width, canvas.height] = untrack(() => size(self.width, self.height));
  const make = () => {
    queue = queue
      .then(async () => {
        if (gone) return;
        lostWhileMade = null;
        if (givenUp) return void giveUp(givenUp);
        // Before the renderer is fetched or the canvas taken, so what draws
        // instead has both.
        if (instead && !(await adapted())) {
          // A view let go while WebGPU was asked has no owner left for what
          // draws instead to live under.
          if (gone) return;
          gone = true;
          retiring.delete(retire);
          instead();
          // What took the view's picture asks it again, of what draws now.
          return void setDraws((times) => times + 1);
        }
        // A renderer that trapped as it was first made is not kept, and is
        // not made again: a failed fetch alone is asked for again.
        if (stopped) return;
        if (!module) await chunk();
        if (stopped) return;
        gaveCanvas = true;
        const view = await module.View3d.create(canvas, host);
        if (gone) return void into(() => view.free());
        if (stopped) return;
        state.backend = into(() => view.backend(), null);
        if (stopped) return;
        // The context the view draws with, which a canvas gives again.
        if (state.backend === "webgl2") gl = canvas.getContext("webgl2");
        // Lost before it is kept, it is never kept: it is made again.
        if (lostWhileMade !== null) return void remake(view, lostWhileMade);
        kept = view;
        setMade(() => view);
      })
      .catch(async (error) => {
        if (trapped(error)) return;
        // A view made again for a GPU lost gives WebGPU up for the page only
        // where WebGPU has no adapter after, or once another view found that
        // or gave up; a view that fails for a reason of its own, with an
        // adapter still there, stops alone. That is the page's though the
        // view was let go meanwhile.
        const none = !givenUp && state.lost && !(await navigator.gpu?.requestAdapter().catch(() => null));
        if (none || givenUp) {
          givenUp ??= `the GPU was lost, and none is to be had again: ${error?.message ?? error}`;
          for (const other of [...retiring]) other();
          return void (gone || giveUp(givenUp));
        }
        state.error = String(error?.message ?? error);
        console.error(`View3D: ${state.error}`);
      });
  };
  make();

  // The item's own size says when, without watching the element.
  effect(
    () => ({ view: made(), width: self.width, height: self.height }),
    ({ view, width, height }) => {
      if (view) into(() => view.resize(...size(width, height)));
    },
  );
  // The build reads in the compute, untracked, as what it reads may make
  // what it reads (a member's binding) and that needs an owner; what it let
  // go of and what it asked anew are handled after.
  effect(
    () => {
      const view = made();
      changes();
      if (!view) return null;
      const from = state.probe ? performance.now() : 0;
      host.reading++;
      host.crossed = 0;
      for (const o of host.unsteady) changed.add(o);
      host.unsteady.clear();
      // Triples of object, kind and member, of objects not marked whole.
      const said = [];
      for (const [o, keys] of members) {
        if (changed.has(o)) continue;
        for (const key of keys) said.push(o, Math.floor(key / MEMBERS), key % MEMBERS);
      }
      members.clear();
      const marked = Uint32Array.from(changed);
      changed.clear();
      // What changed is followed for what this build asks of it, as the wasm
      // asks it all again: what it read before and no longer does (a file it
      // waited for that is in) is not followed any more.
      const before = new Map();
      for (const o of marked) {
        const asked = host.asked.get(o);
        if (asked) before.set(o, asked);
        host.asked.delete(o);
      }
      let left;
      own = true;
      try {
        left = untrack(() => into(() => view.build(marked, Uint32Array.from(said)), null));
      } finally {
        own = false;
      }
      if (!left) return null;
      state.builds++;
      state.reads = host.crossed;
      state.pieces = into(() => view.pieces(), state.pieces);
      // One asked just what it was before is followed as it was.
      for (const [o, asked] of before) {
        const now = host.asked.get(o);
        if (now?.size === asked.size && [...now].every((key) => asked.has(key))) host.grown.delete(o);
      }
      const grown = [...host.grown];
      host.grown.clear();
      return { from, left, grown, marked };
    },
    (built) => {
      if (!built) return;
      for (const handle of built.left) {
        unfollow(handle);
        host.drop(handle);
      }
      for (const handle of built.grown) follow(handle);
      // What changed and this build passed by is asked again, and followed,
      // when a build reaches it.
      for (const handle of built.marked) if (!host.asked.has(handle)) unfollow(handle);
      state.probe?.("sync", built.from, performance.now());
    },
  );

  // Once, whether the view is retired from wgpu or let go, or both.
  let ended = false;
  function end() {
    if (ended) return;
    ended = true;
    gone = true;
    retiring.delete(retire);
    stopping.delete(stop);
    for (const end of followers.values()) end();
    followers.clear();
    following.end();
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    clearTimeout(resting);
    resting = 0;
    clearTimeout(finishing);
    finishing = 0;
    if (framing) cancelAnimationFrame(framing);
    framing = 0;
    laidOut.disconnect();
    frameMade.port1.close();
    if (fence) gl.deleteSync(fence);
    fence = null;
    // Not `made()`: a view kept in this task reads back only once flushed.
    const view = kept;
    kept = null;
    if (view) {
      setMade(null);
      into(() => view.free());
    }
  }
  return end;
}


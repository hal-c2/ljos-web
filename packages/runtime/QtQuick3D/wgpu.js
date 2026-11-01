// View3D drawn by `ljos_3d`'s renderer, the one the native toolkit draws
// with, built to wasm (`crates/ljos_web_3d`). The chunk is fetched the first
// time a page makes such a view, so a page with none fetches nothing of it.
//
// The objects stay here. `Host` is a view's registry of them, and what the
// wasm reads through it: its reads are of slots, inside the one effect that
// builds, so the effect follows exactly what the mapping read and runs when
// one of those changes. An unset member answers nothing, so that the defaults
// are the mapping's own. A build that draws the same asks for no frame;
// one that draws differently asks for one. Nothing here runs otherwise.
import { located, slot, effect } from "../object.js";
import { color } from "../QtQuick/color.js";
import { guardedFetch } from "../guard.js";
import { signal, untrack } from "#kernel";
import { CustomMaterial } from "./CustomMaterial.js";
import { handed, text } from "./effects.js";
import { inside } from "./Node.js";

const asked = new URLSearchParams(globalThis.location?.search ?? "").get("view3d");

// DECISION: which renderer a View3D has, until `render.js` goes: the page's
// `?view3d=`, else what the build said (`VITE_LJOS_VIEW3D`), else the
// JavaScript one, as long as that alone passes all of `quick3d.spec.js`.
export const renderer = () => asked ?? import.meta.env?.VITE_LJOS_VIEW3D ?? "js";

// A glob, as an import of a file a build of JavaScript alone has not got
// would fail, for the renderer it does not ask for.
const chunks = import.meta.glob("./wgpu/ljos_web_3d.js");

let module = null;
async function chunk() {
  const load = chunks["./wgpu/ljos_web_3d.js"];
  if (!load) throw new Error("View3D: the renderer is not built (mise run build:wasm-3d)");
  module = await load();
  await module.default();
  NAMES = module.propNames();
}
let NAMES = null;

// Views are made one after another: the first makes the page's device, and
// the others share it.
let queue = Promise.resolve();

const NOTHING = 0xffffffff;
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

// A decoded picture's pixels, once.
const decoded = new WeakMap();
function pixelsOf(element) {
  let made = decoded.get(element);
  if (!made) {
    const width = element.naturalWidth ?? element.videoWidth ?? element.width;
    const height = element.naturalHeight ?? element.videoHeight ?? element.height;
    const context = new OffscreenCanvas(width, height).getContext("2d", { willReadFrequently: true });
    context.drawImage(element, 0, 0);
    made = { width, height, pixels: new Uint8Array(context.getImageData(0, 0, width, height).data.buffer) };
    decoded.set(element, made);
  }
  return made;
}

// A shader's numbers, flat.
const numbers = (value) => (typeof value === "number" ? [value] : value);
const toUniform = ({ name, type, value }) => ({ name, type, value: Float32Array.from(numbers(value)) });
const plain = (uniforms) => uniforms.filter(({ type }) => type !== "sampler2D").map(toUniform);

class Host {
  constructor(view, setArrivals, arrivals, ask) {
    this.view = view;
    this.setArrivals = setArrivals;
    this.count = arrivals;
    this.ask = ask;
    this.handles = new Map([[view, 0]]);
    this.objectsBy = new Map([[0, view]]);
    this.next = 1;
    this.touched = new Set();
  }
  handle(object) {
    let handle = this.handles.get(object);
    if (handle === undefined) {
      handle = this.next++;
      this.handles.set(object, handle);
      this.objectsBy.set(handle, object);
    }
    this.touched.add(handle);
    return handle;
  }
  // What the last build did not reach is gone from the scene: it is let go,
  // and the handles of what is made later are others.
  sweep() {
    const gone = [];
    for (const [handle, object] of this.objectsBy) {
      if (handle !== 0 && !this.touched.has(handle)) {
        gone.push(handle);
        this.objectsBy.delete(handle);
        this.handles.delete(object);
      }
    }
    this.touched.clear();
    return gone;
  }
  chain(o) {
    return this.objectsBy.get(o).$type.chain.map((type) => type.typeName);
  }
  number(o, p) {
    const object = this.objectsBy.get(o);
    const name = NAMES[p];
    // A node's x is a part of its position, whichever of them was said.
    if (name === "x" || name === "y" || name === "z") {
      if (!slot(object, name)?.explicit() && !said(object, "position")) return undefined;
      return Number(object[name]);
    }
    const own = slot(object, name);
    if (!own?.explicit()) return undefined;
    const value = Number(own.get());
    return Number.isNaN(value) ? undefined : value;
  }
  boolean(o, p) {
    const own = slot(this.objectsBy.get(o), NAMES[p]);
    return own?.explicit() ? Boolean(own.get()) : undefined;
  }
  color(o, p) {
    const own = slot(this.objectsBy.get(o), NAMES[p]);
    if (!own?.explicit()) return undefined;
    const { r, g, b, a } = color(own.get());
    return Float32Array.of(r, g, b, a);
  }
  vector(o, p) {
    const object = this.objectsBy.get(o);
    const name = NAMES[p];
    // The mapping takes x, y and z where it is not told a position.
    if (name === "position" || !said(object, name)) return undefined;
    const { x, y, z } = object[name];
    return Float32Array.of(x, y, z);
  }
  quaternion(o, p) {
    const own = slot(this.objectsBy.get(o), NAMES[p]);
    if (!own?.explicit()) return undefined;
    const { x, y, z, scalar } = own.get();
    return Float32Array.of(x, y, z, scalar);
  }
  url(o, p) {
    const own = slot(this.objectsBy.get(o), NAMES[p]);
    if (!own?.explicit()) return undefined;
    const value = own.get();
    return value == null ? undefined : String(value);
  }
  object(o, p) {
    const value = slot(this.objectsBy.get(o), NAMES[p])?.get();
    return value?.$type ? this.handle(value) : undefined;
  }
  objects(o, p) {
    const object = this.objectsBy.get(o);
    const name = NAMES[p];
    let all;
    if (name === "data" && object === this.view) all = inside(object.$scene);
    else if (name === "data" && object.$spatial !== undefined) all = inside(object);
    else all = listed(slot(object, name)?.get());
    return Uint32Array.from(all.filter((each) => each?.$type).map((each) => this.handle(each)));
  }
  slots(o, p) {
    const all = listed(slot(this.objectsBy.get(o), NAMES[p])?.get());
    return Uint32Array.from(all.map((each) => (each?.$type ? this.handle(each) : NOTHING)));
  }
  authored(o, p) {
    return said(this.objectsBy.get(o), NAMES[p]);
  }
  matrices(o, p) {
    const all = listed(slot(this.objectsBy.get(o), NAMES[p])?.get());
    return Float32Array.from(all.flatMap((m) => (m ? [m.m11, m.m21, m.m31, m.m41, m.m12, m.m22, m.m32, m.m42, m.m13, m.m23, m.m33, m.m43, m.m14, m.m24, m.m34, m.m44] : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])));
  }
  // What a Texture shows, where that is pixels: a live item's is not yet.
  shown(o) {
    const texture = this.objectsBy.get(o).$texture?.();
    if (!texture || texture.live || texture.view) return null;
    if (texture.data) return texture.data.format === "RGBA8" ? texture : null;
    return texture.element ? texture : null;
  }
  pictureId(o) {
    const texture = this.shown(o);
    return texture ? serialOf(texture.data ?? texture.element) : undefined;
  }
  picture(o) {
    const texture = this.shown(o);
    if (!texture) return undefined;
    const { width, height, pixels } = texture.data ?? pixelsOf(texture.element);
    return { width, height, pixels, opaque: !texture.sheer };
  }
  geometryId(o) {
    const held = this.objectsBy.get(o).$held?.();
    return held?.stride > 0 ? serialOf(held) : undefined;
  }
  geometry(o) {
    return this.objectsBy.get(o).$held?.();
  }
  tableId(o) {
    const table = this.objectsBy.get(o).$table?.();
    return table ? serialOf(table.data) : undefined;
  }
  table(o) {
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
      destinationBlend: material.destinationBlend,
      depthDraw: material.depthDrawMode,
      cullMode: material.cullMode,
    };
  }
  passes(o) {
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
        };
      }),
      buffers,
    };
  }
  arrivals() {
    this.count();
  }
  arrived() {
    this.setArrivals((count) => count + 1);
  }
  async fetched(url) {
    const response = await guardedFetch(located(url));
    if (!response.ok) throw `${response.status} ${response.statusText}`;
    return new Uint8Array(await response.arrayBuffer());
  }
  report(url, error) {
    console.warn(`${this.view.$type.typeName}: ${url}: ${error}`);
  }
  request() {
    this.ask();
  }
}

// Draws `self` on `canvas`. What a test or a tool may ask (the backend, how
// many frames and builds) is on the canvas.
export function drawOn(self, canvas, told) {
  const [made, setMade] = signal(null, self.$owner);
  const [arrivals, setArrivals] = signal(0, self.$owner);
  let frame = 0;
  let gone = false;
  const state = (canvas.$view3d = { backend: null, frames: 0, builds: 0, error: null });
  const host = new Host(
    self,
    setArrivals,
    arrivals,
    () =>
      (frame ||= requestAnimationFrame(() => {
        frame = 0;
        const from = performance.now();
        if (made()?.frame()) {
          state.frames++;
          told(from, performance.now());
        }
      })),
  );

  const size = (width, height) => [Math.max(1, Math.round(width * devicePixelRatio)), Math.max(1, Math.round(height * devicePixelRatio))];
  [canvas.width, canvas.height] = untrack(() => size(self.width, self.height));
  queue = queue
    .then(async () => {
      if (gone) return;
      if (!module) await chunk();
      const view = await module.View3d.create(canvas, host);
      if (gone) return void view.free();
      state.backend = view.backend();
      setMade(() => view);
    })
    .catch((error) => {
      state.error = String(error?.message ?? error);
      console.error(`View3D: ${state.error}`);
    });

  // The item's own size says when, without watching the element.
  effect(
    () => ({ view: made(), width: self.width, height: self.height }),
    ({ view, width, height }) => {
      if (view) view.resize(...size(width, height));
    },
  );
  effect(
    () => {
      const view = made();
      if (!view) return;
      view.build();
      state.builds++;
      const dropped = host.sweep();
      if (dropped.length > 0) view.forget(Uint32Array.from(dropped));
    },
    () => {},
  );

  return () => {
    gone = true;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    const view = made();
    if (view) {
      setMade(null);
      view.free();
    }
  };
}


// ShaderEffect: an item painted by a fragment shader, and shaped by a vertex
// shader, with the item's properties as the shaders' uniforms.
//
// Qt draws with shaders baked by its `qsb` tool from Vulkan-style GLSL; in
// what it bakes is the same shader for OpenGL ES, which is what a browser
// draws with. The build has that put where `fragmentShader` names the baked
// file (`vite.js`); a shader fetched from elsewhere is OpenGL ES as it is,
// or a baked file, of which the one for OpenGL ES is taken.
//
// Every effect is drawn by one WebGL context, of which a page may have few,
// and what was drawn is handed to the effect's own canvas.
//
// Not here: an item that is neither a picture, a Canvas nor another effect
// as a texture (a page cannot draw its own elements into one), `blending:
// false`, and a texture that follows a Canvas as it is painted.
import { onCleanup } from "solid-js";
import { defineType, effect, flush, located, QtObject, slot } from "../object.js";
import { Size } from "../QtQml/values.js";
import { Color, color } from "./color.js";
import { drawn as shown } from "./drawn.js";
import { Item } from "./Item.js";
import { signal } from "#kernel";

const sheet = new CSSStyleSheet();
sheet.replaceSync(`.qq-shader { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }`);
document.adoptedStyleSheets.push(sheet);

const Compiled = 0;
const Uncompiled = 1;
const Failed = 2;
const NoCulling = 0;
const BackFaceCulling = 1;

// The shaders Qt uses for the stage an effect says nothing of. They have no
// uniforms: Qt bakes a block of uniforms to a structure, and one of the same
// name in both stages has to be the same in both.
const VERTEX = {
  300: `#version 300 es
layout(location = 0) in vec4 qt_Vertex;
layout(location = 1) in vec2 qt_MultiTexCoord0;
out vec2 qt_TexCoord0;
void main() {
    qt_TexCoord0 = qt_MultiTexCoord0;
    gl_Position = vec4(qt_MultiTexCoord0.x * 2.0 - 1.0, 1.0 - qt_MultiTexCoord0.y * 2.0, 0.0, 1.0);
}
`,
  100: `#version 100
attribute vec4 qt_Vertex;
attribute vec2 qt_MultiTexCoord0;
varying vec2 qt_TexCoord0;
void main() {
    qt_TexCoord0 = qt_MultiTexCoord0;
    gl_Position = vec4(qt_MultiTexCoord0.x * 2.0 - 1.0, 1.0 - qt_MultiTexCoord0.y * 2.0, 0.0, 1.0);
}
`,
};
const FRAGMENT = {
  300: `#version 300 es
precision highp float;
in vec2 qt_TexCoord0;
uniform sampler2D source;
layout(location = 0) out vec4 fragColor;
void main() { fragColor = texture(source, qt_TexCoord0); }
`,
  100: `#version 100
precision highp float;
varying vec2 qt_TexCoord0;
uniform sampler2D source;
void main() { gl_FragColor = texture2D(source, qt_TexCoord0); }
`,
};

const version = (source) => (/^\s*#version\s+300\s+es/.test(source) ? 300 : 100);

let surface;
let gl;
function context() {
  if (gl !== undefined) return gl;
  surface = new OffscreenCanvas(1, 1);
  gl = surface.getContext("webgl2", { antialias: false }) ?? null;
  if (gl) gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  return gl;
}

// A shader's text, by where it is: at once when the build put it in the
// address itself, otherwise when it has been fetched.
const texts = new Map();
function text(url) {
  let record = texts.get(url);
  if (record) return record;
  const [state, setState] = signal(null);
  texts.set(url, (record = { state }));
  const took = (source) => {
    if (/^\s*(#version|precision|\/\/|\/\*|void|uniform|attribute|in |varying)/.test(source)) return setState({ source });
    // What Qt bakes is not text; what a server answers with for a file it
    // does not have often is.
    const baked = /[\0-\x08]/.test(source.slice(0, 64));
    setState({ error: baked ? `${url} is a shader baked for Qt, with none for OpenGL ES in it` : `${url} is not a shader` });
  };
  if (url.startsWith("data:")) took(decodeURIComponent(url.slice(url.indexOf(",") + 1)));
  else {
    fetch(url)
      .then((answer) => (answer.ok ? answer.arrayBuffer() : Promise.reject(new Error(`${answer.status}`))))
      .then(async (data) => {
        const bytes = new Uint8Array(data);
        const source = new TextDecoder().decode(bytes);
        return /[\0-\x08]/.test(source.slice(0, 64)) ? ((await unbaked(bytes)) ?? source) : source;
      })
      .then(took, (error) => setState({ error: `${url} could not be read: ${error.message}` }))
      .then(() => flush());
  }
  return record;
}

// The shader for OpenGL ES in what Qt's `qsb` baked, or nothing when `bytes`
// are no such file. A baked file is the length of what it holds and that
// compressed, as `qCompress` leaves it; in it each shader is its length and
// its text, and the text says in its first line what it is written for.
const LATIN = new TextDecoder("latin1");
async function unbaked(bytes) {
  let held = bytes;
  if (bytes[4] === 0x78) {
    try {
      const stream = new Blob([bytes.subarray(4)]).stream().pipeThrough(new DecompressionStream("deflate"));
      held = new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      return null;
    }
  }
  const view = new DataView(held.buffer, held.byteOffset, held.byteLength);
  const found = {};
  for (const match of LATIN.decode(held).matchAll(/#version (300 es|100)\n/g)) {
    if (match.index < 4) continue;
    const length = view.getUint32(match.index - 4);
    if (length < match[0].length || match.index + length > held.length) continue;
    found[match[1]] ??= new TextDecoder().decode(held.subarray(match.index, match.index + length));
  }
  return found["300 es"] ?? found["100"] ?? null;
}

// A program for two shaders, and what it asks for: one for every effect
// that draws with the same two.
const programs = new Map();
function program(vertex, fragment) {
  const key = `${vertex}\0${fragment}`;
  let made = programs.get(key);
  if (made) return made;
  const built = gl.createProgram();
  const logs = [];
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) logs.push(gl.getShaderInfoLog(shader));
    gl.attachShader(built, shader);
    gl.deleteShader(shader);
  }
  gl.bindAttribLocation(built, 0, "qt_Vertex");
  gl.bindAttribLocation(built, 1, "qt_MultiTexCoord0");
  gl.linkProgram(built);
  if (logs.length === 0 && !gl.getProgramParameter(built, gl.LINK_STATUS)) logs.push(gl.getProgramInfoLog(built));
  const uniforms = [];
  if (logs.length === 0) {
    const count = gl.getProgramParameter(built, gl.ACTIVE_UNIFORMS);
    let unit = 0;
    for (let index = 0; index < count; index++) {
      const { name, type } = gl.getActiveUniform(built, index);
      // `ubuf.speed`: a member of the block Qt baked to a structure.
      const property = name.replace(/\[0\]$/, "").split(".").pop();
      const sampler = type === gl.SAMPLER_2D;
      uniforms.push({ property, type, location: gl.getUniformLocation(built, name), unit: sampler ? unit++ : -1 });
    }
  }
  programs.set(key, (made = { program: logs.length ? null : built, log: logs.join("\n"), uniforms }));
  return made;
}

// A value as the numbers a shader takes it as: a colour premultiplied, as
// Qt gives it.
function numbers(value, count) {
  let all;
  if (typeof value === "number" || typeof value === "boolean") all = [Number(value)];
  else if (typeof value === "string" || value instanceof Color) {
    const { r, g, b, a } = color(value);
    all = [r * a, g * a, b * a, a];
  } else if (value && typeof value === "object") {
    all = ["x", "y", "z", "w", "width", "height"].filter((key) => typeof value[key] === "number").map((key) => value[key]);
  } else all = [];
  while (all.length < count) all.push(0);
  return all.slice(0, count);
}

// A matrix as OpenGL takes one: column by column.
function columns(matrix) {
  const cells = [];
  for (let column = 1; column <= 4; column++) {
    for (let row = 1; row <= 4; row++) cells.push(matrix?.[`m${row}${column}`] ?? (row === column ? 1 : 0));
  }
  return cells;
}

// What an item is as a texture: a picture, or a canvas something draws on.
// A picture is loaded for it, apart from the one the page shows. A source
// that is of a part of its item (`sourceRect`) is that part, cut out when
// it is drawn with: the item may be painted again until then.
const pictures = new Map();
function drawable(item) {
  let part = null;
  for (let seen = 0; item?.sourceItem !== undefined && seen < 8; seen++) {
    const { sourceRect: rect, sourceItem: of } = item;
    if (!part && of && rect?.width > 0 && rect?.height > 0) {
      const { width, height } = of;
      if (width > 0 && height > 0) part = { source: item, x: rect.x / width, y: rect.y / height, width: rect.width / width, height: rect.height / height };
    }
    item = of;
  }
  const whole = item ? taken(item) : null;
  return whole && part && !whole.keep ? { ...part, whole } : whole;
}

function taken(item) {
  // Another effect, as it was last drawn: it keeps that as a texture once
  // it is asked to.
  if (item.$shader) return item.$shader.drawn() >= 0 ? item.$shader : null;
  if (item.$canvas?.element) return item.$canvas.element;
  const url = typeof item.source === "string" || item.source instanceof URL ? located(String(item.source)) : "";
  if (!url) return null;
  let record = pictures.get(url);
  if (!record) {
    const [ready, setReady] = signal(false);
    const element = new Image();
    record = { element, ready };
    pictures.set(url, record);
    element.crossOrigin = "anonymous";
    element.onload = () => {
      setReady(true);
      flush();
    };
    element.src = url;
  }
  return record.ready() ? record.element : null;
}

// The part of a canvas or a picture a source is of, on a canvas of its own.
const parts = new WeakMap();
function cut({ source, whole, x, y, width, height }) {
  const wide = whole.naturalWidth ?? whole.width;
  const tall = whole.naturalHeight ?? whole.height;
  let canvas = parts.get(source);
  if (!canvas) parts.set(source, (canvas = document.createElement("canvas")));
  canvas.width = Math.max(Math.round(width * wide), 0);
  canvas.height = Math.max(Math.round(height * tall), 0);
  if (canvas.width > 0 && canvas.height > 0 && wide > 0 && tall > 0) {
    canvas.getContext("2d").drawImage(whole, x * wide, y * tall, width * wide, height * tall, 0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

const textures = new WeakMap();
function texture(element, unit, repeat) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  if (element.keep) {
    if (!element.kept) return nothing(unit), element.keep();
    gl.bindTexture(gl.TEXTURE_2D, element.kept);
    return wrapped(repeat);
  }
  let made = textures.get(element);
  const fresh = !made;
  if (fresh) textures.set(element, (made = gl.createTexture()));
  gl.bindTexture(gl.TEXTURE_2D, made);
  // A canvas may have been drawn on since.
  if (fresh || !(element instanceof HTMLImageElement)) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, element);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  }
  wrapped(repeat);
}

function wrapped(repeat) {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat & 1 ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeat & 2 ? gl.REPEAT : gl.CLAMP_TO_EDGE);
}

// What was just drawn, kept as a texture the right way up: OpenGL's first
// row is the bottom one, a texture's the top.
let frame;
function keep(kept, width, height) {
  kept ??= gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, kept);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  frame ??= gl.createFramebuffer();
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, frame);
  gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, kept, 0);
  gl.blitFramebuffer(0, 0, width, height, 0, height, width, 0, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  return kept;
}

let empty;
function nothing(unit) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  if (!empty) {
    empty = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, empty);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  } else gl.bindTexture(gl.TEXTURE_2D, empty);
}

// The item as a grid of triangles: where each corner is in the item, and in
// the texture.
const meshes = new Map();
function grid(across, down, width, height) {
  const key = `${across} ${down} ${width} ${height}`;
  let made = meshes.get(key);
  if (made) return made;
  const corners = [];
  for (let row = 0; row <= down; row++) {
    for (let column = 0; column <= across; column++) {
      const u = column / across;
      const v = row / down;
      corners.push(u * width, v * height, u, v);
    }
  }
  const order = [];
  for (let row = 0; row < down; row++) {
    for (let column = 0; column < across; column++) {
      const at = row * (across + 1) + column;
      order.push(at, at + across + 1, at + 1, at + 1, at + across + 1, at + across + 2);
    }
  }
  const array = gl.createVertexArray();
  gl.bindVertexArray(array);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(corners), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(order), gl.STATIC_DRAW);
  // Few sizes are drawn at any time: an item being resized leaves a trail.
  if (meshes.size > 64) {
    for (const [old, { array }] of meshes) {
      gl.deleteVertexArray(array);
      meshes.delete(old);
      break;
    }
  }
  meshes.set(key, (made = { array, count: order.length }));
  return made;
}

function set(uniform, value) {
  const { location, type } = uniform;
  if (type === gl.FLOAT_MAT4) gl.uniformMatrix4fv(location, false, value);
  else if (type === gl.FLOAT) gl.uniform1f(location, value[0]);
  else if (type === gl.FLOAT_VEC2) gl.uniform2fv(location, value);
  else if (type === gl.FLOAT_VEC3) gl.uniform3fv(location, value);
  else if (type === gl.FLOAT_VEC4) gl.uniform4fv(location, value);
  else if (type === gl.INT || type === gl.BOOL) gl.uniform1i(location, value[0]);
  else if (type === gl.INT_VEC2 || type === gl.BOOL_VEC2) gl.uniform2iv(location, value);
  else if (type === gl.INT_VEC3 || type === gl.BOOL_VEC3) gl.uniform3iv(location, value);
  else if (type === gl.INT_VEC4 || type === gl.BOOL_VEC4) gl.uniform4iv(location, value);
}

const WIDTH = { [0x8b50]: 2, [0x8b51]: 3, [0x8b52]: 4, [0x8b53]: 2, [0x8b54]: 3, [0x8b55]: 4, [0x8b57]: 2, [0x8b58]: 3, [0x8b59]: 4 };

export const GridMesh = defineType("GridMesh", QtObject, {
  properties: {
    resolution: new Size(1, 1),
  },
});

export const ShaderEffect = defineType("ShaderEffect", Item, {
  properties: {
    fragmentShader: "",
    vertexShader: "",
    blending: true,
    mesh: null,
    cullMode: NoCulling,
    log: "",
    status: Uncompiled,
    supportsAtlasTextures: false,
  },
  enums: { NoCulling, BackFaceCulling, FrontFaceCulling: 2, Compiled, Uncompiled, Error: Failed },
  setup(self) {
    const canvas = document.createElement("canvas");
    canvas.className = "qq-shader";
    canvas.width = canvas.height = 0;
    self.$node.append(canvas);
    const [drawn, setDrawn] = signal(0, self.$owner);
    const [asked, setAsked] = signal(false, self.$owner);
    const shader = (self.$shader = { canvas, drawn, kept: null, keep: () => setAsked(true) });
    onCleanup(() => shader.kept && gl.deleteTexture(shader.kept));
    const paper = canvas.getContext("bitmaprenderer");

    // The two shaders once both are there, and the program of them.
    const built = () => {
      const stages = [self.vertexShader, self.fragmentShader].map((url) => (url ? text(located(String(url))).state() : {}));
      if (stages.some((stage) => !stage)) return null;
      const failed = stages.find((stage) => stage.error);
      if (failed) return { program: null, log: failed.error, uniforms: [] };
      if (!context()) return { program: null, log: "the browser has no WebGL 2 to draw a shader with", uniforms: [] };
      const [vertex, fragment] = stages.map((stage) => stage.source);
      const level = version(vertex ?? fragment ?? "#version 300 es");
      return program(vertex ?? VERTEX[level], fragment ?? FRAGMENT[level]);
    };

    effect(
      () => {
        const made = built();
        if (!made?.program) return [made];
        const { width, height } = self;
        const values = made.uniforms.map((uniform) => {
          const { property, type, unit } = uniform;
          if (property === "qt_Matrix") {
            return [2 / (width || 1), 0, 0, 0, 0, -2 / (height || 1), 0, 0, 0, 0, 1, 0, -1, 1, 0, 1];
          }
          // The item's opacity is the page's to apply, as its parents' is.
          if (property === "qt_Opacity") return [1];
          const value = shown(self, property);
          if (unit >= 0) return [drawable(value), value?.wrapMode ?? 0];
          return type === gl.FLOAT_MAT4 ? columns(value) : numbers(value, WIDTH[type] ?? 1);
        });
        const { width: across = 1, height: down = 1 } = self.mesh?.resolution ?? {};
        return [made, width, height, values, Math.max(1, across), Math.max(1, down), self.cullMode, asked()];
      },
      ([made, width, height, values, across, down, cullMode, asked]) => {
        slot(self, "status").provide(!made ? Uncompiled : made.program ? Compiled : Failed);
        slot(self, "log").provide(made?.log ?? "");
        if (made && !made.program && shader.said !== made.log) console.warn(`ShaderEffect: ${(shader.said = made.log)}`);
        const ratio = window.devicePixelRatio || 1;
        const w = Math.round(width * ratio);
        const h = Math.round(height * ratio);
        if (!made?.program || w <= 0 || h <= 0) {
          canvas.width = canvas.height = 0;
          return;
        }
        if (surface.width !== w) surface.width = w;
        if (surface.height !== h) surface.height = h;
        gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.disable(gl.BLEND);
        // A triangle seen from the front goes anticlockwise in the item,
        // where y is down.
        if (cullMode === NoCulling) gl.disable(gl.CULL_FACE);
        else {
          gl.enable(gl.CULL_FACE);
          gl.frontFace(gl.CCW);
          gl.cullFace(cullMode === BackFaceCulling ? gl.BACK : gl.FRONT);
        }
        gl.useProgram(made.program);
        made.uniforms.forEach((uniform, index) => {
          if (uniform.unit < 0) return set(uniform, values[index]);
          const [given, wrapMode] = values[index];
          const element = given?.whole ? cut(given) : given;
          if (element?.keep || (element && element.width > 0 && element.height > 0)) texture(element, uniform.unit, wrapMode);
          else nothing(uniform.unit);
          gl.uniform1i(uniform.location, uniform.unit);
        });
        const mesh = grid(across, down, width, height);
        gl.bindVertexArray(mesh.array);
        gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
        if (asked) shader.kept = keep(shader.kept, w, h);
        // The picture leaves the surface for the canvas: nothing is copied.
        paper.transferFromImageBitmap(surface.transferToImageBitmap());
        setDrawn((count) => count + 1);
      },
    );
  },
});

// ShaderEffectSource: an item as a texture for a ShaderEffect. A picture or
// a canvas can be one here; of any other item there is nothing to draw, and
// the source shows nothing itself.
export const ShaderEffectSource = defineType("ShaderEffectSource", Item, {
  properties: {
    sourceItem: null,
    hideSource: false,
    live: true,
    wrapMode: 0,
    sourceRect: null,
    textureSize: new Size(0, 0),
    format: 0,
    mipmap: false,
    recursive: false,
    textureMirroring: 2,
    samples: 0,
  },
  enums: {
    ClampToEdge: 0,
    RepeatHorizontally: 1,
    RepeatVertically: 2,
    Repeat: 3,
    RGBA8: 0,
    RGBA16F: 1,
    RGBA32F: 2,
    Alpha: 3,
    RGB: 4,
    RGBA: 5,
    NoMirroring: 0,
    MirrorHorizontally: 1,
    MirrorVertically: 2,
  },
  signals: ["scheduledUpdateCompleted"],
  methods: {
    scheduleUpdate() {
      this.scheduledUpdateCompleted();
    },
  },
  setup(self) {
    // The item goes on being drawn into the texture, and is not seen.
    let hidden = null;
    effect(
      () => [self.sourceItem, self.hideSource],
      ([item, hide]) => {
        const node = hide ? (item?.$node ?? null) : null;
        if (hidden && hidden !== node) hidden.style.visibility = "";
        if (node) node.style.visibility = "hidden";
        hidden = node;
      },
    );
  },
});

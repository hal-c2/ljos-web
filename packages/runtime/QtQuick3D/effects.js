// Effect and what one is made of: the shaders it runs over the picture of a
// scene once that is drawn (Shader), in what order and into what (Pass,
// Buffer), and what each is handed (BufferInput, SetUniformValue). Also
// TextureInput, by which an effect or a material names a picture one of
// its shaders reads, and what the properties of either are to its shaders.
//
// An effect's shaders are pieces as Qt has them written (`shaders.js` says
// how), and are handed the effect's own properties, those its QML declares,
// as a CustomMaterial's are handed its. Each pass draws the picture the
// effect was given (`INPUT`) into the one the next effect is given, or into
// a Buffer, which a later pass reads in its place or by the name of one of
// the effect's pictures. A Buffer is what its `name` says: two of one name
// are one, in whichever effects of a view they are, and one without a name
// is none, but says what kind of picture the effect leaves.
//
// The effects of QtQuick3D.Effects are such effects, written in QML: Ljós's
// own (`quick3d/`), or Qt's files and shaders where Qt is installed.
//
// Not here: a Buffer is kept from one picture to the next whether it says
// so or not (`bufferFlags`), and of an ExtendedSceneEnvironment's effects
// only what the renderer itself does (`Helpers/impl`).
import { defineType, kinds, located, slot } from "../object.ts";
import { Matrix4x4, Point, Quaternion, Rect, Size, Vector2d, Vector3d, Vector4d } from "../QtQml/values.ts";
import { Color } from "../QtQuick/color.ts";
import { Object3D } from "./Node.js";
import { file, linear } from "./scene.js";
import { mentioned } from "./shaders.js";

export const TextureInput = defineType("TextureInput", Object3D, {
  properties: {
    texture: null,
    enabled: true,
  },
});

const decoder = new TextDecoder();
const warned = new Set();

// The text of a shader file: nothing where none is named, null until it is
// here.
export function text(url, self) {
  const given = String(url ?? "");
  if (!given) return "";
  const at = located(given);
  const read = file(at, "text", (buffer) => decoder.decode(buffer)).state();
  if (read?.error) {
    if (!warned.has(at)) console.warn(`${self.$type.typeName}: ${at}: ${read.error}`);
    warned.add(at);
    return "";
  }
  return read;
}

// What a property is to a shader: the type of its uniform and the numbers
// handed over, or nothing for what a shader cannot be handed. A picture is
// handed as its TextureInput.
export function uniform(kind, value) {
  if (kind === kinds.bool || typeof value === "boolean") return { type: "bool", value: value ? 1 : 0 };
  if (kind === kinds.int) return { type: "int", value: Number(value) | 0 };
  if (kind === kinds.real || typeof value === "number") return { type: "float", value: Number(value) || 0 };
  // A colour is in linear light to a shader, as it is to a material.
  if (kind === kinds.color || value instanceof Color) return { type: "vec4", value: linear(value) };
  if (value instanceof Vector2d) return { type: "vec2", value: [value.x, value.y] };
  if (value instanceof Vector3d) return { type: "vec3", value: [value.x, value.y, value.z] };
  if (value instanceof Vector4d) return { type: "vec4", value: [value.x, value.y, value.z, value.w] };
  if (value instanceof Quaternion) return { type: "vec4", value: [value.x, value.y, value.z, value.scalar] };
  if (value instanceof Rect) return { type: "vec4", value: [value.x, value.y, value.width, value.height] };
  if (value instanceof Size) return { type: "vec2", value: [value.width, value.height] };
  if (value instanceof Point) return { type: "vec2", value: [value.x, value.y] };
  if (value instanceof Matrix4x4) {
    const m = value;
    return { type: "mat4", value: [m.m11, m.m21, m.m31, m.m41, m.m12, m.m22, m.m32, m.m42, m.m13, m.m23, m.m33, m.m43, m.m14, m.m24, m.m34, m.m44] };
  }
  if (value?.$type?.chain.includes(TextureInput)) return { type: "sampler2D", value };
  return null;
}

// The properties an object's QML declares, which are those of the types
// after `Type` in what it is: every one, in the order they are declared.
const owned = new WeakMap();
export function declared(self, Type) {
  let names = owned.get(self.$type);
  if (!names) {
    const { chain } = self.$type;
    names = [...new Set(chain.slice(chain.indexOf(Type) + 1).flatMap((type) => Object.keys(type.spec.properties ?? {})))];
    owned.set(self.$type, names);
  }
  return names;
}

// What an object's own properties are to its shaders: `uniforms`, each a
// name, a type and a value, where a picture's value is what the renderer
// reads of its texture, or null for one that has none (which reads as
// black, nothing seen through it). `waiting` is whether a picture is not
// here yet: one that names nothing never is, and is not waited for.
export function handed(self, Type) {
  const uniforms = [];
  let waiting = false;
  for (const name of declared(self, Type)) {
    const value = self[name];
    const told = uniform(slot(self, name)?.kind, value);
    if (!told) continue;
    if (told.type === "sampler2D") {
      const texture = value.enabled ? value.texture : null;
      told.value = texture?.$texture?.() ?? null;
      const named = texture && (texture.sourceItem || texture.textureData || String(texture.source ?? ""));
      if (named && !told.value) waiting = true;
    }
    uniforms.push({ name, ...told });
  }
  return { uniforms, waiting };
}

// How uniforms are declared to a shader.
export const declaration = (uniforms) => uniforms.map(({ name, type }) => `uniform ${type === "sampler2D" ? "highp sampler2D" : type} ${name};`).join("\n");

const FORMATS = { Unknown: 0, RGBA8: 1, RGBA16F: 2, RGBA32F: 3, R8: 4, R16: 5, R16F: 6, R32F: 7 };
const Nearest = 1;
const Linear = 2;
const ClampToEdge = 1;

export const Buffer = defineType("Buffer", Object3D, {
  properties: {
    format: FORMATS.RGBA8,
    textureFilterOperation: Linear,
    textureCoordOperation: ClampToEdge,
    sizeMultiplier: 1,
    bufferFlags: 0,
    name: "",
  },
  // `Unknown` is the first of each of the three it is an answer to.
  enums: { ...FORMATS, Nearest, Linear, ClampToEdge, MirroredRepeat: 2, Repeat: 3, None: 0, SceneLifetime: 1 },
  setup(self) {
    // What the renderer draws into for it, which it keeps by the name.
    self.$buffer = () => ({
      name: String(self.name ?? ""),
      format: self.format,
      filter: self.textureFilterOperation,
      wrap: self.textureCoordOperation,
      scale: Number(self.sizeMultiplier) || 0,
    });
  },
});

export const Command = defineType("Command", Object3D, {});

export const BufferInput = defineType("BufferInput", Command, {
  properties: {
    buffer: null,
    sampler: "",
  },
});

export const SetUniformValue = defineType("SetUniformValue", Command, {
  properties: {
    target: "",
    value: undefined,
  },
});

const Vertex = 0;
const Fragment = 1;

export const Shader = defineType("Shader", Object3D, {
  properties: {
    shader: "",
    stage: Fragment,
  },
  enums: { Vertex, Fragment },
});

export const Pass = defineType("Pass", Object3D, {
  properties: {
    commands: undefined,
    output: null,
    shaders: undefined,
  },
});

const list = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);
const is = (object, Type) => Boolean(object?.$type?.chain.includes(Type));

// The shaders of a pass, once for all that have the same: what the
// renderer makes a program of, and keeps it by.
const sources = new Map();
function source(told, samplers, vertex, fragment) {
  const key = [told, vertex, fragment].join("\u0000");
  let made = sources.get(key);
  if (!made) {
    made = { vertex, fragment, declared: told, samplers, depth: mentioned(`${vertex}\n${fragment}`).has("DEPTH_TEXTURE") };
    sources.set(key, made);
  }
  return made;
}

export const Effect = defineType("Effect", Object3D, {
  properties: {
    passes: undefined,
  },
  setup(self) {
    // What the renderer runs: the effect's properties as its shaders are
    // handed them, and each pass with its shaders, what it reads and what
    // it draws into. `waiting` while a shader or a picture is not here.
    self.$passes = () => {
      const { uniforms, waiting } = handed(self, Effect);
      const told = declaration(uniforms);
      const samplers = uniforms.filter(({ type }) => type === "sampler2D").map(({ name }) => name);
      let late = waiting;
      const passes = list(self.passes)
        .filter((pass) => is(pass, Pass))
        .map((pass) => {
          const pieces = ["", ""];
          for (const shader of list(pass.shaders)) {
            if (!is(shader, Shader)) continue;
            const read = text(shader.shader, self);
            if (read === null) late = true;
            else pieces[shader.stage === Vertex ? 0 : 1] = read;
          }
          const reads = [];
          const set = [];
          // A Buffer without a name is the picture the effect was given,
          // to a pass that reads it, and the one it leaves, to one that
          // draws into it.
          const named = (buffer) => {
            const told = buffer?.$buffer?.();
            return told?.name ? told : null;
          };
          for (const command of list(pass.commands)) {
            if (is(command, BufferInput)) reads.push({ buffer: named(command.buffer), sampler: String(command.sampler ?? "") });
            else if (is(command, SetUniformValue)) {
              // A property is what its type says, whatever it is set to.
              const name = String(command.target ?? "");
              const kind = uniforms.find((each) => each.name === name);
              const given = kind && uniform(slot(self, name)?.kind, command.value);
              if (given && given.type === kind.type && given.type !== "sampler2D") set.push({ name, ...given });
            }
          }
          // `format` is the kind of picture the effect leaves, where the
          // pass says one: nothing for the kind it was given.
          const output = named(pass.output);
          return { source: source(told, samplers, ...pieces), reads, set, output, format: output ? 0 : (pass.output?.$buffer?.().format ?? 0) };
        });
      return { uniforms, passes, waiting: late };
    };
  },
});

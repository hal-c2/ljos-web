// What a system's sprites and lines are to a renderer that only draws models
// (`../wgpu.js`): one rectangle to a kind, once for each row of a table, as
// Ljós's own engine draws them. Only that renderer's chunk imports this: a
// page on the other one does not carry these shaders.

import { defineType, derived, inside } from "../../object.js";
import { CustomMaterial } from "../CustomMaterial.js";
import { TextureInput } from "../effects.js";
import { Node, Object3D } from "../Node.js";
import { Material, Model } from "../scene.js";
import * as math from "../math.js";
import { away, drawnOf, EACH, farthest } from "./paint.js";

const Normal = 0;
const Screen = 1;
const Multiply = 2;
// Numbers to a row of a table, as `../instancing.js` keeps them.
const ROW = 20;

const VARYINGS = `VARYING vec4 tint;
VARYING vec2 place;
VARYING vec2 look;
VARYING float row;
`;

// A row is where the sprite is, how it is turned, and in its custom data its
// size, how far through its life it is and how far through its pictures.
const SPRITE = `${VARYINGS}
void MAIN()
{
    tint = INSTANCE_COLOR;
    place = UV0;
    look = INSTANCE_DATA.yz;
    row = fract(sin(float(INSTANCE_INDEX) * 12.9898) * 43758.5453);
    vec3 centre = INSTANCE_MODEL_MATRIX[3].xyz;
    float size = INSTANCE_DATA.x;
    // How a sprite is turned is its own: what the system's scale and turn did
    // to the row is taken out again, as a sprite is as big as it is told
    // wherever its system is.
    mat3 own = inverse(mat3(MODEL_MATRIX)) * mat3(INSTANCE_MODEL_MATRIX);
    if (billboard) {
        // Before the eye it is turned the other way round, as Qt has it.
        vec4 seen = VIEW_MATRIX * vec4(centre, 1.0);
        seen.xyz += transpose(own) * (VERTEX / 100.0 * size);
        POSITION = PROJECTION_MATRIX * seen;
    } else {
        POSITION = VIEWPROJECTION_MATRIX * vec4(centre + own * (VERTEX / 100.0 * size), 1.0);
    }
}
`;

// How much of a line is there changes along a piece, and a row has room for
// one colour: its alpha holds both ends, one as a whole number of steps and the other as what is left over.
const STEPS = 4095;

// A row is one piece of a line: its first column goes from the piece's middle
// to its end, its other two are the way it is wide at each end, so that one
// piece goes on from the last where a line bends, and its custom data has the
// widths at its two ends and how far along the line those ends are.
const LINE = `${VARYINGS}
void MAIN()
{
    float along = VERTEX.x / 100.0 + 0.5;
    float ends = floor(INSTANCE_COLOR.a);
    tint = vec4(INSTANCE_COLOR.rgb, mix(ends / ${STEPS}.0, INSTANCE_COLOR.a - ends, along));
    float side = VERTEX.y / 100.0;
    place = vec2(mix(INSTANCE_DATA.z, INSTANCE_DATA.w, along), UV0.y);
    look = vec2(0.0);
    row = 0.0;
    vec3 middle = INSTANCE_MODEL_MATRIX[3].xyz;
    vec3 way = INSTANCE_MODEL_MATRIX[0].xyz * VERTEX.x;
    float width = mix(INSTANCE_DATA.x, INSTANCE_DATA.y, along);
    vec3 across = mix(INSTANCE_MODEL_MATRIX[1].xyz, INSTANCE_MODEL_MATRIX[2].xyz, along);
    if (billboard) {
        vec4 seen = VIEW_MATRIX * vec4(middle + way, 1.0);
        vec2 aside = (mat3(VIEW_MATRIX) * across).xy;
        float wide = length(aside);
        if (wide > 0.0) {
            seen.xy += aside / wide * side * width;
        }
        POSITION = PROJECTION_MATRIX * seen;
    } else {
        POSITION = VIEWPROJECTION_MATRIX * vec4(middle + way + across * side * width, 1.0);
    }
}
`;

// The sums of tone mapping are those of the program models are drawn with:
// what is laid over the scene is laid over what the eye is shown, and an
// unshaded material is told nothing of that.
const PIXELS = `${VARYINGS}
vec3 toLinear(vec3 c)
{
    return c * (c * (c * 0.305306011 + 0.682171111) + 0.012522878);
}

vec3 toScreen(vec3 c)
{
    vec3 s1 = sqrt(c);
    vec3 s2 = sqrt(s1);
    vec3 s3 = sqrt(s2);
    return 0.585122381 * s1 + 0.783140355 * s2 - 0.368262736 * s3;
}

vec3 filmic(vec3 c)
{
    return ((c * (0.15 * c + 0.05) + 0.004) / (c * (0.15 * c + 0.5) + 0.06)) - 0.02 / 0.3;
}

vec3 toned(vec3 c)
{
    if (tonemapping == 1.0) {
        return toScreen(c);
    }
    if (tonemapping == 2.0) {
        return toScreen(clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0));
    }
    if (tonemapping == 3.0) {
        vec3 less = max(vec3(0.0), c - 0.004);
        return (less * (6.2 * less + 0.5)) / (less * (6.2 * less + 1.7) + 0.06);
    }
    if (tonemapping == 4.0) {
        return toScreen(filmic(c * 2.0) / filmic(vec3(11.2)));
    }
    return c;
}

vec4 pictured_at(float frame)
{
    float across = clamp(frame / frames, 0.0, 1.0) + (lined ? place.x : fract(place.x)) / frames;
    vec4 texel = texture(spritePicture, vec2(across, place.y));
    return vec4(toLinear(texel.rgb), texel.a);
}

void MAIN()
{
    vec4 color = tint;
    // Both are read whether they are used or not: a shader may not sample in
    // a branch that differs from one fragment to another.
    ivec2 size = textureSize(spriteTable, 0);
    // A table's first row is the last of its picture, as Qt has it.
    vec2 inTable = vec2(fract(look.x), 1.0 - row) * vec2(size);
    vec4 tabledColor = texelFetch(spriteTable, min(ivec2(inTable), size - ivec2(1)), 0);
    float frame = (frames - interpolate) * look.y;
    float between = fract(frame);
    vec4 first = pictured_at(frame - between);
    vec4 second = pictured_at(frame - between + 1.0);
    if (tabled) {
        color *= vec4(toLinear(tabledColor.rgb), tabledColor.a);
    }
    if (pictured) {
        color *= mix(first, second, between * interpolate);
    }
    float alpha = color.a * wholeOpacity;
    // Multiplying goes by the colour however much of it there is.
    FRAGCOLOR = vec4(toned(color.rgb) * (multiply ? 1.0 : alpha), alpha);
}
`;

// A row from a turn as w, x, y, z: the first three columns of its matrix, with
// where it is at the end of each.
function sprite(data, at, rows, from) {
  const [x, y, z] = [rows[from], rows[from + 1], rows[from + 2]];
  const [qw, qx, qy, qz] = [rows[from + 3], rows[from + 4], rows[from + 5], rows[from + 6]];
  data[at] = 1 - 2 * (qy * qy + qz * qz);
  data[at + 1] = 2 * (qx * qy - qw * qz);
  data[at + 2] = 2 * (qx * qz + qw * qy);
  data[at + 3] = x;
  data[at + 4] = 2 * (qx * qy + qw * qz);
  data[at + 5] = 1 - 2 * (qx * qx + qz * qz);
  data[at + 6] = 2 * (qy * qz - qw * qx);
  data[at + 7] = y;
  data[at + 8] = 2 * (qx * qz - qw * qy);
  data[at + 9] = 2 * (qy * qz + qw * qx);
  data[at + 10] = 1 - 2 * (qx * qx + qy * qy);
  data[at + 11] = z;
  for (let each = 0; each < 4; each++) data[at + 12 + each] = rows[from + 7 + each];
  data[at + 16] = rows[from + 11];
  data[at + 17] = rows[from + 12];
  data[at + 18] = rows[from + 14];
}

function sprites(drawn, system, eye) {
  const data = new Float32Array(drawn.count * ROW);
  const rows = drawn.far && eye ? farthest(drawn, away(system.$world(), math.inverse(eye))) : drawn.rows;
  for (let index = 0; index < drawn.count; index++) sprite(data, index * ROW, rows, index * EACH);
  return data;
}

// A piece between each two points of each line, as wide and as much to be seen
// at each end as those points are.
function pieces(drawn) {
  const data = new Float32Array(drawn.lines.reduce((sum, { points }) => sum + Math.max(0, points.length - 1), 0) * ROW);
  let at = 0;
  for (const { points } of drawn.lines) {
    let grown = 1;
    let faded = 1;
    for (let index = 0; index + 1 < points.length; index++) {
      const [a, b] = [points[index], points[index + 1]];
      // Nothing is drawn with a corner that has no way across it, as a line's
      // first has until it has a second: Qt's own sum, whichever way it faces.
      if (!a.binormal.some(Boolean) || !b.binormal.some(Boolean)) {
        grown *= drawn.grow;
        faded *= drawn.fade;
        at += ROW;
        continue;
      }
      for (let axis = 0; axis < 3; axis++) {
        data[at + axis * 4] = (b.position[axis] - a.position[axis]) / 100;
        data[at + axis * 4 + 1] = a.binormal[axis];
        data[at + axis * 4 + 2] = b.binormal[axis];
        data[at + axis * 4 + 3] = (a.position[axis] + b.position[axis]) / 2;
      }
      const after = faded * drawn.fade;
      for (let each = 0; each < 3; each++) data[at + 12 + each] = (a.color[each] + b.color[each]) / 2;
      data[at + 15] = Math.round(a.color[3] * faded * STEPS) + Math.min(0.999, b.color[3] * after);
      data[at + 16] = a.size * grown;
      data[at + 17] = b.size * grown * drawn.grow;
      data[at + 18] = a.length * drawn.stretch;
      data[at + 19] = b.length * drawn.stretch;
      grown *= drawn.grow;
      faded = after;
      at += ROW;
    }
  }
  return data;
}

const NOTHING = new Float32Array(0);

// A table is what the kind has now, asked of it as the scene is read: with a
// new one each time time has gone by.
const Rows = defineType("Instancing", Object3D, {
  setup(self) {
    self.$table = () => {
      const { kind, system, eye } = self.$of;
      const drawn = drawnOf(kind, system);
      const data = !drawn ? NOTHING : drawn.lines ? pieces(drawn) : sprites(drawn, system, eye());
      return { data, count: data.length / ROW, sheer: true, sorted: false, fresh: true };
    };
  },
});

// One picture of a kind's, as a shader is handed it.
const Picture = defineType("TextureInput", TextureInput, {
  properties: { texture: derived((self) => self.$named?.() ?? null) },
});

const SpriteMaterial = defineType("SpriteMaterial", CustomMaterial, {
  properties: {
    spritePicture: null,
    spriteTable: null,
    pictured: derived((self) => Boolean(self.$kind.sprite)),
    tabled: derived((self) => Boolean(self.$kind.colorTable)),
    frames: derived((self) => (self.$kind.sprite && self.$kind.spriteSequence ? Math.max(1, Math.floor(self.$kind.spriteSequence.frameCount)) : 1)),
    interpolate: derived((self) => (self.$kind.sprite && self.$kind.spriteSequence?.interpolate ? 1 : 0)),
    billboard: derived((self) => Boolean(self.$kind.billboard)),
    multiply: derived((self) => self.$kind.blendMode === Multiply),
    lined: derived((self) => Boolean(self.$kind.$line)),
    tonemapping: derived((self) => self.$toned()),
    wholeOpacity: derived((self) => {
      let opacity = 1;
      for (let node = self.$system; node?.$type?.chain.includes(Node); node = node.parent) opacity *= node.opacity;
      return opacity;
    }),
  },
});

// The shader premultiplies: one factor does for colour and alpha, and only
// this way what was opaque stays so.
function blendInto(material, mode) {
  material.sourceAlphaBlend = CustomMaterial.One;
  material.destinationAlphaBlend = mode === Normal ? CustomMaterial.OneMinusSrcAlpha : CustomMaterial.One;
  material.sourceBlend = mode === Multiply ? CustomMaterial.DstColor : CustomMaterial.One;
  material.destinationBlend = mode === Screen ? CustomMaterial.One : mode === Multiply ? CustomMaterial.Zero : CustomMaterial.OneMinusSrcAlpha;
}

function make(kind, system, toned, eye) {
  return inside(null, () => {
    const picture = (named) => {
      const made = Picture({});
      made.$named = named;
      return made;
    };
    const material = SpriteMaterial({});
    material.$kind = kind;
    material.$system = system;
    material.$toned = toned;
    material.spritePicture = picture(() => kind.sprite);
    material.spriteTable = picture(() => kind.colorTable);
    material.shadingMode = CustomMaterial.Unshaded;
    material.depthDrawMode = Material.NeverDepthDraw;
    material.cullMode = Material.NoCulling;
    blendInto(material, kind.blendMode);
    material.__vertexShaderCode = kind.$line ? LINE : SPRITE;
    material.__fragmentShaderCode = PIXELS;
    const rows = Rows({});
    rows.$of = { kind, system, eye };
    const model = Model({});
    model.source = "#Rectangle";
    model.castsShadows = false;
    model.receivesShadows = false;
    model.pickable = false;
    model.materials = material;
    model.instancing = rows;
    return { model, material, blend: kind.blendMode };
  });
}

const made = new WeakMap();

// The models that draw a system's sprites and lines, one to a kind for each
// view that draws it: a view's tone mapping and its eye are its own, so a
// kind shared by two views (an imported scene) is a model in each. A kind
// that blends some other way has its material's factors set again, as its
// factors are not uniforms.
export function drawnModels(system, host, toned, eye) {
  const models = [];
  for (const kind of system.$members().particles) {
    if (!kind.$sprite) continue;
    let byHost = made.get(kind);
    if (!byHost) made.set(kind, (byHost = new WeakMap()));
    let draw = byHost.get(host);
    if (!draw) byHost.set(host, (draw = make(kind, system, toned, eye)));
    else if (draw.blend !== kind.blendMode) {
      blendInto(draw.material, kind.blendMode);
      draw.blend = kind.blendMode;
    }
    models.push(draw.model);
  }
  return models;
}

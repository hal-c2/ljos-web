// CustomMaterial: a material drawn by shaders of the scene's own.
//
// It names two files, each a piece of a shader as Qt has them written
// (`shaders.js` says how), or is given the text of one where it names no
// file (`__vertexShaderCode`, `__fragmentShaderCode`: what a material
// written in QML puts its shaders together in), and whether what they draw
// is lit as a PrincipledMaterial is (`Shaded`) or is the colour they say
// (`Unshaded`).
// What the shaders are handed besides is the material's own properties,
// those its QML declares: each is a uniform of its name, of the type Qt
// makes of the property's (a `real` a `float`, a `color` a `vec4` in linear
// light, a `TextureInput` a `sampler2D`).
//
// Nothing is seen through what one draws unless it says how it is blended
// (`sourceBlend` and `destinationBlend`, both), whatever the opacity of its
// model: Qt has it so.
//
// Not here: lines of any width but one (`lineWidth`), which a browser does
// not draw, and a property with no value of a type that says nothing of
// what it would be (`property vector2d wind` alone), which is no uniform
// until it has one.
import { defineType } from "../object.ts";
import { declaration, handed, text } from "./effects.js";
import { Material } from "./scene.js";
import { mentioned } from "./shaders.js";

const Unshaded = 0;
const Shaded = 1;

// Qt's numbers for how what is drawn is put over what is there.
const BLENDS = {
  NoBlend: 0,
  Zero: 1,
  One: 2,
  SrcColor: 3,
  OneMinusSrcColor: 4,
  DstColor: 5,
  OneMinusDstColor: 6,
  SrcAlpha: 7,
  OneMinusSrcAlpha: 8,
  DstAlpha: 9,
  OneMinusDstAlpha: 10,
  ConstantColor: 11,
  OneMinusConstantColor: 12,
  ConstantAlpha: 13,
  OneMinusConstantAlpha: 14,
  SrcAlphaSaturate: 15,
};

// The shaders of a material, once for all that have the same: what the
// renderer makes a program of, and keeps it by.
const sources = new Map();
function source(shaded, uniforms, vertex, fragment) {
  const told = declaration(uniforms);
  const key = [shaded ? 1 : 0, told, vertex, fragment].join("\u0000");
  let made = sources.get(key);
  if (!made) {
    const words = mentioned(`${vertex}\n${fragment}`);
    made = {
      vertex,
      fragment,
      shaded,
      declared: told,
      samplers: uniforms.filter(({ type }) => type === "sampler2D").map(({ name }) => name),
      colors: words.has("VAR_COLOR"),
      screen: words.has("SCREEN_TEXTURE") || words.has("SCREEN_MIP_TEXTURE"),
      mips: words.has("SCREEN_MIP_TEXTURE"),
      depth: words.has("DEPTH_TEXTURE"),
    };
    sources.set(key, made);
  }
  return made;
}

export const CustomMaterial = defineType("CustomMaterial", Material, {
  properties: {
    shadingMode: Shaded,
    fragmentShader: "",
    vertexShader: "",
    __fragmentShaderCode: "",
    __vertexShaderCode: "",
    sourceBlend: 0,
    destinationBlend: 0,
    sourceAlphaBlend: 0,
    destinationAlphaBlend: 0,
    alwaysDirty: false,
    lineWidth: 1,
  },
  enums: { Unshaded, Shaded, ...BLENDS },
  setup(self) {
    self.$material = () => {
      // A piece is the file named, else the text given.
      const vertex = String(self.vertexShader ?? "") ? text(self.vertexShader, self) : String(self.__vertexShaderCode ?? "");
      const fragment = String(self.fragmentShader ?? "") ? text(self.fragmentShader, self) : String(self.__fragmentShaderCode ?? "");
      const { uniforms, waiting } = handed(self, CustomMaterial);
      if (vertex === null || fragment === null) return { waiting: true };
      const shaded = self.shadingMode !== Unshaded;
      const made = source(shaded, uniforms, vertex, fragment);
      // Blended only where both say how; how much of it is there is
      // blended as its colour is unless that is said too.
      const from = self.sourceBlend;
      const to = self.destinationBlend;
      const blend = from && to ? [from, to, self.sourceAlphaBlend || from, self.destinationAlphaBlend || to] : null;
      return {
        // What the renderer hands every shader, for the one this is drawn
        // with besides its own.
        lit: shaded,
        color: [1, 1, 1, 1],
        map: null,
        maps: {},
        waiting,
        emissive: [0, 0, 0],
        specular: 0.5,
        metalness: 0,
        ior: 1.5,
        fresnel: 5,
        opacity: 1,
        colors: made.colors,
        cull: self.cullMode,
        blend: 0,
        principled: true,
        cutoff: -1,
        point: 1,
        custom: {
          source: made,
          uniforms,
          blend,
          // What reads the picture of what is behind it is drawn after
          // that, as what is seen through is.
          through: Boolean(blend) || made.screen,
          depth: self.depthDrawMode,
        },
      };
    };
  },
});

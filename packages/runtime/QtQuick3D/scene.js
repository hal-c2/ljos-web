// What is in a scene besides nodes: the shapes drawn (Model), what they are
// drawn with (materials and textures), what lights them and what looks at
// them, and how the whole is to be shown (SceneEnvironment).
//
// These say what there is; `render.js` draws it.
//
// Not here: shadows, a sky box that is a cube of six
// pictures (`skyBoxCubeMap`), a material's
// own probe, and the distances a model draws the entries of its table
// between (`instancingLodMin` and `instancingLodMax`). Of
// a material's pictures: a height map moves nothing, nothing is let through
// (`transmissionFactor` and its maps), a specular map and a translucency map
// are not read, a picture is read whole where Qt can read one channel of it
// (`baseColorSingleChannelEnabled` and the like), and the colours of a
// mesh's corners mask nothing.
import { awaited, defineType, derived, effect, flush, group, located } from "../object.js";
import { Vector3d } from "../QtQml/values.js";
import { color } from "../QtQuick/color.js";
import { ktx } from "./ktx.js";
import * as math from "./math.js";
import { read } from "./mesh.js";
import { Node, Object3D } from "./Node.js";
import { primitive } from "./primitives.js";
import { radiance } from "./TextureData.js";
import { vectors } from "./vectors.js";
import { signal, untrack } from "#kernel";

// A colour as Qt lights with it: its channels in linear light, by Qt's own
// sum, and its alpha as it is.
export function linear(value) {
  const { r, g, b, a } = color(value);
  const one = (c) => c * (c * (c * 0.305306011 + 0.682171111) + 0.012522878);
  return [one(r), one(g), one(b), a];
}

// A file, once read: one record for everything that names it. `state()` is
// null until it is here, then what `took` made of it, or `{ error }`.
const files = new Map();
export function file(url, kind, took) {
  const key = `${kind} ${url}`;
  let record = files.get(key);
  if (record) return record;
  const [state, setState] = signal(null);
  files.set(key, (record = { state }));
  awaited(
    fetch(url)
      .then((answer) => (answer.ok ? answer.arrayBuffer() : Promise.reject(new Error(`${answer.status}`))))
      .then((buffer) => setState(took(buffer)))
      .catch((error) => setState({ error: `could not be read: ${error.message}` }))
      .then(() => flush()),
  );
  return record;
}

const PRIMITIVE = /#(Cube|Sphere|Cylinder|Cone|Rectangle)$/;

// The shape a Model's `source` names: one of Qt's own (`#Cube`), or a mesh
// file. Null until it is here.
const warned = new Set();
function shape(source) {
  const given = String(source ?? "");
  if (!given) return null;
  const own = given.match(PRIMITIVE);
  if (own) return primitive(own[1]);
  const url = located(given);
  const mesh = file(url, "mesh", read).state();
  if (mesh?.error) {
    if (!warned.has(url)) console.warn(`Model: ${url}: ${mesh.error}`);
    warned.add(url);
    return null;
  }
  return mesh;
}

// A picture, likewise: once it has loaded, the element, and whether any of
// it is seen through, which Qt looks a picture over for too.
const pictures = new Map();
function picture(url) {
  let record = pictures.get(url);
  if (!record) {
    const [ready, setReady] = signal(false);
    const element = new Image();
    pictures.set(url, (record = { element, ready, sheer: false }));
    element.crossOrigin = "anonymous";
    awaited(
      new Promise((resolve, reject) => {
        element.onload = resolve;
        element.onerror = reject;
      }).then(
        () => {
          record.sheer = seenThrough(element);
          setReady(true);
          flush();
        },
        () => console.warn(`Texture: ${url} could not be read`),
      ),
    );
    element.src = url;
  }
  return record.ready() ? record : null;
}

// A picture whose numbers are not held to what a screen can show, which a
// browser does not read: the numbers themselves, once they are here. A
// Radiance picture is one, and what Qt baked of one into a KTX file.
const BRIGHT = /\.(hdr|ktx)$/i;
function bright(url) {
  const read = /\.ktx$/i.test(url) ? file(url, "ktx", ktx).state() : file(url, "hdr", radiance).state();
  if (read?.error) {
    if (!warned.has(url)) console.warn(`Texture: ${url}: ${read.error}`);
    warned.add(url);
    return null;
  }
  return read;
}

function seenThrough(element) {
  const { naturalWidth: width, naturalHeight: height } = element;
  if (!width || !height) return false;
  const paper = new OffscreenCanvas(width, height).getContext("2d");
  paper.drawImage(element, 0, 0);
  const { data } = paper.getImageData(0, 0, width, height);
  for (let at = 3; at < data.length; at += 4) if (data[at] < 255) return true;
  return false;
}

const list = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);

export const Model = defineType("Model", Node, {
  properties: {
    source: "",
    materials: undefined,
    geometry: null,
    instancing: null,
    instanceRoot: null,
    skeleton: null,
    skin: null,
    morphTargets: undefined,
    inverseBindPoses: undefined,
    castsShadows: true,
    receivesShadows: true,
    castsReflections: true,
    receivesReflections: false,
    pickable: false,
    depthBias: 0,
    usedInBakedLighting: false,
    lightmapBaseResolution: 1024,
    bakedLightmap: null,
    instancingLodMin: -1,
    instancingLodMax: -1,
    levelOfDetailBias: 1,
    // The box the shape fits in, in the model's own space.
    bounds: derived((self) => {
      const subsets = self.$shape()?.subsets ?? [];
      const minimum = [0, 0, 0];
      const maximum = [0, 0, 0];
      subsets.forEach(({ min, max }, index) => {
        for (let axis = 0; axis < 3; axis++) {
          minimum[axis] = index ? Math.min(minimum[axis], min[axis]) : min[axis];
          maximum[axis] = index ? Math.max(maximum[axis], max[axis]) : max[axis];
        }
      });
      return { minimum: math.vector(minimum), maximum: math.vector(maximum) };
    }),
  },
  setup(self) {
    self.$model = true;
    self.$shape = () => self.geometry?.$shape?.() ?? shape(self.source);
    self.$materials = () => list(self.materials);
    // What bends it: a skin's joints, else a skeleton's with the poses the
    // model has for them.
    self.$bones = () => (self.skin ? (self.skin.$bones?.() ?? null) : (self.skeleton?.$bones?.(list(self.inverseBindPoses)) ?? null));
    // How much it goes towards each target its mesh has, in their order.
    self.$weights = () => list(self.morphTargets).map((target) => Number(target?.weight) || 0);
    // The table it is drawn by, once for each entry, and where the entries
    // are: `above` is what the whole table is moved by and `local` what
    // each entry is, in its own place. Null where it is drawn once.
    self.$instances = () => {
      const table = self.instancing?.$table?.();
      return table ? { ...table, ...instanced(self) } : null;
    };
  },
});

const above = (node) => (node.parent?.$spatial ? node.parent.$world() : math.IDENTITY);

// Where the entries of a node's table are. With no `instanceRoot` the node's
// position moves the whole table, and its turn and size are each entry's
// own; with itself as the root its position too is each entry's own; with
// another node as the root, the table is where that node's would be, and
// everything between the two is each entry's own.
function instanced(node, depth = 0) {
  const root = node.instanceRoot;
  if (root === node) return { local: node.$local(), above: above(node) };
  if (root?.$spatial && depth < 16) {
    const from = instanced(root, depth + 1);
    let local = node.$local();
    for (let over = node.parent; over?.$spatial; over = over.parent) {
      if (over === root) {
        local = math.multiply(from.local, local);
        break;
      }
      local = math.multiply(over.$local(), local);
    }
    return { local, above: from.above };
  }
  const local = [...node.$local()];
  const moved = [...math.IDENTITY];
  for (const at of [12, 13, 14]) {
    moved[at] = local[at];
    local[at] = 0;
  }
  return { local, above: math.multiply(above(node), moved) };
}

const ClampToEdge = 1;
const MirroredRepeat = 2;
const Repeat = 3;
const Nearest = 1;
const Linear = 2;
// ShaderEffectSource's.
const MirrorVertically = 2;

export const Texture = defineType("Texture", Object3D, {
  properties: {
    source: "",
    sourceItem: null,
    textureData: null,
    textureProvider: null,
    scaleU: 1,
    scaleV: 1,
    mappingMode: 0,
    tilingModeHorizontal: Repeat,
    tilingModeVertical: Repeat,
    tilingModeDepth: Repeat,
    rotationUV: 0,
    positionU: 0,
    positionV: 0,
    pivotU: 0,
    pivotV: 0,
    flipU: false,
    flipV: false,
    indexUV: 0,
    magFilter: Linear,
    minFilter: Linear,
    mipFilter: 0,
    generateMipmaps: false,
    autoOrientation: true,
  },
  enums: { UV: 0, Environment: 1, LightProbe: 2, ClampToEdge, MirroredRepeat, Repeat, None: 0, Nearest, Linear },
  setup(self) {
    // What the renderer needs of it: the picture once it is here, how it
    // is sampled, and where in it a corner's coordinates are, as Qt places
    // them: flipped, moved, then turned and scaled about the pivot. The
    // picture is an item's where it has one, else the numbers it is given,
    // else the file it names, which is the order Qt looks in.
    //
    // An item that stands for another (a ShaderEffectSource) is that one. A
    // View3D is a picture upside down, as it is in Qt where Qt draws with
    // OpenGL, unless what stands for it mirrors it back, which one does
    // that is not told otherwise; and what reads a view is drawn again when
    // the view is.
    self.$texture = () => {
      const source = String(self.source ?? "");
      let item = self.sourceItem;
      let mirrored = false;
      for (let seen = 0; item?.sourceItem !== undefined && seen < 8; seen++) {
        mirrored = Boolean(item.textureMirroring & MirrorVertically);
        item = item.sourceItem;
      }
      const view = Boolean(item?.$view);
      const down = view && !mirrored;
      if (view) item.$view(down);
      const given = item ? null : self.textureData;
      const url = item || given || !source ? null : located(source);
      const data = given ? (given.$picture?.() ?? null) : url && BRIGHT.test(url) ? bright(url) : null;
      const loaded = url && !BRIGHT.test(url) ? picture(url) : null;
      const element = item ? (item.$canvas?.element ?? item.$shader?.canvas ?? null) : (loaded?.element ?? null);
      if (!element && !data) return null;
      let transform = [...math.IDENTITY];
      const by = (m) => void (transform = math.multiply(transform, m));
      const move = (x, y) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, 0, 1];
      if (self.flipU) by([-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1]);
      if (self.flipV) by([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1]);
      by(move(self.positionU, self.positionV));
      by(move(self.pivotU, self.pivotV));
      by(math.rotation(math.fromAxis(0, 0, 1, self.rotationUV)));
      by([self.scaleU, 0, 0, 0, 0, self.scaleV, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      by(move(-self.pivotU, -self.pivotV));
      return {
        element,
        data,
        // A canvas may have been drawn on since, and may be seen through.
        live: Boolean(item),
        view,
        down,
        sheer: data ? data.sheer : loaded ? loaded.sheer : true,
        horizontal: self.tilingModeHorizontal,
        vertical: self.tilingModeVertical,
        mag: self.magFilter,
        min: self.minFilter,
        mip: self.generateMipmaps ? self.mipFilter : 0,
        transform,
        index: self.indexUV,
      };
    };
  },
});

const BackFaceCulling = 1;
const FrontFaceCulling = 2;
const NoCulling = 3;

export const Material = defineType("Material", Object3D, {
  properties: {
    lightProbe: null,
    cullMode: BackFaceCulling,
    depthDrawMode: 0,
  },
  enums: {
    BackFaceCulling,
    FrontFaceCulling,
    NoCulling,
    R: 0,
    G: 1,
    B: 2,
    A: 3,
    OpaqueOnlyDepthDraw: 0,
    AlwaysDepthDraw: 1,
    NeverDepthDraw: 2,
    OpaquePrePassDepthDraw: 3,
  },
});

// The pictures a material reads besides its colour's: for each that is
// set, how it is sampled and which channel of it is read, which a property
// of the material says or is always the same one. `waiting` is
// whether any is not here yet.
function mapped(self, base, named) {
  const maps = {};
  let waiting = Boolean(base) && !base.$texture?.();
  for (const [name, [property, channel]] of Object.entries(named)) {
    const texture = self[property];
    if (!texture) continue;
    const map = texture.$texture?.();
    if (map) maps[name] = { ...map, channel: typeof channel === "string" ? self[channel] : (channel ?? 0) };
    else waiting = true;
  }
  return { map: base?.$texture?.() ?? null, maps, waiting };
}

const NoLighting = 0;
const FragmentLighting = 1;
const SHADING = { NoLighting, FragmentLighting, SourceOver: 0, Screen: 1, Multiply: 2 };

const vec = (value) => [Number(value?.x) || 0, Number(value?.y) || 0, Number(value?.z) || 0];

export const DefaultMaterial = defineType("DefaultMaterial", Material, {
  properties: {
    lighting: FragmentLighting,
    blendMode: 0,
    diffuseColor: "#ffffff",
    diffuseMap: null,
    emissiveFactor: group({ x: 0, y: 0, z: 0 }),
    emissiveMap: null,
    specularReflectionMap: null,
    specularMap: null,
    specularModel: 0,
    specularTint: "#ffffff",
    indexOfRefraction: 1.45,
    fresnelPower: 0,
    specularAmount: 0,
    specularRoughness: 0,
    roughnessMap: null,
    opacity: 1,
    opacityMap: null,
    bumpMap: null,
    bumpAmount: 0,
    normalMap: null,
    translucencyMap: null,
    translucentFalloff: 0,
    diffuseLightWrap: 0,
    vertexColorsEnabled: false,
    pointSize: 1,
    lineWidth: 1,
  },
  enums: { ...SHADING, Default: 0, KGGX: 1 },
  setup(self) {
    self.$material = () => ({
      lit: self.lighting !== NoLighting,
      color: linear(self.diffuseColor),
      ...mapped(self, self.diffuseMap, {
        normal: ["normalMap"],
        bump: ["bumpMap"],
        emissive: ["emissiveMap"],
        opacity: ["opacityMap", 3],
      }),
      // How far a picture of the way it faces, or of heights, turns it.
      bump: self.bumpAmount,
      emissive: vec(self.emissiveFactor),
      // How much of a light a surface that faces between it and the eye
      // gives back, in its own colour, and how tight the spot of it is.
      // The tint is of what it gives back of its surroundings alone.
      specular: self.specularAmount,
      tint: linear(self.specularTint).slice(0, 3),
      shine: 2.56 / (self.specularRoughness + 0.01),
      roughness: self.specularRoughness,
      metalness: 0,
      ior: self.indexOfRefraction,
      fresnel: self.fresnelPower,
      opacity: self.opacity,
      colors: self.vertexColorsEnabled,
      cull: self.cullMode,
      depth: self.depthDrawMode,
      blend: self.blendMode,
      cutoff: -1,
      point: self.pointSize,
    });
  },
});

vectors(DefaultMaterial, "emissiveFactor");

const Mask = 1;
const Blend = 2;
const Opaque = 3;

export const PrincipledMaterial = defineType("PrincipledMaterial", Material, {
  properties: {
    lighting: FragmentLighting,
    blendMode: 0,
    alphaMode: 0,
    alphaCutoff: 0.5,
    baseColor: "#ffffff",
    baseColorMap: null,
    metalness: 0,
    metalnessMap: null,
    metalnessChannel: 2,
    roughness: 0,
    roughnessMap: null,
    roughnessChannel: 1,
    specularAmount: 1,
    specularMap: null,
    specularTint: 0,
    specularReflectionMap: null,
    indexOfRefraction: 1.5,
    opacity: 1,
    opacityMap: null,
    opacityChannel: 3,
    invertOpacityMapValue: false,
    emissiveFactor: group({ x: 0, y: 0, z: 0 }),
    emissiveMap: null,
    normalMap: null,
    normalStrength: 1,
    occlusionMap: null,
    occlusionAmount: 1,
    occlusionChannel: 0,
    heightMap: null,
    heightAmount: 0,
    heightChannel: 0,
    minHeightMapSamples: 8,
    maxHeightMapSamples: 32,
    clearcoatAmount: 0,
    clearcoatMap: null,
    clearcoatChannel: 0,
    clearcoatRoughnessAmount: 0,
    clearcoatRoughnessMap: null,
    clearcoatRoughnessChannel: 1,
    clearcoatNormalMap: null,
    clearcoatNormalStrength: 1,
    clearcoatFresnelPower: 5,
    clearcoatFresnelScaleBiasEnabled: false,
    clearcoatFresnelScale: 1,
    clearcoatFresnelBias: 0,
    fresnelScaleBiasEnabled: false,
    fresnelScale: 1,
    fresnelBias: 0,
    baseColorSingleChannelEnabled: false,
    baseColorChannel: 0,
    specularSingleChannelEnabled: false,
    specularChannel: 0,
    emissiveSingleChannelEnabled: false,
    emissiveChannel: 0,
    transmissionMap: null,
    transmissionChannel: 0,
    thicknessMap: null,
    thicknessChannel: 1,
    vertexColorsMaskEnabled: false,
    transmissionFactor: 0,
    thicknessFactor: 0,
    attenuationDistance: Infinity,
    attenuationColor: "#ffffff",
    fresnelPower: 5,
    vertexColorsEnabled: true,
    pointSize: 1,
    lineWidth: 1,
  },
  enums: { ...SHADING, Default: 0, Mask, Blend, Opaque },
  setup(self) {
    self.$material = () => {
      const mode = self.alphaMode;
      const [r, g, b, a] = linear(self.baseColor);
      return {
        lit: self.lighting !== NoLighting,
        color: [r, g, b, mode === Opaque ? 1 : a],
        ...mapped(self, self.baseColorMap, {
          normal: ["normalMap"],
          roughness: ["roughnessMap", "roughnessChannel"],
          metalness: ["metalnessMap", "metalnessChannel"],
          occlusion: ["occlusionMap", "occlusionChannel"],
          emissive: ["emissiveMap"],
          opacity: ["opacityMap", "opacityChannel"],
          coat: ["clearcoatMap", "clearcoatChannel"],
          coatRoughness: ["clearcoatRoughnessMap", "clearcoatRoughnessChannel"],
          coatNormal: ["clearcoatNormalMap"],
        }),
        bump: self.normalStrength,
        coat: self.clearcoatAmount,
        coatRoughness: self.clearcoatRoughnessAmount,
        coatBump: self.clearcoatNormalStrength,
        coatEdge: [self.clearcoatFresnelPower, ...(self.clearcoatFresnelScaleBiasEnabled ? [self.clearcoatFresnelScale, self.clearcoatFresnelBias] : [1, 0])],
        occlusion: self.occlusionAmount,
        inverted: self.invertOpacityMapValue,
        emissive: vec(self.emissiveFactor),
        // A surface that is not metal gives back a little of a light as it
        // is, or as much in its own colour as `specularTint` says, and a
        // metal all of it in its own colour. One that is neither metal nor
        // gives any back has no shine at all, nor has its coat.
        specular: self.specularAmount,
        tint: [r, g, b].map((c) => 1 + (c - 1) * self.specularTint),
        shiny: self.specularAmount > 0.01 || self.metalness > 0.01,
        // How much more a surface seen from its side gives back of its
        // surroundings than one seen from the front.
        edge: self.fresnelScaleBiasEnabled ? [self.fresnelScale, self.fresnelBias] : [1, 0],
        roughness: self.roughness,
        metalness: self.metalness,
        principled: true,
        ior: self.indexOfRefraction,
        fresnel: self.fresnelPower,
        opacity: self.opacity,
        colors: self.vertexColorsEnabled,
        cull: self.cullMode,
        depth: self.depthDrawMode,
        blend: self.blendMode,
        solid: mode === Opaque || mode === Mask,
        blended: mode === Blend,
        cutoff: mode === Mask ? self.alphaCutoff : -1,
        point: self.pointSize,
      };
    };
  },
});

vectors(PrincipledMaterial, "emissiveFactor");

// A light: its colour times how bright it is, and what it adds to every
// surface wherever that is (`ambientColor`). One with a `scope` lights, and
// adds to, only what is that node or inside it.
export const Light = defineType("Light", Node, {
  properties: {
    color: "#ffffff",
    ambientColor: "#000000",
    brightness: 1,
    scope: null,
    castsShadow: false,
    shadowBias: 0,
    shadowFactor: 75,
    shadowMapQuality: 0,
    shadowMapFar: 5000,
    shadowFilter: 5,
    softShadowQuality: 1,
    pcfFactor: 2,
    bakeMode: 0,
  },
  enums: {
    ShadowMapQualityLow: 0,
    ShadowMapQualityMedium: 1,
    ShadowMapQualityHigh: 2,
    ShadowMapQualityVeryHigh: 3,
    ShadowMapQualityUltra: 4,
    Hard: 0,
    PCF4: 1,
    PCF8: 2,
    PCF16: 3,
    PCF32: 4,
    PCF64: 5,
    BakeModeDisabled: 0,
    BakeModeIndirect: 1,
    BakeModeAll: 2,
  },
  setup(self) {
    self.$light = () => {
      const world = self.$world();
      const by = self.brightness;
      const [r, g, b] = linear(self.color);
      return {
        kind: self.$lit,
        color: [r * by, g * by, b * by],
        ambient: linear(self.ambientColor).slice(0, 3),
        // The node it is for, where it is not for the whole scene.
        scope: self.scope ?? null,
        // A light shines along its own z, away from the eye.
        direction: math.normalized(math.turned(math.normal(world), 0, 0, -1)),
        position: world.slice(12, 15),
        fade: [clamped(self.constantFade ?? 1), clamped(self.linearFade ?? 0) * 0.01, clamped(self.quadraticFade ?? 1) * 0.0001],
        cone: Math.cos(((self.coneAngle ?? 360) * Math.PI) / 360),
        inner: Math.cos((Math.min(self.innerConeAngle ?? 360, self.coneAngle ?? 360) * Math.PI) / 360),
      };
    };
  },
});

const clamped = (fade) => Math.min(1000, Math.max(0, Number(fade) || 0));

export const DIRECTIONAL = 0;
export const POINT = 1;
export const SPOT = 2;

export const DirectionalLight = defineType("DirectionalLight", Light, {
  properties: { csmSplit1: 0, csmSplit2: 0.25, csmSplit3: 0.5, csmNumSplits: 0, csmBlendRatio: 0.05, lockShadowmapTexels: false },
  setup(self) {
    self.$lit = DIRECTIONAL;
  },
});

export const PointLight = defineType("PointLight", Light, {
  properties: { constantFade: 1, linearFade: 0, quadraticFade: 1 },
  setup(self) {
    self.$lit = POINT;
  },
});

export const SpotLight = defineType("SpotLight", Light, {
  properties: { constantFade: 1, linearFade: 0, quadraticFade: 1, coneAngle: 40, innerConeAngle: 30 },
  setup(self) {
    self.$lit = SPOT;
  },
});

// A camera: `$projection(width, height)` is what it sees of a view that
// size, as a matrix.
export const Camera = defineType("Camera", Node, {
  properties: {
    frustumCullingEnabled: false,
    lookAtNode: null,
    levelOfDetailBias: 1,
  },
  methods: {
    // Where in a view (0 to 1 across and down, the top left first) a place
    // in the scene is seen, and how far beyond the near plane it is.
    $seen(scene, width, height) {
      const projection = this.$projection(width, height);
      const all = math.multiply(projection, math.inverse(this.$world()) ?? math.IDENTITY);
      const [x, y, , w] = math.transform(all, scene.x, scene.y, scene.z);
      if (Math.abs(w) < 1e-12 || Number.isNaN(w)) return new Vector3d(0, 0, 0);
      const back = math.inverse(all);
      if (!back) return new Vector3d(0, 0, 0);
      const near = math.transform(back, x / w, y / w, -1);
      const far = math.transform(back, x / w, y / w, 0);
      if (Math.abs(near[3]) < 1e-12 || Math.abs(far[3]) < 1e-12) return new Vector3d(0, 0, 0);
      const from = near.slice(0, 3).map((value) => value / near[3]);
      const along = far.slice(0, 3).map((value, index) => value / far[3] - from[index]);
      const to = [scene.x - from[0], scene.y - from[1], scene.z - from[2]];
      const ahead = along[0] * to[0] + along[1] * to[1] + along[2] * to[2] > 0;
      return new Vector3d(x / w / 2 + 0.5, 1 - (y / w / 2 + 0.5), Math.hypot(...to) * (ahead ? 1 : -1));
    },
    // And the place in the scene that is seen there, that far beyond.
    $place(viewport, width, height) {
      const projection = this.$projection(width, height);
      const back = math.inverse(math.multiply(projection, math.inverse(this.$world()) ?? math.IDENTITY));
      if (!back) return new Vector3d(0, 0, 0);
      const x = viewport.x * 2 - 1;
      const y = (1 - viewport.y) * 2 - 1;
      const near = math.transform(back, x, y, -1);
      const far = math.transform(back, x, y, 0);
      if (Math.abs(near[3]) < 1e-12 || Math.abs(far[3]) < 1e-12) return new Vector3d(0, 0, 0);
      const from = near.slice(0, 3).map((value) => value / near[3]);
      const along = math.normalized(far.slice(0, 3).map((value, index) => value / far[3] - from[index]));
      return new Vector3d(from[0] + along[0] * viewport.z, from[1] + along[1] * viewport.z, from[2] + along[2] * viewport.z);
    },
    mapToViewport(scene) {
      return this.$seen(scene, this.$width ?? 1, this.$height ?? 1);
    },
    mapFromViewport(viewport) {
      return this.$place(viewport, this.$width ?? 1, this.$height ?? 1);
    },
    // Turns the camera to face a place in the scene, or a node.
    lookAt(target) {
      const scene = target?.$spatial ? target.scenePosition : target;
      const at = this.scenePosition;
      const forward = math.normalized([scene.x - at.x, scene.y - at.y, scene.z - at.z]);
      if (forward.every((value) => value === 0)) return;
      const up = Math.abs(forward[1]) > 0.99999 ? [0, 0, -Math.sign(forward[1])] : [0, 1, 0];
      const side = math.normalized([forward[1] * up[2] - forward[2] * up[1], forward[2] * up[0] - forward[0] * up[2], forward[0] * up[1] - forward[1] * up[0]]);
      const above = [side[1] * forward[2] - side[2] * forward[1], side[2] * forward[0] - side[0] * forward[2], side[0] * forward[1] - side[1] * forward[0]];
      const facing = [side[0], side[1], side[2], 0, above[0], above[1], above[2], 0, -forward[0], -forward[1], -forward[2], 0, 0, 0, 0, 1];
      const parent = this.parent?.$spatial ? math.unscaled(this.parent.$world()) : math.IDENTITY;
      const own = math.multiply(math.inverse([...parent.slice(0, 12), 0, 0, 0, 1]) ?? math.IDENTITY, facing);
      this.rotation = math.quaternion(math.turnOf(own));
    },
  },
  setup(self) {
    self.$camera = true;
    // A camera with a node to look at keeps looking at it, wherever either
    // goes. Turning the camera by hand lasts until one of them moves.
    let last = "";
    effect(
      () => {
        const to = self.lookAtNode?.$spatial ? self.lookAtNode.scenePosition : null;
        return to && `${self.scenePosition} ${to}`;
      },
      (places) => {
        if (!places || places === last) return;
        last = places;
        untrack(() => self.lookAt(self.lookAtNode));
      },
    );
  },
});

const Vertical = 0;
const Horizontal = 1;

export const PerspectiveCamera = defineType("PerspectiveCamera", Camera, {
  properties: {
    clipNear: 10,
    clipFar: 10000,
    fieldOfView: 60,
    fieldOfViewOrientation: Vertical,
  },
  enums: { Vertical, Horizontal },
  methods: {
    $projection(width, height) {
      const aspect = height > 0 ? width / height : 1;
      let degrees = this.fieldOfView;
      if (this.fieldOfViewOrientation === Horizontal) {
        degrees = (2 * Math.atan(Math.tan((degrees * Math.PI) / 360) / aspect) * 180) / Math.PI;
      }
      return math.perspective(degrees, aspect, this.clipNear, this.clipFar);
    },
  },
});

export const OrthographicCamera = defineType("OrthographicCamera", Camera, {
  properties: {
    clipNear: 10,
    clipFar: 10000,
    horizontalMagnification: 1,
    verticalMagnification: 1,
  },
  methods: {
    // A unit of the scene is a pixel of the view, times the magnification.
    $projection(width, height) {
      const across = width / 2 / (this.horizontalMagnification || 1);
      const down = height / 2 / (this.verticalMagnification || 1);
      return math.ortho(-across, across, -down, down, this.clipNear, this.clipFar);
    },
  },
  setup(self) {
    // It sees along one way from everywhere across it.
    self.$flat = true;
  },
});

export const FrustumCamera = defineType("FrustumCamera", PerspectiveCamera, {
  properties: { top: 0, bottom: 0, right: 0, left: 0 },
  methods: {
    $projection() {
      return math.frustum(this.left, this.right, this.bottom, this.top, this.clipNear, this.clipFar);
    },
  },
});

export const CustomCamera = defineType("CustomCamera", Camera, {
  properties: { projection: undefined },
  methods: {
    $projection() {
      return math.columns(this.projection);
    },
  },
});

// Fog: what is far from the camera, or low, fades into one colour. With
// neither of the two asked for there is none.
export const Fog = defineType("Fog", Object3D, {
  properties: {
    enabled: false,
    color: "#8099b3",
    density: 1,
    depthEnabled: false,
    depthNear: 10,
    depthFar: 1000,
    depthCurve: 1,
    heightEnabled: false,
    leastIntenseY: 10,
    mostIntenseY: 0,
    heightCurve: 1,
    transmitEnabled: false,
    transmitCurve: 1,
  },
  setup(self) {
    self.$fog = () => {
      if (!self.enabled || !(self.depthEnabled || self.heightEnabled)) return null;
      const [red, green, blue] = linear(self.color);
      return {
        color: [red, green, blue, self.density],
        depth: [self.depthNear, self.depthFar, self.depthCurve, self.depthEnabled ? 1 : 0],
        height: [self.leastIntenseY, self.mostIntenseY, self.heightCurve, self.heightEnabled ? 1 : 0],
        through: [self.transmitCurve, self.transmitEnabled ? 1 : 0],
      };
    };
  },
});

// A reflection probe: a place the scene is looked at from all round, for
// the models near it that take reflections to mirror.
//
// A model takes the reflections of the probe whose box it is in, of those
// the nearest, in place of what its scene's light probe would light it by.
// The box is as big as `boxSize` about where the probe is, moved by
// `boxOffset`; what is mirrored is what is seen from where the probe is.
//
// Not here: the faces of the cube are all looked through for every picture
// that is to have them, whatever `timeSlicing` says, a picture given in the
// cube's place (`texture`) is not looked at, and nothing is shown for
// `debugView`.
const ACROSS = [128, 256, 512, 1024, 2048];
const FirstFrame = 0;

export const ReflectionProbe = defineType("ReflectionProbe", Node, {
  properties: {
    quality: 1,
    clearColor: "#00000000",
    refreshMode: 1,
    timeSlicing: 0,
    parallaxCorrection: false,
    boxSize: group({ x: 0, y: 0, z: 0 }),
    boxOffset: group({ x: 0, y: 0, z: 0 }),
    debugView: false,
    texture: null,
  },
  enums: { VeryLow: 0, Low: 1, Medium: 2, High: 3, VeryHigh: 4, FirstFrame, EveryFrame: 1, None: 0, AllFacesAtOnce: 1, IndividualFaces: 2 },
  methods: {
    // Looked through again for the next picture, where it is looked through
    // once only.
    scheduleUpdate() {
      this.$asked[1]((turn) => turn + 1);
    },
  },
  setup(self) {
    self.$asked = signal(0, self.$owner);
    // What the renderer looks from and for which models: where the probe
    // is, the corners of its box, the colour of what nothing is seen of
    // (which is put in the cube as it is, and not as a colour of the
    // screen's is), how far across each side of the cube is, and whether
    // it is looked through once (`turn` says which time) or for every
    // picture.
    self.$mirror = () => {
      const at = self.$world().slice(12, 15);
      const { boxSize: size, boxOffset: offset } = self;
      const middle = [at[0] + offset.x, at[1] + offset.y, at[2] + offset.z];
      const half = [size.x / 2, size.y / 2, size.z / 2];
      const { r, g, b, a } = color(self.clearColor);
      return {
        key: self,
        at,
        min: middle.map((value, axis) => value - half[axis]),
        max: middle.map((value, axis) => value + half[axis]),
        clear: [r, g, b, a],
        parallax: Boolean(self.parallaxCorrection),
        across: ACROSS[self.quality] ?? ACROSS[1],
        once: self.refreshMode === FirstFrame,
        turn: self.$asked[0](),
      };
    };
  },
});

vectors(ReflectionProbe, "boxSize", "boxOffset");

const Transparent = 0;
const Color = 2;
const SkyBox = 3;
const SkyBoxCubeMap = 4;
const NoAA = 0;

export const SceneEnvironment = defineType("SceneEnvironment", Object3D, {
  properties: {
    antialiasingMode: NoAA,
    antialiasingQuality: 4,
    temporalAAEnabled: false,
    temporalAAStrength: 0.3,
    specularAAEnabled: false,
    backgroundMode: Transparent,
    clearColor: "#000000",
    depthTestEnabled: true,
    depthPrePassEnabled: false,
    aoEnabled: false,
    aoStrength: 0,
    aoDistance: 5,
    aoSoftness: 50,
    aoDither: false,
    aoSampleRate: 2,
    aoBias: 0,
    lightProbe: null,
    probeExposure: 1,
    probeHorizon: 0,
    probeOrientation: group({ x: 0, y: 0, z: 0 }),
    skyBoxCubeMap: null,
    skyboxBlurAmount: 0,
    tonemapMode: 1,
    effects: undefined,
    lightmapper: null,
    debugSettings: null,
    scissorRect: null,
    fog: null,
    gridEnabled: false,
    gridScale: 1,
    gridFlags: 0,
    oitMethod: 0,
  },
  enums: {
    NoAA,
    SSAA: 1,
    MSAA: 2,
    ProgressiveAA: 3,
    Medium: 2,
    High: 4,
    VeryHigh: 8,
    Transparent,
    Unspecified: 1,
    Color,
    SkyBox,
    SkyBoxCubeMap,
    TonemapModeNone: 0,
    TonemapModeLinear: 1,
    TonemapModeAces: 2,
    TonemapModeHejlDawson: 3,
    TonemapModeFilmic: 4,
    OITNone: 0,
    OITWeightedBlended: 1,
    OITLinkedList: 2,
  },
  setup(self) {
    self.$environment = () => {
      // The colour is behind the scene where that is asked for, and where
      // surroundings are and there are none to show.
      const mode = self.backgroundMode;
      const filled = mode === Color || (mode === SkyBox && !self.lightProbe) || (mode === SkyBoxCubeMap && !self.skyBoxCubeMap);
      // What everything is lit by from all round, and how: how bright, how
      // far down it reaches (not below the horizon at 1, all the way at 0),
      // and how it is turned.
      const map = self.lightProbe?.$texture?.() ?? null;
      const { x, y, z } = self.probeOrientation;
      const turn = math.rotation(math.fromEuler(x, y, z));
      return {
        clear: filled ? linear(self.clearColor) : [0, 0, 0, 0],
        probe: map && {
          map,
          exposure: self.probeExposure,
          horizon: Math.min(Math.min(1, Math.max(0, self.probeHorizon)) - 1, -0.001),
          turn: [turn[0], turn[1], turn[2], turn[4], turn[5], turn[6], turn[8], turn[9], turn[10]],
        },
        sky: mode === SkyBox,
        blur: self.skyboxBlurAmount,
        // Smoothed edges: each pixel drawn several times over. The other
        // ways Qt has of it are drawn this way too.
        samples: self.antialiasingMode === NoAA ? 0 : self.antialiasingQuality,
        tonemap: self.tonemapMode,
        depth: self.depthTestEnabled,
        fog: self.fog?.$fog?.() ?? null,
        // What is run over the picture once it is drawn (`effects.js`),
        // each when all it reads is here.
        effects: list(self.effects)
          .map((each) => each?.$passes?.())
          .filter((each) => each && !each.waiting && each.passes.length),
      };
    };
  },
});

vectors(SceneEnvironment, "probeOrientation");

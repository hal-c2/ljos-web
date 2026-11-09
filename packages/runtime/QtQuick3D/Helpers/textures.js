// The pictures QtQuick3D.Helpers makes: ProceduralTextureData, whose numbers
// a program gives as properties, and ProceduralSkyTextureData, a sky over
// ground with a sun in it, to light a scene from all round and to be seen
// behind it.
//
// The sky is worked out as Qt works it out, pixel for pixel: from straight
// up to the horizon and from there straight down the colour goes from one
// of two to the other along a curve, and round the sun the sun's colour is
// laid over the sky's, less the further from it. It is a map of everything
// round a place, twice as wide as high, in linear light.
import { defineType } from "../../object.js";
import { color } from "../../QtQuick/color.js";
import { kept } from "../Node.js";
import { Format, picture, TextureData } from "../TextureData.js";

export const ProceduralTextureData = defineType("ProceduralTextureData", TextureData, {
  properties: {
    format: Format.RGBA8,
    width: 0,
    height: 0,
    depth: 0,
    hasTransparency: false,
    textureData: null,
  },
  setup(self) {
    self.$picture = kept(self, () => picture({ bytes: self.textureData, width: self.width, height: self.height, depth: self.depth, format: self.format || Format.RGBA8, sheer: self.hasTransparency }));
  },
});

const SkyTextureQualityLow = 0;
const SkyTextureQualityMedium = 1;
const SkyTextureQualityHigh = 2;
const SkyTextureQualityVeryHigh = 3;
const ACROSS = [512, 1024, 2048, 4096];

// A colour in linear light, by the exact sum, which is the one Qt uses here.
function lit(value) {
  const { r, g, b, a } = color(value);
  const one = (c) => (c < 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return [one(r), one(g), one(b), a];
}

// How far along a change is, bent by a curve.
function eased(x, c) {
  x = Math.min(1, Math.max(0, x));
  if (c > 0) return c < 1 ? 1 - (1 - x) ** (1 / c) : x ** c;
  if (c < 0) return x < 0.5 ? (x * 2) ** -c * 0.5 : (1 - (1 - (x - 0.5) * 2) ** -c) * 0.5 + 0.5;
  return 0;
}

const between = (from, to, by) => from.map((channel, index) => channel + by * (to[index] - channel));

// One colour laid over another, as much as it is not seen through.
function over(under, [r, g, b, a]) {
  const rest = 1 - a;
  const alpha = under[3] * rest + a;
  if (alpha === 0) return [0, 0, 0, 0];
  return [(under[0] * under[3] * rest + r * a) / alpha, (under[1] * under[3] * rest + g * a) / alpha, (under[2] * under[3] * rest + b * a) / alpha, alpha];
}

function sky(self) {
  const width = ACROSS[self.textureQuality] ?? ACROSS[SkyTextureQualityMedium];
  const height = width / 2;
  const pixels = new Float32Array(width * height * 4);
  const top = lit(self.skyTopColor);
  const horizon = lit(self.skyHorizonColor);
  const bottom = lit(self.groundBottomColor);
  const ground = lit(self.groundHorizonColor);
  const sun = lit(self.sunColor);
  for (let channel = 0; channel < 3; channel++) sun[channel] *= self.sunEnergy;
  const { skyCurve, skyEnergy, groundCurve, groundEnergy, sunAngleMin, sunAngleMax, sunCurve } = self;
  // Where the sun is: away from the eye, lifted by its latitude, then
  // turned about the way up by its longitude.
  const lifted = (self.sunLatitude * Math.PI) / 180;
  const round = (self.sunLongitude * Math.PI) / 180;
  const ahead = -Math.cos(lifted);
  const way = [Math.sin(round) * ahead, Math.sin(lifted), Math.cos(round) * ahead];
  const quarter = Math.PI / 2;

  for (let j = 0; j < height; j++) {
    const theta = (j / (height - 1)) * Math.PI;
    const y = Math.cos(theta);
    const angle = Math.acos(Math.min(1, Math.max(-1, y)));
    // The rows are written from the bottom one up.
    const row = (height - j - 1) * width * 4;
    let tone;
    if (y < 0) {
      tone = between(ground, bottom, eased((angle - quarter) / quarter, groundCurve));
      for (let channel = 0; channel < 3; channel++) tone[channel] *= groundEnergy;
    } else {
      tone = between(horizon, top, eased(1 - angle / quarter, skyCurve));
      for (let channel = 0; channel < 3; channel++) tone[channel] *= skyEnergy;
    }
    for (let i = 0; i < width; i++) {
      let here = tone;
      if (y >= 0) {
        const phi = (i / (width - 1)) * 2 * Math.PI;
        const x = -Math.sin(phi) * Math.sin(theta);
        const z = -Math.cos(phi) * Math.sin(theta);
        const off = (Math.acos(Math.min(1, Math.max(-1, way[0] * x + way[1] * y + way[2] * z))) * 180) / Math.PI;
        if (off < sunAngleMin) here = over(tone, sun);
        else if (off < sunAngleMax) here = between(over(tone, sun), tone, eased((off - sunAngleMin) / (sunAngleMax - sunAngleMin), sunCurve));
      }
      pixels.set(here, row + i * 4);
    }
  }
  return { pixels, width, height, format: "RGBA32F", linear: true, sheer: false };
}

export const ProceduralSkyTextureData = defineType("ProceduralSkyTextureData", TextureData, {
  properties: {
    skyTopColor: "#a5d6f1",
    skyHorizonColor: "#d6eafa",
    skyCurve: 0.09,
    skyEnergy: 1,
    groundBottomColor: "#282f36",
    groundHorizonColor: "#6c655f",
    groundCurve: 0.02,
    groundEnergy: 1,
    sunColor: "#ffffff",
    sunLatitude: 35,
    sunLongitude: 0,
    sunAngleMin: 1,
    sunAngleMax: 100,
    sunCurve: 0.05,
    sunEnergy: 1,
    textureQuality: SkyTextureQualityMedium,
  },
  enums: { SkyTextureQualityLow, SkyTextureQualityMedium, SkyTextureQualityHigh, SkyTextureQualityVeryHigh },
  setup(self) {
    self.$picture = kept(self, () => sky(self));
  },
});

// QtQuick3D.Helpers.impl: what Qt's ExtendedSceneEnvironment.qml is made
// of that Qt has in C++. A SceneEffectEnvironment is a SceneEnvironment
// that does not bring what is drawn to the screen as each thing is drawn:
// the scene is drawn in linear light, and the effect that says it is the
// environment's (a MainSceneEffect) brings the whole picture to the screen
// afterwards. What that effect is to do it has as properties, by the names
// Qt's SceneEffect.qml gives them, and those are read here.
//
// Of what it does these are here: how exposed the picture is (`exposure`),
// the tone mapping and its white point (`tonemapMode`, `white`), smoothing
// of edges (`applyFXAA`), sharpening (`sharpnessAmount`), dithering,
// brightness, contrast and saturation, and the vignette.
//
// Not here: glow, lens flare, the colour table (`enableLut`), and the three
// effects before it: depth of field, and the light and the reflections
// worked out from the picture (DepthOfFieldEffect, SsgiEnvEffect,
// SsrEnvEffect), which are held and do nothing.
import { defineType, effect } from "../../../object.js";
import { Effect } from "../../effects.js";
import { linear, SceneEnvironment } from "../../scene.js";
import { signal } from "#kernel";

// An effect says whose it is, and the environment takes it as the one it
// has of that kind.
const SceneEffectBase = defineType("SceneEffectBase", Effect, {
  properties: {
    environment: null,
  },
  setup(self) {
    // Its shaders are Qt's own and are not run: what it does that is here
    // the renderer does itself.
    self.$passes = () => null;
    effect(
      () => self.environment,
      (environment) => {
        environment?.$effect?.(self.$kind, self);
      },
    );
  },
});

export const MainSceneEffect = defineType("MainSceneEffect", SceneEffectBase, {
  setup(self) {
    self.$kind = "main";
  },
});

const switched = (name, kind) =>
  defineType(name, SceneEffectBase, {
    properties: {
      enabled: false,
    },
    setup(self) {
      self.$kind = kind;
    },
  });

export const DepthOfFieldEffect = switched("DepthOfFieldEffect", "blur");
export const SsgiEnvEffect = switched("SsgiEnvEffect", "light");
export const SsrEnvEffect = switched("SsrEnvEffect", "mirror");

const number = (value, otherwise) => (typeof value === "number" && Number.isFinite(value) ? value : otherwise);

export const SceneEffectEnvironment = defineType("SceneEffectEnvironment", SceneEnvironment, {
  setup(self) {
    const [main, setMain] = signal(null, self.$owner);
    self.$effect = (kind, made) => {
      if (kind === "main") setMain(made);
    };
    const usual = self.$environment;
    self.$environment = () => {
      const told = main();
      // A colour an effect is handed is in linear light, as every colour
      // Qt draws with is.
      const [r, g, b] = linear(told?.vignetteColor ?? "gray");
      return {
        ...usual(),
        grade: {
          tonemap: number(told?.tonemapMode, self.tonemapMode),
          exposure: number(told?.exposure, 1),
          white: number(told?.white, 1),
          smooth: Boolean(told?.applyFXAA),
          sharpness: number(told?.sharpnessAmount, 0),
          dither: Boolean(told?.ditheringEnabled),
          adjust: told?.colorAdjustmentsEnabled ? [number(told.adjustmentBrightness, 1), number(told.adjustmentContrast, 1), number(told.adjustmentSaturation, 1)] : null,
          vignette: told?.vignetteEnabled ? [r, g, b, number(told.vignetteStrength, 15), number(told.vignetteRadius, 0.35)] : null,
        },
      };
    };
  },
});

// GraphicsInfo: what an item is drawn with. Here that is WebGL 2, which is
// OpenGL ES 3.0, and shaders are handed over as Qt bakes them: so `api` is
// OpenGL as it is where Qt draws with that, and a program that asks which
// way up a picture comes is answered as it is there.
import { defineType, QtObject } from "../object.ts";

const OpenGL = 3;
const RhiShader = 3;
const OfflineCompilation = 2;
const ShaderSourceFile = 2;
const OpenGLNoProfile = 0;
const SurfaceFormatOpenGLES = 2;

const enums = {
  Unknown: 0,
  Software: 1,
  OpenVG: 2,
  OpenGL,
  Direct3D11: 4,
  Vulkan: 5,
  Metal: 6,
  Null: 7,
  Direct3D12: 8,
  UnknownShadingLanguage: 0,
  GLSL: 1,
  HLSL: 2,
  RhiShader,
  RuntimeCompilation: 1,
  OfflineCompilation,
  ShaderSourceString: 1,
  ShaderSourceFile,
  ShaderByteCode: 4,
  OpenGLNoProfile,
  OpenGLCoreProfile: 1,
  OpenGLCompatibilityProfile: 2,
  SurfaceFormatUnspecified: 0,
  SurfaceFormatOpenGL: 1,
  SurfaceFormatOpenGLES,
};

const GraphicsInfoAttached = defineType("GraphicsInfoAttached", QtObject, {
  properties: {
    api: OpenGL,
    shaderType: RhiShader,
    shaderCompilationType: OfflineCompilation,
    shaderSourceType: ShaderSourceFile,
    majorVersion: 3,
    minorVersion: 0,
    profile: OpenGLNoProfile,
    renderableType: SurfaceFormatOpenGLES,
  },
});

export const GraphicsInfo = defineType("GraphicsInfo", QtObject, { enums, attached: GraphicsInfoAttached });

import base from "./playwright.config.js";

// The View3D specs on the wgpu renderer on a real adapter (RADV here): without
// these a headless Chromium has no WebGPU and they would say nothing of it.
// Any spec of a scene runs on it: VITE_LJOS_VIEW3D=wgpu is what the server reads.
process.env.VITE_LJOS_VIEW3D = "wgpu";

export default {
  ...base,
  use: {
    ...base.use,
    launchOptions: { args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=vulkan", "--ignore-gpu-blocklist"] },
  },
};

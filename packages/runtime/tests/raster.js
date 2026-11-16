// What paints the page: null where it is SwiftShader, the software GPU a
// browser without one of its own has, else the GPU's name. A GPU's
// compositor smooths the edge of a turned layer, and reads a stretched
// picture between its pixels, otherwise than SwiftShader does, by a
// pixel at an edge; `tests/wgpu.config.js` paints on one (ANGLE on
// Vulkan). A spec that reads such an edge says so where it is painted
// on a GPU, and why, in its annotations.
export async function gpu(page) {
  const name = await page.evaluate(() => {
    const gl = new OffscreenCanvas(1, 1).getContext("webgl2");
    if (!gl) return "";
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  });
  return /swiftshader/i.test(name) ? null : name || null;
}

// Notes on the test that a check is narrowed on a GPU, and why.
export const narrowed = (info, renderer, why) => info.annotations.push({ type: "narrowed on a GPU", description: `${renderer}: ${why}` });

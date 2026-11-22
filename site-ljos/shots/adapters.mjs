// Which adapter drew a picture, and whether it is a GPU. A renderer that
// was asked for says nothing of what answered: a browser without a GPU
// gives WebGPU and WebGL 2 alike from SwiftShader.

// Looked for first: a software rasteriser can carry a GPU maker's name
// ("ANGLE (Intel, llvmpipe ...)").
const SOFTWARE = /swiftshader|subzero|llvmpipe|lavapipe|softpipe|swrast|\bsoftware\b|basic render|\bwarp\b/i;
const GPU = /\b(amd|ati|radeon|nvidia|geforce|quadro|intel|apple|adreno|qualcomm|mali|arm|powervr|imagination|videocore|broadcom|samsung|xclipse)\b/i;

// "hardware" only where a GPU is named; what can't be told is "unknown",
// and counted with what is not a GPU.
export function adapterKind(name, fallback = false) {
  if (fallback) return "software";
  const said = name ?? "";
  if (SOFTWARE.test(said)) return "software";
  return GPU.test(said) ? "hardware" : "unknown";
}

const TRUST = { software: 0, unknown: 1, hardware: 2 };

// A picture is as much a GPU's as the least trusted thing drawn in it.
export const leastTrusted = (drew) => [...drew].sort((a, b) => TRUST[a.kind] - TRUST[b.kind])[0];

// What drew a picture, of the APIs seen drawing it and the adapter each
// had: the least trusted of them. None is the DOM, which is put down to
// the browser's adapter as WebGL names it; null is a canvas whose drawing
// was not seen, which is nobody's GPU.
export function drawnWith(apis, adapters = {}) {
  if (apis === null) return { api: null, adapter: "", kind: "unknown" };
  const drew = (apis.length > 0 ? apis : [null]).map((api) => {
    const { name = "", fallback = false } = adapters[api ?? "webgl2"] ?? {};
    return { api, adapter: name, kind: adapterKind(name, fallback) };
  });
  return leastTrusted(drew);
}

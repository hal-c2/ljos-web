// What the SITE-4 audit found broken, with why, for `test.fail`: the
// test runs and must fail. A fixed example makes its test red, so it
// comes out of here in the change that fixes it, and the suite then
// holds it working.

// An example the audit found broken, by page and its place on it (the
// docs are pinned, site/ljos-ui.sha): the reason, as the audit says it.
const covered = "audit: a press on its Controls text field lands on an element over the field's input (one holding an empty .qq-text), so the input never takes focus and what the reader types goes nowhere";
const BROKEN = {
  // Its pictures now ship (files=); what is left is its field, which
  // the MOTION lane's window frame (site5/window-frame) takes out from
  // under the element over it.
  "/quality/accessibility/#0": `${covered}; waits on site5/window-frame (SITE-5 MOTION)`,
  "/quality/accessibility/#1": `${covered}; waits on site5/window-frame (SITE-5 MOTION)`,
};

export function brokenExample(route, index) {
  return BROKEN[`${route}#${index}`] ?? null;
}

export const sourceView = "SOURCE lane: a demo has no 'show source' yet";

export const demo = {
  orbitRenderer:
    "audit (b): site-ljos builds without VITE_LJOS_VIEW3D=wgpu, so Orbit is drawn by the JS WebGL2 renderer ($view3d.backend 'webgl2') while the page says it is drawn on wgpu",
  fieldGuideSearch:
    "audit: a mouse press on the field guide's search field leaves focus on the page body, so what the reader types goes nowhere; typing after focus() does filter the list",
};

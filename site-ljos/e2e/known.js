// What the SITE-4 audit found broken, with why, for `test.fail`: the
// test runs and must fail. A fixed example makes its test red, so it
// comes out of here in the change that fixes it, and the suite then
// holds it working.

// An example the audit found broken, by page and its place on it (the
// docs are pinned, site/ljos-ui.sha): the reason, as the audit says it.
const missing = (files) => `audit: the example names ${files}, which the docs page does not ship; the block says 'No such file or directory'`;
const cors = "audit: the example fetches example.org, which sends no Access-Control-Allow-Origin, so the browser blocks it (CORS) and the model stays empty";
const BROKEN = {
  "/start/#0": missing("shell.qml and AppShell.qml"),
  "/ui/items/#3": missing("photo.jpg"),
  "/ui/shapes-and-effects/#3": missing("logo.svg"),
  "/data/models/#2": missing("feed.xml"),
  "/data/models/#3": missing("rows.json"),
  "/data/fetching/#0": cors,
  "/data/fetching/#1": cors,
  "/language/overview/#2": "audit: does not run: 'TypeError: Cannot read properties of undefined (reading 'ticks')'; the Timer's handler reads parent.ticks, and a Timer's parent is not the Item that holds it",
  "/quality/accessibility/#1": missing("status-ok.svg and decorative-wave.svg"),
  "/rust/multimedia/#0": missing("beep.wav"),
};

export function brokenExample(route, index) {
  return BROKEN[`${route}#${index}`] ?? null;
}

export const windowRoot =
  "audit (a): a Window/ApplicationWindow root is put in a .qq-layer at the window's 0,0 over the whole site (z-index 2147483000), leaving its stage empty; ShellLoader does not hold a Window in the block's frame";

export const sourceView = "SOURCE lane: a demo has no 'show source' yet";

export const calmNotWired =
  "audit: nothing on the web reads prefers-reduced-motion; DemosPage never sets Motion.calm, so a reader who asks for reduced motion gets the full spring";

export const demo = {
  orbitRenderer:
    "audit (b): site-ljos builds without VITE_LJOS_VIEW3D=wgpu, so Orbit is drawn by the JS WebGL2 renderer ($view3d.backend 'webgl2') while the page says it is drawn on wgpu",
  orbitVerticalDrag:
    "audit (d): the page Flickable takes a vertical mouse drag that starts on the Orbit scene (Flickable.js) and scrolls the page; a sideways drag turns the scene",
  fieldGuideSearch:
    "audit: a mouse press on the field guide's search field leaves focus on the page body, so what the reader types goes nowhere; typing after focus() does filter the list",
};

// What the 3D perf harness (`perf3d/`, `pnpm perf:3d`) is told by a page,
// on each renderer a View3D has: each frame says what of it went to reading
// the scene into the renderer (sync), to drawing it (draw) and to handing
// it to the GPU (submit), how many draw calls and uploads it made, and how
// often it crossed between JavaScript and wasm. And a scene that stands
// still asks for no frame once it is drawn: nothing polls.
import { expect, test } from "./open.js";
import { kinds, probe } from "./perf3d/probe.js";

test.use({
  launchOptions: { args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=vulkan", "--ignore-gpu-blocklist"] },
  viewport: { width: 400, height: 300 },
  deviceScaleFactor: 1,
});

const HIDDEN = `
  delete Navigator.prototype.gpu;
  if (self.WorkerNavigator) delete WorkerNavigator.prototype.gpu;
`;

const RENDERERS = [
  { name: "the JavaScript renderer", query: "", renderer: "js", backend: "webgl2", wasm: false },
  { name: "wgpu on WebGPU", query: "&view3d=wgpu", renderer: "wgpu", backend: "webgpu", wasm: true },
  { name: "wgpu on WebGL2", query: "&view3d=wgpu", renderer: "wgpu", backend: "webgl2", wasm: true, hidden: true },
];

const view = (page) => page.evaluate(() => document.querySelector(".qq-view3d")?.$view3d && { ...document.querySelector(".qq-view3d").$view3d });

async function show(page, scene, { query, hidden }, options) {
  await page.addInitScript(probe, options);
  if (hidden) await page.addInitScript(HIDDEN);
  await page.goto(`/?scene=${scene}${query}`);
  await page.waitForFunction(() => window.ready);
  await page.waitForFunction(() => document.querySelector(".qq-view3d")?.$view3d?.frames > 0);
}

for (const renderer of RENDERERS) {
  test.describe(renderer.name, () => {
    test("an animated frame says its sync, draw and submit, its draw calls, uploads and crossings", async ({ page }) => {
      await show(page, "perf3d_spin", renderer, { count: true });
      expect(await view(page)).toMatchObject({ renderer: renderer.renderer, backend: renderer.backend });
      await page.waitForFunction(() => window.perf3d.frames.filter(({ drawn }) => drawn).length >= 5);
      const frames = await page.evaluate(() => window.perf3d.frames);
      // The first is of making the scene; what animating costs is after it.
      const drawn = frames.filter(({ drawn }) => drawn).slice(1);
      for (const frame of drawn) {
        for (const time of ["busy", "script", "sync", "draw", "submit"]) expect(frame[time], time).toBeGreaterThanOrEqual(0);
        const made = kinds(frame.calls);
        expect(made.draws, "draw calls").toBeGreaterThan(0);
        expect(made.submits, "submits").toBeGreaterThan(0);
        // What the frame changed reaches the GPU: as buffers, or on WebGL2 as uniforms.
        expect(made.uploads + made.uniforms, "uploads").toBeGreaterThan(0);
        expect(frame.bytes, "bytes uploaded").toBeGreaterThan(0);
        if (renderer.wasm) expect(frame.into + frame.out, "crossings").toBeGreaterThan(0);
        else expect(frame.into + frame.out, "crossings").toBe(0);
      }
      // Every frame that is drawn was synced, in it or the frame before.
      expect(drawn.reduce((total, { builds }) => total + builds, 0)).toBeGreaterThanOrEqual(drawn.length - 1);
      // Time went to reading the scene and to drawing it.
      expect(drawn.reduce((total, { sync, draw }) => total + sync + draw, 0)).toBeGreaterThan(0);
    });

    test("a still scene asks for no frame once it is drawn", async ({ page }) => {
      await show(page, "perf3d_still", renderer, {});
      // What it fetched and made settles first.
      await page.waitForTimeout(500);
      const before = await page.evaluate(() => ({ asked: window.perf3d.asked, frames: window.perf3d.frames.length }));
      await page.waitForTimeout(1000);
      const after = await page.evaluate(() => ({ asked: window.perf3d.asked, frames: window.perf3d.frames.length }));
      expect(after).toEqual(before);
    });
  });
}

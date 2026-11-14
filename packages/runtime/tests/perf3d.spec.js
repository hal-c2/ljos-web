// What the 3D perf harness (`perf3d/`, `pnpm perf:3d`) is told by a page,
// on each renderer a View3D has: each frame says what of it went to reading
// the scene into the renderer (sync), to drawing it (draw) and to handing
// it to the GPU (submit), how many draw calls and uploads it made, and how
// often it crossed between JavaScript and wasm. And a scene that stands
// still asks for no frame once it is drawn: nothing polls.
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "./open.js";
import { kinds, probe } from "./perf3d/probe.js";
import { sample } from "./perf3d/sample.js";
import { fresh, table } from "./perf3d/table.js";

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

    if (!renderer.wasm)
      test("a frame of many models hands over once what is the same for each", async ({ page }) => {
        await show(page, "perf3d_many", renderer, { count: true });
        await page.waitForFunction(() => window.perf3d.frames.filter(({ drawn }) => drawn).length >= 5);
        const frames = await page.evaluate(() => window.perf3d.frames);
        const drawn = frames.filter(({ drawn }) => drawn).slice(1);
        expect(drawn.length).toBeGreaterThan(0);
        for (const frame of drawn) {
          const made = kinds(frame.calls);
          expect(made.draws, "draw calls").toBe(64);
          // A uniform keeps its value in its program: what is the same for
          // every model (the eye, the lights, the material) is handed over
          // once a frame at most, and each model's draw says only where it
          // is. A light moves, so the lights are said each frame.
          const told = Object.fromEntries(Object.entries(frame.calls).filter(([key]) => /^WebGL2\.uniform/.test(key)));
          expect(made.uniforms, `uniform calls for ${made.draws} draws: ${JSON.stringify(told)}`).toBeLessThanOrEqual(3 * made.draws + 32);
        }
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

// An upload counts what it carries: the part of its data it was told to
// take, in elements of a typed array or bytes of a plain buffer, not all of
// the array it was handed.
test("an upload counts the bytes of the range it writes, not of the whole array", async ({ page }) => {
  await show(page, "perf3d_still", RENDERERS[0], { count: true });
  // The scene's own first frames settle first: after them it uploads nothing.
  await page.waitForTimeout(500);
  const bytes = await page.evaluate(async () => {
    const P = window.perf3d;
    const framed = (work) =>
      new Promise((done) => {
        P.reset();
        requestAnimationFrame(async () => {
          await work();
          requestAnimationFrame(() => requestAnimationFrame(() => done(P.frames.reduce((total, frame) => total + frame.bytes, 0))));
        });
      });
    const gl = new OffscreenCanvas(4, 4).getContext("webgl2");
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    const found = {
      bufferData: await framed(() => gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(1024), gl.STATIC_DRAW, 0, 16)),
      bufferDataToEnd: await framed(() => gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(1024), gl.STATIC_DRAW, 1000)),
      bufferSubData: await framed(() => gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(1024), 4, 8)),
    };
    const device = await (await navigator.gpu?.requestAdapter())?.requestDevice();
    if (device) {
      const buffer = device.createBuffer({ size: 4096, usage: GPUBufferUsage.COPY_DST });
      found.writeBuffer = await framed(() => device.queue.writeBuffer(buffer, 0, new Float32Array(1024), 0, 16));
      found.writeBufferBytes = await framed(() => device.queue.writeBuffer(buffer, 0, new ArrayBuffer(4096), 1024));
    }
    return found;
  });
  expect(bytes).toMatchObject({ bufferData: 64, bufferDataToEnd: 96, bufferSubData: 32 });
  if ("writeBuffer" in bytes) expect(bytes).toMatchObject({ writeBuffer: 64, writeBufferBytes: 3072 });
});

// A run's table is of that run: what an earlier one measured is taken away
// before it starts, so a run of one scene does not show another's old rows
// as new. qml6's numbers, measured on their own by `qml6.js`, stay.
test("the harness's table shows only what its last run measured, beside qml6's", () => {
  const out = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "perf3d-"));
  try {
    const result = (scene, renderer) => ({
      scene,
      renderer,
      label: renderer,
      startup: { presented: 100 },
      frames: { fps: 60, interval: {}, busy: {}, sync: {}, draw: {}, submit: {}, other: {} },
      cpu: {},
      counts: { perFrame: {} },
      memory: {},
      idle: { percent: {}, asked: 0 },
    });
    // What a run wrote, qml6's files, and what else may share the folder
    // `LJOS_PERF3D_OUT` names: only the first go.
    const others = ["README.md", "package.json", "notes-js.json", "grid.png"];
    const earlier = ["grid-js.json", "grid-js.png", "grid-js.cpuprofile", "stress-webgl2.json", "summary.md", "qml6.json", "grid-qml6.png", "qml6-grid.log", ...others];
    for (const name of earlier) writeFileSync(join(out, name), name === "grid-js.json" ? JSON.stringify(result("grid", "js")) : name === "qml6.json" ? JSON.stringify({ version: "6.12.0", scenes: { grid: {} } }) : "");
    mkdirSync(join(out, "kept"));

    fresh(out);
    writeFileSync(join(out, "spin-js.json"), JSON.stringify(result("spin", "js")));

    expect(readdirSync(out).sort()).toEqual([...others, "grid-qml6.png", "kept", "qml6-grid.log", "qml6.json", "spin-js.json"].sort());
    const rows = table(out).split("\n").filter((line) => /^\| (spin|grid) /.test(line));
    expect(rows.map((line) => line.split(" | ").slice(0, 2).join(" | "))).toEqual(["| spin | js", "| grid | qml6 6.12.0 native (rhi)"]);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("qml6's sample needs every field, so a resident size it could not read is no measurement", () => {
  expect(sample("12 14 100 100")).toEqual({ a: 12, b: 14, rss: 100, tick: 100 });
  expect(sample("12 14  100")).toBeNull();
  expect(sample("12 14 100")).toBeNull();
  expect(sample("14 12 100 100")).toBeNull();
  expect(sample("12 14 100 0")).toBeNull();
});

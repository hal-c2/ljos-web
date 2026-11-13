// Measures each scene of `scenes/` on each renderer a View3D has, off-screen
// in a headless Chromium on the machine's own GPU, and writes what it found
// to `$LJOS_PERF3D_OUT` (else `results/`), one file a scene and renderer;
// `table.js` makes the table of them.
//
// A scene is measured twice, in two pages. The first times: from the start
// of navigation to the first 3D frame presented, the frames while the scene
// animates, the CPU each process of the browser spent on them, memory, and
// then the same scene with time stopped. The second counts, per frame, the
// GPU calls and the calls between JavaScript and wasm, which takes time of
// its own and so is not in what the first times.
//
// `LJOS_PERF3D_SCENES` and `LJOS_PERF3D_RENDERERS` (comma lists) choose;
// `LJOS_PERF3D_SECONDS` is how long the frames are measured (5).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, loadavg } from "node:os";
import { join } from "node:path";
import { test } from "@playwright/test";
import { kinds, probe } from "./probe.js";

export const OUT = process.env.LJOS_PERF3D_OUT ?? join(import.meta.dirname, "results");
const SECONDS = Number(process.env.LJOS_PERF3D_SECONDS ?? 5);
const WARM = 2000;
const IDLE = 10_000;

const SCENES = [
  { name: "spin", size: [400, 300], about: "one lit cube turning (ljos-ui bench/quick3d-spin.qml)" },
  { name: "orbit", size: [720, 420], about: "ljos.dev's orbit demo: 12 models, 4 lights, a shadow, MSAA" },
  { name: "grid", size: [640, 480], about: "1000 cubes by a Repeater3D, 4 lights, one circling (bench/quick3d-grid.qml)" },
  { name: "instances", size: [640, 480], about: "10000 instances by RandomInstancing, turned as one (bench/quick3d-instances.qml)" },
  { name: "stress", size: [800, 600], about: "400 textured models, 10 lights, a shadow, a circling camera, 50 turning" },
];
const RENDERERS = [
  { id: "js", query: "", label: "JS renderer (WebGL2)" },
  { id: "webgpu", query: "&view3d=wgpu", label: "wgpu on WebGPU" },
  { id: "webgl2", query: "&view3d=wgpu", label: "wgpu on WebGL2", hidden: true },
];
const chosen = (all, list) => (list ? all.filter(({ name, id }) => list.split(",").includes(name ?? id)) : all);

// A headless Chromium has WebGPU on a real adapter with these (RADV here).
test.use({
  launchOptions: {
    args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=vulkan", "--ignore-gpu-blocklist", "--enable-precise-memory-info"],
  },
});

const HIDDEN = `
  delete Navigator.prototype.gpu;
  if (self.WorkerNavigator) delete WorkerNavigator.prototype.gpu;
`;

const sorted = (values) => [...values].sort((a, b) => a - b);
const quantile = (values, q) => {
  if (!values.length) return null;
  const all = sorted(values);
  return all[Math.min(all.length - 1, Math.floor(q * all.length))];
};
const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const spread = (values) => ({ p50: quantile(values, 0.5), p99: quantile(values, 0.99), mean: mean(values), max: values.length ? Math.max(...values) : null });

// Seconds of CPU each kind of the browser's processes has spent.
async function processes(browserCdp) {
  const { processInfo } = await browserCdp.send("SystemInfo.getProcessInfo");
  const by = {};
  // Chromium names its GPU process "GPU" and the others in lower case.
  for (const { type, cpuTime } of processInfo) by[type.toLowerCase()] = (by[type.toLowerCase()] ?? 0) + cpuTime;
  return by;
}

// Resident memory of each kind of the browser's processes, where the
// system says (Linux).
async function resident(browserCdp) {
  const { processInfo } = await browserCdp.send("SystemInfo.getProcessInfo");
  const by = {};
  for (const { type, id } of processInfo) {
    const status = `/proc/${id}/status`;
    if (!existsSync(status)) continue;
    const kb = Number(/VmRSS:\s+(\d+)/.exec(readFileSync(status, "utf8"))?.[1] ?? 0);
    by[type.toLowerCase()] = (by[type.toLowerCase()] ?? 0) + kb * 1024;
  }
  return by;
}
const spent = (before, after) => Object.fromEntries(Object.keys(after).map((type) => [type, after[type] - (before[type] ?? 0)]));

async function metrics(cdp) {
  const { metrics } = await cdp.send("Performance.getMetrics");
  return Object.fromEntries(metrics.map(({ name, value }) => [name, value]));
}

async function opened(browser, scene, renderer, options, query = "") {
  const context = await browser.newContext({ viewport: { width: scene.size[0], height: scene.size[1] }, deviceScaleFactor: 1, reducedMotion: "no-preference" });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => message.type() === "error" && problems.push(message.text()));
  await page.addInitScript(probe, options);
  if (renderer.hidden) await page.addInitScript(HIDDEN);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable", { timeDomain: "threadTicks" });
  await page.goto(`/?scene=${scene.name}${renderer.query}${query}`);
  await page.waitForFunction(() => window.perf3d.first.presented !== null || document.querySelector(".qq-view3d")?.$view3d?.error, null, { timeout: 120_000 });
  // Reduced motion is less movement, and what is measured is the scene.
  if (await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)) throw new Error("perf3d does not measure with reduced motion on");
  const view = await page.evaluate(() => {
    const { renderer, backend, error } = document.querySelector(".qq-view3d").$view3d;
    return { renderer, backend, error };
  });
  if (view.error) throw new Error(`${scene.name} on ${renderer.id}: ${view.error}`);
  return { context, page, cdp, problems, view };
}

async function timing(browser, scene, renderer) {
  const browserCdp = await browser.newBrowserCDPSession();
  const { context, page, cdp, problems, view } = await opened(browser, scene, renderer, { gpu: renderer.id === "webgpu" });
  const startup = await page.evaluate(() => ({
    ...window.perf3d.first,
    ready: performance.getEntriesByName("ready")[0]?.startTime ?? null,
    load: performance.getEntriesByType("navigation")[0]?.loadEventEnd ?? null,
    wasm: performance
      .getEntriesByType("resource")
      .filter(({ name }) => /\.wasm$/.test(name))
      .map(({ name, startTime, responseEnd, encodedBodySize, decodedBodySize }) => ({ name: name.split("/").pop(), start: startTime, end: responseEnd, encodedBodySize, decodedBodySize })),
    isolated: crossOriginIsolated,
  }));
  await page.waitForTimeout(WARM);
  await page.evaluate(() => window.perf3d.reset());
  const [m0, p0] = [await metrics(cdp), await processes(browserCdp)];
  await page.waitForTimeout(SECONDS * 1000);
  const [m1, p1] = [await metrics(cdp), await processes(browserCdp)];
  const { frames, gpu, asked, ran } = await page.evaluate(() => {
    const { frames, gpu, asked, ran } = window.perf3d;
    return { frames: frames.splice(0), gpu: gpu.splice(0), asked, ran };
  });
  const memory = await page.evaluate(() => ({ ...window.perf3d.memory(), view: document.querySelector(".qq-view3d").$view3d.memory?.() ?? null }));
  memory.resident = await resident(browserCdp);
  const seconds = (m1.Timestamp - m0.Timestamp) || SECONDS;

  // The same scene with time stopped: nothing is to be done.
  await page.evaluate(() => window.clock.stop());
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.perf3d.reset());
  const [i0, q0] = [await metrics(cdp), await processes(browserCdp)];
  await page.waitForTimeout(IDLE);
  const [i1, q1] = [await metrics(cdp), await processes(browserCdp)];
  const idle = await page.evaluate(() => ({ asked: window.perf3d.asked, ran: window.perf3d.ran, frames: window.perf3d.frames.length, drawn: window.perf3d.frames.filter(({ drawn }) => drawn).length }));
  const idleSeconds = i1.Timestamp - i0.Timestamp;
  await context.close();
  await browserCdp.detach();

  const drawn = frames.filter(({ drawn }) => drawn);
  const shown = drawn.map(({ t }) => t);
  const intervals = shown.slice(1).map((t, i) => t - shown[i]);
  const perFrame = (value) => (drawn.length ? value / drawn.length : null);
  const cpu = spent(p0, p1);
  return {
    view,
    problems,
    startup,
    frames: {
      seconds,
      animationFrames: frames.length,
      drawn: drawn.length,
      fps: drawn.length / seconds,
      asked,
      ran,
      interval: spread(intervals),
      busy: spread(frames.map(({ busy }) => busy)),
      script: spread(frames.map(({ script }) => script)),
      sync: spread(frames.filter(({ builds }) => builds).map(({ sync }) => sync)),
      builds: frames.reduce((total, { builds }) => total + builds, 0),
      draw: spread(drawn.map(({ draw, submit }) => draw - submit)),
      submit: spread(drawn.map(({ submit }) => submit)),
      // What the frame spent besides: the clock's step, bindings, microtasks,
      // style, layout and paint of the page.
      other: spread(frames.map(({ busy, sync, draw }) => Math.max(0, busy - sync - draw))),
      gpu: gpu.length ? spread(gpu) : null,
    },
    // Milliseconds of CPU per frame drawn, by the browser's process: the
    // page's main thread, and the GPU process where the calls are carried
    // out.
    cpu: {
      main: perFrame((m1.TaskDuration - m0.TaskDuration) * 1000),
      script: perFrame((m1.ScriptDuration - m0.ScriptDuration) * 1000),
      renderer: perFrame((cpu.renderer ?? 0) * 1000),
      gpu: perFrame((cpu.gpu ?? 0) * 1000),
      browser: perFrame((cpu.browser ?? 0) * 1000),
      percent: Object.fromEntries(Object.entries(cpu).map(([type, value]) => [type, (100 * value) / seconds])),
    },
    memory: { ...memory, jsHeapUsed: m1.JSHeapUsedSize, jsHeapTotal: m1.JSHeapTotalSize },
    idle: {
      ...idle,
      seconds: idleSeconds,
      main: (i1.TaskDuration - i0.TaskDuration) * 1000,
      percent: Object.fromEntries(Object.entries(spent(q0, q1)).map(([type, value]) => [type, (100 * value) / idleSeconds])),
    },
  };
}

async function counting(browser, scene, renderer) {
  const { context, page, problems } = await opened(browser, scene, renderer, { count: true });
  const made = await page.evaluate(() => window.perf3d.frames.slice(0));
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.perf3d.reset());
  await page.waitForTimeout(2000);
  const { frames, wasm } = await page.evaluate(() => ({ frames: window.perf3d.frames.splice(0), wasm: window.perf3d.wasm }));
  const adapter = await page.evaluate(async () => {
    const found = await navigator.gpu?.requestAdapter();
    const gl = document.createElement("canvas").getContext("webgl2");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      webgpu: found ? { vendor: found.info?.vendor, architecture: found.info?.architecture, description: found.info?.description, timestamps: found.features.has("timestamp-query") } : null,
      webgl2: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null,
    };
  });
  await context.close();
  const drawn = frames.filter(({ drawn }) => drawn);
  const totals = (list) => {
    const all = {};
    for (const { calls } of list) for (const [key, times] of Object.entries(calls ?? {})) all[key] = (all[key] ?? 0) + times;
    return all;
  };
  const per = (list, n) => Object.fromEntries(Object.entries(list).map(([key, value]) => [key, value / Math.max(1, n)]));
  const steady = totals(frames);
  const top = (record, n) =>
    Object.entries(record)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([name, times]) => [name, times / Math.max(1, drawn.length)]);
  return {
    problems,
    adapter,
    // Made before the first frame was presented and in it: programs,
    // pipelines, buffers, textures.
    startup: { ...kinds(totals(made)), calls: undefined, creates: Object.fromEntries(Object.entries(totals(made)).filter(([key]) => /\.(create\w+|compileShader|linkProgram)$/.test(key))) },
    perFrame: {
      drawn: drawn.length,
      ...per(kinds(steady), drawn.length),
      bytes: mean(drawn.map(({ bytes }) => bytes)),
      into: frames.reduce((total, { into }) => total + into, 0) / Math.max(1, drawn.length),
      out: frames.reduce((total, { out }) => total + out, 0) / Math.max(1, drawn.length),
      topCalls: top(steady, 15),
      topImports: Object.fromEntries(Object.entries(wasm).map(([name, { imports }]) => [name, top(imports, 15)])),
      topExports: Object.fromEntries(Object.entries(wasm).map(([name, { exports }]) => [name, top(exports, 8)])),
    },
  };
}

// The scene 1.5 s after it starts, still, once what it fetched is drawn:
// `<scene>-<renderer>.png`, to see that each renderer draws the same.
async function picture(browser, scene, renderer, path) {
  const { context, page } = await opened(browser, scene, renderer, {}, "&at=1500");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await page.screenshot({ path });
  await context.close();
}

for (const scene of chosen(SCENES, process.env.LJOS_PERF3D_SCENES)) {
  for (const renderer of chosen(RENDERERS, process.env.LJOS_PERF3D_RENDERERS)) {
    test(`${scene.name} on ${renderer.id}`, async ({ browser }) => {
      const load = { before: loadavg(), cpus: cpus().length };
      const timed = await timing(browser, scene, renderer);
      const counted = await counting(browser, scene, renderer);
      load.after = loadavg();
      mkdirSync(OUT, { recursive: true });
      const result = { scene: scene.name, about: scene.about, size: scene.size, renderer: renderer.id, label: renderer.label, browser: browser.version(), load, seconds: SECONDS, ...timed, counts: counted };
      writeFileSync(join(OUT, `${scene.name}-${renderer.id}.json`), `${JSON.stringify(result, null, 2)}\n`);
      await picture(browser, scene, renderer, join(OUT, `${scene.name}-${renderer.id}.png`));
    });
  }
}

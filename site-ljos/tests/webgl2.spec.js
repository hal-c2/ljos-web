// The watch and the cockpit draw their models in 3D where WebGPU is not
// to be had: off in the browser, or offered with no adapter for the
// page. Their View3D is on the wgpu renderer there too, on its WebGL 2
// backend, which reads the glTF files their case, band and car are, where
// the JavaScript renderer reads none and drew the watch's light strips
// alone.
//
// That the models were drawn is read from the page's pixels, not from a
// canvas being there: the view's picture is held against the same demo
// drawn by the same renderer on the same WebGL 2 with the models' files
// refused, and the models are what the two differ by, more than two
// pictures without them differ. The watch turns on its turntable from
// Run until it is paused, so time is held from Run until the demo is
// opened: every run pauses it at the same angle, however long its page
// took to load, and never one run facing and another edge-on. Not
// against WebGPU's picture: SwiftShader's WebGPU, all a machine without
// a GPU has, may lose its device as it draws, and so is no yardstick.
import { expect, test } from "@playwright/test";

// Each browser draws WebGL 2 with SwiftShader, as a machine without a GPU
// Chromium lets it use does.
const DISABLED = ["--disable-features=WebGPU", "--enable-unsafe-swiftshader"];
const WAYS = [
  { name: "WebGPU disabled", args: DISABLED },
  {
    name: "WebGPU without an adapter",
    args: ["--enable-unsafe-webgpu", "--use-webgpu-adapter=swiftshader", "--enable-unsafe-swiftshader"],
    init: () => {
      if (navigator.gpu) navigator.gpu.requestAdapter = async () => null;
    },
  },
];

const DEMOS = [
  {
    name: "watch",
    // The watch turns while it runs: paused, it holds still to be read.
    open: async (page) => {
      await page.getByRole("button", { name: "Pause the watch" }).click();
      await expect(page.getByRole("button", { name: "Resume the watch" })).toBeVisible();
    },
  },
  {
    name: "cockpit",
    open: async (page) => {
      const car = page.getByRole("button", { name: "Car", exact: true });
      await car.click();
      await expect(car).toHaveAttribute("aria-pressed", "true");
    },
  },
];

// The View3D on screen, the largest where there are several, marked so
// that it is the one read: a page makes and lets go of its views as it
// runs, and a view counted by its place may be gone when it is read.
async function view(page) {
  await expect(page.locator(".qq-view3d").filter({ visible: true }).first(), "a View3D on screen").toBeVisible({ timeout: 30_000 });
  await page.locator(".qq-view3d").evaluateAll((views) => {
    let best = null;
    let most = 0;
    for (const one of views) {
      delete one.dataset.measured;
      const { width, height } = one.getBoundingClientRect();
      if (one.checkVisibility() && width * height > most) [best, most] = [one, width * height];
    }
    if (best) best.dataset.measured = "";
  });
  return page.locator(".qq-view3d[data-measured]");
}

// What each View3D on the page that has drawn says of itself.
const views = (page) =>
  page.locator(".qq-view3d").evaluateAll((all) => all.filter(({ $view3d }) => $view3d?.renderer).map(({ $view3d }) => ({ renderer: $view3d.renderer, backend: $view3d.backend, error: $view3d.error ?? null })));

// How two pictures of the same box differ: the pixels whose colours are
// further apart than antialiasing puts them, as a share of the box, and
// how tall a stretch of its rows they stand in.
function differing(page, a, b) {
  return page.evaluate(async ([a, b]) => {
    const read = async (shot) => {
      const picture = document.createElement("img");
      picture.src = `data:image/png;base64,${shot}`;
      await picture.decode();
      const paper = new OffscreenCanvas(picture.naturalWidth, picture.naturalHeight);
      const context = paper.getContext("2d", { willReadFrequently: true });
      context.drawImage(picture, 0, 0);
      return context.getImageData(0, 0, paper.width, paper.height);
    };
    const [one, two] = [await read(a), await read(b)];
    const width = Math.min(one.width, two.width);
    const height = Math.min(one.height, two.height);
    let count = 0;
    let top = height;
    let bottom = -1;
    for (let y = 0; y < height; y++) {
      let row = 0;
      for (let x = 0; x < width; x++) {
        const i = (y * one.width + x) * 4;
        const j = (y * two.width + x) * 4;
        if (Math.max(Math.abs(one.data[i] - two.data[j]), Math.abs(one.data[i + 1] - two.data[j + 1]), Math.abs(one.data[i + 2] - two.data[j + 2])) > 24) row++;
      }
      count += row;
      // A row a few stray pixels cross is not one the scene stands in.
      if (row >= 3) [top, bottom] = [Math.min(top, y), y];
    }
    return { count: count / (width * height), tall: bottom < top ? 0 : (bottom - top + 1) / height, width, height };
  }, [a, b]);
}

// The canvas's picture, and the pixels its scene covers: its box painted,
// against its box painted with the canvas hidden.
async function covered(page, canvas) {
  const shown = (await canvas.screenshot({ timeout: 30_000 })).toString("base64");
  await canvas.evaluate((node) => (node.style.visibility = "hidden"), null, { timeout: 30_000 });
  const behind = (await page.screenshot({ clip: await canvas.boundingBox({ timeout: 30_000 }) })).toString("base64");
  await canvas.evaluate((node) => (node.style.visibility = ""), null, { timeout: 30_000 });
  return { ...(await differing(page, shown, behind)), shown };
}

// What a reading says, without its picture.
const told = ({ shown, ...rest }) => JSON.stringify(rest);

// The demo run in a browser launched with `args`, at its address with
// `query`, the files `refused` matches refused, opened as `open` says, and
// read once its pictures are all drawn and two readings agree: the models
// come from their files after the first picture is drawn.
async function drawn(playwright, baseURL, testInfo, demo, { name, args, init, query = "", refused }) {
  const browser = await playwright.chromium.launch({ args });
  let page;
  const said = [];
  try {
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
    await context.clock.install();
    if (init) await context.addInitScript(init);
    if (refused) await context.route(refused, (route) => route.abort());
    page = await context.newPage();
    page.on("console", (message) => said.push(`${message.type()}: ${message.text()}`));
    page.on("pageerror", (error) => said.push(`pageerror: ${error.stack || error.message}`));
    await page.goto(`/demos/${demo.name}/${query}`);
    await page.waitForSelector('#app[data-ljos-hydrated="true"]');
    const run = page.getByRole("button", { name: `Run the ${demo.name}` });
    await expect(run, "the demo offers to run").toBeVisible({ timeout: 30_000 });
    await run.scrollIntoViewIfNeeded();
    // Held from here, time moves only a frame at a time while the demo
    // loads, and as far on every run that loads in as many frames.
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await run.click();
    const pause = page.getByRole("button", { name: `Pause the ${demo.name}` });
    await expect
      .poll(
        async () => {
          if (await pause.isVisible()) return true;
          await page.clock.runFor(16);
          return pause.isVisible();
        },
        { message: "once the demo is drawn, Run is its Pause", timeout: 90_000 },
      )
      .toBe(true);
    // As long running on every run, for the watch's screen to draw its
    // face, before the demo is opened (the watch paused).
    await page.clock.runFor(1500);
    await demo.open(page);
    await page.clock.resume();
    await page.waitForLoadState("networkidle");
    let reading = null;
    let canvas;
    for (let tries = 0; tries < 30; tries++) {
      await page.waitForFunction(() => [...document.querySelectorAll(".qq-view3d")].every(({ $view3d }) => !$view3d?.due), null, { timeout: 60_000, polling: "raf" });
      canvas = await view(page);
      const now = await covered(page, canvas);
      if (reading && Math.abs(now.count - reading.count) <= 0.002 && now.tall === reading.tall) break;
      reading = now;
      await page.waitForTimeout(250);
    }
    const state = await canvas.evaluate(({ $view3d }) => ({ renderer: $view3d?.renderer, backend: $view3d?.backend, error: $view3d?.error ?? null }), null, { timeout: 30_000 });
    const found = { ...reading, ...state, views: await views(page) };
    testInfo.annotations.push({ type: `${demo.name}, ${name}`, description: told(found) });
    await testInfo.attach(`${demo.name}, ${name}`, { body: await page.screenshot(), contentType: "image/png" });
    return found;
  } catch (error) {
    if (page) await testInfo.attach(`${demo.name}, ${name}: the page`, { body: await page.screenshot(), contentType: "image/png" }).catch(() => {});
    throw new Error(`${error.message}\n${demo.name}, ${name}, what the page said:\n${said.slice(-40).join("\n")}`, { cause: error });
  } finally {
    await browser.close();
  }
}

// The yardstick: wgpu on WebGL 2, asked for by the page's address, with
// the models' files refused.
const WITHOUT = { args: DISABLED, query: "?view3d=wgpu", refused: /\.glb(\?|$)/ };

for (const demo of DEMOS) {
  test(`the ${demo.name} draws its models in 3D without WebGPU`, async ({ playwright, baseURL, page }, testInfo) => {
    test.setTimeout(600_000);
    const found = [];
    for (const way of WAYS) found.push([way, await drawn(playwright, baseURL, testInfo, demo, way)]);
    const bare = await drawn(playwright, baseURL, testInfo, demo, { ...WITHOUT, name: "without its models" });
    const again = await drawn(playwright, baseURL, testInfo, demo, { ...WITHOUT, name: "without its models, again" });
    // How far two pictures without the models are apart, and a model's
    // least share of its view, a fiftieth.
    const apart = Math.max(3 * (await differing(page, bare.shown, again.shown)).count, 0.02);
    for (const [way, one] of found) {
      const said = `${way.name}: ${told(one)}; without its models: ${told(bare)}`;
      expect(one.views, `every View3D is drawn by wgpu on WebGL 2 (${said})`).not.toEqual([]);
      for (const view of one.views) expect(view, `every View3D is drawn by wgpu on WebGL 2 (${said})`).toEqual({ renderer: "wgpu", backend: "webgl2", error: null });
      const models = (await differing(page, one.shown, bare.shown)).count;
      expect(models, `the picture differs from the one without its models by more than two of those differ, ${apart} (${said})`).toBeGreaterThan(apart);
    }
  });
}

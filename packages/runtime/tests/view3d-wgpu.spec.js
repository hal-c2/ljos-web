// View3D drawn by the one wgpu renderer (`crates/ljos_web_3d`), on WebGPU and
// with WebGPU hidden from the page, where wgpu falls back to WebGL2. What is
// asserted is what features/quick3d of the toolkit asserts; where a colour is
// asserted it is one the scene says outright (unlit), or one the native
// renderer drew (`references3d`).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./open.js";
import { pixels } from "./pixels.js";

// A headless Chromium has a real adapter with these (RADV here); without them
// `navigator.gpu` has none and the WebGPU half could not be told from WebGL2.
test.use({
  launchOptions: { args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=vulkan", "--ignore-gpu-blocklist", "--js-flags=--expose-gc"] },
  viewport: { width: 400, height: 300 },
  deviceScaleFactor: 1,
});

const HIDDEN = `
  delete Navigator.prototype.gpu;
  if (self.WorkerNavigator) delete WorkerNavigator.prototype.gpu;
`;
// Every way work reaches the GPU on either backend.
const COUNTED = `
  window.gpuCalls = 0;
  const counted = (proto, names) => {
    if (!proto) return;
    for (const name of names) {
      const called = proto[name];
      if (typeof called !== "function") continue;
      proto[name] = function (...args) { window.gpuCalls++; return called.apply(this, args); };
    }
  };
  counted(self.GPUQueue && GPUQueue.prototype, ["submit", "writeBuffer", "writeTexture"]);
  counted(self.GPUCanvasContext && GPUCanvasContext.prototype, ["getCurrentTexture"]);
  counted(self.WebGL2RenderingContext && WebGL2RenderingContext.prototype,
    ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced",
     "clear", "clearBufferfv", "clearBufferfi", "clearBufferiv", "clearBufferuiv",
     "blitFramebuffer", "bufferData", "bufferSubData", "texImage2D", "texSubImage2D"]);
`;
// What of the GPU's memory the page still holds: what was made, and is not
// let go nor out of reach. wgpu lets a WebGPU object go by dropping it, for the
// collector to find, so only collecting says which are gone.
const LIVE = `
  const made = [];
  const gone = new WeakSet();
  const live = (proto, up, down, target) => {
    if (!proto) return;
    for (const name of up) {
      const called = proto[name];
      proto[name] = function (...args) { const object = called.apply(this, args); made.push(new WeakRef(object)); return object; };
    }
    for (const name of down) {
      const called = proto[name];
      proto[name] = function (...args) { gone.add(target(this, args)); return called.apply(this, args); };
    }
  };
  live(self.GPUDevice && GPUDevice.prototype, ["createBuffer", "createTexture"], []);
  live(self.GPUBuffer && GPUBuffer.prototype, [], ["destroy"], (object) => object);
  live(self.GPUTexture && GPUTexture.prototype, [], ["destroy"], (object) => object);
  live(self.WebGL2RenderingContext && WebGL2RenderingContext.prototype, ["createBuffer", "createTexture"], ["deleteBuffer", "deleteTexture"], (_, [object]) => object);
  window.gpuLive = async () => {
    // A WeakRef read in a task holds its target until the task ends.
    await new Promise((done) => setTimeout(done));
    gc();
    await new Promise((done) => setTimeout(done));
    return made.filter((each) => { const object = each.deref(); return object && !gone.has(object); }).length;
  };
`;
const CENTRE = [200, 150];
const CLEAR = [0x20, 0x20, 0x20];

for (const backend of ["webgpu", "webgl2"]) {
  test.describe(backend, () => {
    async function show(page, scene) {
      if (backend === "webgl2") await page.addInitScript(HIDDEN);
      await page.addInitScript(COUNTED);
      await page.addInitScript(LIVE);
      await page.goto(`/?scene=${scene}&view3d=wgpu`);
      await page.waitForFunction(() => window.ready);
      await page.waitForFunction(() => {
        const state = document.querySelector(".qq-view3d").$view3d;
        if (state.error) throw new Error(state.error);
        return state.frames > 0;
      });
      expect(await page.evaluate(() => document.querySelector(".qq-view3d").$view3d.backend)).toBe(backend);
      await still(page);
    }
    // Until the frame asked for by what was just set has come. A frame is
    // asked for in a task, and drawn in the next animation frame.
    const still = (page) =>
      page.evaluate(async () => {
        window.flush();
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      });
    const set = async (page, work, argument) => {
      await page.evaluate(work, argument);
      await still(page);
    };
    const loaderSays = (page) =>
      page.evaluate(() => {
        const { status, errorString } = window.objects.loader;
        const { succeeded, failed } = window.objects;
        return { status, errorString, succeeded, failed };
      });
    const at = async (page, x, y) => (await pixels(page, [[x, y]]))[0].split(" ").map(Number);
    const near = (got, want, within = 3) => got.forEach((value, index) => expect(Math.abs(value - want[index]), `${got} for ${want}`).toBeLessThanOrEqual(within));

    test("what a scene says is what is drawn, by name or by number, x or position", async ({ page }) => {
      await show(page, "wgpu_mapped");
      near(await at(page, ...CENTRE), [255, 0, 0]);
      near(await at(page, 10, 10), CLEAR);
      // Moved by x, then by position.
      await set(page, () => (window.objects.cube.x = -120));
      near(await at(page, ...CENTRE), CLEAR);
      near(await at(page, 80, 150), [255, 0, 0]);
      await set(page, () => (window.objects.cube.position = { x: 0, y: 80, z: 0 }));
      near(await at(page, 200, 70), [255, 0, 0]);
      near(await at(page, 80, 150), CLEAR);
    });

    test("a face turned away is culled, and not with no culling, as the number says", async ({ page }) => {
      await show(page, "wgpu_mapped");
      near(await at(page, 320, 150), CLEAR);
      await set(page, () => (window.objects.back.materials[0].cullMode = 3));
      near(await at(page, 320, 150), [0, 255, 0]);
      await set(page, () => (window.objects.back.materials[0].cullMode = 2));
      near(await at(page, 320, 150), [0, 255, 0]);
      await set(page, () => (window.objects.back.materials[0].cullMode = 1));
      near(await at(page, 320, 150), CLEAR);
    });

    test("a scene that did not change makes no GPU call, and writing what it was makes none", async ({ page }) => {
      await show(page, "wgpu_mapped");
      await page.waitForTimeout(200);
      const calls = () => page.evaluate(() => window.gpuCalls);
      const before = await calls();
      expect(before).toBeGreaterThan(0);
      await page.waitForTimeout(500);
      expect(await calls()).toBe(before);
      await set(page, () => (window.objects.cube.x = 0));
      await page.waitForTimeout(100);
      expect(await calls()).toBe(before);
      const frames = () => page.evaluate(() => document.querySelector(".qq-view3d").$view3d.frames);
      const drawn = await frames();
      await set(page, () => (window.objects.cube.x = 5));
      expect(await calls()).toBeGreaterThan(before);
      expect(await frames()).toBe(drawn + 1);
    });

    test("only what the mapping read builds the scene again", async ({ page }) => {
      await show(page, "wgpu_mapped");
      const builds = () => page.evaluate(() => document.querySelector(".qq-view3d").$view3d.builds);
      const before = await builds();
      await set(page, () => (window.objects.cube.objectName = "another"));
      expect(await builds()).toBe(before);
      await set(page, () => (window.objects.unlit.baseColor = "#00ff00"));
      expect(await builds()).toBe(before + 1);
      near(await at(page, ...CENTRE), [0, 255, 0]);
    });

    test("the view maps the scene, and a node maps through its parents", async ({ page }) => {
      await show(page, "wgpu_mapping");
      const got = await page.evaluate(() => {
        const { view, inner } = window.objects;
        const mapped = view.mapFrom3DScene({ x: 0, y: 0, z: 0 });
        const up = view.mapFrom3DScene({ x: 0, y: 100, z: 0 });
        const back = view.mapTo3DScene({ x: 200, y: 50, z: 0 });
        const s = inner.scenePosition;
        return { mapped: [mapped.x, mapped.y], up: [up.x, up.y], back: [back.x, back.y], inner: [s.x, s.y, s.z] };
      });
      expect(got.mapped).toEqual([200, 150]);
      expect(got.up).toEqual([200, 50]);
      expect(got.back).toEqual([0, 100]);
      expect(got.inner).toEqual([120, 50, 0]);
    });

    test("a camera moved and magnified shows the model elsewhere and bigger", async ({ page }) => {
      await show(page, "wgpu_cameras");
      near(await at(page, ...CENTRE), [255, 255, 255]);
      near(await at(page, 200 + 80, 150), CLEAR);
      await set(page, () => {
        window.objects.camera.horizontalMagnification = 2;
        window.objects.camera.verticalMagnification = 2;
      });
      near(await at(page, 200 + 80, 150), [255, 255, 255]);
      await set(page, () => (window.objects.camera.x = 200));
      near(await at(page, ...CENTRE), CLEAR);
    });

    test("a red light makes a white surface red, another makes it yellow, none leaves it black", async ({ page }) => {
      await show(page, "wgpu_lights");
      const red = await at(page, ...CENTRE);
      expect(red[0]).toBeGreaterThan(100);
      expect(red[1]).toBeLessThan(8);
      await set(page, () => (window.objects.second.brightness = 1));
      const yellow = await at(page, ...CENTRE);
      near([yellow[0]], [yellow[1]]);
      await set(page, () => {
        window.objects.light.brightness = 0;
        window.objects.second.brightness = 0;
      });
      near(await at(page, ...CENTRE), [0, 0, 0]);
    });

    test("a material blends, masks by its cutoff, and emits with no light on it", async ({ page }) => {
      await show(page, "wgpu_materials");
      const blended = await at(page, 80, 150);
      expect(blended[0]).toBeGreaterThan(CLEAR[0] + 40);
      expect(blended[0]).toBeLessThan(250);
      near(await at(page, ...CENTRE), CLEAR);
      await set(page, () => (window.objects.masked.alphaCutoff = 0.2));
      near(await at(page, ...CENTRE), [0, 255, 0]);
      near(await at(page, 320, 150), [0, 0, 255]);
    });

    test("a model is drawn where its parent puts it, and moves with another", async ({ page }) => {
      await show(page, "wgpu_parents");
      near(await at(page, 100, 150), [255, 0, 255]);
      await set(page, () => (window.objects.holder.x = -50));
      near(await at(page, 150, 150), [255, 0, 255]);
      near(await at(page, 100, 150), CLEAR);
      await set(page, () => (window.objects.cube.parent = window.objects.other));
      near(await at(page, 300, 150), [255, 0, 255]);
      near(await at(page, 150, 150), CLEAR);
    });

    test("the pick is what is under the place, nearest first, and moves with it", async ({ page }) => {
      await show(page, "wgpu_picking");
      near(await at(page, ...CENTRE), [255, 0, 0]);
      const picked = (x, y) => page.evaluate(([x, y]) => window.objects.view.pick(x, y).objectHit?.objectName ?? null, [x, y]);
      expect(await picked(200, 150)).toBe("nearer");
      expect(await picked(270, 150)).toBe("farther");
      expect(await picked(20, 20)).toBe(null);
      await set(page, () => (window.objects.near.x = 120));
      expect(await picked(320, 150)).toBe("nearer");
      expect(await picked(200, 150)).toBe("farther");
    });

    test("a loader shows what its file holds, follows its place, and a good file after a bad one", async ({ page }) => {
      await show(page, "wgpu_loader");
      await page.waitForFunction(() => document.querySelector(".qq-view3d").$view3d.frames > 0);
      await expect.poll(() => at(page, ...CENTRE)).toEqual([255, 0, 0]);
      near(await at(page, 10, 10), CLEAR);
      await set(page, () => (window.objects.loader.x = 120));
      near(await at(page, 320, 150), [255, 0, 0]);
      near(await at(page, ...CENTRE), CLEAR);
      await expect.poll(() => loaderSays(page)).toEqual({ status: 1, succeeded: true, failed: false, errorString: "" });
      await set(page, () => (window.objects.loader.visible = false));
      near(await at(page, 320, 150), CLEAR);
      await set(page, () => {
        window.objects.loader.visible = true;
        window.objects.loader.source = "scenes/wgpu_models/checker.gltf";
      });
      // Red top left, green top right, blue bottom left, white bottom right.
      await expect.poll(() => at(page, 320 - 25, 150 - 25)).toEqual([255, 0, 0]);
      near(await at(page, 320 + 25, 150 - 25), [0, 255, 0]);
      near(await at(page, 320 - 25, 150 + 25), [0, 0, 255]);
      near(await at(page, 320 + 25, 150 + 25), [255, 255, 255]);
    });

    test.describe("a file that cannot be read", () => {
      test.use({ told: [/gone\.gltf|404/] });
      test("says why on the loader, and is read again when the loader names it again", async ({ page }) => {
        let refusals = 1;
        await page.route(/gone\.gltf/, (route) => (refusals-- > 0 ? route.fulfill({ status: 404 }) : route.fulfill({ path: join(import.meta.dirname, "scenes/wgpu_models/square.gltf") })));
        await show(page, "wgpu_loader");
        await set(page, () => (window.objects.loader.source = "scenes/wgpu_models/gone.gltf"));
        await expect.poll(() => loaderSays(page)).toMatchObject({ status: 2, failed: true, errorString: expect.stringMatching(/404/) });
        // Another build asks nothing: a loader reads when its source changes.
        await set(page, () => (window.objects.loader.x = 1));
        near(await at(page, ...CENTRE), CLEAR);
        await set(page, () => (window.objects.loader.source = "scenes/wgpu_models/square.gltf"));
        await expect.poll(() => loaderSays(page)).toMatchObject({ status: 1, errorString: "" });
        await set(page, () => (window.objects.loader.source = "scenes/wgpu_models/gone.gltf"));
        await expect.poll(() => loaderSays(page)).toMatchObject({ status: 1, errorString: "" });
        expect(refusals).toBe(-1);
      });
    });

    test.describe("a shader that does not translate", () => {
      test.use({ told: [/View3D: CustomMaterial: /] });
      test("is said once, with why, however many builds read it", async ({ page }) => {
        const said = [];
        page.on("console", (message) => /CustomMaterial/.test(message.text()) && said.push(message.text()));
        await show(page, "wgpu_badshader");
        await set(page, () => (window.objects.other.x = 10));
        await set(page, () => (window.objects.other.x = 20));
        expect(said.length, said.join("\n")).toBe(1);
        expect(said[0]).toMatch(/fragment shader/);
      });
    });

    test.describe("a chunk that did not arrive", () => {
      test.use({ told: [/View3D: |net::ERR_FAILED/] });
      test("is asked for again by the next view, which draws", async ({ page }) => {
        let refusals = 1;
        await page.route(/ljos_web_3d_bg/, (route) => (refusals-- > 0 ? route.abort() : route.fallback()));
        if (backend === "webgl2") await page.addInitScript(HIDDEN);
        await page.goto("/?scene=wgpu_two&view3d=wgpu");
        await page.waitForFunction(() => window.ready);
        const states = () => page.evaluate(() => [...document.querySelectorAll(".qq-view3d")].map(({ $view3d: { error, frames } }) => ({ error, drew: frames > 0 })));
        await expect.poll(async () => (await states()).filter(({ drew }) => drew).length).toBe(1);
        const failed = (await states()).filter(({ error }) => error);
        expect(failed.length).toBe(1);
        expect(failed[0].error).not.toMatch(/undefined|not a function|Cannot read/);
      });
    });

    test.describe("while a dropped shell is shown", () => {
      test.use({ told: [/not fetched while a dropped shell/] });
      test("a loader's file from another host is not fetched", async ({ page }) => {
        let asked = 0;
        await page.route(/evil\.example/, (route) => (asked++, route.abort()));
        await show(page, "wgpu_loader");
        await page.evaluate(async () => {
          // The page's own instance of the guard, by the address it was loaded from.
          const address = performance.getEntriesByType("resource").find(({ name }) => /\/guard\.js/.test(name)).name;
          (await import(address)).zoneShows({});
          window.objects.loader.source = "https://evil.example/model.gltf";
        });
        await still(page);
        await still(page);
        expect(asked).toBe(0);
        // The guard's own reason, not "the file is broken".
        await expect.poll(() => loaderSays(page)).toMatchObject({ status: 2, errorString: expect.stringMatching(/not fetched while a dropped shell/) });
      });
    });

    test("two entries draw two copies and not the model, and an entry moves its copy", async ({ page }) => {
      await show(page, "wgpu_instancing");
      near(await at(page, 150, 150), [255, 255, 0]);
      near(await at(page, 250, 150), [255, 255, 0]);
      near(await at(page, ...CENTRE), CLEAR);
      await set(page, () => (window.objects.first.position = { x: -100, y: 0, z: 0 }));
      near(await at(page, 100, 150), [255, 255, 0]);
      near(await at(page, 150, 150), CLEAR);
      await set(page, () => (window.objects.model.instancing = null));
      near(await at(page, ...CENTRE), [255, 255, 0]);
    });

    test("a geometry the application commits is drawn, and again when it commits another", async ({ page }) => {
      await show(page, "wgpu_geometry");
      // As a type of an application's would, which QML itself cannot.
      const square = (half) =>
        set(page, (half) => {
          const { shape } = window.objects;
          shape.clear();
          shape.setVertexData(new Float32Array([-half, -half, 0, half, -half, 0, half, half, 0, -half, -half, 0, half, half, 0, -half, half, 0]).buffer);
          shape.setStride(12);
          shape.addAttribute(1, 0, 3);
          shape.setBounds({ x: -half, y: -half, z: 0 }, { x: half, y: half, z: 0 });
          shape.update();
        }, half);
      await square(50);
      near(await at(page, ...CENTRE), [0, 255, 255]);
      near(await at(page, 200 + 40, 150), [0, 255, 255]);
      near(await at(page, 200 + 80, 150), CLEAR);
      await square(100);
      near(await at(page, 200 + 80, 150), [0, 255, 255]);
    });

    test.describe("what is committed over and over", () => {
      // A table of two thousand entries reads each of them: that is its size.
      test.use({ told: [/HUGE_FAN_IN/] });
      test("is let go: the page's memory and the GPU's stay level", async ({ page }) => {
        test.setTimeout(120000);
        await show(page, "wgpu_revisions");
        const commit = (times) =>
          page.evaluate(async (times) => {
            const { shape, picture, table } = window.objects;
            const entries = Array.from(table.instances);
            // A quarter of a megabyte each of shape and picture, each time.
            const corners = new Float32Array(21843 * 3);
            corners.set([-50, -50, 0, 50, -50, 0, 50, 50, 0]);
            shape.setStride(12);
            shape.addAttribute(1, 0, 3);
            shape.setBounds({ x: -50, y: -50, z: 0 }, { x: 50, y: 50, z: 0 });
            picture.setSize({ width: 256, height: 256 });
            picture.setFormat(1);
            for (let time = 0; time < times; time++) {
              const shade = (window.shade = ((window.shade ?? 0) + 1) % 255);
              shape.setVertexData(corners.slice().buffer);
              shape.update();
              picture.setTextureData(new Uint8Array(256 * 256 * 4).fill(shade).map((value, at) => (at % 4 === 3 ? 255 : value)).buffer);
              entries[0].position = { x: time % 100, y: 0, z: 0 };
              window.flush();
              await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
            }
            return { memory: document.querySelector(".qq-view3d").$view3d.memory(), live: await window.gpuLive(), builds: document.querySelector(".qq-view3d").$view3d.builds };
          }, times);
        const settled = await commit(30);
        const later = await commit(100);
        // Kept, a hundred revisions of these are over 75 MB.
        const MB = 1024 * 1024;
        console.log(`${backend}: wasm ${settled.memory / MB} -> ${later.memory / MB} MB, GPU objects ${settled.live} -> ${later.live}, builds ${settled.builds} -> ${later.builds}`);
        expect(later.builds - settled.builds).toBeGreaterThanOrEqual(100);
        expect((later.memory - settled.memory) / MB).toBeLessThan(16);
        expect(later.live - settled.live).toBeLessThan(10);
      });
    });

    test("a live texture whose item has no size yet is no picture, and the scene goes on", async ({ page }) => {
      await show(page, "wgpu_livezero");
      near(await at(page, 300, 150), [255, 0, 0]);
      const builds = () => page.evaluate(() => document.querySelector(".qq-view3d").$view3d.builds);
      const before = await builds();
      await set(page, () => {
        window.scene.effectSize = 100;
        window.objects.cube.x = 60;
      });
      expect(await builds()).toBeGreaterThan(before);
      near(await at(page, 260, 150), [255, 0, 0]);
      near(await at(page, 300, 150), CLEAR);
    });

    test("one sprite system in two views is toned by each view's own surroundings", async ({ page }) => {
      await show(page, "wgpu_twotoned");
      await page.waitForFunction(() => [...document.querySelectorAll(".qq-view3d")].every((c) => c.$view3d.frames > 0));
      await still(page);
      const [left, right] = [await at(page, 100, 150), await at(page, 300, 150)];
      // #404040 with no tone mapping, and with the linear one (toScreen).
      expect(left[0], `left ${left}, right ${right}`).toBeGreaterThanOrEqual(50);
      expect(left[0], `left ${left}, right ${right}`).toBeLessThanOrEqual(85);
      expect(right[0], `left ${left}, right ${right}`).toBeGreaterThan(left[0] + 40);
    });

    test.describe("texture data that is not drawn", () => {
      test.use({ told: [/View3D: Texture: |HUGE_FAN_IN/] });
      test("says why, once, however often it is committed again", async ({ page }) => {
        const said = [];
        page.on("console", (message) => /View3D: Texture: /.test(message.text()) && said.push(message.text()));
        await show(page, "wgpu_revisions");
        const commit = (shade) =>
          set(page, (shade) => {
            const { picture } = window.objects;
            picture.setSize({ width: 2, height: 2 });
            picture.setFormat(1);
            picture.setDepth(2);
            picture.setTextureData(new Uint8Array(2 * 2 * 4).fill(shade).buffer);
          }, shade);
        await commit(7);
        await commit(9);
        expect(said, said.join("\n")).toEqual(["View3D: Texture: a texture with depth is not drawn here"]);
      });
    });

    test("two views each draw their own scene, and one taken away is let go", async ({ page }) => {
      await show(page, "wgpu_two");
      near(await at(page, 100, 150), [255, 0, 0]);
      near(await at(page, 300, 150), [0, 0, 255]);
      await set(page, () => (window.objects.second.active = false));
      expect(await page.locator(".qq-view3d").count()).toBe(1);
      await set(page, () => (window.objects.first.x = 40));
      near(await at(page, 140, 150), [255, 0, 0]);
    });

    test("the view's size is the canvas's in device pixels, and changing it draws again", async ({ page }) => {
      await show(page, "wgpu_mapped");
      const size = () => page.evaluate(() => { const c = document.querySelector(".qq-view3d"); return [c.width, c.height]; });
      expect(await size()).toEqual([400, 300]);
      await set(page, () => {
        window.scene.width = 200;
        window.scene.height = 100;
      });
      expect(await size()).toEqual([200, 100]);
      near(await at(page, 100, 50), [255, 0, 0]);
    });

    test("the picture is the native renderer's within 3 a channel on all but 0.5 % of pixels", async ({ page }) => {
      await show(page, "wgpu_reference");
      const shot = (await page.screenshot({ clip: { x: 0, y: 0, width: 400, height: 300 } })).toString("base64");
      const reference = readFileSync(join(import.meta.dirname, "references3d/lit.png")).toString("base64");
      const { over, total, largest } = await page.evaluate(
        async ([shot, reference]) => {
          const read = async (base64) => {
            const picture = document.createElement("img");
            picture.src = `data:image/png;base64,${base64}`;
            await picture.decode();
            const context = new OffscreenCanvas(picture.naturalWidth, picture.naturalHeight).getContext("2d");
            context.drawImage(picture, 0, 0);
            return context.getImageData(0, 0, picture.naturalWidth, picture.naturalHeight).data;
          };
          const [got, want] = [await read(shot), await read(reference)];
          let over = 0;
          let largest = 0;
          for (let i = 0; i < want.length; i += 4) {
            const most = Math.max(Math.abs(got[i] - want[i]), Math.abs(got[i + 1] - want[i + 1]), Math.abs(got[i + 2] - want[i + 2]));
            largest = Math.max(largest, most);
            if (most > 3) over++;
          }
          return { over, total: want.length / 4, largest };
        },
        [shot, reference],
      );
      if (process.env.LJOS_SHOTS) (await import("node:fs")).writeFileSync(join(process.env.LJOS_SHOTS, `web-${backend}.png`), Buffer.from(shot, "base64"));
      expect(over / total, `${over} of ${total} pixels over 3, the largest ${largest}`).toBeLessThanOrEqual(0.005);
    });
  });
}

test("a page with no View3D fetches none of the renderer", async ({ page }) => {
  const fetched = [];
  page.on("request", (request) => fetched.push(request.url()));
  await page.goto("/?scene=rectangle");
  await page.waitForFunction(() => window.ready);
  expect(fetched.filter((url) => /ljos_web_3d|QtQuick3D/.test(url))).toEqual([]);
});

test("a page with a View3D on the JavaScript renderer fetches none of the wgpu one", async ({ page }) => {
  const fetched = [];
  page.on("request", (request) => fetched.push(request.url()));
  await page.goto("/?scene=shaded3d");
  await page.waitForFunction(() => window.ready);
  await page.waitForTimeout(100);
  expect(fetched.filter((url) => /ljos_web_3d/.test(url))).toEqual([]);
});

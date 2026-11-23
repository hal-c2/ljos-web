// View3D drawn by the one wgpu renderer (`crates/ljos_web_3d`), on WebGPU and
// with WebGPU hidden from the page, where wgpu falls back to WebGL2. What is
// asserted is what features/quick3d of the toolkit asserts; where a colour is
// asserted it is one the scene says outright (unlit), or one the native
// renderer drew (`references3d`).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
// A device the page can lose, as a browser does when its GPU process or
// driver gives up. Chrome then fails a buffer mapped at its making with a
// RangeError, which is what reached the wasm when that happened.
const LOSABLE = `
  window.gpuDevices = [];
  const ask = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = async function (...args) {
    const device = await ask.apply(this, args);
    const made = { device, lost: false };
    window.gpuDevices.push(made);
    device.lost.then(() => (made.lost = true));
    return device;
  };
  const create = GPUDevice.prototype.createBuffer;
  GPUDevice.prototype.createBuffer = function (descriptor) {
    if (descriptor?.mappedAtCreation && window.gpuDevices.find(({ device }) => device === this)?.lost)
      throw new RangeError("createBuffer failed, size (" + descriptor.size + ") is too large for the implementation when mappedAtCreation == true");
    return create.call(this, descriptor);
  };
  window.loseGpu = async () => {
    const live = window.gpuDevices.filter(({ lost }) => !lost);
    for (const { device } of live) device.destroy();
    await Promise.all(live.map(({ device }) => device.lost));
    await new Promise((done) => setTimeout(done));
  };
`;
// Loses the page's GPU (`LOSABLE`), and waits until each view drew again,
// said why it stopped, or draws on the JavaScript renderer instead.
const LOST_AND_SETTLED = async () => {
  const views = () => [...document.querySelectorAll(".qq-view3d")];
  const before = new Map(views().map((canvas) => [canvas, canvas.$view3d.frames]));
  await window.loseGpu();
  await new Promise((done) => {
    const look = () => {
      const now = views();
      const settled = now.length === before.size && now.every(({ $view3d: state }, index) => state.error || state.frames > (before.get(now[index]) ?? 0));
      if (settled) done();
      else requestAnimationFrame(look);
    };
    look();
  });
};
// What each view draws with, how many times it was made again for a GPU
// lost, and why it stopped, if it did.
const RENDERERS = () => [...document.querySelectorAll(".qq-view3d")].map(({ $view3d: { renderer, lost, error } }) => ({ renderer, lost: lost ?? 0, error: error && error.split(":")[0] }));
const CENTRE = [200, 150];
const CLEAR = [0x20, 0x20, 0x20];
// The most a model whose y changed may ask of the page in the build that
// follows: what is read of one model, never what is read of sixty.
const MODEL_READS = 40;

// The renderer's wasm itself, and not the module that says its address,
// which a dev server serves under the same name.
const WASM = /ljos_web_3d_bg[^/?]*\.wasm$/;

// When the first view is put in its item, taken as it is: not as an
// observer of the page is told, a microtask later, by when an ask made in
// the same task would already have started.
const MARK_FIRST_VIEW = () => {
  window.viewMade = null;
  const mark = (nodes) => {
    if (window.viewMade !== null) return;
    if (nodes.some((node) => node instanceof Element && node.classList.contains("qq-view3d"))) window.viewMade = performance.now();
  };
  for (const [kind, name] of [[Element, "append"], [Element, "prepend"], [Node, "appendChild"], [Node, "insertBefore"]]) {
    const put = kind.prototype[name];
    kind.prototype[name] = function (...nodes) {
      mark(nodes);
      return put.apply(this, nodes);
    };
  }
};
// That moment, and when the first of what `asked` matches was asked for,
// once it has arrived: a resource is timed only then.
async function madeAndAsked(page, asked) {
  const at = await page.waitForFunction((source) => performance.getEntriesByType("resource").find(({ name }) => new RegExp(source).test(name))?.startTime, asked.source);
  return { made: await page.evaluate(() => window.viewMade), asked: await at.jsonValue() };
}

for (const backend of ["webgpu", "webgl2"]) {
  test.describe(backend, () => {
    // A scene that never rests (`endless`: each picture asks for the next)
    // always has one due, so it is shown once it drew, not once it rests.
    async function show(page, scene, { endless = false } = {}) {
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
      await still(page, { endless });
    }
    // Until what was just set is drawn, and what draws from it in turn: two
    // animation frames for what is asked for in them, then until no view has
    // a picture still to draw. A loaded machine's GPU or the pacing's rest
    // may hold a picture past any number of frames; what is waited on is
    // that it was drawn.
    const still = async (page, { endless = false } = {}) => {
      await page.evaluate(async () => {
        window.flush();
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      });
      if (!endless) await page.waitForFunction(() => [...document.querySelectorAll(".qq-view3d")].every(({ $view3d }) => !$view3d?.due), null, { timeout: 0, polling: "raf" });
    };
    const set = async (page, work, argument) => {
      await page.evaluate(work, argument);
      await still(page);
    };
    // `count` of the page's animation frames, by `window.ownFrame` where a
    // test counts the frames the page asks for and keeps its own apart.
    // What a still scene does not do is watched over frames, not a time:
    // a loaded machine runs fewer of them in any time.
    const pageFrames = (page, count) =>
      page.evaluate(
        (count) =>
          new Promise((done) => {
            const ask = window.ownFrame ?? requestAnimationFrame;
            let left = count;
            const next = () => (--left <= 0 ? done() : ask(next));
            ask(next);
          }),
        count,
      );
    // The animation frames the page asked for (counted as `frameAsks`) while
    // the view drew its next `count` pictures, looked at in the page's
    // frames by `window.ownFrame`, which are not counted.
    const drawnOver = (page, count) =>
      page.evaluate(
        (count) =>
          new Promise((done) => {
            const state = document.querySelector(".qq-view3d").$view3d;
            const from = { asks: window.frameAsks, frames: state.frames };
            const look = () => (state.frames - from.frames >= count ? done({ asks: window.frameAsks - from.asks, frames: state.frames - from.frames }) : window.ownFrame(look));
            window.ownFrame(look);
          }),
        count,
      );
    // What the page asked for and the view drew over `count` of the page's
    // frames, by `window.ownFrame`.
    const asksOver = (page, count) =>
      page.evaluate(
        (count) =>
          new Promise((done) => {
            const state = document.querySelector(".qq-view3d").$view3d;
            const from = { asks: window.frameAsks, frames: state.frames };
            let left = count;
            const next = () => (--left <= 0 ? done({ asks: window.frameAsks - from.asks, frames: state.frames - from.frames }) : window.ownFrame(next));
            window.ownFrame(next);
          }),
        count,
      );
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
      await still(page);
      const calls = () => page.evaluate(() => window.gpuCalls);
      const before = await calls();
      expect(before).toBeGreaterThan(0);
      await pageFrames(page, 30);
      expect(await calls(), "30 of the page's frames on").toBe(before);
      await set(page, () => (window.objects.cube.x = 0));
      await pageFrames(page, 6);
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

    // What one build asked of the page, and how many objects the view holds.
    const counts = (page) =>
      page.evaluate(() => {
        const { builds, frames, reads, objects } = document.querySelector(".qq-view3d").$view3d;
        return { builds, frames, reads, objects: objects() };
      });

    test("a change to one of many models asks the page of that model alone, and is drawn", async ({ page }) => {
      await show(page, "wgpu_many");
      near(await at(page, 20, 50), [255, 0, 0]);
      const before = await counts(page);
      await pageFrames(page, 20);
      expect(await counts(page), "a still scene builds nothing and draws nothing, 20 of the page's frames on").toEqual(before);
      await set(page, () => (window.objects.squares.objectAt(0).y = 80));
      const after = await counts(page);
      expect(after.builds).toBe(before.builds + 1);
      expect(after.frames).toBe(before.frames + 1);
      // The model's y, and nothing of the other fifty-nine or their materials.
      expect(after.reads).toBeGreaterThan(0);
      expect(after.reads).toBeLessThanOrEqual(MODEL_READS);
      near(await at(page, 20, 50), CLEAR);
      near(await at(page, 20, 70), [255, 0, 0]);
      near(await at(page, 60, 50), [255, 0, 0]);
    });

    test("a model moved among many is asked again what moved alone", async ({ page }) => {
      await show(page, "wgpu_many");
      await set(page, () => (window.objects.squares.objectAt(0).y = 80));
      // Its y: not its x, scale, materials or anything else it was asked.
      expect((await counts(page)).reads).toBe(1);
      near(await at(page, 20, 70), [255, 0, 0]);
      await set(page, () => (window.objects.squares.objectAt(0).y = 120));
      expect((await counts(page)).reads).toBe(1);
      near(await at(page, 20, 70), CLEAR);
    });

    test("a change to one of many models reads that model's part of the scene alone", async ({ page }) => {
      await show(page, "wgpu_many");
      const pieces = () => page.evaluate(() => document.querySelector(".qq-view3d").$view3d.pieces);
      await set(page, () => (window.objects.squares.objectAt(0).y = 80));
      // Its own node: not the fifty-nine others, the view or its environment.
      expect(await pieces()).toBe(1);
      near(await at(page, 20, 70), [255, 0, 0]);
      await set(page, () => (window.objects.shown = 30));
      // A Repeater3D given another number makes all of them anew, as Qt's
      // does: the list of models the view holds and the thirty new ones,
      // and nothing of the sixty gone.
      expect(await pieces()).toBe(31);
      near(await at(page, 380, 250), CLEAR);
      await set(page, () => (window.objects.shown = 60));
      // That list again, and the sixty new ones.
      expect(await pieces()).toBe(61);
      near(await at(page, 380, 250), [255, 0, 0]);
    });

    test("models taken away leave the picture and the view, and come back", async ({ page }) => {
      await show(page, "wgpu_many");
      near(await at(page, 380, 250), [255, 0, 0]);
      const all = (await counts(page)).objects;
      await set(page, () => (window.objects.shown = 30));
      near(await at(page, 380, 250), CLEAR);
      near(await at(page, 380, 130), [255, 0, 0]);
      // Thirty models; the material they share stays.
      expect((await counts(page)).objects).toBe(all - 30);
      await set(page, () => (window.objects.shown = 60));
      near(await at(page, 380, 250), [255, 0, 0]);
      expect((await counts(page)).objects).toBe(all);
    });

    // An object the view has not met is told apart from another such and
    // from nothing when the page follows what the wasm asked: each one put
    // in place is drawn, the second as the first.
    test("a material, then another, the view had not met is each drawn", async ({ page }) => {
      await show(page, "wgpu_swapped");
      near(await at(page, ...CENTRE), [255, 0, 0]);
      await set(page, () => (window.objects.cube.materials = [window.objects.blue]));
      near(await at(page, ...CENTRE), [0, 0, 255]);
      await set(page, () => (window.objects.cube.materials = [window.objects.green]));
      near(await at(page, ...CENTRE), [0, 255, 0]);
    });

    test("an environment, then another, the view had not met is each drawn", async ({ page }) => {
      await show(page, "wgpu_swapped");
      near(await at(page, 10, 10), CLEAR);
      await set(page, () => (window.objects.view.environment = window.objects.teal));
      near(await at(page, 10, 10), [0, 0x80, 0x80]);
      await set(page, () => (window.objects.view.environment = window.objects.purple));
      near(await at(page, 10, 10), [0x80, 0, 0x80]);
    });

    test("a joint the view had not met, put in a skin's empty slot, builds the scene again", async ({ page }) => {
      await show(page, "wgpu_swapped");
      // The scene asks for no file, so no build but this one's can come.
      expect(await page.evaluate(() => performance.getEntriesByType("resource").some(({ name }) => /\.mesh(\?|$)/.test(name)))).toBe(false);
      const builds = () => page.evaluate(() => document.querySelector(".qq-view3d").$view3d.builds);
      const before = await builds();
      await set(page, () => (window.objects.skin.joints = [window.objects.skin.joints[0], window.objects.joint]));
      expect(await builds()).toBe(before + 1);
    });

    test("a model given another parent among many is drawn where that one puts it", async ({ page }) => {
      await show(page, "wgpu_many");
      const all = (await counts(page)).objects;
      await set(page, () => (window.objects.squares.objectAt(0).parent = window.objects.holder));
      near(await at(page, 20, 50), CLEAR);
      near(await at(page, 20, 65), [255, 0, 0]);
      await set(page, () => (window.objects.holder.x = 40));
      near(await at(page, 20, 65), CLEAR);
      near(await at(page, 60, 65), [255, 0, 0]);
      expect((await counts(page)).objects).toBe(all);
    });

    // What an animation frame changes is drawn in that frame, as the
    // animations' clock settles what it moved before the frame ends: not in
    // the frame after.
    test("a change made in an animation frame is drawn in it", async ({ page }) => {
      await show(page, "wgpu_moving");
      const drawnBy = await page.evaluate(
        () =>
          new Promise((done) => {
            const state = document.querySelector(".qq-view3d").$view3d;
            requestAnimationFrame(() => {
              const before = state.frames;
              // Asked for before the change: the first callback of the next frame.
              requestAnimationFrame(() => done(state.frames - before));
              window.objects.square.x = 100;
              window.flush();
            });
          }),
      );
      expect(drawnBy, "frames drawn before the next animation frame began").toBe(1);
      near(await at(page, ...CENTRE), CLEAR);
      near(await at(page, 300, 150), [255, 0, 0]);
    });

    test("a moving scene asks for one animation frame for each it draws, and none once it stops", async ({ page }) => {
      await page.addInitScript(() => {
        window.frameAsks = 0;
        const asked = window.requestAnimationFrame;
        window.ownFrame = asked.bind(window);
        window.requestAnimationFrame = (callback) => (window.frameAsks++, asked.call(window, callback));
      });
      await show(page, "wgpu_moving");
      await page.evaluate(() => {
        window.objects.moving = true;
        window.flush();
      });
      const moving = await drawnOver(page, 40);
      expect(moving.asks / moving.frames, `${moving.asks} animation frames asked for ${moving.frames} drawn`).toBeLessThanOrEqual(1.1);
      await page.evaluate(() => {
        window.objects.moving = false;
        window.flush();
      });
      await still(page);
      expect(await asksOver(page, 20), "20 of the page's frames on").toEqual({ asks: 0, frames: 0 });
    });

    // A picture on WebGL 2 is done when its fence says so (QtQuick3D/wgpu.js).
    // Here fences made while `holding` say they are not done until
    // `release()`, and done from then, whatever the GPU underneath says: the
    // GPU's work, finished where a test says. Every animation frame the page
    // asks for is counted, but for the test's own.
    const HELD = `
      window.frameAsks = 0;
      const asked = window.requestAnimationFrame;
      window.ownFrame = asked.bind(window);
      // While \`ownFor\` is set, the page's own work comes after every
      // callback the page asked for in a frame: after the view's.
      const last = new Map();
      let asks = 0;
      window.requestAnimationFrame = (callback) => {
        window.frameAsks++;
        const id = asked.call(window, callback);
        if (window.ownFor) {
          const frame = document.timeline.currentTime;
          const mine = ++asks;
          last.set(frame, mine);
          asked.call(window, () => last.get(frame) === mine && (last.delete(frame), window.hold(window.ownFor)));
        }
        return id;
      };
      const proto = WebGL2RenderingContext.prototype;
      const fenceSync = proto.fenceSync;
      const status = proto.getSyncParameter;
      // Each fence made while holding, and whether it is done.
      const held = new Map();
      window.holding = false;
      window.fenceChecks = 0;
      proto.fenceSync = function (...args) {
        const fence = fenceSync.apply(this, args);
        if (window.holding) held.set(fence, false);
        return fence;
      };
      proto.getSyncParameter = function (fence, name) {
        window.fenceChecks++;
        if (name !== this.SYNC_STATUS || !held.has(fence)) return status.call(this, fence, name);
        return held.get(fence) ? this.SIGNALED : this.UNSIGNALED;
      };
      window.release = () => {
        for (const fence of held.keys()) held.set(fence, true);
      };
    `;
    // Each frame of the page's, from now: its animation frame callbacks held
    // `window.ownFor` ms (HELD), or, once it was laid out, the frame held
    // `window.makingFor` ms, as a browser that waits there for the GPU; the
    // GPU's work done at the end of either. Made after the view, so the
    // view's own look at a laid out frame comes first.
    const frameHeld = (page) =>
      page.evaluate(() => {
        window.ownFor = 0;
        window.makingFor = 0;
        const hold = (window.hold = (ms) => {
          const until = performance.now() + ms;
          while (performance.now() < until);
          window.release();
        });
        const laidOut = new ResizeObserver(() => {
          laidOut.unobserve(document.body);
          if (window.makingFor) hold(window.makingFor);
        });
        const each = () => {
          laidOut.observe(document.body);
          window.ownFrame(each);
        };
        window.ownFrame(each);
      });
    // What the GPU took for each of the next `count` pictures, as the view
    // is paced by it: counted, so a loaded machine that draws fewer in a
    // second still gives as many.
    const gpuTimes = (page, count) =>
      page.evaluate(
        (count) =>
          new Promise((done) => {
            const state = document.querySelector(".qq-view3d").$view3d;
            const took = [];
            state.probe = (kind, from, to) => {
              if (kind !== "gpu") return;
              took.push(Math.round(to - from));
              if (took.length < count) return;
              state.probe = null;
              done(took);
            };
          }),
        count,
      );

    test("a picture the browser waits for as it makes the page's frame is the GPU's time, and a view drawn on time again asks for no frames", async ({ page }) => {
      test.skip(backend !== "webgl2", "a fence is WebGL 2's");
      await page.addInitScript(HELD);
      await show(page, "wgpu_moving");
      await frameHeld(page);
      await page.evaluate(() => {
        window.holding = true;
        window.makingFor = 80;
        window.objects.moving = true;
        window.flush();
      });
      // The first is checked by timers only, and seen done late; then the
      // view rests after each, as long as it took.
      const took = (await gpuTimes(page, 6)).slice(2);
      expect(Math.min(...took), `the GPU took ${took.join(", ")} ms, each frame held 80 ms once laid out`).toBeGreaterThanOrEqual(80);
      await page.evaluate(() => {
        window.holding = false;
        window.makingFor = 0;
        window.release();
      });
      // The pictures under way when it was let go, and the rest after the
      // last slow one.
      await gpuTimes(page, 2);
      const onTime = await drawnOver(page, 40);
      expect(onTime.asks / onTime.frames, `${onTime.asks} animation frames asked for ${onTime.frames} drawn`).toBeLessThanOrEqual(1.1);
    });

    test("what the page's own animation frames take is not the GPU's time", async ({ page }) => {
      test.skip(backend !== "webgl2", "a fence is WebGL 2's");
      await page.addInitScript(HELD);
      await show(page, "wgpu_moving");
      await frameHeld(page);
      await page.evaluate(() => {
        window.holding = true;
        window.ownFor = 80;
        window.objects.moving = true;
        window.flush();
      });
      const took = (await gpuTimes(page, 6)).slice(2);
      expect(Math.max(...took), `the GPU took ${took.join(", ")} ms, each frame's callbacks held 80 ms`).toBeLessThan(50);
    });

    test("a view whose frames are watched, taken away, asks for no frame and checks no fence after", async ({ page }) => {
      test.skip(backend !== "webgl2", "a fence is WebGL 2's");
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(HELD);
      await show(page, "wgpu_moving");
      await frameHeld(page);
      await page.evaluate(() => {
        window.holding = true;
        window.makingFor = 80;
        window.objects.moving = true;
        window.flush();
      });
      const watched = await drawnOver(page, 3);
      expect(watched.asks, "frames the view asked for while it was watched").toBeGreaterThan(0);
      const after = await page.evaluate(
        () =>
          new Promise((done) => {
            window.reload("aliased").then((error) => {
              const from = { asks: window.frameAsks, checks: window.fenceChecks };
              window.makingFor = 0;
              // Over 20 of the page's frames, its own, which are not counted.
              let left = 20;
              const next = () => (--left <= 0 ? done({ error, asks: window.frameAsks - from.asks, checks: window.fenceChecks - from.checks }) : window.ownFrame(next));
              window.ownFrame(next);
            });
          }),
      );
      expect(after).toEqual({ error: null, asks: 0, checks: 0 });
      expect(errors).toEqual([]);
    });

    // Each draw is a new picture for the other view, without end: what paces
    // them is the animation frame, so the page still paints.
    test("two views showing each other's picture go round once an animation frame, and the page paints", async ({ page }) => {
      await show(page, "wgpu_mutual", { endless: true });
      const { frames, drawn } = await page.evaluate(
        () =>
          new Promise((done) => {
            const views = [...document.querySelectorAll(".qq-view3d")].map((canvas) => canvas.$view3d);
            const draws = () => views.reduce((all, view) => all + view.frames, 0);
            const from = draws();
            // Counted in the page's frames, not timed: a loaded machine
            // runs fewer frames, and the views go round once in each.
            let frames = 0;
            const tick = () => {
              frames++;
              if (frames < 20 || draws() === from) requestAnimationFrame(tick);
              else done({ frames, drawn: draws() - from });
            };
            requestAnimationFrame(tick);
          }),
      );
      expect(drawn).toBeGreaterThan(0);
      expect(drawn, `${drawn} drawn in ${frames} animation frames`).toBeLessThanOrEqual(2 * (frames + 1));
      // Each square shows the other view, its clear colour at the corners.
      near(await at(page, 55, 105), [0, 0, 0x40]);
      near(await at(page, 255, 105), [0x40, 0, 0]);
    });

    // A View3D a Loader makes after the page is up is made inside a
    // computation's callback, where the one made at the start never is: what
    // it and its Repeater3D make still has to be made, followed and drawn.
    test("a View3D a Loader makes once the page is up draws, and so does what a Repeater3D in it adds", async ({ page }) => {
      if (backend === "webgl2") await page.addInitScript(HIDDEN);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("/?scene=late3d&view3d=wgpu");
      await page.waitForFunction(() => window.ready);
      await page.evaluate(() => {
        window.objects.loader.active = true;
        window.flush();
      });
      await page.waitForFunction(() => {
        const state = document.querySelector(".qq-view3d")?.$view3d;
        if (state?.error) throw new Error(state.error);
        return state?.frames > 0;
      });
      await still(page);
      expect(await page.evaluate(() => document.querySelector(".qq-view3d").$view3d.backend)).toBe(backend);
      near(await at(page, 40, 150), [255, 0, 0]);
      near(await at(page, 120, 150), [255, 0, 0]);
      near(await at(page, 360, 150), [32, 32, 32]);
      await set(page, () => (window.objects.shown = 5));
      near(await at(page, 360, 150), [255, 0, 0]);
      expect(errors).toEqual([]);
    });

    // Only a view that gave its picture on waits for the next animation
    // frame to draw again: one that shows another's picture, and drew already,
    // still draws the new picture without being held. What is counted is the
    // draws each view was held for (`held`), not whether they came before the
    // next frame: a slow GPU's fence or the pacing's rest may put a draw
    // after it on a loaded machine, and that is no hold.
    test("a view showing another's picture is not held to the next frame for its new picture, though it drew already", async ({ page }) => {
      await show(page, "wgpu_oneway");
      const before = await page.evaluate(
        () =>
          new Promise((done) => {
            const [giver, shower] = [...document.querySelectorAll(".qq-view3d")].map((canvas) => canvas.$view3d);
            requestAnimationFrame(async () => {
              const before = { giver: { frames: giver.frames, held: giver.held }, shower: { frames: shower.frames, held: shower.held } };
              window.objects.own.x = 60;
              window.flush();
              // The shower's first draw, for its own change: in this task
              // where nothing puts it off, in a later one where the GPU's
              // last picture (a fence) or the pacing's rest does, which only
              // a timer of the view's ends.
              for (let turn = 0; turn < 20 && shower.frames === before.shower.frames; turn++) await null;
              while (shower.frames === before.shower.frames) await new Promise((done) => setTimeout(done));
              window.objects.moved.x = 60;
              window.flush();
              done({ ...before, first: shower.frames - before.shower.frames });
            });
          }),
      );
      expect(before.first, "frames the right view drew for its own change").toBe(1);
      await page.waitForFunction(
        (frames) => [...document.querySelectorAll(".qq-view3d")][1].$view3d.frames >= frames,
        before.shower.frames + 2,
        { timeout: 0, polling: "raf" },
      );
      await still(page);
      const after = await page.evaluate(() =>
        [...document.querySelectorAll(".qq-view3d")].map(({ $view3d: { frames, held } }) => ({ frames, held })),
      );
      expect(
        { giver: { drawn: after[0].frames - before.giver.frames, held: after[0].held - before.giver.held }, shower: { drawn: after[1].frames - before.shower.frames, held: after[1].held - before.shower.held } },
        "frames each view drew for the two changes, and the draws it was held to the next frame for",
      ).toEqual({ giver: { drawn: 1, held: 0 }, shower: { drawn: 2, held: 0 } });
      // The right view's large square shows the left view, its red square moved right.
      near(await at(page, 255, 105), [0x40, 0, 0]);
      near(await at(page, 330, 150), [255, 0, 0]);
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

    test("what a loader read is picked by the names of its nodes, where the loader puts them", async ({ page }) => {
      await show(page, "wgpu_loaderpick");
      await page.waitForFunction(() => window.objects.loaded);
      const picked = (x, y) =>
        page.evaluate(([x, y]) => {
          const hit = window.objects.view.pick(x, y).objectHit;
          return hit ? [hit.objectName, hit.parent?.objectName ?? null] : null;
        }, [x, y]);
      // Read when picking asks, once the file is here.
      await expect.poll(() => picked(150, 50)).toEqual(["left", "pair"]);
      expect(await picked(250, 50)).toEqual(["right", "pair"]);
      expect(await picked(265, 50)).toBe(null);
      expect(await picked(200, 50)).toBe(null);
      await expect.poll(() => picked(350, 190)).toEqual(["cube", "box"]);
      expect(await picked(350, 110)).toEqual(["cube", "box"]);
      expect(await picked(300, 150)).toBe(null);
      const all = await page.evaluate(() => window.objects.view.pickAll(150, 50).map((hit) => hit.objectHit.objectName));
      expect(all).toEqual(["left"]);
      await set(page, () => (window.objects.pair.x = 100));
      expect(await picked(250, 50)).toEqual(["left", "pair"]);
      await set(page, () => (window.objects.pair.visible = false));
      expect(await picked(250, 50)).toBe(null);
    });

    // What the wasm fetched through the page (a glTF and its buffers) is
    // not held by the page once the wasm has its copy.
    test("a file the view has read is not held by the page after", async ({ page }) => {
      await show(page, "wgpu_loader");
      await set(page, () => (window.objects.loader.source = "scenes/wgpu_models/checker.gltf"));
      // Red top left: the checker, drawn.
      await expect.poll(() => at(page, 200 - 25, 150 - 25)).toEqual([255, 0, 0]);
      const held = () =>
        page.evaluate(async () => {
          // The page's own instance of the module, by the address it was loaded from.
          const address = performance.getEntriesByType("resource").find(({ name }) => /\/QtQuick3D\/scene\.js/.test(name)).name;
          return (await import(address)).held();
        });
      expect(await held()).toBe(0);
    });

    test("a file arriving for one loader asks nothing again of another whose file is in", async ({ page }) => {
      await show(page, "wgpu_twoloaders");
      await expect.poll(() => at(page, 100, 150)).toEqual([255, 0, 0]);
      // What a build asks of one loader, all of it.
      await set(page, () => (window.objects.first.x = -90));
      const one = (await counts(page)).reads;
      expect(one).toBeGreaterThan(0);
      await set(page, () => (window.objects.second.source = "scenes/wgpu_models/square.gltf"));
      await expect.poll(() => at(page, 300, 150)).toEqual([255, 0, 0]);
      expect(await page.evaluate(() => window.objects.loaded)).toBe(true);
      // The build the arrival made asked of the second loader alone.
      expect((await counts(page)).reads).toBeLessThanOrEqual(one);
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

    // A wasm that traps (a panic, which aborts) is left with what it held
    // mid-call still held, so every call into it after traps too. One that
    // trapped inside a build, as a lost device's did on a loaded machine,
    // stopped every binding on the page with it: Solid halts all of them
    // on an error nothing catches. The view stops and says why; the page
    // around it goes on.
    test.describe("a renderer that trapped", () => {
      test.use({ told: [/^View3D: the renderer stopped: RuntimeError: unreachable/] });
      test("stops its view and says why, and the page around it goes on", async ({ page }) => {
        await show(page, "wgpu_trapped");
        await page.evaluate(async () => {
          const address = performance.getEntriesByType("resource").find(({ name }) => /\/wgpu\/ljos_web_3d\.js/.test(name)).name;
          const { View3d } = await import(address);
          window.calls = 0;
          const trap = () => {
            window.calls++;
            throw new WebAssembly.RuntimeError("unreachable");
          };
          for (const name of ["build", "frame", "resize", "again", "pieces", "free"]) View3d.prototype[name] = trap;
        });
        const frames = await page.evaluate(() => document.querySelector(".qq-view3d").$view3d.frames);
        await page.evaluate(() => (window.objects.moved.x = 40));
        await expect.poll(() => page.evaluate(() => document.querySelector(".qq-view3d").$view3d.error)).toMatch(/^the renderer stopped: RuntimeError: unreachable/);
        await page.evaluate(() => (window.objects.counter.count = 1));
        await expect(page.getByText("count 1")).toBeAttached();
        await page.evaluate(() => (window.objects.moved.x = 80));
        await page.evaluate(() => (window.objects.counter.count = 2));
        await expect(page.getByText("count 2")).toBeAttached();
        expect(await page.evaluate(() => document.querySelector(".qq-view3d").$view3d.frames)).toBe(frames);
        expect(await page.evaluate(() => window.calls), "the renderer is not called again once it trapped").toBe(1);
      });

      // What the wasm started before it trapped (a fetch's callback) may
      // still ask its view for a picture: a stopped view never draws again,
      // so it is not due, which a host that reads its pixels waits on.
      test("is not due for a picture asked of it once stopped", async ({ page }) => {
        await show(page, "wgpu_trapped");
        await page.evaluate(async () => {
          const address = performance.getEntriesByType("resource").find(({ name }) => /\/wgpu\/ljos_web_3d\.js/.test(name)).name;
          const { View3d } = await import(address);
          const create = View3d.create;
          View3d.create = function (canvas, host) {
            window.host = host;
            return create.call(this, canvas, host);
          };
          window.objects.later.active = true;
        });
        await page.waitForFunction(() => {
          const views = [...document.querySelectorAll(".qq-view3d")];
          return views.length === 2 && views.every((view) => view.$view3d.frames > 0) && window.host;
        });
        await page.evaluate(async () => {
          const address = performance.getEntriesByType("resource").find(({ name }) => /\/wgpu\/ljos_web_3d\.js/.test(name)).name;
          const { View3d } = await import(address);
          const trap = () => {
            throw new WebAssembly.RuntimeError("unreachable");
          };
          for (const name of ["build", "frame", "resize", "again", "pieces", "free"]) View3d.prototype[name] = trap;
          window.objects.moved.x = 40;
        });
        await expect.poll(() => page.evaluate(() => document.querySelectorAll(".qq-view3d")[1].$view3d.error)).toMatch(/^the renderer stopped/);
        await page.evaluate(() => window.host.request());
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
        expect(await page.evaluate(() => [...document.querySelectorAll(".qq-view3d")].map((view) => view.$view3d.due))).toEqual([false, false]);
      });

      // A trap as the renderer is first made (as it reads its names) leaves
      // no renderer kept, which a view after asks for again, as it does
      // after a fetch that failed: a renderer that trapped is not asked.
      test("that trapped as it was first made is not made again for the next view", async ({ page }) => {
        await page.route(/\/wgpu\/ljos_web_3d\.js(\?|$)/, async (route) => {
          const response = await route.fetch();
          const glue = (await response.text()).replace("export function propNames(", "function propNamesOfWasm(");
          const trap = 'export function propNames() { self.namesAsked = (self.namesAsked ?? 0) + 1; throw new WebAssembly.RuntimeError("unreachable"); }';
          await route.fulfill({ response, body: `${glue}\n${trap}\n` });
        });
        if (backend === "webgl2") await page.addInitScript(HIDDEN);
        await page.goto("/?scene=wgpu_trapped&view3d=wgpu");
        await page.waitForFunction(() => window.ready);
        const error = (index) => page.evaluate((index) => document.querySelectorAll(".qq-view3d")[index]?.$view3d.error, index);
        await expect.poll(() => error(0)).toMatch(/^the renderer stopped: RuntimeError: unreachable/);
        await page.evaluate(() => (window.objects.later.active = true));
        await expect.poll(() => error(1)).toMatch(/^the renderer stopped: RuntimeError: unreachable/);
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
        expect(await page.evaluate(() => self.namesAsked), "the renderer is not made again once it trapped").toBe(1);
      });
    });

    test.describe("a chunk that did not arrive", () => {
      test.use({ told: [/View3D: |net::ERR_FAILED/] });
      test("is asked for again by the next view, which draws", async ({ page }) => {
        // The page's own ask, before its first view, and the first view's.
        let refusals = 2;
        await page.route(WASM, (route) => (refusals-- > 0 ? route.abort() : route.fallback()));
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

    test.describe("a chunk that did not arrive while the page loaded", () => {
      test.use({ told: [/net::ERR_FAILED/] });
      test("is asked for again by the first view, and every view draws", async ({ page }) => {
        let refusals = 1;
        await page.route(WASM, (route) => (refusals-- > 0 ? route.abort() : route.fallback()));
        if (backend === "webgl2") await page.addInitScript(HIDDEN);
        await page.goto("/?scene=wgpu_two&view3d=wgpu");
        await page.waitForFunction(() => window.ready);
        const states = () => page.evaluate(() => [...document.querySelectorAll(".qq-view3d")].map(({ $view3d: { error, frames } }) => ({ error, drew: frames > 0 })));
        // Each view as it stands, so a view that never draws says why: its
        // error, or that it still waits. Two first frames, each after the
        // renderer's compile, take longer than a poll's default on a busy
        // machine.
        const said = async () => (await states()).map(({ error, drew }) => error ?? (drew ? "drew" : "waiting"));
        await expect.poll(said, { timeout: 20_000 }).toEqual(["drew", "drew"]);
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

    // A canvas is drawn on with nothing to follow: what a build passed by
    // (a hidden model's material) is asked again when it is reached again,
    // however many builds passed it by.
    test("a canvas's picture on a model hidden for a while is the canvas's as it is now", async ({ page }) => {
      await show(page, "wgpu_livehidden");
      near(await at(page, ...CENTRE), [255, 0, 0]);
      await set(page, () => (window.scene.drawn = false));
      near(await at(page, ...CENTRE), CLEAR);
      await set(page, () => (window.scene.elsewhere = 120));
      await set(page, () => (window.scene.faceColor = "#0000ff"));
      await set(page, () => (window.scene.elsewhere = 150));
      near(await at(page, 350, 150), [0, 255, 0]);
      await set(page, () => (window.scene.drawn = true));
      near(await at(page, ...CENTRE), [0, 0, 255]);
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
      test.use({ told: [/TextureData: a picture with a depth is not drawn|HUGE_FAN_IN/] });
      test("says why, once, however often it is committed again", async ({ page }) => {
        const said = [];
        page.on("console", (message) => /TextureData: a picture with a depth/.test(message.text()) && said.push(message.text()));
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
        expect(said, said.join("\n")).toEqual(["TextureData: a picture with a depth is not drawn"]);
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

    test("views whose GPU is lost are made again on a new one, and go on drawing", async ({ page }) => {
      test.skip(backend !== "webgpu", "a device the page can lose is WebGPU's");
      await page.addInitScript(LOSABLE);
      await show(page, "wgpu_two");
      const first = await page.evaluateHandle(() => document.querySelector(".qq-view3d").$view3d);
      const drawn = await first.evaluate(({ frames }) => frames);
      await page.evaluate(() => window.loseGpu());
      // One drawing when it was lost draws again, and so does one made after.
      await first.evaluate((state, drawn) => new Promise((done) => {
        const look = () => (state.error ? done() : state.frames > drawn ? done() : requestAnimationFrame(look));
        look();
      }), drawn);
      expect(await first.evaluate(({ lost, error }) => ({ lost, error }))).toEqual({ lost: 1, error: null });
      await set(page, () => (window.objects.second.active = false));
      await set(page, () => (window.objects.second.active = true));
      await page.waitForFunction(() => {
        const views = [...document.querySelectorAll(".qq-view3d")];
        return views.length === 2 && views.every(({ $view3d }) => $view3d.frames > 0 && !$view3d.error);
      });
      await still(page);
      near(await at(page, 100, 150), [255, 0, 0]);
      near(await at(page, 300, 150), [0, 0, 255]);
      await set(page, () => (window.objects.first.x = 40));
      near(await at(page, 140, 150), [255, 0, 0]);
      expect(await page.evaluate(() => window.gpuDevices.filter(({ lost }) => !lost).length)).toBe(1);
    });

    // A GPU that keeps dying: views a renderer was asked of are made again
    // for the first three losses within a minute, and stop at the fourth,
    // saying why.
    test.describe("a GPU that keeps dying", () => {
      test.use({ told: [/^View3D: the GPU was lost: /] });

      test("views a renderer was asked of stop, saying why, once their GPU is lost too often", async ({ page }) => {
        test.skip(backend !== "webgpu", "a device the page can lose is WebGPU's");
        await page.addInitScript(LOSABLE);
        await show(page, "wgpu_two");
        for (let time = 0; time < 4; time++) await page.evaluate(LOST_AND_SETTLED);
        const stopped = { renderer: "wgpu", lost: 3, error: "the GPU was lost" };
        expect(await page.evaluate(RENDERERS)).toEqual([stopped, stopped]);
      });
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
  await page.goto("/?scene=shaded3d&view3d=js");
  await page.waitForFunction(() => window.ready);
  await page.waitForTimeout(100);
  // A dev server serves the wasm's address as a module of its own, which is
  // a string and none of the renderer; a build writes it into the page's.
  expect(fetched.filter((url) => /ljos_web_3d/.test(url) && !/\.wasm\?import&url$/.test(url))).toEqual([]);
});

// The JavaScript renderer draws every view with one WebGL 2 context, which
// the browser may lose (a GPU process that went down takes it, as it takes
// WebGPU's device): a view keeps the picture it last drew, and no frame
// throws for the picture it can no longer hand over.
test("a view on the JavaScript renderer whose context is lost keeps its last picture, and throws nothing", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const get = OffscreenCanvas.prototype.getContext;
    OffscreenCanvas.prototype.getContext = function (kind, ...rest) {
      const made = get.call(this, kind, ...rest);
      if (kind === "webgl2" && made) window.drawing = made;
      return made;
    };
  });
  await page.goto("/?scene=shaded3d&view3d=js");
  await page.waitForFunction(() => window.ready && document.querySelector(".qq-view3d")?.$view3d?.frames > 0);
  const frames = await page.evaluate(() => document.querySelector(".qq-view3d").$view3d.frames);
  await page.evaluate(() => window.drawing.getExtension("WEBGL_lose_context").loseContext());
  // A change the view draws again for, and the frames it would be drawn in.
  await page.evaluate(() => (window.objects.height = 290));
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 100)))));
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.querySelector(".qq-view3d").$view3d.frames), "no picture drawn without a context").toBe(frames);
  const [r, g, b] = (await pixels(page, [[50, 60]]))[0].split(" ").map(Number);
  expect([r, g, b], "the model it last drew, not the window's colour").not.toEqual(CLEAR);
});

// A browser that lost the context may give it back, as one whose GPU
// process came up again does: all that was made on the lost one is made
// again, and the view draws the picture last asked of it.
test("a view on the JavaScript renderer whose context is given back draws again", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const get = OffscreenCanvas.prototype.getContext;
    OffscreenCanvas.prototype.getContext = function (kind, ...rest) {
      const made = get.call(this, kind, ...rest);
      if (kind === "webgl2" && made) window.drawing = made;
      return made;
    };
  });
  await page.goto("/?scene=shaded3d&view3d=js");
  await page.waitForFunction(() => window.ready && document.querySelector(".qq-view3d")?.$view3d?.frames > 0);
  const frames = await page.evaluate(() => {
    window.losing = window.drawing.getExtension("WEBGL_lose_context");
    window.losing.loseContext();
    return document.querySelector(".qq-view3d").$view3d.frames;
  });
  await page.evaluate(() => (window.objects.height = 290));
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => setTimeout(done, 50))));
  await page.evaluate(() => window.losing.restoreContext());
  await page.waitForFunction((was) => document.querySelector(".qq-view3d").$view3d.frames > was, frames);
  expect(errors).toEqual([]);
  const [r, g, b] = (await pixels(page, [[50, 60]]))[0].split(" ").map(Number);
  expect([r, g, b], "the model, not the window's colour").not.toEqual(CLEAR);
});

// Surroundings Qt baked into a file are handed to the context as they are,
// and the file let go of: a context given back reads it again, and the
// scene is lit by it and has it behind as before.
test("a view on the JavaScript renderer lit by baked surroundings is lit by them again once its context is given back", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const get = OffscreenCanvas.prototype.getContext;
    OffscreenCanvas.prototype.getContext = function (kind, ...rest) {
      const made = get.call(this, kind, ...rest);
      if (kind === "webgl2" && made) window.drawing = made;
      return made;
    };
  });
  await page.goto("/?scene=baked3d&view3d=js");
  await page.waitForFunction(() => window.ready && document.querySelector(".qq-view3d")?.$view3d?.frames > 0);
  // Behind, the mirror, and the ball half as smooth, as quick3d.spec.js
  // has them.
  const points = [[60, 60], [300, 60], [200, 150], [320, 150]];
  const colours = [[62, 168, 168], [129, 129, 43], [87, 87, 208], [45, 45, 134]];
  const lit = async () => {
    const got = (await pixels(page, points)).map((one) => one.split(" ").map(Number));
    return got.every((colour, index) => colour.every((value, at) => Math.abs(value - colours[index][at]) <= 3)) || got;
  };
  await expect.poll(lit).toBe(true);
  const frames = await page.evaluate(() => {
    window.losing = window.drawing.getExtension("WEBGL_lose_context");
    window.losing.loseContext();
    return document.querySelector(".qq-view3d").$view3d.frames;
  });
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => setTimeout(done, 50))));
  await page.evaluate(() => window.losing.restoreContext());
  await page.waitForFunction((was) => document.querySelector(".qq-view3d").$view3d.frames > was, frames);
  await expect.poll(lit, { message: "lit and behind as before the context was lost" }).toBe(true);
  expect(errors).toEqual([]);
});

// Where neither the page nor the build asks for a renderer, a View3D is on
// wgpu if WebGPU has an adapter for the page, and on the JavaScript one if
// not (a browser may have WebGPU and no GPU it lets it use), unless the
// scene shows models from files, none still on the way and one that can be
// shown, and nothing left to the JavaScript one: then on wgpu's WebGL 2.
test.describe("a View3D no one asked a renderer of", () => {
  test.skip(!!process.env.VITE_LJOS_VIEW3D, "the build asks for one");
  const drawn = (page) =>
    page.waitForFunction(() => {
      const state = document.querySelector(".qq-view3d")?.$view3d;
      if (state?.error) throw new Error(state.error);
      return state?.frames > 0 && state.renderer;
    });

  test("draws on the JavaScript renderer where WebGPU has no adapter, and fetches none of wgpu", async ({ page }) => {
    await page.addInitScript(() => {
      if (navigator.gpu) navigator.gpu.requestAdapter = async () => null;
    });
    const fetched = [];
    page.on("request", (request) => fetched.push(request.url()));
    await page.goto("/?scene=shaded3d");
    await page.waitForFunction(() => window.ready);
    expect(await (await drawn(page)).jsonValue()).toBe("js");
    // The rectangle of its own colour, up and to the left.
    const [r, g, b] = (await pixels(page, [[50, 60]]))[0].split(" ").map(Number);
    expect([r, g, b], "the model, not the window's colour").not.toEqual(CLEAR);
    expect(fetched.filter((url) => /ljos_web_3d/.test(url) && !/\.wasm\?import&url$/.test(url))).toEqual([]);
  });

  // A glTF model, which only wgpu reads, drawn where WebGPU gives the page
  // nothing to draw with: wgpu's WebGL 2 draws it.
  for (const [where, missing] of [
    ["WebGPU has no adapter", () => navigator.gpu && (navigator.gpu.requestAdapter = async () => null)],
    ["the browser has no WebGPU", HIDDEN],
  ]) {
    test(`draws on wgpu's WebGL 2 where ${where}, a model from a file and all`, async ({ page }) => {
      await page.addInitScript(missing);
      await page.goto("/?scene=wgpu_loader");
      await page.waitForFunction(() => window.ready);
      // The JavaScript renderer draws until the file is here.
      await page.waitForFunction(() => {
        const state = document.querySelector(".qq-view3d")?.$view3d;
        if (state?.error) throw new Error(state.error);
        return state?.renderer === "wgpu" && state.frames > 0;
      });
      expect(await page.evaluate(() => document.querySelector(".qq-view3d").$view3d.backend)).toBe("webgl2");
      // The file's red square, in the middle.
      await expect.poll(async () => (await pixels(page, [CENTRE]))[0], { message: "the model the file holds" }).toBe("255 0 0");
    });

    // What needs wgpu may come after the view: a source named later, on a
    // loader shown later. Until it is shown the view is as it was.
    test(`turns to wgpu's WebGL 2 where ${where}, once a model from a file is shown`, async ({ page }) => {
      await page.addInitScript(missing);
      await page.goto("/?scene=wgpu_beside");
      await page.waitForFunction(() => window.ready);
      expect(await (await drawn(page)).jsonValue()).toBe("js");
      await page.evaluate(() => {
        window.objects.loader.visible = false;
        window.objects.loader.source = "scenes/wgpu_models/square.gltf";
        window.flush();
      });
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      expect(await (await drawn(page)).jsonValue(), "while the loader is hidden").toBe("js");
      await page.evaluate(() => {
        window.objects.loader.visible = true;
        window.flush();
      });
      await page.waitForFunction(() => {
        const state = document.querySelector(".qq-view3d")?.$view3d;
        if (state?.error) throw new Error(state.error);
        return state?.renderer === "wgpu" && state.backend === "webgl2" && state.frames > 0;
      });
      await expect.poll(() => pixels(page, [CENTRE, [50, 150]]), { message: "the file's model and the one beside it" }).toEqual(["255 0 0", "0 0 255"]);
      expect(await page.evaluate(() => document.querySelectorAll(".qq-view3d").length)).toBe(1);
    });
  }

  // wgpu's loader reads an OBJ too (ljos_3d's `load_any`), which is as
  // much a model only wgpu draws as a glTF is.
  test("turns to wgpu's WebGL 2 for a model from an OBJ, where the browser has no WebGPU", async ({ page }) => {
    await page.addInitScript(HIDDEN);
    await page.goto("/?scene=wgpu_beside");
    await page.waitForFunction(() => window.ready);
    expect(await (await drawn(page)).jsonValue()).toBe("js");
    await page.evaluate(() => {
      window.objects.loader.source = "scenes/wgpu_models/square.obj";
      window.flush();
    });
    await page.waitForFunction(() => {
      const state = document.querySelector(".qq-view3d")?.$view3d;
      if (state?.error) throw new Error(state.error);
      return state?.renderer === "wgpu" && state.backend === "webgl2" && state.frames > 0;
    });
    await expect.poll(() => pixels(page, [CENTRE, [50, 150]]), { message: "the file's model and the one beside it" }).toEqual(["255 0 0", "0 0 255"]);
  });

  // What tells that a view can turn is wgpu's to have: the same fetch, and
  // nothing of it kept by the page once the wasm has its copy.
  for (const [form, named, kept] of [
    ["a glTF and its buffer", "pair.gltf", [["gltf", "pair.gltf"], ["buffer", "pair.bin"]]],
    ["a GLB", "cube.glb", [["gltf", "cube.glb"]]],
    ["an OBJ", "square.obj", [["obj", "square.obj"]]],
  ]) {
    test(`turns for ${form} with one fetch of each, and keeps none of it`, async ({ page }) => {
      const asked = {};
      await page.route(/\/wgpu_models\/(pair\.(gltf|bin)|cube\.glb|square\.obj)(\?.*)?$/, (route) => {
        const file = new URL(route.request().url()).pathname.split("/").pop();
        asked[file] = (asked[file] ?? 0) + 1;
        return route.continue();
      });
      await page.addInitScript(HIDDEN);
      await page.goto("/?scene=wgpu_beside");
      await page.waitForFunction(() => window.ready);
      expect(await (await drawn(page)).jsonValue()).toBe("js");
      const source = `scenes/wgpu_models/${named}`;
      await page.evaluate((source) => {
        window.objects.loader.source = source;
        window.flush();
      }, source);
      await page.waitForFunction(() => document.querySelector(".qq-view3d")?.$view3d?.renderer === "wgpu" && window.objects.loader.status === 1);
      expect(asked, "fetches").toEqual(Object.fromEntries(kept.map(([, file]) => [file, 1])));
      // The page's own instance of the module, by the address it was loaded from.
      const scene = await page.evaluateHandle(() => {
        const address = performance.getEntriesByType("resource").find(({ name }) => /\/QtQuick3D\/scene\.js/.test(name)).name;
        return import(address);
      });
      await expect.poll(() => scene.evaluate((scene) => scene.held()), { message: "bytes held for the wasm" }).toBe(0);
      for (const [kind, file] of kept) {
        const path = `scenes/wgpu_models/${file}`;
        // A buffer is kept by its whole address, a loader's file by the one it was named by.
        const address = kind === "buffer" ? new URL(path, page.url()).href : path;
        // Asked again, one not kept is not here at once.
        expect(await scene.evaluate((scene, [address, kind]) => scene.file(address, kind, () => ({})).state(), [address, kind]), `${file}, kept`).toBe(null);
      }
    });
  }

  // The page's own instance of the module, by the address it was loaded from.
  const sceneOf = (page) =>
    page.evaluateHandle(() => {
      const address = performance.getEntriesByType("resource").find(({ name }) => /\/QtQuick3D\/scene\.js/.test(name)).name;
      return import(address);
    });

  // What the page made of a file (a texture, a shape) is kept, and the
  // file is not: no view reads it, and it is not asked again.
  test("a file the page made something of is not held after", async ({ page }) => {
    await page.goto("/?scene=wgpu_beside");
    await page.waitForFunction(() => window.ready);
    const scene = await sceneOf(page);
    const before = await scene.evaluate((scene) => scene.held());
    const made = () => scene.evaluate((scene) => scene.file("scenes/wgpu_models/square.obj", "size", (bytes) => ({ size: bytes.byteLength })).state()?.size ?? null);
    await expect.poll(made, { message: "what the page made of the file" }).toBeGreaterThan(0);
    expect(await scene.evaluate((scene) => scene.held()), "bytes held").toBe(before);
  });

  test.describe("a fetch that fails", () => {
    test.use({ told: [/later-gone|404/] });
    test("is let go by the address it was asked at, though the document's base changed meanwhile", async ({ page }) => {
      let answer;
      const answered = new Promise((done) => (answer = done));
      await page.route(/\/wgpu_models\/later-gone\.obj$/, async (route) => {
        await answered;
        await route.fulfill({ status: 404 });
      });
      await page.goto("/?scene=wgpu_beside");
      await page.waitForFunction(() => window.ready);
      const scene = await sceneOf(page);
      const before = await scene.evaluate((scene) => scene.held());
      await scene.evaluate((scene) => (window.asking = scene.fetched("scenes/wgpu_models/later-gone.obj")));
      await page.evaluate(() => {
        const base = document.createElement("base");
        base.href = "/elsewhere/";
        document.head.prepend(base);
      });
      answer();
      await page.evaluate(() => window.asking.done);
      expect(await page.evaluate(() => !!window.asking.failed), "it failed").toBe(true);
      expect(await scene.evaluate((scene) => scene.held()), "the failure, held").toBe(before);
    });
  });

  // A glTF's buffer is named by its path by one and by its whole address by
  // another: one fetch for both. The bytes stay while a read by either name
  // is left, for the wasm to take without another fetch.
  test("bytes two names of a file share are held while a read by either is left", async ({ page }) => {
    await page.goto("/?scene=wgpu_beside");
    await page.waitForFunction(() => window.ready);
    const scene = await sceneOf(page);
    const readers = await scene.evaluate(async (scene) => {
      const path = "scenes/wgpu_models/pair.bin";
      const whole = new URL(path, document.baseURI).href;
      const took = () => ({});
      const ahead = scene.readsAhead();
      ahead.sighting();
      ahead.read(path, "buffer", took, "first");
      ahead.read(whole, "buffer", took, "second");
      ahead.sighted();
      await scene.fetched(whole).done;
      await new Promise((done) => setTimeout(done));
      // The first loader is gone; the second still reads the file.
      ahead.sighting();
      ahead.read(whole, "buffer", took, "second");
      ahead.sighted();
      // The same fetch, with the reader still on it, and not a new one.
      const readers = scene.fetched(whole).readers.size;
      ahead.end();
      return readers;
    });
    expect(readers, "readers of the fetch the second read holds").toBe(1);
  });

  // It reads a file by its extension: one it refuses is no reason to turn,
  // nor to fetch, whatever is in it.
  test("stays on the JavaScript renderer for a file whose name wgpu's loader refuses", async ({ page }) => {
    let asked = 0;
    await page.route(/\/wgpu_models\/square\.model$/, async (route) => {
      asked++;
      const response = await route.fetch({ url: route.request().url().replace(/model$/, "gltf") });
      await route.fulfill({ response });
    });
    await page.addInitScript(HIDDEN);
    await page.goto("/?scene=wgpu_beside");
    await page.waitForFunction(() => window.ready);
    expect(await (await drawn(page)).jsonValue()).toBe("js");
    await page.evaluate(() => {
      window.objects.loader.source = "scenes/wgpu_models/square.model";
      window.flush();
    });
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    expect(asked, "fetches of a file wgpu would not read").toBe(0);
    expect(await (await drawn(page)).jsonValue()).toBe("js");
  });

  // A file that arrives and has no model in it shows nothing on wgpu either,
  // so it is no reason to turn.
  for (const [form, named, body] of [
    ["a glTF whose scene has no mesh", "empty.gltf", JSON.stringify({ asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: "nothing" }] })],
    ["an OBJ with no face", "empty.obj", "# corners, and nothing made of them\nv 0 0 0\nv 1 0 0\nv 0 1 0\n"],
  ]) {
    test(`stays on the JavaScript renderer for ${form}, where the browser has no WebGPU`, async ({ page }) => {
      const fetched = [];
      page.on("request", (request) => fetched.push(request.url()));
      await page.route(new RegExp(`/wgpu_models/${named.replace(".", "\\.")}$`), (route) => route.fulfill({ body }));
      await page.addInitScript(HIDDEN);
      await page.goto("/?scene=wgpu_beside");
      await page.waitForFunction(() => window.ready);
      expect(await (await drawn(page)).jsonValue()).toBe("js");
      const arrived = page.waitForEvent("requestfinished", (request) => request.url().endsWith(named));
      await page.evaluate((source) => {
        window.objects.loader.source = source;
        window.flush();
      }, `scenes/wgpu_models/${named}`);
      await arrived;
      // Long enough for a turn to have begun: the renderer's chunk asked for.
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 500)))));
      expect(fetched.filter((url) => /ljos_web_3d/.test(url) && !/\.wasm\?import&url$/.test(url)), "the wgpu renderer").toEqual([]);
      expect(await (await drawn(page)).jsonValue()).toBe("js");
    });
  }

  // What a view reads ahead of wgpu to tell whether to turn. A file that
  // has settled, failed or not, holds no turn, and whatever comes of the
  // view, no bytes read for it are held after.
  test.describe("what is read ahead of wgpu", () => {
    const MODELS = "scenes/wgpu_models";
    const opened = async (page, scene = "wgpu_ahead") => {
      await page.addInitScript(HIDDEN);
      await page.goto(`/?scene=${scene}`);
      await page.waitForFunction(() => window.ready);
      await page.waitForFunction(() => [...document.querySelectorAll(".qq-view3d")].every(({ $view3d }) => $view3d?.renderer === "js" && $view3d.frames > 0));
    };
    const named = (page, sources) =>
      page.evaluate(([models, sources]) => {
        for (const [loader, file] of Object.entries(sources)) window.objects[loader].source = file && `${models}/${file}`;
        window.flush();
      }, [MODELS, sources]);
    const held = (page) =>
      page.evaluate(async () => {
        const address = performance.getEntriesByType("resource").find(({ name }) => /\/QtQuick3D\/scene\.js/.test(name)).name;
        return (await import(address)).held();
      });
    const letGo = (page) => expect.poll(() => held(page), { message: "bytes held for the wasm" }).toBe(0);
    const settled = (page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const turned = (page) =>
      page.waitForFunction(() => {
        const state = document.querySelector(".qq-view3d")?.$view3d;
        if (state?.error) throw new Error(state.error);
        return state?.renderer === "wgpu" && state.backend === "webgl2" && state.frames > 0;
      });
    const counted = async (page, pattern, answer = (route) => route.continue()) => {
      const asked = {};
      await page.route(pattern, (route) => {
        const file = new URL(route.request().url()).pathname.split("/").pop();
        asked[file] = (asked[file] ?? 0) + 1;
        return answer(route, file, asked[file]);
      });
      return asked;
    };
    // pair.gltf's buffer, kept on the way until the test lets it come.
    const bufferWaits = async (page) => {
      let come;
      let asked;
      const coming = new Promise((resolve) => (come = resolve));
      const underWay = new Promise((resolve) => (asked = resolve));
      await page.route(/\/wgpu_models\/pair\.bin(\?.*)?$/, async (route) => {
        asked();
        await coming;
        await route.continue();
      });
      return { underWay, come };
    };
    // wgpu's view, kept in the making until the test lets it be made.
    const makingWaits = async (page) => {
      await page.route(/\/wgpu\/ljos_web_3d\.js(\?|$)/, async (route) => {
        const response = await route.fetch();
        const waits = "\nconst create = View3d.create;\nView3d.create = async function (...args) { await new Promise((made) => (window.makeNow = made)); return create.apply(this, args); };\n";
        await route.fulfill({ response, body: `${await response.text()}${waits}` });
      });
    };

    test.describe("a file that is not there", () => {
      test.use({ told: [/status of 404|gone\.gltf|pair\.bin/] });

      test("doesn't keep the other files' models from wgpu, which says it failed", async ({ page }) => {
        const asked = await counted(page, /\/wgpu_models\/(square|gone)\.gltf(\?.*)?$/, (route, file) => (file === "gone.gltf" ? route.fulfill({ status: 404, body: "" }) : route.continue()));
        await opened(page);
        await named(page, { loader: "square.gltf", other: "gone.gltf" });
        await turned(page);
        await expect.poll(() => pixels(page, [CENTRE, [50, 150]]), { message: "the file that is there and the shape beside it" }).toEqual(["255 0 0", "0 0 255"]);
        await expect.poll(() => page.evaluate(() => [window.objects.loader.status, window.objects.other.status])).toEqual([1, 2]);
        expect(await page.evaluate(() => window.objects.other.errorString)).toMatch(/404/);
        expect(asked, "fetches").toEqual({ "square.gltf": 1, "gone.gltf": 1 });
        await letGo(page);
      });

      test("is no turn by itself, and what was read beside it is let go", async ({ page }) => {
        await page.route(/\/wgpu_models\/pair\.bin(\?.*)?$/, (route) => route.fulfill({ status: 404, body: "" }));
        await opened(page);
        const answered = page.waitForResponse(/\/wgpu_models\/pair\.bin/);
        await named(page, { loader: "pair.gltf" });
        await answered;
        await letGo(page);
        expect(await (await drawn(page)).jsonValue()).toBe("js");
      });
    });

    test.describe("a server that is busy", () => {
      test.use({ told: [/status of 503|pair\.gltf/] });

      test("once, is asked again, and the models are drawn", async ({ page }) => {
        const asked = await counted(page, /\/wgpu_models\/pair\.(gltf|bin)(\?.*)?$/, (route, file, times) => (times === 1 ? route.fulfill({ status: 503, body: "" }) : route.continue()));
        await opened(page);
        await named(page, { loader: "pair.gltf" });
        await turned(page);
        await expect.poll(() => pixels(page, [[150, 150]]), { message: "the left of the file's two models" }).toEqual(["0 255 0"]);
        expect(asked, "fetches").toEqual({ "pair.gltf": 2, "pair.bin": 2 });
        await letGo(page);
      });

      test("for good, is asked three times, and doesn't keep the other files' models from wgpu", async ({ page }) => {
        const asked = await counted(page, /\/wgpu_models\/(square|pair)\.gltf(\?.*)?$/, (route, file) => (file === "pair.gltf" ? route.fulfill({ status: 503, body: "" }) : route.continue()));
        await opened(page);
        await named(page, { loader: "square.gltf", other: "pair.gltf" });
        await turned(page);
        await expect.poll(() => page.evaluate(() => [window.objects.loader.status, window.objects.other.status])).toEqual([1, 2]);
        expect(asked, "fetches").toEqual({ "square.gltf": 1, "pair.gltf": 3 });
        await letGo(page);
      });
    });

    test("is let go where fog comes before the turn", async ({ page }) => {
      const buffer = await bufferWaits(page);
      await opened(page);
      await named(page, { loader: "pair.gltf" });
      await buffer.underWay;
      await page.evaluate(() => {
        window.objects.fog.enabled = true;
        window.flush();
      });
      buffer.come();
      await letGo(page);
      expect(await (await drawn(page)).jsonValue()).toBe("js");
    });

    test("is let go where the source changes before the turn", async ({ page }) => {
      const buffer = await bufferWaits(page);
      await opened(page);
      await named(page, { loader: "pair.gltf" });
      await buffer.underWay;
      await named(page, { loader: "" });
      buffer.come();
      await letGo(page);
      expect(await (await drawn(page)).jsonValue()).toBe("js");
    });

    test("is let go where the view goes before the turn", async ({ page }) => {
      const buffer = await bufferWaits(page);
      await opened(page);
      await named(page, { loader: "pair.gltf" });
      await buffer.underWay;
      await page.evaluate(() => window.dispose());
      buffer.come();
      await letGo(page);
    });

    test("is let go where a pick asked after it was read, and no turn came", async ({ page }) => {
      const buffer = await bufferWaits(page);
      await opened(page);
      const square = page.waitForResponse(/\/wgpu_models\/square\.gltf/);
      await named(page, { loader: "square.gltf", other: "pair.gltf" });
      await (await square).finished();
      await buffer.underWay;
      await settled(page);
      expect(await page.evaluate(() => window.objects.loader.$picks().map(({ node }) => node.objectName)), "a pick of the file read ahead").toEqual(["square"]);
      await page.evaluate(() => {
        window.objects.fog.enabled = true;
        window.flush();
      });
      buffer.come();
      await letGo(page);
    });

    test.describe("wgpu not to be made after the turn", () => {
      test.use({ told: [/^View3D: drawn by the JavaScript renderer, as wgpu could not draw it: /] });

      test("lets go of what was read ahead of it", async ({ page }) => {
        await page.route(/\/wgpu\/ljos_web_3d\.js(\?|$)/, async (route) => {
          const response = await route.fetch();
          await route.fulfill({ response, body: `${await response.text()}\nView3d.create = async () => { window.refused = true; throw new Error("no WebGL 2 to be had"); };\n` });
        });
        await opened(page);
        await named(page, { loader: "pair.gltf" });
        await page.waitForFunction(() => window.refused && document.querySelector(".qq-view3d")?.$view3d?.renderer === "js");
        await letGo(page);
      });
    });

    for (const [what, change] of [
      ["the source changes", () => (window.objects.loader.source = "")],
      ["fog hands the view back", () => (window.objects.fog.enabled = true)],
      ["the view goes", () => window.dispose()],
    ]) {
      test(`is let go where ${what} after the turn, before wgpu has taken it`, async ({ page }) => {
        await makingWaits(page);
        await opened(page);
        await named(page, { loader: "pair.gltf" });
        await page.waitForFunction(() => window.makeNow);
        await page.evaluate(change);
        await page.evaluate(() => window.flush());
        await letGo(page);
        await page.evaluate(() => window.makeNow());
        await settled(page);
      });
    }

    // Each view turns when its own files have settled, and what one took
    // is there still for another that waits.
    test("is fetched once for two views of it, though one turns after the other", async ({ page }) => {
      const asked = await counted(page, /\/wgpu_models\/square\.gltf(\?.*)?$/);
      const buffer = await bufferWaits(page);
      await opened(page, "wgpu_ahead_two");
      await named(page, { first: "square.gltf", second: "square.gltf", apart: "pair.gltf" });
      await buffer.underWay;
      await page.waitForFunction(() => window.objects.first.status === 1);
      buffer.come();
      await page.waitForFunction(() => window.objects.second.status === 1 && window.objects.apart.status === 1);
      expect(asked, "fetches").toEqual({ "square.gltf": 1 });
      await letGo(page);
    });
  });

  // A WebGL 2 short of what wgpu needs fails the view as it is made, as a
  // renderer that traps there does: the JavaScript renderer draws what it
  // can of the scene, is not left for wgpu again, and the page is told why.
  // The same where the view was turned to wgpu for a file and where it began
  // on it, WebGPU having an adapter: and it goes on drawing what moves.
  for (const [how, failure] of [
    ["fails", 'new Error("this WebGL 2 lacks what wgpu needs")'],
    ["traps", 'new WebAssembly.RuntimeError("unreachable")'],
  ]) {
    test.describe(`a renderer that ${how} as its view is first made`, () => {
      // One pattern: Playwright reads an option of two as a value and its
      // options.
      test.use({ told: [/^View3D: (drawn by the JavaScript renderer, as wgpu could not draw it: |the renderer stopped: RuntimeError: unreachable)/] });
      test("draws the view on the JavaScript renderer, where no one asked for wgpu", async ({ page }) => {
        await page.route(/\/wgpu\/ljos_web_3d\.js(\?|$)/, async (route) => {
          const response = await route.fetch();
          await route.fulfill({ response, body: `${await response.text()}\nView3d.create = async () => { window.creations = (window.creations ?? 0) + 1; throw ${failure}; };\n` });
        });
        await page.addInitScript(HIDDEN);
        await page.goto("/?scene=wgpu_beside");
        await page.waitForFunction(() => window.ready);
        await page.evaluate(() => {
          window.objects.loader.source = "scenes/wgpu_models/square.gltf";
          window.flush();
        });
        await page.waitForFunction(() => {
          const state = document.querySelector(".qq-view3d")?.$view3d;
          if (state?.error) throw new Error(state.error);
          return window.creations > 0 && state?.renderer === "js" && state.frames > 0;
        });
        await expect.poll(async () => (await pixels(page, [[50, 150]]))[0], { message: "the model beside the file's" }).toBe("0 0 255");
        expect(await page.evaluate(() => [window.creations, document.querySelectorAll(".qq-view3d").length])).toEqual([1, 1]);
      });

      for (const path of ["turned for a file", "begun on wgpu, WebGPU having an adapter"]) {
        test(`is drawn by the JavaScript renderer and goes on moving, ${path}`, async ({ page }) => {
          await page.route(/\/wgpu\/ljos_web_3d\.js(\?|$)/, async (route) => {
            const response = await route.fetch();
            await route.fulfill({ response, body: `${await response.text()}\nView3d.create = async () => { window.creations = (window.creations ?? 0) + 1; throw ${failure}; };\n` });
          });
          const turns = path === "turned for a file";
          if (turns) await page.addInitScript(HIDDEN);
          else
            await page.addInitScript(() => {
              Object.defineProperty(navigator, "gpu", { configurable: true, value: { requestAdapter: async () => ({}) } });
            });
          await page.goto("/?scene=wgpu_turned_moving");
          await page.waitForFunction(() => window.ready);
          await page.evaluate((file) => {
            window.objects.moving = true;
            if (file) for (const loader of ["first", "second"]) window.objects[loader].source = file;
            window.flush();
          }, turns ? "scenes/wgpu_models/square.gltf" : "");
          await expect.poll(() => page.evaluate(() => window.creations ?? 0), { message: "wgpu was tried" }).toBeGreaterThan(0);
          const states = () => page.evaluate(() => [...document.querySelectorAll(".qq-view3d")].map(({ $view3d }) => [$view3d?.renderer ?? null, $view3d?.frames ?? 0]));
          await expect.poll(async () => (await states()).map(([renderer, frames]) => [renderer, frames > 0])).toEqual([["js", true], ["js", true]]);
          const drawn = (await states()).map(([, frames]) => frames);
          for (const x of [50, 250]) await moves(page, Array.from({ length: 27 }, (_, i) => [x, 20 + i * 10]), `the view at ${x}`);
          const later = await states();
          expect(later.map(([renderer]) => renderer)).toEqual(["js", "js"]);
          later.forEach(([, frames], view) => expect(frames, `view ${view}'s frames`).toBeGreaterThan(drawn[view]));
        });
      }
    });
  }

  // A picture with the square in `column`, and two later ones that each
  // have it somewhere else: a blank one is neither.
  const moves = async (page, column, what) => {
    let last = null;
    for (let picture = 0; picture < 3; picture++) {
      await expect
        .poll(
          async () => {
            const now = (await pixels(page, column)).map((colour) => (colour === "0 0 255" ? "#" : ".")).join("");
            if (!now.includes("#") || now === last) return false;
            last = now;
            return true;
          },
          { message: `${what}'s square, picture ${picture}` },
        )
        .toBe(true);
    }
  };

  // A page whose policy refuses WebAssembly still names it. Such a page has
  // the JavaScript renderer as one without WebAssembly has, and not by way
  // of wgpu's failing: none of the renderer is fetched, and nothing says a
  // fallback was needed. One that asks for wgpu by its address is told why
  // it has none. See docs/LJOS_WEB.md.
  //
  // What begins a view is left to a task of the page's own: what runs inside
  // an evaluate may compile whatever the policy says, and the page's one
  // answer of whether it can would then be the test's. So is waitForFunction
  // left out, which compiles its predicate in the page.
  test.describe("a page whose policy refuses WebAssembly", () => {
    test.use({ told: [/Content Security Policy/i] });
    let fetched = [];
    // What wgpu says when it could not draw a view and the JavaScript
    // renderer took it: `told` lets a line through that names the policy.
    let fellBack = [];
    test.beforeEach(async ({ page }) => {
      fetched = [];
      fellBack = [];
      page.on("request", (request) => WASM.test(request.url()) && fetched.push(request.url()));
      page.on("console", (message) => /^View3D: drawn by the JavaScript renderer/.test(message.text()) && fellBack.push(message.text()));
      await page.route(
        (url) => url.pathname === "/",
        async (route) => {
          const response = await route.fetch();
          await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": "script-src 'self'" } });
        },
      );
      await page.addInitScript(() => {
        window.refusals = 0;
        document.addEventListener("securitypolicyviolation", () => window.refusals++);
      });
    });
    const begun = async (page, address, file = "") => {
      await page.goto(address);
      await expect.poll(() => page.evaluate(() => !!window.ready)).toBe(true);
      await page.evaluate(
        (file) =>
          new Promise((done) =>
            setTimeout(() => {
              window.objects.moving = true;
              if (file) for (const loader of ["first", "second"]) window.objects[loader].source = file;
              window.flush();
              done();
            }),
          ),
        file,
      );
    };
    const refused = (page) =>
      page.evaluate(
        () =>
          new Promise((done) =>
            setTimeout(() => {
              try {
                new WebAssembly.Module(new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]));
                done(false);
              } catch {
                done(true);
              }
            }),
          ),
      );
    const byScript = async (page) => {
      const renderers = () => page.evaluate(() => [...document.querySelectorAll(".qq-view3d")].map(({ $view3d }) => $view3d?.renderer ?? null));
      await expect.poll(renderers).toEqual(["js", "js"]);
      // Long enough for a turn or an early ask to have begun.
      await page.waitForTimeout(2000);
      expect(fetched, "the wgpu renderer's wasm").toEqual([]);
      expect(fellBack, "wgpu's falling back").toEqual([]);
      expect(await renderers()).toEqual(["js", "js"]);
      for (const x of [50, 250]) await moves(page, Array.from({ length: 27 }, (_, i) => [x, 20 + i * 10]), `the view at ${x}`);
      expect(await refused(page), "the policy was in force").toBe(true);
    };
    // After a count of none: what would have been counted is.
    const wouldBeCounted = async (page) => {
      expect(await refused(page), "the policy was in force").toBe(true);
      await expect.poll(() => page.evaluate(() => window.refusals), "a refusal is counted").toBeGreaterThan(0);
    };
    const adapter = (page) =>
      page.addInitScript(() => {
        Object.defineProperty(navigator, "gpu", { configurable: true, value: { requestAdapter: async () => ({}) } });
      });

    test("has the JavaScript renderer, though WebGPU has an adapter", async ({ page }) => {
      await adapter(page);
      await begun(page, "/?scene=wgpu_turned_moving");
      await byScript(page);
    });

    test("keeps it for a scene with a glTF file, where WebGPU has no adapter", async ({ page }) => {
      await page.addInitScript(HIDDEN);
      await begun(page, "/?scene=wgpu_turned_moving", "scenes/wgpu_models/square.gltf");
      await byScript(page);
    });

    for (const gpu of ["an adapter", "no WebGPU"]) {
      test(`has it where the build's default is wgpu, with ${gpu}`, async ({ page }) => {
        let said = 0;
        await page.route(/\/QtQuick3D\/early\.js(\?|$)/, async (route) => {
          const response = await route.fetch();
          const body = (await response.text()).replace(/import\.meta\.env(\?)?\.VITE_LJOS_VIEW3D/g, () => (said++, '"wgpu"'));
          await route.fulfill({ response, body });
        });
        if (gpu === "an adapter") await adapter(page);
        else await page.addInitScript(HIDDEN);
        await begun(page, "/?scene=wgpu_turned_moving");
        expect(said, "the build's default was replaced").toBeGreaterThan(0);
        await byScript(page);
      });
    }

    test("is not asked whether it can by a page that has nothing for wgpu", async ({ page }) => {
      await page.addInitScript(HIDDEN);
      await page.goto("/?scene=wgpu_two");
      await expect.poll(() => page.evaluate(() => [...document.querySelectorAll(".qq-view3d")].some(({ $view3d }) => $view3d?.frames > 0))).toBe(true);
      expect(await page.evaluate(() => window.refusals), "what the policy refused").toBe(0);
      await wouldBeCounted(page);
    });

    // Fog keeps a view on the JavaScript renderer whatever its files are,
    // so a view with fog has no question to ask.
    test("is not asked whether it can by a scene with fog, though it shows a glTF", async ({ page }) => {
      await page.addInitScript(HIDDEN);
      await page.goto("/?scene=fog3dbeside");
      await expect.poll(() => page.evaluate(() => document.querySelector(".qq-view3d")?.$view3d?.frames > 0)).toBe(true);
      // A refusal is reported in a task after the one it was made in.
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => window.refusals), "what the policy refused").toBe(0);
      await wouldBeCounted(page);
    });

    test("is not asked by a page with no 3D, which has WebGPU", async ({ page }) => {
      await adapter(page);
      await page.goto("/?scene=rectangle");
      await expect.poll(() => page.evaluate(() => !!window.ready)).toBe(true);
      expect(await page.evaluate(() => window.refusals), "what the policy refused").toBe(0);
      await wouldBeCounted(page);
    });

    // A build for the JavaScript renderer loads this module with each page,
    // and an application may import it (`ljos-web/early3d-held`): loading it
    // is not asking whether the page can run WebAssembly.
    test("is not asked as the held early ask loads, which has WebGPU", async ({ page }) => {
      await adapter(page);
      await page.goto("/?scene=rectangle");
      await expect.poll(() => page.evaluate(() => !!window.ready)).toBe(true);
      const held = `/@fs${fileURLToPath(new URL("../QtQuick3D/early-held.js", import.meta.url))}`;
      await page.addScriptTag({ url: held, type: "module" });
      // A refusal is reported in a task after the one it was made in.
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => window.refusals), "what the policy refused").toBe(0);
      await wouldBeCounted(page);
    });

    test.describe("asked for wgpu by its address", () => {
      test.use({ told: [/Content Security Policy/i, /^View3D: /] });
      test("says why it cannot", async ({ page }) => {
        await page.addInitScript(HIDDEN);
        await begun(page, "/?scene=wgpu_turned_moving&view3d=wgpu");
        const states = () => page.evaluate(() => [...document.querySelectorAll(".qq-view3d")].map(({ $view3d }) => [$view3d?.renderer === "js", /WebAssembly|wasm/i.test($view3d?.error ?? "")]));
        await expect.poll(states).toEqual([[false, true], [false, true]]);
      });
    });
  });

  // A view turned to wgpu on WebGL 2 has a context and a device of its own,
  // and a scene the JavaScript renderer was drawing. Losing the context, or
  // the renderer trapping, hands it back: the scene is drawn, and what was
  // moving in it goes on moving, as it does where no view turns. What the
  // loss took is that view alone, and no view waits for one that cannot be
  // made. See docs/LJOS_WEB.md.
  test.describe("a turned view that wgpu cannot go on drawing", () => {
    const SQUARE = "scenes/wgpu_models/square.gltf";
    // A column through each view's moving square.
    const COLUMNS = [50, 250].map((x) => Array.from({ length: 27 }, (_, i) => [x, 20 + i * 10]));
    const renderers = (page) =>
      page.evaluate(() => [...document.querySelectorAll(".qq-view3d")].map(({ $view3d }) => $view3d?.renderer ?? null));
    const opened = async (page) => {
      await page.goto("/?scene=wgpu_turned_moving");
      await page.waitForFunction(() => window.ready);
      await page.evaluate(() => {
        window.objects.moving = true;
        window.flush();
      });
    };
    const named = (page, loaders = ["first", "second"]) =>
      page.evaluate(([loaders, file]) => {
        for (const loader of loaders) window.objects[loader].source = file;
        window.flush();
      }, [loaders, SQUARE]);
    const bothTurned = async (page) => {
      await opened(page);
      await named(page);
      await page.waitForFunction(() => {
        const states = [...document.querySelectorAll(".qq-view3d")].map(({ $view3d }) => $view3d);
        return states.length === 2 && states.every((state) => state?.renderer === "wgpu" && state.backend === "webgl2" && state.frames > 0);
      });
    };
    // One picture, and two later ones that each changed, in every view.
    const goesOn = async (page) => {
      for (const [view, column] of COLUMNS.entries()) await moves(page, column, `view ${view}`);
    };
    // What the first WebGL 2 context asked from now of a canvas not there
    // yet is: lost as it is given, or no WebGL 2 context at all, which traps
    // wgpu's own create.
    const spoils = (how) => {
      const there = new Set(document.querySelectorAll(".qq-view3d"));
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...options) {
        if (kind !== "webgl2" || !this.classList.contains("qq-view3d") || there.has(this) || window.contextSpoilt) return get.call(this, kind, ...options);
        window.contextSpoilt = true;
        if (how === "foreign") return {};
        const context = get.call(this, kind, ...options);
        context.getExtension("WEBGL_lose_context").loseContext();
        return context;
      };
    };
    const firstContext = (page, how) => page.addInitScript(spoils, how);
    // Only what a turned view is drawn under asks a loader where its file is
    // at each change of the scene: so a change that has it ask says that
    // this is still there.
    const countsNamed = (page) =>
      page.evaluate(() => {
        const { first } = window.objects;
        const named = first.$named;
        window.namedAsked = 0;
        first.$named = function () {
          window.namedAsked++;
          return named.call(this);
        };
      });
    const askedByAChange = (page) =>
      page.evaluate(() => {
        const { first } = window.objects;
        window.namedAsked = 0;
        first.opacity = first.opacity === 1 ? 0.5 : 1;
        window.flush();
        return window.namedAsked;
      });

    test.describe("whose context is lost", () => {
      test.use({ told: [/^(View3D: drawn by the JavaScript renderer, as wgpu could not draw it: |WebGL: CONTEXT_LOST_WEBGL)/] });

      test("it goes on moving on the JavaScript renderer, and the view beside it on wgpu", async ({ page }) => {
        await page.addInitScript(HIDDEN);
        await bothTurned(page);
        await goesOn(page);
        // The scene changes in the task that loses the context, before the
        // page is told of the loss.
        await page.evaluate(() => {
          document.querySelector(".qq-view3d").getContext("webgl2").getExtension("WEBGL_lose_context").loseContext();
          window.objects.turning.width = 198;
          window.flush();
        });
        await expect.poll(() => renderers(page)).toEqual(["js", "wgpu"]);
        await goesOn(page);
      });

      test("it goes on moving once the JavaScript renderer's own lost context is given back", async ({ page }) => {
        await page.addInitScript(HIDDEN);
        await page.addInitScript(() => {
          const get = OffscreenCanvas.prototype.getContext;
          window.scripted = new Set();
          OffscreenCanvas.prototype.getContext = function (kind, ...options) {
            const context = get.call(this, kind, ...options);
            if (kind === "webgl2" && context && !window.scripted.has(context)) {
              window.scripted.add(context);
              // A task later: after every listener has had it.
              this.addEventListener("webglcontextlost", (event) => setTimeout(() => (context.lossHandled = event.defaultPrevented)));
            }
            return context;
          };
        });
        await bothTurned(page);
        const losing = await page.evaluate(() => {
          window.losers = [...window.scripted].map((context) => context.getExtension("WEBGL_lose_context"));
          for (const loser of window.losers) loser.loseContext();
          for (const canvas of document.querySelectorAll(".qq-view3d")) canvas.getContext("webgl2").getExtension("WEBGL_lose_context").loseContext();
          return window.losers.length;
        });
        expect(losing, "the JavaScript renderer's contexts to lose").toBeGreaterThan(0);
        await expect
          .poll(() => page.evaluate(() => [...window.scripted].map((context) => [context.isContextLost(), context.lossHandled ?? null])), { message: "each lost, and its loss handled" })
          .toEqual(Array(losing).fill([true, true]));
        await expect.poll(() => renderers(page)).toEqual(["js", "js"]);
        await page.evaluate(() => {
          for (const loser of window.losers) loser.restoreContext();
        });
        await goesOn(page);
      });

      test("handed back, what it was drawn under by wgpu has ended", async ({ page }) => {
        await page.addInitScript(HIDDEN);
        await bothTurned(page);
        await countsNamed(page);
        expect(await askedByAChange(page), "asked while it is turned").toBeGreaterThan(0);
        await page.evaluate(() => document.querySelector(".qq-view3d").getContext("webgl2").getExtension("WEBGL_lose_context").loseContext());
        await expect.poll(() => renderers(page)).toEqual(["js", "wgpu"]);
        await expect.poll(() => askedByAChange(page), { message: "asked once it is handed back" }).toBe(0);
        await goesOn(page);
      });
    });

    test.describe("whose context is lost before wgpu has made it", () => {
      // wgpu's own create may refuse such a context or trap on it.
      test.use({ told: [/^(View3D: (drawn by the JavaScript renderer, as wgpu could not draw it: |the renderer stopped: RuntimeError: unreachable|panicked at )|WebGL: CONTEXT_LOST_WEBGL)/] });

      test("it goes on moving on the JavaScript renderer, and the view queued behind it is drawn", async ({ page }) => {
        await page.addInitScript(HIDDEN);
        await firstContext(page, "lost");
        await opened(page);
        await named(page);
        await expect.poll(() => page.evaluate(() => window.contextSpoilt)).toBe(true);
        // Two canvases once no picture of before the turn covers a view.
        await expect
          .poll(async () => {
            const drawing = await renderers(page);
            return [drawing.length, drawing[0]];
          })
          .toEqual([2, "js"]);
        await goesOn(page);
      });
    });

    // The wasm aborts on a panic: what `create` promised is then never
    // settled, and only the page hears the trap, whose stack names the wasm
    // as it was compiled: as it arrived, or from its bytes. A trap there
    // stops no renderer: it is never told as one that did.
    for (const [served, type] of [
      ["", null],
      [", the wasm not said to be wasm", "application/octet-stream"],
    ]) {
      test.describe(`a trap inside wgpu's own create${served}`, () => {
        test.use({
          told: [
            /^View3D: (drawn by the JavaScript renderer, as wgpu could not draw it: |panicked at [^]*canvas context is not a WebGl2RenderingContext)/,
            // The glue's own word as it compiles from the bytes.
            ...(type ? [/^`WebAssembly\.instantiateStreaming` failed because your server does not serve Wasm/] : []),
          ],
        });
        let typed = 0;
        test.beforeEach(async ({ page }) => {
          typed = 0;
          await page.addInitScript(HIDDEN);
          if (!type) return;
          await page.route(WASM, async (route) => {
            typed++;
            const response = await route.fetch();
            await route.fulfill({ response, headers: { ...response.headers(), "content-type": type } });
          });
        });
        const trapped = async (page) => {
          await expect.poll(() => page.evaluate(() => window.contextSpoilt)).toBe(true);
          if (type) expect(typed, "the wasm's type was replaced").toBeGreaterThan(0);
        };

        test("leaves neither the turned view nor the one queued behind it undrawn", async ({ page }) => {
          await firstContext(page, "foreign");
          await opened(page);
          await named(page);
          await trapped(page);
          await expect.poll(() => renderers(page)).toEqual(["js", "js"]);
          await goesOn(page);
        });

        test("leaves neither view undrawn where the page was said to have an adapter", async ({ page }) => {
          // The page is given an adapter and wgpu, asking after, none: the
          // views start on wgpu, and it makes them on WebGL 2.
          await page.addInitScript(() => {
            let asks = 0;
            Object.defineProperty(navigator, "gpu", { configurable: true, value: { requestAdapter: async () => (asks++ ? null : {}) } });
          });
          await firstContext(page, "foreign");
          await opened(page);
          await trapped(page);
          await expect.poll(() => renderers(page)).toEqual(["js", "js"]);
          await goesOn(page);
        });

        test("leaves the view made before it drawing on wgpu, and moving", async ({ page }) => {
          await opened(page);
          await named(page, ["first"]);
          await page.waitForFunction(() => {
            const [turned, beside, ...more] = [...document.querySelectorAll(".qq-view3d")].map(({ $view3d }) => $view3d);
            return !more.length && turned?.renderer === "wgpu" && turned.backend === "webgl2" && turned.frames > 0 && beside?.renderer === "js";
          });
          await goesOn(page);
          await page.evaluate(spoils, "foreign");
          await named(page, ["second"]);
          await trapped(page);
          // Two canvases again once the second's create was given up.
          await expect.poll(() => renderers(page)).toEqual(["wgpu", "js"]);
          await goesOn(page);
        });
      });
    }

    for (const call of ["frame", "build"]) {
      test.describe(`that traps in ${call} after it drew`, () => {
        test.use({ told: [/^View3D: (drawn by the JavaScript renderer, as wgpu could not draw it: |the renderer stopped: RuntimeError: unreachable)/] });

        test("it goes on moving on the JavaScript renderer, as every turned view does", async ({ page }) => {
          await page.route(/\/wgpu\/ljos_web_3d\.js(\?|$)/, async (route) => {
            const response = await route.fetch();
            const trapping = `const called = View3d.prototype.${call};
View3d.prototype.${call} = function (...args) {
  if (window.trapNow) throw new WebAssembly.RuntimeError("unreachable");
  return called.apply(this, args);
};`;
            await route.fulfill({ response, body: `${await response.text()}\n${trapping}\n` });
          });
          await page.addInitScript(HIDDEN);
          await bothTurned(page);
          await page.evaluate(() => {
            window.trapNow = true;
          });
          await expect.poll(() => renderers(page)).toEqual(["js", "js"]);
          await goesOn(page);
        });
      });
    }

    test.describe("that is given no context", () => {
      test.use({ told: [/^View3D: drawn by the JavaScript renderer, as wgpu could not draw it: /] });

      // A guard: a first make that rejects already hands the view back.
      test("it goes on moving on the JavaScript renderer", async ({ page }) => {
        await page.addInitScript(HIDDEN);
        await page.addInitScript(() => {
          const get = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (kind, ...options) {
            if (kind !== "webgl2" || !this.classList.contains("qq-view3d")) return get.call(this, kind, ...options);
            window.contextRefused = true;
            return null;
          };
        });
        await opened(page);
        await named(page);
        await expect.poll(() => page.evaluate(() => window.contextRefused)).toBe(true);
        await expect.poll(() => renderers(page)).toEqual(["js", "js"]);
        await goesOn(page);
      });

      test("handed back, what it was to be drawn under by wgpu has ended", async ({ page }) => {
        await page.addInitScript(HIDDEN);
        await page.addInitScript(() => {
          const get = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (kind, ...options) {
            return kind === "webgl2" && this.classList.contains("qq-view3d") ? null : get.call(this, kind, ...options);
          };
        });
        await opened(page);
        await countsNamed(page);
        await named(page);
        await expect.poll(() => page.evaluate(() => window.namedAsked), { message: "asked as it turned" }).toBeGreaterThan(0);
        await expect.poll(() => renderers(page)).toEqual(["js", "js"]);
        await expect.poll(() => askedByAChange(page), { message: "asked once it is handed back" }).toBe(0);
        await goesOn(page);
      });
    });
  });

  // Each turned view has a context of its own, and a browser keeps only so
  // many at once, letting the oldest go: that may be the one every view on
  // the JavaScript renderer shares. However many turn, a view that moves
  // where none turns moves here. The first of each two asserts nothing of
  // which renderer draws, so that it runs the same where no view turns, and
  // records how many turned. The second is the same and has one turn, so
  // that its passing is not of a page where none did.
  test.describe("several views of files on one page", () => {
    test.use({
      viewport: { width: 640, height: 180 },
      told: [/^(View3D: drawn by the JavaScript renderer, as wgpu could not draw it: |WebGL: CONTEXT_LOST_WEBGL|WARNING: Too many active WebGL contexts)/],
    });

    for (const [count, what, turning] of [[7, "under", false], [7, "under", true], [21, "past", false], [21, "past", true]]) {
      test(`${count}, ${what} the browser's limit on contexts${turning ? ", with views turned" : ""}: every one goes on moving, and none is blank`, async ({ page }, info) => {
        test.setTimeout(120_000);
        await page.addInitScript(HIDDEN);
        await page.addInitScript(() => {
          const get = OffscreenCanvas.prototype.getContext;
          window.scripted = new Set();
          window.scriptedEverLost = 0;
          OffscreenCanvas.prototype.getContext = function (kind, ...options) {
            const context = get.call(this, kind, ...options);
            if (kind === "webgl2" && context && !window.scripted.has(context)) {
              window.scripted.add(context);
              this.addEventListener("webglcontextlost", () => window.scriptedEverLost++);
            }
            return context;
          };
          // Only wgpu takes a view's own canvas for WebGL 2.
          const take = HTMLCanvasElement.prototype.getContext;
          window.everTurned = new Set();
          HTMLCanvasElement.prototype.getContext = function (kind, ...options) {
            const context = take.call(this, kind, ...options);
            if (kind === "webgl2" && context && this.classList.contains("qq-view3d")) window.everTurned.add(this);
            return context;
          };
        });
        await page.goto("/?scene=wgpu_many_moving");
        await page.waitForFunction(() => window.ready);
        await page.evaluate((count) => {
          window.objects.count = count;
          window.objects.moving = true;
          window.objects.file = "scenes/wgpu_models/square.gltf";
          window.flush();
        }, count);
        await page.waitForLoadState("networkidle");
        const turned = () => page.evaluate(() => window.everTurned.size);
        if (turning) await expect.poll(turned, { message: "views that turned", timeout: 60_000 }).toBeGreaterThan(0);
        // Settled once the renderers stay what they are, a second apart.
        let was = null;
        let same = 0;
        await expect
          .poll(
            async () => {
              const now = await page.evaluate(() => JSON.stringify([...document.querySelectorAll(".qq-view3d")].map(({ $view3d }) => [$view3d?.renderer, $view3d?.frames > 0])));
              same = now === was ? same + 1 : 0;
              was = now;
              return same;
            },
            { intervals: [1000], timeout: 60_000 },
          )
          .toBeGreaterThanOrEqual(2);
        for (let view = 0; view <= count; view++) {
          const column = Array.from({ length: 13 }, (_, i) => [(view % 8) * 80 + 40, Math.floor(view / 8) * 60 + i * 4 + 6]);
          await moves(page, column, `view ${view}`);
        }
        info.annotations.push({ type: "views that turned", description: `${await turned()} of ${count}` });
        const scripted = await page.evaluate(() => ({ made: window.scripted.size, everLost: window.scriptedEverLost, lost: [...window.scripted].filter((context) => context.isContextLost()).length }));
        info.annotations.push({ type: "the JavaScript renderer's contexts ever lost", description: String(scripted.everLost) });
        expect(scripted.made, "the JavaScript renderer's contexts").toBeGreaterThan(0);
        expect([scripted.everLost, scripted.lost], "the JavaScript renderer's contexts: ever lost, lost now").toEqual([0, 0]);
      });
    }
  });

  // A first view whose loss is told before it is kept never was: where
  // wgpu then cannot make another, the view has no picture of its own to
  // keep, and is handed back as one wgpu never made. The adapter and that
  // first view are stand-ins, as no browser tells a loss there.
  test.describe("a first view lost before it is kept, that cannot be made again", () => {
    test.use({ told: [/^View3D: drawn by the JavaScript renderer, as wgpu could not draw it: /] });
    test("draws on the JavaScript renderer, where no one asked for wgpu", async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "gpu", { configurable: true, value: { requestAdapter: async () => ({}) } });
      });
      await page.route(/\/wgpu\/ljos_web_3d\.js(\?|$)/, async (route) => {
        const response = await route.fetch();
        const losing = `View3d.create = async (canvas, host) => {
  window.creations = (window.creations ?? 0) + 1;
  if (window.creations > 1) throw new Error("no view to be made again");
  host.lost("the device was lost");
  return { backend: () => "webgpu", free() {}, resize() {}, build() {}, again() {}, frame: () => false };
};`;
        await route.fulfill({ response, body: `${await response.text()}\n${losing}\n` });
      });
      await page.goto("/?scene=shaded3d");
      await page.waitForFunction(() => window.ready);
      await page.waitForFunction(() => {
        const state = document.querySelector(".qq-view3d")?.$view3d;
        if (state?.error) throw new Error(state.error);
        return window.creations === 2 && state?.renderer === "js" && state.frames > 0;
      });
      expect(await page.evaluate(() => document.querySelectorAll(".qq-view3d").length)).toBe(1);
    });
  });

  // A Loader that lets its View3D go while WebGPU is still being asked for
  // an adapter: the answer, no adapter, comes to a view that is gone, and
  // nothing draws on its canvas instead.
  test("a view let go while WebGPU is asked for an adapter is not drawn on the JavaScript renderer after", async ({ page }) => {
    await page.addInitScript(() => {
      let answer;
      const asked = new Promise((resolve) => (answer = resolve));
      window.answerAdapter = () => answer(null);
      window.adapterAsked = 0;
      const gpu = {
        requestAdapter: () => {
          window.adapterAsked++;
          return asked;
        },
        getPreferredCanvasFormat: () => "bgra8unorm",
      };
      Object.defineProperty(Navigator.prototype, "gpu", { get: () => gpu, configurable: true });
      window.papers = [];
      const context = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
        if (kind === "bitmaprenderer") window.papers.push(this);
        return context.call(this, kind, ...rest);
      };
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/?scene=late3d");
    await page.waitForFunction(() => window.ready);
    await page.evaluate(() => {
      window.objects.loader.active = true;
      window.flush();
      window.canvas = document.querySelector(".qq-view3d");
    });
    // Let go once the view is waiting on the answer, not before it asks.
    await page.waitForFunction(() => window.adapterAsked > 0);
    await page.evaluate(() => {
      window.objects.loader.active = false;
      window.flush();
    });
    expect(await page.evaluate(() => [window.canvas?.$view3d?.renderer, window.canvas.isConnected])).toEqual(["wgpu", false]);
    await page.evaluate(async () => {
      window.answerAdapter();
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    });
    expect(await page.evaluate(() => ({ renderer: window.canvas.$view3d.renderer, papers: window.papers.length }))).toEqual({ renderer: "wgpu", papers: 0 });
    expect(errors).toEqual([]);
  });

  test("draws on wgpu where WebGPU has an adapter", async ({ page }) => {
    await page.goto("/?scene=shaded3d");
    await page.waitForFunction(() => window.ready);
    test.skip(!(await page.evaluate(async () => !!(await navigator.gpu?.requestAdapter()))), "WebGPU has no adapter here");
    expect(await (await drawn(page)).jsonValue()).toBe("wgpu");
  });

  // As a browser whose GPU process gave up may: the device is lost, and
  // WebGPU has no adapter after. The canvas keeps WebGPU's context, which
  // the JavaScript renderer cannot draw with.
  test("a view whose GPU is lost and not to be had again draws on the JavaScript renderer instead", async ({ page }) => {
    await page.addInitScript(LOSABLE);
    await page.addInitScript(() => {
      window.adapterGone = false;
      if (!self.GPU) return;
      const ask = GPU.prototype.requestAdapter;
      GPU.prototype.requestAdapter = function (...args) {
        return window.adapterGone ? Promise.resolve(null) : ask.apply(this, args);
      };
    });
    await page.goto("/?scene=shaded3d");
    await page.waitForFunction(() => window.ready);
    test.skip(!(await page.evaluate(async () => !!(await navigator.gpu?.requestAdapter()))), "WebGPU has no adapter here");
    expect(await (await drawn(page)).jsonValue()).toBe("wgpu");
    await page.evaluate(async () => {
      window.canvas = document.querySelector(".qq-view3d");
      window.adapterGone = true;
      await window.loseGpu();
    });
    // Until the view says it failed, or draws on another canvas.
    await page.waitForFunction(() => {
      const state = window.canvas.$view3d;
      if (state.error) throw new Error(state.error);
      const now = document.querySelector(".qq-view3d")?.$view3d;
      return now?.renderer === "js" && now.frames > 0;
    });
    expect(await page.evaluate(() => [document.querySelectorAll(".qq-view3d").length, window.canvas.isConnected])).toEqual([1, false]);
    const [r, g, b] = (await pixels(page, [[50, 60]]))[0].split(" ").map(Number);
    expect([r, g, b], "the model, not the window's colour").not.toEqual(CLEAR);
  });

  // A device lost while its view is made is a loss as any other: the view
  // is made again and draws. Chrome tells the loss in a task of its own,
  // after the view is kept.
  test("a view whose device is lost while it is made is made again, and draws", async ({ page }) => {
    await page.addInitScript(LOSABLE);
    await page.addInitScript(() => {
      window.loseWhileMade = 0;
      if (!self.GPUAdapter) return;
      const ask = GPUAdapter.prototype.requestDevice;
      GPUAdapter.prototype.requestDevice = async function (...args) {
        const device = await ask.apply(this, args);
        if (window.loseWhileMade && window.loseWhileMade--) device.destroy();
        return device;
      };
    });
    await page.goto("/?scene=shaded3d");
    await page.waitForFunction(() => window.ready);
    test.skip(!(await page.evaluate(async () => !!(await navigator.gpu?.requestAdapter()))), "WebGPU has no adapter here");
    expect(await (await drawn(page)).jsonValue()).toBe("wgpu");
    await page.evaluate(async () => {
      window.frames = document.querySelector(".qq-view3d").$view3d.frames;
      window.loseWhileMade = 1;
      await window.loseGpu();
    });
    // Drawn again, on a device not lost.
    await page.waitForFunction(() => {
      const state = document.querySelector(".qq-view3d").$view3d;
      if (state.error) throw new Error(state.error);
      return state.lost === 2 && window.gpuDevices.at(-1).lost === false && state.frames > window.frames;
    });
    expect(await page.evaluate(RENDERERS)).toEqual([{ renderer: "wgpu", lost: 2, error: null }]);
  });

  // A loss told before the view is kept: wgpu asks `device.lost` once the
  // device is made, and one already lost whose `then` answers at once tells
  // it inside the call that makes the view, before that call returns to
  // the page. That view is never kept: it is made again and draws, and
  // does not stay on the lost device.
  test("a view whose device's loss is told before the view is kept is made again, and draws", async ({ page }) => {
    await page.addInitScript(LOSABLE);
    await page.addInitScript(() => {
      window.toldAtOnce = 0;
      if (!self.GPUAdapter) return;
      const ask = GPUAdapter.prototype.requestDevice;
      GPUAdapter.prototype.requestDevice = async function (...args) {
        const device = await ask.apply(this, args);
        if (!(window.toldAtOnce && window.toldAtOnce--)) return device;
        device.destroy();
        const info = await device.lost;
        Object.defineProperty(device, "lost", {
          value: {
            then(told) {
              told(info);
              return this;
            },
          },
        });
        return device;
      };
    });
    await page.goto("/?scene=shaded3d");
    await page.waitForFunction(() => window.ready);
    test.skip(!(await page.evaluate(async () => !!(await navigator.gpu?.requestAdapter()))), "WebGPU has no adapter here");
    expect(await (await drawn(page)).jsonValue()).toBe("wgpu");
    await page.evaluate(async () => {
      window.frames = document.querySelector(".qq-view3d").$view3d.frames;
      window.toldAtOnce = 1;
      await window.loseGpu();
    });
    // Drawn again, on a device not lost: the first remaking's device was
    // lost before its view was kept, so the view was made a second time.
    await page.waitForFunction(() => {
      const state = document.querySelector(".qq-view3d").$view3d;
      if (state.error) throw new Error(state.error);
      return state.lost === 2 && window.gpuDevices.at(-1).lost === false && state.frames > window.frames;
    });
    expect(await page.evaluate(RENDERERS)).toEqual([{ renderer: "wgpu", lost: 2, error: null }]);
  });

  // A loss told once the view is kept but before Solid flushed that, in a
  // microtask queued as the view was made: the kept view is read without
  // waiting on the flush, so the loss is acted on and not put off with no
  // make left to act on it. No browser tells a loss there today; the host's
  // `lost` is called by hand to reach it.
  test("a view whose device's loss is told before its keeping is flushed is made again, and draws", async ({ page }) => {
    await page.addInitScript(LOSABLE);
    await page.goto("/?scene=shaded3d");
    await page.waitForFunction(() => window.ready);
    test.skip(!(await page.evaluate(async () => !!(await navigator.gpu?.requestAdapter()))), "WebGPU has no adapter here");
    expect(await (await drawn(page)).jsonValue()).toBe("wgpu");
    await page.evaluate(async () => {
      const address = performance.getEntriesByType("resource").find(({ name }) => /\/wgpu\/ljos_web_3d\.js/.test(name)).name;
      const { View3d } = await import(address);
      const create = View3d.create;
      View3d.create = function (canvas, host) {
        window.host = host;
        return create.call(this, canvas, host);
      };
      // `backend` is asked just before the view is kept, in the same task:
      // what it queues runs after `setMade`, ahead of the flush it queued.
      const backend = View3d.prototype.backend;
      window.tellAfterKept = 0;
      View3d.prototype.backend = function (...args) {
        if (window.tellAfterKept && window.tellAfterKept--) {
          const host = window.host;
          // Told by hand, the device itself not destroyed: its own loss
          // would come later and be told again.
          queueMicrotask(() => host.lost("the device was lost"));
        }
        return backend.apply(this, args);
      };
      window.frames = document.querySelector(".qq-view3d").$view3d.frames;
      window.tellAfterKept = 1;
      await window.loseGpu();
    });
    // Made a third time, and it draws: the second view was told its loss
    // once it was kept, and never drew. On the same device, as the page
    // shares one and that one was not really lost.
    await page.waitForFunction(() => {
      const state = document.querySelector(".qq-view3d").$view3d;
      if (state.error) throw new Error(state.error);
      return state.lost === 2 && state.frames > window.frames;
    });
    expect(await page.evaluate(RENDERERS)).toEqual([{ renderer: "wgpu", lost: 2, error: null }]);
  });

  // A view let go once it is kept but before Solid flushed that, in a
  // microtask queued as the view was made: it is freed, as ending reads the
  // kept view without waiting on the flush.
  test("a view let go before its keeping is flushed is freed", async ({ page }) => {
    await page.addInitScript(LOSABLE);
    await page.goto("/?scene=shaded3d");
    await page.waitForFunction(() => window.ready);
    test.skip(!(await page.evaluate(async () => !!(await navigator.gpu?.requestAdapter()))), "WebGPU has no adapter here");
    expect(await (await drawn(page)).jsonValue()).toBe("wgpu");
    await page.evaluate(async () => {
      const address = performance.getEntriesByType("resource").find(({ name }) => /\/wgpu\/ljos_web_3d\.js/.test(name)).name;
      const { View3d } = await import(address);
      const { backend, free } = View3d.prototype;
      window.frees = 0;
      View3d.prototype.free = function (...args) {
        window.frees++;
        return free.apply(this, args);
      };
      window.letGo = false;
      // `backend` is asked just before the view is kept, in the same task.
      View3d.prototype.backend = function (...args) {
        queueMicrotask(() => {
          window.dispose();
          window.letGo = true;
        });
        return backend.apply(this, args);
      };
      await window.loseGpu();
    });
    await page.waitForFunction(() => window.letGo);
    // The lost view, and the one that took its place.
    await expect.poll(() => page.evaluate(() => window.frees)).toBe(2);
  });

  // A GPU that keeps dying is given up for the page, at the fourth loss
  // within a minute: every view draws on the JavaScript renderer.
  const twoOnWgpu = async (page) => {
    await page.addInitScript(LOSABLE);
    await page.goto("/?scene=wgpu_two");
    await page.waitForFunction(() => window.ready);
    test.skip(!(await page.evaluate(async () => !!(await navigator.gpu?.requestAdapter()))), "WebGPU has no adapter here");
    await page.waitForFunction(() => {
      const views = [...document.querySelectorAll(".qq-view3d")];
      return views.length === 2 && views.every(({ $view3d: state }) => state.renderer === "wgpu" && state.frames > 0);
    });
  };
  const drawingOnScript = (page) =>
    page.waitForFunction(() => {
      const views = [...document.querySelectorAll(".qq-view3d")];
      return views.length === 2 && views.every(({ $view3d: state }) => state.renderer === "js" && state.frames > 0);
    });

  test("views whose GPU is lost too often draw on the JavaScript renderer instead", async ({ page }) => {
    await twoOnWgpu(page);
    for (let time = 0; time < 4; time++) await page.evaluate(LOST_AND_SETTLED);
    await drawingOnScript(page);
    const drawing = { renderer: "js", lost: 0, error: null };
    expect(await page.evaluate(RENDERERS)).toEqual([drawing, drawing]);
  });

  // The losses are the page's, not a view's: one made after some of them
  // gives up with the rest, and so does one made after, so no view shows a
  // picture one on the other renderer drew.
  test("a view made between losses of the GPU gives up with the others, and one made after draws on the JavaScript renderer", async ({ page }) => {
    await twoOnWgpu(page);
    const remade = async () => {
      await page.evaluate(() => (window.objects.second.active = false));
      await page.evaluate(() => (window.objects.second.active = true));
      await page.waitForFunction(() => {
        const views = [...document.querySelectorAll(".qq-view3d")];
        return views.length === 2 && views.every(({ $view3d: state }) => state.error || state.frames > 0);
      });
    };
    await page.evaluate(LOST_AND_SETTLED);
    await remade();
    for (let time = 0; time < 3; time++) await page.evaluate(LOST_AND_SETTLED);
    await drawingOnScript(page);
    await remade();
    await drawingOnScript(page);
    expect((await page.evaluate(RENDERERS)).map(({ renderer }) => renderer)).toEqual(["js", "js"]);
  });

  // WebGPU found to have no adapter after a loss by one view made again is
  // given up for the page then: a view already made again on wgpu goes to
  // the JavaScript renderer with it, without waiting to be lost or made
  // again.
  test("a view already made again on wgpu goes to the JavaScript renderer when another finds no adapter after", async ({ page }) => {
    await page.addInitScript(() => {
      window.adapterGone = false;
      // The answer of no adapter waits to be let go, so the first view is
      // seen made again on wgpu before WebGPU is given up.
      window.noAdapter = new Promise((done) => (window.letNoAdapterGo = () => done(null)));
      if (!self.GPU) return;
      const ask = GPU.prototype.requestAdapter;
      GPU.prototype.requestAdapter = function (...args) {
        return window.adapterGone ? window.noAdapter : ask.apply(this, args);
      };
    });
    await twoOnWgpu(page);
    // The second view, made again after the first, finds no adapter.
    await page.evaluate(() => {
      const [first, second] = document.querySelectorAll(".qq-view3d");
      window.first = { canvas: first, frames: first.$view3d.frames };
      second.getContext = () => {
        window.adapterGone = true;
        return null;
      };
    });
    await page.evaluate(() => window.loseGpu());
    await page.waitForFunction(() => window.adapterGone);
    await page.waitForFunction(() => {
      const { canvas, frames } = window.first;
      const state = canvas.$view3d;
      return state.renderer === "wgpu" && state.lost === 1 && state.frames > frames;
    });
    expect(await page.evaluate(() => window.first.canvas.isConnected)).toBe(true);
    await page.evaluate(() => window.letNoAdapterGo());
    await drawingOnScript(page);
    const drawing = { renderer: "js", lost: 0, error: null };
    expect(await page.evaluate(RENDERERS)).toEqual([drawing, drawing]);
  });

  // WebGPU found to have no adapter after a loss is given up for the page
  // though the view that found it was let go meanwhile: the others go to
  // the JavaScript renderer all the same.
  test("views go to the JavaScript renderer when one let go while made again finds no adapter after", async ({ page }) => {
    await page.addInitScript(() => {
      window.adapterGone = false;
      window.noAdapter = new Promise((done) => (window.letNoAdapterGo = () => done(null)));
      if (!self.GPU) return;
      const ask = GPU.prototype.requestAdapter;
      GPU.prototype.requestAdapter = function (...args) {
        return window.adapterGone ? window.noAdapter : ask.apply(this, args);
      };
    });
    await twoOnWgpu(page);
    await page.evaluate(() => {
      const [first, second] = document.querySelectorAll(".qq-view3d");
      window.first = { canvas: first, frames: first.$view3d.frames };
      second.getContext = () => {
        window.adapterGone = true;
        return null;
      };
    });
    await page.evaluate(() => window.loseGpu());
    await page.waitForFunction(() => window.adapterGone);
    // The second view is let go while it asks whether WebGPU has an adapter.
    await page.evaluate(() => (window.objects.second.active = false));
    await page.waitForFunction(() => {
      const { canvas, frames } = window.first;
      const state = canvas.$view3d;
      return document.querySelectorAll(".qq-view3d").length === 1 && state.renderer === "wgpu" && state.lost === 1 && state.frames > frames;
    });
    await page.evaluate(() => window.letNoAdapterGo());
    await page.waitForFunction(() => {
      const views = [...document.querySelectorAll(".qq-view3d")];
      return views.length === 1 && views[0].$view3d.renderer === "js" && views[0].$view3d.frames > 0;
    });
    expect(await page.evaluate(RENDERERS)).toEqual([{ renderer: "js", lost: 0, error: null }]);
  });

  // A view made again after a loss that fails for a reason of its own,
  // where WebGPU still has an adapter, says why it stopped; the page keeps
  // WebGPU, and the other view draws on wgpu as before.
  test.describe("a view that fails of itself after a loss", () => {
    test.use({ told: [/^View3D: (?!the GPU was lost)/] });

    test("a view made again after a loss that fails for a reason of its own stops alone, and the page keeps WebGPU", async ({ page }) => {
      await twoOnWgpu(page);
      await page.evaluate(() => (document.querySelectorAll(".qq-view3d")[1].getContext = () => null));
      await page.evaluate(LOST_AND_SETTLED);
      const [first, second] = await page.evaluate(RENDERERS);
      expect(first).toEqual({ renderer: "wgpu", lost: 1, error: null });
      expect(second.renderer).toBe("wgpu");
      expect(second.error).toBeTruthy();
      expect(second.error).not.toBe("the GPU was lost, and none is to be had again");
    });
  });
});

test("a page whose View3D draws on wgpu asks for the renderer before its first view is made", async ({ page }) => {
  await page.addInitScript(MARK_FIRST_VIEW);
  await page.goto("/?scene=wgpu_two&view3d=wgpu");
  await page.waitForFunction(() => window.ready);
  await page.waitForFunction(() => {
    const views = [...document.querySelectorAll(".qq-view3d")];
    return views.length === 2 && views.every(({ $view3d }) => $view3d.frames > 0);
  });
  const { made, asked } = await madeAndAsked(page, WASM);
  expect(made).not.toBeNull();
  expect(asked).toBeLessThan(made);
});

test("the first view's moment is when it is put in, so an ask in the same task after it comes after it", async ({ page }) => {
  await page.addInitScript(MARK_FIRST_VIEW);
  await page.goto("/?scene=rectangle");
  await page.waitForFunction(() => window.ready);
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.className = "qq-view3d";
    document.body.append(canvas);
    await fetch("/?asked=after");
  });
  const { made, asked } = await madeAndAsked(page, /\?asked=after$/);
  expect(made).not.toBeNull();
  expect(asked).toBeGreaterThanOrEqual(made);
});

test("a page that holds a document drawing in space, and does not make it, fetches none of the renderer on wgpu", async ({ page }) => {
  const fetched = [];
  page.on("request", (request) => fetched.push(request.url()));
  await page.goto("/?scene=wgpu_held&view3d=wgpu");
  await page.waitForFunction(() => window.ready);
  await page.waitForTimeout(100);
  expect(fetched.filter((url) => WASM.test(url))).toEqual([]);
});

// qmlc starts a singleton's component as `function Name$component(`, not
// as a document's `export default function Name(`. Its own View3D fetches
// the renderer as it is made either way, so what is read is what the
// server compiled.
test("a singleton that draws in space asks for the renderer first thing as it is made", async ({ page }) => {
  await page.goto("/?scene=wgpu_singleton&view3d=wgpu");
  await page.waitForFunction(() => window.ready);
  const compiled = await page.evaluate(async () => {
    const entry = performance.getEntriesByType("resource").find(({ name }) => /\/Space3D\.qml(?:\?|$)/.test(name));
    return entry ? (await fetch(entry.name)).text() : null;
  });
  expect(compiled).toMatch(/function Space3D\$component\(\$props\)\s*\{\s*\$\$early3d\(\);/);
});

test("a page whose View3D is in a document inside its own, on wgpu, asks for the renderer before its first view is made", async ({ page }) => {
  await page.addInitScript(MARK_FIRST_VIEW);
  await page.goto("/?scene=wgpu_nested&view3d=wgpu");
  await page.waitForFunction(() => window.ready);
  await page.waitForFunction(() => document.querySelector(".qq-view3d")?.$view3d?.frames > 0);
  const { made, asked } = await madeAndAsked(page, WASM);
  expect(made).not.toBeNull();
  expect(asked).toBeLessThan(made);
});

test("a page that names View3D through its module's name, on wgpu, asks for the renderer before its first view is made", async ({ page }) => {
  await page.addInitScript(MARK_FIRST_VIEW);
  await page.goto("/?scene=wgpu_named&view3d=wgpu");
  await page.waitForFunction(() => window.ready);
  await page.waitForFunction(() => document.querySelector(".qq-view3d")?.$view3d?.frames > 0);
  const { made, asked } = await madeAndAsked(page, WASM);
  expect(made).not.toBeNull();
  expect(asked).toBeLessThan(made);
});

test("a page whose View3D draws on wgpu fetches the renderer once, however late the page's own ask arrives", async ({ page }) => {
  // The first view's chunk is there before the page's own ask has compiled,
  // so it is the first view that waits for that ask and not one of its own.
  let asked = 0;
  await page.route(WASM, async (route) => {
    asked += 1;
    if (asked === 1) await new Promise((arrived) => setTimeout(arrived, 1500));
    await route.fallback();
  });
  await page.goto("/?scene=wgpu_two&view3d=wgpu");
  await page.waitForFunction(() => window.ready);
  await page.waitForFunction(() => {
    const views = [...document.querySelectorAll(".qq-view3d")];
    return views.length === 2 && views.every(({ $view3d }) => $view3d.frames > 0);
  });
  expect(asked).toBe(1);
});

test("a page of graphs in the plane on wgpu fetches none of the renderer, though its module has the 3D graphs", async ({ page }) => {
  const fetched = [];
  page.on("request", (request) => fetched.push(request.url()));
  await page.goto("/?scene=graphbars&view3d=wgpu");
  await page.waitForFunction(() => window.ready);
  await page.waitForTimeout(100);
  expect(fetched.filter((url) => WASM.test(url))).toEqual([]);
});

test("a page of graphs in space on wgpu asks for the renderer before its first graph is made", async ({ page }) => {
  await page.addInitScript(MARK_FIRST_VIEW);
  await page.goto("/?scene=graph3dbars&view3d=wgpu");
  await page.waitForFunction(() => window.ready);
  await page.waitForFunction(() => [...document.querySelectorAll(".qq-view3d")].some(({ $view3d }) => $view3d?.frames > 0));
  const { made, asked } = await madeAndAsked(page, WASM);
  expect(made).not.toBeNull();
  expect(asked).toBeLessThan(made);
});

test("a page whose View3D draws on wgpu fetches the renderer once, though a server says it is not wasm", async ({ page }) => {
  let asked = 0;
  await page.route(WASM, async (route) => {
    asked += 1;
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), "content-type": "application/octet-stream" } });
  });
  await page.goto("/?scene=wgpu_two&view3d=wgpu");
  await page.waitForFunction(() => window.ready);
  await page.waitForFunction(() => {
    const views = [...document.querySelectorAll(".qq-view3d")];
    return views.length === 2 && views.every(({ $view3d }) => $view3d.frames > 0);
  });
  expect(asked).toBe(1);
});

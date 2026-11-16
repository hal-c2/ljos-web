// The front page's 3D scene keeps moving on its own while a reader
// looks at it: brought on screen once, then left alone, with no wheel,
// drag or scroll, it draws frame after frame and its picture changes.
// It stops where nobody sees it (scrolled away, or its tab hidden) and
// goes on when it is back. Asking for less motion slows it; it never
// stands still. Once on each renderer: the JavaScript one and wgpu
// (which draws on WebGL 2 where there is no WebGPU), each asked for by
// the page's address.
import { expect, open, test } from "./fixtures.js";

const showcase = (page) => page.locator("#app div.qq-text").filter({ hasText: /^See it run$/ }).first();
const scene = (page) => page.locator("canvas.qq-view3d").first();

// Without input any frame is the scene moving; how many there are is
// the machine's: a software renderer under load rests after each slow
// picture (View3D's SLOW/REST) and draws a few a second.
const WINDOW = 2_500;
// What a stopped view may still draw: the one picture it was resting
// before, at most a slow picture's time and its rest.
const SETTLE = 2_500;

// Frames the view drew over `ms`, counted in the page, while the test
// does nothing at all.
function framesOver(page, ms) {
  return scene(page).evaluate(
    (canvas, ms) =>
      new Promise((resolve) => {
        const from = canvas.$view3d.frames;
        setTimeout(() => resolve(canvas.$view3d.frames - from), ms);
      }),
    ms,
  );
}

// The one scroll a reader makes to the showcase; nothing after it.
async function reach(page, route) {
  await open(page, route);
  await showcase(page).evaluate((element) => element.scrollIntoView({ block: "start" }));
  await expect(scene(page), "the scene is made once it is on screen").toBeAttached({ timeout: 30_000 });
  await expect.poll(() => scene(page).evaluate((canvas) => canvas.$view3d?.frames ?? 0), { message: "the scene draws", timeout: 30_000 }).toBeGreaterThan(0);
}

// The scene's clock: Orbit's `turn`, read from the View3D the canvas
// draws. It runs from 55 to 415 and round again.
const turnOf = (page) => scene(page).evaluate((canvas) => canvas.$view3d.view.parent.turn);
// How far the clock went on from `from` to `to`, round a wrap.
const onFrom = (from, to) => (((to - from) % 360) + 360) % 360;

// The page's tab, hidden and shown again, as the browser says it.
function showTab(page, shown) {
  return page.evaluate((shown) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (shown ? "visible" : "hidden") });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => !shown });
    document.dispatchEvent(new Event("visibilitychange"));
  }, shown);
}

for (const renderer of ["js", "wgpu"]) {
  test.describe(`on the ${renderer} renderer`, () => {
    test.beforeEach(({ wasm }) => {
      test.skip(renderer === "wgpu" && !wasm, "wgpu is WebAssembly; without it the page draws with the JavaScript renderer");
    });
    const route = `/?view3d=${renderer}`;

    test("the scene moves on its own, with no input", async ({ page }) => {
      await reach(page, route);
      expect(await scene(page).evaluate((canvas) => canvas.$view3d.renderer), "the renderer the address asked for").toBe(renderer);
      // Twice, a second apart: a scene that moved once and stopped
      // does not pass on that.
      expect(await framesOver(page, WINDOW), "frames are drawn while nobody touches the page").toBeGreaterThan(0);
      expect(await framesOver(page, WINDOW), "and go on being drawn").toBeGreaterThan(0);
      const before = await scene(page).screenshot();
      await expect.poll(async () => Buffer.compare(before, await scene(page).screenshot()) !== 0, { message: "the picture changes" }).toBe(true);
    });

    test("with less motion asked for, the scene still moves", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await reach(page, route);
      expect(await framesOver(page, WINDOW), "frames are drawn while nobody touches the page").toBeGreaterThan(0);
    });

    test("scrolled away it stops, and back on screen it goes on", async ({ page }) => {
      await reach(page, route);
      expect(await framesOver(page, WINDOW), "drawn on screen").toBeGreaterThan(0);
      // A wheel at the page's margin, where no example takes it, back
      // to the top.
      await page.mouse.move(16, 450);
      await expect(async () => {
        await page.mouse.wheel(0, -4000);
        await expect(scene(page)).not.toBeInViewport({ timeout: 500 });
      }, "the scene is scrolled off screen").toPass();
      await page.waitForTimeout(SETTLE);
      expect(await framesOver(page, WINDOW), "nothing is drawn off screen").toBe(0);
      await showcase(page).evaluate((element) => element.scrollIntoView({ block: "start" }));
      await expect.poll(() => framesOver(page, WINDOW), { message: "drawn again once back" }).toBeGreaterThan(0);
    });

    test("in a hidden tab it stops, and shown again it goes on from where it was", async ({ page }) => {
      await reach(page, route);
      expect(await framesOver(page, WINDOW), "drawn on screen").toBeGreaterThan(0);
      await expect.poll(async () => onFrom(55, await turnOf(page)), { message: "the scene turns from its opening pose" }).toBeGreaterThan(20);
      await showTab(page, false);
      await page.waitForTimeout(SETTLE);
      expect(await framesOver(page, WINDOW), "nothing is drawn while the tab is hidden").toBe(0);
      const held = await turnOf(page);
      await page.waitForTimeout(1_000);
      expect(await turnOf(page), "hidden, the scene's clock holds still").toBe(held);
      await showTab(page, true);
      await expect.poll(() => framesOver(page, WINDOW), { message: "drawn again once shown" }).toBeGreaterThan(0);
      // Paused, not stopped: a stopped animation starts again from
      // `from` (55), a snap back a reader sees. Shown again, the clock
      // goes on forward from where it held, by the little time since.
      const after = await turnOf(page);
      expect(onFrom(held, after), "shown again, the scene goes on from where it was, not back at its start").toBeLessThan(90);
      expect(onFrom(held, after), "and it goes on").toBeGreaterThan(0);
    });
  });
}

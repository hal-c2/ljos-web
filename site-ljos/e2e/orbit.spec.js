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
// picture (`paced` in QtQuick3D/wgpu.js) and draws a few a second.
const WINDOW = 2_500;
// What a stopped view may still draw: the one picture it was resting
// before, at most a slow picture's time and its rest.
const SETTLE = 2_500;

// Frames the view drew over `ms`, counted in the page, while the test
// does nothing at all.
async function framesOver(page, ms) {
  const frames = await scene(page).evaluate(
    (canvas, ms) =>
      new Promise((resolve) => {
        const from = canvas.$view3d.frames;
        setTimeout(() => resolve(canvas.$view3d.frames - from), ms);
      }),
    ms,
  );
  saw(`${frames} frames over ${ms} ms`);
  return frames;
}

// The one scroll a reader makes to the showcase; nothing after it. The
// view keeps how long its last pictures took to draw, for a test that
// fails to say.
async function reach(page, route) {
  await open(page, route);
  await showcase(page).evaluate((element) => element.scrollIntoView({ block: "start" }));
  await expect(scene(page), "the scene is made once it is on screen").toBeAttached({ timeout: 30_000 });
  await scene(page).evaluate((canvas) => {
    const drawn = (canvas.$drawnTimes = []);
    canvas.$view3d.probe = (kind, from, to) => {
      if (kind !== "draw") return;
      drawn.push([Math.round(from), Math.round(to - from)]);
      if (drawn.length > 12) drawn.shift();
    };
  });
  await expect.poll(() => scene(page).evaluate((canvas) => canvas.$view3d?.frames ?? 0), { message: "the scene draws", timeout: 30_000 }).toBeGreaterThan(0);
}

// What the test saw, in order, as it saw it: a test that runs out of time
// says what it was waiting for and how long each look took.
let seen = [];
const saw = (what) => seen.push(`${(performance.now() / 1000).toFixed(1)} s: ${what}`);
test.beforeEach(() => {
  seen = [];
});
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  // A page kept busy may not answer: what it says is read for 5 s at most.
  const view = await Promise.race([
    scene(page)
      .evaluate((canvas) => {
        const now = performance.now();
        const view = canvas.$view3d;
        const drawn = (canvas.$drawnTimes ?? []).map(([from, took]) => `${took} ms, ${Math.round(now - from)} ms ago`);
        return `${view?.renderer} on ${view?.backend}: ${view?.frames} frames, turn ${view?.view.parent.turn?.toFixed(1)}°, error ${view?.error}; last pictures took ${drawn.join("; ") || "none"}`;
      })
      .catch((error) => `not read: ${error.message.split("\n")[0]}`),
    new Promise((done) => setTimeout(() => done("the page did not answer in 5 s"), 5_000)),
  ]);
  const body = [...seen, `the view: ${view}`].join("\n");
  await testInfo.attach("what it saw", { body, contentType: "text/plain" });
  // The report shows an attachment's first lines only.
  console.error(`${testInfo.titlePath.join(" › ")}: what it saw\n${body}`);
});

// The scene's picture, with how long it took to take and what the view had
// drawn by then.
async function shot(page) {
  const from = performance.now();
  const picture = await scene(page).screenshot();
  const [frames, turn] = await scene(page).evaluate((canvas) => [canvas.$view3d.frames, canvas.$view3d.view.parent.turn]);
  saw(`a picture taken in ${Math.round(performance.now() - from)} ms, at ${frames} frames, turn ${turn.toFixed(1)}°`);
  return picture;
}

// The scene's clock: Orbit's `turn`, read from the View3D the canvas
// draws. It runs from 55 to 415 and round again, at most this fast
// (degrees a second, Orbit's `pace` with no preference).
const turnOf = (page) => scene(page).evaluate((canvas) => canvas.$view3d.view.parent.turn);
const FASTEST = 360 / 26;
// How far the clock went on from `from` to `to`, round a wrap.
const onFrom = (from, to) => (((to - from) % 360) + 360) % 360;
// The clock, and how long ago in the page's own time `since` was.
const turnSince = (page, since) => scene(page).evaluate((canvas, since) => [canvas.$view3d.view.parent.turn, (performance.now() - since) / 1000], since);

// The page's tab, hidden and shown again, as the browser says it; when
// it was, in the page's own time.
function showTab(page, shown) {
  return page.evaluate((shown) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (shown ? "visible" : "hidden") });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => !shown });
    document.dispatchEvent(new Event("visibilitychange"));
    return performance.now();
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
      const before = await shot(page);
      await expect.poll(async () => Buffer.compare(before, await shot(page)) !== 0, { message: "the picture changes" }).toBe(true);
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
      // Held in the first half of its turn, so a restart at 55 lands
      // more than half a turn ahead and the bound below refuses it.
      // Read past halfway, it waits for the wrap: up to one 26 s turn.
      await expect
        .poll(
          async () => {
            const went = onFrom(55, await turnOf(page));
            return went > 20 && went < 180;
          },
          { message: "the scene turns from its opening pose, in the first half of its turn", timeout: 41_000 },
        )
        .toBe(true);
      await showTab(page, false);
      await page.waitForTimeout(SETTLE);
      expect(await framesOver(page, WINDOW), "nothing is drawn while the tab is hidden").toBe(0);
      const held = await turnOf(page);
      await page.waitForTimeout(1_000);
      expect(await turnOf(page), "hidden, the scene's clock holds still").toBe(held);
      const shown = await showTab(page, true);
      // Paused, not stopped: a stopped animation starts again from
      // `from` (55), a snap back a reader sees. Shown again, the clock
      // goes on forward from where it held, by no more than the time
      // since it was shown: a slow first frame on a software renderer
      // is time passing, and a snap back is most of a turn more.
      await expect.poll(async () => onFrom(held, await turnOf(page)), { message: "shown again, the clock goes on" }).toBeGreaterThan(0);
      const [turn, seconds] = await turnSince(page, shown);
      const went = onFrom(held, turn);
      expect(
        went,
        `shown again, the scene goes on from where it was, not back at its start: held at ${held.toFixed(1)}°, now ${turn.toFixed(1)}°, ` +
          `${went.toFixed(1)}° on in the ${seconds.toFixed(2)} s since it was shown, where its pace allows ${(FASTEST * seconds).toFixed(1)}°`,
      ).toBeLessThanOrEqual(FASTEST * seconds + 1);
      await expect.poll(() => framesOver(page, WINDOW), { message: "drawn again once shown" }).toBeGreaterThan(0);
    });
  });
}

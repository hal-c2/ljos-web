// The 3D scenes keep moving on their own while a reader looks at them:
// the front page's watch on its turntable and Orbit on /demos/. Brought
// on screen once, then left alone, with no wheel, drag or scroll, each
// draws frame after frame and its picture changes. It stops where nobody
// sees it (scrolled away, or its tab hidden) and goes on when it is
// back, from where it held. Asking for less motion slows it; it never
// stands still. Once on each renderer: the JavaScript one and wgpu
// (which draws on WebGL 2 where there is no WebGPU), each asked for by
// the page's address.
import { animationFrames, expect, open, press, runButton, test } from "./fixtures.js";

// Each scene's clock is a property of the item its View3D stands in
// (`canvas.$view3d.view.parent`), with `turning` beside it: Orbit's
// `turn`, 55 to 415, and the watch's turntable's `spin`, from 0. `fastest`
// is its pace with no preference, degrees a second.
const SCENES = [
  { name: "the front page's watch", route: "/", heading: "See it run", run: "Run the watch", clock: "spin", start: 0, fastest: 360 / 24 },
  { name: "Orbit", route: "/demos/", heading: "3D you can orbit", run: "Run the 3D demo", clock: "turn", start: 55, fastest: 360 / 26 },
];

for (const at of SCENES) {
  test.describe(at.name, () => {
    const showcase = (page) =>
      page
        .locator("#app div.qq-text")
        .filter({ hasText: new RegExp(`^${at.heading}$`) })
        .first();
    const scene = (page) => page.locator("canvas.qq-view3d").first();

    // Without input any frame is the scene moving; how many there are a
    // second is the machine's: a software renderer under load rests after each
    // slow picture (`paced` in QtQuick3D/wgpu.js) and draws a few a second. So
    // what is waited for is frames drawn, counted by the view, never a time.

    // Until the view has drawn another frame, while the test does nothing at
    // all, however long that takes.
    async function drawsOn(page, what) {
      const from = await scene(page).evaluate((canvas) => canvas.$view3d.frames);
      await test.step(`${what}: the view draws past frame ${from}`, () =>
        scene(page).evaluate(
          (canvas, from) =>
            new Promise((done) => {
              const look = () => (canvas.$view3d.frames > from ? done() : requestAnimationFrame(look));
              look();
            }),
          from,
        ));
      saw(`${what}: drawn past frame ${from}`);
    }

    // Page frames a stopped view is watched through: a view still drawing draws
    // in one of them.
    const WATCHED = 60;

    // What the view drew over `WATCHED` of the page's animation frames, once it
    // has stopped: its clock paused (`turning`) and no picture of it
    // still to draw (`due`: one it was resting before, or behind the GPU).
    async function drawnWhileStopped(page, what) {
      await test.step(`${what}: the scene's clock is paused and no picture is due`, () =>
        scene(page).evaluate(
          (canvas) =>
            new Promise((done) => {
              const look = () => (!canvas.$view3d.view.parent.turning && !canvas.$view3d.due ? done() : requestAnimationFrame(look));
              look();
            }),
        ));
      const frames = await scene(page).evaluate(
        (canvas, count) =>
          new Promise((done) => {
            const from = canvas.$view3d.frames;
            let left = count;
            const next = () => (--left <= 0 ? done(canvas.$view3d.frames - from) : requestAnimationFrame(next));
            requestAnimationFrame(next);
          }),
        WATCHED,
      );
      saw(`${what}: ${frames} frames over ${WATCHED} of the page's`);
      return frames;
    }

    // The one scroll a reader makes to the showcase, and its Run; nothing
    // after it. The view keeps how long its last pictures took to draw, for a
    // test that fails to say: on the page, and on WebGL 2 with the GPU, which
    // the view rests after when it was slow.
    async function reach(page, route) {
      await open(page, route);
      await showcase(page).evaluate((element) => element.scrollIntoView({ block: "start" }));
      await press(runButton(page, at.run));
      await showcase(page).evaluate((element) => element.scrollIntoView({ block: "start" }));
      await expect(scene(page), "the scene is made once it is on screen").toBeAttached({ timeout: 30_000 });
      await scene(page).evaluate((canvas) => {
        const drawn = (canvas.$drawnTimes = []);
        canvas.$view3d.probe = (kind, from, to) => {
          if (kind !== "draw" && kind !== "gpu") return;
          const at = Math.round(from);
          let picture = drawn.find((picture) => picture.at === at);
          if (!picture) {
            drawn.push((picture = { at }));
            if (drawn.length > 12) drawn.shift();
          }
          picture[kind] = Math.round(to - from);
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
      // How many frames the page itself made in a second says whether the
      // view's pictures held it up: a screenshot waits for the page's frames.
      const view = await Promise.race([
        scene(page)
          .evaluate(async (canvas, clock) => {
            const now = performance.now();
            const view = canvas.$view3d;
            const drawn = (canvas.$drawnTimes ?? []).map(({ at, draw, gpu }) => `${draw ?? "?"} ms${gpu === undefined ? "" : ` (the GPU ${gpu} ms)`}, ${Math.round(now - at)} ms ago`);
            const frames = await new Promise((resolve) => {
              let made = 0;
              const from = performance.now();
              const count = () => (performance.now() - from < 1_000 ? (made++, requestAnimationFrame(count)) : resolve(made));
              requestAnimationFrame(count);
            });
            return (
              `${view?.renderer} on ${view?.backend}: ${view?.frames} frames, turn ${view?.view.parent[clock]?.toFixed(1)}°, error ${view?.error}; ` +
              `last pictures took ${drawn.join("; ") || "none"}; the page made ${frames} frames of its own in the second after`
            );
          }, at.clock)
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
      const [frames, turn] = await scene(page).evaluate((canvas, clock) => [canvas.$view3d.frames, canvas.$view3d.view.parent[clock]], at.clock);
      saw(`a picture taken in ${Math.round(performance.now() - from)} ms, at ${frames} frames, turn ${turn.toFixed(1)}°`);
      return picture;
    }

    // The scene's clock, read from the View3D the canvas draws, which runs
    // at most `at.fastest` degrees a second.
    const turnOf = (page) => scene(page).evaluate((canvas, clock) => canvas.$view3d.view.parent[clock], at.clock);
    const FASTEST = at.fastest;
    // How far the clock went on from `from` to `to`, round a wrap.
    const onFrom = (from, to) => (((to - from) % 360) + 360) % 360;
    // The clock, and how long ago in the page's own time `since` was.
    const turnSince = (page, since) => scene(page).evaluate((canvas, [since, clock]) => [canvas.$view3d.view.parent[clock], (performance.now() - since) / 1000], [since, at.clock]);

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
        const route = `${at.route}?view3d=${renderer}`;

        test("the scene moves on its own, with no input", async ({ page }) => {
          await reach(page, route);
          expect(await scene(page).evaluate((canvas) => canvas.$view3d.renderer), "the renderer the address asked for").toBe(renderer);
          // Twice, a second apart: a scene that moved once and stopped
          // does not pass on that.
          await drawsOn(page, "frames are drawn while nobody touches the page");
          await drawsOn(page, "and go on being drawn");
          // A picture can take as long as the wait for one (15 s on a starved
          // runner), so the wait is on the scene's clock and frame count, cheap
          // to read, and the pictures are compared once the clock has moved and
          // a frame has been drawn since: the clock runs on while a renderer
          // rests between pictures. A canvas that stops showing what it draws
          // still fails.
          const before = await shot(page);
          const from = await turnOf(page);
          await expect.poll(async () => onFrom(from, await turnOf(page)), { message: "the scene's clock goes on" }).toBeGreaterThan(10);
          const drawn = await scene(page).evaluate((canvas) => canvas.$view3d.frames);
          await expect.poll(() => scene(page).evaluate((canvas) => canvas.$view3d.frames), { message: "the scene draws after its clock moves" }).toBeGreaterThan(drawn);
          expect(Buffer.compare(before, await shot(page)) !== 0, "the picture changes").toBe(true);
        });

        test("with less motion asked for, the scene still moves", async ({ page }) => {
          await page.emulateMedia({ reducedMotion: "reduce" });
          await reach(page, route);
          await drawsOn(page, "frames are drawn while nobody touches the page");
        });

        test("scrolled away it stops, and back on screen it goes on", async ({ page }) => {
          await reach(page, route);
          await drawsOn(page, "drawn on screen");
          // A wheel at the page's margin, where no example takes it, back
          // to the top.
          await page.mouse.move(16, 450);
          await expect(async () => {
            await page.mouse.wheel(0, -4000);
            await expect(scene(page)).not.toBeInViewport({ timeout: 500 });
          }, "the scene is scrolled off screen").toPass();
          expect(await drawnWhileStopped(page, "off screen"), "nothing is drawn off screen").toBe(0);
          await showcase(page).evaluate((element) => element.scrollIntoView({ block: "start" }));
          await drawsOn(page, "drawn again once back");
        });

        test("in a hidden tab it stops, and shown again it goes on from where it was", async ({ page }) => {
          await reach(page, route);
          await drawsOn(page, "drawn on screen");
          // Held in the first half of its turn, so a restart at its start
          // lands more than half a turn ahead and the bound below refuses it.
          // Read past halfway, it waits for the wrap: up to one turn.
          await expect
            .poll(
              async () => {
                const went = onFrom(at.start, await turnOf(page));
                return went > 20 && went < 180;
              },
              // However long the scene's clock takes to get there.
              { message: "the scene turns from its opening pose, in the first half of its turn", timeout: 0 },
            )
            .toBe(true);
          await showTab(page, false);
          expect(await drawnWhileStopped(page, "hidden"), "nothing is drawn while the tab is hidden").toBe(0);
          const held = await turnOf(page);
          await animationFrames(page, WATCHED);
          expect(await turnOf(page), `hidden, the scene's clock holds still over ${WATCHED} of the page's frames`).toBe(held);
          const shown = await showTab(page, true);
          // Paused, not stopped: a stopped animation starts again from
          // `from` (its start), a snap back a reader sees. Shown again, the clock
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
          await drawsOn(page, "drawn again once shown");
        });
      });
    }
  });
}

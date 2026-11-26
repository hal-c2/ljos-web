// The showcase's Snail Post, a ljos-play world, running in the page: its
// picture until the reader presses Run, then the world, which goes on
// only while it is seen, slower under reduced motion and never still, and
// which the reader changes in its editor while it runs.
import { readFileSync } from "node:fs";
import { animationFrames, centre, clockOf, expect, NEEDS_WASM, open, press, runButton, sceneRuns, test, unexpected } from "./fixtures.js";

const ROUTE = "/showcase/";
const RUN = "Run Snail Post";
// The example as the site copied it, which its editor shows.
const MAIN = readFileSync(new URL("../bundle/Showcase/play/snail-post/Main.qml", import.meta.url), "utf8");
// Its lawn, and the one an edit gives it, as the page draws them.
const LAWN = { file: '"#2f4233"', drawn: "rgb(47, 66, 51)" };
const EDITED = { file: '"#5a2f6a"', drawn: "rgb(90, 47, 106)" };
// How often a walking world steps (LjosPlay/World.qml's 40 ms timer).
const BEATS = 25;
// What the compiler says of an emptied file (CodeMirror's one line ends
// in a newline): that nothing it expects comes.
const EMPTIED = /^Main\.qml:\d+:\d+: Unexpected token$/;
// What the world is made of, fetched only once it runs.
const OWN = /\/(SnailPostDemo|snail-post-project)-[\w-]+\.js$/;

function frameOf(page) {
  return runButton(page, RUN).locator("xpath=ancestor::div[.//img[contains(@src, 'snail-post')]][1]");
}

// Where every walker in the world that is drawn stands, by a name each is
// given the first time it is seen: a walker that shows or hides (a
// letter a snail carries) moves no other in the list. A walker is a
// canvas, or the clip it is drawn in: a pose's sheet (LjosPlay/Sheet.qml)
// is one canvas of all its frames, moved a cell under its clip for each
// frame it shows, and the clip is where the snail stands.
// Measured from the world, so that the page scrolling moves none of them.
function places(page) {
  return page.evaluate(() => {
    const canvases = [...document.querySelectorAll("#app canvas.qq-canvas")];
    const at = (element) => element.getBoundingClientRect();
    let world = canvases[0]?.parentElement;
    while (world && !canvases.every((canvas) => world.contains(canvas))) world = world.parentElement;
    // The nearest clip round a canvas, short of the world: a sheet's.
    const clipped = (canvas) => {
      for (let clip = canvas.parentElement; clip && clip !== world; clip = clip.parentElement) if (getComputedStyle(clip).overflow !== "visible") return clip;
      return canvas;
    };
    const origin = world ? at(world) : { x: 0, y: 0 };
    const shown = {};
    for (const canvas of canvases) {
      canvas.dataset.walker ??= String((window.__walkers = (window.__walkers ?? 0) + 1));
      const walker = clipped(canvas);
      const box = at(walker);
      if (box.width === 0 || box.height === 0) continue;
      // The page's pixels to one of the walker's own, as the world and
      // the frame scale it.
      const scale = walker.offsetWidth > 0 ? box.width / walker.offsetWidth : 1;
      shown[canvas.dataset.walker] = [box.x - origin.x, box.y - origin.y, scale];
    }
    return { at: performance.now(), shown };
  });
}

// The page, scrolled back to its top with a wheel at its margin, where
// nothing takes it, until the world is out of the window.
async function awayFrom(page) {
  await page.mouse.move(16, 450);
  await expect(async () => {
    await page.mouse.wheel(0, -4000);
    await expect(page.locator("#app canvas.qq-canvas").first()).not.toBeInViewport({ timeout: 500 });
  }, "the world is scrolled off screen").toPass();
}

// How far a walker can go in `ms`, in the page's pixels at its `scale`:
// LjosPlay's actors walk at most 50 of their own pixels a second
// (LjosPlay/Actor.qml's `speed`, which Snail Post only lowers), and a
// step's rounding on top. A move farther than that is a walker put
// somewhere else, which is not walking. Bound by the time between the two
// readings, not their frames, so that a loaded page, which reads less
// often, has its walkers' longer moves between readings counted.
const reach = (ms, scale) => ((ms * 50) / 1000 + 4) * scale;

// How far the farthest walker went while the scene's clock gave `ms`, or,
// with `wall`, while `ms` went by on the test's own clock: the path of each
// walker, read every few frames, summed. A walker stops at its goal, so the
// farthest of them says how fast they walk. A move farther than its
// `reach` is left out, and counted in `seen.jumps`.
async function walked(page, ms, { wall = false, seen = {} } = {}) {
  const start = await clockOf(page);
  const began = Date.now();
  let last = await places(page);
  const paths = {};
  seen.jumps = 0;
  for (;;) {
    await animationFrames(page, 3);
    const now = await places(page);
    for (const [name, [x, y, scale]] of Object.entries(now.shown)) {
      const before = last.shown[name];
      if (!before) continue;
      const moved = Math.abs(x - before[0]) + Math.abs(y - before[1]);
      if (moved > reach(now.at - last.at, scale)) seen.jumps++;
      else paths[name] = (paths[name] ?? 0) + moved;
    }
    last = now;
    const clock = await clockOf(page);
    if (wall ? Date.now() - began >= ms : clock.time - start.time >= ms || !clock.jobs) return Math.max(0, ...Object.values(paths));
  }
}

// What `measure` gives, and how many frames a second the page drew while
// it ran: a world steps once a frame at most, so a page that draws fewer
// than a world's own beats holds every world to its frames.
async function framesDuring(page, measure) {
  await page.evaluate(() => {
    window.__frames = 0;
    const count = () => {
      window.__frames++;
      window.__counting = requestAnimationFrame(count);
    };
    window.__counting = requestAnimationFrame(count);
  });
  const start = Date.now();
  const result = await measure();
  const frames = await page.evaluate(() => {
    cancelAnimationFrame(window.__counting);
    return window.__frames;
  });
  return [result, Math.round((frames * 1000) / (Date.now() - start))];
}

async function started(page) {
  await open(page, ROUTE);
  const button = runButton(page, RUN);
  await centre(button);
  await press(button);
  await expect(button, "Run gives way to the world").toBeHidden({ timeout: 30_000 });
  await expect.poll(() => page.locator("#app canvas.qq-canvas").count(), { message: "the world's walkers are drawn", timeout: 30_000 }).toBeGreaterThan(5);
  return frameOf(page);
}

test.describe("Snail Post on /showcase/", () => {
  test("shows its picture, fetching nothing of the world, until Run", async ({ page, errors }) => {
    const fetched = [];
    page.on("request", (request) => {
      if (OWN.test(new URL(request.url()).pathname)) fetched.push(request.url());
    });
    await open(page, ROUTE);
    const button = runButton(page, RUN);
    await centre(button);
    await sceneRuns(page, 500, "the page settles");
    await expect(page.locator("#app img[src*='snail-post']:visible").first(), "its picture stands").toBeVisible();
    await expect(page.locator("#app canvas.qq-canvas"), "no world is made").toHaveCount(0);
    expect(fetched, "nothing of the world is fetched").toEqual([]);
    await press(button);
    await expect.poll(() => fetched.length, { message: "Run fetches the world" }).toBeGreaterThan(0);
    await expect(page.locator("#app img[src*='snail-post']:visible"), "the world replaces its picture").toHaveCount(0, { timeout: 30_000 });
    expect(unexpected(errors)).toEqual([]);
  });

  test("its snails walk once it runs", async ({ page, errors }) => {
    await started(page);
    expect(await walked(page, 1500), "a snail walks").toBeGreaterThan(8);
    await sceneRuns(page, 4000, "the world goes on");
    expect(unexpected(errors)).toEqual([]);
  });

  test("holds while scrolled away or in a hidden tab, and goes on after", async ({ page }) => {
    await started(page);
    expect(await walked(page, 1000), "it walks in sight").toBeGreaterThan(4);

    await awayFrom(page);
    await animationFrames(page, 10);
    const away = (await places(page)).shown;
    await page.waitForTimeout(1500);
    expect((await places(page)).shown, "nothing walks out of sight").toEqual(away);

    await centre(page.locator("#app canvas.qq-canvas").first());
    expect(await walked(page, 1000), "it walks again in sight").toBeGreaterThan(4);

    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await animationFrames(page, 5);
    const hidden = (await places(page)).shown;
    await page.waitForTimeout(1500);
    expect((await places(page)).shown, "nothing walks in a hidden tab").toEqual(hidden);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(await walked(page, 1000), "it walks again once shown").toBeGreaterThan(4);
  });

  test("the reader changes its code and it runs as they changed it", async ({ page, errors, wasm }) => {
    await started(page);
    const lawn = (drawn) => page.locator(`#app div[style*="${drawn}"]`);
    await expect(lawn(LAWN.drawn).first(), "the lawn as the file has it").toBeAttached();

    await press(page.getByRole("button", { name: "Edit Snail Post" }));
    const code = page.getByRole("textbox", { name: /^Edit .*\bMain\.qml of Snail Post$/ });
    await expect(code, "Edit shows the example's file").toBeVisible({ timeout: 30_000 });
    await expect(code).toContainText("seed: 41");
    await press(code);
    await expect(page.locator(".cm-editor.cm-focused"), "the code editor has the keyboard").toBeVisible({ timeout: 30_000 });

    // Without WebAssembly nothing compiles an edit: the page says so, and
    // the world goes on as it was.
    if (!wasm) {
      await expect(page.locator("#app").getByText(NEEDS_WASM).first(), "why an edit cannot run").toBeVisible();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.insertText(MAIN.replace(LAWN.file, EDITED.file));
      await page.waitForTimeout(1500);
      await expect(lawn(LAWN.drawn).first(), "the world as it was").toBeAttached();
      expect(await walked(page, 1500), "and it goes on").toBeGreaterThan(4);
      // Reset takes the reader's text back, not the reason.
      await press(page.getByRole("button", { name: "Reset Snail Post to its file" }));
      await press(code);
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.insertText("\n");
      await expect(page.locator("#app").getByText(NEEDS_WASM).first(), "still why, after Reset").toBeVisible();
      expect(unexpected(errors)).toEqual([]);
      return;
    }

    // A lawn of another colour: the world is made again from the edit.
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText(MAIN.replace(LAWN.file, EDITED.file));
    await expect(lawn(EDITED.drawn).first(), "the world runs as edited").toBeAttached({ timeout: 30_000 });
    expect(await walked(page, 1500), "and its snails walk").toBeGreaterThan(4);

    // The window turned to a phone's and back: the editor is made again in
    // the other place, with the reader's text, not the file's.
    const size = page.viewportSize();
    for (const width of [600, size.width]) {
      await page.setViewportSize({ width, height: size.height });
      await expect(code, `the edit, in an editor ${width} px wide`).toContainText(EDITED.file, { timeout: 30_000 });
      await expect(page.getByRole("button", { name: "Reset Snail Post to its file" }), "still a change").toBeVisible();
      await expect(lawn(EDITED.drawn).first(), "and still the world it made").toBeAttached();
    }
    await press(code);

    // An edit that does not compile is said, and the last world goes on.
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText("\n}\n");
    await expect(page.locator("#app").getByText(/Main\.qml:\d+/).first(), "what is wrong, and where").toBeVisible({ timeout: 30_000 });
    await expect(lawn(EDITED.drawn).first(), "the last world stays").toBeAttached();
    expect(await walked(page, 1500), "and goes on").toBeGreaterThan(4);

    // An edit that compiles again takes what was said away.
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText(MAIN.replace(LAWN.file, EDITED.file));
    await expect(page.locator("#app").getByText(/Main\.qml:\d+/), "nothing is wrong now").toHaveCount(0, { timeout: 30_000 });

    // No text at all is an edit too: compiled and said, with the last world
    // going on.
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Delete");
    await expect(page.locator(".cm-editor .cm-content"), "the file is emptied").toHaveText("");
    await expect(page.locator("#app").getByText(EMPTIED).first(), "what an empty file is").toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Reset Snail Post to its file" }), "an emptied file is a change").toBeVisible();
    await expect(lawn(EDITED.drawn).first(), "the last world stays when emptied").toBeAttached();

    await press(page.getByRole("button", { name: "Reset Snail Post to its file" }));
    await expect(lawn(LAWN.drawn).first(), "Reset gives the file's world back").toBeAttached({ timeout: 30_000 });
    // CodeMirror holds only the lines in sight: what Reset wrote back is
    // read as the page reads it, as nothing changed.
    await expect(page.getByRole("button", { name: "Reset Snail Post to its file" }), "nothing is changed now").toBeHidden();
    expect(unexpected(errors)).toEqual([]);
  });

  // An edit is compiled as a project of the example's files alone, at a
  // root of its own, as a live code block's is (live.js): a file it names
  // and does not have is said, never asked of the site.
  test("an edit reaches only its own project's files", async ({ page, errors, wasm }) => {
    test.skip(!wasm, "without WebAssembly no edit is compiled");
    const asked = [];
    page.on("request", (request) => {
      if (/outside\.png/.test(request.url())) asked.push(request.url());
    });
    await started(page);
    await press(page.getByRole("button", { name: "Edit Snail Post" }));
    const code = page.getByRole("textbox", { name: /^Edit .*\bMain\.qml of Snail Post$/ });
    await expect(code).toContainText("seed: 41", { timeout: 30_000 });
    await press(code);
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText(MAIN.replace(LAWN.file, EDITED.file).replace("    id: post\n", '    id: post\n    Image { source: "../outside.png" }\n'));
    await expect(page.locator(`#app div[style*="${EDITED.drawn}"]`).first(), "the edit runs").toBeAttached({ timeout: 30_000 });
    await expect(page.locator("#app").getByText(/outside\.png: No such file or directory/).first(), "what it named and does not have").toBeVisible({ timeout: 30_000 });
    expect(asked, "nothing outside its project is asked for").toEqual([]);
    expect(unexpected(errors)).toEqual([]);
  });

  test("says why when its file cannot be fetched", async ({ page }) => {
    await started(page);
    await page.route(/\/snail-post-project-[\w-]+\.js$/, (route) => route.abort());
    await press(page.getByRole("button", { name: "Edit Snail Post" }));
    await expect(page.locator("#app").getByText(/dynamically imported module/i).first(), "what went wrong").toBeVisible({ timeout: 30_000 });
    expect(await walked(page, 1500), "the world goes on").toBeGreaterThan(4);
  });

  test.describe("under reduced motion", () => {
    test.use({ reducedMotion: "reduce" });
    test("the snails walk slower and never stop", async ({ page, browser, errors }) => {
      const context = await browser.newContext({ reducedMotion: "no-preference", viewport: page.viewportSize() });
      const other = await context.newPage();
      await Promise.all([started(page), started(other)]);
      // Side by side, so that what else the machine does slows both alike,
      // over the same two seconds of the test's clock: the worlds step on
      // timers, which a loaded page's scene clock (capped in each frame)
      // falls behind, and the two pages' clocks fall behind unalike.
      const [calmSeen, fullSeen] = [{}, {}];
      const [[calm, calmFrames], [full, fullFrames]] = await Promise.all([
        framesDuring(page, () => walked(page, 2000, { wall: true, seen: calmSeen })),
        framesDuring(other, () => walked(other, 2000, { wall: true, seen: fullSeen })),
      ]);
      await context.close();
      // Each by the steps its world took: one a frame at most, at most
      // its 25 beats a second, so a page that drew fewer frames walked
      // less for that alone.
      const steps = (frames) => Math.max(1, Math.min(frames, BEATS));
      const [calmStep, fullStep] = [calm / steps(calmFrames), full / steps(fullFrames)];
      const drawn = `${calm} and ${full} px; the pages drew ${calmFrames} and ${fullFrames} frames a second, of the world's ${BEATS} beats; ${calmSeen.jumps} and ${fullSeen.jumps} jumps left out`;
      expect(calmStep, `slower a step than with no preference; ${drawn}`).toBeLessThan(fullStep * 0.8);
      expect(calmStep, `and not still; ${drawn}`).toBeGreaterThan(fullStep * 0.2);
      // A move past a walker's reach is a walker put elsewhere, which the
      // calm world, walking less far, does no more often: one that went
      // too far a step would be counted here, not in its path.
      expect(calmSeen.jumps, `and puts its snails elsewhere no more often; ${drawn}`).toBeLessThanOrEqual(fullSeen.jumps + 1);
      expect(unexpected(errors)).toEqual([]);
    });
  });
});

// The demos: the front page's Pantry, watch and Lottie player, and
// /demos/' five, each driven by the input it is for. A demo is the slot
// under its heading. The Pantry runs with the page, as a plain example
// would: it holds still, and its shell is the one compiled with the
// page. It is the front page's alone. The others wait for their Run,
// and then run.
import { centre, centreOf, drag, expect, expectFramesAdvance, open, pageScroll, pinch, playThrough, press, runButton, sceneRuns, signature, test, unexpected } from "./fixtures.js";
import { sourceView } from "./known.js";
import { SOURCE as SHADER } from "../bundle/Demos/logic/shader.ts";

function headingOf(page, heading) {
  return page.locator("#app div.qq-text").filter({ hasText: new RegExp(`^${heading}$`) }).first();
}

// A demo on /demos/: the section its heading stands at the top of,
// which holds its words and the running demo.
function demo(page, heading) {
  return headingOf(page, heading).locator("xpath=../..");
}

// A framed demo is made only once its frame nears the screen
// (DemoFrame), as a reader scrolls to it: bring its heading to the
// middle of the window, and the frame under it is made.
async function reach(page, heading) {
  await centre(headingOf(page, heading));
  return demo(page, heading);
}

async function settled(page, route) {
  await open(page, route);
  await page.waitForTimeout(800);
}

// Each demo's Run button, by the demo's heading.
const RUN = {
  "3D you can orbit": "Run the 3D demo",
  "A shader effect": "Run the shader demo",
  "A whole app": "Run the field guide",
  "Springs you drag": "Run the motion demo",
  "Lottie animations": "Run the Lottie demo",
};

// The demo under `heading`, started as a reader starts it: brought into
// view, and its Run pressed where it has one.
async function started(page, heading) {
  const slot = demo(page, heading);
  await centre(slot);
  if (!RUN[heading]) return slot;
  const button = runButton(slot, RUN[heading]);
  await press(button);
  await expect(button, `${heading} runs once its Run is pressed`).toBeHidden();
  return slot;
}

// The shader demo, started and drawing in the middle of the window, with
// what its tests read of it: the effect's own state, and the colour the
// screen shows at a point of the picture.
async function shaderOf(page) {
  await settled(page, "/demos/");
  const slot = await started(page, "A shader effect");
  const canvas = slot.locator("canvas.qq-shader").first();
  const state = () =>
    canvas.evaluate((canvas) => {
      const effect = canvas.$effect;
      return { x: effect.pointer.x, y: effect.pointer.y, tap: [effect.tap.x, effect.tap.y], ripple: effect.ripple, palette: effect.palette, drawn: effect.$shader.drawn() };
    });
  // The colour at a point of the picture, as the screen shows it (the
  // canvas's own pixels leave it for the screen and are not kept).
  // `where` gives the point when it is read, as the canvas stands then.
  const colour = async (where) => {
    const point = await where();
    const png = await page.screenshot({ clip: { x: point.x, y: point.y, width: 1, height: 1 } });
    return page.evaluate(async (data) => {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const copy = new OffscreenCanvas(1, 1).getContext("2d");
      copy.drawImage(bitmap, 0, 0);
      return [...copy.getImageData(0, 0, 1, 1).data];
    }, png.toString("base64"));
  };
  const red = async (where) => {
    const [r, g, b] = await colour(where);
    return r > 235 && g < 20 && b < 20;
  };
  // Each press centres what it presses, which can scroll the canvas, so
  // its box is measured each time a point of it is wanted: the box of the
  // picture shown then, the effect or, while an edit is broken, the
  // last one that compiled in its place.
  const at = async (x, y) => {
    const box = await slot.locator("canvas.qq-shader").filter({ visible: true }).first().boundingBox();
    return { x: box.x + box.width * x, y: box.y + box.height * y };
  };
  await expect.poll(async () => (await state()).drawn, { message: "the shader draws", timeout: 30_000 }).toBeGreaterThan(0);
  await centre(canvas);
  return { slot, canvas, state, colour, red, at };
}

// What Orbit's view says of itself, for a check of its drawing that fails:
// which renderer on what, how far it got, and any error.
async function drawingOf(canvas) {
  return canvas.evaluate((canvas) => {
    const view = canvas.$view3d;
    return `${view?.renderer} on ${view?.backend}: ${view?.frames} frames, error ${view?.error ?? "none"}`;
  });
}

// The picture keeps changing, and if it does not, the failure says what
// the view was doing.
async function keepsDrawing(canvas) {
  try {
    await expectFramesAdvance(canvas);
  } catch (error) {
    error.message += `\n  Orbit: ${await drawingOf(canvas)}`;
    throw error;
  }
}

// Where Orbit's camera rig stands: the turn of the node its camera hangs
// from (`origin` in Orbit.qml), which its OrbitCameraController turns, and
// the camera's distance from it, which a pinch changes. The scene's own
// motion turns its lamp and shapes and never the rig, so what moves the rig
// is the input, however fast or slow the runner draws.
function rigOf(canvas) {
  return canvas.evaluate((canvas) => {
    const camera = canvas.$view3d.view.camera;
    const { x, y } = camera.parent.eulerRotation;
    return { x, y, distance: camera.z, frames: canvas.$view3d.frames };
  });
}

test.describe("/demos/", () => {
  test("loads with nothing in its console", async ({ page, errors }) => {
    await settled(page, "/demos/");
    for (const heading of ["Lottie animations", "3D you can orbit", "A shader effect", "A whole app", "Springs you drag"]) await expect(demo(page, heading), heading).toBeVisible();
    expect(unexpected(errors)).toEqual([]);
  });

  test("Orbit keeps drawing frames", async ({ page }) => {
    await settled(page, "/demos/");
    const orbit = await started(page, "3D you can orbit");
    // Run starts the renderer; it keeps drawing once it has drawn and its
    // picture is gone. A software GPU takes seconds over its first frame,
    // which is no part of what this checks.
    await expect
      .poll(() => orbit.locator("canvas.qq-view3d").evaluate((canvas) => canvas.$view3d?.frames ?? 0), { message: "Orbit has drawn", timeout: 30_000 })
      .toBeGreaterThan(0);
    await expect(orbit.locator("img:visible"), "its picture is gone").toHaveCount(0, { timeout: 10_000 });
    await keepsDrawing(orbit.locator("canvas.qq-view3d"));
    await expect.poll(() => orbit.locator("canvas.qq-view3d").evaluate((canvas) => canvas.$view3d?.frames ?? 0)).toBeGreaterThan(10);
  });

  test("Orbit is drawn by the renderer the page names", async ({ page, wasm }) => {
    await settled(page, "/demos/");
    const orbit = await started(page, "3D you can orbit");
    // wgpu is every View3D's renderer where WebGPU gives it an adapter; a
    // browser with none, as a headless one on a machine without a GPU, or
    // without WebAssembly, has it drawn by the JavaScript renderer.
    const adapter = await page.evaluate(async () => !!(await globalThis.navigator.gpu?.requestAdapter().catch(() => null)));
    await expect
      .poll(() => orbit.locator("canvas.qq-view3d").evaluate((canvas) => canvas.$view3d?.renderer), { message: `the renderer, ${wasm ? "with" : "without"} WebAssembly, ${adapter ? "with" : "without"} a WebGPU adapter` })
      .toBe(wasm && adapter ? "wgpu" : "js");
    // The renderer is named before it has started, so a failure to start
    // comes after: it has drawn, or failed, before its error says anything.
    // A failure is reported as itself, not as a wait that ran out.
    await expect
      .poll(() => orbit.locator("canvas.qq-view3d").evaluate((canvas) => (canvas.$view3d?.frames ?? 0) > 0 || canvas.$view3d?.error != null), { message: "the renderer has drawn or failed", timeout: 30_000 })
      .toBe(true);
    expect(await orbit.locator("canvas.qq-view3d").evaluate((canvas) => String(canvas.$view3d.error ?? "")), "the renderer started without an error").toBe("");
    expect(await orbit.locator("canvas.qq-view3d").evaluate((canvas) => canvas.$view3d.backend), `drawn on, ${adapter ? "with" : "without"} a WebGPU adapter`).toBe(wasm && adapter ? "webgpu" : "webgl2");
  });

  test("Orbit turns under a sideways drag and zooms under a pinch", async ({ page, errors }) => {
    await settled(page, "/demos/");
    const canvas = (await started(page, "3D you can orbit")).locator("canvas.qq-view3d");
    await centre(canvas);
    const { x, y } = await centreOf(canvas);
    const before = await rigOf(canvas);
    await drag(page, { x: x - 80, y }, { x: x + 80, y });
    // As Qt turns it: against the drag, about its upright axis only.
    const turned = await rigOf(canvas);
    expect(turned.y, "a drag to the right turns the rig to the left").toBeLessThan(before.y - 10);
    expect(turned.x, "a sideways drag does not tilt it").toBeCloseTo(before.x, 1);
    // What is drawn after the drag is drawn from where the rig now stands.
    await expect.poll(async () => (await rigOf(canvas)).frames, { message: "the turned scene is drawn" }).toBeGreaterThan(turned.frames);
    await pinch(page, x, y);
    await expect.poll(async () => (await rigOf(canvas)).distance, { message: "a pinch brings the camera closer" }).toBeLessThan(turned.distance);
    expect(unexpected(errors)).toEqual([]);
  });

  test("Orbit takes an up-and-down drag; the page does not", async ({ page }) => {
    await settled(page, "/demos/");
    const canvas = (await started(page, "3D you can orbit")).locator("canvas.qq-view3d");
    await centre(canvas);
    const { x, y } = await centreOf(canvas);
    const scrolled = await pageScroll(page);
    const before = await rigOf(canvas);
    await drag(page, { x, y: y - 100 }, { x, y: y + 100 });
    expect(await pageScroll(page), "the page stayed where it was").toBe(scrolled);
    const tilted = await rigOf(canvas);
    expect(tilted.x, "a drag down tilts the rig").toBeLessThan(before.x - 10);
    expect(tilted.y, "an up-and-down drag does not turn it").toBeCloseTo(before.y, 1);
  });

  test("the shader effect keeps drawing frames", async ({ page, errors }) => {
    await settled(page, "/demos/");
    const shader = await started(page, "A shader effect");
    await expectFramesAdvance(shader);
    expect(unexpected(errors)).toEqual([]);
  });

  // The shader is for playing with and rewriting: its light swirls where
  // the pointer leads it, a tap rings out from where it was, a chip
  // changes the colours. Two tests, each in its own time: a machine that
  // draws it at a frame or two a second (software GL on a loaded runner)
  // takes most of a test's time on either half.
  test("the shader's light follows the pointer, a tap rings out where it was, a chip changes its colours", async ({ page, errors }) => {
    const { slot, state, at } = await shaderOf(page);
    const to = await at(0.82, 0.35);
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await expect
      .poll(async () => { const { x, y } = await state(); return x > 0.75 && y < 0.45 ? "there" : `at ${x.toFixed(2)}, ${y.toFixed(2)}`; }, { message: "the light's vortex goes where the pointer is" })
      .toBe("there");

    const tap = await at(0.25, 0.6);
    const before = Date.now();
    await page.mouse.click(tap.x, tap.y);
    const tapped = await state();
    // The ripple ages one second a second, so it can be no older than the
    // time since the tap went out, however slow this machine is.
    const since = (Date.now() - before) / 1000;
    expect(tapped.tap[0], "the ripple starts where the tap was").toBeCloseTo(0.25, 1);
    expect(tapped.tap[1]).toBeCloseTo(0.6, 1);
    expect(tapped.ripple, `and is no older than the ${since.toFixed(2)} s since the tap`).toBeLessThanOrEqual(since + 0.1);

    await press(slot.getByRole("radio", { name: "Ember colours" }));
    await expect.poll(async () => (await state()).palette, { message: "a chip chooses the colours" }).toBe(1);
    expect(unexpected(errors)).toEqual([]);
  });

  // Its source, opened and edited, is the picture. An edit that does not
  // compile is marked where the compiler said, and the picture before it
  // goes on; Reset brings back the shader as written.
  test("the shader's source, edited, is the picture; a broken edit keeps the last that compiled; Reset the shader as written", async ({ page, errors }) => {
    const { slot, canvas, colour, red, at } = await shaderOf(page);
    await press(slot.getByRole("button", { name: "Edit the shader's source" }));
    await slot.getByRole("textbox", { name: "Edit the fragment shader" }).first().click();
    const editor = slot.locator('.cm-content[aria-label="Edit the fragment shader"]').first();
    await expect(editor, "the source opens in an editor").toBeFocused({ timeout: 30_000 });
    const source = SHADER;
    expect(source).toContain("fragColor = vec4(mix(day, night, dark), 1.0);");
    await editor.fill(source.replace("fragColor = vec4(mix(day, night, dark), 1.0);", "fragColor = vec4(1.0, 0.0, 0.0, 1.0);"));
    // Left of the middle: the source is open over the right of it.
    const shown = () => at(0.2, 0.5);
    await expect.poll(() => red(shown), { message: "the edited shader is the picture", timeout: 10_000 }).toBe(true);

    await editor.fill(source.replace("fragColor = vec4(mix(day, night, dark), 1.0);", "fragColor = vec4(1.0, 0.0, 0.0, 1.0)\nwhat;"));
    await expect(editor.locator(".cm-lintRange-error").first(), "a broken edit is marked where the compiler said").toBeVisible({ timeout: 10_000 });
    await expect(slot.getByText(/^Did not compile; keeping the last working version: Line \d+:/)).toBeVisible();
    const kept = slot.locator("canvas.qq-shader").nth(1);
    const drawnBefore = await kept.evaluate((canvas) => canvas.$effect.$shader.drawn());
    await expect.poll(() => kept.evaluate((canvas) => canvas.$effect.$shader.drawn()), { message: "the last shader that compiled goes on drawing" }).toBeGreaterThan(drawnBefore + 5);
    expect(await red(shown), "and what it draws is the red edit, not the shader as written").toBe(true);

    await press(slot.getByRole("button", { name: "Reset the shader's source" }));
    await expect(slot.getByText(/^Did not compile; keeping the last working version:/), "Reset clears the compiler's complaint").toBeHidden({ timeout: 10_000 });
    const drawnReset = await canvas.evaluate((canvas) => canvas.$effect.$shader.drawn());
    await expect.poll(() => canvas.evaluate((canvas) => canvas.$effect.$shader.drawn()), { message: "the effect itself draws again" }).toBeGreaterThan(drawnReset + 5);
    await expect.poll(() => red(shown), { message: "Reset draws the shader as written", timeout: 10_000 }).toBe(false);
    // Not a blank canvas either: its place looks different with it hidden.
    const behind = await shown();
    const drawnColour = await colour(() => behind);
    await canvas.evaluate((canvas) => (canvas.style.visibility = "hidden"));
    const withoutColour = await colour(() => behind);
    await canvas.evaluate((canvas) => (canvas.style.visibility = ""));
    expect(drawnColour, "the picture after Reset is the shader's, not the page behind it").not.toEqual(withoutColour);
    expect(unexpected(errors)).toEqual([]);
  });

  // The field guide and Motion need WebAssembly (DemosPage's `needs`):
  // without it each keeps its picture and says why, and there is no
  // demo to press.
  for (const [heading, picture] of [
    ["A whole app", "A field guide to birds: a list of species beside the one picked, with notes and a count of those seen."],
    ["Springs you drag", "Three balls on springs chasing a ring, each moving its own way."],
  ]) {
    test(`${heading}: without WebAssembly keeps its picture and says why`, async ({ page, errors, wasm }) => {
      test.skip(wasm, "only a browser without WebAssembly");
      await settled(page, "/demos/");
      const slot = await reach(page, heading);
      await expect(slot.getByRole("img", { name: picture })).toBeVisible();
      await expect(slot).toContainText("A picture of the demo: it runs in a browser with WebAssembly, which this one does not offer.");
      expect(unexpected(errors)).toEqual([]);
    });
  }

  test("the field guide shows the species a reader picks, and marks it seen", async ({ page, errors, wasm }) => {
    test.skip(!wasm, "the field guide needs WebAssembly; the test above holds what it shows without");
    await settled(page, "/demos/");
    const guide = await started(page, "A whole app");
    await press(guide.getByRole("button", { name: "Arctic tern" }));
    await expect(guide, "its page opens on the right").toContainText("Sterna paradisaea · breeding");
    await press(guide.getByRole("checkbox").first());
    await expect(guide).toContainText("Seen 1 of 9");
    expect(unexpected(errors)).toEqual([]);
  });

  test("the field guide's search takes what a reader types after pressing it", async ({ page, wasm }) => {
    test.skip(!wasm, "the field guide needs WebAssembly");
    await settled(page, "/demos/");
    const guide = await started(page, "A whole app");
    await press(guide.getByRole("textbox", { name: /Search/ }));
    await page.keyboard.type("gannet");
    // The one species it names, beside the demo's own Pause and the
    // Observer on it.
    const named = () => guide.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
    await expect.poll(named).toEqual(["Northern gannet", "Pause the field guide", "Observer for the field guide"]);
  });

  test("the motion demo's springs chase the ring a drag leads", async ({ page, errors, wasm }) => {
    test.skip(!wasm, "the motion demo needs WebAssembly");
    await settled(page, "/demos/");
    // The stage has no value to say, so it is a named group, not a slider
    // (ARIA asks a slider for its value).
    const stage = (await started(page, "Springs you drag")).getByRole("group", { name: /Spring stage/ });
    await centre(stage);
    const { box } = await centreOf(stage);
    // Where the balls are across the stage, as parts of it, on average.
    const across = () =>
      stage.evaluate((area) => {
        const own = area.getBoundingClientRect();
        const balls = [...area.querySelectorAll("div.qq-text")].filter((text) => /^[SBL]$/.test(text.textContent.trim())).map((text) => text.parentElement.getBoundingClientRect());
        return balls.length === 3 ? balls.reduce((sum, ball) => sum + (ball.x + ball.width / 2 - own.x) / own.width, 0) / 3 : null;
      });
    const y = box.y + box.height / 2;
    await drag(page, { x: box.x + box.width * 0.5, y }, { x: box.x + box.width * 0.12, y });
    await expect.poll(across, { message: "the balls come after the ring, to the left" }).toBeLessThan(0.25);
    // Let go, the ring rests where it was left, and so do they.
    await page.waitForTimeout(500);
    expect(await across(), "the balls rest by the ring").toBeLessThan(0.25);
    expect(unexpected(errors)).toEqual([]);
  });

  // The Lottie demo draws HAL-C2's avatars as SVG, the dance first.
  test("the Lottie demo plays, holds its frame on Pause, and plays on from there", async ({ page, errors }) => {
    await settled(page, "/demos/");
    const slot = await started(page, "Lottie animations");
    const dance = slot.locator("svg.qq-lottie").first();
    await expect(dance, "the dance is drawn").toBeVisible({ timeout: 30_000 });
    await expectFramesAdvance(dance, { message: "the dance plays" });
    await press(slot.getByRole("button", { name: "Pause both avatars" }));
    const held = await dance.innerHTML();
    await sceneRuns(page, 500, "paused");
    expect(await dance.innerHTML(), "paused, the dance holds its frame").toBe(held);
    await press(slot.getByRole("button", { name: "Play both avatars" }));
    await expectFramesAdvance(dance, { message: "played again, the dance goes on" });
    expect(unexpected(errors)).toEqual([]);
  });

  test("the Lottie demo's genie plays once, again on Again, and more slowly at 0.5×", async ({ page, errors }) => {
    await settled(page, "/demos/");
    const slot = await started(page, "Lottie animations");
    await expect(slot.locator("svg.qq-lottie").nth(1), "the genie is drawn").toBeVisible({ timeout: 30_000 });
    const full = await playThrough(page, slot);
    expect(full, "at 1× its 48 frames take about 2 s").toBeGreaterThan(1_500);
    expect(full).toBeLessThan(3_000);
    await press(slot.getByRole("radio", { name: "Playback speed 0.5×" }));
    const half = await playThrough(page, slot);
    expect(half, "at 0.5× it takes about twice as long").toBeGreaterThan(full * 1.6);
    expect(unexpected(errors)).toEqual([]);
  });

  for (const heading of ["Lottie animations", "3D you can orbit", "A shader effect", "A whole app", "Springs you drag"]) {
    test(`${heading}: show source opens its QML`, async ({ page }) => {
      test.fail(true, sourceView);
      await settled(page, "/demos/");
      const slot = await reach(page, heading);
      // Asked for first, so a demo without the button fails here in
      // the expect timeout, as `test.fail` needs, rather than timing
      // the test out in the press.
      const show = slot.getByRole("button", { name: /source/i });
      await expect(show, "the demo has a 'show source' button").toHaveCount(1);
      await press(show);
      await expect(slot.getByRole("textbox")).toContainText("import");
    });
  }
});

test.describe("the front page", () => {
  test("the Pantry answers a press and keys", async ({ page, errors }) => {
    await settled(page, "/");
    const pantry = page.getByRole("group", { name: "The Pantry, running" });
    await centre(pantry);
    const before = await signature(pantry);
    await press(pantry.getByRole("button").first());
    await page.keyboard.press("Space");
    await expect.poll(() => signature(pantry), { message: "a press changes the Pantry" }).not.toBe(before);
    expect(unexpected(errors)).toEqual([]);
  });

  test("loads with nothing in its console; the Pantry and the watch run", async ({ page, errors }) => {
    await settled(page, "/");
    const button = runButton(page, "Run the watch");
    await press(button);
    await expect(button, "Run starts the watch").toBeHidden();
    await expect(page.getByLabel("The Pantry, running")).toBeVisible();
    // The watch is made as the reader nears the showcase under this heading.
    await centre(headingOf(page, "See it run"));
    const canvas = page.locator("canvas.qq-view3d").first();
    await centre(canvas);
    await keepsDrawing(canvas);
    expect(unexpected(errors)).toEqual([]);
  });
});

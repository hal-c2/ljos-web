// The demos: the front page's Pantry and Orbit, and /demos/' five,
// each driven by the input it is for. A demo is the slot under its
// heading; it runs without a press.
import { centre, centreOf, drag, expect, expectFramesAdvance, open, pageScroll, pinch, press, signature, test, unexpected } from "./fixtures.js";
import { demo as known, sourceView } from "./known.js";

function headingOf(page, heading) {
  return page.locator("#app div.qq-text").filter({ hasText: new RegExp(`^${heading}$`) }).first();
}

// A demo on /demos/: the section its heading stands at the top of,
// which holds its words and the running demo.
function demo(page, heading) {
  return headingOf(page, heading).locator("xpath=../..");
}

// A demo but the flagship is made only once its frame nears the screen
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

test.describe("/demos/", () => {
  test("loads with nothing in its console", async ({ page, errors }) => {
    await settled(page, "/demos/");
    for (const heading of ["A shell you rewrite", "3D you can orbit", "A shader effect", "A whole app", "Motion"]) await expect(demo(page, heading), heading).toBeVisible();
    expect(unexpected(errors)).toEqual([]);
  });

  test("the Pantry answers a press and keys", async ({ page, errors }) => {
    await settled(page, "/demos/");
    const pantry = demo(page, "A shell you rewrite");
    await centre(pantry);
    const before = await signature(pantry);
    await press(pantry.getByRole("button").first());
    await page.keyboard.press("Space");
    await expect.poll(() => signature(pantry), { message: "a press changes the Pantry" }).not.toBe(before);
    expect(unexpected(errors)).toEqual([]);
  });

  test("Orbit keeps drawing frames", async ({ page }) => {
    await settled(page, "/demos/");
    const orbit = await reach(page, "3D you can orbit");
    await centre(orbit);
    await expectFramesAdvance(orbit.locator("canvas").first());
    await expect.poll(() => orbit.locator("canvas.qq-view3d").evaluate((canvas) => canvas.$view3d?.frames ?? 0)).toBeGreaterThan(10);
  });

  test("Orbit is drawn by the renderer the page names", async ({ page }) => {
    await settled(page, "/demos/");
    const orbit = await reach(page, "3D you can orbit");
    // wgpu is every View3D's renderer; a browser with no WebGPU adapter
    // to give it, as a headless one on a machine without a GPU, has it
    // drawn by the JS renderer instead.
    const adapter = await page.evaluate(async () => !!(await globalThis.navigator.gpu?.requestAdapter().catch(() => null)));
    await expect.poll(() => orbit.locator("canvas.qq-view3d").evaluate((canvas) => canvas.$view3d?.renderer)).toBe(adapter ? "wgpu" : "js");
  });

  test("Orbit turns under a sideways drag and zooms under a pinch", async ({ page, errors }) => {
    // The scene turns on its own, so a changed picture proves nothing
    // about the drag. With the page's clock stopped nothing moves on
    // its own: what moves then is what the drag moved.
    await page.clock.install();
    await settled(page, "/demos/");
    const canvas = (await reach(page, "3D you can orbit")).locator("canvas.qq-view3d");
    await centre(canvas);
    const { x, y } = await centreOf(canvas);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 500));
    const shot = () => canvas.screenshot();
    const before = await shot();
    expect(Buffer.compare(before, await shot()), "with the clock stopped the scene holds still").toBe(0);
    await drag(page, { x: x - 80, y }, { x: x + 80, y });
    await expect.poll(async () => Buffer.compare(before, await shot()) !== 0, { message: "the scene turned" }).toBe(true);
    await pinch(page, x, y);
    expect(unexpected(errors)).toEqual([]);
  });

  test("Orbit takes an up-and-down drag; the page does not", async ({ page }) => {
    // As for the sideways drag: with the page's clock stopped nothing
    // turns on its own, so a changed picture is the drag's, and the
    // page's scroll staying put says the page did not take it.
    await page.clock.install();
    await settled(page, "/demos/");
    const canvas = (await reach(page, "3D you can orbit")).locator("canvas.qq-view3d");
    await centre(canvas);
    const { x, y } = await centreOf(canvas);
    const scrolled = await pageScroll(page);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 500));
    const shot = () => canvas.screenshot();
    const before = await shot();
    expect(Buffer.compare(before, await shot()), "with the clock stopped the scene holds still").toBe(0);
    await drag(page, { x, y: y - 100 }, { x, y: y + 100 });
    expect(await pageScroll(page), "the page stayed where it was").toBe(scrolled);
    await expect.poll(async () => Buffer.compare(before, await shot()) !== 0, { message: "the scene tilted" }).toBe(true);
  });

  test("the shader effect keeps drawing frames", async ({ page, errors }) => {
    await settled(page, "/demos/");
    const shader = await reach(page, "A shader effect");
    await centre(shader);
    await expectFramesAdvance(shader);
    expect(unexpected(errors)).toEqual([]);
  });

  // The field guide and Motion need WebAssembly (DemosPage's `needs`):
  // without it each keeps its picture and says why, and there is no
  // demo to press.
  for (const [heading, picture] of [
    ["A whole app", "A field guide to birds: a list of species beside the one picked, with notes and a count of those seen."],
    ["Motion", "Tiles that shuffle and settle, driven by one eased value."],
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
    const guide = await reach(page, "A whole app");
    await centre(guide);
    await press(guide.getByRole("button", { name: "Arctic tern" }));
    await expect(guide, "its page opens on the right").toContainText("Sterna paradisaea · breeding");
    await press(guide.getByRole("checkbox").first());
    await expect(guide).toContainText("Seen 1 of 9");
    expect(unexpected(errors)).toEqual([]);
  });

  test("the field guide's search takes what a reader types after pressing it", async ({ page, wasm }) => {
    test.skip(!wasm, "the field guide needs WebAssembly");
    test.fail(true, known.fieldGuideSearch);
    await settled(page, "/demos/");
    const guide = await reach(page, "A whole app");
    await centre(guide);
    await press(guide.getByRole("textbox", { name: /Search/ }));
    await page.keyboard.type("gannet");
    await expect(guide.getByRole("button")).toHaveCount(1);
  });

  test("the motion demo's puck springs after a press", async ({ page, errors, wasm }) => {
    test.skip(!wasm, "the motion demo needs WebAssembly");
    await settled(page, "/demos/");
    // The tray has no value to say, so it is a named group, not a slider
    // (ARIA asks a slider for its value).
    const tray = (await reach(page, "Motion")).getByRole("group", { name: /Spring tray/ });
    await centre(tray);
    const before = await signature(demo(page, "Motion"));
    const { box } = await centreOf(tray);
    await page.mouse.click(box.x + 40, box.y + box.height / 2);
    await expect.poll(() => signature(demo(page, "Motion"))).not.toBe(before);
    expect(unexpected(errors)).toEqual([]);
  });

  for (const heading of ["A shell you rewrite", "3D you can orbit", "A shader effect", "A whole app", "Motion"]) {
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
  test("loads with nothing in its console; the Pantry and Orbit run", async ({ page, errors }) => {
    await settled(page, "/");
    await expect(page.getByLabel("The Pantry, running")).toBeVisible();
    // Orbit is made as the reader nears the showcase under this heading.
    await centre(headingOf(page, "See it run"));
    const canvas = page.locator("canvas.qq-view3d").first();
    await centre(canvas);
    await expectFramesAdvance(canvas);
    expect(unexpected(errors)).toEqual([]);
  });
});

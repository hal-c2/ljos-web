// The demos: the front page's Pantry and Orbit, and /demos/' five,
// each driven by the input it is for. A demo is the slot under its
// heading; it runs without a press.
import { centre, centreOf, drag, expect, expectFramesAdvance, open, pageScroll, pinch, press, signature, test, unexpected } from "./fixtures.js";
import { demo as known, sourceView } from "./known.js";

// A demo on /demos/: the section its heading stands at the top of,
// which holds its words and the running demo.
function demo(page, heading) {
  return page.locator("#app div.qq-text").filter({ hasText: new RegExp(`^${heading}$`) }).first().locator("xpath=../..");
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
    const orbit = demo(page, "3D you can orbit");
    await centre(orbit);
    await expectFramesAdvance(orbit.locator("canvas").first());
    await expect.poll(() => orbit.locator("canvas.qq-view3d").evaluate((canvas) => canvas.$view3d?.frames ?? 0)).toBeGreaterThan(10);
  });

  test("Orbit is drawn by the renderer the page names", async ({ page }) => {
    test.fixme(true, known.orbitRenderer);
    await settled(page, "/demos/");
    const orbit = demo(page, "3D you can orbit");
    await expect.poll(() => orbit.locator("canvas.qq-view3d").evaluate((canvas) => canvas.$view3d?.backend)).toBe("wgpu");
  });

  test("Orbit turns under a sideways drag and zooms under a pinch", async ({ page, errors }) => {
    await settled(page, "/demos/");
    const canvas = demo(page, "3D you can orbit").locator("canvas.qq-view3d");
    await centre(canvas);
    const { x, y } = await centreOf(canvas);
    const shot = () => canvas.screenshot();
    const before = await shot();
    await drag(page, { x: x - 80, y }, { x: x + 80, y });
    expect(Buffer.compare(before, await shot()) !== 0, "the scene turned").toBe(true);
    await pinch(page, x, y);
    expect(unexpected(errors)).toEqual([]);
  });

  test("Orbit takes an up-and-down drag; the page does not", async ({ page }) => {
    test.fixme(true, known.orbitVerticalDrag);
    await settled(page, "/demos/");
    const canvas = demo(page, "3D you can orbit").locator("canvas.qq-view3d");
    await centre(canvas);
    const { x, y } = await centreOf(canvas);
    const scrolled = await pageScroll(page);
    await drag(page, { x, y: y - 60 }, { x, y: y + 60 });
    expect(await pageScroll(page), "the page stayed where it was").toBe(scrolled);
  });

  test("the shader effect keeps drawing frames", async ({ page, errors }) => {
    await settled(page, "/demos/");
    const shader = demo(page, "A shader effect");
    await centre(shader);
    await expectFramesAdvance(shader);
    expect(unexpected(errors)).toEqual([]);
  });

  test("the field guide shows the species a reader picks, and marks it seen", async ({ page, errors }) => {
    await settled(page, "/demos/");
    const guide = demo(page, "A whole app");
    await centre(guide);
    await press(guide.getByRole("button", { name: "Arctic tern" }));
    await expect(guide, "its page opens on the right").toContainText("Sterna paradisaea · breeding");
    await press(guide.getByRole("checkbox").first());
    await expect(guide).toContainText("Seen 1 of 9");
    expect(unexpected(errors)).toEqual([]);
  });

  test("the field guide's search takes what a reader types after pressing it", async ({ page }) => {
    test.fixme(true, known.fieldGuideSearch);
    await settled(page, "/demos/");
    const guide = demo(page, "A whole app");
    await centre(guide);
    await press(guide.getByRole("textbox", { name: /Search/ }));
    await page.keyboard.type("gannet");
    await expect(guide.getByRole("button")).toHaveCount(1);
  });

  test("the motion demo's puck springs after a press", async ({ page, errors }) => {
    await settled(page, "/demos/");
    const tray = demo(page, "Motion").getByRole("slider").first();
    await centre(tray);
    const before = await signature(demo(page, "Motion"));
    const { box } = await centreOf(tray);
    await page.mouse.click(box.x + 40, box.y + box.height / 2);
    await expect.poll(() => signature(demo(page, "Motion"))).not.toBe(before);
    expect(unexpected(errors)).toEqual([]);
  });

  for (const heading of ["A shell you rewrite", "3D you can orbit", "A shader effect", "A whole app", "Motion"]) {
    test(`${heading}: show source opens its QML`, async ({ page }) => {
      test.fixme(true, sourceView);
      await settled(page, "/demos/");
      const slot = demo(page, heading);
      await press(slot.getByRole("button", { name: /source/i }));
      await expect(slot.getByRole("textbox")).toContainText("import");
    });
  }
});

test.describe("the front page", () => {
  test("loads with nothing in its console; the Pantry and Orbit run", async ({ page, errors }) => {
    await settled(page, "/");
    await expect(page.getByLabel("The Pantry, running")).toBeVisible();
    const canvas = page.locator("canvas.qq-view3d").first();
    await centre(canvas);
    await expectFramesAdvance(canvas);
    expect(unexpected(errors)).toEqual([]);
  });
});

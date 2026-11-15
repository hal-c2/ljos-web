// What a page runs, and when (site-ljos/README.md, "What runs, and
// when"): nothing runs until the reader asks; a plain example runs when
// its picture is pressed or its code edited, with no button over it; a
// window, 3D, what moves on its own and every demo but the Pantry (which
// holds still, as a plain example does) wait for Run, which a reader
// reaches with the mouse, the keyboard or a screen reader; at most three
// are started at once; what is out of view or in a hidden tab pauses
// and resumes when it is back; reduced motion softens and never stops;
// the pictures follow light and dark.
import { centre, classify, expect, frames, liveBlock, livePages, open, press, runButton, test, unexpected } from "./fixtures.js";
import { brokenExample } from "./known.js";

const examples = livePages().flatMap(({ route, examples }) => examples.filter((example) => !brokenExample(route, example.index)).map((example) => ({ route, example })));
const waits = ({ example }) =>
  example.files.some(({ code }) => {
    const kind = classify(code);
    return kind.window || kind.threeD || kind.moves || kind.video;
  });
const plain = examples.find((each) => !waits(each));
const window = examples.find(({ example }) => classify(example.code).window);

// A demo on /demos/ by its heading, as demos.spec.js finds it.
function demo(page, heading) {
  return page.locator("#app div.qq-text").filter({ hasText: new RegExp(`^${heading}$`) }).first().locator("xpath=../..");
}
const RUN = {
  "3D you can orbit": "Run the 3D demo",
  "A shader effect": "Run the shader demo",
  "A whole app": "Run the field guide",
  Motion: "Run the motion demo",
};
async function start(page, heading) {
  const slot = demo(page, heading);
  await centre(slot);
  const button = runButton(slot, RUN[heading]);
  await press(button);
  await expect(button, `${heading} starts`).toBeHidden();
  return slot;
}
const drawn = (canvas) => canvas.evaluate((element) => element.$view3d?.frames ?? 0);
// How many pictures the view draws in `ms`.
async function drawsIn(canvas, ms) {
  const before = await drawn(canvas);
  await canvas.page().waitForTimeout(ms);
  return (await drawn(canvas)) - before;
}

test.describe("examples", () => {
  test.skip(({ wasm }) => !wasm, "without WebAssembly nothing runs");

  test("the docs have plain examples and window examples", () => {
    expect(plain, "a plain example").toBeTruthy();
    expect(window, "a window example").toBeTruthy();
  });

  test("a plain example has no Run button, and runs when its picture is pressed", async ({ page, errors }) => {
    await open(page, plain.route);
    const block = liveBlock(page, plain.example.index);
    await centre(block.picture);
    await page.waitForTimeout(500);
    await expect(runButton(block.stage), "it has no Run button").toHaveCount(0);
    await expect(block.picture, "it does not run until asked").toBeVisible();
    await press(block.picture);
    await expect(block.picture, "it runs in its picture's place").toBeHidden({ timeout: 30_000 });
    expect(unexpected(errors)).toEqual([]);
  });

  test("a window example waits for Run, which the keyboard reaches and presses", async ({ page, errors }) => {
    await open(page, window.route);
    const block = liveBlock(page, window.example.index);
    await centre(block.picture);
    const button = runButton(block.stage);
    await expect(button, "its Run button is shown, named for a screen reader").toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(500);
    await expect(block.picture, "it does not run until asked").toBeVisible();
    // As a keyboard reader goes: into the code above it, out with
    // Escape (the editor keeps Tab for indenting), and Tab once to Run.
    await press(block.block.getByRole("textbox").first());
    await expect(block.picture, "the code taking focus does not run it").toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(block.picture, "Enter on Run runs it").toBeHidden({ timeout: 30_000 });
    expect(unexpected(errors)).toEqual([]);
  });
});

test.describe("/demos/", () => {
  test.skip(({ wasm }) => !wasm, "without WebAssembly nothing runs");

  test("every demo but the Pantry waits for Run", async ({ page }) => {
    await open(page, "/demos/");
    const pantry = demo(page, "A shell you rewrite");
    await centre(pantry);
    await expect(runButton(pantry), "the Pantry runs with the page").toHaveCount(0);
    await expect(pantry.getByLabel("The Pantry, running")).toBeVisible();
    for (const [heading, name] of Object.entries(RUN)) {
      const slot = demo(page, heading);
      await centre(slot);
      await expect(runButton(slot, name), heading).toBeVisible();
    }
  });

  test("at most three are started at once; a fourth stops the first started out of view", async ({ page, errors }) => {
    await open(page, "/demos/");
    for (const heading of ["3D you can orbit", "A shader effect", "A whole app", "Motion"]) await start(page, heading);
    // The 3D demo started first, and is out of view now: it is the one
    // stopped, and waits for its Run again; the others keep their place.
    await centre(demo(page, "3D you can orbit"));
    await expect(runButton(demo(page, "3D you can orbit"), RUN["3D you can orbit"])).toBeVisible();
    for (const heading of ["A shader effect", "A whole app", "Motion"]) {
      await centre(demo(page, heading));
      await expect(runButton(demo(page, heading), RUN[heading]), `${heading} still runs`).toBeHidden();
    }
    expect(unexpected(errors)).toEqual([]);
  });

  test("a demo out of view pauses, and resumes back in view", async ({ page }) => {
    await open(page, "/demos/");
    const canvas = (await start(page, "3D you can orbit")).locator("canvas.qq-view3d");
    await expect.poll(() => drawn(canvas), { message: "it draws" }).toBeGreaterThan(5);
    await centre(demo(page, "Motion"));
    await frames(page);
    expect(await drawsIn(canvas, 1000), "out of view, it draws nothing").toBe(0);
    await centre(canvas);
    await expect.poll(() => drawsIn(canvas, 300), { message: "back in view, it draws again" }).toBeGreaterThan(2);
  });

  test("a demo in a hidden tab pauses, and resumes when the tab is shown", async ({ page }) => {
    await open(page, "/demos/");
    const canvas = (await start(page, "3D you can orbit")).locator("canvas.qq-view3d");
    await expect.poll(() => drawn(canvas), { message: "it draws" }).toBeGreaterThan(5);
    // As a browser tells a page its tab is hidden, and shown again.
    const tab = (state) =>
      page.evaluate((state) => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
        Object.defineProperty(document, "hidden", { configurable: true, get: () => state === "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
      }, state);
    await tab("hidden");
    await frames(page);
    expect(await drawsIn(canvas, 1000), "hidden, it draws nothing").toBe(0);
    await tab("visible");
    await expect.poll(() => drawsIn(canvas, 300), { message: "shown, it draws again" }).toBeGreaterThan(2);
  });

  test("the header's Motion toggle says what it does and is kept", async ({ page }) => {
    await open(page, "/demos/");
    const toggle = page.getByRole("checkbox", { name: "Reduce motion" });
    await expect(toggle, "motion is full by default").not.toBeChecked();
    await press(toggle);
    await expect(toggle).toBeChecked();
    await page.reload();
    await page.waitForSelector('#app[data-ljos-hydrated="true"]');
    await expect(page.getByRole("checkbox", { name: "Reduce motion" }), "the choice is kept").toBeChecked();
    await press(page.getByRole("checkbox", { name: "Reduce motion" }));
    await expect(page.getByRole("checkbox", { name: "Reduce motion" })).not.toBeChecked();
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test.skip(({ wasm }) => !wasm, "without WebAssembly nothing runs");

  test("the header says motion is reduced, and the 3D and shader demos still move", async ({ page }) => {
    await open(page, "/demos/");
    await expect(page.getByRole("checkbox", { name: "Reduce motion" }), "the system's setting is followed").toBeChecked();
    const canvas = (await start(page, "3D you can orbit")).locator("canvas.qq-view3d");
    await expect.poll(() => drawsIn(canvas, 500), { message: "the 3D demo still turns" }).toBeGreaterThan(2);
    const shader = (await start(page, "A shader effect")).locator("canvas").first();
    const before = await shader.screenshot();
    await expect.poll(async () => Buffer.compare(before, await shader.screenshot()) !== 0, { message: "the shader still moves", timeout: 5_000 }).toBe(true);
  });
});

test("a picture is drawn on the page's own paper, light or dark", async ({ page }) => {
  await open(page, examples[0].route);
  const picture = page.locator('img[alt="What this example draws"]').first();
  await expect(picture).toHaveAttribute("src", /Examples\/[0-9a-f]{16}\.png$/);
  await press(page.getByRole("button", { name: "Use the dark theme" }));
  await expect(picture).toHaveAttribute("src", /Examples\/[0-9a-f]{16}-dark\.png$/);
  await expect.poll(() => picture.evaluate((img) => img.complete && img.naturalWidth > 0), { message: "the dark picture is there" }).toBe(true);
});

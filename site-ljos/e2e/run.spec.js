// What a page runs, and when (site-ljos/README.md, "What runs, and
// when"): nothing runs until the reader asks. Every example and every
// demo but the Pantry (which holds still, as a page does) stands as its
// picture with a Run control in the toolbar under it, never over what
// it draws, which a reader reaches with the mouse, the keyboard or a
// screen reader, and which says what happens: Run, then Starting, then,
// live, Stop (an example) or Pause and Resume (a demo); a press on the
// picture or an edit of the code runs it too. At
// most three are started at once; a demo out of view or in a hidden
// tab pauses and resumes when it is back, and an example stays as the
// reader left it; reduced motion softens and
// never stops; one picture stands on light and dark.
import AxeBuilder from "@axe-core/playwright";
import { centre, classify, expect, frames, liveBlock, livePages, open, pageScroll, press, run, runButton, test, unexpected } from "./fixtures.js";
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
const WHAT = {
  "3D you can orbit": "the 3D demo",
  "A shader effect": "the shader demo",
  "A whole app": "the field guide",
  Motion: "the motion demo",
};
const RUN = Object.fromEntries(Object.entries(WHAT).map(([heading, what]) => [heading, `Run ${what}`]));
async function start(page, heading) {
  const slot = demo(page, heading);
  await centre(slot);
  const button = runButton(slot, RUN[heading]);
  await press(button);
  await expect(button, `${heading} starts`).toBeHidden();
  return slot;
}
// From now on, every name `control` is given and every sentence said in
// the page's live region, in order: a phase that passes within one
// frame is still in the list.
function listen(control) {
  return control.evaluate((control) => {
    const heard = (window.heard = { names: [], said: [] });
    heard.names.push(control.getAttribute("aria-label"));
    new MutationObserver(() => {
      const name = control.getAttribute("aria-label");
      if (name !== heard.names.at(-1)) heard.names.push(name);
    }).observe(control, { attributes: true, attributeFilter: ["aria-label"] });
    new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes) if (node.textContent && record.target.closest?.("[aria-live]")) heard.said.push(node.textContent);
    }).observe(document.body, { childList: true, subtree: true });
  });
}
const heard = (page) => page.evaluate(() => window.heard);

// Into a block's code as a reader goes, and on once the editor is there:
// until CodeMirror has taken the field's place (attach.js, loaded on the
// first press), a key lands in the field under it, where Enter is an
// edit, and an edit runs the example without its Run.
async function intoCode(block) {
  await press(block.block.getByRole("textbox").first());
  await expect(block.block.locator(".cm-editor.cm-focused"), "the code editor has the keyboard").toBeVisible({ timeout: 30_000 });
}

// What axe finds on the page (WCAG 2.2 A and AA, as tests/a11y.spec.js
// asks), said so a failure names the rule, the element and why.
async function violations(page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .disableRules(["scrollable-region-focusable"])
    .analyze();
  return violations.flatMap(({ id, help, nodes }) => nodes.map((node) => `${id}: ${help} — ${node.target.join(" ")} — ${node.failureSummary?.split("\n").slice(1).join(" ").trim()}`));
}

const drawn = (canvas) => canvas.evaluate((element) => element.$view3d?.frames ?? 0);
// How many pictures the view draws in `ms`.
// Kept drawing, not one repaint: more than one frame in a second. A rate
// is not asked for, since a machine with no GPU draws the 3D demo at a
// few frames a second.
const keepsDrawing = (canvas) => drawsIn(canvas, 1_000);

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

  test("a plain example waits for its Run too, and runs when its picture is pressed", async ({ page, errors }) => {
    await open(page, plain.route);
    const block = liveBlock(page, plain.example.index);
    await centre(block.picture);
    await expect(runButton(block.toolbar), "its Run is in its toolbar").toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(500);
    await expect(block.picture, "it does not run until asked").toBeVisible();
    await press(block.picture);
    await expect(block.picture, "it runs in its picture's place").toBeHidden({ timeout: 30_000 });
    expect(unexpected(errors)).toEqual([]);
  });

  test("an edit that does not compile says so, and its control offers to stop it", async ({ page, errors }) => {
    await open(page, plain.route);
    const block = liveBlock(page, plain.example.index);
    await centre(block.picture);
    const run = runButton(block.toolbar);
    await expect(run).toBeVisible({ timeout: 30_000 });
    await listen(run);
    // The reader's first act is to break it: the edit asks it to run,
    // and there is no last good result to keep.
    await intoCode(block);
    await page.keyboard.press("Control+Home");
    await page.keyboard.type("Broken {");
    await expect(runButton(block.toolbar, "Stop this example"), "its control offers to stop it").toBeVisible({ timeout: 30_000 });
    const { names, said } = await heard(page);
    expect(names, "the control's name, phase by phase").toEqual(["Run this example", "Starting this example…", "Stop this example"]);
    expect(said, "what a screen reader is told").toEqual(["Starting this example…", "This example did not compile"]);
    // The compile's own complaint is the one error expected.
    expect(unexpected(errors).filter((text) => !/ShellLoader|Main\.qml/.test(text))).toEqual([]);
  });

  test("a finger that scrolls the page over a picture runs nothing; a tap on it runs it", async ({ page, errors }) => {
    await open(page, plain.route);
    const block = liveBlock(page, plain.example.index);
    await centre(block.picture);
    await expect(runButton(block.toolbar)).toBeVisible({ timeout: 30_000 });
    const box = await block.picture.boundingBox();
    const at = { x: box.x + box.width / 4, y: box.y + box.height / 2 };
    const before = await pageScroll(page);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, y, x = at.x) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: y === undefined ? [] : [{ x, y, id: 1 }] });
    // The session is let go even when a step fails, so it never outlives
    // the test.
    try {
      await touch("touchStart", at.y);
      for (let step = 1; step <= 8; step++) await touch("touchMove", at.y - 10 * step);
      await touch("touchEnd");
      await page.waitForTimeout(500);
      await expect.poll(() => pageScroll(page), { message: "the swipe scrolled the page" }).not.toEqual(before);
      await expect(runButton(block.toolbar), "a swipe over the picture leaves it its picture").toBeVisible();
      await expect(block.picture).toBeVisible();
      // The swipe moved the picture: the tap lands where it stands now.
      const now = await block.picture.boundingBox();
      await touch("touchStart", now.y + now.height / 2, now.x + now.width / 4);
      await touch("touchEnd");
    } finally {
      await cdp.detach();
    }
    await expect(block.picture, "a tap runs it").toBeHidden({ timeout: 30_000 });
    expect(unexpected(errors)).toEqual([]);
  });

  test("a window example waits for Run, which the keyboard reaches and presses", async ({ page, errors }) => {
    await open(page, window.route);
    const block = liveBlock(page, window.example.index);
    await centre(block.picture);
    const button = runButton(block.toolbar);
    await expect(button, "its Run button is shown, named for a screen reader").toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(500);
    await expect(block.picture, "it does not run until asked").toBeVisible();
    // As a keyboard reader goes: into the code above it, out with
    // Escape (the editor keeps Tab for indenting), and Tab once to Run,
    // first in the toolbar under the code.
    await intoCode(block);
    await expect(block.picture, "the code taking focus does not run it").toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(block.picture, "Enter on Run runs it").toBeHidden({ timeout: 30_000 });
    expect(unexpected(errors)).toEqual([]);
  });

  test("Run goes on to Starting and Stop, says so, and keeps the keyboard where it was", async ({ page, errors }) => {
    await open(page, window.route);
    const block = liveBlock(page, window.example.index);
    await centre(block.picture);
    const run = runButton(block.toolbar);
    await expect(run).toBeVisible({ timeout: 30_000 });
    await listen(run);
    // The keyboard's way to Run: out of the code with Escape, Tab once.
    await intoCode(block);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    const stop = runButton(block.toolbar, "Stop this example");
    await expect(stop, "live, the control offers to stop it").toBeVisible({ timeout: 30_000 });
    const { names, said } = await heard(page);
    expect(names, "the control's name, phase by phase").toEqual(["Run this example", "Starting this example…", "Stop this example"]);
    const regions = await page.evaluate(() => [...document.querySelectorAll("[aria-live]")].map((region) => region.outerHTML));
    expect(said, `what a screen reader is told; the page's live regions now: ${regions.join(" ") || "none"}`).toEqual(["Starting this example…", "This example runs"]);
    // The keyboard is still on the control: Tab on to Edit, and Space
    // on it takes the reader to the code. A button's focus is the
    // runtime's, as an item's is in Qt, not the page's, so it shows in
    // what the next keys do.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Space");
    await expect(block.block.locator(".cm-editor.cm-focused"), "Edit takes the reader to the code").toBeVisible();
    expect(unexpected(errors)).toEqual([]);
  });

  test("Source hides an example's code and shows it again, and Edit brings it back to the reader", async ({ page, errors }) => {
    await open(page, window.route);
    const block = liveBlock(page, window.example.index);
    await centre(block.picture);
    const source = runButton(block.toolbar, "Show the source");
    // The code as written: its field, until a press makes it the editor.
    const code = block.block.getByRole("textbox").first();
    await expect(source, "the toolbar has Source, last").toBeVisible({ timeout: 30_000 });
    await expect(source, "pressed while the code shows").toHaveAttribute("aria-pressed", "true");
    await expect(code).toBeVisible();
    // The keyboard's way to Source: out of the code with Escape, then
    // Tab past Run and Edit (Reset shows only once there is an edit).
    await intoCode(block);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Space");
    await expect(code, "Source pressed again hides the code").toBeHidden();
    await expect(source).toHaveAttribute("aria-pressed", "false");
    await expect(block.picture, "the example stays as it was").toBeVisible();
    await page.keyboard.press("Space");
    await expect(code, "and shows it again").toBeVisible();
    await expect(source).toHaveAttribute("aria-pressed", "true");
    await source.click();
    await runButton(block.toolbar, "Edit Main.qml").click();
    await expect(block.block.locator(".cm-editor.cm-focused"), "Edit shows the code and takes the reader to it").toBeVisible();
    await expect(source).toHaveAttribute("aria-pressed", "true");
    expect(unexpected(errors)).toEqual([]);
  });

  // Reset writes the code as written back into its editors, which an
  // edit's own debounce hears; it runs that code once, not again when
  // the debounce runs out.
  test("Reset puts the code back as written and runs it once", async ({ page, errors }) => {
    await open(page, "/ui/items/");
    const block = await run(page, 1);
    await expect(block.values, "it ran, and said what it hit").toContainText("hit: under");
    let made = 0;
    page.on("console", (message) => /hit: /.test(message.text()) && made++);
    await intoCode(block);
    await page.keyboard.press("Control+Home");
    await page.keyboard.type("// edited\n");
    await expect.poll(() => made, { message: "the edit ran", timeout: 30_000 }).toBe(1);
    made = 0;
    await press(runButton(block.toolbar, "Reset this example to as written"));
    await expect.poll(() => made, { message: "the code as written ran", timeout: 30_000 }).toBe(1);
    // The debounce's 300 ms, and a compile and a reload after it.
    await page.waitForTimeout(1_500);
    expect(made, "and ran once").toBe(1);
    expect(unexpected(errors)).toEqual([]);
  });

  // Three ten-pixel items in a Row: a sliver, which once stood as a
  // line across the page. It runs in a window a reader can see, at its
  // own size in the middle of it (a window's least size never stretches
  // an app), and what it picked, under it, is what shows it ran.
  test("an example that draws a sliver runs in a window a reader can see", async ({ page, errors }) => {
    await open(page, "/data/repeater-and-delegates/");
    const block = await run(page, 0);
    const box = await block.stage.boundingBox();
    expect(box.height, "the window is as tall as the least window").toBeGreaterThanOrEqual(96);
    expect(box.width, "and twice as wide").toBeGreaterThanOrEqual(192);
    const app = await block.running.boundingBox();
    expect(app.width, "the app keeps its own width").toBeLessThan(40);
    expect(Math.abs(app.x + app.width / 2 - (box.x + box.width / 2)), "in the middle of the window").toBeLessThan(2);
    await expect(block.values, "what it picked says it ran").toContainText("picked: d2");
    expect(unexpected(errors)).toEqual([]);
  });

  test("an example scrolled away or in a hidden tab keeps what the reader did in it, and says nothing", async ({ page, errors }) => {
    await open(page, "/ui/text-input/");
    const block = liveBlock(page, 0);
    await centre(block.picture);
    const run = runButton(block.toolbar);
    await expect(run).toBeVisible({ timeout: 30_000 });
    await listen(run);
    await press(run);
    await expect(runButton(block.toolbar, "Stop this example"), "it runs").toBeVisible({ timeout: 30_000 });
    const field = block.running.locator("textarea").first();
    await press(field);
    await page.keyboard.press("End");
    await page.keyboard.type(" ljós");
    await expect(field, "what the reader typed is in it").toHaveValue(/ ljós$/);
    // Away: scrolled past, then its tab hidden and shown again.
    await centre(page.locator('img[alt="What this example draws"]').last());
    await expect(block.stage, "it is scrolled past").not.toBeInViewport();
    await page.waitForTimeout(1_000);
    await page.evaluate(() => {
      for (const state of ["hidden", "visible"]) {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
        Object.defineProperty(document, "hidden", { configurable: true, get: () => state === "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
      }
    });
    await centre(block.stage);
    await expect(runButton(block.toolbar, "Stop this example"), "back, it is still live").toBeVisible();
    await expect(field, "back, what the reader typed is still in it").toHaveValue(/ ljós$/);
    const { names, said } = await heard(page);
    expect(names, "the control did not go back to Starting").toEqual(["Run this example", "Starting this example…", "Stop this example"]);
    expect(said, "scrolled past and back, it says nothing more").toEqual(["Starting this example…", "This example runs"]);
    expect(unexpected(errors)).toEqual([]);
  });

  test("an example's toolbar gives a reader all axe asks, light and dark", async ({ page }) => {
    for (const scheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: scheme });
      await open(page, window.route);
      const block = liveBlock(page, window.example.index);
      await centre(block.picture);
      await expect(runButton(block.toolbar)).toBeVisible({ timeout: 30_000 });
      expect(await violations(page), `${scheme}, with Run in the toolbar`).toEqual([]);
      await press(runButton(block.toolbar));
      await expect(runButton(block.toolbar, "Stop this example")).toBeVisible({ timeout: 30_000 });
      expect(await violations(page), `${scheme}, live, with Stop in the toolbar`).toEqual([]);
    }
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
    await page.waitForTimeout(1_000);
    expect(await drawsIn(canvas, 1000), "out of view, it draws nothing").toBe(0);
    await centre(canvas);
    await expect.poll(() => keepsDrawing(canvas), { message: "back in view, it draws again" }).toBeGreaterThan(1);
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
    // A picture already under way when the tab was hidden is let
    // finish: a software renderer takes most of a second over one.
    await frames(page);
    await page.waitForTimeout(1_000);
    expect(await drawsIn(canvas, 1000), "hidden, it draws nothing").toBe(0);
    await tab("visible");
    await expect.poll(() => keepsDrawing(canvas), { message: "shown, it draws again" }).toBeGreaterThan(1);
  });

  test("a demo's Run goes on to Pause, which holds it where it is until Resume", async ({ page, errors }) => {
    await open(page, "/demos/");
    const slot = demo(page, "3D you can orbit");
    await centre(slot);
    const run = runButton(slot, RUN["3D you can orbit"]);
    await expect(run).toBeVisible();
    await listen(run);
    // By the mouse here: the keys act on the same control (the
    // examples' tests above), and a press leaves the keyboard where it
    // was, so a running demo's own fields have it.
    await press(run);
    const pause = runButton(slot, "Pause the 3D demo");
    await expect(pause, "live, the control offers to pause").toBeVisible({ timeout: 30_000 });
    const canvas = slot.locator("canvas.qq-view3d");
    await expect.poll(() => drawsIn(canvas, 500), { message: "it runs" }).toBeGreaterThan(0);
    await press(pause);
    const resume = runButton(slot, "Resume the 3D demo");
    await expect(resume, "paused, Resume goes on from there").toBeVisible();
    // A picture already under way when it paused is let finish.
    await frames(page);
    await page.waitForTimeout(1_000);
    expect(await drawsIn(canvas, 1_000), "paused, it draws nothing").toBe(0);
    await press(resume);
    await expect(pause).toBeVisible();
    await expect.poll(() => drawsIn(canvas, 500), { message: "and runs again" }).toBeGreaterThan(0);
    const { names, said } = await heard(page);
    expect(names).toEqual(["Run the 3D demo", "Starting the 3D demo…", "Pause the 3D demo", "Resume the 3D demo", "Pause the 3D demo"]);
    expect(said).toEqual(["Starting the 3D demo…", "The 3D demo runs", "The 3D demo is paused", "The 3D demo runs"]);
    expect(unexpected(errors)).toEqual([]);
  });

  test("a demo's Run and Pause give a reader all axe asks, light and dark", async ({ page }) => {
    for (const scheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: scheme });
      await open(page, "/demos/");
      const slot = demo(page, "A whole app");
      await centre(slot);
      await expect(runButton(slot, RUN["A whole app"])).toBeVisible();
      expect(await violations(page), `${scheme}, with Run under the pictures`).toEqual([]);
      await press(runButton(slot, RUN["A whole app"]));
      await expect(runButton(slot, "Pause the field guide")).toBeVisible({ timeout: 30_000 });
      // Pause is offered once the app is drawn, as it fades in over its
      // picture; its colours are its own once the fade is done and the
      // picture gone, and before then axe reads them half blended. A demo
      // has a picture for each scheme, and the other scheme's is hidden
      // all along, so it is the shown one that is waited for.
      await expect(slot.locator("img:visible"), "the app has faded in over its picture").toHaveCount(0, { timeout: 10_000 });
      expect(await violations(page), `${scheme}, live, with Pause under it`).toEqual([]);
    }
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
    // Full motion was chosen, though the browser asks for none less: the
    // choice still stands once the browser asks for less, now and on the
    // next load.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.getByRole("checkbox", { name: "Reduce motion" }), "the browser asking for less does not undo the reader's choice").not.toBeChecked();
    await page.reload();
    await page.waitForSelector('#app[data-ljos-hydrated="true"]');
    await expect(page.getByRole("checkbox", { name: "Reduce motion" }), "the reader's choice is kept over the browser's").not.toBeChecked();
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test.skip(({ wasm }) => !wasm, "without WebAssembly nothing runs");

  test("the header says motion is reduced, and the 3D and shader demos still move", async ({ page }) => {
    await open(page, "/demos/");
    await expect(page.getByRole("checkbox", { name: "Reduce motion" }), "the system's setting is followed").toBeChecked();
    const canvas = (await start(page, "3D you can orbit")).locator("canvas.qq-view3d");
    await expect.poll(() => keepsDrawing(canvas), { message: "the 3D demo still turns" }).toBeGreaterThan(1);
    const slot = await start(page, "A shader effect");
    const shader = slot.locator("canvas.qq-shader").first();
    // Drawn, and its picture gone: a first frame over the picture, or
    // the picture going, is not the shader moving.
    await expect.poll(() => shader.evaluate((canvas) => canvas.$effect?.$shader?.drawn() ?? 0), { message: "the shader draws", timeout: 30_000 }).toBeGreaterThan(0);
    await expect(slot.locator("img:visible"), "its picture is gone").toHaveCount(0, { timeout: 10_000 });
    // Changing over two windows, one after the other: one frame painted
    // and then held would change the first at most.
    for (const window of ["first", "then"]) {
      const before = await shader.screenshot();
      await expect.poll(async () => Buffer.compare(before, await shader.screenshot()) !== 0, { message: `the shader still moves (${window})`, timeout: 5_000 }).toBe(true);
    }
  });
});

// One picture for both schemes, opaque: the page never shows through
// it. The running example paints its own surface and text from the
// palette, light or dark (themes.spec.js reads them in dark).
test("a picture is the same on the page's light or dark, and the page never shows through it", async ({ page }) => {
  await open(page, examples[0].route);
  const picture = page.locator('img[alt="What this example draws"]').first();
  await expect(picture).toHaveAttribute("src", /Examples\/[0-9a-f]{16}\.png$/);
  const src = await picture.getAttribute("src");
  // Its pixels, decoded: nowhere can the page be seen through it.
  const clear = await picture.evaluate(async (img) => {
    const bitmap = await createImageBitmap(await (await fetch(img.src)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    let clear = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 255) clear++;
    return clear;
  });
  expect(clear, "no pixel lets the page through").toBe(0);
  await press(page.getByRole("button", { name: "Use the dark theme" }));
  await expect(picture, "the same picture stands on the dark page").toHaveAttribute("src", src);
});

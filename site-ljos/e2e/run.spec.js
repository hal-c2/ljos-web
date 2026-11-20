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
import { animationFrames, centre, classify, expect, liveBlock, livePages, open, pageScroll, press, run, runButton, test, unexpected } from "./fixtures.js";
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

// Waits until the view has drawn `count` more pictures, however long a
// machine takes over each: counted, not a rate, since a machine with no
// GPU draws the 3D demo at a few frames a second. Two is kept drawing,
// not one repaint.
const drawsMore = (canvas, count, what) =>
  test.step(what, () =>
    canvas.evaluate(
      (element, count) =>
        new Promise((done) => {
          const from = element.$view3d?.frames ?? 0;
          const look = () => ((element.$view3d?.frames ?? 0) - from >= count ? done() : requestAnimationFrame(look));
          look();
        }),
      count,
    ),
  );
const keepsDrawing = (canvas, what) => drawsMore(canvas, 2, what);

// How many of the page's animation frames a stopped view is watched over.
const WATCHED = 60;

// What a stopped view draws over WATCHED of the page's animation frames,
// once its scene's clock is held and no picture it was asked for is
// still to be drawn: a picture already under way when it stopped is let
// finish, however long a software renderer takes over it, rather than
// given a second to.
async function drawnWhileStopped(canvas, what) {
  await test.step(`${what}: the scene is held and no picture is due`, () =>
    canvas.evaluate(
      (element) =>
        new Promise((done) => {
          const look = () => (!element.$view3d.view.parent.turning && !element.$view3d.due ? done() : requestAnimationFrame(look));
          look();
        }),
    ),
  );
  return canvas.evaluate(
    (element, count) =>
      new Promise((done) => {
        const from = element.$view3d.frames;
        let left = count;
        const next = () => (--left <= 0 ? done(element.$view3d.frames - from) : requestAnimationFrame(next));
        requestAnimationFrame(next);
      }),
    WATCHED,
  );
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
    await animationFrames(page, 30);
    await expect(block.picture, "it does not run until asked, 30 of the page's frames on").toBeVisible();
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
      await animationFrames(page, 30);
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
    await animationFrames(page, 30);
    await expect(block.picture, "it does not run until asked, 30 of the page's frames on").toBeVisible();
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

  // An example stopped with an edit keeps it for when it runs again; an
  // undo that puts the code back as written, with nothing running to
  // hear it, is an edit all the same: Run runs the code the reader sees.
  test("Run after an edit is undone runs the code as it shows", async ({ page, errors }) => {
    await open(page, "/ui/items/");
    const block = await run(page, 1);
    await expect(block.values, "it ran, and said what it hit").toContainText("hit: under");
    await intoCode(block);
    await page.keyboard.press("Control+Home");
    // An edit that does not compile, so that what runs shows which
    // code it was.
    await page.keyboard.type("@");
    await expect(block.told, "the edit ran, and did not compile").not.toBeEmpty({ timeout: 30_000 });
    await press(runButton(block.toolbar, "Stop this example"));
    await expect(runButton(block.toolbar), "stopped").toBeVisible({ timeout: 30_000 });
    await intoCode(block);
    await page.keyboard.press("Control+z");
    await expect(runButton(block.toolbar, "Reset this example to as written"), "the code is back as written").toBeHidden();
    let made = 0;
    page.on("console", (message) => /hit: /.test(message.text()) && made++);
    await press(runButton(block.toolbar));
    await expect.poll(() => made, { message: "the code as written ran", timeout: 30_000 }).toBe(1);
    // The one error is the edit's own complaint that it does not compile.
    expect(unexpected(errors).filter((text) => !/ShellLoader|Main\.qml/.test(text))).toEqual([]);
  });

  // An edit made while stopped waits out its debounce; Run pressed before
  // it runs out runs the edit, and the debounce does not run it again.
  test("Run during an edit's debounce runs the edit once", async ({ page, errors }) => {
    await open(page, "/ui/items/");
    const block = await run(page, 1);
    await expect(block.values, "it ran, and said what it hit").toContainText("hit: under");
    await press(runButton(block.toolbar, "Stop this example"));
    await expect(runButton(block.toolbar), "stopped").toBeVisible({ timeout: 30_000 });
    // The example's code with what it logs changed, written over it in
    // one edit.
    const written = livePages().find(({ route }) => route === "/ui/items/").examples[1].code;
    const said = 'console.log("hit: " + nameAt(10, 10))';
    expect(written, "the example logs what it hit").toContain(said);
    await intoCode(block);
    await page.keyboard.press("ControlOrMeta+a");
    // Run is brought into view before the edit, so that only the edit, one
    // measure (the edit moves Run) and the click come between them: the
    // debounce must still be waiting when Run is pressed, or this would not
    // test Run during it.
    const runs = runButton(block.toolbar);
    await centre(runs);
    let old = 0;
    let edited = 0;
    page.on("console", (message) => {
      if (/hit: under/.test(message.text())) old++;
      if (/hit: edited/.test(message.text())) edited++;
    });
    const typed = Date.now();
    await page.keyboard.insertText(written.replace(said, 'console.log("hit: edited")'));
    const at = await runs.boundingBox();
    await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2);
    const waited = Date.now() - typed;
    expect(waited, "Run was pressed while the edit's 300 ms debounce still waited").toBeLessThan(300);
    // The click hit Run: Run starts the example as it is pressed, and the
    // edit's debounce, which runs the edit too, only once its 300 ms are
    // out. A click that missed would pass what follows on main as well.
    await expect(runButton(block.toolbar, /^(Starting|Stop) this example/), "the click started it").toBeVisible({ timeout: 2_000 });
    expect(Date.now() - typed, "started by Run, before the edit's debounce ran out").toBeLessThan(300);
    await expect.poll(() => edited, { message: "the edit ran", timeout: 30_000 }).toBe(1);
    // The debounce's 300 ms, and a compile and a reload after it.
    await page.waitForTimeout(1_500);
    expect({ old, edited }, "the edit ran once, and the code before it not at all").toEqual({ old: 0, edited: 1 });
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
    await animationFrames(page, 60);
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

  // No docs page has two blocks of the same code, so one is made: the
  // page's first live block twice, the copy right under it. Its root
  // declares `total`, which its own ping makes 3 as it is made. That
  // ping is not said: the strip listens to a root once it is made.
  test("two blocks of the same code are two examples, each with its own values, edits and run", async ({ page, errors }) => {
    await page.route("**/language/signals-and-handlers/", async (route) => {
      const response = await route.fetch();
      const html = await response.text();
      const json = html.match(/<script type="application\/json" id="ljos-props">([\s\S]*?)<\/script>/)[1];
      const props = JSON.parse(json);
      const at = props.page.blocks.findIndex((block) => block.kind === "live");
      props.page.blocks.splice(at + 1, 0, structuredClone(props.page.blocks[at]));
      await route.fulfill({ response, body: html.replace(json, () => JSON.stringify(props).replaceAll("<", "\\u003c")) });
    });
    await open(page, "/language/signals-and-handlers/");
    const [first, second] = [liveBlock(page, 0), liveBlock(page, 1)];
    // The code as a reader sees it before pressing into it: the editor
    // proper is made only then.
    const code = (block) => block.block.getByRole("textbox", { name: "Edit Main.qml" }).textContent();
    expect(await code(first), "the copy is the same code").toBe(await code(second));
    await run(page, 0);
    await expect(first.values, "the first ran, and shows its root").toContainText("total: 3");
    await expect(second.values, "the copy has not run, and shows nothing of the first's run").not.toContainText("total");
    // An edit of the first is the first's: its root declares more, and
    // pings once it is made, which its strip says. Put in at once, on a
    // line of its own inside the root (the code ends in a newline, so
    // its end is outside the root), as one edit, not one per key.
    await intoCode(first);
    await expect(first.block.locator(".cm-line").nth(3), "the root opens on the fourth line").toHaveText("Item {");
    await page.keyboard.press("Control+Home");
    for (let line = 0; line < 3; line += 1) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("End");
    await page.keyboard.insertText('\nproperty int extra: 9\nTimer { running: true; interval: 50; onTriggered: root.ping(9, "edit") }');
    await expect(first.values, "the edit ran, and its ping is said").toContainText("ping(9, edit)", { timeout: 30_000 });
    await expect(first.values).toContainText("extra: 9");
    await expect(first.values).toContainText("total: 12");
    await expect(second.values, "the copy heard nothing of the first's edit").not.toContainText("ping(");
    const firstSaid = await first.values.textContent();
    await run(page, 1);
    await expect(second.values, "the copy runs its own code").toContainText("total: 3");
    await expect(second.values, "not the first's edit").not.toContainText("extra");
    await expect(second.values, "nor its log").not.toContainText("ping(");
    expect(await first.values.textContent(), "and the first heard nothing of the copy's run").toBe(firstSaid);
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
    expect(await drawnWhileStopped(canvas, "out of view"), `out of view, it draws nothing over ${WATCHED} of the page's frames`).toBe(0);
    await centre(canvas);
    await keepsDrawing(canvas, "back in view, it draws again");
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
    expect(await drawnWhileStopped(canvas, "hidden"), `hidden, it draws nothing over ${WATCHED} of the page's frames`).toBe(0);
    await tab("visible");
    await keepsDrawing(canvas, "shown, it draws again");
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
    await drawsMore(canvas, 1, "it runs");
    await press(pause);
    const resume = runButton(slot, "Resume the 3D demo");
    await expect(resume, "paused, Resume goes on from there").toBeVisible();
    expect(await drawnWhileStopped(canvas, "paused"), `paused, it draws nothing over ${WATCHED} of the page's frames`).toBe(0);
    await press(resume);
    await expect(pause).toBeVisible();
    await drawsMore(canvas, 1, "and runs again");
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
    await keepsDrawing(canvas, "the 3D demo still turns");
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
      // However long the machine takes to draw the next of its frames.
      await expect.poll(async () => Buffer.compare(before, await shader.screenshot()) !== 0, { message: `the shader still moves (${window})`, timeout: 0 }).toBe(true);
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

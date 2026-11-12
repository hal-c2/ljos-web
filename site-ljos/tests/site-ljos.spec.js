// ljos.dev as prerendered Ljós pages: the landing page leads with a
// shell of your own, a docs page reads whole with no script at all —
// its text, its navigation and its place in the sidebar — and with
// script the shell navigates, its contents list lands on a heading,
// and light and dark are the reader's to choose.
import { expect, test } from "@playwright/test";

// A press lands on the MouseArea over the words, as a reader's does:
// press there, not on the text.
async function press(page, locator) {
  const box = await locator.boundingBox();
  expect(box, "the words to press are on the page").toBeTruthy();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

// The same press, on the first of several matches that stands in
// the viewport with a size (a result's button, where an ancestor
// in the scene carries the same words and no box of its own, and
// later blocks on the page carry the same words below the fold).
async function pressWords(page, words) {
  const matches = page.getByText(words, { exact: true });
  const { width, height } = page.viewportSize();
  const standing = async () => {
    for (let i = 0; i < (await matches.count()); i++) {
      const box = await matches.nth(i).boundingBox().catch(() => null);
      if (box && box.width > 0 && box.height > 0 && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height) return box;
    }
    return null;
  };
  // One reading, pressed as read: a second would race a layout
  // shift and fail on the box that is no longer there.
  let box = null;
  await expect.poll(async () => (box = await standing()) !== null, { timeout: 30_000 }).toBe(true);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

// The size the build prerenders at: with no script there is no
// relayout, and the page keeps the build's geometry (docs/LJOS_WEB.md
// A26 — hydration settles the exact numbers in place).
const BUILD_SIZE = { width: 1440, height: 900 };

test("the landing page leads with your own shell, and never pitches compatibility", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Ljós — malleable software, everywhere", { exact: true })).toBeVisible();
  const words = await page.locator("#app").innerText();
  expect(words.indexOf("Your own shell")).toBeGreaterThan(-1);
  expect(words.indexOf("Your own shell")).toBeLessThan(words.indexOf("TypeScript first"));
  expect(words).toContain("shell.qml");
  expect(words).toContain("ShellLoader");
  expect(words).toContain("Slot");
  expect(words).not.toMatch(/Qt[\s-]?compatible|compatible with Qt/i);
  // Qt is named on the porting page, not on the front page.
  expect(words).not.toContain("Qt");
});

test("a docs page reads with JavaScript off: title, prose, table, code, sidebar and contents", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: BUILD_SIZE });
  try {
    const page = await context.newPage();
    await page.goto("/start/mcp/");
    await expect(page.getByText("MCP Servers for Agents", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Two servers, one model", { exact: true }).first()).toBeVisible();
    // A table's cell, a fenced block's code, the sidebar's order and
    // the page's own contents list are the page's, not a script's.
    await expect(page.getByText("Authoring server", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("ljos mcp --project .", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("What is Ljós?", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("On this page", { exact: true })).toBeVisible();
    await expect(page.getByText("Search the docs…", { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("the demos page names what stands there, flagship first, readable with no script", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: BUILD_SIZE });
  try {
    const page = await context.newPage();
    await page.goto("/demos/");
    const words = await page.locator("#app").innerText();
    expect(words.indexOf("A shell you rewrite")).toBeGreaterThan(-1);
    expect(words.indexOf("A shell you rewrite")).toBeLessThan(words.indexOf("3D you can orbit"));
    // The flagship stands in its place as written: its app's own
    // shell, prerendered, until hydration takes it over.
    await expect(page.getByText("The Corner Pantry", { exact: true })).toBeVisible();
    await expect(page.getByText("This demo mounts here.")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("with script, the sidebar navigates and the contents list lands on its heading", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  await page.goto("/start/");
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  await press(page, page.getByText("MCP Servers for Agents", { exact: true }).first());
  await page.waitForURL("**/start/mcp/");
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  await expect(page.getByText("Two servers, one model", { exact: true }).first()).toBeVisible();
  // The contents entry for a later heading brings it into view.
  const late = page.getByText("The authoring server (ljos mcp)", { exact: true }).last();
  await press(page, late);
  await expect(page.getByText("The authoring server (ljos mcp)", { exact: true }).first()).toBeInViewport();
  expect(errors).toEqual([]);
});

test("a code block runs beside its code, edits keep its state, and a broken edit keeps the last good result", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Tall enough that the first block's editor and its result stand
  // together without scrolling the page's own Flickable.
  await page.setViewportSize({ width: 1440, height: 1600 });
  await page.goto("/start/first-app/");
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  // The first runnable block is the counter: its result runs.
  await expect(page.getByText("Count: 0").first()).toBeVisible({ timeout: 30_000 });
  await pressWords(page, "Increment");
  await expect(page.getByText("Count: 1").first()).toBeVisible({ timeout: 30_000 });
  // Edit the code in its editor: the result takes the edit and
  // keeps its state.
  const editor = page.locator("textarea").first();
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.type("// edited\n");
  await expect(page.getByText("Count: 1").first()).toBeVisible({ timeout: 30_000 });
  // A broken edit says why, and the last good result still stands.
  await page.keyboard.press("Control+Home");
  await page.keyboard.type("Broken {");
  await expect(page.getByText(/Main\.qml:\d+/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Count: 1").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("with JavaScript off a runnable block is its code beside a picture of its result", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: BUILD_SIZE });
  try {
    const page = await context.newPage();
    await page.goto("/start/first-app/");
    // The code stands in its editor field, readable as written.
    await expect(page.locator("textarea").first()).toHaveValue(/property int count: 0/);
    // The stage's picture: the example's prerendered result as an
    // image in the page, not words promising one.
    const pictured = page.locator('img[src*="Examples/"][src$=".png"]').first();
    await expect(pictured).toBeVisible();
    expect(await pictured.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
  } finally {
    await context.close();
  }
});

test("light and dark are the reader's", async ({ page }) => {
  await page.goto("/start/");
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  // The header's own ground, at a point nothing else covers.
  const ground = () => page.evaluate(() => getComputedStyle(document.elementFromPoint(700, 28)).backgroundColor);
  const before = await ground();
  expect(before).not.toBe("rgba(0, 0, 0, 0)");
  await press(page, page.getByText("Dark", { exact: true }));
  await expect(page.getByText("Light", { exact: true })).toBeVisible();
  expect(await ground()).not.toBe(before);
});

// How many shells the Pantry demo has applied: its pantry-live.js
// counts each apply as it starts, so a second one shows at once,
// not only when its compile lands. It counts only on a page the
// test has opted in, by putting `__ljosTest` there before the page
// loads; a visitor's page has no such object.
const applies = (page) => page.evaluate(() => globalThis.__ljosTest.pantryApplies);

// Where the reset probes' page keeps its time: stopped before the
// page exists, so nothing the test does waits on wall time passing.
const HELD_AT = Date.UTC(2026, 0, 1);

// In a held page, time moves only when the test moves it. One step
// past the editor's debounce runs each timer that falls due in it
// once, so an apply still armed has started when this returns.
const pastDebounce = (page) => page.clock.fastForward(1000);

// And what the page is waiting on (a compile, a frame) lands a
// step at a time, each step running what has fallen due, until the
// test sees it.
async function shownInHeldTime(page, locator) {
  await expect
    .poll(
      async () => {
        await page.clock.fastForward(50);
        return locator.isVisible();
      },
      { timeout: 30_000 },
    )
    .toBe(true);
}

// Shift+Tab walks back from the editor through the scene's tab stops
// and Return presses each, until one applies: that one is Reset. How
// many stops lie between is the page's business. A press that
// applies does so as it is handled, so the count says at once.
async function resetFromKeyboard(page, before) {
  for (let n = 0; n < 12; n++) {
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Enter");
    if ((await applies(page)) > before) return;
  }
  expect(await applies(page), "Shift+Tab from the editor reaches Reset, and Return resets").toBeGreaterThan(before);
}

test("the flagship: rewrite the Pantry's shell and its state survives", async ({ page }) => {
  await page.goto("/demos/");
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  await expect(page.getByText("The Corner Pantry", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add tea" }).click();
  await expect(page.getByText("1 in the basket · £3.50").first()).toBeVisible();

  const editor = page.locator("textarea").first();
  const app = await editor.inputValue();
  expect(app).toContain("import Pantry");
  const mine = [
    "import QtQuick",
    "import Pantry",
    "",
    "Rectangle {",
    "    width: 480",
    "    height: 400",
    '    color: "#241a10"',
    "    Column {",
    "        x: 18",
    "        y: 14",
    "        spacing: 12",
    '        Text { text: "My Pantry"; color: "#f0ead8"; font.pixelSize: 24 }',
    "        Basket { id: basket; width: 444 }",
    "        Row {",
    "            spacing: 10",
    '            Rectangle { width: 140; height: 58; radius: 8; color: "#232839"',
    '                Text { x: 10; y: 8; color: "#e8eaf0"; font.pixelSize: 15; text: "Tea" }',
    '                MouseArea { width: 140; height: 58; Accessible.name: "Add tea"; Accessible.role: Accessible.Button; onClicked: basket.addTea() } }',
    "        }",
    "        StatusSlot {}",
    "        Note { width: 444 }",
    "    }",
    "}",
    "",
  ].join("\n");
  await editor.fill(mine);
  await expect(page.getByText("My Pantry", { exact: true })).toBeVisible({ timeout: 30_000 });
  // What the app held, it still holds — and still works.
  await expect(page.getByText("1 in the basket · £3.50").first()).toBeVisible();
  await page.getByRole("button", { name: "Add tea" }).click();
  await expect(page.getByText("2 in the basket · £7.00").first()).toBeVisible();

  // A broken shell is refused with what broke and where, and the
  // running shell stands; the next good edit takes over again.
  await editor.fill("import QtQuick\nimport Pantry\n\nRectangle {\n    Basket {\n}\n");
  await expect(page.getByText(/Shell\.qml:\d+:\d+:/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("My Pantry", { exact: true })).toBeVisible();
  await expect(page.getByText("2 in the basket · £7.00").first()).toBeVisible();

  await editor.fill(mine.replace('"My Pantry"', '"Fixed Again"'));
  await expect(page.getByText("Fixed Again", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("2 in the basket · £7.00").first()).toBeVisible();

  // Undoing back to the app's own text applies like any edit: the
  // guard compares with the text last applied, not with the app's
  // shell forever.
  await editor.fill(app);
  await expect(page.getByText("The Corner Pantry", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("2 in the basket · £7.00").first()).toBeVisible();
  // A broken edit refused, then undone: the refusal clears and
  // the good shell stands again.
  await editor.fill("import QtQuick\nimport Pantry\n\nRectangle {\n    Basket {\n}\n");
  await expect(page.getByText(/Shell\.qml:\d+:\d+:/)).toBeVisible({ timeout: 30_000 });
  await editor.fill(app);
  await expect(page.getByText("The Corner Pantry", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Shell\.qml:\d+:\d+:/)).toHaveCount(0);
});

// Reset restores the app's shell, its source and its words, in one
// apply, by a press and from the keyboard, and stops an edit still
// waiting on the debounce. The count is read against time only the
// test moves: the page's clock stops before the page opens, so the
// debounce a fill arms is still armed when the reset comes, on any
// runner, and moves on only by fastForward.
test("Reset applies the app's shell once, and stops an edit still waiting to apply", async ({ browser }) => {
  const context = await browser.newContext();
  try {
    await context.clock.pauseAt(HELD_AT);
    await context.addInitScript(() => {
      globalThis.__ljosTest = { pantryApplies: 0 };
    });
    const page = await context.newPage();
    await page.goto("/demos/");
    await shownInHeldTime(page, page.locator('#app[data-ljos-hydrated="true"]'));
    await shownInHeldTime(page, page.getByText("The Corner Pantry", { exact: true }));
    // Loading the demo applies its shell once, and its own writing
    // into the editor arms nothing: past the debounce it is still
    // one.
    await pastDebounce(page);
    expect(await applies(page), "loading the demo applies its shell once").toBe(1);
    await page.getByRole("button", { name: "Add tea" }).click();
    await shownInHeldTime(page, page.getByText("1 in the basket · £3.50").first());

    const editor = page.locator("textarea").first();
    const app = await editor.inputValue();
    const edited = app.replace('"The Corner Pantry"', '"Edited Once More"');
    const typed = app.replace('"The Corner Pantry"', '"Never Landed"');
    const resetWords = page.getByText("Reset", { exact: true });
    const landedEdit = async () => {
      await editor.fill(edited);
      await pastDebounce(page);
      await shownInHeldTime(page, page.getByText("Edited Once More", { exact: true }));
    };
    const resetStands = async () => {
      await shownInHeldTime(page, page.getByText("The Corner Pantry", { exact: true }));
      await expect(editor).toHaveValue(app);
      await shownInHeldTime(page, page.getByText("1 in the basket · £3.50").first());
    };

    // A press on Reset, after an edit has landed. The reset's own
    // writing into the editor is not an edit: the guard compares the
    // text, so whenever the change is heard, what the demo wrote
    // itself restarts nothing.
    await landedEdit();
    let before = await applies(page);
    await resetWords.scrollIntoViewIfNeeded();
    await pressWords(page, "Reset");
    expect(await applies(page), "a press on Reset applies the app's shell").toBe(before + 1);
    await pastDebounce(page);
    expect(await applies(page), "the reset's own write into the editor applies nothing more").toBe(before + 1);
    await resetStands();

    // A visitor's edit after a reset still applies; then Return on
    // Reset, which runs outside any flush, so the change is heard
    // during the assignment itself. It still applies once. The
    // accessible press action takes this same path; Playwright has
    // no assistive-technology client to press it with, so the
    // keyboard stands for both.
    await landedEdit();
    await editor.click();
    before = await applies(page);
    await resetFromKeyboard(page, before);
    expect(await applies(page), "Return on Reset applies the app's shell").toBe(before + 1);
    await pastDebounce(page);
    expect(await applies(page), "the reset's own write into the editor applies nothing more").toBe(before + 1);
    await resetStands();

    // Typing, then resetting inside the debounce, by a press and from
    // the keyboard: the armed apply is stopped, the reset applies
    // once, and the typed edit never lands.
    before = await applies(page);
    await editor.fill(typed);
    // Measured after the fill, which may scroll the page.
    await resetWords.scrollIntoViewIfNeeded();
    await pressWords(page, "Reset");
    expect(await applies(page), "a press on Reset, with an edit pending, applies the app's shell").toBe(before + 1);
    await pastDebounce(page);
    expect(await applies(page), "the reset stopped the typed edit's debounce").toBe(before + 1);
    await resetStands();
    await expect(page.getByText("Never Landed", { exact: true })).toHaveCount(0);

    before = await applies(page);
    await editor.fill(typed);
    await resetFromKeyboard(page, before);
    expect(await applies(page), "Return on Reset, with an edit pending, applies the app's shell").toBe(before + 1);
    await pastDebounce(page);
    expect(await applies(page), "the reset stopped the typed edit's debounce").toBe(before + 1);
    await resetStands();
    await expect(page.getByText("Never Landed", { exact: true })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

// The count is the test's, never the visitor's: a page loaded with
// no `__ljosTest` put there first runs the demo, applies its shell,
// and holds no global of the demo's.
test("a visitor's demos page holds no test hook", async ({ page }) => {
  await page.goto("/demos/");
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  // The basket answers only once the shell has applied.
  await page.getByRole("button", { name: "Add tea" }).click();
  await expect(page.getByText("1 in the basket · £3.50").first()).toBeVisible();
  expect(await page.evaluate(() => ["__ljosTest", "ljosPantryApplies"].filter((name) => name in globalThis))).toEqual([]);
});

test("every showcase demo stands in its slot, on the landing and the demos page", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  await expect(page.getByText("The Corner Pantry", { exact: true })).toBeVisible();
  expect(await page.locator("canvas").count()).toBeGreaterThan(0);

  await page.goto("/demos/");
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  for (const words of ["A shell you rewrite", "3D you can orbit", "A shader effect", "A whole app", "Motion"])
    await expect(page.getByText(words, { exact: true })).toBeVisible();
  await expect(page.getByText("Drag to orbit · scroll or pinch to zoom")).toBeVisible();
  await expect(page.getByText("Move to stir the light · tap for other colours")).toBeVisible();
  await expect(page.getByText("Field guide")).toBeVisible();
  await expect(page.getByText("Shuffle the tiles")).toBeVisible();
  // The other demos did not take the flagship's place away.
  await expect(page.getByRole("button", { name: "Add bread" })).toBeAttached();
});

test("the demos page reads with JavaScript off: the app's shell and words stand", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: BUILD_SIZE });
  try {
    const page = await context.newPage();
    await page.goto("/demos/");
    await expect(page.getByText("Live demos", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("The Corner Pantry", { exact: true })).toBeVisible();
    await expect(page.getByText(/complete Ljós app that passes ljos check/)).toBeVisible();
  } finally {
    await context.close();
  }
});

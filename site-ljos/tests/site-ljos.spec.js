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

test("the flagship: rewrite the Pantry's shell and its state survives", async ({ page }) => {
  await page.goto("/demos/");
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  await expect(page.getByText("The Corner Pantry", { exact: true })).toBeVisible();
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  // Loading the demo applies its shell once: past the editor's
  // debounce, the stage's item is still the one first made (a
  // second apply would reload and remake it).
  await page.getByText("The Corner Pantry", { exact: true }).evaluate((el) => {
    window.__firstMade = el;
  });
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => window.__firstMade?.isConnected)).toBe(true);
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

  // Reset restores the app's shell, its source and its words.
  await pressWords(page, "Reset");
  await expect(page.getByText("The Corner Pantry", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(editor).toHaveValue(app);
  await expect(page.getByText("2 in the basket · £7.00").first()).toBeVisible();
  // The reset's own writing into the editor is not an edit: past
  // the debounce the stage's item is still the one the reset
  // made — no second apply reloads it. This is the deferred
  // path too (a press handler is a flush of its own): the guard
  // compares the text, so whenever the change is heard, what
  // the demo wrote itself restarts nothing.
  await page.getByText("The Corner Pantry", { exact: true }).evaluate((el) => {
    window.__resetMade = el;
  });
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => window.__resetMade?.isConnected)).toBe(true);
  // A visitor's edit after all that still applies.
  await editor.fill(app.replace('"The Corner Pantry"', '"Edited Once More"'));
  await expect(page.getByText("Edited Once More", { exact: true })).toBeVisible({ timeout: 30_000 });
  // Undoing back to the app's own text applies like any edit:
  // the guard compares with the text last applied, not with
  // the app's shell forever.
  await editor.fill(app);
  await expect(page.getByText("The Corner Pantry", { exact: true })).toBeVisible({ timeout: 30_000 });
  // A broken edit refused, then undone: the refusal clears and
  // the good shell stands again.
  await editor.fill("import QtQuick\nimport Pantry\n\nRectangle {\n    Basket {\n}\n");
  await expect(page.getByText(/Shell\.qml:\d+:\d+:/)).toBeVisible({ timeout: 30_000 });
  await editor.fill(app);
  await expect(page.getByText("The Corner Pantry", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Shell\.qml:\d+:\d+:/)).toHaveCount(0);
  // The other write paths need no driving of their own to be
  // covered: the guard compares the text with the last applied
  // one, so it does not matter whether the change is heard
  // during the assignment (a keyboard or accessible-action
  // reset, settling inline) or after it (queued inside a
  // flush) — both loads above are built inside the hydration
  // flush, and the mouse reset below is a press handler of its
  // own. A keyboard reset through Return/Space on the focused
  // Reset cannot be driven from Playwright here: the runtime
  // gives no QML item a DOM tabindex, so DOM Tab never lands
  // QML focus on it (probed: Tab cycles the page's form fields
  // only, and Enter after each never reaches the button), and
  // there is no assistive-technology client to press it with
  // either. Its handler calls the same resetToAppShell().
  await editor.fill(app.replace('"The Corner Pantry"', '"Edited Once More"'));
  await expect(page.getByText("Edited Once More", { exact: true })).toBeVisible({ timeout: 30_000 });
  // Typing, then resetting inside the debounce: the armed apply
  // is stopped and the typed edit never lands. Found and tagged
  // before the fill, so the proof works on one deliberate timeline:
  // nothing may have applied between the fill and the press.
  const resetBox = await page.getByText("Reset", { exact: true }).boundingBox();
  expect(resetBox).not.toBeNull();
  await page.getByText("Edited Once More", { exact: true }).evaluate((el) => {
    window.__beforeFill = el;
  });
  await editor.fill(app.replace('"The Corner Pantry"', '"Never Landed"'));
  expect(await page.evaluate(() => window.__beforeFill?.isConnected)).toBe(true);
  if (resetBox) {
    await page.mouse.click(resetBox.x + resetBox.width / 2, resetBox.y + resetBox.height / 2);
  }
  await expect(page.getByText("The Corner Pantry", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByText("The Corner Pantry", { exact: true }).evaluate((el) => {
    window.__fastResetMade = el;
  });
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => window.__fastResetMade?.isConnected)).toBe(true);
  await expect(page.getByText("Never Landed", { exact: true })).toHaveCount(0);
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

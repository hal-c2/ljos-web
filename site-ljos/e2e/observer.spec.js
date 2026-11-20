// The Observer a stage's toolbar opens (features/observer.feature): Ljós's
// own, on the app that stage runs, fetched only when it is opened, docked
// on a wide window and a sheet on a phone, and gone again once closed.
// The example is the first app of the docs' Start, whose ids (root, label,
// bumpButton) and `count` the reader meets on that page.
import { centre, expect, frames, open, press, run, test, unexpected } from "./fixtures.js";

const ROUTE = "/start/first-app/";

// The Observer is a chunk of its own; its file names say so.
const isObserver = (url) => /Observer/.test(new URL(url).pathname);

// The dock (Site/ObserverDock.qml): the pane named Observer, and the app in it.
// The site's menu has a link of that name too: the dock is the group.
const dock = (page) => page.getByRole("group", { name: "Observer", exact: true });
const observerButton = (block) => block.toolbar.getByRole("button", { name: /^Observer for / });
const pageTab = (page, name) => page.getByRole("tab", { name, exact: true });
// What Ljós's Observer lays its pages out for (`Theme.observerWidth`, which the dock gives the panel).
const OBSERVER_WIDTH = 680;

async function observed(page, index = 0) {
  await open(page, ROUTE);
  const block = await run(page, index);
  await expect(observerButton(block)).toBeVisible();
  await press(observerButton(block));
  await expect(dock(page)).toBeVisible();
  // The Overview's figures are the app's: it has been answered.
  await expect(page.getByText("Overview", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  return block;
}

test.beforeEach(({ wasm }) => {
  test.skip(!wasm, "without WebAssembly no example runs, so no stage has an Observer to open");
});

test("a running example's toolbar offers the Observer, and one not running does not", async ({ page, errors }) => {
  await open(page, ROUTE);
  const before = await page.getByRole("button", { name: /^Observer for / }).count();
  expect(before, "no toolbar offers it before its example runs").toBe(0);
  const block = await run(page, 0);
  await expect(observerButton(block)).toBeVisible();
  expect(unexpected(errors)).toEqual([]);
});

test("nothing of the Observer is fetched until it is opened", async ({ page }) => {
  const fetched = [];
  page.on("request", (request) => isObserver(request.url()) && fetched.push(request.url()));
  await open(page, ROUTE);
  const block = await run(page, 0);
  await frames(page);
  expect(fetched, "running an example fetches none of it").toEqual([]);
  await press(observerButton(block));
  await expect(dock(page)).toBeVisible();
  await expect.poll(() => fetched.length, { message: "opening it fetches its chunk" }).toBeGreaterThan(0);
});

test("on a wide window it is docked along the right, and the example can still be pressed", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const block = await observed(page);
  // It slides in: read once it has come to rest.
  await expect.poll(async () => Math.round(await dock(page).boundingBox().then((box) => box.x + box.width))).toBe(1280);
  const box = await dock(page).boundingBox();
  expect(box.height).toBeGreaterThan(600);
  // As wide as the Observer's pages are laid out for: a value it shows
  // has room to be read and edited.
  expect(box.width).toBeGreaterThanOrEqual(OBSERVER_WIDTH);
  await pageTab(page, "Objects").click();
  await page.getByRole("listitem", { name: "Rectangle#root" }).click();
  const value = await page.getByRole("button", { name: "count", exact: true }).boundingBox();
  expect(value.width, "the count's value has room").toBeGreaterThan(60);
  expect(value.x + value.width).toBeLessThanOrEqual(1280);
  const button = block.stage.getByRole("button", { name: "Increment" });
  const stage = await button.boundingBox();
  expect(stage.x + stage.width, "the page reflows beside it").toBeLessThanOrEqual(box.x + 1);
  await press(button);
  await expect(block.stage.getByText("Count: 1")).toBeVisible();
  // A click a browser would give the page beside it reaches its link:
  // nothing of the dock stands over the page but the panel itself.
  await page.getByRole("link", { name: "Hot Reload", exact: true }).first().click({ trial: true, timeout: 5_000 });
});

test("on a phone it is a sheet over the lower part of the screen, and a press above it closes it", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await observed(page);
  // It slides up: read once it has come to rest.
  // The header above it may end between pixels, so its foot may too.
  await expect.poll(async () => Math.abs(844 - (await dock(page).boundingBox().then((box) => box.y + box.height)))).toBeLessThanOrEqual(1);
  const box = await dock(page).boundingBox();
  expect(box.width).toBe(390);
  expect(box.y).toBeGreaterThan(100);
  // The Observer keeps the width its pages are laid out for, and what is
  // past the screen's edge is scrolled to: a value is edited as on a
  // wide window.
  await pageTab(page, "Objects").click();
  await page.getByRole("listitem", { name: "Rectangle#root" }).click();
  const count = page.getByRole("button", { name: "count", exact: true });
  expect((await count.boundingBox()).width).toBeGreaterThan(60);
  // Where a reader's finger lands: the value's field, unmade until then,
  // lies over it, and a press goes through it as in Qt.
  await press(count);
  const field = page.getByRole("textbox", { name: "count" });
  await field.fill("4");
  await field.press("Enter");
  await expect(count).toHaveAccessibleDescription("4");
  await page.mouse.click(195, box.y / 2);
  await expect(dock(page)).toBeHidden();
});

test("its tree is the example's objects, by the ids the example gives them", async ({ page }) => {
  await observed(page);
  await pageTab(page, "Objects").click();
  await expect(page.getByRole("listitem", { name: "Rectangle#root" })).toBeVisible();
  await expect(page.getByRole("listitem", { name: /#label$/ })).toBeVisible();
  await expect(page.getByRole("listitem", { name: /#bumpButton$/ })).toBeVisible();
});

test("what the reader does in the app the Observer shows, and what the Observer changes the app shows", async ({ page }) => {
  const block = await observed(page);
  await pageTab(page, "Objects").click();
  await page.getByRole("listitem", { name: "Rectangle#root" }).click();
  const count = page.getByRole("button", { name: "count", exact: true });
  await expect(count).toHaveAccessibleDescription("0");
  // The reader's press, seen.
  await press(block.stage.getByRole("button", { name: "Increment" }));
  await expect(count).toHaveAccessibleDescription("1");
  // The Observer's edit, drawn.
  await press(count);
  const field = page.getByRole("textbox", { name: "count" });
  await field.fill("7");
  await field.press("Enter");
  await expect(block.stage.getByText("Count: 7")).toBeVisible();
  await expect(count).toHaveAccessibleDescription("7");
});

test("frames are counted while the app moves, and at rest the count holds", async ({ page }) => {
  const block = await observed(page);
  await pageTab(page, "Frames").click();
  const rows = page.getByRole("listitem", { name: /^frame \d+ of / });
  await press(block.stage.getByRole("button", { name: "Increment" }));
  await expect(rows.filter({ hasText: "" }).last()).toHaveAccessibleName(/woke by input/);
  // The press ran the count's bindings and laid out its new words.
  await expect(rows.last()).toContainText(/bindings .*\([1-9]\d*\) · text .*\([1-9]\d*\)/);
  const counted = await rows.count();
  // Two seconds of nobody touching the page: nothing is drawn, so nothing is counted.
  await page.waitForTimeout(2_000);
  expect(await rows.count()).toBe(counted);
});

test("what the web cannot fill, the Observer says why", async ({ page }) => {
  await observed(page);
  await pageTab(page, "Objects").click();
  await page.getByRole("listitem", { name: "Rectangle#root" }).click();
  await dock(page).getByRole("button", { name: "Trace", exact: true }).click();
  // Said where the Observer says what went wrong, and it stays said.
  await expect(dock(page).getByText(/^app_trace: .*not answered on the web/)).toBeVisible();
});

test("it follows the site's light and dark", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await observed(page);
  const ground = () => dock(page).evaluate((element) => getComputedStyle(element).backgroundColor);
  const light = await ground();
  await page.getByRole("button", { name: "Use the dark theme" }).first().click();
  await expect.poll(ground).not.toBe(light);
});

test("closing it lets go of the app, and nothing of it is left in the page", async ({ page }) => {
  const block = await observed(page);
  expect(
    await page.evaluate(() => Boolean(Object.getOwnPropertyDescriptor(globalThis[Symbol.for("ljos-web/clock")] ?? {}, "frames")?.get)),
    "open, it is served",
  ).toBe(true);
  await page.getByRole("button", { name: "Close the Observer" }).click();
  await expect(dock(page)).toBeHidden();
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveCount(0);
  // While an inspector is served it counts the clock's steps through the
  // clock's own counts; with none served they are the clock's again.
  const counting = () =>
    page.evaluate(() => {
      const counts = globalThis[Symbol.for("ljos-web/clock")];
      return Boolean(counts && Object.getOwnPropertyDescriptor(counts, "frames")?.get);
    });
  await expect.poll(counting, { message: "no inspector is served" }).toBe(false);
  await expect(observerButton(block)).toHaveAttribute("aria-pressed", "false");
  // Closed, nothing of it stands over the page to take a click.
  for (const name of ["What is Ljós?", "Hot Reload"]) {
    await page.getByRole("link", { name, exact: true }).first().click({ trial: true, timeout: 5_000 });
  }
});

test("one Observer at a time: pressed on another example, it moves there", async ({ page }) => {
  await open(page, "/language/properties-and-bindings/");
  const first = await run(page, 0);
  const second = await run(page, 1);
  await press(observerButton(first));
  await expect(observerButton(first)).toHaveAttribute("aria-pressed", "true");
  await press(observerButton(second));
  await expect(observerButton(second)).toHaveAttribute("aria-pressed", "true");
  await expect(observerButton(first)).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveCount(1);
});

test("the Pantry is looked into while its shell is rewritten", async ({ page }) => {
  await open(page, "/");
  const pantry = page.getByLabel("The Pantry, running");
  await centre(pantry);
  const button = page.getByRole("button", { name: "Observer for the Pantry" });
  await press(button);
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await pageTab(page, "Objects").click();
  // The tree starts at the app's shell, and holds its blocks.
  await expect(page.getByRole("listitem", { name: /^PantryShell|^Rectangle/ }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("listitem", { name: /^Basket/ }).first()).toBeVisible();
  // A press in the app is a frame woken by input.
  await pageTab(page, "Frames").click();
  await press(pantry.getByRole("button", { name: "Add tea" }));
  await expect(page.getByText("1 in the basket · £3.50").first()).toBeVisible();
  await expect(page.getByRole("listitem", { name: /^frame \d+ of .*woke by input/ }).last()).toBeVisible();
  // A new shell applied: the Observer follows it, as it follows a reload.
  // The code is taller than the frame it scrolls in: brought to the middle
  // whole, it would be scrolled inside its frame. Its caption is brought
  // there, and a line near its top pressed.
  const code = page.getByRole("textbox", { name: "Edit the Pantry's Shell.qml" }).first();
  // The highlighted code keeps its runs of spaces as no-break ones.
  const text = (await code.innerText()).replaceAll("\u00a0", " ");
  await centre(page.getByText("Shell.qml — the app's shell, yours to rewrite"));
  const top = await code.boundingBox();
  await page.mouse.click(top.x + 80, top.y + 30);
  await expect(page.locator(".cm-editor.cm-focused"), "the code editor has the keyboard").toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(text.replace('"The Corner Pantry"', '"Observed Pantry"'));
  await expect(page.getByText("Observed Pantry", { exact: true })).toBeVisible({ timeout: 30_000 });
  await pageTab(page, "Objects").click();
  await expect(page.getByRole("listitem", { name: /^Basket/ }).first()).toBeVisible();
  await expect(button).toHaveAttribute("aria-pressed", "true");
});


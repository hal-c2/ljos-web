// The Observer a stage's toolbar opens (features/observer.feature): Ljós's
// own, on the app that stage runs, fetched once a stage offers it, docked
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

// Once the page has nothing else to do: a callback the browser runs when
// it is idle runs after those asked for before it.
const idle = (page) => page.evaluate(() => new Promise((done) => requestIdleCallback(() => done())));

test("nothing of the Observer is fetched while no stage on the page offers it", async ({ page }) => {
  const fetched = [];
  page.on("request", (request) => isObserver(request.url()) && fetched.push(request.url()));
  await open(page, ROUTE);
  await idle(page);
  await frames(page);
  expect(fetched, "a page whose examples have not run fetches none of it").toEqual([]);
});

test("once a stage offers it, it is fetched once while the page is idle, and opening it fetches nothing more", async ({ page }) => {
  const fetched = [];
  page.on("request", (request) => isObserver(request.url()) && fetched.push(request.url()));
  await open(page, ROUTE);
  const block = await run(page, 0);
  await expect(observerButton(block)).toBeVisible();
  await expect.poll(() => fetched.length, { message: "it is fetched ahead, while the page is idle" }).toBe(1);
  await idle(page);
  await frames(page);
  expect(fetched, "and once").toHaveLength(1);
  await press(observerButton(block));
  await expect(dock(page)).toBeVisible();
  await expect(page.getByText("Overview", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  expect(fetched, "opening it fetches nothing more").toHaveLength(1);
});

// A browser that cannot say when it is idle (no requestIdleCallback)
// fetches the Observer only once the reader comes near it.
const noIdle = (page) =>
  page.addInitScript(() => {
    window.requestIdleCallback = undefined;
  });

test("a pointer coming onto the Observer button fetches it ahead of the press", async ({ page }) => {
  await noIdle(page);
  const fetched = [];
  page.on("request", (request) => isObserver(request.url()) && fetched.push(request.url()));
  await open(page, ROUTE);
  const block = await run(page, 0);
  await expect(observerButton(block)).toBeVisible();
  await frames(page);
  expect(fetched, "without an idle callback, it waits for the reader").toEqual([]);
  await centre(observerButton(block));
  await observerButton(block).hover();
  await expect.poll(() => fetched.length, { message: "the pointer on the button fetches it" }).toBe(1);
  await press(observerButton(block));
  await expect(dock(page)).toBeVisible();
  expect(fetched, "the press fetches nothing more").toHaveLength(1);
});

test("focus brought to the Observer button fetches it ahead of the press", async ({ page }) => {
  await noIdle(page);
  const fetched = [];
  page.on("request", (request) => isObserver(request.url()) && fetched.push(request.url()));
  await open(page, ROUTE);
  const block = await run(page, 0);
  await expect(observerButton(block)).toBeVisible();
  await frames(page);
  expect(fetched).toEqual([]);
  // As a keyboard reader goes: into the code, out with Escape, and Tab
  // past Stop, Edit and Source. A button's focus is the runtime's, as an
  // item's is in Qt, so only keys bring it there, not the page's focus().
  await press(block.block.getByRole("textbox").first());
  await expect(block.block.locator(".cm-editor.cm-focused"), "the code editor has the keyboard").toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Escape");
  for (let tab = 0; tab < 3; tab += 1) await page.keyboard.press("Tab");
  await frames(page);
  expect(fetched, "focus on the buttons before it fetches nothing").toEqual([]);
  await page.keyboard.press("Tab");
  await expect.poll(() => fetched.length, { message: "focus on the button fetches it" }).toBe(1);
  await page.keyboard.press("Enter");
  await expect(dock(page)).toBeVisible();
  expect(fetched, "the press fetches nothing more").toHaveLength(1);
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

// Asked for less motion, the dock does not travel: it fades in where it
// stands, and out again. Its place and its opacity are read in the page on
// every frame from the press until it is gone, so a slide however short is
// seen.
test("asked for less motion, it fades in and out where it stands, and never slides", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, ROUTE);
  const block = await run(page, 0);
  await expect(observerButton(block)).toBeVisible();
  const watch = () =>
    page.evaluate(() => {
      const seen = [];
      globalThis.dockSeen = seen;
      const look = () => {
        const element = document.querySelector('[role="group"][aria-label="Observer"]');
        if (element && element.getClientRects().length > 0) {
          const box = element.getBoundingClientRect();
          seen.push({ right: Math.round(box.right), opacity: Number(getComputedStyle(element).opacity) });
        } else if (seen.length > 0) seen.push(null);
        if (globalThis.dockSeen === seen) requestAnimationFrame(look);
      };
      look();
    });
  const seen = () => page.evaluate(() => globalThis.dockSeen);

  await watch();
  await press(observerButton(block));
  await expect.poll(async () => (await seen()).at(-1)?.opacity, { message: "it comes to rest opaque" }).toBe(1);
  const opening = await seen();
  expect(opening.filter((at) => at && at.right !== 1280), "it stands along the right edge as it opens").toEqual([]);
  expect(opening.some((at) => at && at.opacity < 1), "it fades in").toBe(true);

  await watch();
  await page.getByRole("button", { name: "Close the Observer" }).click();
  await expect(dock(page)).toBeHidden();
  await expect.poll(async () => (await seen()).at(-1), { message: "it is gone" }).toBe(null);
  const closing = (await seen()).filter(Boolean);
  expect(closing.filter((at) => at.right !== 1280), "it stands along the right edge as it closes").toEqual([]);
  expect(closing.some((at) => at.opacity > 0 && at.opacity < 1), "it fades out").toBe(true);
});

// A docs page keeps its sidebar on a window this wide: docked beside both,
// the Observer would leave the page too little room to be read, so it is a
// sheet, as on a phone.
test("on a window with no room for the page beside the sidebar and the dock it is a sheet", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await observed(page);
  await expect.poll(async () => Math.abs(800 - (await dock(page).boundingBox().then((box) => box.y + box.height)))).toBeLessThanOrEqual(1);
  const box = await dock(page).boundingBox();
  expect(box.width).toBe(1100);
  expect(box.y).toBeGreaterThan(100);
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

// A closed sheet still follows the room it would rise into. When the window
// changes size (a phone turned, its toolbar hidden), nothing of the dock may
// stand over the page while it does: a press there is the page's.
test("on a phone, a dock never opened takes no press while the window changes size", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, ROUTE);
  const heading = page.getByRole("heading", { level: 1 }).first();
  await expect(heading).toBeVisible();
  await heading.evaluate((node) => {
    window.__taken = [];
    const until = () => performance.now() + 600;
    let end = Infinity;
    addEventListener("resize", () => { end = until(); }, { once: true });
    const look = () => {
      const r = node.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + Math.min(r.width / 2, 40), r.top + r.height / 2);
      if (!node.contains(hit)) window.__taken.push(`${hit?.tagName}.${hit?.className} ${hit?.getAttribute("aria-hidden") ?? ""}`);
      if (performance.now() < end) requestAnimationFrame(look);
      else window.__looked = true;
    };
    requestAnimationFrame(look);
  });
  await page.setViewportSize({ width: 390, height: 700 });
  await page.waitForFunction(() => window.__looked === true);
  expect(await page.evaluate(() => window.__taken), "what took a press meant for the heading").toEqual([]);
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
  const tree = async () => {
    await pageTab(page, "Objects").click();
    const rows = dock(page).getByRole("listitem", { name: /^\w+(#\w+)?$/ });
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    return rows.evaluateAll((each) => each.map((row) => row.getAttribute("aria-label")));
  };
  await press(observerButton(first));
  await expect(observerButton(first)).toHaveAttribute("aria-pressed", "true");
  const firstTree = await tree();
  await press(observerButton(second));
  await expect(observerButton(second)).toHaveAttribute("aria-pressed", "true");
  await expect(observerButton(first)).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveCount(1);
  // A new Observer, all of it the second example's: it opens on its
  // Overview, not on the page the first was left on, and its tree and log
  // are the second's, as they are when it is opened on the second alone.
  // The Observer's tabs do not say which is selected, so the page shown is
  // told by what only the Overview draws and by the Objects page's rows,
  // which the first was left on, being gone.
  await expect(dock(page).getByText("one point each time the application changed", { exact: true })).toBeVisible();
  await expect(dock(page).getByRole("listitem", { name: /^\w+(#\w+)?$/ })).toHaveCount(0);
  const moved = { tree: await tree(), logs: await logs() };
  expect(moved.tree).not.toEqual(firstTree);
  await page.getByRole("button", { name: "Close the Observer" }).click();
  await expect(dock(page)).toBeHidden();
  await press(observerButton(second));
  expect({ tree: await tree(), logs: await logs() }).toEqual(moved);

  async function logs() {
    await pageTab(page, "Logs").click();
    return dock(page).getByRole("listitem").evaluateAll((each) => each.map((row) => row.getAttribute("aria-label") ?? row.textContent));
  }
});

for (const width of [320, 390]) {
  test(`at ${width} px the Pantry's Reset is whole beside its Observer button`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await open(page, "/");
    await centre(page.getByLabel("The Pantry, running"));
    const reset = page.getByRole("button", { name: "Reset to the app's shell" });
    const button = page.getByRole("button", { name: "Observer for the Pantry" });
    await expect(button).toBeVisible({ timeout: 30_000 });
    const [at, by] = [await reset.boundingBox(), await button.boundingBox()];
    expect(at.x, "Reset starts on the screen").toBeGreaterThanOrEqual(0);
    expect(at.x + at.width, "Reset ends before the Observer button starts").toBeLessThanOrEqual(by.x);
    expect(by.x + by.width, "the Observer button ends on the screen").toBeLessThanOrEqual(width);
  });
}

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


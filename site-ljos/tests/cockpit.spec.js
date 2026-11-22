// The cockpit demo, ljos-ui's examples/car-cockpit: that its copy is
// the commit it names is tests/pro.spec.js's, as for every pro demo;
// these drive the cockpit itself.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { demos, targetOf } from "../scripts/pro.mjs";

const target = targetOf(demos.find((demo) => demo.name === "cockpit"));

const shown = (locator) => locator.filter({ visible: true });

// Without WebGPU, or with no adapter for the page, the cockpit runs on
// WebGL 2, its car drawn whole: webgl2.spec.js reads that from its pixels.

// Without WebAssembly there is no wgpu, and the JavaScript renderer reads
// no model from a file, so the car would have no body: the cockpit keeps
// its picture, and names WebAssembly though it needs WebGL 2 as well.
test("without WebAssembly the cockpit keeps its picture and says it needs WebAssembly", async ({ page }) => {
  await page.addInitScript(() => delete globalThis.WebAssembly);
  await page.goto("/demos/cockpit/");
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  await expect(shown(page.getByText("A picture of the demo: it runs in a browser with WebAssembly, which this one does not offer.")).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Run the cockpit" })).toHaveCount(0);
});

// With an adapter (SwiftShader's, so any machine has one) the cockpit
// runs as the reader would use it: its own buttons by name, a part of
// the car opened, and an edit to one of its files compiled and shown.
// Its browser is its own, so the report's trace holds no page: a failure
// carries the page as it was instead.
test("with WebGPU the cockpit runs, opens a door, and is made again from an edit", async ({ playwright, baseURL }, testInfo) => {
  const browser = await playwright.chromium.launch({ args: ["--enable-unsafe-webgpu", "--use-webgpu-adapter=swiftshader", "--enable-unsafe-swiftshader"] });
  let page;
  const said = [];
  try {
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
    page = await context.newPage();
    page.on("console", (message) => said.push(`${message.type()}: ${message.text()}`));
    page.on("pageerror", (error) => said.push(`pageerror: ${error.stack || error.message}`));
    await page.goto("/demos/cockpit/");
    await page.waitForSelector('#app[data-ljos-hydrated="true"]');
    const run = page.getByRole("button", { name: "Run the cockpit" });
    await run.scrollIntoViewIfNeeded();
    await run.click();
    await expect(page.getByRole("button", { name: "Pause the cockpit" }), "once the cockpit is drawn, Run is its Pause").toBeVisible({ timeout: 60_000 });
    const button = (name) => page.getByRole("button", { name, exact: true });
    await button("Car").click();
    await expect(button("Car"), "the dock's Car turns the cockpit to its car page").toHaveAttribute("aria-pressed", "true");
    await expect(shown(page.locator("canvas")).first(), "the car is drawn in its canvas").toBeVisible({ timeout: 30_000 });
    const door = button("Left door");
    await expect(door).toHaveCount(1);
    // A part's button says it is on with aria-pressed (QtQuick/Accessible.ts);
    // the chip sets Accessible.checked but not checkable, so a shut door says
    // nothing rather than "false".
    await expect(door).not.toHaveAttribute("aria-pressed", "true");
    await door.click();
    await expect(door).toHaveAttribute("aria-pressed", "true");

    const cockpit = readFileSync(join(target, "Cockpit.qml"), "utf8");
    expect(cockpit).toContain("t`Climate`");
    await page.getByRole("button", { name: "Cockpit.qml", exact: true }).click();
    await page.getByRole("textbox", { name: "Edit Cockpit.qml of the cockpit" }).first().click();
    const editor = page.locator(`.cm-content[aria-label="Edit Cockpit.qml of the cockpit"]`).first();
    await expect(editor).toBeFocused({ timeout: 30_000 });
    await editor.fill(cockpit.replace("t`Climate`", "t`Cabin`"));
    // Turning to another file before the edit compiles still runs it.
    await page.getByRole("button", { name: "Main.qml", exact: true }).click();
    await expect(button("Cabin"), "the edited cockpit names its page as the edit says").toHaveCount(1, { timeout: 60_000 });
    await expect(button("Climate")).toHaveCount(0);
  } catch (error) {
    if (page) {
      await testInfo.attach("page", { body: await page.screenshot(), contentType: "image/png" });
      await testInfo.attach("accessibility tree", { body: await page.locator("#app").ariaSnapshot(), contentType: "text/plain" });
    }
    await testInfo.attach("console", { body: said.join("\n"), contentType: "text/plain" });
    throw error;
  } finally {
    await browser.close();
  }
});

// The frame is told ready by the app it holds, not by the page around
// it: with the app's module slow to come, Run turns to Pause only once
// the app is there, its own buttons with it.
test("the cockpit's frame is ready only once its app is", async ({ playwright, baseURL }) => {
  const browser = await playwright.chromium.launch({ args: ["--enable-unsafe-webgpu", "--use-webgpu-adapter=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
    const page = await context.newPage();
    await page.route(/\/CockpitDemo-[^/]*\.js$/, async (route) => {
      await new Promise((done) => setTimeout(done, 2000));
      await route.continue();
    });
    await page.goto("/demos/cockpit/");
    await page.waitForSelector('#app[data-ljos-hydrated="true"]');
    const run = page.getByRole("button", { name: "Run the cockpit" });
    await run.scrollIntoViewIfNeeded();
    await run.click();
    await expect(page.getByRole("button", { name: "Pause the cockpit" })).toBeVisible({ timeout: 60_000 });
    expect(await page.getByRole("button", { name: "Car", exact: true }).count(), "the app is there when its frame says ready").toBe(1);
  } finally {
    await browser.close();
  }
});

// Paused, the cockpit holds still: its song keeps its place and is still
// the one playing when the reader runs it again.
test("paused, the cockpit's song keeps its place and still plays", async ({ playwright, baseURL }) => {
  const browser = await playwright.chromium.launch({ args: ["--enable-unsafe-webgpu", "--use-webgpu-adapter=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
    const page = await context.newPage();
    await page.goto("/demos/cockpit/");
    await page.waitForSelector('#app[data-ljos-hydrated="true"]');
    const run = page.getByRole("button", { name: "Run the cockpit" });
    await run.scrollIntoViewIfNeeded();
    await run.click();
    const pause = page.getByRole("button", { name: "Pause the cockpit" });
    await expect(pause, "once the cockpit is drawn, Run is its Pause").toBeVisible({ timeout: 60_000 });
    const button = (name) => page.getByRole("button", { name, exact: true });
    await button("Media").click();
    await button("Play").click();
    const progress = page.getByRole("progressbar", { name: / of / });
    const at = async () => (await progress.getAttribute("aria-label")) ?? (await progress.textContent());
    const started = await at();
    await expect.poll(at, { message: "playing, the song moves on", timeout: 10_000 }).not.toBe(started);
    await pause.click();
    const resume = page.getByRole("button", { name: "Resume the cockpit" });
    await expect(resume).toBeVisible();
    const held = await at();
    await page.waitForTimeout(2500);
    expect(await at(), "paused, the song keeps its place").toBe(held);
    await resume.click();
    await expect(button("Pause"), "run again, the song is still playing").toHaveCount(1);
    await expect.poll(at, { message: "and moves on from where it stood", timeout: 10_000 }).not.toBe(held);
  } finally {
    await browser.close();
  }
});

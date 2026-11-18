// The cockpit demo's files are ljos-ui's examples/car-cockpit as one
// commit has them (bundle/Demos/Cockpit/UPSTREAM.json): a change made
// to the copy here, not brought over by scripts/sync-cockpit.mjs, is a
// copy that drifted from the app it says it is.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "@playwright/test";
import { sha256, shipped, target } from "../scripts/sync-cockpit.mjs";

const upstream = JSON.parse(readFileSync(join(target, "UPSTREAM.json"), "utf8"));
const walk = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(directory, entry.name)) : [relative(target, join(directory, entry.name))]));

test("the cockpit's files are those of the ljos-ui commit they name", () => {
  expect(upstream.commit).toMatch(/^[0-9a-f]{40}$/);
  const changed = Object.entries(upstream.files).filter(([path, hash]) => !existsSync(join(target, path)) || sha256(readFileSync(join(target, path))) !== hash);
  expect(changed.map(([path]) => path), "edit ljos-ui's example and run scripts/sync-cockpit.mjs").toEqual([]);
});

test("the copy holds what the app runs on and nothing else", () => {
  const here = walk(target).filter((path) => path !== "UPSTREAM.json").sort();
  expect(here).toEqual(Object.keys(upstream.files).sort());
  expect(here.every(shipped)).toBe(true);
  expect(here).toContain("Main.qml");
  expect(here.filter((path) => path.endsWith(".glb")).length).toBeGreaterThan(0);
});

const shown = (locator) => locator.filter({ visible: true });

// A browser that offers WebGPU and gives the page no adapter draws a
// View3D on the JavaScript renderer, which reads no model from a file:
// the car would stand without its body. The cockpit keeps its picture
// there, as where WebGPU is missing, and says why.
test("without a WebGPU adapter the cockpit keeps its picture and says why", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    await context.addInitScript(() => {
      if (navigator.gpu) navigator.gpu.requestAdapter = async () => null;
    });
    const page = await context.newPage();
    await page.goto("/demos/cockpit/");
    await page.waitForSelector('#app[data-ljos-hydrated="true"]');
    await expect(shown(page.getByText(/runs in a browser with WebGPU/)).first()).toBeAttached({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Run the cockpit" })).toHaveCount(0);
    await expect(shown(page.locator('img[src*="demo-cockpit"]')).first()).toBeAttached();
  } finally {
    await context.close();
  }
});

// With an adapter (SwiftShader's, so any machine has one) the cockpit
// runs as the reader would use it: its own buttons by name, a part of
// the car opened, and an edit to one of its files compiled and shown.
test("with WebGPU the cockpit runs, opens a door, and is made again from an edit", async ({ playwright, baseURL }) => {
  const browser = await playwright.chromium.launch({ args: ["--enable-unsafe-webgpu", "--use-webgpu-adapter=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
    const page = await context.newPage();
    await page.goto("/demos/cockpit/");
    await page.waitForSelector('#app[data-ljos-hydrated="true"]');
    const run = page.getByRole("button", { name: "Run the cockpit" });
    await run.scrollIntoViewIfNeeded();
    await run.click();
    await expect(page.getByRole("button", { name: "Pause the cockpit" }), "once the cockpit is drawn, Run is its Pause").toBeVisible({ timeout: 60_000 });
    const button = (name) => page.getByRole("button", { name, exact: true });
    await button("Car").click();
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
    await page.getByRole("textbox", { name: "Edit the cockpit's Cockpit.qml" }).first().click();
    const editor = page.locator(`.cm-content[aria-label="Edit the cockpit's Cockpit.qml"]`).first();
    await expect(editor).toBeFocused({ timeout: 30_000 });
    await editor.fill(cockpit.replace("t`Climate`", "t`Cabin`"));
    await expect(button("Cabin"), "the edited cockpit names its page as the edit says").toHaveCount(1, { timeout: 60_000 });
    await expect(button("Climate")).toHaveCount(0);
  } finally {
    await browser.close();
  }
});

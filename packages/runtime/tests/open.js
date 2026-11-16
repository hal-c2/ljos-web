// `test` for scenes: anything the page logs as an error or a warning fails
// the test. Solid's diagnostics are warnings: a read it could not track, a
// write it would not allow.
import { expect, test as base } from "@playwright/test";

// What a graphics driver says of how fast it was is no problem of the
// page's: a picture bigger than a thumbnail read back from WebGL has one
// say it waited.
const DRIVER = /GL Driver Message \(OpenGL, Performance/;
// Nor is the browser's saying WebGPU has no adapter for the page: a View3D
// asks for one to know whether to draw on wgpu, and draws on the JavaScript
// renderer when there is none.
const NO_ADAPTER = /^No available adapters\.$/;

export const test = base.extend({
  // What a scene is to say, as Qt says it of the same QML: a spec names it
  // with `test.use({ told: [/…/] })`.
  told: [[], { option: true }],
  page: async ({ page, told }, use) => {
    const problems = [];
    page.on("pageerror", (error) => problems.push(error.message));
    page.on("console", (message) => {
      if ((message.type() === "error" || message.type() === "warning") && !DRIVER.test(message.text()) && !NO_ADAPTER.test(message.text())) problems.push(message.text());
    });
    await use(page);
    expect(problems.filter((problem) => !told.some((pattern) => pattern.test(problem)))).toEqual([]);
  },
});

export { expect };

// Opens `scenes/<scene>.js` and waits for it.
export async function open(page, scene) {
  await page.goto(`/?scene=${scene}`);
  await page.waitForFunction(() => window.ready);
}

// An item's rectangle on the page, by the name the scene exported it under.
export const rect = (page, name) =>
  page.evaluate((name) => {
    const { x, y, width, height } = window.objects[name].$node.getBoundingClientRect();
    return { x, y, width, height };
  }, name);

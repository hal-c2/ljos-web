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

// The parts of the test running in this worker, each `{ title, since,
// took }`, as `phase` records them; none outside a test.
let parts = null;

// One part of a test, a step the report names and times. A test that runs
// out of time says which part it was in, for how long, and what each part
// before it took: its time alone says only that the whole ran out.
export async function phase(title, run) {
  if (!parts) throw new Error(`phase "${title}" runs outside a test: nothing would say where it stalled`);
  const at = { title, since: Date.now(), took: null };
  parts.push(at);
  try {
    return await test.step(title, run);
  } finally {
    at.took = Date.now() - at.since;
  }
}

export const test = base.extend({
  phases: [
    async ({}, use, testInfo) => {
      const mine = [];
      parts = mine;
      try {
        await use(mine);
      } finally {
        parts = null;
      }
      if (testInfo.status === "timedOut" && mine.length) {
        const now = Date.now();
        const said = mine.map(({ title, since, took }) => (took === null ? `${title}: unfinished after ${now - since} ms` : `${title}: ${took} ms`));
        throw new Error(`ran out of time in "${mine.findLast(({ took }) => took === null)?.title ?? "none of its parts"}"; its parts:\n${said.join("\n")}`);
      }
    },
    { auto: true },
  ],
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

// The time a pointer's moves come at, as the test says: each pointer event
// is stamped a frame's 16 ms after the one before it, or what `gap(ms)`
// gives the next one. A point's speed is read from its events' stamps
// (QtQuick/pointer.js), so a speed is the test's, however late a loaded
// page runs the events; timed by waiting between them, it was the
// machine's. Installed before the scene is opened.
export async function stampPointers(page) {
  await page.addInitScript(() => {
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"])
      window.addEventListener(
        type,
        (event) => {
          window.pointerStamp = (window.pointerStamp ?? event.timeStamp) + (window.pointerGap ?? 16);
          window.pointerGap = undefined;
          Object.defineProperty(event, "timeStamp", { value: window.pointerStamp });
        },
        true,
      );
  });
  return (ms) => page.evaluate((ms) => (window.pointerGap = ms), ms);
}

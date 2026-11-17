// What every e2e spec stands on: the pages the build wrote and the
// live examples on each, read from the build itself; a page opened as
// a reader opens it, with every console error and uncaught exception
// kept; and the reader's own hands (a press on a live picture, a
// two-finger pinch through CDP), plus the two checks that something
// keeps moving: `expectFramesAdvance` and `expectVideoPlays`.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, expect } from "@playwright/test";

const dist = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "dist");
export const siteBase = process.env.LJOS_SITE_BASE ?? "/";
export const PICTURE = 'img[alt="What this example draws"]';
export const HYDRATED = '#app[data-ljos-hydrated="true"]';
// `ljos-web/wasm-check.js`'s NEEDS_WASM, as a reader reads it.
export const NEEDS_WASM = /Live editing needs WebAssembly/;

function propsOf(file) {
  const html = readFileSync(file, "utf8");
  const json = html.match(/<script type="application\/json" id="ljos-props">([\s\S]*?)<\/script>/)?.[1];
  return json ? JSON.parse(json) : null;
}

function* pagesIn(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* pagesIn(path);
    else if (name === "index.html") yield path;
  }
}

// Every docs page the build wrote with its live examples, in order:
// `{ route, examples: [{ index, hash, entry, code, files }] }`, where
// `code` is the entry file's and `files` every file the block shows. A page's
// example is its index among the page's live pictures, which is how a
// reader meets it, and its hash, which is how the audit names it.
export function livePages() {
  if (!existsSync(dist)) return [];
  const pages = [];
  for (const file of pagesIn(dist)) {
    const page = propsOf(file)?.page;
    if (!page?.route) continue;
    const examples = page.blocks
      .filter((block) => block.kind === "live")
      .map((block, index) => ({
        index,
        hash: block.live.hash,
        entry: block.live.entry,
        code: (block.live.display.find((file) => file.name === block.live.entry) ?? block.live.display[0]).code,
        files: block.live.display.map(({ name, code }) => ({ name, code })),
        // The site's own files the example names (files=), by name.
        given: Object.keys(block.live.given ?? {}),
        // Those files' bytes, base64 as the page carries them.
        packed: block.live.given ?? {},
      }));
    pages.push({ route: page.route, examples });
  }
  return pages.sort((a, b) => a.route.localeCompare(b.route));
}

export const url = (route) => `${siteBase}${route.replace(/^\//, "")}`;

// What an example's own QML says it is: its root type, whether it is a
// window, draws in 3D, moves on its own (a timer, a running or infinite
// animation), or is a popup at the root that nothing opens (`closed`),
// which draws nothing on the site as it draws nothing natively, so a
// spec knows what "it works" means for it.
export function classify(code) {
  const root = (code.replace(/^\s*(import|\/\/|pragma).*$/gm, "").match(/^\s*([A-Z][\w.]*)\s*\{/m) || [])[1] ?? "?";
  return {
    root,
    window: /^(Window|ApplicationWindow)$/.test(root),
    threeD: /\bView3D\b/.test(code),
    moves: /\bTimer\s*\{|running:\s*true|loops:\s*Animation\.Infinite|\bAnimatedSprite\b|\bAnimation on\b/.test(code),
    video: /\b(Video|VideoOutput|MediaPlayer)\b/.test(code),
    closed: /^(Menu|Popup|Dialog|Drawer|ToolTip)$/.test(root) && !/\bvisible:\s*true\b|\.open\(\)|\.popup\(/.test(code),
  };
}

export const test = base.extend({
  // The project's browser: with WebAssembly, or with it gone before
  // any of the page's scripts run.
  wasm: [true, { option: true }],
  errors: async ({}, use) => {
    await use([]);
  },
  page: async ({ page, wasm, errors }, use) => {
    if (!wasm) await page.addInitScript(() => delete globalThis.WebAssembly);
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(`uncaught: ${error.message}`));
    await page.route(/^https:\/\/example\.org\//, imagined);
    await use(page);
  },
});
export { expect };

// The docs' examples ask example.org, the address kept for examples,
// for what a real app would ask its own server: nothing there answers
// them, and a browser refuses another site's answer anyway. The tests
// answer as the server each example imagines would, so an example shows
// what it is for, the same on every machine and offline.
const ANSWERS = [
  [/^\/weather\/([^/]+)\.txt$/, (city) => ({ contentType: "text/plain", body: `Rain in ${decodeURIComponent(city)}\n` })],
  [/^\/api\/activity$/, () => ({ contentType: "application/json", body: JSON.stringify({ activity: "Walk to the lighthouse" }) })],
];

function imagined(route) {
  const { pathname } = new URL(route.request().url());
  for (const [path, answer] of ANSWERS) {
    const found = path.exec(pathname);
    if (found) return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, ...answer(...found.slice(1)) });
  }
  return route.fulfill({ status: 404, headers: { "access-control-allow-origin": "*" }, body: "" });
}

export async function open(page, route) {
  await page.goto(url(route));
  await page.waitForSelector(HYDRATED, { timeout: 40_000 });
}

// The page scrolls in its own Flickable, not the document: bring an
// element to the middle of the window before a hand goes to it.
export async function centre(locator) {
  await locator.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await locator.page().waitForTimeout(150);
}

export async function centreOf(locator) {
  const box = await locator.boundingBox();
  expect(box, "the element is laid out").toBeTruthy();
  return { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 400), box };
}

// A live example: its picture, and the window the picture is drawn in
// (`stage`); once it runs, the running example, which is the one child
// of the window a reader sees that holds anything (the window keeps
// the picture's holder and the prerendered copy beside it, hidden).
// The window stands on the stage's ground; before that ground, the
// toolbar (Run, Edit, Reset); after it, the line where the
// block says what went wrong, then the values strip.
export function liveBlock(page, index) {
  const picture = page.locator(PICTURE).nth(index);
  const stage = picture.locator("xpath=../../..");
  const ground = stage.locator("xpath=..");
  return {
    picture,
    stage,
    running: stage.locator("xpath=./*[*]").filter({ visible: true }).first(),
    toolbar: ground.locator("xpath=preceding-sibling::*[1]"),
    told: ground.locator("xpath=following-sibling::*[1]"),
    values: ground.locator("xpath=following-sibling::*[2]"),
    block: ground.locator("xpath=.."),
  };
}

// A press where a reader's finger lands: the middle of what they see.
// The block's own press area lies over its picture, so a click aimed
// at the picture element would be refused as covered.
export async function press(locator) {
  await centre(locator);
  const { x, y } = await centreOf(locator);
  await locator.page().mouse.click(x, y);
}

// Two frames: what a scroll or a press set going has been heard.
export function frames(page) {
  return page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}

// The Run button of a block or a demo (Runner).
export function runButton(locator, name = "Run this example") {
  return locator.getByRole("button", { name });
}

// Press the picture, as a reader starts an example (on its Run button,
// where it has one), and wait until the example runs in its place.
export async function run(page, index) {
  const block = liveBlock(page, index);
  await press(block.picture);
  await expect(block.picture, "the example replaces its picture").toBeHidden({ timeout: 30_000 });
  await centre(block.stage);
  return block;
}

// Two fingers moving apart on one point, through the browser's own
// touch input (CDP), as a reader pinches on a phone or a touchpad.
export async function pinch(page, x, y, { from = 20, to = 80 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const points = (d) => [
    { x: x - d, y, id: 1 },
    { x: x + d, y, id: 2 },
  ];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(from) });
  for (let d = from + 6; d <= to; d += 6) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(d) });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

export async function drag(page, from, to, steps = 12) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
  await page.mouse.up();
}

// How far the page itself has scrolled: every scrolled element's top,
// so a spec can tell an example's drag from the page taking it.
export function pageScroll(page) {
  return page.evaluate(() => [...document.querySelectorAll("#app *")].filter((element) => element.scrollTop > 0).map((element) => element.scrollTop).join(","));
}

// What a region shows: its structure, words and inline styles, the
// state of its inputs, folded into one string; changed by any edit a
// reader's input made.
export function signature(locator) {
  return locator.evaluate((element) => {
    const styles = [...element.querySelectorAll("*")].map((child) => child.getAttribute("style") ?? "").join("|");
    const values = [...element.querySelectorAll("input,textarea")].map((input) => `${input.value}${input.checked ?? ""}`).join("|");
    return `${element.querySelectorAll("*").length}:${element.innerText}:${styles}:${values}`;
  });
}

// The region keeps drawing new frames: a picture of it, taken again and
// again, comes to differ from the first within a few seconds. Two
// pictures a fixed time apart are not enough: an animation whose loop
// lasts that long (a pulse of 1 s) shows the same frame in both. For a
// canvas (3D, a shader) its pixels are read back as the screen shows
// them, which is what a reader sees stop.
export async function expectFramesAdvance(locator, { within = 3_000, message = "the picture keeps changing" } = {}) {
  const page = locator.page();
  const clip = async () => {
    const box = await locator.boundingBox();
    expect(box, "the region is laid out").toBeTruthy();
    const viewport = page.viewportSize();
    // Only the part of the region on screen: a part cut off at an edge
    // is taken off its size, so the picture never takes in the page
    // beside it.
    const x = Math.max(0, box.x);
    const y = Math.max(0, box.y);
    const width = Math.min(box.x + box.width, viewport.width) - x;
    const height = Math.min(box.y + box.height, viewport.height) - y;
    expect(width > 0 && height > 0, "the region is on screen").toBe(true);
    return { x, y, width, height };
  };
  // Twice, each from a fresh picture: a region that changed once and
  // then stopped does not pass on its one change.
  for (const time of ["first", "again"]) {
    const from = await page.screenshot({ clip: await clip() });
    await expect
      .poll(async () => Buffer.compare(from, await page.screenshot({ clip: await clip() })) !== 0, { message: `${message} (${time})`, timeout: within, intervals: [130, 170, 230] })
      .toBe(true);
  }
}

// A `<video>` in the region plays: its time moves on by more than a
// fraction of a second while nobody touches it.
export async function expectVideoPlays(locator, { within = 1_500 } = {}) {
  const video = locator.locator("video").first();
  await expect(video, "the example has a video").toBeAttached();
  await expect.poll(() => video.evaluate((element) => element.readyState), { message: "the video has data" }).toBeGreaterThanOrEqual(2);
  const t0 = await video.evaluate((element) => element.currentTime);
  await locator.page().waitForTimeout(within);
  const state = await video.evaluate((element) => ({ t: element.currentTime, paused: element.paused, error: element.error?.message ?? null }));
  expect(state.error, "the video has no error").toBeNull();
  expect(state.paused, "the video is not paused").toBe(false);
  expect(state.t - t0, "the video's time moves on").toBeGreaterThan(0.25);
}

// Errors a page says that are not an example's fault: a browser
// without WebAssembly is told so by the page itself, as a warning, so
// nothing here is expected; kept as the one place to name one.
export const expectedErrors = [];

export function unexpected(errors) {
  return errors.filter((text) => !expectedErrors.some((pattern) => pattern.test(text)));
}

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
// A live block's picture in the light scheme: every block has exactly
// one, so it counts and finds blocks. A block whose example looks
// different in the dark has a second, `-dark.png`, that the dark page
// shows instead (`SHOWN` is whichever of the two a scheme shows).
export const PICTURE = 'img[alt="What this example draws"]:not([src$="-dark.png"])';
export const SHOWN = 'img[alt="What this example draws"]';
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
// `{ route, examples: [{ index, hash, ownDark, entry, code, files }] }`, where
// `code` is the entry file's and `files` every file the block shows, and
// `ownDark` whether the build shipped a dark picture for it. A page's
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
        ownDark: existsSync(join(dist, "Examples", `${block.live.hash}-dark.png`)),
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
// It is there once it stands still: the same place in two animation frames
// running, however long those take.
export async function centre(locator) {
  await locator.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await locator.evaluate(
    (element) =>
      new Promise((done) => {
        let last = null;
        const look = () => {
          const { top, left } = element.getBoundingClientRect();
          const now = `${top} ${left}`;
          if (now === last) return done();
          last = now;
          requestAnimationFrame(look);
        };
        requestAnimationFrame(look);
      }),
  );
}

// Where a hand goes to an element, with its whole box. An element can be
// larger than what a reader sees of it: CodeMirror's lines are as wide as
// the longest, and on a phone its editor scrolls them sideways, so the
// middle of that box is off the page, where a press reaches nothing.
// The point is the one it always was while that is in sight, and the
// middle of the part in sight (the box cut by the window and by every
// ancestor that clips) when it is not.
export async function centreOf(locator) {
  const box = await locator.boundingBox();
  expect(box, "the element is laid out").toBeTruthy();
  const point = { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 400) };
  const seen = await locator.evaluate((element) => {
    let { left, top, right, bottom } = element.getBoundingClientRect();
    const cut = (r) => {
      left = Math.max(left, r.left);
      top = Math.max(top, r.top);
      right = Math.min(right, r.right);
      bottom = Math.min(bottom, r.bottom);
    };
    for (let up = element.parentElement; up; up = up.parentElement) {
      const { overflowX, overflowY } = getComputedStyle(up);
      if (overflowX !== "visible" || overflowY !== "visible") cut(up.getBoundingClientRect());
    }
    cut({ left: 0, top: 0, right: innerWidth, bottom: innerHeight });
    return { left, top, right, bottom };
  });
  const anyInSight = seen.right > seen.left && seen.bottom > seen.top;
  const inSight = point.x >= seen.left && point.x < seen.right && point.y >= seen.top && point.y < seen.bottom;
  // Nothing in sight (a box only measured, never pressed) keeps the point.
  return { ...(inSight || !anyInSight ? point : { x: (seen.left + seen.right) / 2, y: (seen.top + seen.bottom) / 2 }), box };
}

// A live example: the picture its scheme shows, and the window the
// picture is drawn in (`stage`); once it runs, the running example,
// which is the one child of the window a reader sees that holds
// anything (the window keeps the pictures' holders and the prerendered
// copy beside them, hidden).
// The window stands on the stage's ground; after it, the line where
// the block says what went wrong, then the values strip. The three
// are the stage's part of the block. It and the toolbar's (Run, Edit,
// Reset, Source) each stand in one of two places, before the code on a
// phone and after it elsewhere. `block` is the card the reader sees
// (objectName "codeCard", the same in every language): its file tabs
// sit in the card's head, outside the column the ground stands in.
export function liveBlock(page, index) {
  const stage = page.locator(PICTURE).nth(index).locator("xpath=../../..");
  const ground = stage.locator("xpath=..");
  return {
    picture: stage.locator(SHOWN).filter({ visible: true }),
    stage,
    running: stage.locator("xpath=./*[*]").filter({ visible: true }).first(),
    toolbar: ground.locator("xpath=../../../*[position()=2 or position()=4]/*"),
    told: ground.locator("xpath=following-sibling::*[1]"),
    values: ground.locator("xpath=following-sibling::*[2]"),
    block: stage.locator('xpath=ancestor::*[@data-object-name="codeCard"][1]'),
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
  return animationFrames(page, 2);
}

// `count` animation frames of the page's, one after another: what a check
// that something does not happen waits through, counted in the frames it
// would have happened in, not in time, which a loaded machine fills with
// fewer of them.
export function animationFrames(page, count) {
  return page.evaluate(
    (count) =>
      new Promise((done) => {
        let left = count;
        const next = () => (--left <= 0 ? done() : requestAnimationFrame(next));
        requestAnimationFrame(next);
      }),
    count,
  );
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
  // A move a frame: each is heard on its own, as a finger's are.
  for (let d = from + 6; d <= to; d += 6) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(d) });
    await animationFrames(page, 1);
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

// What the page's clock has run, counted where it steps (`ljos-web/clock`):
// `{ frames, time }`, the time in ms of the scene's own.
export const clockOf = (page) => page.evaluate(() => ({ frames: 0, time: 0, ...globalThis[Symbol.for("ljos-web/clock")] }));

// Until the page's clock has run `more` frames past `frames`, however long
// they take: a loaded machine runs fewer of them a second, not fewer of
// them. A clock with nothing left to run steps no frame at all, so waiting
// on it would say only, at the test's timeout, that the wait timed out:
// what the clock stopped at is returned at once instead, for the caller to
// read the region once more and say so.
async function clockRuns(page, frames, more, what) {
  return base.step(`${what}: the clock runs ${more} more frames`, async () => {
    for (;;) {
      const waited = await page.waitForFunction(
        ([after]) => {
          const clock = globalThis[Symbol.for("ljos-web/clock")];
          if ((clock?.frames ?? 0) >= after) return "ran";
          return clock?.jobs ? false : "stopped";
        },
        [frames + more],
        { timeout: 0, polling: "raf" },
      );
      if ((await waited.jsonValue()) === "ran") return null;
      // A job that ends as the next one starts can leave none for a moment:
      // a stop is none over two of the page's frames.
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      const now = await clockOf(page);
      if (now.frames >= frames + more) return null;
      if (now.jobs) continue;
      return now;
    }
  });
}

// Until the scene's clock has handed out `ms` of its own time from now, or
// has nothing left to run: what an example that fades in or settles waits
// for before it is read, counted in the time its animations were given, not
// in the test's, which a loaded machine spends before a frame runs.
export async function sceneRuns(page, ms, what) {
  const { time } = await clockOf(page);
  // Two of the page's frames first: a fade or Behavior that what came
  // just before started (a run, a scroll) is one of the clock's jobs by
  // then, and is not taken for nothing left to run. Not a frame of the
  // clock's: one that has nothing to run steps no frame at all.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await base.step(`${what}: the scene's clock gives ${ms} ms more, or has nothing to run`, () =>
    page.waitForFunction(
      ([until]) => {
        const clock = globalThis[Symbol.for("ljos-web/clock")];
        return !clock?.jobs || clock.time >= until;
      },
      [time + ms],
      { timeout: 0, polling: "raf" },
    ),
  );
}

// The region keeps drawing new frames: as the page's clock runs, a picture
// of it, taken again and again, comes to differ from the first. What bounds
// the wait is the scene's time, not the test's: the region has failed once
// the clock has run `frames` frames and `span` ms since the first picture,
// and every picture since is the same. Two pictures a fixed time apart are
// not enough: an animation whose loop lasts that long (a pulse of 1 s) shows
// the same frame in both. For a canvas (3D, a shader) its pixels are read
// back as the screen shows them, which is what a reader sees stop. `once`
// is for a scene that moves for a while and then comes to rest by design:
// it must change once, not keep changing.
export async function expectFramesAdvance(locator, { span = 3_000, frames = 30, message = "the picture keeps changing", once = false } = {}) {
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
  for (const time of once ? ["first"] : ["first", "again"]) {
    const from = await page.screenshot({ clip: await clip() });
    const start = await clockOf(page);
    for (let pictures = 1; ; pictures++) {
      const seen = await clockOf(page);
      const ran = { frames: seen.frames - start.frames, time: Math.round(seen.time - start.time) };
      expect(
        ran.frames < frames || ran.time < span,
        `${message} (${time}): the clock ran ${ran.frames} frames and ${ran.time} ms of the scene's time, and ${pictures} pictures of it are the first`,
      ).toBe(true);
      const stopped = await clockRuns(page, seen.frames, 6, `${message} (${time})`);
      // A scene can draw its last change and stop within those frames: the
      // picture it stopped on is compared before the stop is held against it.
      if (Buffer.compare(from, await page.screenshot({ clip: await clip() })) !== 0) break;
      if (stopped) {
        const shows = (await locator.innerText().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 200);
        throw new Error(
          `${message} (${time}): the clock has nothing left to run, at ${stopped.frames} frames and ${Math.round(stopped.time)} ms ` +
            `of the scene's time, and the region still shows its first picture: "${shows}"`,
        );
      }
    }
  }
}

// How long the Lottie demo's genie (its second animation, in `slot`) takes
// to play through once its Again is pressed, in ms of the scene's own
// time: from the first frame it draws to the last, read where the page
// draws them. The dance goes on, so the clock does; the genie has played
// through once it has drawn nothing new for 1.5 s of the scene's time.
export async function playThrough(page, slot) {
  const genie = slot.locator("svg.qq-lottie").nth(1);
  await genie.evaluate((svg) => {
    const clock = globalThis[Symbol.for("ljos-web/clock")];
    svg.$drawn?.observer.disconnect();
    const drawn = (svg.$drawn = { first: null, last: null, observer: null });
    drawn.observer = new MutationObserver(() => {
      drawn.first ??= clock.time;
      drawn.last = clock.time;
    });
    drawn.observer.observe(svg, { subtree: true, attributes: true, childList: true });
  });
  await press(slot.getByRole("button", { name: "Play the genie avatar again" }));
  await genie.page().waitForFunction(
    (svg) => {
      const { first, last } = svg.$drawn;
      return first !== null && globalThis[Symbol.for("ljos-web/clock")].time - last > 1_500;
    },
    await genie.elementHandle(),
    { timeout: 30_000, polling: "raf" },
  );
  return genie.evaluate((svg) => {
    svg.$drawn.observer.disconnect();
    return svg.$drawn.last - svg.$drawn.first;
  });
}

// A `<video>` in the region plays: its own time moves on by more than a
// quarter of a second while nobody touches it, however long the page takes
// to play that quarter. A video that loops counts what it played across
// the loop.
export async function expectVideoPlays(locator, { by = 0.25 } = {}) {
  const video = locator.locator("video").first();
  await expect(video, "the example has a video").toBeAttached();
  await expect.poll(() => video.evaluate((element) => element.readyState), { message: "the video has data" }).toBeGreaterThanOrEqual(2);
  const state = await base.step(`the video's time moves on by ${by} s`, () =>
    video.evaluate(
      (element, by) =>
        new Promise((done) => {
          let last = element.currentTime;
          let played = 0;
          const events = ["timeupdate", "pause", "ended", "error"];
          const check = () => {
            const now = element.currentTime;
            played += now >= last ? now - last : now;
            last = now;
            if (!(element.error || element.paused || played >= by)) return;
            for (const name of events) element.removeEventListener(name, check);
            done({ played, paused: element.paused, error: element.error?.message ?? null });
          };
          for (const name of events) element.addEventListener(name, check);
          check();
        }),
      by,
    ),
  );
  expect(state.error, "the video has no error").toBeNull();
  expect(state.paused, "the video is not paused").toBe(false);
  expect(state.played, "the video's time moves on").toBeGreaterThanOrEqual(by);
}

// Errors a page says that are not an example's fault: a browser
// without WebAssembly is told so by the page itself, as a warning, so
// nothing here is expected; kept as the one place to name one.
export const expectedErrors = [];

export function unexpected(errors) {
  return errors.filter((text) => !expectedErrors.some((pattern) => pattern.test(text)));
}

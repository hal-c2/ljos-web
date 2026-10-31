// `Gauge` and `Dial` as their Rust wrote them, in a browser: painted from the
// hook's display list, told of input, and compared by picture with what the
// desktop draws of the same QML (docs/LJOS_WEB.md A22).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const REFERENCE = process.env.LJOS_GAUGE_PICTURES ?? "picture-out";

test.use({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 1 });

// Every fill and clear of any canvas, counted as the page runs.
const counting = () => {
  window.canvasOps = 0;
  const proto = CanvasRenderingContext2D.prototype;
  for (const name of ["clearRect", "fillRect", "fill", "drawImage", "fillText"]) {
    const original = proto[name];
    proto[name] = function (...args) {
      window.canvasOps++;
      return original.apply(this, args);
    };
  }
};

async function open(page, scene) {
  page.problems = [];
  page.on("pageerror", (error) => page.problems.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") page.problems.push(message.text());
  });
  await page.addInitScript(counting);
  await page.goto(`/?scene=${scene}`);
  await page.waitForFunction(() => window.ready);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}

test.afterEach(async ({ page }) => {
  expect(page.problems).toEqual([]);
});

// What differs by more than `tolerance` on a channel, as a share of pixels.
async function compare(page, shot, reference, tolerance) {
  return page.evaluate(
    async ({ shot, reference, tolerance }) => {
      const pixels = async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = new OffscreenCanvas(image.width, image.height);
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        return { width: image.width, height: image.height, data: context.getImageData(0, 0, image.width, image.height).data };
      };
      const one = await pixels(shot);
      const other = await pixels(reference);
      if (one.width !== other.width || one.height !== other.height) return { size: [one.width, one.height, other.width, other.height], share: 1 };
      let differing = 0;
      for (let at = 0; at < one.data.length; at += 4) {
        for (let channel = 0; channel < 3; channel++) {
          if (Math.abs(one.data[at + channel] - other.data[at + channel]) > tolerance) {
            differing++;
            break;
          }
        }
      }
      return { share: differing / (one.width * one.height) };
    },
    { shot, reference, tolerance },
  );
}

async function againstDesktop(page, scene, width, height, allowed) {
  const shot = await page.screenshot({ clip: { x: 0, y: 0, width, height } });
  mkdirSync(REFERENCE, { recursive: true });
  writeFileSync(join(REFERENCE, `${scene}.browser.png`), shot);
  const reference = readFileSync(join(REFERENCE, `${scene}.desktop.png`));
  const { share, size } = await compare(page, shot.toString("base64"), reference.toString("base64"), 3);
  expect(size).toBeUndefined();
  expect(share).toBeLessThanOrEqual(allowed);
}

test("MIGRATION's Gauge, as written there, draws what the desktop draws", async ({ page }) => {
  await open(page, "Gauges");
  await againstDesktop(page, "Gauges", 320, 120, 0.005);
});

test("a rounded rectangle, a path and an image draw what the desktop draws", async ({ page }) => {
  await open(page, "Dials");
  await againstDesktop(page, "Dials", 240, 240, 0.005);
});

// DECISION: text may differ. The desktop's picture is in the bundled font and
// the browser sets it in its own, so what differs is the glyphs' pixels, not
// where the rest of the item is: an allowance of what the words cover.
test("text through a hook lands where the desktop puts it", async ({ page }) => {
  await open(page, "Label");
  await againstDesktop(page, "Label", 240, 80, 0.06);
});

test("a change to what the hook read repaints, and nothing else does", async ({ page }) => {
  await open(page, "Main");
  const ops = () => page.evaluate(() => window.canvasOps);
  const idle = await ops();
  expect(idle).toBeGreaterThan(0);

  await page.waitForTimeout(300);
  expect(await ops()).toBe(idle);

  await page.evaluate(() => window.scene.setOther(30));
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(done)));
  expect(await ops()).toBe(idle);

  await page.evaluate(() => window.scene.setValue(0.75));
  const after = await ops();
  expect(after).toBeGreaterThan(idle);
  // The bar is three quarters of the item now.
  const shot = await page.screenshot({ clip: { x: 10, y: 10, width: 200, height: 20 } });
  expect(await black(page, shot)).toBeCloseTo(0.75, 1);
});

async function black(page, shot) {
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, 1);
    let dark = 0;
    for (let at = 0; at < data.length; at += 4) if (data[at + 3] > 128 && data[at] < 128) dark++;
    return dark / image.width;
  }, shot.toString("base64"));
}

test("the size of the item is a repaint", async ({ page }) => {
  await open(page, "Main");
  const ops = await page.evaluate(() => window.canvasOps);
  await page.evaluate(() => (window.scene.gauge.width = 100));
  expect(await page.evaluate(() => window.canvasOps)).toBeGreaterThan(ops);
  const shot = await page.screenshot({ clip: { x: 10, y: 10, width: 100, height: 20 } });
  expect(await black(page, shot)).toBeCloseTo(0.5, 1);
});

test("a press, a release and a hover reach the hook through the runtime's delivery", async ({ page }) => {
  await open(page, "Main");
  const dial = () => page.evaluate(() => {
    const d = window.scene.dial;
    return { presses: d.presses, releases: d.releases, hovered: d.hovered, pressX: d.pressX, pressedX: window.scene.pressedX };
  });
  await page.mouse.move(60, 100);
  expect((await dial()).hovered).toBe(true);
  await page.mouse.down();
  expect(await dial()).toMatchObject({ presses: 1, releases: 0, pressX: 50, pressedX: 50 });
  await page.mouse.up();
  expect((await dial()).releases).toBe(1);
  await page.mouse.move(380, 280);
  expect((await dial()).hovered).toBe(false);
});

test("the wheel turns it and the page does not scroll", async ({ page }) => {
  await open(page, "Main");
  await page.mouse.move(60, 100);
  await page.mouse.wheel(0, -120);
  await page.waitForFunction(() => window.scene.dial.turns !== 0);
  // 120 pixels is 144 of angle (1.2 per pixel, `QtQuick/pointer.js`), 1.2 notches.
  expect(await page.evaluate(() => window.scene.dial.turns)).toBeCloseTo(0.15);
});

test("a key reaches it once a press has given it focus", async ({ page }) => {
  await open(page, "Main");
  await page.mouse.click(60, 100);
  await page.keyboard.press("Space");
  expect(await page.evaluate(() => window.scene.dial.keys)).toBe(1);
  await page.keyboard.press("a");
  expect(await page.evaluate(() => window.scene.dial.keys)).toBe(1);
});

test("load_image gives the hook a picture, and it repaints", async ({ page }) => {
  await open(page, "Main");
  const url = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HgAGgwJ/lK3Q6wAAAABJRU5ErkJggg==";
  await page.evaluate((url) => window.scene.dial.load(url), url);
  await page.waitForFunction(() => window.scene.dial.loaded);
  const shot = await page.screenshot({ clip: { x: 10 + 32, y: 50 + 12, width: 1, height: 1 } });
  expect(await black(page, shot)).toBe(0);
});

test("an object that goes takes its struct with it", async ({ page }) => {
  await open(page, "Main");
  const ops = await page.evaluate(() => {
    window.scene.dial.destroy();
    return window.canvasOps;
  });
  await page.mouse.move(60, 100);
  await page.mouse.down();
  await page.mouse.up();
  expect(await page.evaluate(() => window.canvasOps)).toBe(ops);
});

// `inspect(root).screenshot()`: a PNG of a mounted root, as Ljós's
// `app_screenshot` gives one of a window. The reference is the page
// itself: the same test's screenshot of where the root is, through
// Playwright, read at the same points.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { expect, test } from "./open.js";

const opened = async (page, scene = "inspectpictured") => {
  await page.goto(`/?scene=${scene}&inspect`);
  await page.waitForFunction(() => window.ready && window.scene.loaded !== false);
};

// The root's picture and the page's own screenshot of the root, each read
// at `points` (logical pixels of the root), and how many of all their
// pixels are not alike.
async function compared(page, points, options = {}) {
  const box = await page.evaluate(() => {
    const { x, y, width, height } = window.scene.$node.getBoundingClientRect();
    return { x, y, width, height };
  });
  const shot = (await page.screenshot({ clip: box })).toString("base64");
  return page.evaluate(
    async ([shot, points, options]) => {
      const taken = await window.inspector.screenshot(options);
      if (taken.error) return taken;
      const decode = async (blob) => {
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const paper = canvas.getContext("2d", { willReadFrequently: true });
        paper.drawImage(bitmap, 0, 0);
        return { width: bitmap.width, height: bitmap.height, data: paper.getImageData(0, 0, bitmap.width, bitmap.height).data };
      };
      const picture = await decode(new Blob([taken.png], { type: "image/png" }));
      const reference = await decode(await (await fetch(`data:image/png;base64,${shot}`)).blob());
      const at = (image, [x, y]) => {
        const scale = image.width / window.scene.width;
        const index = (Math.floor(y * scale) * image.width + Math.floor(x * scale)) * 4;
        return Array.from(image.data.slice(index, index + 3)).join(" ");
      };
      let unlike = 0;
      if (picture.width === reference.width && picture.height === reference.height) {
        for (let index = 0; index < picture.data.length; index += 4) {
          const far = [0, 1, 2].some((channel) => Math.abs(picture.data[index + channel] - reference.data[index + channel]) > 24);
          if (far) unlike++;
        }
      } else unlike = -1;
      return {
        png: [...taken.png.slice(0, 8)],
        width: taken.width,
        height: taken.height,
        scale: taken.scale,
        bytes: taken.bytes,
        area: taken.area,
        decoded: [picture.width, picture.height],
        unlike: unlike / (picture.width * picture.height),
        picture: points.map((point) => at(picture, point)),
        page: points.map((point) => at(reference, point)),
      };
    },
    [shot, points, options],
  );
}

const PNG = [137, 80, 78, 71, 13, 10, 26, 10];

// Points of the scene and what is drawn at each (`inspectpictured.qml`).
const DRAWN = [
  ["a rectangle's colour", [40, 30], "255 0 0"],
  ["a rounded rectangle's", [110, 30], "0 192 0"],
  ["the inside of a glyph of the loaded font", [168, 25], "255 255 0"],
  ["an image", [42, 102], null],
  ["what a Canvas drew", [120, 100], "255 0 255"],
  ["a canvas where it drew nothing", [95, 75], "32 64 96"],
  ["a clipped child inside its parent", [190, 90], "0 255 255"],
  ["the clipped child past its parent", [215, 90], "32 64 96"],
  ["half of white over the root", [250, 90], null],
  ["a turned square's corner, past where it is unturned", [325, 65], "255 128 0"],
  ["where the turned square is not", [302, 72], "32 64 96"],
  ["a Flickable's second row, scrolled to", [60, 200], "0 0 128"],
  ["a field's text", [168, 165], "255 255 255"],
  ["the far corner", [395, 295], "0 0 0"],
];

for (const deviceScaleFactor of [1, 2]) {
  test.describe(`at a device pixel ratio of ${deviceScaleFactor}`, () => {
    test.use({ deviceScaleFactor });

    test("a picture of a root is a PNG of its size times the device pixel ratio", async ({ page }) => {
      await opened(page);
      const taken = await compared(page, []);
      expect(taken.png).toEqual(PNG);
      expect(taken).toMatchObject({ width: 400 * deviceScaleFactor, height: 300 * deviceScaleFactor, scale: deviceScaleFactor, area: [0, 0, 400, 300] });
      expect(taken.decoded).toEqual([taken.width, taken.height]);
      expect(taken.bytes).toBeGreaterThan(PNG.length);
    });

    test("a picture shows what the page draws, at the points the page draws it", async ({ page }) => {
      await opened(page);
      const taken = await compared(page, DRAWN.map(([, point]) => point));
      const named = (pixels) => Object.fromEntries(DRAWN.map(([what], index) => [what, pixels[index]]));
      expect(named(taken.picture)).toEqual(named(taken.page));
      for (const [what, , colour] of DRAWN) if (colour) expect(named(taken.picture)[what], what).toBe(colour);
      // And everywhere else: no pixel is far from the page's.
      expect(taken.unlike).toBe(0);
    });
  });
}

test("a picture is no larger on its longest side than max_size says", async ({ page }) => {
  await opened(page);
  const taken = await compared(page, [[40, 30]], { max_size: 200 });
  expect(taken).toMatchObject({ width: 200, height: 150, scale: 0.5, area: [0, 0, 400, 300] });
  expect(taken.picture).toEqual(["255 0 0"]);
  // A scale of its own, which max_size makes smaller only.
  expect(await compared(page, [], { scale: 3, max_size: 2000 })).toMatchObject({ width: 1200, height: 900, scale: 3 });
});

test("a picture of an object by its id is the part of the root it covers", async ({ page }) => {
  await opened(page);
  const taken = await page.evaluate(async () => {
    const { png, ...rest } = await window.inspector.screenshot({ target: "red", scale: 1 });
    const bitmap = await createImageBitmap(new Blob([png]));
    const paper = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d");
    paper.drawImage(bitmap, 0, 0);
    return { ...rest, centre: Array.from(paper.getImageData(30, 20, 1, 1).data.slice(0, 3)).join(" ") };
  });
  expect(taken).toMatchObject({ width: 60, height: 40, area: [10, 10, 60, 40], centre: "255 0 0" });
  // What sticks out of the root is not in it.
  expect(await page.evaluate(() => window.inspector.screenshot({ target: "corner", scale: 1 }).then(({ area }) => area))).toEqual([380, 280, 20, 20]);
  expect(await page.evaluate(() => window.inspector.screenshot({ target: "nobody" }))).toEqual({ error: "not_found", message: "no object is `nobody`" });
});

test("a root inside a scrolled and scaled page is pictured at its own logical size", async ({ page }) => {
  await opened(page);
  const plain = await page.evaluate(() => window.inspector.screenshot().then(({ png }) => Array.from(png)));
  await page.evaluate(() => {
    document.body.style.paddingTop = "2000px";
    document.getElementById("scene").style.transform = "translate(37px, 11px) scale(0.5) rotate(3deg)";
    scrollTo(0, 1900);
  });
  const moved = await page.evaluate(() => window.inspector.screenshot().then(({ png, ...rest }) => ({ png: Array.from(png), ...rest })));
  expect(moved).toMatchObject({ width: 400, height: 300, scale: 1 });
  expect(moved.png).toEqual(plain);
});

test("a picture is nothing until it is asked for, and nothing runs after it", async ({ page }) => {
  // Each way a page has of running later, counted from before anything.
  await page.addInitScript(() => {
    window.asked = 0;
    for (const name of ["requestAnimationFrame", "setTimeout", "setInterval", "requestIdleCallback"]) {
      const own = window[name];
      if (own) window[name] = (...args) => (window.asked++, own(...args));
    }
    for (const name of ["MutationObserver", "ResizeObserver", "IntersectionObserver"]) {
      const Own = window[name];
      window[name] = class extends Own {
        constructor(...args) {
          super(...args);
          window.asked++;
        }
      };
    }
  });
  await opened(page);
  const loaded = () => page.evaluate(() => performance.getEntriesByType("resource").some(({ name }) => /\/picture\.js/.test(name)));
  expect(await loaded()).toBe(false);
  const before = await page.evaluate(() => ({ asked: window.asked, elements: document.querySelectorAll("*").length }));
  const taken = await page.evaluate(() => window.inspector.screenshot().then(({ width }) => width));
  expect(taken).toBe(400);
  expect(await loaded()).toBe(true);
  await page.waitForTimeout(300);
  // What was asked is gone: no element of the picture's is left, and
  // nothing will run.
  expect(await page.evaluate(() => ({ asked: window.asked, elements: document.querySelectorAll("*").length }))).toEqual(before);
});

test.describe("what a picture cannot show refuses it by name", () => {
  // The browser says so of the read it would not allow.
  test.use({ told: [/blocked by CORS policy|net::ERR_FAILED/] });

  test("an image from an origin that does not let the page read it", async ({ page }) => {
    // Another origin, which says nothing of who may read what it serves.
    const flag = readFileSync(new URL("assets/flag.png", import.meta.url));
    const elsewhere = createServer((request, response) => response.writeHead(200, { "content-type": "image/png" }).end(flag));
    await new Promise((listening) => elsewhere.listen(0, "127.0.0.1", listening));
    const url = `http://127.0.0.1:${elsewhere.address().port}/flag.png`;
    try {
      await opened(page);
      await page.evaluate((url) => (window.inspector.find("flag").source = url), url);
      await page.waitForFunction(() => window.inspector.find("flag").status === 1);
      expect(await page.evaluate(() => window.inspector.screenshot())).toEqual({
        error: "not_supported",
        message: `\`Image#flag\` shows ${url}, which is from another origin that does not let this page read it; a picture of the page cannot show it`,
      });
      // Not shown, it refuses nothing.
      await page.evaluate(() => (window.inspector.find("flag").visible = false));
      expect(await page.evaluate(() => window.inspector.screenshot().then(({ width }) => width))).toBe(400);
    } finally {
      elsewhere.close();
    }
  });

  test("a WebGL canvas that does not keep what it drew", async ({ page }) => {
    await opened(page);
    expect(
      await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 20;
        const gl = canvas.getContext("webgl");
        gl.clearColor(1, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        window.inspector.find("green").$node.append(canvas);
        return window.inspector.screenshot();
      }),
    ).toEqual({
      error: "not_supported",
      message: "`Rectangle#green` is a WebGL canvas that does not keep its drawing (preserveDrawingBuffer), which a picture of the page cannot show",
    });
  });

  test("text in a font a script made from bytes", async ({ page }) => {
    await opened(page);
    expect(
      await page.evaluate(async () => {
        const bytes = await (await fetch("/assets/boxes-bold.ttf")).arrayBuffer();
        const face = new FontFace("Made", bytes);
        document.fonts.add(face);
        await face.load();
        window.inspector.find("label").font.family = "Made";
        window.flush();
        return window.inspector.screenshot();
      }),
    ).toEqual({
      error: "not_supported",
      message: 'the font "Made" was made by a script from bytes the page does not keep; a picture of the page cannot show its text',
    });
  });
});

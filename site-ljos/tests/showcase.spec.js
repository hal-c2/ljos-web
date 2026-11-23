// The showcase (features/showcase.feature): each app built with Ljós
// as data (bundle/Showcase/products.json), shown before any script
// runs as its poster, captures and links; with script its recording
// plays where the reader allows motion, waits for Play where they ask
// for less, and runs only while it is seen.
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(here, "dist");
const products = JSON.parse(readFileSync(join(here, "bundle/Showcase/products.json"), "utf8"));
const base = (process.env.LJOS_SITE_BASE ?? "/").replace(/\/?$/, "/");
const route = `${base}showcase/`;
const hydrated = '#app[data-ljos-hydrated="true"]';

test("each app's recording, poster and captures are built, the recordings small enough to load", () => {
  expect(products.length).toBeGreaterThan(0);
  for (const product of products) {
    const media = join(dist, "showcase/media");
    for (const ext of [".webm", ".mp4"]) {
      const file = join(media, `${product.recording.name}${ext}`);
      expect(existsSync(file), file).toBe(true);
      expect(statSync(file).size, file).toBeLessThan(4 * 1024 * 1024);
    }
    for (const name of [`${product.recording.name}-poster`, ...product.captures.map((capture) => capture.name)])
      for (const ext of [".avif", ".webp", ".png"]) expect(existsSync(join(media, `${name}${ext}`)), `${name}${ext}`).toBe(true);
    expect(product.captures.length).toBeGreaterThanOrEqual(3);
    expect(product.captures.length).toBeLessThanOrEqual(4);
  }
});

test("search finds the showcase by its name, as it finds the demos", async ({ browser }) => {
  const listed = JSON.parse(readFileSync(join(dist, "search.json"), "utf8"));
  expect(listed.filter((one) => one.route === "/showcase/")).toEqual([{ route: "/showcase/", title: "Built with Ljós", headings: [] }]);
  const context = await browser.newContext({ reducedMotion: "no-preference", viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(`${base}start/`);
    await page.waitForSelector(hydrated);
    const field = page.getByRole("textbox", { name: "Search", exact: true }).filter({ visible: true }).first();
    await field.click();
    await page.keyboard.type("Built with");
    await expect(page.getByRole("list", { name: "Search results" }).getByText("Built with Ljós", { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("on a phone, a page chosen from the menu shuts it", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.goto(base);
    await page.waitForSelector(hydrated);
    for (const [label, to] of [
      ["Showcase", "showcase/"],
      ["Demos", "demos/"],
    ]) {
      await page.getByRole("button", { name: "Menu", exact: true }).click();
      await expect(page.getByRole("button", { name: "Close menu", exact: true })).toBeVisible();
      await page.getByRole("region", { name: "Menu" }).getByRole("link", { name: label, exact: true }).click();
      await page.waitForURL(`**${base}${to}`);
      await expect(page.getByRole("button", { name: "Menu", exact: true }), label).toBeVisible();
    }
  } finally {
    await context.close();
  }
});

test("with no script, each app stands with its heading, poster, captures and links", async ({ browser }) => {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 900 } });
    try {
      const page = await context.newPage();
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1, name: "Built with Ljós" })).toBeVisible();
      for (const product of products) {
        await expect(page.getByRole("heading", { level: 2, name: product.name })).toBeVisible();
        const pictures = await page.evaluate(() =>
          [...document.querySelectorAll("#app picture")].map((picture) => {
            const img = picture.querySelector("img");
            return {
              sources: [...picture.querySelectorAll("source")].map((source) => [source.getAttribute("type"), source.getAttribute("srcset")]),
              src: img.getAttribute("src"),
              // The size the page reserves before the picture loads:
              // the rich text writes it as the image's style.
              width: parseFloat(img.style.width || img.getAttribute("width")),
              height: parseFloat(img.style.height || img.getAttribute("height")),
              loading: img.getAttribute("loading"),
              alt: img.getAttribute("alt"),
            };
          }),
        );
        const poster = pictures.find((picture) => picture.src.endsWith(`showcase/media/${product.recording.name}-poster.png`));
        expect(poster, JSON.stringify(pictures)).toBeTruthy();
        expect(poster.sources).toEqual([
          ["image/avif", poster.src.replace(/\.png$/, ".avif")],
          ["image/webp", poster.src.replace(/\.png$/, ".webp")],
        ]);
        expect(poster.loading).toBe("eager");
        expect(Math.abs(poster.width / poster.height - product.recording.width / product.recording.height)).toBeLessThan(0.01);
        for (const capture of product.captures) {
          const shown = pictures.find((picture) => picture.src.endsWith(`showcase/media/${capture.name}.png`));
          expect(shown, capture.name).toBeTruthy();
          expect(shown.loading).toBe("lazy");
          expect(shown.alt).toBe(capture.alt);
          expect(shown.width).toBeGreaterThan(0);
          expect(Math.abs(shown.width / shown.height - capture.width / capture.height)).toBeLessThan(0.01);
          // The build writes the phone's layout and the wide one, and
          // shows the one that fits.
          await expect(page.getByText(capture.shows, { exact: true }).filter({ visible: true })).toHaveCount(1);
          await expect(page.getByText(capture.about, { exact: true }).filter({ visible: true })).toHaveCount(1);
        }
        for (const link of [product.source, product.repo]) await expect(page.getByRole("link", { name: link.label })).toHaveAttribute("href", link.href);
      }
      // Each picture is drawn, at the size the page gives it.
      const broken = await page.evaluate(() => [...document.querySelectorAll("#app picture img")].filter((img) => img.loading === "eager" && !(img.complete && img.naturalWidth > 0)).map((img) => img.src));
      expect(broken).toEqual([]);
    } finally {
      await context.close();
    }
  }
});

// The first app's recording, in the page as the reader has it.
const recording = (page) => page.locator("#app video").first();
const playing = (page) => recording(page).evaluate((video) => !video.paused && video.currentTime > 0);

test("where motion is allowed, the recording plays muted and looping, and Pause pauses it", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  try {
    const page = await context.newPage();
    await page.goto(route);
    await page.waitForSelector(hydrated);
    await expect.poll(() => playing(page), { timeout: 10_000 }).toBe(true);
    expect(await recording(page).evaluate((video) => [video.muted, video.loop, video.currentSrc.endsWith(".webm")])).toEqual([true, true, true]);
    // Faded in over the poster, not cut to.
    await expect.poll(() => recording(page).evaluate((video) => Number(getComputedStyle(video.closest("[data-ljos-item]") ?? video).opacity))).toBe(1);
    await page.getByRole("button", { name: /^Pause the recording of / }).first().click();
    await expect.poll(() => recording(page).evaluate((video) => video.paused)).toBe(true);
    await expect(page.getByRole("button", { name: /^Play the recording of / }).first()).toBeVisible();
  } finally {
    await context.close();
  }
});

test("under reduced motion the poster stays until the reader presses Play", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  try {
    const page = await context.newPage();
    await page.goto(route);
    await page.waitForSelector(hydrated);
    await page.waitForTimeout(1500);
    const still = await page.evaluate(() => [...document.querySelectorAll("#app video")].every((video) => video.paused));
    expect(still).toBe(true);
    await page.getByRole("button", { name: /^Play the recording of / }).first().click();
    await expect.poll(() => playing(page), { timeout: 10_000 }).toBe(true);
    await expect(page.getByRole("button", { name: /^Pause the recording of / }).first()).toBeVisible();
  } finally {
    await context.close();
  }
});

test("a recording pauses out of view and plays again once back", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 700 }, reducedMotion: "no-preference" });
  try {
    const page = await context.newPage();
    await page.goto(route);
    await page.waitForSelector(hydrated);
    await expect.poll(() => playing(page), { timeout: 10_000 }).toBe(true);
    await page.mouse.move(720, 400);
    for (let i = 0; i < 12; ++i) await page.mouse.wheel(0, 400);
    await expect.poll(() => recording(page).evaluate((video) => video.paused)).toBe(true);
    for (let i = 0; i < 12; ++i) await page.mouse.wheel(0, -400);
    await expect.poll(() => playing(page)).toBe(true);
  } finally {
    await context.close();
  }
});

// The first app's recording as it is asked for, in either format.
function fetches(page) {
  const asked = new Set();
  const name = `/showcase/media/${products[0].recording.name}`;
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.endsWith(`${name}.webm`) || path.endsWith(`${name}.mp4`)) asked.add(path);
  });
  return asked;
}

const poster = (page) => page.locator(`#app img[src$="/${products[0].recording.name}-poster.png"]`).first();

// The tab as the browser says it: hidden or shown.
const tab = (page, state) =>
  page.evaluate((state) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => state === "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);

test("a recording below the window isn't fetched until it is scrolled to", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 240 }, reducedMotion: "no-preference" });
  try {
    const page = await context.newPage();
    const asked = fetches(page);
    await page.goto(route);
    await page.waitForSelector(hydrated);
    const top = (await poster(page).boundingBox()).y;
    expect(top, "the frame starts below the window").toBeGreaterThan(240);
    await page.waitForTimeout(1500);
    expect([...asked], "none before it is seen").toEqual([]);
    await page.mouse.move(720, 120);
    await page.mouse.wheel(0, top - 80);
    await expect.poll(() => asked.size, { message: "one once it is seen" }).toBe(1);
    await expect.poll(() => playing(page), { timeout: 10_000 }).toBe(true);
  } finally {
    await context.close();
  }
});

test("a recording in a hidden tab isn't fetched until the tab is shown", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    });
    const asked = fetches(page);
    await page.goto(route);
    await page.waitForSelector(hydrated);
    await expect(poster(page), "the frame is in the window").toBeInViewport();
    await page.waitForTimeout(1500);
    expect([...asked], "none while the tab is hidden").toEqual([]);
    await tab(page, "visible");
    await expect.poll(() => asked.size, { message: "one once the tab is shown" }).toBe(1);
  } finally {
    await context.close();
  }
});

test("a recording pauses in a hidden tab and plays again once it is shown", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  try {
    const page = await context.newPage();
    await page.goto(route);
    await page.waitForSelector(hydrated);
    await expect.poll(() => playing(page), { timeout: 10_000 }).toBe(true);
    await tab(page, "hidden");
    await expect.poll(() => recording(page).evaluate((video) => video.paused)).toBe(true);
    await tab(page, "visible");
    await expect.poll(() => playing(page)).toBe(true);
  } finally {
    await context.close();
  }
});

test("a browser that plays no WebM is given the MP4", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      const can = HTMLMediaElement.prototype.canPlayType;
      HTMLMediaElement.prototype.canPlayType = function (type) {
        return type.startsWith("video/webm") ? "" : can.call(this, type);
      };
    });
    await page.goto(route);
    await page.waitForSelector(hydrated);
    await expect.poll(() => recording(page).evaluate((video) => video.currentSrc)).toMatch(/\.mp4$/);
  } finally {
    await context.close();
  }
});

for (const width of [390, 1440]) {
  for (const colorScheme of ["light", "dark"]) {
    test(`at ${width} in ${colorScheme}, the showcase fits, its captures ${width < 800 ? "one under another" : "side by side"}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme, reducedMotion: "reduce" });
      try {
        const page = await context.newPage();
        await page.goto(route);
        await page.waitForSelector(hydrated);
        // Every picture, heading, link and control of the page stands
        // inside the window: nothing to scroll sideways to.
        const overflow = await page.evaluate(() =>
          [...document.querySelectorAll('#app picture img, #app video, #app [role="heading"], #app a, #app [role="button"]')]
            .filter((node) => node.checkVisibility() && (node.getBoundingClientRect().right > innerWidth + 1 || node.getBoundingClientRect().left < -1))
            .map((node) => `${node.tagName} ${(node.getAttribute("aria-label") ?? node.textContent).slice(0, 40)} ${Math.round(node.getBoundingClientRect().right)}`),
        );
        expect(overflow).toEqual([]);
        const boxes = await page.evaluate(
          (names) => names.map((name) => [...document.querySelectorAll("#app picture img")].find((img) => img.getAttribute("src").endsWith(`/${name}.png`)).getBoundingClientRect().toJSON()),
          products[0].captures.map((capture) => capture.name),
        );
        for (let i = 1; i < boxes.length; ++i) {
          if (width < 800) expect(boxes[i].top).toBeGreaterThan(boxes[i - 1].bottom);
          else expect(Math.abs(boxes[i].top - boxes[0].top)).toBeLessThan(2);
        }
      } finally {
        await context.close();
      }
    });
  }
}

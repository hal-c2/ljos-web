// A page loads without moving (features/page-load.feature): at a size
// the build prerendered, the page as written, before any script, puts
// each line of text where the page puts it once it is live. The
// prerender measured its text in the fonts the page shows and the page
// waits for them before it takes over, so a line laid out again, a
// column centred differently or a font swapped would move it here.
import { HYDRATED, expect, test, url } from "./fixtures.js";

const PAGES = ["/", "/start/", "/showcase/", "/demos/"];
// The build's sizes (scripts/build.mjs): a phone and a desktop.
const SIZES = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
];
// Rounding, and a hairline a browser may draw a line's box at.
const NEAR = 2;

// Each line of text on the page, by its words, where it stands, and
// whether it is in the window: a text written twice stands nowhere
// (null), as it cannot be told which is which. Text in a live example or
// a 3D scene moves as the example runs.
function texts() {
  const found = new Map();
  for (const element of document.querySelectorAll("#app .qq-text")) {
    if (element.closest("[inert], canvas, [data-demo-live]") || !element.checkVisibility()) continue;
    const words = element.textContent.trim();
    const box = element.getBoundingClientRect();
    if (!words || box.width < 4) continue;
    const seen = box.bottom >= 0 && box.top <= innerHeight;
    found.set(words, found.has(words) ? null : [[box.x, box.y, box.width, box.height], seen]);
  }
  return [...found];
}

for (const size of SIZES) {
  for (const route of PAGES) {
    // With and without WebAssembly: the page as written is the same, the
    // page that takes it over is each kernel's.
    test(`${route} at ${size.width} wide keeps each line where the page as written put it`, async ({ browser, page }) => {
      const still = await browser.newContext({ viewport: size, javaScriptEnabled: false });
      const written = await still.newPage();
      await written.goto(url(route));
      await written.evaluate(() => document.fonts.ready);
      const before = new Map((await written.evaluate(texts)).filter(([, at]) => at?.[1]).map(([words, [box]]) => [words, box]));
      await still.close();

      await page.setViewportSize(size);
      await page.goto(url(route));
      await page.waitForSelector(HYDRATED, { timeout: 40_000 });
      // The page as written stays over the live one until it is live.
      await expect(page.locator("#app [inert]")).toHaveCount(0);
      const after = new Map((await page.evaluate(texts)).map(([words, at]) => [words, at?.[0] ?? null]));

      expect(before.size, "lines of text in the window").toBeGreaterThan(3);
      // Every line that was in the window is on the live page: one moved
      // out of the window, or laid out differently, is still found here.
      // One the live page shows twice (a replay's stages, crossing over)
      // is there, but cannot be said to stand anywhere.
      expect([...before.keys()].filter((words) => !after.has(words)), "lines in the window that the live page lost").toEqual([]);
      const moved = [...before]
        .filter(([words]) => after.get(words))
        .map(([words, box]) => [words.slice(0, 40), after.get(words).map((value, index) => Math.round(value - box[index]))])
        .filter(([, by]) => by.some((value) => Math.abs(value) > NEAR));
      expect(moved, "lines that moved (x, y, width, height) as the page went live").toEqual([]);
    });
  }
}

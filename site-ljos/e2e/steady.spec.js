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

// Each line of text in the window, by its words, where it stands: a
// text written twice is left out, as it cannot be told which is which.
// Text in a live example or a 3D scene moves as the example runs.
function texts() {
  const found = new Map();
  for (const element of document.querySelectorAll("#app .qq-text")) {
    if (element.closest("[inert], canvas, [data-demo-live]") || !element.checkVisibility()) continue;
    const words = element.textContent.trim();
    const box = element.getBoundingClientRect();
    if (!words || box.width < 4 || box.bottom < 0 || box.top > innerHeight) continue;
    found.set(words, found.has(words) ? null : [box.x, box.y, box.width, box.height]);
  }
  return [...found].filter(([, box]) => box);
}

for (const size of SIZES) {
  for (const route of PAGES) {
    test(`${route} at ${size.width} wide keeps each line where the page as written put it`, async ({ browser, page, wasm }) => {
      test.skip(!wasm, "the page as written is the same with or without WebAssembly");
      const still = await browser.newContext({ viewport: size, javaScriptEnabled: false });
      const written = await still.newPage();
      await written.goto(url(route));
      await written.evaluate(() => document.fonts.ready);
      const before = new Map(await written.evaluate(texts));
      await still.close();

      await page.setViewportSize(size);
      await page.goto(url(route));
      await page.waitForSelector(HYDRATED, { timeout: 40_000 });
      // The page as written stays over the live one until it is live.
      await expect(page.locator("#app [inert]")).toHaveCount(0);
      const after = await page.evaluate(texts);

      const both = after.filter(([words]) => before.has(words));
      expect(both.length, "lines of text in both pages").toBeGreaterThan(3);
      const moved = both
        .map(([words, box]) => [words.slice(0, 40), box.map((value, index) => Math.round(value - before.get(words)[index]))])
        .filter(([, by]) => by.some((value) => Math.abs(value) > NEAR));
      expect(moved, "lines that moved (x, y, width, height) as the page went live").toEqual([]);
    });
  }
}

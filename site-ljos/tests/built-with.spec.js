// What is built with Ljós (features/built-with.feature): Ljós Studio,
// Eldur, Ljós Hof and HAL-C2 on the front page, a capture of each and its
// repository (Site/BuiltWith.qml); Studio, Eldur and HAL-C2 on the
// showcase, after the apps it records; all four in every page's footer.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(here, "dist");
const base = (process.env.LJOS_SITE_BASE ?? "/").replace(/\/?$/, "/");
const hydrated = '#app[data-ljos-hydrated="true"]';

const built = [
  { name: "Ljós Studio", href: "https://github.com/hal-c2/ljos-studio", picture: "built-studio", dark: true },
  { name: "Eldur", href: "https://github.com/hal-c2/eldur", picture: "built-eldur", dark: false },
  { name: "Ljós Hof", href: "https://github.com/hal-c2/ljos-hof", picture: "built-hof", dark: true },
  { name: "HAL-C2", href: "https://github.com/hal-c2/hal-c2", picture: "built-halc2", dark: true },
];
// Those the showcase records, which its tools section leaves out.
const recorded = ["Ljós Hof"];

// Each picture of the page as written: its sources, address and size.
const picturesIn = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("#app picture")].map((picture) => {
      const img = picture.querySelector("img");
      const box = img.getBoundingClientRect();
      return {
        sources: [...picture.querySelectorAll("source")].map((source) => [source.getAttribute("type"), source.getAttribute("srcset")]),
        src: img.getAttribute("src"),
        loading: img.getAttribute("loading"),
        alt: img.getAttribute("alt"),
        width: parseFloat(img.style.width || img.getAttribute("width")),
        height: parseFloat(img.style.height || img.getAttribute("height")),
        shown: img.checkVisibility(),
        box: { top: box.top, bottom: box.bottom, left: box.left, right: box.right },
      };
    }),
  );
// The page writes its addresses relative to itself (pictures/…, ../pictures/…).
const pictureOf = (pictures, name) => pictures.find((picture) => picture.src.replace(/^.*?pictures\//, "pictures/") === `pictures/${name}.png`);

test("the build wrote each capture, as WebP and PNG", () => {
  for (const { picture, dark } of built)
    for (const name of dark ? [picture, `${picture}-dark`] : [picture])
      for (const ext of [".webp", ".png"]) expect(existsSync(join(dist, "pictures", `${name}${ext}`)), `${name}${ext}`).toBe(true);
});

// A literal, as a regular expression matches it.
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The markup of each footer landmark (a page is written once per width),
// from its <div role="contentinfo"> to the </div> that closes it.
function footersIn(html) {
  const footers = [];
  for (let at = html.indexOf('role="contentinfo"'); at >= 0; at = html.indexOf('role="contentinfo"', at + 1)) {
    const start = html.lastIndexOf("<div", at);
    const tags = /<div\b|<\/div>/g;
    tags.lastIndex = start;
    let depth = 0;
    for (let tag; (tag = tags.exec(html)); ) {
      depth += tag[0] === "</div>" ? -1 : 1;
      if (depth === 0) {
        footers.push(html.slice(start, tags.lastIndex));
        break;
      }
    }
  }
  return footers;
}

test("every page's footer links to what is built with Ljós", () => {
  const pagesUnder = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? pagesUnder(join(dir, entry.name)) : entry.name === "index.html" ? [join(dir, entry.name)] : [],
    );
  const pages = pagesUnder(dist);
  expect(pages.length).toBeGreaterThan(50);
  const missing = [];
  for (const file of pages) {
    // Each footer only, so the front page's cards, which link the same
    // repositories, can't stand in for one.
    const footers = footersIn(readFileSync(file, "utf8"));
    if (footers.length === 0) missing.push(`${file}: no footer`);
    for (const footer of footers)
      for (const { name, href } of built) if (!new RegExp(`<a\\b[^>]*href="${escape(href)}"[^>]*>(?:<[^>]*>)*\\s*${escape(name)}\\s*<`).test(footer)) missing.push(`${file}: ${name}`);
  }
  expect(missing).toEqual([]);
});

test("with no script, the front page shows what is built with Ljós, each at its repository", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(base);
    await expect(page.getByRole("heading", { level: 2, name: "Built with Ljós" })).toBeVisible();
    const section = page.locator("#app");
    for (const { name, href } of built) await expect(section.getByRole("link", { name, exact: true }).first()).toHaveAttribute("href", href);
    await expect(section.getByRole("link", { name: "showcase", exact: true }).first()).toHaveAttribute("href", `${base}showcase/`);
    const pictures = await picturesIn(page);
    for (const { picture } of built) {
      const shown = pictureOf(pictures, picture);
      expect(shown, picture).toBeTruthy();
      expect(shown.sources).toEqual([["image/webp", shown.src.replace(/\.png$/, ".webp")]]);
      expect(shown.loading).toBe("lazy");
      expect(shown.alt.length).toBeGreaterThan(20);
      expect(Math.abs(shown.width / shown.height - 16 / 10)).toBeLessThan(0.02);
    }
  } finally {
    await context.close();
  }
});

for (const colorScheme of ["light", "dark"]) {
  test(`in ${colorScheme}, each card shows its ${colorScheme} capture`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme, reducedMotion: "reduce" });
    try {
      const page = await context.newPage();
      await page.goto(base);
      await page.waitForSelector(hydrated);
      await page.getByRole("heading", { level: 2, name: "Built with Ljós" }).scrollIntoViewIfNeeded();
      const pictures = await picturesIn(page);
      for (const { picture, dark } of built) {
        const wanted = dark && colorScheme === "dark" ? `${picture}-dark` : picture;
        expect(pictureOf(pictures, wanted)?.shown, wanted).toBe(true);
        if (dark) expect(pictureOf(pictures, colorScheme === "dark" ? picture : `${picture}-dark`)?.shown, picture).toBe(false);
      }
    } finally {
      await context.close();
    }
  });
}

test("with no script, the showcase names the tools built with Ljós after its apps", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(`${base}showcase/`);
    await expect(page.getByRole("heading", { level: 2, name: "Tools built with Ljós" })).toBeVisible();
    const app = page.locator("#app");
    for (const { name, href } of built.filter(({ name }) => !recorded.includes(name))) await expect(app.getByRole("link", { name, exact: true }).first()).toHaveAttribute("href", href);
    const pictures = await picturesIn(page);
    for (const picture of ["built-studio", "built-eldur", "built-halc2"]) expect(pictureOf(pictures, picture), picture).toBeTruthy();
  } finally {
    await context.close();
  }
});

for (const width of [390, 1440]) {
  for (const colorScheme of ["light", "dark"]) {
    test(`at ${width} in ${colorScheme}, the cards fit, ${width < 800 ? "one under another" : "two side by side"}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme, reducedMotion: "reduce" });
      try {
        const page = await context.newPage();
        await page.goto(base);
        await page.waitForSelector(hydrated);
        const pictures = await picturesIn(page);
        const boxes = built.map(({ picture, dark }) => pictureOf(pictures, dark && colorScheme === "dark" ? `${picture}-dark` : picture).box);
        for (const box of boxes) {
          expect(box.left).toBeGreaterThanOrEqual(-1);
          expect(box.right).toBeLessThanOrEqual(width + 1);
        }
        for (let i = 1; i < boxes.length; ++i) {
          if (width < 800) expect(boxes[i].top).toBeGreaterThan(boxes[i - 1].bottom);
          // Four cards stand as two rows of two, each row level.
          else if (i % 2 === 1) expect(Math.abs(boxes[i].top - boxes[i - 1].top)).toBeLessThan(2);
          else expect(boxes[i].top).toBeGreaterThan(boxes[i - 2].bottom);
        }
      } finally {
        await context.close();
      }
    });
  }
}

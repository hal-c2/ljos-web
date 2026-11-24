// The Ljós mark is the user's: interlocking violet and amber panels
// with a yellow overlap (ljos-ui PR #274, f57084e3, "User decision
// superseding the dark variants"). The logo is the mark with the script
// word beside it, the file the READMEs show (ljos-ui docs/brand/ljos.svg,
// this repository's site/src/assets/ljos.svg). The Astro site keeps the
// party copies in site/src/assets; this site serves the mark's bytes as
// its favicon, the logo's in its header and footer, and the touch and
// social pictures drawn from the mark. Any other mark is a design change that needs the user's word,
// so these tests fail on one.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const party = resolve(here, "../site");
const dist = join(here, "dist");
const base = process.env.LJOS_SITE_BASE ?? "/";
const digest = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

const VIOLET = "#8260da";
const AMBER = "#f49a06";
const YELLOW = "#ffe000";

test("the mark is the user's three panels, byte for byte the party copy", () => {
  const mark = readFileSync(join(here, "bundle/assets/ljos-mark.svg"), "utf8");
  expect(mark).toBe(readFileSync(join(party, "src/assets/ljos-mark.svg"), "utf8"));
  expect([...mark.matchAll(/fill="(#[0-9a-f]{6})"/g)].map(([, fill]) => fill)).toEqual([VIOLET, AMBER, YELLOW]);
});

test("the logo is the README's, byte for byte, with the script word", () => {
  const logo = readFileSync(join(here, "bundle/assets/ljos.svg"), "utf8");
  expect(logo).toBe(readFileSync(join(party, "src/assets/ljos.svg"), "utf8"));
  expect(logo).toContain("Birthstone script wordmark");
  expect(new Set([...logo.matchAll(/fill="(#[0-9a-f]{6})"/g)].map(([, fill]) => fill))).toEqual(new Set([VIOLET, AMBER, YELLOW]));
  expect(digest(join(dist, "ljos.svg"))).toBe(digest(join(party, "src/assets/ljos.svg")));
});

// The header's link home is the logo file itself, served as SVG and
// drawn at its own shape, never a word set in the page's type beside it.
test("the header serves the brand SVG", async ({ page }) => {
  await page.goto(base);
  const home = page.getByRole("link", { name: "Ljós, home", exact: true }).filter({ visible: true }).first();
  const logo = home.locator("img");
  await expect(logo).toHaveCount(1);
  // The page names it from where it stands; it resolves to the site's one copy.
  expect(await logo.evaluate((img) => new URL(img.src).pathname)).toBe(`${base}ljos.svg`);
  const drawn = await logo.evaluate(async (img) => {
    await img.decode();
    const box = img.getBoundingClientRect();
    return { natural: img.naturalWidth > 0, ratio: box.width / box.height };
  });
  expect(drawn.natural, "the logo loaded").toBe(true);
  expect(Math.abs(drawn.ratio - 497.88 / 222.4), `its shape, ${drawn.ratio}`).toBeLessThan(0.05);
  expect(await home.innerText(), "no word set beside the logo").toBe("");
  const served = await page.request.get(`${base}ljos.svg`);
  expect(served.headers()["content-type"]).toContain("image/svg+xml");
});

test("the built favicon, touch icon and social picture are the mark's", () => {
  expect(digest(join(dist, "favicon.svg"))).toBe(digest(join(party, "src/assets/ljos-mark.svg")));
  for (const name of ["apple-touch-icon.png", "og-image.png"]) {
    expect(digest(join(dist, name)), name).toBe(digest(join(party, "public", name)));
  }
});

// At a tab's 16 px the panels still read: violet at the top left,
// amber at the bottom right, yellow where they overlap.
test("the favicon reads at 16 px", async ({ page }) => {
  await page.goto(`${base}favicon.svg`);
  const colours = await page.evaluate(async () => {
    const img = new Image();
    img.src = location.href;
    await img.decode();
    // The document is the SVG itself, so no HTML canvas element.
    const context = new OffscreenCanvas(16, 16).getContext("2d");
    context.drawImage(img, 0, 0, 16, 16);
    const at = (x, y) => [...context.getImageData(x, y, 1, 1).data.slice(0, 3)];
    return { violet: at(3, 4), amber: at(12, 12), yellow: at(7, 7) };
  });
  const near = (rgb, hex) => {
    const want = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
    return rgb.every((channel, i) => Math.abs(channel - want[i]) <= 24);
  };
  expect(near(colours.violet, VIOLET), `violet ${colours.violet}`).toBe(true);
  expect(near(colours.amber, AMBER), `amber ${colours.amber}`).toBe(true);
  expect(near(colours.yellow, YELLOW), `yellow ${colours.yellow}`).toBe(true);
});

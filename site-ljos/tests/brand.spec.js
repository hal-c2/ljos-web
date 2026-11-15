// The Ljós mark is the user's: interlocking violet and amber panels
// with a yellow overlap (ljos-ui PR #274, f57084e3, "User decision
// superseding the dark variants"). The Astro site keeps the party copy
// in site/src/assets; this site serves the same bytes as its favicon,
// header and footer mark, and the touch and social pictures drawn from
// it. Any other mark is a design change that needs the user's word,
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

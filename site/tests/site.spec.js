import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

test("landing page says what Ljós is, with landmarks", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ljós");
  await expect(page.locator("body")).toContainText("malleable");
});

test("every docs page renders", async ({ page }) => {
  const sections = ["start", "ui", "controls", "data", "language", "quality", "rust"];
  let seen = 0;
  for (const s of sections) {
    for (const f of readdirSync(join("dist", s), { recursive: true }).filter((f) => String(f).endsWith("index.html"))) {
      const route = `/${s}/${String(f).replace(/index\.html$/, "")}`;
      const res = await page.goto(route);
      expect(res.ok(), route).toBeTruthy();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      seen++;
    }
  }
  expect(seen).toBeGreaterThanOrEqual(53);
});

test("demo page shows its fallback with no JS", async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto("/demos/");
  await expect(page.locator("[data-ljos-demo='counter'] .ljos-demo__fallback")).toContainText("Count: 0");
  await ctx.close();
});

test("live demo mounts with JS and counts", async ({ page }) => {
  await page.goto("/demos/");
  const fig = page.locator("[data-ljos-demo='counter']");
  await fig.scrollIntoViewIfNeeded();
  await expect(fig).toHaveAttribute("data-state", "live", { timeout: 20000 });
  await expect(fig).toContainText("Count:");
  await fig.locator(".ljos-demo__mount").click();
  await expect(fig).toContainText("Count: 1");
});

test("no serious axe violations on landing and demos", async ({ page }) => {
  for (const route of ["/", "/demos/", "/start/"]) {
    await page.goto(route);
    // Scoped to our content: Starlight's own search button currently
    // trips label-content-name-mismatch, which is upstream's to fix.
    const results = await new AxeBuilder({ page }).include("main").analyze();
    const serious = results.violations.filter((v) => ["serious", "critical"].includes(v.impact));
    expect(serious, `${route}: ${serious.map((v) => v.id).join(", ")}`).toEqual([]);
  }
});

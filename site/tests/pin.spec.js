// The pages the ljos-ui pin brings (site/ljos-ui.sha at c2443e15)
// stand in the sidebar and answer a search, as every page does. The
// readers walk the docs' sections, so a new page is found without
// being named; this holds that it is, page by page.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const PINNED_PAGES = [
  "/start/your-own-shell/",
  "/start/editors/",
  "/data/fetching/",
  "/data/tasks/",
  "/language/values-and-the-app/",
  "/language/controllers/",
  "/language/match/",
  "/language/pipe/",
];

// The title as the synced copy of the page says it, so a reworded
// title upstream is not a failure here.
function titleOf(route) {
  const text = readFileSync(`src/content/docs${route.slice(0, -1)}.md`, "utf8");
  return /^title:\s*(.+)$/m.exec(text)[1].trim();
}

for (const route of PINNED_PAGES) {
  test(`${route} is in the sidebar and answers a search for its title`, async ({ page }) => {
    await page.goto("/start/");
    await expect(page.locator(`nav[aria-label="Main"] a[href="${route}"]`)).toHaveCount(1);
    await page.getByRole("button", { name: "Search" }).first().click();
    await page.getByRole("dialog", { name: "Search" }).getByRole("textbox", { name: "Search" }).fill(titleOf(route));
    await expect(page.locator(`.pagefind-ui__result-link[href="${route}"]`).first()).toBeVisible({ timeout: 15_000 });
  });
}

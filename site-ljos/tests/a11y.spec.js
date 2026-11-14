// What a reader with a screen reader, a keyboard or a crawler is given,
// held by axe-core, the checker Lighthouse's accessibility score is
// made of: the landing, a docs page and the demos page, before any
// script runs and once they have come to life, at a phone's width and a
// desktop's, light and dark; and the two parts of the header that only
// stand once a reader opens them, the phone's menu and search results.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// WCAG 2.2 A and AA, and axe's best practices, which Lighthouse also
// scores (a heading's order, a landmark for every part of the page).
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
// A scroller with nothing to focus inside, as a demo's list is, takes
// the keyboard itself in the browsers the site is for (Chromium since
// 130, Firefox long before); axe still asks the page to say so.
const DISABLED = ["scrollable-region-focusable"];

// What axe found, said so that a failure names the rule, the element and
// why, not a count.
async function violations(page, include) {
  let builder = new AxeBuilder({ page }).withTags(TAGS).disableRules(DISABLED);
  if (include) builder = builder.include(include);
  const { violations } = await builder.analyze();
  return violations.flatMap(({ id, impact, help, nodes }) =>
    nodes.map((node) => `${id} (${impact}): ${help} — ${node.target.join(" ")} — ${node.failureSummary?.split("\n").slice(1).join(" ").trim()}`),
  );
}

// The page as written, with no script of its own to run. axe runs as a
// script, which a context with scripts off never lets finish; so the
// page is served with what it would run taken out, and stands as it does
// for a reader whose browser runs none.
const RUNS = /<script\b(?![^>]*type="application\/json")[^>]*>[\s\S]*?<\/script>/g;
async function unscripted(page) {
  await page.route(
    (url) => url.pathname.endsWith("/"),
    async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replace(RUNS, "") });
    },
  );
}

const ROUTES = ["/", "/start/", "/demos/"];
const SIZES = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
];

for (const route of ROUTES) {
  for (const viewport of SIZES) {
    for (const colorScheme of ["light", "dark"]) {
      test(`${route} at ${viewport.width} in ${colorScheme} gives a reader all axe asks, with script and without`, async ({ browser }) => {
        for (const scripted of [false, true]) {
          const context = await browser.newContext({ viewport, colorScheme, reducedMotion: "reduce" });
          try {
            const page = await context.newPage();
            if (!scripted) await unscripted(page);
            await page.goto(route);
            if (scripted) await page.waitForSelector('#app[data-ljos-hydrated="true"]');
            else expect(await page.locator("script:not([type='application/json'])").count(), "no script of its own").toBe(0);
            expect(await violations(page), scripted ? "hydrated" : "with no script").toEqual([]);
          } finally {
            await context.close();
          }
        }
      });
    }
  }
}

test("the phone's menu, open, and the search results it finds give a reader all axe asks", async ({ browser }) => {
  for (const colorScheme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme, reducedMotion: "reduce" });
    try {
      const page = await context.newPage();
      await page.goto("/start/");
      await page.waitForSelector('#app[data-ljos-hydrated="true"]');
      await page.getByRole("button", { name: "Open the menu" }).click();
      await expect(page.getByRole("button", { name: "Close the menu" })).toBeVisible();
      // Read once it has faded in: halfway, its colours are not the page's.
      await expect(page.getByRole("region", { name: "Menu" })).toHaveCSS("opacity", "1");
      expect(await violations(page), `the menu open, ${colorScheme}`).toEqual([]);
      await page.getByRole("textbox", { name: "Search the docs" }).click();
      await page.keyboard.type("mcp servers");
      await expect(page.getByRole("list", { name: "Search results" }).getByText("MCP Servers for Agents", { exact: true })).toBeVisible();
      expect(await violations(page), `search results, ${colorScheme}`).toEqual([]);
      for (const _ of "mcp servers") await page.keyboard.press("Backspace");
      await page.keyboard.type("zzzz");
      await expect(page.getByText("Nothing in the docs matches “zzzz”.")).toBeVisible();
      expect(await violations(page), `no search results, ${colorScheme}`).toEqual([]);
    } finally {
      await context.close();
    }
  }
});

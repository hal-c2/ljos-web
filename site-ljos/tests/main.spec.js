// Every page has one main landmark, the page's own content, so a reader
// jumps past the header and the docs to what the page is for: one in
// every render the build wrote, the same one once the page has come to
// life, and one again on each page shown in place. The header, the docs'
// sidebar, what is on the page and the footer are landmarks of their
// own beside it, never in it.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(here, "dist");
const base = (process.env.LJOS_SITE_BASE ?? "/").replace(/\/?$/, "/");

function pagesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return pagesUnder(join(dir, entry.name));
    return entry.name === "index.html" ? [join(dir, entry.name)] : [];
  });
}
const routeOf = (file) => `${relative(dist, dirname(file)).split("\\").join("/")}/`.replace(/^\/$/, "");

// The scripts a page runs, taken out, so it stands as the build wrote it.
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

const SIZES = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
];

// What a main landmark holds and what stands beside it, said so that a
// failure names which part is wrong.
async function landmarks(page) {
  const main = page.getByRole("main");
  const count = await main.count();
  if (count !== 1) return { mains: count };
  return {
    mains: 1,
    footerInside: await main.getByRole("contentinfo").count(),
    asideInside: await main.getByRole("complementary").count(),
    footerBeside: await page.getByRole("contentinfo").count(),
  };
}
const ONE = { mains: 1, footerInside: 0, asideInside: 0, footerBeside: 1 };

test("every built page has exactly one main landmark, at a phone's width and a desktop's, with no script", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const pages = pagesUnder(dist);
  expect(pages.length).toBeGreaterThan(50);
  const wrong = [];
  for (const viewport of SIZES) {
    const context = await browser.newContext({ viewport, reducedMotion: "no-preference" });
    try {
      const page = await context.newPage();
      await unscripted(page);
      for (const file of pages) {
        const route = routeOf(file);
        await page.goto(`${base}${route}`);
        const found = await landmarks(page);
        if (JSON.stringify(found) !== JSON.stringify(ONE)) wrong.push(`/${route} at ${viewport.width}: ${JSON.stringify(found)}`);
      }
    } finally {
      await context.close();
    }
  }
  expect(wrong).toEqual([]);
});

// The landing, the demos, a docs page and a pro demo's page: each kind
// of page the shell shows.
const KINDS = ["", "demos/", "start/", "demos/cockpit/"];

for (const route of KINDS) {
  for (const viewport of SIZES) {
    test(`/${route} at ${viewport.width} keeps the main landmark it was written with once it has come to life`, async ({ browser }) => {
      const context = await browser.newContext({ viewport, reducedMotion: "no-preference" });
      try {
        const page = await context.newPage();
        let release;
        const held = new Promise((done) => (release = done));
        await page.route("**/*.js", async (request) => {
          await held;
          await request.continue();
        });
        await page.goto(`${base}${route}`, { waitUntil: "commit" });
        await page.waitForFunction(() => document.readyState !== "loading");
        expect(await landmarks(page), "as written").toEqual(ONE);
        await page.evaluate(() => (window.__main = [...document.querySelectorAll("main, [role=main]")].find((element) => element.checkVisibility())));
        release();
        await page.waitForSelector('#app[data-ljos-hydrated="true"]');
        await page.unroute("**/*.js");
        expect(await landmarks(page), "come to life").toEqual(ONE);
        // Taken over, not made again: hydration and the prerender agree
        // on which element it is.
        expect(await page.getByRole("main").evaluate((element) => element === window.__main)).toBe(true);
      } finally {
        await context.close();
      }
    });
  }
}

test("a page shown in place has one main landmark, as one loaded does", async ({ page }) => {
  await page.goto(base);
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  expect(await landmarks(page)).toEqual(ONE);
  // Each named for the page it holds, so the landmarks asked of below are
  // the new page's, not the one it was shown in place of.
  for (const [route, name] of [
    ["start/", "What is Ljós?"],
    ["demos/", "Live demos"],
    ["", "Home"],
  ]) {
    await page.evaluate((to) => document.querySelector(`a[href="${to}"]`).click(), `${base}${route}`);
    // A glob ending in `/` matches every page; the path is asked outright.
    await page.waitForURL((url) => url.pathname === `${base}${route}`);
    await expect(page.getByRole("main", { name, exact: true })).toHaveCount(1);
    expect(await landmarks(page), `/${route} shown in place`).toEqual(ONE);
  }
});

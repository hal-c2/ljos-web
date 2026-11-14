// The site stands at a base: the domain's root (ljos.dev), or a
// project's path below it (the github.io preview's `/ljos-web/`).
// Built for one base, every page says which in its head, asks for
// nothing outside it, and every press goes to a page inside it.
// The build and the server read the same `LJOS_SITE_BASE`; unset,
// the base is the root.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.LJOS_SITE_BASE ?? "/";

function pagesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return pagesUnder(join(dir, entry.name));
    return entry.name.endsWith(".html") ? [join(dir, entry.name)] : [];
  });
}

async function press(page, locator) {
  const box = await locator.boundingBox();
  expect(box, "the words to press are on the page").toBeTruthy();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test(`every page names the base it was built for (${base})`, () => {
  const pages = pagesUnder(join(here, "dist"));
  expect(pages.length).toBeGreaterThan(50);
  const wrong = pages.filter((file) => !readFileSync(file, "utf8").includes(`<meta name="ljos-base" content="${base}">`));
  expect(wrong.map((file) => file.slice(here.length + 1))).toEqual([]);
});

// A link to a page of the site goes inside the base however it is
// followed: by the browser with no script, or in a new tab with one.
test(`every link to a page of the site is written inside ${base}`, () => {
  const outside = pagesUnder(join(here, "dist")).flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/<a [^>]*href="(\/(?!\/)[^"]*)"/g)]
      .map(([, href]) => href)
      .filter((href) => !href.startsWith(base))
      .map((href) => `${file.slice(here.length + 1)}: ${href}`),
  );
  expect(outside.slice(0, 10)).toEqual([]);
});

test(`a link the page writes once it runs is inside ${base} too`, async ({ page }) => {
  await page.goto(`${base}start/`);
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  // A hover underlines a nav link: its page has run.
  const link = page.getByRole("link", { name: "Your first app" }).filter({ visible: true }).first();
  await link.hover();
  await expect.poll(() => link.evaluate((a) => [a, ...a.querySelectorAll("*")].map((node) => getComputedStyle(node).textDecorationLine).join(" "))).toContain("underline");
  const outside = await page.evaluate((base) => [...document.querySelectorAll('#app a[href^="/"]')].map((a) => a.getAttribute("href")).filter((href) => !href.startsWith("//") && !href.startsWith(base)), base);
  expect(outside).toEqual([]);
});

// Pages sends the bare project path on to the base; so does the
// local server, or a reader who types it sees a false "not here".
test(`${base.slice(0, -1) || "/"} is sent on to ${base}`, async ({ request }) => {
  test.skip(base === "/", "the root has no bare form");
  const response = await request.get(base.slice(0, -1), { maxRedirects: 0 });
  expect(response.status()).toBe(301);
  expect(response.headers().location).toBe(base);
});

for (const route of ["", "start/", "demos/"]) {
  test(`${base}${route} asks for nothing outside ${base}, and gets all it asks for`, async ({ page }) => {
    const gaps = [];
    page.on("response", (response) => {
      const url = new URL(response.url());
      // A blob: is the page's own making (a worker, a picture), not
      // something asked of the server.
      if (url.protocol !== "http:" || url.origin !== "http://127.0.0.1:4471") return;
      if (!url.pathname.startsWith(base)) gaps.push(`asked for ${url.pathname}, outside ${base}`);
      else if (response.status() >= 400) gaps.push(`${url.pathname}: ${response.status()}`);
    });
    page.on("requestfailed", (request) => gaps.push(`${request.url()}: ${request.failure()?.errorText}`));
    await page.goto(`${base}${route}`);
    // Of the renders the page holds, the one the reader is shown.
    await expect(page.getByText("Ljós", { exact: true }).filter({ visible: true }).first()).toBeVisible();
    // What the page fetches once it runs (a demo's wasm, a picture,
    // the in-page compiler on a first edit is not asked for here).
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    expect(gaps).toEqual([]);
  });
}

test(`the header's links stay inside ${base}`, async ({ page }) => {
  await page.goto(`${base}start/`);
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  await press(page, page.getByText("Demos", { exact: true }).first());
  await expect(page).toHaveURL(`http://127.0.0.1:4471${base}demos/`);
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  await press(page, page.getByText("Docs", { exact: true }).first());
  await expect(page).toHaveURL(`http://127.0.0.1:4471${base}start/`);
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  await press(page, page.getByText("Ljós", { exact: true }).first());
  await expect(page).toHaveURL(`http://127.0.0.1:4471${base}`);
});

// A link in a docs page's words goes to its page inside the base: the
// build writes the base into the words' addresses, so the link the
// page has, before any script runs, is already the one a press follows.
test(`a link in a page's words stays inside ${base}`, async ({ page }) => {
  await page.goto(`${base}start/`);
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  expect(await page.locator('#app a[data-link^="/"]').evaluateAll((links, base) => links.map((link) => link.getAttribute("href")).filter((href) => !href?.startsWith(base)), base)).toEqual([]);
  // The page scrolls in the shell, not in the browser: a link below
  // what is shown is brought up by the wheel, as a reader would.
  const shown = () =>
    page.locator(`#app a[data-link^="${base}start/"]`).evaluateAll((links) => {
      for (const link of links) {
        const { x, y, width, height } = link.getBoundingClientRect();
        const at = width && height ? document.elementFromPoint(x + width / 2, y + height / 2) : null;
        if (at && link.contains(at)) return { x: x + width / 2, y: y + height / 2, href: link.getAttribute("href"), said: link.dataset.link };
      }
      return null;
    });
  const { width, height } = page.viewportSize();
  await page.mouse.move(width / 2, height / 2);
  let link = await shown();
  for (let turn = 0; !link && turn < 30; turn++) {
    await page.mouse.wheel(0, 300);
    link = await expect.poll(shown, { timeout: 1_000 }).toBeTruthy().then(shown, () => null);
  }
  expect(link, "a link in the page's words comes into view").toBeTruthy();
  expect(link.href).toBe(link.said);
  await page.mouse.click(link.x, link.y);
  await expect(page).toHaveURL(`http://127.0.0.1:4471${link.href}`);
});

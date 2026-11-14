// The site's links are the page's own (features/links.feature): every
// built page, read from disk as a reader with no script gets it, has
// its header's links, its own links all go to pages the build wrote,
// and the front page leads on; with no script a link is followed, with
// script a plain press shows the page in place, and an address the
// site has no page for is answered with the site's own 404 page.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(here, "dist");
const base = process.env.LJOS_SITE_BASE ?? "/";
const origin = "http://127.0.0.1:4471";

function pagesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return pagesUnder(join(dir, entry.name));
    return entry.name === "index.html" ? [join(dir, entry.name)] : [];
  });
}

// The address a built file is served at.
const addressOf = (file) => `${base}${relative(dist, dirname(file)).split("\\").join("/")}/`.replace(/\/+$/, "/");

const unescape = (text) => text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// Every `a` with an address, as the HTML has it: its address and the
// name a reader is told (its label, else its words).
function linksIn(html) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].flatMap(([, attributes, inner]) => {
    const href = /\shref="([^"]*)"/.exec(attributes);
    if (!href) return [];
    const label = /\saria-label="([^"]*)"/.exec(attributes);
    const words = unescape(inner.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
    return [{ href: unescape(href[1]), name: label ? unescape(label[1]) : words }];
  });
}

// The built file an address of the site names, or null when it names
// none (outside the base, or no such page).
function builtFor(address, from) {
  const url = new URL(address, `${origin}${from}`);
  if (url.origin !== origin) return "elsewhere";
  if (!url.pathname.startsWith(base)) return null;
  const path = decodeURIComponent(url.pathname.slice(base.length));
  const file = join(dist, path.endsWith("/") || path === "" ? join(path, "index.html") : path);
  return existsSync(file) ? file : null;
}

const pages = pagesUnder(dist).map((file) => ({ file, at: addressOf(file), links: linksIn(readFileSync(file, "utf8")) }));

test("the build wrote the pages read here", () => {
  expect(pages.length).toBeGreaterThan(50);
  expect(pages.map(({ at }) => at)).toEqual(expect.arrayContaining([base, `${base}start/`, `${base}demos/`]));
});

test(`every page's header links to the front page, the docs and the demos, at ${base}`, () => {
  const missing = [];
  for (const { at, links } of pages) {
    for (const [name, href] of [
      ["Ljós — front page", base],
      ["Docs", `${base}start/`],
      ["Live demos", `${base}demos/`],
    ]) {
      if (!links.some((link) => link.name === name && link.href === href)) missing.push(`${at}: no link "${name}" to ${href}`);
    }
  }
  expect(missing).toEqual([]);
});

test(`every page names its icon at ${base}, and the build wrote it`, () => {
  const unnamed = pages.filter(({ file }) => !readFileSync(file, "utf8").includes(`<link rel="icon" href="${base}favicon.svg"`)).map(({ at }) => at);
  expect(unnamed).toEqual([]);
  expect(existsSync(join(dist, "favicon.svg"))).toBe(true);
});

test("every link of every page goes to a page the build wrote", () => {
  const broken = [];
  let followed = 0;
  for (const { at, links } of pages) {
    for (const { href, name } of links) {
      const built = builtFor(href, at);
      if (built === "elsewhere") continue;
      followed++;
      if (built === null) broken.push(`${at}: "${name}" goes to ${href}, which the build did not write`);
    }
  }
  expect(broken).toEqual([]);
  // The sidebar alone links every docs page from every docs page.
  expect(followed).toBeGreaterThan(pages.length * 20);
});

test("the front page links to the docs, the first app and the demos", () => {
  const front = pages.find(({ at }) => at === base);
  const hrefs = front.links.map(({ href }) => href);
  expect(hrefs).toEqual(expect.arrayContaining([`${base}start/`, `${base}start/first-app/`, `${base}demos/`]));
  // The calls to action are links by their own names.
  expect(front.links).toEqual(expect.arrayContaining([
    { name: "What is Ljós?", href: `${base}start/` },
    { name: "Your first app", href: `${base}start/first-app/` },
  ]));
});

test("a docs page links to the page before it and the page after it", () => {
  const leadsOn = ({ links, at }) => ({
    previous: links.find(({ name }) => name.startsWith("Previous: ")),
    next: links.find(({ name }) => name.startsWith("Next: ")),
    at,
  });
  const first = leadsOn(pages.find(({ at }) => at === `${base}start/`));
  expect(first.previous, "the first page has nothing before it").toBeUndefined();
  expect(first.next).toBeTruthy();
  // The page after the first leads back to it.
  const second = leadsOn(pages.find(({ at }) => at === first.next.href));
  expect(second.previous?.href).toBe(`${base}start/`);
  expect(second.next).toBeTruthy();
  expect(builtFor(second.next.href, second.at)).not.toBeNull();
});

test("with no script, a link is followed, and back is the browser's", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByRole("link", { name: "What is Ljós?" }).first().click();
  await expect(page).toHaveURL(`${origin}${base}start/`);
  await expect(page.getByRole("link", { name: "Docs" })).toHaveAttribute("href", `${base}start/`);
  await page.goBack();
  await expect(page).toHaveURL(`${origin}${base}`);
  await page.getByRole("link", { name: "Live demos" }).first().click();
  await expect(page).toHaveURL(`${origin}${base}demos/`);
  await context.close();
});

// A press as a reader's lands: on the link's middle, through the scene.
async function press(page, locator, options) {
  const box = await locator.boundingBox();
  expect(box, "the link is on the page").toBeTruthy();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, options);
}

test("with script, a plain press shows the page in place, and back shows the one before", async ({ page }) => {
  await page.goto(base);
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  // Gone with the page, if the page is loaded again.
  await page.evaluate(() => (globalThis.stillHere = true));
  await press(page, page.getByRole("link", { name: "Docs", exact: true }));
  await expect(page).toHaveURL(`${origin}${base}start/`);
  await expect(page).toHaveTitle("What is Ljós? — Ljós");
  await expect(page.getByRole("link", { name: /^Next: / })).toBeAttached();
  await press(page, page.getByRole("link", { name: "Your first app" }).first());
  await expect(page).toHaveURL(`${origin}${base}start/first-app/`);
  expect(await page.evaluate(() => globalThis.stillHere)).toBe(true);
  await page.goBack();
  await expect(page).toHaveURL(`${origin}${base}start/`);
  await page.goBack();
  await expect(page).toHaveURL(`${origin}${base}`);
  await expect(page.getByRole("link", { name: "What is Ljós?" }).first()).toBeVisible();
  expect(await page.evaluate(() => globalThis.stillHere)).toBe(true);
});

test("with script, a middle press opens the link in a new tab", async ({ page, context }) => {
  await page.goto(base);
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  const opened = context.waitForEvent("page");
  await press(page, page.getByRole("link", { name: "Docs", exact: true }), { button: "middle" });
  const tab = await opened;
  await tab.waitForLoadState("commit");
  expect(new URL(tab.url()).pathname).toBe(`${base}start/`);
  await expect(page).toHaveURL(`${origin}${base}`);
  await tab.close();
});

test("the site's 404 page has the header, says so, and links home at the base", () => {
  const file = join(dist, "404.html");
  expect(existsSync(file)).toBe(true);
  const html = readFileSync(file, "utf8");
  expect(html).toContain("<style>");
  expect(html).toContain("<header>");
  expect(html).toMatch(/<h1>Page not found<\/h1>/);
  const links = linksIn(html);
  expect(links).toEqual(expect.arrayContaining([
    { name: "Ljós — front page", href: base },
    { name: "Docs", href: `${base}start/` },
    { name: "Go to the front page", href: base },
  ]));
  // Served at any depth, so nothing in it is relative.
  const relativeAddresses = [...html.matchAll(/\s(?:href|src)="([^"]*)"/g)].map(([, address]) => address).filter((address) => !address.startsWith(base) && !/^https:\/\//.test(address));
  expect(relativeAddresses).toEqual([]);
});

test("an address the site has no page for is answered 404 with the site's page", async ({ request, page }) => {
  for (const missing of [`${base}no-such-page/`, `${base}start/no-such-page/deeper/`, `${base}nothing.html`]) {
    const response = await request.get(missing);
    expect(response.status(), missing).toBe(404);
    expect(await response.text()).toContain("Page not found");
  }
  // And it reads as the site, its links going home from any depth.
  await page.goto(`${base}start/no-such-page/deeper/`);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.getByRole("link", { name: "Go to the front page" }).click();
  await expect(page).toHaveURL(`${origin}${base}`);
});

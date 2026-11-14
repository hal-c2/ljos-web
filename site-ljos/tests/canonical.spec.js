// ljos.dev is the site's one home: every build, the github.io preview
// at its project path too, names each page's address there. A page's
// canonical link and its og:url are that one address, the sitemap
// lists every page the build made by it, and robots.txt names the
// sitemap. The origin is `LJOS_SITE_ORIGIN`, as the build read it.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(here, "dist");
const base = process.env.LJOS_SITE_BASE ?? "/";
const origin = process.env.LJOS_SITE_ORIGIN ?? "https://ljos.dev";

// Every page the build made, by the route it is served at: a page is
// a directory's index.html, as Pages serves `/start/` from
// `start/index.html`.
function routesUnder(dir) {
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((path) => path === "index.html" || path.endsWith(`${sep}index.html`))
    .map((path) => {
      const folder = dirname(path);
      return folder === "." ? "/" : `/${folder.split(sep).join("/")}/`;
    })
    .sort();
}

const unescape = (text) => text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

function sitemap() {
  const xml = readFileSync(join(dist, "sitemap.xml"), "utf8");
  expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  return [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map(([, loc]) => unescape(loc));
}

// The one value of a head tag, or every value when it is not one.
function headValues(html, pattern) {
  const head = html.slice(0, html.indexOf("</head>"));
  return [...head.matchAll(pattern)].map(([, value]) => unescape(value));
}

test(`every page names its ${origin} address as canonical and og:url, whatever the base (${base})`, () => {
  const routes = routesUnder(dist);
  expect(routes.length).toBeGreaterThan(50);
  const wrong = [];
  for (const route of routes) {
    const html = readFileSync(join(dist, route.slice(1), "index.html"), "utf8");
    const want = `${origin}${route}`;
    const canonical = headValues(html, /<link rel="canonical" href="([^"]*)"/g);
    const ogUrl = headValues(html, /<meta property="og:url" content="([^"]*)"/g);
    if (canonical.length !== 1 || canonical[0] !== want) wrong.push(`${route}: canonical ${JSON.stringify(canonical)}, not ${want}`);
    if (ogUrl.length !== 1 || ogUrl[0] !== want) wrong.push(`${route}: og:url ${JSON.stringify(ogUrl)}, not ${want}`);
  }
  expect(wrong).toEqual([]);
});

test("the sitemap lists every built page once, at its canonical address, and nothing else", () => {
  const locs = sitemap();
  expect(new Set(locs).size, "no address is listed twice").toBe(locs.length);
  expect(locs.sort()).toEqual(routesUnder(dist).map((route) => `${origin}${route}`).sort());
  for (const route of ["/", "/demos/", "/start/"]) expect(locs).toContain(`${origin}${route}`);
});

test("robots.txt lets every crawler in and names the sitemap", () => {
  const robots = readFileSync(join(dist, "robots.txt"), "utf8").split("\n");
  expect(robots).toContain("User-agent: *");
  expect(robots).toContain("Allow: /");
  expect(robots.some((line) => /^Disallow:\s*\S/.test(line)), "nothing is disallowed").toBe(false);
  expect(robots).toContain(`Sitemap: ${origin}/sitemap.xml`);
});

test(`the sitemap and robots.txt are served below ${base}`, async ({ request }) => {
  const map = await request.get(`${base}sitemap.xml`);
  expect(map.status()).toBe(200);
  expect(map.headers()["content-type"]).toContain("xml");
  const robots = await request.get(`${base}robots.txt`);
  expect(robots.status()).toBe(200);
  expect(robots.headers()["content-type"]).toContain("text/plain");
});

// Running the page must leave its head as the build wrote it: a
// crawler that runs script reads the same address as one that does not.
for (const route of ["/", "/start/", "/demos/"]) {
  test(`${base}${route.slice(1)} keeps its canonical address once it runs`, async ({ page }) => {
    await page.goto(`${base}${route.slice(1)}`);
    await expect(page.getByText("Ljós", { exact: true }).first()).toBeVisible();
    const head = await page.evaluate(() => ({
      canonical: [...document.querySelectorAll('link[rel="canonical"]')].map((link) => link.getAttribute("href")),
      ogUrl: [...document.querySelectorAll('meta[property="og:url"]')].map((meta) => meta.getAttribute("content")),
    }));
    expect(head).toEqual({ canonical: [`${origin}${route}`], ogUrl: [`${origin}${route}`] });
  });
}

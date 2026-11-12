// Parity with the site as it stands: the same routes the docs make
// (and, where the Astro build stands beside this one, the same
// routes it wrote), each page's own title and headings in its HTML,
// and every internal link naming a page that exists. What does not
// match is listed whole, so a gap is a list, not a surprise.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { readMarkdownSite } from "ljos-web/markdown";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function docsDir() {
  const candidates = [
    process.env.LJOS_DOCS_DIR,
    resolve(here, "../ljos-ui/docs/site"),
    resolve(here, "../../ljos-ui/docs/site"),
    join(process.env.HOME ?? "", "dev/ljos-ui/docs/site"),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(join(candidate, "start/index.md")));
}

function routesUnder(dir, prefix = "") {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return routesUnder(join(dir, entry.name), `${prefix}${entry.name}/`);
    return entry.name === "index.html" ? [`/${prefix}`] : [];
  });
}

const SECTIONS = [
  { id: "start", label: "Start" },
  { id: "ui", label: "User interface" },
  { id: "controls", label: "Controls" },
  { id: "data", label: "Data and input" },
  { id: "language", label: "Language" },
  { id: "quality", label: "Quality" },
  { id: "rust", label: "Rust" },
];

test("the built routes are the docs' routes, the landing page and the demos page", () => {
  const docs = docsDir();
  expect(docs, "LJOS_DOCS_DIR or a sibling ljos-ui checkout").toBeTruthy();
  const expected = ["/", "/demos/", ...readMarkdownSite({ dir: docs, sections: SECTIONS }).pages.map((page) => page.route)].sort();
  expect(routesUnder(join(here, "dist")).sort()).toEqual(expected);
  // Where the Astro build stands, its routes are these too (its 404
  // is a host's page, not a route of the site's).
  const astro = routesUnder(join(here, "../site/dist")).sort();
  if (astro.length) expect(astro).toEqual(expected);
});

test("each page's HTML carries its title and its headings, and its links resolve", () => {
  const docs = docsDir();
  const site = readMarkdownSite({ dir: docs, sections: SECTIONS });
  const routes = new Set(["/", "/demos/", ...site.pages.map((page) => page.route)]);
  const gaps = [];
  for (const page of site.pages) {
    const html = readFileSync(join(here, "dist", page.route.slice(1), "index.html"), "utf8");
    if (!html.includes(`<title>${page.title} — Ljós</title>`)) gaps.push(`${page.route}: its title is not the page's`);
    for (const heading of page.headings) {
      if (!html.includes(heading.plain)) gaps.push(`${page.route}: heading “${heading.plain}” is not in its HTML`);
    }
    for (const [, href] of html.matchAll(/data-link="([^"]+)"/g)) {
      const path = href.split("#")[0];
      if (path.startsWith("/") && !routes.has(path)) gaps.push(`${page.route}: links ${href}, which is no page`);
    }
  }
  expect(gaps).toEqual([]);
});

test("every docs page answers and shows its title", async ({ page }) => {
  const docs = docsDir();
  const site = readMarkdownSite({ dir: docs, sections: SECTIONS });
  expect(site.pages.length).toBeGreaterThanOrEqual(50);
  for (const docsPage of site.pages) {
    const response = await page.goto(docsPage.route);
    expect(response.ok(), docsPage.route).toBeTruthy();
    await expect(page.getByText(docsPage.title, { exact: true }).first()).toBeVisible();
  }
});

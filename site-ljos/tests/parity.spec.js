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
import { findDocsDir } from "../../scripts/docs-dir.mjs";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// The pinned docs the site was built from, never a guessed checkout: a
// sibling ljos-ui at another revision would be compared with a build of
// the pinned one. A test, not the file, says when it is missing, so the
// rest of the suite still runs.
const docs = findDocsDir();
const docsDir = () => docs.dir;

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
  expect(docsDir(), docs.problem).toBeTruthy();
  const expected = ["/", "/demos/", ...readMarkdownSite({ dir: docsDir(), sections: SECTIONS }).pages.map((page) => page.route)].sort();
  expect(routesUnder(join(here, "dist")).sort()).toEqual(expected);
  // Where the Astro build stands, its routes are these too (its 404
  // is a host's page, not a route of the site's).
  const astro = routesUnder(join(here, "../site/dist")).sort();
  if (astro.length) expect(astro).toEqual(expected);
});

test("each page's HTML carries its title and its headings, and its links resolve", () => {
  expect(docsDir(), docs.problem).toBeTruthy();
  const site = readMarkdownSite({ dir: docsDir(), sections: SECTIONS });
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

// Each docs page is a test of its own, with its own time: the walk
// grows with the docs, so one test over all of them outgrows any
// budget, and a page that does not answer is named by its test.
const docsSite = (() => {
  return docsDir() ? readMarkdownSite({ dir: docsDir(), sections: SECTIONS }) : { pages: [] };
})();

test("the docs have their pages to answer", () => {
  expect(docsDir(), docs.problem).toBeTruthy();
  expect(docsSite.pages.length).toBeGreaterThanOrEqual(50);
});

for (const docsPage of docsSite.pages) {
  test(`${docsPage.route} answers and shows its title`, async ({ page }) => {
    const response = await page.goto(docsPage.route);
    expect(response.ok(), docsPage.route).toBeTruthy();
    // The page's title as the reader sees it: the page is written at
    // more than one size, and only the one that fits is shown.
    await expect(page.getByText(docsPage.title, { exact: true }).filter({ visible: true }).first()).toBeVisible();
  });
}

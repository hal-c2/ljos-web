// The pages the ljos-ui pin brings (site/ljos-ui.sha at c2443e15) are
// built and stand in every docs page's sidebar, named by their title,
// with no script. The reader walks the docs' sections, so a new page is
// found without being named; this holds that it is, page by page.
// (Search is the header's to grow: it says so and takes no press yet.)
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

const titleIn = (html) => /<title>(.*) — Ljós<\/title>/.exec(html)?.[1];

for (const route of PINNED_PAGES) {
  test(`${route} is built and stands in the sidebar`, () => {
    const built = join(here, "dist", route.slice(1), "index.html");
    expect(existsSync(built), `${route} is built`).toBe(true);
    const title = titleIn(readFileSync(built, "utf8"));
    expect(title, `${route} has its title`).toBeTruthy();
    // The sidebar of another page has it as a link to it, named by its
    // title: a real <a href>, so it is followed with no script too.
    const start = readFileSync(join(here, "dist/start/index.html"), "utf8");
    const quoted = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expect(start).toMatch(new RegExp(`<a [^>]*href="${quoted(route)}"[^>]*>${quoted(title)}</a>`));
  });
}

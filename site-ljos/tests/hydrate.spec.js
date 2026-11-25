// The landing, the demos page and a pro demo's page are taken over as they were written:
// a fresh load hydrates the very elements the build prerendered, in
// either scheme, at a phone's width and a desktop's, and says nothing
// of a mismatch. A part that is made as the page settles (the Pantry's
// own shell, which its ShellLoader puts in once the page is made) is
// part of what was written, and so of what is taken over.
import { expect, test } from "@playwright/test";

const base = (process.env.LJOS_SITE_BASE ?? "/").replace(/\/?$/, "/");
// A pro demo's page too: its files are listed as it is written.
const ROUTES = ["", "demos/", "showcase/", "demos/cockpit/", "demos/watch/"];
const SIZES = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];

for (const route of ROUTES) {
  for (const viewport of SIZES) {
    for (const colorScheme of ["light", "dark"]) {
      test(`/${route} at ${viewport.width} in ${colorScheme} hydrates every prerendered element, with no mismatch`, async ({ browser }) => {
        const context = await browser.newContext({ viewport, colorScheme, reducedMotion: "no-preference" });
        try {
          const page = await context.newPage();
          const said = [];
          page.on("console", (message) => said.push(`${message.type()}: ${message.text()}`));
          // The page's script is held until the prerendered elements are
          // counted, so what hydration finds is what the build wrote.
          let release;
          const held = new Promise((done) => (release = done));
          await page.route("**/*.js", async (request) => {
            await held;
            await request.continue();
          });
          await page.goto(`${base}${route}`, { waitUntil: "commit" });
          // Parsed whole, its scripts still waiting: the page as written.
          await page.waitForFunction(() => document.readyState !== "loading");
          // The build writes a render per width and scheme where they
          // differ; the one the reader is shown is the one hydrated.
          const written = await page.evaluate(() => {
            const renders = [...document.querySelectorAll("#app > [data-ljos-render]")];
            const shown = renders.find((render) => getComputedStyle(render).display !== "none") ?? document.querySelector("#app");
            return (window.__prerendered = [...shown.querySelectorAll("[data-hk]")]).length;
          });
          expect(written, "elements the build wrote for hydration to take over").toBeGreaterThan(0);
          release();
          await page.waitForSelector('#app[data-ljos-hydrated="true"]');
          await page.unroute("**/*.js");
          expect(said.filter((text) => /hydration mismatch/.test(text)), "what the console said of hydration").toEqual([]);
          // Taken over, not made again: every element the build wrote is
          // still the page's, and none waits to be claimed.
          const kept = await page.evaluate(() => ({
            kept: window.__prerendered.filter((element) => document.contains(element)).length,
            unclaimed: document.querySelectorAll("#app [data-hk]").length,
          }));
          expect(kept).toEqual({ kept: written, unclaimed: 0 });
        } finally {
          await context.close();
        }
      });
    }
  }
}

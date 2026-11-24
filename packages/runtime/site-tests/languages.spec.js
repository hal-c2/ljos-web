// The language a site is written in (`languages.source`): the page is in
// it, and laid out its way, though the bundle has no catalogue to
// translate it into another.
import { buildSite } from "../site.js";
import { bundle, design, qmlc } from "./bundle.js";
import { expect, part, serve, test } from "./served.js";

test("a site written in Arabic with no catalogue is read in Arabic, from the right", async ({ page }) => {
  const made = bundle("project");
  let server;
  try {
    await part("build the site", () => buildSite({ dir: made.dir, out: made.out, qmlc, with: [design], languages: { source: "ar" } }));
    server = await part("serve it", () => serve(made.out));
    await page.goto(`${server.origin}/`);
    await expect(page.getByText("Stopped", { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir }))).toEqual({ lang: "ar", dir: "rtl" });
  } finally {
    await part("stop serving it", () => server?.stop());
    made.remove();
  }
});

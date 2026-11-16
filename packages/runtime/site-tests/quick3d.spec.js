// Ljós's QtQuick3D.Effects in a built site, with no Qt: its shaders are files
// beside its QML, and a build has to carry them as a dev server serves them.
import { buildSite } from "../site.js";
import { pixels } from "../tests/pixels.js";
import { bundle, qmlc } from "./bundle.js";
import { expect, part, serve, test } from "./served.js";

test("a Vignette of Ljós's darkens the edges of a built page where no Qt is installed", async ({ page }) => {
  const made = bundle("quick3d");
  let server;
  try {
    await part("build the site", () => buildSite({ dir: made.dir, out: made.out, qmlc, qt: [] }));
    server = await part("serve it", () => serve(made.out));
    const missing = [];
    page.on("response", (response) => response.status() >= 400 && missing.push(response.url()));
    await page.goto(`${server.origin}/`);
    const read = async (point) => Number((await pixels(page, [point]))[0].split(" ")[0]);
    // #808080 in linear light is 55 of 255.
    await expect.poll(() => read([100, 100])).toBeGreaterThan(50);
    expect(await read([1, 1])).toBeLessThan(45);
    expect(missing).toEqual([]);
  } finally {
    await part("stop serving it", () => server?.stop());
    made.remove();
  }
});

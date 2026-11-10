// Ljós's QtQuick3D.Effects in a built site, with no Qt: its shaders are files
// beside its QML, and a build has to carry them as a dev server serves them.
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { expect, test } from "@playwright/test";
import { buildSite } from "../site.js";
import { pixels } from "../tests/pixels.js";
import { bundle, qmlc } from "./bundle.js";

const port = Number(process.env.LJOS_SITE_PORT ?? 4480) + 6;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

function serve(directory) {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://site").pathname);
    const file = normalize(join(directory, path === "/" ? "index.html" : path));
    if (!file.startsWith(directory) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  return new Promise((done) => server.listen(port, "127.0.0.1", () => done(server)));
}

test("a Vignette of Ljós's darkens the edges of a built page where no Qt is installed", async ({ page }) => {
  const made = bundle("quick3d");
  await buildSite({ dir: made.dir, out: made.out, qmlc, qt: [] });
  const server = await serve(made.out);
  try {
    const missing = [];
    page.on("response", (response) => response.status() >= 400 && missing.push(response.url()));
    await page.goto(`http://127.0.0.1:${port}/`);
    const read = async (point) => Number((await pixels(page, [point]))[0].split(" ")[0]);
    // #808080 in linear light is 55 of 255.
    await expect.poll(() => read([100, 100])).toBeGreaterThan(50);
    expect(await read([1, 1])).toBeLessThan(45);
    expect(missing).toEqual([]);
  } finally {
    await new Promise((done) => server.close(done));
    made.remove();
  }
});

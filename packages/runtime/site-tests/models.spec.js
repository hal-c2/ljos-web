// `import Ljos.Models` in a built site: a JsonListModel's source is a file
// the site carries, fetched once as the page starts and again on
// `reload()`. A site has no dev server to say a file changed, and nothing
// asks the server whether one did.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { expect, test } from "@playwright/test";
import { createRequire } from "node:module"; import { buildSite } from "../site.js";
import { bundle, qmlc } from "./bundle.js";

const port = Number(process.env.LJOS_SITE_PORT ?? 4480) + 5;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

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

// The site's copy of the file, by what it holds.
function carried(directory, text) {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));
  return walk(directory).filter((file) => file.endsWith(".json") && readFileSync(file, "utf8") === text);
}

test.describe("a JsonListModel in a built site", () => {
  test.describe.configure({ mode: "serial" });
  const PEOPLE = '[{"name": "Ada"}, {"name": "Grace"}]\n';
  let made;
  let server;

  test.beforeAll(async () => {
    made = bundle("models");
    await buildSite({ dir: made.dir, out: made.out, qmlc });
    server = await serve(made.out);
  });
  test.afterAll(async () => {
    await new Promise((done) => server?.close(done));
    made?.remove();
  });

  test("shows a row for each record of the file the site carries, fetched once", async ({ page }) => {
    const files = carried(made.out, PEOPLE);
    expect(files).toHaveLength(1);
    const asked = [];
    page.on("request", (request) => request.url().endsWith(".json") && asked.push(request.url()));
    await page.goto(`http://127.0.0.1:${port}/`);
    await expect(page.getByText("Ada", { exact: true })).toBeVisible();
    await expect(page.getByText("Grace", { exact: true })).toBeVisible();
    expect(asked).toHaveLength(1);
  });

  test("reads the file again on reload, and only then", async ({ page }) => {
    const [file] = carried(made.out, PEOPLE);
    const asked = [];
    page.on("request", (request) => request.url().endsWith(".json") && asked.push(request.url()));
    await page.goto(`http://127.0.0.1:${port}/`);
    await expect(page.getByText("Grace", { exact: true })).toBeVisible();
    writeFileSync(file, '[{"name": "Ada"}, {"name": "Hedy"}]\n');
    try {
      await expect(page.getByText("Hedy", { exact: true })).toHaveCount(0);
      // Where the words are, as a pointer would: the MouseArea over them
      // takes the click.
      const box = await page.getByText("Read again", { exact: true }).boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(page.getByText("Hedy", { exact: true })).toBeVisible();
      await expect(page.getByText("Grace", { exact: true })).toHaveCount(0);
      expect(asked).toHaveLength(2);
    } finally {
      writeFileSync(file, PEOPLE);
    }
  });
});

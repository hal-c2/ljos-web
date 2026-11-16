// `import Ljos.Models` in a built site: a JsonListModel's source is a file
// the site carries, fetched once as the page starts and again on
// `reload()`. A site has no dev server to say a file changed, and nothing
// asks the server whether one did.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module"; import { buildSite } from "../site.js";
import { bundle, qmlc } from "./bundle.js";
import { expect, part, serve, shared, test } from "./served.js";

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

  test.beforeAll(shared("build the site and serve it", async () => {
    made = bundle("models");
    await part("build the site", () => buildSite({ dir: made.dir, out: made.out, qmlc }));
    server = await part("serve it", () => serve(made.out));
  }));
  test.afterAll(shared("stop serving it and remove the bundle", async () => {
    await part("stop serving it", () => server?.stop());
    made?.remove();
  }));

  test("shows a row for each record of the file the site carries, fetched once", async ({ page }) => {
    const files = carried(made.out, PEOPLE);
    expect(files).toHaveLength(1);
    const asked = [];
    page.on("request", (request) => request.url().endsWith(".json") && asked.push(request.url()));
    await page.goto(`${server.origin}/`);
    await expect(page.getByText("Ada", { exact: true })).toBeVisible();
    await expect(page.getByText("Grace", { exact: true })).toBeVisible();
    expect(asked).toHaveLength(1);
  });

  test("reads the file again on reload, and only then", async ({ page }) => {
    const [file] = carried(made.out, PEOPLE);
    const asked = [];
    page.on("request", (request) => request.url().endsWith(".json") && asked.push(request.url()));
    await page.goto(`${server.origin}/`);
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

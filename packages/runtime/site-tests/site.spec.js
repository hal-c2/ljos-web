import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { expect, test } from "@playwright/test";
import { buildSite, STAMP } from "../site.js";
import { bundle, design, qmlc } from "./bundle.js";

const port = Number(process.env.LJOS_SITE_PORT ?? 4480);
// Below a path of its own, as a site is put on a host among others.
const below = "/somewhere/site/";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };

// A plain static server of `directory` at `below`, and nothing else.
function serve(directory) {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://site").pathname);
    const file = path.startsWith(below) ? normalize(join(directory, path.slice(below.length) || "index.html")) : null;
    if (!file?.startsWith(directory) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  return new Promise((done) => server.listen(port, "127.0.0.1", () => done(server)));
}

test.describe("a site built from a bundle", () => {
  test.describe.configure({ mode: "serial" });
  let made;
  let built;
  let server;

  test.beforeAll(async () => {
    made = bundle("project");
    built = await buildSite({ dir: made.dir, out: made.out, qmlc, with: [design] });
    server = await serve(made.out);
  });
  test.afterAll(async () => {
    await new Promise((done) => server?.close(done));
    made?.remove();
  });

  test("shows the entry's text in the colour its design module gives text, and its picture", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
    await page.goto(`http://127.0.0.1:${port}${below}`);
    const text = page.getByText("Stopped", { exact: true });
    await expect(text).toBeVisible();
    expect(await text.evaluate((element) => getComputedStyle(element).color)).toBe("rgb(18, 52, 86)");
    // An Image paints its picture as the background of its face.
    await page.waitForFunction(() => [...document.querySelectorAll("#app *")].some((element) => getComputedStyle(element).backgroundImage.startsWith("url(")));
    const picture = await page.evaluate(async () => {
      const element = [...document.querySelectorAll("#app *")].find((element) => getComputedStyle(element).backgroundImage.startsWith("url("));
      const { width, height } = element.getBoundingClientRect();
      const image = new Image();
      image.src = getComputedStyle(element).backgroundImage.slice(5, -2);
      await image.decode();
      return [width, height, image.naturalWidth, image.naturalHeight];
    });
    expect(picture).toEqual([8, 8, 8, 8]);
    expect(errors).toEqual([]);
  });

  test("is static files of its own, asked for below the path it is served at", async ({ page }) => {
    const asked = [];
    page.on("request", (request) => asked.push(request.url()));
    await page.goto(`http://127.0.0.1:${port}${below}`);
    await expect(page.getByText("Stopped", { exact: true })).toBeVisible();
    expect(asked.length).toBeGreaterThan(0);
    for (const url of asked) expect(url.startsWith(`http://127.0.0.1:${port}${below}`) || url.startsWith("data:")).toBe(true);
    expect(built.files).toContain("index.html");
    expect(built.bytes).toBeGreaterThan(0);
  });

  test("carries the bundle's theme as it is, and says it built the site", () => {
    expect(readFileSync(join(made.out, "theme.json"), "utf8")).toBe(readFileSync(join(made.dir, "theme.json"), "utf8"));
    expect(readFileSync(join(made.out, STAMP), "utf8").trim()).toMatch(/^[0-9a-f]{40}$/);
  });
});

test("a site built again where one was built replaces it", async () => {
  const made = bundle("project");
  try {
    await buildSite({ dir: made.dir, out: made.out, qmlc, with: [design] });
    writeFileSync(join(made.out, "left-over.txt"), "of the last build\n");
    await buildSite({ dir: made.dir, out: made.out, qmlc, with: [design] });
    expect(existsSync(join(made.out, "left-over.txt"))).toBe(false);
    expect(existsSync(join(made.out, "index.html"))).toBe(true);
  } finally {
    made.remove();
  }
});

test("a directory that holds something other than a site it built is not replaced", async () => {
  const made = bundle("project");
  try {
    mkdirSync(made.out);
    writeFileSync(join(made.out, "notes.txt"), "somebody's\n");
    await expect(buildSite({ dir: made.dir, out: made.out, qmlc, with: [design] })).rejects.toThrow(/holds something other than a site this built/);
    expect(readFileSync(join(made.out, "notes.txt"), "utf8")).toBe("somebody's\n");
  } finally {
    made.remove();
  }
});

test("`ljos-web build-site` builds the site from the command line, next to the bundle by default", () => {
  const made = bundle("project");
  try {
    const ran = spawnSync(process.execPath, [join(import.meta.dirname, "../bin/ljos-web.js"), "build-site", made.dir, "--qmlc", qmlc, "--with", design], { encoding: "utf8" });
    expect(ran.stderr.replace(/^note: .*\n/m, "")).toBe("");
    expect(ran.status).toBe(0);
    expect(ran.stdout).toContain(`site: ${made.dir}-site (`);
    expect(existsSync(join(`${made.dir}-site`, "index.html"))).toBe(true);
  } finally {
    made.remove();
  }
});

test("`ljos-web build-site` says why a bundle is refused, and exits with an error", () => {
  const made = bundle("project", (dir) => writeFileSync(join(dir, "stray.txt"), "?\n"));
  try {
    const ran = spawnSync(process.execPath, [join(import.meta.dirname, "../bin/ljos-web.js"), "build-site", made.dir, "--qmlc", qmlc], { encoding: "utf8" });
    expect(ran.status).toBe(1);
    expect(ran.stderr).toContain("stray.txt is in the bundle but not in its manifest");
  } finally {
    made.remove();
  }
});

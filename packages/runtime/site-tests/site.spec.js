import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename, dirname, extname, join, normalize, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { buildSite, builtWith, replaceSite, STAMP } from "../site.js";
import { bundle, design, qmlc } from "./bundle.js";
import { runnable } from "./compiler-check.js";

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

test("a site is put in place whole: a copy that fails leaves the one there, and nothing beside it", () => {
  const made = bundle("project");
  try {
    mkdirSync(made.out);
    writeFileSync(join(made.out, "index.html"), "the site there\n");
    const before = readdirSync(made.root).sort();
    expect(() => replaceSite(join(made.root, "no-such-build"), made.out)).toThrow(/ENOENT/);
    expect(readFileSync(join(made.out, "index.html"), "utf8")).toBe("the site there\n");
    expect(readdirSync(made.root).sort()).toEqual(before);
    const built = join(made.root, "build");
    mkdirSync(built);
    writeFileSync(join(built, "index.html"), "the new site\n");
    replaceSite(built, made.out);
    expect(readFileSync(join(made.out, "index.html"), "utf8")).toBe("the new site\n");
    expect(readdirSync(made.root).sort()).toEqual([...before, "build"].sort());
  } finally {
    made.remove();
  }
});

test("the only good copy of a site is kept when it cannot be put back", () => {
  const made = bundle("project");
  try {
    mkdirSync(made.out, { recursive: true });
    writeFileSync(join(made.out, "index.html"), "the site there\n");
    const built = join(made.root, "build");
    mkdirSync(built);
    writeFileSync(join(built, "index.html"), "the new site\n");
    // The first rename, of what is there aside, works; nothing after it does.
    let renames = 0;
    const failing = (from, to) => {
      if (++renames > 1) throw new Error("the disk says no");
      renameSync(from, to);
    };
    expect(() => replaceSite(built, made.out, failing)).toThrow(/the last good site is at /);
    const kept = readdirSync(made.root).filter((name) => name.includes(".old-"));
    expect(kept).toHaveLength(1);
    expect(readFileSync(join(made.root, kept[0], "index.html"), "utf8")).toBe("the site there\n");
    expect(readdirSync(made.root).some((name) => name.includes(".new-"))).toBe(false);
  } finally {
    made.remove();
  }
});

test("a compiler named bare is found on the PATH, as it is run", () => {
  const env = { PATH: dirname(resolve(qmlc)) };
  expect(runnable(basename(qmlc), env)).toBe(true);
  expect(runnable(basename(qmlc), { PATH: join(dirname(resolve(qmlc)), "no-such") })).toBe(false);
  expect(runnable(join(dirname(resolve(qmlc)), "no-such-compiler"))).toBe(false);
});

test("the commit a site is said to be built with is ljos-web's checkout's, not that of a host it is installed in", () => {
  const made = bundle("project");
  const git = (cwd, ...args) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });
  try {
    const host = join(made.root, "host");
    const installed = join(host, "node_modules/ljos-web");
    mkdirSync(installed, { recursive: true });
    writeFileSync(join(host, "file"), "host\n");
    git(host, "init", "-q");
    git(host, "add", "file");
    git(host, "commit", "-qm", "host");
    expect(builtWith(installed)).toBe(null);

    const checkout = join(made.root, "ljos-web");
    const runtime = join(checkout, "packages/runtime");
    mkdirSync(runtime, { recursive: true });
    writeFileSync(join(runtime, "file"), "ljos-web\n");
    git(checkout, "init", "-q");
    git(checkout, "add", ".");
    git(checkout, "commit", "-qm", "ljos-web");
    expect(builtWith(runtime)).toBe(git(checkout, "rev-parse", "HEAD").stdout.trim());

    expect(builtWith(join(made.root, "bundle"))).toBe(null);
  } finally {
    made.remove();
  }
});

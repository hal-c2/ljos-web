// A site whose visitors may drop a shell of their own (docs/LJOS_WEB.md A9),
// and one whose visitors may not: what each page is, served as a host would
// serve it.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { expect, test } from "@playwright/test";
import { build } from "vite";
import { buildSite } from "../site.js";
import qml from "../vite.js";
import { bundle, qmlc } from "./bundle.js";

const port = Number(process.env.LJOS_SITE_PORT ?? 4480) + 7;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".wasm": "application/wasm" };

// The policy a host that runs no script but its own gives the page; the
// compiler's worker is given its own, which lets it compile WebAssembly.
const PAGE = "script-src 'self'";
const WORKER = "script-src 'self' 'wasm-unsafe-eval'";

// A static server of `directory`, under `policy` when it is given.
function serve(directory, port, policy) {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://site").pathname);
    const file = normalize(join(directory, path === "/" ? "index.html" : path));
    if (!file.startsWith(directory) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    const headers = { "content-type": TYPES[extname(file)] ?? "application/octet-stream" };
    if (policy) headers["content-security-policy"] = /shell-worker[^/]*\.js$/.test(file) ? WORKER : PAGE;
    response.writeHead(200, headers).end(readFileSync(file));
  });
  return new Promise((done) => server.listen(port, "127.0.0.1", () => done(server)));
}

const MINE = `import QtQuick
import Shop

Column {
    Basket { id: basket; objectName: "basket" }
    Text { text: "Mine " + basket.count }
}
`;

const all = (directory, prefix = "") =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? all(join(directory, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`],
  );

test.describe("a site built without a live shell", () => {
  test.describe.configure({ mode: "serial" });
  let made;
  let server;
  test.beforeAll(async () => {
    made = bundle("live");
    await buildSite({ dir: made.dir, out: made.out, qmlc });
    server = await serve(made.out, port);
  });
  test.afterAll(async () => {
    await new Promise((done) => server?.close(done));
    made?.remove();
  });

  test("A page built without liveShell has no drop and loads no compiler", async ({ page }) => {
    const asked = [];
    page.on("request", (request) => asked.push(request.url()));
    await page.goto(`http://127.0.0.1:${port}/`);
    await expect(page.getByText("Default 0", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open a shell…" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Shell" })).toHaveCount(0);
    expect(asked.filter((url) => /\.wasm$|shell-worker|compiler/.test(url))).toEqual([]);
    // Nor is any of it written beside the page.
    expect(all(made.out).filter((path) => /\.wasm$|shell-worker/.test(path))).toEqual([]);
  });
});

test.describe("a site whose blocks are on an import path", () => {
  test.describe.configure({ mode: "serial" });
  let place;
  let server;
  test.beforeAll(async () => {
    place = realpathSync(mkdtempSync(join(tmpdir(), "ljos-live-")));
    const files = {
      "index.html": '<!doctype html><script type="module" src="/main.js"></script>',
      "main.js": 'import Main from "./Main.qml";\nwindow.live = Main.$live.blocks.map(({ name, file, component }) => [name, file, typeof component]);\n',
      "Main.qml": "import QtQuick\nimport Shop\nBasket { }\n",
      "../vendor/Shop/qmldir": 'module Shop\n# block Basket 1.0 Basket.qml Shop "From the vendor"\n',
      "../vendor/Shop/Basket.qml": "import QtQuick\nItem { }\n",
    };
    for (const [name, text] of Object.entries(files)) {
      const file = join(place, "app", name);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
    const app = join(place, "app");
    await build({
      configFile: false,
      root: app,
      base: "./",
      logLevel: "error",
      plugins: [qml({ qmlc, root: app, importPaths: [join(place, "vendor")], liveShell: true })],
      build: { outDir: join(place, "out"), target: "esnext", chunkSizeWarningLimit: 4000 },
      worker: { format: "es" },
    });
    server = await serve(join(place, "out"), port + 2);
  });
  test.afterAll(async () => {
    await new Promise((done) => server?.close(done));
    if (place) rmSync(place, { recursive: true, force: true });
  });

  test("A block on an import path is offered, its file said from the root and no further", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${port + 2}/`);
    await expect.poll(() => page.evaluate(() => window.live)).toEqual([["Basket", "../vendor/Shop/Basket.qml", "function"]]);
    const written = all(join(place, "out")).filter((path) => path.endsWith(".js"));
    for (const path of written) expect(readFileSync(join(place, "out", path), "utf8")).not.toContain(place);
  });
});

test.describe("a site's blocks are found as its compile finds them", () => {
  const PAGE = {
    "index.html": '<!doctype html><script type="module" src="/main.js"></script>',
    "main.js": 'import Main from "./Main.qml";\nwindow.live = Main.$live.blocks.map(({ name, file, component }) => [name, file, typeof component]);\n',
  };
  const SHOP = {
    "Shop/qmldir": 'module Shop\n# block Basket 1.0 Basket.qml Shop "From the project"\n',
    "Shop/Basket.qml": "import QtQuick\nItem { }\n",
  };
  const made = (files) => {
    const place = realpathSync(mkdtempSync(join(tmpdir(), "ljos-live-")));
    for (const [name, text] of Object.entries(files)) {
      const file = join(place, name);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
    return place;
  };
  const built = (place, app, options) =>
    build({
      configFile: false,
      root: app,
      base: "./",
      logLevel: "silent",
      plugins: [qml({ qmlc, liveShell: true, ...options })],
      build: { outDir: join(place, "out"), target: "esnext", chunkSizeWarningLimit: 4000 },
      worker: { format: "es" },
    });
  const offered = async (page, place, at) => {
    const server = await serve(join(place, "out"), at);
    try {
      await page.goto(`http://127.0.0.1:${at}/`);
      await expect.poll(() => page.evaluate(() => window.live)).toBeTruthy();
      return await page.evaluate(() => window.live);
    } finally {
      await new Promise((done) => server.close(done));
    }
  };
  const inside = (name, files) => Object.fromEntries(Object.entries(files).map(([path, text]) => [`${name}/${path}`, text]));

  test("With no root named, a block of the project a CMakeLists.txt starts is offered", async ({ page }) => {
    const place = made({
      "p/CMakeLists.txt": "project(p)\n",
      ...inside("p", SHOP),
      ...inside("p/src", PAGE),
      "p/src/Main.qml": "import QtQuick\nimport Shop\nBasket { }\n",
    });
    try {
      await built(place, join(place, "p/src"), {});
      expect(await offered(page, place, port + 3)).toEqual([["Basket", "Shop/Basket.qml", "function"]]);
    } finally {
      rmSync(place, { recursive: true, force: true });
    }
  });

  test("A root named through a link gives a block on an import path, its file there", async ({ page }) => {
    const place = made({
      ...inside("real/app", PAGE),
      "real/app/Main.qml": "import QtQuick\nimport Shop\nBasket { }\n",
      ...inside("real/vendor", SHOP),
    });
    try {
      mkdirSync(join(place, "links"));
      symlinkSync(join(place, "real/app"), join(place, "links/app"));
      await built(place, join(place, "real/app"), { root: join(place, "links/app"), importPaths: [join(place, "real/vendor")] });
      expect(await offered(page, place, port + 4)).toEqual([["Basket", "../vendor/Shop/Basket.qml", "function"]]);
    } finally {
      rmSync(place, { recursive: true, force: true });
    }
  });

  test("An entry whose imports give no block is told, not built to offer nothing", async () => {
    const place = made({
      ...PAGE,
      "CMakeLists.txt": "project(p)\n",
      "Plain/qmldir": "module Plain\nThing 1.0 Thing.qml\n",
      "Plain/Thing.qml": "import QtQuick\nItem { }\n",
      "Main.qml": "import QtQuick\nimport Plain\nThing { }\n",
    });
    try {
      await expect(built(place, place, {})).rejects.toThrow(/Main\.qml.*Plain.*no block/s);
    } finally {
      rmSync(place, { recursive: true, force: true });
    }
  });

  test("An entry with no module to give a block offers none", async ({ page }) => {
    const place = made({ ...PAGE, "Main.qml": "import QtQuick\nItem { }\n" });
    try {
      await built(place, place, {});
      expect(await offered(page, place, port + 5)).toEqual([]);
    } finally {
      rmSync(place, { recursive: true, force: true });
    }
  });
});

test.describe("a site built with a live shell, under a policy that runs only its own scripts", () => {
  test.describe.configure({ mode: "serial" });
  let made;
  let server;
  test.beforeAll(async () => {
    made = bundle("live");
    await buildSite({ dir: made.dir, out: made.out, qmlc, liveShell: true });
    server = await serve(made.out, port + 1, true);
  });
  test.afterAll(async () => {
    await new Promise((done) => server?.close(done));
    made?.remove();
  });

  test("A page under CSP script-src 'self' runs a dropped shell", async ({ page }) => {
    const problems = [];
    const asked = [];
    page.on("pageerror", (error) => problems.push(error.message));
    page.on("console", (message) => (message.type() === "error" || message.type() === "warning") && problems.push(message.text()));
    page.on("request", (request) => asked.push(request.url()));
    await page.goto(`http://127.0.0.1:${port + 1}/`);
    await expect(page.getByText("Default 0", { exact: true })).toBeVisible();
    // The compiler is fetched on the first drop, not before.
    expect(asked.filter((url) => /\.wasm$|shell-worker/.test(url))).toEqual([]);
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Open a shell…" }).click();
    await (await chooser).setFiles({ name: "Mine.qml", mimeType: "text/plain", buffer: Buffer.from(MINE) });
    await expect(page.getByText("Mine 0", { exact: true })).toBeVisible();
    await expect(page.getByRole("alert")).toBeHidden();
    expect(asked.some((url) => /\.wasm$/.test(url))).toBe(true);
    expect(problems).toEqual([]);
  });
});

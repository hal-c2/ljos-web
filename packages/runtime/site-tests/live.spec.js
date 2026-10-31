// A site whose visitors may drop a shell of their own (docs/LJOS_WEB.md A9),
// and one whose visitors may not: what each page is, served as a host would
// serve it.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { expect, test } from "@playwright/test";
import { buildSite } from "../site.js";
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

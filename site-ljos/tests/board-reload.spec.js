// features/board-reload.feature: the reload the front page's replay is to
// use, on a minified build of its own. The card is the site's as it ships;
// only the modules that lay it out are fixtures.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { buildSite } from "../../packages/runtime/site.js";
import { manifest, qmlc } from "../../packages/runtime/site-tests/bundle.js";

const site = fileURLToPath(new URL("../bundle", import.meta.url));
const fixture = fileURLToPath(new URL("./fixtures/board-reload", import.meta.url));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };

// The app's own files, as they are, beside the fixture's modules.
function bundled(dir) {
  cpSync(fixture, dir, { recursive: true });
  mkdirSync(join(dir, "Site"));
  for (const name of ["motion.js", "scheme.js", "tokens.js"]) cpSync(join(site, name), join(dir, name));
  for (const name of ["Theme.qml", "StageButton.qml"]) cpSync(join(site, "Site", name), join(dir, "Site", name));
  writeFileSync(join(dir, "Site/qmldir"), "module Site\nsingleton Theme 1.0 Theme.qml\nStageButton 1.0 StageButton.qml\n");
  cpSync(join(site, "Demos/DispatchCard.qml"), join(dir, "DispatchCard.qml"));
  writeFileSync(join(dir, "ljos-site.json"), JSON.stringify(manifest(dir, "Main.qml")));
}

let root;
let server;
let origin;

test.beforeAll(async () => {
  // It compiles and bundles a site of its own, as the runtime's site tests do.
  test.setTimeout(120_000);
  root = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-board-reload-"));
  const dir = join(root, "bundle");
  const out = join(root, "site");
  bundled(dir);
  await buildSite({ dir, out, qmlc });
  server = createServer((request, response) => {
    const path = new URL(request.url, "http://site").pathname;
    const file = normalize(join(out, path === "/" ? "index.html" : path));
    try {
      if (!file.startsWith(out)) throw new Error("outside the site");
      const body = readFileSync(file);
      response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((done, failed) => server.once("error", failed).listen(0, "127.0.0.1", done));
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server?.listening) {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
  if (root) rmSync(root, { recursive: true, force: true });
});

// The app running its first module, after Feeder 12 was given a crew in it.
async function assigned(page) {
  const asked = [];
  page.on("request", (request) => asked.push(new URL(request.url()).pathname.split("/").pop()));
  await page.goto(`${origin}/`);
  await expect(page.getByText("first, made 1", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Tickets" }).getByRole("listitem")).toHaveCount(3);
  await page.getByRole("button", { name: "Assign crew to BG-415", exact: true }).click();
  await expect(page.getByRole("list", { name: "Tickets" }).getByRole("listitem", { name: /^BG-415 .*On-call crew$/ })).toBeVisible();
  expect(asked.filter((file) => file.startsWith("BoardAfter")), "the edit's module, before the edit").toEqual([]);
  return asked;
}

async function onTheBoard(page) {
  const crewed = page.getByRole("list", { name: "Crew assigned" });
  await expect(crewed.getByRole("listitem")).toHaveCount(2);
  await expect(crewed.getByRole("listitem", { name: /^BG-415 .*On-call crew$/ })).toBeVisible();
  await expect(page.getByRole("list", { name: "Needs a crew" }).getByRole("listitem", { name: /^BG-421 / })).toBeVisible();
  await expect(page.getByRole("list", { name: "Tickets" })).toHaveCount(0);
  await expect(page.getByText("North district dispatch", { exact: true })).toBeVisible();
}

async function onTheList(page) {
  const list = page.getByRole("list", { name: "Tickets" });
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await expect(list.getByRole("listitem", { name: /^BG-415 .*On-call crew$/ })).toBeVisible();
  await expect(page.getByRole("list", { name: "Crew assigned" })).toHaveCount(0);
}

test("the edited module replaces the running one and keeps Feeder 12's crew", async ({ page }) => {
  const asked = await assigned(page);
  await page.getByRole("button", { name: "Edit to the board", exact: true }).click();
  await expect(page.getByText("running after, made 2", { exact: true })).toBeVisible();
  expect(asked.filter((file) => /^BoardAfter.*\.js$/.test(file)), "the edit's own module").toHaveLength(1);
  await onTheBoard(page);
  expect(asked.filter((file) => /\.wasm$|^compiler-|ljos_web_compiler/.test(file)), "a compiler").toEqual([]);
});

test("a module that throws as it loads keeps the last board, before an edit and after one", async ({ page }) => {
  await assigned(page);
  const fails = page.getByRole("button", { name: "Edit that fails", exact: true });
  await fails.click();
  await expect(page.getByText(/^kept: .*this board cannot load, made 1$/)).toBeVisible();
  await onTheList(page);
  await page.getByRole("button", { name: "Edit to the board", exact: true }).click();
  await expect(page.getByText("running after, made 2", { exact: true })).toBeVisible();
  await onTheBoard(page);
  await fails.click();
  await expect(page.getByText(/^kept: .*this board cannot load, made 2$/)).toBeVisible();
  await onTheBoard(page);
});

test("a module that cannot be fetched keeps the last board", async ({ page }) => {
  let refused = 0;
  await page.route(/\/BoardAfter[^/]*\.js$/, (route) => {
    refused += 1;
    return route.abort();
  });
  await assigned(page);
  await page.getByRole("button", { name: "Edit to the board", exact: true }).click();
  await expect(page.getByText(/^kept: .*cannot load: .*, made 1$/)).toBeVisible();
  expect(refused, "the module was asked for, and refused").toBeGreaterThan(0);
  await onTheList(page);
});

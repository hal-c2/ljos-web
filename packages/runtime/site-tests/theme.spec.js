// The theme a site reads (ljos-ui's `docs/theme.md`): which file, applied
// how, and a refused one refusing the site.
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { expect, test } from "@playwright/test";
import { buildSite } from "../site.js";
import { bundle, design, qmlc } from "./bundle.js";

test.describe.configure({ mode: "serial" });

const port = Number(process.env.LJOS_SITE_PORT ?? 4480) + 1;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };

function serve(directory) {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://site").pathname);
    const file = normalize(join(directory, path.slice(1) || "index.html"));
    if (!file.startsWith(directory) || !existsSync(file) || !statSync(file).isFile()) return response.writeHead(404).end();
    response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  return new Promise((done) => server.listen(port, "127.0.0.1", () => done(server)));
}

// What colour the entry's text is, in the site built from the fixture as
// `change` leaves it.
async function shown(page, change) {
  const made = bundle("project", change);
  let server;
  try {
    await buildSite({ dir: made.dir, out: made.out, qmlc, with: [design] });
    server = await serve(made.out);
    await page.goto(`http://127.0.0.1:${port}/`);
    const text = page.getByText("Stopped", { exact: true });
    await expect(text).toBeVisible();
    return await text.evaluate((element) => getComputedStyle(element).color);
  } finally {
    await new Promise((done) => (server ? server.close(done) : done()));
    made.remove();
  }
}

const write = (dir, manifest, path, text) => {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), text);
  const entry = manifest.files.find((file) => file.path === path);
  if (entry) entry.bytes = Buffer.byteLength(text);
  else manifest.files.push({ path, bytes: Buffer.byteLength(text) }), manifest.files.sort((a, b) => (a.path < b.path ? -1 : 1));
};
const BLUE = '{"Colors": {"text": {"light": "#0b3d91"}}}\n';
const GREEN = '{"Colors": {"text": {"light": "#1b5e20"}}}\n';

test("a site shows its theme's colour in place of the module's", async ({ page }) => {
  expect(await shown(page, (dir, m) => write(dir, m, "theme.json", BLUE))).toBe("rgb(11, 61, 145)");
});

test("a site with no theme shows the module's own colour", async ({ page }) => {
  const none = (dir, m) => {
    rmSync(join(dir, "theme.json"));
    m.files = m.files.filter((file) => file.path !== "theme.json");
    delete m.theme;
  };
  expect(await shown(page, none)).toBe("rgb(18, 52, 86)");
});

test("without a theme named, the theme.json nearest the entry among the listed files is read", async ({ page }) => {
  const nearest = (dir, m) => {
    write(dir, m, "theme.json", GREEN);
    write(dir, m, "site/theme.json", BLUE);
    write(dir, m, "site/Shell.qml", readFileSync(join(dir, "Shell.qml"), "utf8").replace('"images/logo.svg"', '"../images/logo.svg"'));
    m.entry = "site/Shell.qml";
    delete m.theme;
  };
  expect(await shown(page, nearest)).toBe("rgb(11, 61, 145)");
});

test("a theme.json that is not on the way from the entry up is not read", async ({ page }) => {
  const aside = (dir, m) => {
    rmSync(join(dir, "theme.json"));
    m.files = m.files.filter((file) => file.path !== "theme.json");
    write(dir, m, "other/theme.json", BLUE);
    delete m.theme;
  };
  expect(await shown(page, aside)).toBe("rgb(18, 52, 86)");
});

test("the theme the manifest names wins over the nearest", async ({ page }) => {
  const named = (dir, m) => {
    write(dir, m, "theme.json", GREEN);
    write(dir, m, "themes/blue.json", BLUE);
    m.theme = "themes/blue.json";
  };
  expect(await shown(page, named)).toBe("rgb(11, 61, 145)");
});

test("a refused theme refuses the site, telling each mistake as file:line:column", async () => {
  const made = bundle("project", (dir, m) => write(dir, m, "theme.json", '{"Colors": {"acent": "#000000"}}\n'));
  try {
    await expect(buildSite({ dir: made.dir, out: made.out, qmlc, with: [design] })).rejects.toThrow(
      /the theme theme\.json is refused:\ntheme\.json:1:\d+: Colors has no role "acent"/,
    );
    expect(existsSync(made.out)).toBe(false);
  } finally {
    made.remove();
  }
});

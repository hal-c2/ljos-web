// A site of more than one page: one bundle and one build write every
// page's own prerendered HTML, each under its route, each with its own
// title and the words of the page the shell shows for that route —
// readable with no script, and the page a reader hydrates is the page
// that was prerendered for the address they asked for.
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { expect, test } from "@playwright/test";
import { buildSite } from "../site.js";
import { bundle, qmlc } from "./bundle.js";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".wasm": "application/wasm" };

function serve(directory) {
  const server = createServer((request, response) => {
    let path = decodeURIComponent(new URL(request.url, "http://site").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = normalize(join(directory, path));
    if (!file.startsWith(directory) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done(server)));
}

test.describe("a site built as pages", () => {
  test.describe.configure({ mode: "serial" });
  let made;
  let built;
  let server;
  let origin;

  test.beforeAll(async () => {
    made = bundle("pages");
    built = await buildSite({
      dir: made.dir,
      out: made.out,
      qmlc,
      prerender: {
        pages: [
          { route: "/", title: "Home — Pages", props: { route: "/" } },
          { route: "/docs/", title: "Docs — Pages", props: { route: "/docs/" } },
        ],
      },
    });
    server = await serve(made.out);
    origin = `http://127.0.0.1:${server.address().port}`;
  });
  test.afterAll(async () => {
    await new Promise((done) => server?.close(done));
    made?.remove();
  });

  test("writes each page under its route, with its title and only its words", () => {
    expect(built.files).toContain("index.html");
    expect(built.files).toContain("docs/index.html");
    const home = readFileSync(join(made.out, "index.html"), "utf8");
    const docs = readFileSync(join(made.out, "docs/index.html"), "utf8");
    expect(home).toContain("<title>Home — Pages</title>");
    expect(home).toContain("Home page words");
    expect(home).not.toContain("Docs page words");
    expect(docs).toContain("<title>Docs — Pages</title>");
    expect(docs).toContain("Docs page words");
    expect(docs).not.toContain("Home page words");
    // The nested page asks for the one build's assets from its own depth.
    expect(docs).not.toContain('src="./assets/');
    expect(docs).toContain("../assets/");
  });

  test("each page reads with JavaScript off", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto(`${origin}/`);
      await expect(page.getByText("Home page words", { exact: true })).toBeVisible();
      await page.goto(`${origin}/docs/`);
      await expect(page.getByText("Docs page words", { exact: true })).toBeVisible();
      await expect(page.getByText("Site shell", { exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("the nested page hydrates as the page its route names", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
    await page.goto(`${origin}/docs/`);
    await page.waitForSelector('#app[data-ljos-hydrated="true"]');
    await expect(page.getByText("Docs page words", { exact: true })).toBeVisible();
    await expect(page.getByText("Route /docs/", { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test("a site that imports Ljos.Blocks builds prerendered, its Slot's delegate in the HTML", async () => {
  // The entry's Slot pulls the in-page compiler's module table into
  // the bundle, every control style's QML with it: those files are
  // no project's, and compiling them with the bundle as their root
  // made their sibling impl types unresolvable.
  const src = `import QtQuick\nimport Ljos.Blocks\n\nColumn {\n    Text { text: "with a slot" }\n    Slot { name: "main"; delegate: Component { Text { text: "own delegate" } } }\n}\n`;
  const made = bundle("pages", (dir, written) => {
    writeFileSync(join(dir, "Shell.qml"), src);
    written.files = written.files.map((file) => (file.path === "Shell.qml" ? { path: file.path, bytes: Buffer.byteLength(src) } : file));
    written.imports = ["Ljos.Blocks", "QtQuick"];
  });
  // As a machine with no Qt 6 builds it, as the controls tests build
  // theirs: with one installed, the link table would compile that
  // install's Imagine QML, whose impl types are its plugin's and no
  // table this compiler has — a failure of the machine's Qt, not of
  // this build.
  const saved = { PATH: process.env.PATH, QT_INSTALL_QML: process.env.QT_INSTALL_QML, QML_IMPORT_PATH: process.env.QML_IMPORT_PATH };
  const bin = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-no-qt-"));
  process.env.PATH = bin;
  delete process.env.QT_INSTALL_QML;
  delete process.env.QML_IMPORT_PATH;
  try {
    await buildSite({ dir: made.dir, out: made.out, qmlc, qt: [], prerender: true });
    const html = readFileSync(join(made.out, "index.html"), "utf8");
    expect(html).toContain("with a slot");
    expect(html).toContain("own delegate");
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(bin, { recursive: true, force: true });
    made.remove();
  }
});

test("a page that carries its words as data, larger than a pipe holds by default, still builds", async () => {
  const words = "word ".repeat(80_000);
  const made = bundle("pages", (dir, written) => {
    const shell = `import QtQuick\n\nColumn {\n    property string route: "/"\n    property string carried: ${JSON.stringify(words)}\n    Text { text: "Carried " + carried.length }\n}\n`;
    writeFileSync(join(dir, "Shell.qml"), shell);
    written.files = written.files.map((file) => (file.path === "Shell.qml" ? { path: file.path, bytes: Buffer.byteLength(shell) } : file));
  });
  try {
    await buildSite({ dir: made.dir, out: made.out, qmlc, prerender: true });
    expect(readFileSync(join(made.out, "index.html"), "utf8")).toContain(`Carried ${words.length}`);
  } finally {
    made.remove();
  }
});

test("a route that is not a plain path below the site is refused before anything is built", async () => {
  const made = bundle("pages");
  try {
    await expect(buildSite({ dir: made.dir, out: made.out, qmlc, prerender: { pages: [{ route: "../elsewhere/", props: {} }] } })).rejects.toThrow(/route/);
    expect(existsSync(join(made.out, "index.html"))).toBe(false);
  } finally {
    made.remove();
  }
});

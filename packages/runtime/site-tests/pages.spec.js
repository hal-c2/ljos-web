// A site of more than one page: one bundle and one build write every
// page's own prerendered HTML, each under its route, each with its own
// title and the words of the page the shell shows for that route —
// readable with no script, and the page a reader hydrates is the page
// that was prerendered for the address they asked for.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSite } from "../site.js";
import { bundle, qmlc } from "./bundle.js";
import { expect, part, serve, shared, test } from "./served.js";

test.describe("a site built as pages", () => {
  test.describe.configure({ mode: "serial" });
  let made;
  let built;
  let server;
  let origin;

  test.beforeAll(shared("build the site and serve it", async () => {
    made = bundle("pages");
    built = await part("build the site", () => buildSite({
      dir: made.dir,
      out: made.out,
      qmlc,
      prerender: {
        pages: [
          { route: "/", title: "Home — Pages", props: { route: "/" } },
          // Props as a docs page's reading may be: markup that would end
          // or reopen their script element, and more than one argument
          // of a process may hold.
          { route: "/docs/", title: "Docs — Pages", props: { route: "/docs/", sample: "<!-- <script>", reading: "x".repeat(200_000) } },
        ],
      },
    }));
    server = await part("serve it", () => serve(made.out));
    origin = server.origin;
  }));
  test.afterAll(shared("stop serving it and remove the bundle", async () => {
    await part("stop serving it", () => server?.stop());
    made?.remove();
  }));

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
    // The props came through whole, and ended where the build ended them.
    const props = await page.evaluate(() => JSON.parse(document.getElementById("ljos-props").textContent));
    expect(props.sample).toBe("<!-- <script>");
    expect(props.reading.length).toBe(200_000);
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
    await part("build the site", () => buildSite({ dir: made.dir, out: made.out, qmlc, qt: [], prerender: true }));
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

test("a page with a text editor prerenders, its text in the HTML", async () => {
  const src = `import QtQuick\n\nColumn {\n    Text { text: "Edit me" }\n    TextEdit { width: 300; text: "\\nimport QtQuick" }\n}\n`;
  const made = bundle("pages", (dir, written) => {
    writeFileSync(join(dir, "Shell.qml"), src);
    written.files = written.files.map((file) => (file.path === "Shell.qml" ? { path: file.path, bytes: Buffer.byteLength(src) } : file));
    written.imports = ["QtQuick"];
  });
  try {
    await part("build the site", () => buildSite({ dir: made.dir, out: made.out, qmlc, prerender: true }));
    const html = readFileSync(join(made.out, "index.html"), "utf8");
    expect(html).toContain("Edit me");
    // A textarea's words are its content, as a browser reads them:
    // a `value` attribute on one is nobody's text. An HTML parser
    // drops one newline after the opening tag, so the written
    // newline is the renderer's and the editor's own first blank
    // line survives it.
    expect(html).toContain(">\n\nimport QtQuick</textarea>");
    expect(html).not.toContain('value="import QtQuick"');
  } finally {
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
    await part("build the site", () => buildSite({ dir: made.dir, out: made.out, qmlc, prerender: true }));
    expect(readFileSync(join(made.out, "index.html"), "utf8")).toContain(`Carried ${words.length}`);
  } finally {
    made.remove();
  }
});

test("a route that is not a plain path below the site is refused before anything is built", async () => {
  const made = bundle("pages");
  try {
    // Each of these would write outside the site, or at another
    // route's own place, whatever its words say.
    for (const route of ["../elsewhere/", "/../elsewhere/", "/../../outside/", "/docs/../", "/./", "/.../"]) {
      await expect(buildSite({ dir: made.dir, out: made.out, qmlc, prerender: { pages: [{ route, props: {} }] } }), route).rejects.toThrow(/route/);
    }
    expect(existsSync(join(made.out, "index.html"))).toBe(false);
  } finally {
    made.remove();
  }
});

// A page laid out by its window's width is prerendered at the sizes the
// site names: a reader's first paint is the one made for a window like
// theirs, with no script, and the script hydrates that one. The words
// and the head of each page are the site's to give it.
test.describe("a site prerendered at more than one size", () => {
  test.describe.configure({ mode: "serial" });
  const shell = `import QtQuick\n\nItem {\n    id: root\n    property string route: "/"\n    width: parent ? parent.width : 0\n    height: parent ? parent.height : 0\n    Text { text: root.width < 600 ? "Narrow layout" : "Wide layout" }\n    Text { y: 40; text: "Window " + root.width }\n}\n`;
  let made;
  let server;
  let origin;

  test.beforeAll(shared("build the site and serve it", async () => {
    made = bundle("pages", (dir, written) => {
      writeFileSync(join(dir, "Shell.qml"), shell);
      written.files = written.files.map((file) => (file.path === "Shell.qml" ? { path: file.path, bytes: Buffer.byteLength(shell) } : file));
    });
    await part("build the site", () => buildSite({
      dir: made.dir,
      out: made.out,
      qmlc,
      head: `<link rel="icon" href="./mark.svg" type="image/svg+xml" />\n<link rel='apple-touch-icon' href='./touch.png' />`,
      prerender: {
        sizes: [
          { width: 390, height: 844 },
          { width: 1200, height: 800, from: 800 },
        ],
        pages: [
          { route: "/", title: "Home", description: "What a <home> says & shows", props: { route: "/" } },
          { route: "/docs/", title: "Docs", props: { route: "/docs/" } },
        ],
      },
    }));
    server = await part("serve it", () => serve(made.out));
    origin = server.origin;
  }));
  test.afterAll(shared("stop serving it and remove the bundle", async () => {
    await part("stop serving it", () => server?.stop());
    made?.remove();
  }));

  test("each page holds a render of each size, its description and the site's head", () => {
    const home = readFileSync(join(made.out, "index.html"), "utf8");
    const docs = readFileSync(join(made.out, "docs/index.html"), "utf8");
    expect(home).toContain("Narrow layout");
    expect(home).toContain("Wide layout");
    // The widest first, so a heading's address opened with script off on
    // a desktop finds the anchor in the render it shows.
    expect(home.indexOf("Wide layout")).toBeLessThan(home.indexOf("Narrow layout"));
    expect(home).toContain('<meta name="description" content="What a &lt;home&gt; says &amp; shows" />');
    expect(docs).not.toContain('name="description"');
    expect(home).toContain('<link rel="icon" href="./mark.svg"');
    // A nested page asks for what the head names from its own depth.
    expect(docs).toContain('<link rel="icon" href="../mark.svg"');
    expect(docs).toContain("<link rel='apple-touch-icon' href='../touch.png'");
    // Each size is shown up to where the next begins, and no gap is left
    // between them for a window whose width falls between two pixels.
    expect(home).toContain("@media (width < 800px)");
    expect(home).not.toMatch(/max-width: 799\.9/);
    // The script is asked for once the page is painted, not by the parser.
    for (const html of [home, docs]) {
      expect(html).not.toMatch(/<script type="module"/);
      expect(html).not.toMatch(/<link rel="modulepreload"/);
      expect(html).toMatch(/<script data-ljos-start="(\.\.\/|\.\/)assets\/[^"]+\.js"/);
    }
  });

  for (const [width, shown, hidden] of [
    [390, "Narrow layout", "Wide layout"],
    [1200, "Wide layout", "Narrow layout"],
  ]) {
    test(`a window ${width} wide is shown its own render with JavaScript off`, async ({ browser }) => {
      const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 800 } });
      try {
        const page = await context.newPage();
        await page.goto(`${origin}/`);
        await expect(page.getByText(shown, { exact: true })).toBeVisible();
        await expect(page.getByText(hidden, { exact: true })).toBeHidden();
      } finally {
        await context.close();
      }
    });
  }

  test("the page hydrates the render it shows, and then follows the window", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const page = await context.newPage();
      const told = [];
      page.on("console", (message) => ["warning", "error"].includes(message.type()) && told.push(message.text()));
      page.on("pageerror", (error) => told.push(error.message));
      // Hold the script back until the render shown is tagged, so that
      // only hydration could keep or replace it.
      let release;
      const held = new Promise((done) => (release = done));
      await page.route("**/*.js", async (route) => {
        await held;
        await route.continue();
      });
      await page.goto(`${origin}/docs/`, { waitUntil: "commit" });
      await page.waitForSelector('[data-ljos-render="0"] [data-hk]');
      await page.evaluate(() => document.querySelector('[data-ljos-render="0"]').setAttribute("data-tag", "shown"));
      release();
      await page.waitForSelector('#app[data-ljos-hydrated="true"]');
      await page.unroute("**/*.js");
      expect(told).toEqual([]);
      // The render that was shown is the one taken over; the other is gone.
      expect(await page.evaluate(() => [document.querySelectorAll('#app > [data-tag="shown"]').length, document.querySelectorAll("#app [data-ljos-render]").length])).toEqual([1, 0]);
      await expect(page.getByText("Narrow layout", { exact: true })).toBeVisible();
      await expect(page.getByText("Window 390", { exact: true })).toBeVisible();
      await page.setViewportSize({ width: 1200, height: 800 });
      await expect(page.getByText("Wide layout", { exact: true })).toBeVisible();
      await expect(page.getByText("Window 1200", { exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

// A page in the reader's colour scheme from its first paint: it is
// prerendered as a browser asking for each scheme would have it, the
// stylesheet shows the one asked for — the browser's, or the page's own
// where its root says one — and the script hydrates that one, in it.
test.describe("a site prerendered in both colour schemes", () => {
  test.describe.configure({ mode: "serial" });
  const shell = `import QtQuick\n\nRectangle {\n    id: root\n    property string route: "/"\n    readonly property bool dark: Application.styleHints.colorScheme === Qt.ColorScheme.Dark\n    width: parent ? parent.width : 0\n    height: parent ? parent.height : 0\n    color: dark ? "#101010" : "#fafafa"\n    Text { text: (root.dark ? "Dark" : "Light") + (root.width < 600 ? " narrow" : " wide") }\n}\n`;
  let made;
  let server;
  let origin;

  test.beforeAll(shared("build the site and serve it", async () => {
    made = bundle("pages", (dir, written) => {
      writeFileSync(join(dir, "Shell.qml"), shell);
      written.files = written.files.map((file) => (file.path === "Shell.qml" ? { path: file.path, bytes: Buffer.byteLength(shell) } : file));
    });
    await part("build the site", () => buildSite({
      dir: made.dir,
      out: made.out,
      qmlc,
      prerender: {
        sizes: [
          { width: 390, height: 844 },
          { width: 1200, height: 800, from: 800 },
        ],
        schemes: ["dark", "light"],
        pages: [{ route: "/", title: "Home", props: { route: "/" } }],
      },
    }));
    server = await part("serve it", () => serve(made.out));
    origin = server.origin;
  }));
  test.afterAll(shared("stop serving it and remove the bundle", async () => {
    await part("stop serving it", () => server?.stop());
    made?.remove();
  }));

  for (const [scheme, width, shown] of [
    ["light", 390, "Light narrow"],
    ["dark", 390, "Dark narrow"],
    ["light", 1200, "Light wide"],
    ["dark", 1200, "Dark wide"],
  ]) {
    test(`a browser asking for ${scheme} at ${width} is shown that render alone, with JavaScript off`, async ({ browser }) => {
      const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: scheme, viewport: { width, height: 800 } });
      try {
        const page = await context.newPage();
        await page.goto(`${origin}/`);
        for (const text of ["Light narrow", "Dark narrow", "Light wide", "Dark wide"]) {
          if (text === shown) await expect(page.getByText(text, { exact: true })).toBeVisible();
          else await expect(page.getByText(text, { exact: true })).toBeHidden();
        }
      } finally {
        await context.close();
      }
    });
  }

  for (const [asked, chosen] of [
    ["dark", "light"],
    ["light", "dark"],
  ]) {
    test(`the page's own ${chosen} wins over a browser asking for ${asked}, before and after it hydrates`, async ({ browser }) => {
      const context = await browser.newContext({ colorScheme: asked, viewport: { width: 390, height: 844 } });
      try {
        const page = await context.newPage();
        const told = [];
        page.on("pageerror", (error) => told.push(error.message));
        // What a page's own head script does with what its reader chose:
        // said on the root as the head is read, before the body.
        await page.route(`${origin}/`, async (route) => {
          const response = await route.fetch();
          const html = (await response.text()).replace("<head>", () => `<head><script>document.documentElement.setAttribute("data-ljos-scheme", "${chosen}")</script>`);
          await route.fulfill({ response, body: html });
        });
        let release;
        const held = new Promise((done) => (release = done));
        await page.route("**/*.js", async (route) => {
          await held;
          await route.continue();
        });
        await page.goto(`${origin}/`, { waitUntil: "commit" });
        const name = `${chosen === "dark" ? "Dark" : "Light"} narrow`;
        const other = `${chosen === "dark" ? "Light" : "Dark"} narrow`;
        await expect(page.getByText(name, { exact: true })).toBeVisible();
        await expect(page.getByText(other, { exact: true })).toBeHidden();
        release();
        await page.waitForSelector('#app[data-ljos-hydrated="true"]');
        await page.unroute("**/*.js");
        expect(told).toEqual([]);
        expect(await page.evaluate(() => document.querySelectorAll("#app [data-ljos-render]").length)).toBe(0);
        await expect(page.getByText(name, { exact: true })).toBeVisible();
        expect(await page.getByText(other, { exact: true }).count()).toBe(0);
      } finally {
        await context.close();
      }
    });
  }

  test("a scheme that is neither light nor dark, or one said twice, is refused before anything is built", async () => {
    const other = bundle("pages");
    try {
      const pages = [{ route: "/" }];
      await expect(buildSite({ dir: other.dir, out: other.out, qmlc, prerender: { pages, schemes: ["sepia"] } })).rejects.toThrow(/schemes/);
      await expect(buildSite({ dir: other.dir, out: other.out, qmlc, prerender: { pages, schemes: ["dark", "dark"] } })).rejects.toThrow(/schemes/);
      await expect(buildSite({ dir: other.dir, out: other.out, qmlc, prerender: { pages, schemes: [] } })).rejects.toThrow(/schemes/);
      expect(existsSync(join(other.out, "index.html"))).toBe(false);
    } finally {
      other.remove();
    }
  });
});

// A page whose schemes differ only in how they are drawn is one render
// per size: each colour that differs, and each item shown in one scheme
// only, said by the scheme shown, and what the page says in the dark
// said by its script before it hydrates. What a reader is first shown is
// the same as with a render per scheme, and the page carries half as much.
test.describe("a site whose schemes differ only in how they are drawn", () => {
  test.describe.configure({ mode: "serial" });
  const shell = `import QtQuick\nimport QtQuick.Shapes\n\nRectangle {\n    id: root\n    property string route: "/"\n    readonly property bool dark: Application.styleHints.colorScheme === Qt.ColorScheme.Dark\n    width: parent ? parent.width : 0\n    height: parent ? parent.height : 0\n    color: dark ? "#101010" : "#fafafa"\n    Text { objectName: "words"; text: root.width < 600 ? "Narrow" : "Wide"; color: root.dark ? "#eeeeee" : "#222222" }\n    Rectangle { objectName: "toggle"; y: 40; width: 20; height: 20; color: "#808080"; Accessible.role: Accessible.Button; Accessible.name: root.dark ? "Use the light theme" : "Use the dark theme"\n        Rectangle { objectName: "moon"; visible: root.dark; width: 10; height: 10; color: "#ffcc00" }\n    }\n    Shape { y: 80; width: 20; height: 20\n        ShapePath { fillColor: root.dark ? "#eeeeee" : "#222222"; strokeColor: root.dark ? "#ffcc00" : "#0055aa"; PathSvg { path: "M0 0L20 0L20 20Z" } }\n    }\n}\n`;
  let made;
  let server;
  let origin;

  test.beforeAll(shared("build the site and serve it", async () => {
    made = bundle("pages", (dir, written) => {
      writeFileSync(join(dir, "Shell.qml"), shell);
      written.files = written.files.map((file) => (file.path === "Shell.qml" ? { path: file.path, bytes: Buffer.byteLength(shell) } : file));
      written.imports = ["QtQuick", "QtQuick.Shapes"];
    });
    await part("build the site", () => buildSite({
      dir: made.dir,
      out: made.out,
      qmlc,
      prerender: {
        sizes: [
          { width: 390, height: 844 },
          { width: 1200, height: 800, from: 800 },
        ],
        schemes: ["light", "dark"],
        pages: [{ route: "/", title: "Home", props: { route: "/" } }],
      },
    }));
    server = await part("serve it", () => serve(made.out));
    origin = server.origin;
  }));
  test.afterAll(shared("stop serving it and remove the bundle", async () => {
    await part("stop serving it", () => server?.stop());
    made?.remove();
  }));

  test("the page holds one render per size, its colours named by scheme", () => {
    const home = readFileSync(join(made.out, "index.html"), "utf8");
    expect(home.match(/<div data-ljos-render="\d+">/g)).toEqual(['<div data-ljos-render="1">', '<div data-ljos-render="0">']);
    expect(home.match(/>Narrow</g)).toHaveLength(1);
    expect(home).toMatch(/var\(--ljos-scheme-\d+\)/);
    // Named once in the head, for light and for dark.
    expect(home).toMatch(/:root \{ --ljos-scheme-0: [^;]+;/);
    expect(home).toMatch(/:root\[data-ljos-scheme="dark"\] \{ --ljos-scheme-0: [^;]+;/);
    // The moon's showing is the scheme's; the toggle says the light
    // scheme's words, with the dark's beside them.
    expect(home).toMatch(/display: var\(--ljos-scheme-\d+\)/);
    expect(home.match(/aria-label="Use the dark theme" [^>]*data-ljos-dark="aria-label" data-ljos-dark-aria-label="Use the light theme"/g)).toHaveLength(2);
    expect(home).not.toMatch(/\saria-label="Use the light theme"/);
    // An icon's paint, an attribute of its own, is named as a style's
    // colour is.
    expect(home.match(/<path [^>]*fill="var\(--ljos-scheme-\d+\)"/g)).toHaveLength(2);
    expect(home.match(/<path [^>]*stroke="var\(--ljos-scheme-\d+\)"/g)).toHaveLength(2);
  });

  const moon = (page) => page.getByRole("button").first().evaluate((node) => [...node.querySelectorAll("div")].some((child) => child.getClientRects().length > 0 && getComputedStyle(child).display !== "none"));

  const words = (page) => page.getByText(/^(Narrow|Wide)$/).filter({ visible: true }).evaluate((node) => getComputedStyle(node).color);

  // Its fill and its stroke, each an attribute of its own named by scheme.
  const paint = (page) =>
    page.evaluate(() =>
      [...document.querySelectorAll("path")]
        .filter((path) => path.getClientRects().length > 0)
        .map((path) => ({ fill: getComputedStyle(path).fill, stroke: getComputedStyle(path).stroke })),
    );

  const LIGHT_STROKE = "rgb(0, 85, 170)";
  const DARK_STROKE = "rgb(255, 204, 0)";
  for (const [scheme, width, text, ink, stroke] of [
    ["light", 390, "Narrow", "rgb(34, 34, 34)", LIGHT_STROKE],
    ["dark", 390, "Narrow", "rgb(238, 238, 238)", DARK_STROKE],
    ["light", 1200, "Wide", "rgb(34, 34, 34)", LIGHT_STROKE],
    ["dark", 1200, "Wide", "rgb(238, 238, 238)", DARK_STROKE],
  ]) {
    test(`a browser asking for ${scheme} at ${width} is shown its colours, with JavaScript off`, async ({ browser }) => {
      const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: scheme, viewport: { width, height: 800 } });
      try {
        const page = await context.newPage();
        await page.goto(`${origin}/`);
        await expect(page.getByText(text, { exact: true }).filter({ visible: true })).toHaveCount(1);
        expect(await words(page)).toBe(ink);
        expect(await moon(page), "the moon is shown in the dark only").toBe(scheme === "dark");
        expect(await paint(page), "the shape is filled and stroked in its scheme's ink").toEqual([{ fill: ink, stroke }]);
      } finally {
        await context.close();
      }
    });
  }

  for (const [asked, chosen, ink, stroke] of [
    ["dark", "light", "rgb(34, 34, 34)", LIGHT_STROKE],
    ["light", "dark", "rgb(238, 238, 238)", DARK_STROKE],
  ]) {
    test(`the page's own ${chosen} wins over a browser asking for ${asked}, before and after it hydrates`, async ({ browser }) => {
      const context = await browser.newContext({ colorScheme: asked, viewport: { width: 390, height: 844 } });
      try {
        const page = await context.newPage();
        const told = [];
        page.on("console", (message) => ["warning", "error"].includes(message.type()) && told.push(message.text()));
        page.on("pageerror", (error) => told.push(error.message));
        await page.route(`${origin}/`, async (route) => {
          const response = await route.fetch();
          const html = (await response.text()).replace("<head>", () => `<head><script>document.documentElement.setAttribute("data-ljos-scheme", "${chosen}")</script>`);
          await route.fulfill({ response, body: html });
        });
        let release;
        const held = new Promise((done) => (release = done));
        await page.route("**/*.js", async (route) => {
          await held;
          await route.continue();
        });
        await page.goto(`${origin}/`, { waitUntil: "commit" });
        await expect(page.getByText("Narrow", { exact: true }).filter({ visible: true })).toHaveCount(1);
        expect(await words(page)).toBe(ink);
        expect(await moon(page)).toBe(chosen === "dark");
        expect(await paint(page)).toEqual([{ fill: ink, stroke }]);
        release();
        await page.waitForSelector('#app[data-ljos-hydrated="true"]');
        await page.unroute("**/*.js");
        expect(told).toEqual([]);
        expect(await page.evaluate(() => document.querySelectorAll("#app [data-ljos-render]").length)).toBe(0);
        // Hydrated, the colours are the page's own bindings', in the
        // scheme its root says, and no longer the head's names for them.
        await expect.poll(() => words(page)).toBe(ink);
        await expect.poll(() => paint(page)).toEqual([{ fill: ink, stroke }]);
        expect(await page.evaluate(() => document.querySelector("#app").innerHTML.includes("var(--ljos-scheme-"))).toBe(false);
        // Said in the scheme shown, and nothing of the other left.
        await expect(page.getByRole("button", { name: chosen === "dark" ? "Use the light theme" : "Use the dark theme" })).toHaveCount(1);
        expect(await page.evaluate(() => document.querySelectorAll("#app [data-ljos-dark]").length)).toBe(0);
        expect(await moon(page)).toBe(chosen === "dark");
      } finally {
        await context.close();
      }
    });
  }
});

test("sizes that are not narrowest first, or beside a width, are refused before anything is built", async () => {
  const made = bundle("pages");
  try {
    const pages = [{ route: "/" }];
    await expect(buildSite({ dir: made.dir, out: made.out, qmlc, prerender: { pages, sizes: [{ width: 1200, height: 800 }, { width: 390, height: 844 }] } })).rejects.toThrow(/narrowest first/);
    await expect(buildSite({ dir: made.dir, out: made.out, qmlc, prerender: { pages, width: 390, sizes: [{ width: 390, height: 844 }] } })).rejects.toThrow(/not both/);
    await expect(buildSite({ dir: made.dir, out: made.out, qmlc, prerender: { pages, sizes: [{ width: 390 }] } })).rejects.toThrow(/no width or height/);
    await expect(buildSite({ dir: made.dir, out: made.out, qmlc, prerender: { pages: [{ route: "/", description: 3 }] } })).rejects.toThrow(/description/);
    expect(existsSync(join(made.out, "index.html"))).toBe(false);
  } finally {
    made.remove();
  }
});

// A prerendered site: the build writes every page's HTML with the page's
// own text, links and structure in it, so the page reads with no script
// at all; with script, hydration takes those very nodes over rather
// than making the page again, and the page then behaves as it always
// did. Both kernels are built the same way and must give the same page.
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { expect, test } from "@playwright/test";
import { buildSite } from "../site.js";
import { bundle, design, qmlc } from "./bundle.js";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".wasm": "application/wasm" };

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
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done(server)));
}

for (const kernel of ["solid", "wasm"]) {
  test.describe(`a prerendered site on the ${kernel} kernel`, () => {
    test.describe.configure({ mode: "serial" });
    let made;
    let server;
    let origin;

    test.beforeAll(async () => {
      if (kernel === "wasm" && !existsSync(join(import.meta.dirname, "../kernel/ljos_web_kernel.wasm"))) {
        throw new Error("no wasm kernel beside the runtime: build it (`mise run build:kernel`)");
      }
      made = bundle("prerender");
      const was = process.env.LJOS_KERNEL;
      process.env.LJOS_KERNEL = kernel;
      try {
        await buildSite({ dir: made.dir, out: made.out, qmlc, prerender: true });
      } finally {
        if (was === undefined) delete process.env.LJOS_KERNEL;
        else process.env.LJOS_KERNEL = was;
      }
      server = await serve(made.out);
      origin = `http://127.0.0.1:${server.address().port}`;
    });
    test.afterAll(async () => {
      await new Promise((done) => server?.close(done));
      made?.remove();
    });

    test("the HTML the build wrote holds the page's text, link and count", () => {
      const html = readFileSync(join(made.out, "index.html"), "utf8");
      expect(html).toContain("Prerendered heading");
      expect(html).toContain("Static text a crawler reads.");
      expect(html).toContain("Read the docs");
      expect(html).toContain("https://example.com/docs");
      expect(html).toContain("Count 0");
      expect(html).toContain("Increment");
      // What the page logged as it was made is the build's to hear,
      // not the reader's: it is not in the page, as text or as markup.
      expect(html).not.toContain("a page logging");
    });

    test("reads with JavaScript off: text, link and structure are the page's", async ({ browser }) => {
      const context = await browser.newContext({ javaScriptEnabled: false });
      try {
        const page = await context.newPage();
        await page.goto(`${origin}/`);
        await expect(page.getByText("Prerendered heading", { exact: true })).toBeVisible();
        await expect(page.getByText("Static text a crawler reads.", { exact: true })).toBeVisible();
        await expect(page.getByText("Count 0", { exact: true })).toBeVisible();
        await expect(page.getByText("Increment", { exact: true })).toBeVisible();
        const link = page.getByText("Read the docs", { exact: true });
        await expect(link).toBeVisible();
        // The link is a link in the markup, not a script's promise of one.
        const href = await link.evaluate((element) => element.closest("[data-link]")?.dataset.link ?? element.closest("a")?.getAttribute("href"));
        expect(href).toBe("https://example.com/docs");
        // Structure, not a flat string: the heading and the button's words
        // are in different elements under #app.
        expect(await page.locator("#app *").count()).toBeGreaterThan(5);
      } finally {
        await context.close();
      }
    });

    test("rich text's lines prerender as tall as the browser draws them, coloured by class", async ({ browser, page }) => {
      const code = (on) => on.getByText("a third line");
      const height = (on) => code(on).evaluate((words) => words.parentElement.getBoundingClientRect().height);
      const context = await browser.newContext({ javaScriptEnabled: false });
      let written;
      try {
        const still = await context.newPage();
        await still.goto(`${origin}/`);
        written = await height(still);
        expect(await code(still).locator(".tok-keyword").count()).toBe(1);
      } finally {
        await context.close();
      }
      await page.goto(`${origin}/`);
      await page.waitForSelector('#app[data-ljos-hydrated="true"]');
      // Three lines, as the build wrote them and as the browser sets
      // them: nothing below moves when the page hydrates.
      expect(written).toBe(54);
      expect(await height(page)).toBe(written);
      expect(await code(page).locator(".tok-keyword").count()).toBe(1);
    });

    test("rich text's blocks are lines of their own in the prerender, though the text does not wrap", async ({ browser, page }) => {
      const placed = async (on) => {
        const block = await on.getByText("a block below it", { exact: true }).boundingBox();
        const under = await on.getByText("Under the blocks", { exact: true }).boundingBox();
        return under.y - (block.y + block.height);
      };
      const context = await browser.newContext({ javaScriptEnabled: false });
      let written;
      try {
        const still = await context.newPage();
        await still.goto(`${origin}/`);
        written = await placed(still);
      } finally {
        await context.close();
      }
      // The text under the blocks starts below the second, not on it,
      // and as far below as the hydrated page puts it. (Where the blocks
      // are is not compared: plain text above them is measured by an
      // estimate on the server.)
      expect(written).toBeGreaterThanOrEqual(0);
      await page.goto(`${origin}/`);
      await page.waitForSelector('#app[data-ljos-hydrated="true"]');
      expect(await placed(page)).toBe(written);
    });

    test("what the page changed as it settled is in the page as written: a Repeater's rows, placed", async ({ browser }) => {
      const context = await browser.newContext({ javaScriptEnabled: false });
      try {
        const still = await context.newPage();
        await still.goto(`${origin}/`);
        const first = still.getByText("A first row", { exact: true });
        const second = still.getByText("A second row", { exact: true });
        await expect(first).toBeVisible();
        await expect(second).toBeVisible();
        const [above, below] = [await first.boundingBox(), await second.boundingBox()];
        expect(below.y).toBeGreaterThanOrEqual(above.y + above.height);
      } finally {
        await context.close();
      }
    });

    test("hydration adopts the prerendered nodes, and the counter then counts", async ({ page }) => {
      const warnings = [];
      page.on("console", (message) => {
        if (["warning", "error"].includes(message.type())) warnings.push(message.text());
      });
      page.on("pageerror", (error) => warnings.push(error.message));
      // Hold the page's script back until the prerendered nodes are tagged,
      // so that only hydration could keep or replace them.
      let release;
      const held = new Promise((done) => (release = done));
      await page.route("**/*.js", async (route) => {
        await held;
        await route.continue();
      });
      await page.goto(`${origin}/`, { waitUntil: "commit" });
      await page.waitForSelector("#app [data-hk]");
      const tagged = await page.evaluate(() => {
        window.__prerendered = [...document.querySelectorAll("#app [data-hk]")];
        for (const element of window.__prerendered) element.setAttribute("data-tag", "kept");
        return window.__prerendered.length;
      });
      expect(tagged).toBeGreaterThan(5);
      release();
      await page.waitForSelector('#app[data-ljos-hydrated="true"]');
      await page.unroute("**/*.js");
      const kept = await page.evaluate(() => ({
        same: window.__prerendered.filter((element) => document.contains(element) && element.getAttribute("data-tag") === "kept").length,
        total: window.__prerendered.length,
        // The heading the reader sees is the node that was tagged.
        heading: document.querySelector("#app")?.textContent.includes("Prerendered heading"),
      }));
      expect(kept.same).toBe(kept.total);
      expect(kept.heading).toBe(true);
      expect(warnings.filter((text) => /hydrat/i.test(text))).toEqual([]);
      expect(warnings).toEqual([]);
      // The MouseArea over the words is what takes the click, as a
      // reader's press lands on it: press there, not on the text.
      const box = await page.getByText("Increment", { exact: true }).boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(page.getByText("Count 1", { exact: true })).toBeVisible();
      // Still the same nodes after the page has reacted.
      expect(await page.evaluate(() => window.__prerendered.every((element) => document.contains(element)))).toBe(true);
    });

    test("a page that was not made as it was prerendered is made again from where they part", async ({ page }) => {
      const warnings = [];
      page.on("console", (message) => {
        if (message.type() === "warning") warnings.push(message.text());
      });
      let release;
      const held = new Promise((done) => (release = done));
      await page.route("**/*.js", async (route) => {
        await held;
        await route.continue();
      });
      await page.goto(`${origin}/`, { waitUntil: "commit" });
      await page.waitForSelector("#app [data-hk]");
      // The third element the page makes (a text's face, a div) is a
      // span in what was prerendered: from there the makings have
      // parted, and no later number names the same making.
      const before = await page.evaluate(() => {
        window.__prerendered = [...document.querySelectorAll("#app [data-hk]")];
        const third = document.querySelector('[data-hk^="3:"]');
        const other = document.createElement("span");
        other.setAttribute("data-hk", third.getAttribute("data-hk"));
        other.replaceChildren(...third.childNodes);
        third.replaceWith(other);
        return window.__prerendered.length;
      });
      expect(before).toBeGreaterThan(5);
      release();
      await page.waitForSelector('#app[data-ljos-hydrated="true"]');
      await page.unroute("**/*.js");
      expect(warnings.filter((text) => /hydration mismatch/.test(text))).toHaveLength(1);
      const heldNodes = await page.evaluate(() => ({
        // The two makings before the parting were taken over; the
        // span and everything after it was not, and is gone.
        kept: window.__prerendered.filter((element) => document.contains(element)).length,
        span: document.querySelector("#app span[data-hk]") !== null,
      }));
      expect(heldNodes.kept).toBe(2);
      expect(heldNodes.span).toBe(false);
      // And the page made again is the page, whole and working.
      await expect(page.getByText("Prerendered heading", { exact: true })).toBeVisible();
      const box = await page.getByText("Increment", { exact: true }).boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(page.getByText("Count 1", { exact: true })).toBeVisible();
    });

    test("an element more in the prerender than the page makes is told of, though every tag is a div", async ({ page }) => {
      const warnings = [];
      page.on("console", (message) => {
        if (message.type() === "warning") warnings.push(message.text());
      });
      let release;
      const held = new Promise((done) => (release = done));
      await page.route("**/*.js", async (route) => {
        await held;
        await route.continue();
      });
      await page.goto(`${origin}/`, { waitUntil: "commit" });
      await page.waitForSelector("#app [data-hk]");
      // One element more was made when the page was prerendered than
      // this making makes (a row the visitor's own store would add,
      // a line only the server's measure wraps): put its copy in at
      // the fifth making and move every later key up one, as such a
      // prerender's keys would read.
      await page.evaluate(() => {
        window.__prerendered = [...document.querySelectorAll("#app [data-hk]")];
        for (const element of window.__prerendered) element.dataset.orig = element.getAttribute("data-hk").split(":")[0];
        const fifth = document.querySelector('[data-hk^="5:"]');
        const extra = fifth.cloneNode(true);
        for (const element of window.__prerendered) {
          const said = element.getAttribute("data-hk");
          const at = said.indexOf(":");
          if (Number(said.slice(0, at)) >= 5) element.setAttribute("data-hk", `${Number(said.slice(0, at)) + 1}${said.slice(at)}`);
        }
        fifth.before(extra);
      });
      release();
      await page.waitForSelector('#app[data-ljos-hydrated="true"]');
      await page.unroute("**/*.js");
      // The counts part where a Rectangle's element is asked for and a
      // Text's is what the key holds — the warning says which, since
      // every tag here is a div and a leftover left alone would warn
      // once too: this is the type check speaking, not the fallback.
      const told = warnings.filter((text) => /hydration mismatch/.test(text));
      expect(told).toHaveLength(1);
      expect(told[0]).toMatch(/an element for Rectangle where the prerendered page has one for Text/);
      // The makings before the parting (1–4, and the Text ones the
      // shift still names rightly, the old 5–8 as 6–9) were taken
      // over; from the Rectangle on, nothing was: its prerendered
      // node and every one after it are gone. Without the type in
      // the key they would all have been adopted shifted, and only
      // the last left over.
      expect(await page.evaluate(() => window.__prerendered.filter((element) => document.contains(element)).map((element) => element.dataset.orig))).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
      await expect(page.getByText("Prerendered heading", { exact: true })).toBeVisible();
      const box = await page.getByText("Increment", { exact: true }).boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(page.getByText("Count 1", { exact: true })).toBeVisible();
    });
  });
}

// The bundle the site builder's other tests build: its own module, a
// design module's colours, a picture, a theme. Prerendering is of any
// site, not of the fixture above.
test("the project bundle prerenders too, and hydrates in its design colour", async ({ browser, page }) => {
  const made = bundle("project");
  let server;
  try {
    await buildSite({ dir: made.dir, out: made.out, qmlc, with: [design], prerender: true });
    expect(readFileSync(join(made.out, "index.html"), "utf8")).toContain("Stopped");
    server = await serve(made.out);
    const origin = `http://127.0.0.1:${server.address().port}`;
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const still = await context.newPage();
      await still.goto(`${origin}/`);
      await expect(still.getByText("Stopped", { exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
    await page.goto(`${origin}/`);
    await page.waitForSelector('#app[data-ljos-hydrated="true"]');
    const text = page.getByText("Stopped", { exact: true });
    await expect(text).toBeVisible();
    expect(await text.evaluate((element) => getComputedStyle(element).color)).toBe("rgb(18, 52, 86)");
  } finally {
    await new Promise((done) => server?.close(done));
    made.remove();
  }
});

test("a site built without prerender keeps its empty page and mounts as before", async ({ page }) => {
  const made = bundle("prerender");
  const server = await buildSite({ dir: made.dir, out: made.out, qmlc }).then(() => serve(made.out));
  try {
    expect(readFileSync(join(made.out, "index.html"), "utf8")).not.toContain("Prerendered heading");
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await expect(page.getByText("Prerendered heading", { exact: true })).toBeVisible();
  } finally {
    await new Promise((done) => server.close(done));
    made.remove();
  }
});

test("a page with faces that paint prerenders as the elements they paint into", async ({ page }) => {
  // A View3D and a ShaderEffect draw into an offscreen surface
  // first; where there is no GPU that must not take the build
  // with it — the elements stand in the HTML, and the words do.
  const made = bundle("prerender-gpu");
  const server = await buildSite({ dir: made.dir, out: made.out, qmlc, prerender: true }).then(() => serve(made.out));
  try {
    const html = readFileSync(join(made.out, "index.html"), "utf8");
    expect(html).toContain("GPU faces prerendered");
    expect(html).toContain("Words beside what paints.");
    expect(html).toContain("<canvas");
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForSelector('#app[data-ljos-hydrated="true"]');
    await expect(page.getByText("GPU faces prerendered", { exact: true })).toBeVisible();
  } finally {
    await new Promise((done) => server.close(done));
    made.remove();
  }
});

// ljos.dev's design system, held to what it promises: every colour read
// against another meets WCAG AA in both schemes, the page's head says
// the very colours the app draws with, every page has what a reader and
// a crawler need before any script runs, the first paint does not move
// when the page comes to life, and what a reader picks is kept.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const bundle = join(here, "../bundle");

// bundle/tokens.js is a QML library script: its two tables, read as
// the build reads them.
const tokens = (() => {
  const source = readFileSync(join(bundle, "tokens.js"), "utf8").replace(/^\.pragma library$/m, "");
  return new Function(`${source}\nreturn { light, dark };`)();
})();

// WCAG 2.2's relative luminance and contrast ratio, of #rrggbb.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

// What is read on what. Text is held to 4.5:1; a control's edge and
// the focus ring, which are not text, to 3:1.
const GROUNDS = ["canvas", "surface", "surfaceRaised", "surfaceHover", "surfacePressed", "surfaceSelected"];
function pairs(tone) {
  const all = [];
  for (const fg of ["text", "textMuted", "link", "danger"]) for (const bg of GROUNDS) all.push([fg, bg, tone[fg], tone[bg], 4.5]);
  for (const bg of ["accent", "accentHover", "accentPressed"]) all.push(["textOnAccent", bg, tone.textOnAccent, tone[bg], 4.5]);
  for (const bg of ["canvas", "surface", "surfaceRaised"]) {
    all.push(["border", bg, tone.border, tone[bg], 3]);
    all.push(["focus", bg, tone.focus, tone[bg], 3]);
  }
  for (const [tag, colour] of Object.entries(tone.code)) {
    if (tag === "bg" || tag === "selection") continue;
    all.push([`code ${tag}`, "code bg", colour, tone.code.bg, 4.5]);
  }
  all.push(["code fg", "code selection", tone.code.fg, tone.code.selection, 4.5]);
  return all;
}

for (const scheme of ["light", "dark"]) {
  test(`every colour read on another meets WCAG AA in ${scheme}`, () => {
    const short = pairs(tokens[scheme])
      .map(([fg, bg, a, b, least]) => ({ pair: `${fg} on ${bg}`, ratio: Math.round(contrast(a, b) * 100) / 100, least }))
      .filter(({ ratio, least }) => ratio < least);
    expect(short).toEqual([]);
  });
}

// Every tag the code blocks' highlighter names (`.tok-<tag>`) has a
// colour in both schemes, and so do the parts of a code block around it.
const CODE_TAGS = ["keyword", "string", "number", "bool", "null", "regexp", "comment", "typeName", "propertyName", "variableName", "function", "operator", "punctuation", "meta", "invalid", "topic"];
const CODE_PARTS = ["bg", "fg", "selection", "gutter", "diagnostic-error", "diagnostic-warning"];

test("the code theme colours every tag and every part of a code block, in both schemes", () => {
  for (const scheme of ["light", "dark"]) {
    expect(Object.keys(tokens[scheme].code).sort(), scheme).toEqual([...CODE_TAGS, ...CODE_PARTS].sort());
  }
});

test("the page's head says tokens.js's colours, for both schemes and for the reader's pick", async ({ request }) => {
  const html = await (await request.get("/")).text();
  const head = html.slice(0, html.indexOf("</head>"));
  const light = head.match(/:root \{([^}]*)\}/)[1];
  const asked = head.match(/@media \(prefers-color-scheme: dark\) \{ :root:not\(\[data-ljos-scheme="light"\]\) \{([^}]*)\}/)[1];
  const picked = head.match(/:root\[data-ljos-scheme="dark"\] \{([^}]*)\}/)[1];
  const said = (block, name) => block.match(new RegExp(`--${name}: (#[0-9a-f]+);`))?.[1];
  for (const [block, tone] of [
    [light, tokens.light],
    [asked, tokens.dark],
    [picked, tokens.dark],
  ]) {
    expect(said(block, "ljos-canvas")).toBe(tone.canvas);
    expect(said(block, "ljos-text")).toBe(tone.text);
    expect(said(block, "ljos-text-muted")).toBe(tone.textMuted);
    expect(said(block, "ljos-focus")).toBe(tone.focus);
    expect(said(block, "ljos-codeblock-border")).toBe(tone.divider);
    for (const [tag, colour] of Object.entries(tone.code)) expect(said(block, `ljos-code-${tag}`), tag).toBe(colour);
  }
  for (const tag of CODE_TAGS) expect(head).toContain(`.tok-${tag} { color: var(--ljos-code-${tag})`);
});

// What every page has before any script runs: a language, a title and
// a description of its own, a viewport, the site's icon and colours,
// and exactly one render shown — the one for the reader's window.
const PAGES = ["/", "/demos/", "/start/", "/start/mcp/"];
for (const route of PAGES) {
  test(`${route} has a reader's and a crawler's basics, with no script`, async ({ browser }) => {
    for (const [width, scheme] of [
      [390, "light"],
      [1440, "dark"],
    ]) {
      const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 900 }, colorScheme: scheme });
      try {
        const page = await context.newPage();
        const response = await page.goto(route);
        expect(response.ok()).toBe(true);
        const basics = await page.evaluate(() => ({
          lang: document.documentElement.lang,
          title: document.title,
          description: document.querySelector('meta[name="description"]')?.content ?? "",
          viewport: document.querySelector('meta[name="viewport"]')?.content ?? "",
          icon: document.querySelector('link[rel="icon"]')?.getAttribute("href") ?? "",
          themeColor: document.querySelectorAll('meta[name="theme-color"]').length,
          colorScheme: document.querySelector('meta[name="color-scheme"]')?.content ?? "",
          shown: [...document.querySelectorAll("[data-ljos-render]")].filter((render) => getComputedStyle(render).display !== "none").length,
          ground: getComputedStyle(document.body).backgroundColor,
          unnamedImages: [...document.querySelectorAll("img")].filter((img) => !img.hasAttribute("alt")).length,
          links: document.querySelectorAll("a[href]").length,
        }));
        expect(basics.lang).toBe("en");
        expect(basics.title).toMatch(/Ljós/);
        expect(basics.description.length, `${route}'s description`).toBeGreaterThan(40);
        expect(basics.description.length, `${route}'s description`).toBeLessThanOrEqual(200);
        expect(basics.viewport).toContain("width=device-width");
        expect(basics.icon).toMatch(/favicon\.svg$/);
        expect(basics.themeColor).toBe(2);
        expect(basics.colorScheme).toBe("light dark");
        expect(basics.shown, `one render shown at ${width} in ${scheme}`).toBe(1);
        expect(basics.ground).toBe(scheme === "dark" ? "rgb(12, 12, 12)" : "rgb(249, 249, 248)");
        expect(basics.unnamedImages).toBe(0);
        expect(basics.links).toBeGreaterThan(3);
        // The icon and the picture a shared link shows are there.
        for (const name of ["favicon.svg", "apple-touch-icon.png", "og-image.png"]) expect((await page.request.get(`/${name}`)).ok(), name).toBe(true);
      } finally {
        await context.close();
      }
    }
  });
}

// The pictures stand in the page as written: the mark in the header and
// the footer, and each demo's picture, drawn before any script runs and
// where none ever does, at the size the page gives them.
for (const [route, demos] of [
  ["/", 1],
  ["/demos/", 4],
]) {
  test(`${route}'s mark and demo pictures are drawn with no script`, async ({ browser }) => {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 900 } });
      try {
        const page = await context.newPage();
        await page.goto(route);
        // Every picture of the render shown, once each has loaded.
        await page.waitForFunction(() => [...document.images].every((img) => img.complete));
        const drawn = await page.evaluate(() =>
          [...document.images]
            // Seen: laid out, and neither hidden nor see-through.
            .filter((img) => img.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
            .map((img) => {
              const box = img.getBoundingClientRect();
              return { file: img.src.split("/").pop(), loaded: img.naturalWidth > 0, width: Math.round(box.width), height: Math.round(box.height) };
            }),
        );
        const marks = drawn.filter(({ file }) => file === "favicon.svg");
        expect(marks, `the header's mark and the footer's at ${width}`).toEqual([
          { file: "favicon.svg", loaded: true, width: 28, height: 28 },
          { file: "favicon.svg", loaded: true, width: 20, height: 20 },
        ]);
        const pictures = drawn.filter(({ file }) => /^demo-.*\.webp$/.test(file));
        expect(pictures.length, `the demo pictures at ${width}`).toBe(demos);
        for (const picture of pictures) {
          expect(picture.loaded, picture.file).toBe(true);
          // Its frame's shape (420 by 720), inside the frame's edge.
          expect(Math.abs(picture.height - Math.round(((picture.width + 2) * 420) / 720) + 2), picture.file).toBeLessThanOrEqual(1);
          expect(picture.width, picture.file).toBeGreaterThan(300);
        }
      } finally {
        await context.close();
      }
    }
  });
}

// The first paint is the page: nothing moves as the script takes it
// over, as a demo comes, or as pictures load.
for (const route of ["/", "/demos/", "/start/first-app/"]) {
  for (const width of [390, 1440]) {
    test(`${route} at ${width} does not shift as it comes to life`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: width < 800 ? 844 : 900 } });
      try {
        const page = await context.newPage();
        await page.addInitScript(() => {
          globalThis.__shifts = [];
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) if (!entry.hadRecentInput) globalThis.__shifts.push(entry.value);
          }).observe({ type: "layout-shift", buffered: true });
        });
        await page.goto(route);
        await page.waitForSelector('#app[data-ljos-hydrated="true"]');
        await page.waitForTimeout(1500);
        const shifted = await page.evaluate(() => globalThis.__shifts.reduce((sum, value) => sum + value, 0));
        expect(shifted).toBeLessThan(0.01);
      } finally {
        await context.close();
      }
    });
  }
}

test("the reader's pick of light or dark is kept, and is the first paint next time", async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: "light", viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto("/start/");
    await page.waitForSelector('#app[data-ljos-hydrated="true"]');
    await page.getByRole("button", { name: "Use the dark theme" }).click();
    await expect(page.getByRole("button", { name: "Use the light theme" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.dataset.ljosScheme)).toBe("dark");
    // The next page is dark before its script is asked for.
    await page.route("**/*.js", (route) => route.abort());
    await page.goto("/start/mcp/");
    expect(await page.evaluate(() => [document.documentElement.dataset.ljosScheme, getComputedStyle(document.body).backgroundColor])).toEqual(["dark", "rgb(12, 12, 12)"]);
    await expect(page.getByText("Use the light theme", { exact: true })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("on a phone the menu holds the docs, and search finds a page", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await page.waitForSelector('#app[data-ljos-hydrated="true"]');
    await page.getByRole("button", { name: "Open the menu" }).click();
    await expect(page.getByRole("button", { name: "Close the menu" })).toBeVisible();
    const search = page.getByRole("textbox", { name: "Search the docs" });
    await search.click();
    await page.keyboard.type("mcp servers");
    await expect(page.getByRole("list", { name: "Search results" }).getByText("MCP Servers for Agents", { exact: true })).toBeVisible();
    await page.keyboard.press("Enter");
    await page.waitForURL("**/start/mcp/");
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("a browser with no WebGPU keeps each GPU demo's picture, and says why", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      delete Navigator.prototype.gpu;
    });
    const shown = page.waitForResponse((response) => response.url().endsWith("/pictures/demo-orbit.webp") && response.ok());
    await page.goto("/demos/");
    await page.waitForSelector('#app[data-ljos-hydrated="true"]');
    // The picture, named for what it shows, stands where the 3D scene
    // would, with the reason beside it.
    const picture = page.getByRole("img", { name: /^A lit 3D scene/ }).first();
    await picture.scrollIntoViewIfNeeded();
    await expect(picture).toBeVisible();
    await shown;
    await expect(page.getByText(/A picture of the demo: it runs in a browser with WebGPU/).first()).toBeVisible();
  } finally {
    await context.close();
  }
});

// The box of the one match the reader is shown, or null.
const shownBox = (locator) => async () => {
  const shown = locator.filter({ visible: true });
  return (await shown.count()) ? shown.first().boundingBox() : null;
};

// The Pantry is a 480-wide app as its shell is written; on a phone it
// is shown whole, smaller, not cut off at the page's edge.
test("on a phone the Pantry stands whole inside the page", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.goto("/demos/");
    await page.waitForSelector('#app[data-ljos-hydrated="true"]');
    // The Pantry's own shell, once it is made in the page.
    const jam = shownBox(page.getByText(/^Jam · £/));
    const tea = shownBox(page.getByText(/^Tea · £/));
    await expect.poll(async () => (await jam()) !== null, { timeout: 30_000 }).toBe(true);
    expect((await tea()).x).toBeGreaterThanOrEqual(20);
    expect((await jam()).x + (await jam()).width).toBeLessThanOrEqual(370);
  } finally {
    await context.close();
  }
});

// A live example may be a whole ApplicationWindow: it runs in its
// block, where its picture stood, never floating over the page's top.
test("a live example that is a window stands in its block, not over the page", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto("/quality/color/");
    await page.waitForSelector('#app[data-ljos-hydrated="true"]');
    const top = () =>
      page.evaluate(() => {
        const held = [...document.querySelectorAll(".qq-window")].find((window) => !window.querySelector(".qq-window") && /Delete draft/.test(window.textContent));
        return held ? Math.round(held.getBoundingClientRect().top) : null;
      });
    // Far down the page, which has not been scrolled.
    await expect.poll(top, { timeout: 30_000 }).toBeGreaterThan(900);
  } finally {
    await context.close();
  }
});

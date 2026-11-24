// The site in the reader's language: the catalogues in bundle/i18n (one
// per language, read by the runtime's own parser), the picker in the
// header, and what a page does in a language: it changes where the
// reader is, without a reload, is laid out from the right in Arabic, and
// stays as the reader moves through the site.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const i18n = join(here, "../bundle/i18n");
const base = (process.env.LJOS_SITE_BASE ?? "/").replace(/\/?$/, "/");
const at = (route) => `${base}${route.replace(/^\//, "")}`;
const HYDRATED = '#app[data-ljos-hydrated="true"]';
const KEY = "ljos.dev:language";
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const HEADLINE = "Software you can reshape while it runs.";

// The runtime's catalogues, as the page reads them. Its module reads
// the browser's scheme as it loads, which Node has none of.
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
const { checkCatalog, readPo } = await import("ljos-web/Ljos/Core");

const catalogues = readdirSync(i18n)
  .filter((name) => name.endsWith(".po"))
  .sort()
  .map((name) => ({ name, tag: name.slice(0, -3), text: readFileSync(join(i18n, name), "utf8") }));
// The template's messages, as `context\u0004message` like a catalogue's
// keys. A catalogue's reader leaves out what is not translated, which is
// everything in a template, so it is read here as PO writes it.
const template = (() => {
  const text = (lines) => lines.map((line) => JSON.parse(line.replace(/^(msgctxt|msgid)\s+/u, ""))).join("");
  const keys = [];
  for (const block of readFileSync(join(i18n, "messages.pot"), "utf8").split(/\n\s*\n/u)) {
    const lines = block.split("\n").filter((line) => !line.startsWith("#"));
    const field = (name) => {
      const at = lines.findIndex((line) => line.startsWith(`${name} `));
      if (at < 0) return undefined;
      const end = lines.findIndex((line, n) => n > at && !line.startsWith('"'));
      return text(lines.slice(at, end < 0 ? undefined : end));
    };
    const id = field("msgid");
    if (id) keys.push(`${field("msgctxt") ?? ""}\u0004${id}`);
  }
  return keys;
})();
const translated = (tag, message) => readPo(catalogues.find((one) => one.tag === tag).text, `${tag}.po`).messages.get(`\u0004${message}`)?.translation;

// What is never translated: the names of things (TRANSLATE.md's list).
const NAMES = ["Ljós", "QML", "TypeScript", "JavaScript", "MCP", "Qt Quick", "WebAssembly", "WebGPU", "WebGL", "glTF", "egui", "Rust", "GitHub", "Lottie", "Svala GT", "Kestrel"];
const tags = (text) => [...text.matchAll(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gu)].map(([, name]) => name).sort();

test.describe("the catalogues", () => {
  test("the template has the site's messages", () => {
    expect(template.length).toBeGreaterThan(500);
    expect(template).toContain(`\u0004${HEADLINE}`);
  });

  test("the site's languages are the catalogues there are", () => {
    const preferences = readFileSync(join(here, "../bundle/Site/Preferences.qml"), "utf8");
    const listed = [...preferences.matchAll(/\{ tag: "([^"]+)", name:/gu)].map(([, tag]) => tag);
    expect(listed.filter((tag) => tag !== "en").sort()).toEqual(catalogues.map(({ tag }) => tag));
  });

  for (const { name, tag, text } of catalogues) {
    test(`${name} is read as the page reads it, and fits its messages`, () => {
      expect(readPo(text, name).language).toBe(tag);
      expect(checkCatalog(text, name)).toEqual([]);
    });

    test(`${name} translates every message, keeps the names of things and the markup`, () => {
      const catalogue = readPo(text, name).messages;
      const missing = [];
      const changed = [];
      for (const key of template) {
        const message = key.slice(key.indexOf("\u0004") + 1);
        const entry = catalogue.get(key);
        if (!entry?.translation) {
          missing.push(message);
          continue;
        }
        for (const thing of NAMES) {
          const count = (s) => s.split(thing).length - 1;
          if (count(entry.translation) < count(message)) changed.push(`${message}: ${thing}`);
        }
        if (tags(entry.translation).join(" ") !== tags(message).join(" ")) changed.push(`${message}: its markup`);
      }
      expect({ missing, changed }).toEqual({ missing: [], changed: [] });
    });
  }
});

// Every error the page says, to be none.
function listen(page) {
  const said = [];
  page.on("pageerror", (error) => said.push(`pageerror: ${error.message}`));
  page.on("console", (message) => message.type() === "error" && said.push(`error: ${message.text()}`));
  return said;
}

async function open(page, route) {
  await page.goto(at(route));
  await page.waitForSelector(HYDRATED, { timeout: 40_000 });
}

const language = (page) => page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir }));
// The page's heading, in whatever language: where a line breaks in a
// text written with no spaces (Chinese, Japanese), the accessibility
// tree has one, so a break may stand between any two letters.
const headline = (page, text) =>
  page.getByRole("heading", {
    level: 1,
    name: new RegExp(`^${[...text].map((it) => it.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("\\s?")}$`, "u"),
  });

// The one a reader sees: a phone's page keeps the wide header's
// controls, hidden, beside its menu's.
const visible = (locator) => locator.filter({ visible: true }).first();

const ringed = (item) => item.evaluate((node) => /inset/u.test(node.style.boxShadow));

// Presses `key` until `item` has the keyboard.
async function press(page, key, item) {
  for (let n = 0; n < 40 && !(await ringed(item)); n++) {
    await page.keyboard.press(key);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  }
  expect(await ringed(item), `${key} comes to it`).toBe(true);
}

async function pick(page, name) {
  await visible(page.getByRole("button", { name: /^[A-Z]+ · [^:]+: (English|Español|简体中文|हिन्दी|العربية|Português \(Brasil\)|Français|Deutsch|日本語|Русский|Íslenska)$/u })).click();
  await page.getByRole("radio", { name, exact: true }).click();
}

test.describe("a page in the reader's language", () => {
  test("picking a language changes the page where the reader is, without a reload", async ({ page }) => {
    const said = listen(page);
    await page.setViewportSize(DESKTOP);
    await open(page, "/");
    await expect(headline(page, HEADLINE)).toBeVisible();
    await page.evaluate(() => (window.__stayed = true));
    await pick(page, "Deutsch");
    await expect(headline(page, translated("de", HEADLINE))).toBeVisible();
    expect(await language(page)).toEqual({ lang: "de", dir: "ltr" });
    expect(await page.evaluate(() => window.__stayed)).toBe(true);
    await pick(page, "English");
    await expect(headline(page, HEADLINE)).toBeVisible();
    expect(await language(page)).toEqual({ lang: "en", dir: "ltr" });
    expect(said).toEqual([]);
  });

  test("the address names the language, and the browser's own is taken where it names none", async ({ browser }) => {
    const asked = await browser.newPage();
    await open(asked, "/?lang=ja");
    await expect(headline(asked, translated("ja", HEADLINE))).toBeVisible();
    expect(await language(asked)).toEqual({ lang: "ja", dir: "ltr" });
    await asked.close();
    const context = await browser.newContext({ locale: "pt-PT" });
    const browsed = await context.newPage();
    await open(browsed, "/");
    await expect(headline(browsed, translated("pt-BR", HEADLINE))).toBeVisible();
    expect(await language(browsed)).toEqual({ lang: "pt-BR", dir: "ltr" });
    await context.close();
  });

  // On a slow link the page is the reader's before the catalogue of the
  // browser's language is in: what they pick meanwhile is what it stays in.
  test("a language picked while the browser's is still coming is the one kept", async ({ browser }) => {
    const context = await browser.newContext({ locale: "de-DE", viewport: DESKTOP });
    const page = await context.newPage();
    let release;
    const held = new Promise((done) => (release = done));
    let asked = false;
    await page.route(/\/de(?:\.po)?-[\w-]+\.js$/u, async (route) => {
      asked = true;
      await held;
      await route.continue();
    });
    await open(page, "/");
    await expect.poll(() => asked).toBe(true);
    await pick(page, "English");
    release();
    await page.waitForLoadState("networkidle");
    await expect(headline(page, HEADLINE)).toBeVisible();
    expect(await language(page)).toEqual({ lang: "en", dir: "ltr" });
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe("en");
    await open(page, "/");
    await expect(headline(page, HEADLINE)).toBeVisible();
    await context.close();
  });

  test("Arabic is laid out from the right", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await open(page, "/");
    const brand = visible(page.getByRole("link", { name: /Ljós/u }));
    const before = await brand.boundingBox();
    expect(before.x + before.width / 2).toBeLessThan(DESKTOP.width / 2);
    await pick(page, "العربية");
    await expect(headline(page, translated("ar", HEADLINE))).toBeVisible();
    expect(await language(page)).toEqual({ lang: "ar", dir: "rtl" });
    await expect.poll(async () => {
      const box = await brand.boundingBox();
      return box.x + box.width / 2;
    }).toBeGreaterThan(DESKTOP.width / 2);
  });

  test("the language is kept as the reader moves through the site", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await open(page, "/");
    await pick(page, "Íslenska");
    await expect(headline(page, translated("is", HEADLINE))).toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe("is");
    await open(page, "/demos/");
    await expect.poll(() => language(page)).toEqual({ lang: "is", dir: "ltr" });
    await open(page, "/");
    await expect(headline(page, translated("is", HEADLINE))).toBeVisible();
  });

  for (const [name, viewport] of [["desktop", DESKTOP], ["phone", PHONE]]) {
    test(`the picker is a button and a list of radios, by keyboard too, on a ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await open(page, "/");
      if (viewport === PHONE) await visible(page.getByRole("button", { name: "Menu", exact: true })).click();
      // The keyboard is the runtime's, as an item's is in Qt: only keys
      // move it, and it shows as the ring an item draws.
      const button = visible(page.getByRole("button", { name: "Language: English" }));
      await press(page, "Tab", button);
      await page.keyboard.press("Enter");
      const english = page.getByRole("radio", { name: "English", exact: true });
      await expect(english).toHaveAttribute("aria-checked", "true");
      await expect.poll(() => ringed(english), "the language shown has the keyboard").toBe(true);
      await press(page, "ArrowDown", page.getByRole("radio", { name: "Deutsch", exact: true }));
      await page.keyboard.press("Enter");
      await expect(headline(page, translated("de", HEADLINE))).toBeVisible();
      const again = visible(page.getByRole("button", { name: translated("de", "Language: {0}").replace("{0}", "Deutsch") }));
      await expect.poll(() => ringed(again), "the button has the keyboard back").toBe(true);
      await page.keyboard.press("Space");
      await expect(page.getByRole("radio", { name: "Deutsch", exact: true })).toHaveAttribute("aria-checked", "true");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("radio")).toHaveCount(0);
      // The page in the language picked gives a reader all WCAG A and AA
      // ask (tests/a11y.spec.js says why a scroller is left out).
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).disableRules(["scrollable-region-focusable"]).analyze();
      expect(results.violations.flatMap(({ id, nodes }) => nodes.map((node) => `${id}: ${node.target.join(" ")}`))).toEqual([]);
    });
  }
});

// A catalogue is fetched only when its language is: the first load of a
// page in English holds none.
test("no catalogue is in an English page's first load", async ({ page }) => {
  const asked = [];
  page.on("request", (request) => asked.push(new URL(request.url()).pathname));
  await open(page, "/");
  await page.waitForLoadState("networkidle");
  const before = asked.length;
  expect(asked.filter((path) => /\/(ar|de|es|fr|hi|is|ja|pt-BR|ru|zh-Hans)(?:\.po)?-[\w-]+\.js$/u.test(path))).toEqual([]);
  await pick(page, "Русский");
  await expect(headline(page, translated("ru", HEADLINE))).toBeVisible();
  expect(asked.slice(before).filter((path) => /\/ru(?:\.po)?-[\w-]+\.js$/u.test(path))).toHaveLength(1);
});

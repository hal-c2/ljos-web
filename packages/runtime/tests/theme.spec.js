// A page's theme (ljos-ui's `docs/theme.md`) on Ljos.Design's singletons:
// each role a theme gives is put over the module's, whatever binds to it
// follows, a colour's variants follow the scheme and contrast, taking it away
// gives the module's back, and nothing is made again. Under it, the runtime's
// way to put something over any property.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as plain } from "@playwright/test";
import { expect, open, test } from "./open.js";

const qmlc = process.env.QMLC ?? join(import.meta.dirname, "../../../target/debug/qmlc");
const hot = join(import.meta.dirname, "scenes/hot/theme.json");

// What the compiler says of a theme file: its overrides, or its mistakes
// as `{ file, line, column, message }`, which is what a host hands the page.
function check({ file = "theme.json", text }) {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-theme-"));
  try {
    writeFileSync(join(dir, file), text);
    const ran = spawnSync(qmlc, ["--theme", file], { cwd: dir, encoding: "utf8" });
    if (ran.status === 0) return JSON.parse(ran.stdout);
    const diagnostics = ran.stderr
      .trim()
      .split("\n")
      .map((line) => line.match(/^(.*?):(\d+):(\d+): (.*)$/))
      .map(([, file, line, column, message]) => ({ file, line: Number(line), column: Number(column), message }));
    return { diagnostics };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const set = (page, text) => page.evaluate((checked) => (window.theme.setTheme(checked), window.flush()), check({ text }));
const shown = (page) =>
  page.evaluate(() => ({
    label: window.scene.label.text,
    width: window.scene.box.width,
    text: String(window.scene.label.color),
    accent: String(window.scene.box.color),
  }));
const MODULE = { label: "gap 12", width: 24, text: "#123456", accent: "#3366cc" };

test("a theme's roles are followed by whatever binds to them", async ({ page }) => {
  await open(page, "theme");
  expect(await shown(page)).toEqual(MODULE);
  await set(page, '{"Spacing": {"md": 20}, "Colors": {"text": {"light": "#0b3d91"}, "accent": {"light": "#1b5e20"}}}');
  expect(await shown(page)).toEqual({ label: "gap 20", width: 40, text: "#0b3d91", accent: "#1b5e20" });
});

test("taking the theme away gives each role the module's value again", async ({ page }) => {
  await open(page, "theme");
  await set(page, '{"Spacing": {"md": 20}, "Colors": {"text": {"light": "#0b3d91"}}}');
  await page.evaluate(() => (window.theme.removeTheme(), window.flush()));
  expect(await shown(page)).toEqual(MODULE);
});

test("a role the next theme does not give is the module's again, and one it gives too is changed", async ({ page }) => {
  await open(page, "theme");
  await set(page, '{"Spacing": {"md": 20}, "Colors": {"text": {"light": "#0b3d91"}}}');
  await set(page, '{"Spacing": {"md": 16}}');
  expect(await shown(page)).toEqual({ ...MODULE, label: "gap 16", width: 32 });
});

test("a colour's variants follow the scheme and contrast, and a variant the theme does not give is the module's", async ({ page }) => {
  await open(page, "theme");
  await set(page, '{"Colors": {"text": {"light": "#0b3d91", "dark": "#cfe0ff"}}}');
  const scheme = (dark, highContrast) =>
    page.evaluate(
      ([dark, highContrast]) => {
        const colors = window.singletons["Ljos.Design.Colors"];
        colors.dark = dark;
        colors.highContrast = highContrast;
        window.flush();
        return String(window.scene.label.color);
      },
      [dark, highContrast],
    );
  expect(await scheme(true, false)).toBe("#cfe0ff");
  // Neither high-contrast variant is the theme's.
  expect(await scheme(true, true)).toBe("#ffffff");
  expect(await scheme(false, true)).toBe("#000000");
  expect(await scheme(false, false)).toBe("#0b3d91");
});

test("a change of theme keeps what was typed and what was toggled", async ({ page }) => {
  await open(page, "theme");
  await page.evaluate(() => window.scene.field.forceActiveFocus());
  await page.keyboard.type("kept");
  await page.evaluate(() => (window.scene.toggled = true));
  await page.evaluate(() => (window.made = [window.scene, window.scene.label, window.scene.field]));
  await set(page, '{"Spacing": {"md": 20}}');
  await set(page, '{"Colors": {"accent": {"light": "#1b5e20"}}}');
  await page.evaluate(() => (window.theme.removeTheme(), window.flush()));
  expect(await page.evaluate(() => [window.scene.field.text, window.scene.toggled, window.scene.field.activeFocus])).toEqual(["kept", true, true]);
  // The same objects: nothing was made again.
  expect(await page.evaluate(() => window.made.every((object, at) => object === [window.scene, window.scene.label, window.scene.field][at]))).toBe(true);
});

test("a theme a host holds as text is put on the page once checked, and a refused one leaves the theme the page had", async ({ page }) => {
  await page.exposeFunction("check", check);
  await open(page, "theme");
  const apply = (text) => page.evaluate(async (text) => {
    const said = await window.theme.applyTheme(text, { file: "theme.json", check: window.check });
    window.flush();
    return said;
  }, text);
  expect(await apply('{"Spacing": {"md": 20}}')).toEqual({ ok: true });
  expect(await apply('{"Spacing": {"md": 30}, "Colors": {"acent": "#000000"}}')).toEqual({
    diagnostics: [{ file: "theme.json", line: 1, column: 36, message: 'Colors has no role "acent"' }],
  });
  expect(await shown(page)).toEqual({ ...MODULE, label: "gap 20", width: 40 });
  expect(await page.evaluate(() => window.theme.currentTheme().overrides)).toEqual([{ singleton: "Spacing", role: "md", value: 20 }]);
});

test("the theme file nearest a host's entry is found among the names it holds, up to its project and no further", async ({ page }) => {
  await open(page, "theme");
  const find = (names, entry, project) => page.evaluate(([names, entry, project]) => window.theme.findTheme(names, entry, { project }), [names, entry, project]);
  expect(await find(["theme.json", "app/theme.json"], "app/Main.qml", "")).toBe("app/theme.json");
  expect(await find(["theme.json"], "app/pages/Main.qml", "")).toBe("theme.json");
  expect(await find(["theme.json", "app/other/theme.json"], "app/pages/Main.qml", "app")).toBe(null);
  expect(await find(["app/theme.json"], "app/pages/Main.qml", "app/pages")).toBe(null);
});

test("something put over a property is followed, a write goes over it, and taken away the property's binding is back", async ({ page }) => {
  await open(page, "override");
  const width = () => page.evaluate(() => (window.flush(), window.scene.box.width));
  expect(await width()).toBe(150);
  await page.evaluate(() => (window.over = window.override(window.scene.box, "width", { binding: (below) => below() + 1 })));
  expect(await width()).toBe(151);
  await page.evaluate(() => (window.scene.width = 100));
  expect(await width()).toBe(51);
  await page.evaluate(() => window.over.set({ value: 70 }));
  expect(await width()).toBe(70);
  await page.evaluate(() => (window.scene.box.width = 80));
  expect(await width()).toBe(80);
  await page.evaluate(() => window.over.remove());
  expect(await width()).toBe(50);
  await page.evaluate(() => (window.scene.width = 300));
  expect(await width()).toBe(150);
});

test.describe("a theme file beside an entry", () => {
  // One file, written by each in turn.
  test.describe.configure({ mode: "serial" });
  test.afterEach(() => rmSync(hot, { force: true }));

  test("written, changed and taken away while the page is open, is followed without the page being made again", async ({ page }) => {
    await open(page, "theme-file");
    await page.evaluate(() => window.scene.field.forceActiveFocus());
    await page.keyboard.type("kept");
    await page.evaluate(() => (window.marker = window.scene));
    const label = () => page.evaluate(() => window.scene.label.text);
    expect(await label()).toBe("gap 12");
    writeFileSync(hot, '{"Spacing": {"md": 20}}\n');
    await expect.poll(label).toBe("gap 20");
    writeFileSync(hot, '{"Spacing": {"md": 16}}\n');
    await expect.poll(label).toBe("gap 16");
    rmSync(hot);
    await expect.poll(label).toBe("gap 12");
    expect(await page.evaluate(() => [window.marker === window.scene, window.scene.field.text])).toEqual([true, "kept"]);
  });

  // Not of `test` from `open.js`: what the dev server says of the file it
  // cannot take is said on the page as an error, as it is of any such file.
  plain("turned into one that is refused, leaves the page the theme it had", async ({ page }) => {
    writeFileSync(hot, '{"Spacing": {"md": 20}}\n');
    await open(page, "theme-file");
    const label = () => page.evaluate(() => window.scene.label.text);
    expect(await label()).toBe("gap 20");
    writeFileSync(hot, '{"Spacing": {"md": "wide"}}\n');
    await expect(page.locator("vite-error-overlay")).toHaveCount(1);
    expect(await page.locator("vite-error-overlay").evaluate((overlay) => overlay.shadowRoot.textContent)).toContain("theme.json:1:20: Spacing.md is a whole number");
    expect(await label()).toBe("gap 20");
  });
});

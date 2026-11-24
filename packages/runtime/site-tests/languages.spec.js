// The language a site is written in (`languages.source`): the page is in
// it, and laid out its way, though the bundle has no catalogue to
// translate it into another.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSite } from "../site.js";
import { bundle, design, manifest, qmlc } from "./bundle.js";
import { expect, part, serve, shared, test } from "./served.js";

test("a site written in Arabic with no catalogue is read in Arabic, from the right", async ({ page }) => {
  const made = bundle("project");
  let server;
  try {
    await part("build the site", () => buildSite({ dir: made.dir, out: made.out, qmlc, with: [design], languages: { source: "ar" } }));
    server = await part("serve it", () => serve(made.out));
    await page.goto(`${server.origin}/`);
    await expect(page.getByText("Stopped", { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir }))).toEqual({ lang: "ar", dir: "rtl" });
  } finally {
    await part("stop serving it", () => server?.stop());
    made.remove();
  }
});

// A site with an Arabic catalogue, its "Stopped" a message to translate.
const AR_PO = 'msgid ""\nmsgstr ""\n"Language: ar\\n"\n"Plural-Forms: nplurals=6; plural=(n==0 ? 0 : n==1 ? 1 : n==2 ? 2 : n%100>=3 && n%100<=10 ? 3 : n%100>=11 ? 4 : 5);\\n"\n\nmsgid "Stopped"\nmsgstr "متوقف"\n';
function translated() {
  return bundle("project", (dir, written) => {
    const shell = join(dir, "Shell.qml");
    writeFileSync(shell, readFileSync(shell, "utf8").replace("import QtQuick\n", "import QtQuick\nimport Ljos.Core\n").replace('"Stopped"', "t`Stopped`"));
    mkdirSync(join(dir, "i18n"));
    writeFileSync(join(dir, "i18n", "ar.po"), AR_PO);
    // What an export would write of the bundle as it now is.
    Object.assign(written, manifest(dir));
  });
}
const KEY = "ljos-site:language";
const marked = (page) => page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir }));

test.describe("a site with a catalogue", () => {
  let made;
  let server;
  test.beforeAll(shared("build the site and serve it", async () => {
    made = translated();
    await buildSite({ dir: made.dir, out: made.out, qmlc, with: [design] });
    server = await serve(made.out);
  }));
  test.afterAll(shared("stop serving it and remove the bundle", async () => {
    await server?.stop();
    made?.remove();
  }));

  test("the language the address names is shown once its catalogue is in, and kept", async ({ page }) => {
    await page.goto(`${server.origin}/?lang=ar`);
    await expect(page.getByText("متوقف", { exact: true })).toBeVisible();
    expect(await marked(page)).toEqual({ lang: "ar", dir: "rtl" });
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe("ar");
  });

  // A catalogue that cannot be had leaves the page as it was written: in
  // the source's language, laid out its way, said, and the language the
  // address named not kept for the next page, which asks for it again.
  test("a language whose catalogue cannot be fetched leaves the page in the source's, said and not kept", async ({ page }) => {
    const warned = [];
    page.on("console", (message) => message.type() === "warning" && warned.push(message.text()));
    await page.route(/\/ar(?:\.po)?-[\w-]+\.js$/u, (route) => route.abort());
    await page.goto(`${server.origin}/?lang=ar`);
    await expect.poll(() => warned.some((text) => /ar\.po: the catalogue could not be fetched/u.test(text)), "the failure is said").toBe(true);
    // The start settles in the tasks after the failure is said.
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    await expect(page.getByText("Stopped", { exact: true })).toBeVisible();
    expect(await marked(page)).toEqual({ lang: "en", dir: "ltr" });
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(null);
  });
});

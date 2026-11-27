// The site's links are the page's own (features/links.feature): every
// built page, read from disk as a reader with no script gets it, has
// its header's links, its own links all go to pages the build wrote,
// and the front page leads on; with no script a link is followed, with
// script a plain press shows the page in place, and an address the
// site has no page for is answered with the site's own 404 page.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(here, "dist");
const base = process.env.LJOS_SITE_BASE ?? "/";
const origin = "http://127.0.0.1:4471";

function pagesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return pagesUnder(join(dir, entry.name));
    return entry.name === "index.html" ? [join(dir, entry.name)] : [];
  });
}

// The address a built file is served at.
const addressOf = (file) => `${base}${relative(dist, dirname(file)).split("\\").join("/")}/`.replace(/\/+$/, "/");

const unescape = (text) => text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// Every `a` with an address, as the HTML has it: its address and the
// name a reader is told (its label, else its words).
function linksIn(html) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].flatMap(([, attributes, inner]) => {
    const href = /\shref="([^"]*)"/.exec(attributes);
    if (!href) return [];
    const label = /\saria-label="([^"]*)"/.exec(attributes);
    const words = unescape(inner.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
    return [{ href: unescape(href[1]), name: label ? unescape(label[1]) : words }];
  });
}

// The built file an address of the site names, or null when it names
// none (outside the base, or no such page).
function builtFor(address, from) {
  const url = new URL(address, `${origin}${from}`);
  if (url.origin !== origin) return "elsewhere";
  if (!url.pathname.startsWith(base)) return null;
  const path = decodeURIComponent(url.pathname.slice(base.length));
  const file = join(dist, path.endsWith("/") || path === "" ? join(path, "index.html") : path);
  return existsSync(file) ? file : null;
}

const pages = pagesUnder(dist).map((file) => ({ file, at: addressOf(file), links: linksIn(readFileSync(file, "utf8")) }));

test("the build wrote the pages read here", () => {
  expect(pages.length).toBeGreaterThan(50);
  expect(pages.map(({ at }) => at)).toEqual(expect.arrayContaining([base, `${base}start/`, `${base}demos/`]));
});

test(`every page's header links to the front page, the docs, the demos and the showcase, at ${base}`, () => {
  const missing = [];
  for (const { at, links } of pages) {
    for (const [name, href] of [
      ["Ljós, home", base],
      ["Docs", `${base}start/`],
      ["Demos", `${base}demos/`],
      ["Showcase", `${base}showcase/`],
    ]) {
      if (!links.some((link) => link.name === name && link.href === href)) missing.push(`${at}: no link "${name}" to ${href}`);
    }
  }
  expect(missing).toEqual([]);
});

test("every page's footer links to the community principles, and the front page names them", () => {
  const principles = "https://community-software.org/";
  const missing = pages.filter(({ links }) => !links.some((link) => link.name === "Community principles" && link.href === principles)).map(({ at }) => at);
  expect(missing).toEqual([]);
  const front = pages.find(({ at }) => at === base);
  expect(front.links).toEqual(expect.arrayContaining([{ name: "Community Software", href: principles }]));
  expect(readFileSync(front.file, "utf8")).toContain("strives to follow the");
});

test(`every page names its icon at ${base}, and the build wrote it`, () => {
  const unnamed = pages.filter(({ file }) => !readFileSync(file, "utf8").includes(`<link rel="icon" href="${base}favicon.svg"`)).map(({ at }) => at);
  expect(unnamed).toEqual([]);
  expect(existsSync(join(dist, "favicon.svg"))).toBe(true);
});

test("every docs page's reading stands beside its HTML, for a shell that shows it in place", () => {
  // The front page, the showcase, the framework review and the demos, the
  // gallery and each pro demo's own route, are the site's own pages, not
  // docs pages with a reading.
  const docs = pages.filter(({ at }) => at !== base && at !== `${base}showcase/` && at !== `${base}review/` && !at.startsWith(`${base}demos/`));
  expect(docs.length).toBeGreaterThan(50);
  const unread = docs.filter(({ file, at }) => {
    const reading = join(dirname(file), "page.json");
    return !existsSync(reading) || `${base}${JSON.parse(readFileSync(reading, "utf8")).route.slice(1)}` !== at;
  });
  expect(unread.map(({ at }) => at)).toEqual([]);
});

test("every link of every page goes to a page the build wrote", () => {
  const broken = [];
  let followed = 0;
  for (const { at, links } of pages) {
    for (const { href, name } of links) {
      const built = builtFor(href, at);
      if (built === "elsewhere") continue;
      followed++;
      if (built === null) broken.push(`${at}: "${name}" goes to ${href}, which the build did not write`);
    }
  }
  expect(broken).toEqual([]);
  // The sidebar alone links every docs page from every docs page.
  expect(followed).toBeGreaterThan(pages.length * 20);
});

test("the front page links to the docs, the first app and the demos", () => {
  const front = pages.find(({ at }) => at === base);
  const hrefs = front.links.map(({ href }) => href);
  expect(hrefs).toEqual(expect.arrayContaining([`${base}start/`, `${base}start/first-app/`, `${base}demos/`]));
  // The calls to action are links by their own names.
  expect(front.links).toEqual(expect.arrayContaining([
    { name: "What is Ljós?", href: `${base}start/` },
    { name: "Your first app", href: `${base}start/first-app/` },
  ]));
});

test("a docs page links to the page before it and the page after it", () => {
  const leadsOn = ({ links, at }) => ({
    previous: links.find(({ name }) => name.startsWith("Previous: ")),
    next: links.find(({ name }) => name.startsWith("Next: ")),
    at,
  });
  const first = leadsOn(pages.find(({ at }) => at === `${base}start/`));
  expect(first.previous, "the first page has nothing before it").toBeUndefined();
  expect(first.next).toBeTruthy();
  // The page after the first leads back to it.
  const second = leadsOn(pages.find(({ at }) => at === first.next.href));
  expect(second.previous?.href).toBe(`${base}start/`);
  expect(second.next).toBeTruthy();
  expect(builtFor(second.next.href, second.at)).not.toBeNull();
});

test("with no script, a link is followed, and back is the browser's", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByRole("link", { name: "What is Ljós?" }).first().click();
  await expect(page).toHaveURL(`${origin}${base}start/`);
  await expect(page.getByRole("link", { name: "Docs" }).first()).toHaveAttribute("href", `${base}start/`);
  await page.goBack();
  await expect(page).toHaveURL(`${origin}${base}`);
  await page.getByRole("link", { name: "Demos", exact: true }).first().click();
  await expect(page).toHaveURL(`${origin}${base}demos/`);
  await context.close();
});

// A press as a reader's lands: on the link's middle, through the scene.
async function press(page, locator, options) {
  const box = await locator.boundingBox();
  expect(box, "the link is on the page").toBeTruthy();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, options);
}

test("with script, a plain press shows the page in place, and back shows the one before", async ({ page }) => {
  await page.goto(base);
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  // Gone with the page, if the page is loaded again.
  await page.evaluate(() => (globalThis.stillHere = true));
  await press(page, page.getByRole("link", { name: "Docs", exact: true }).first());
  await expect(page).toHaveURL(`${origin}${base}start/`);
  await expect(page).toHaveTitle("What is Ljós? — Ljós");
  await expect(page.getByRole("link", { name: /^Next: / })).toBeAttached();
  await press(page, page.getByRole("link", { name: "Your first app" }).first());
  await expect(page).toHaveURL(`${origin}${base}start/first-app/`);
  // The page shown is the one pressed, read from beside its HTML: it
  // leads back where that page's own HTML does.
  const before = pages.find(({ at }) => at === `${base}start/first-app/`).links.find(({ name }) => name.startsWith("Previous: "));
  await expect(page.getByRole("link", { name: before.name, exact: true })).toHaveAttribute("href", before.href);
  expect(await page.evaluate(() => globalThis.stillHere)).toBe(true);
  await page.goBack();
  await expect(page).toHaveURL(`${origin}${base}start/`);
  await page.goBack();
  await expect(page).toHaveURL(`${origin}${base}`);
  await expect(page.getByRole("link", { name: "What is Ljós?" }).first()).toBeVisible();
  expect(await page.evaluate(() => globalThis.stillHere)).toBe(true);
});

// A link in a page's words is drawn by a text, not an item of its own:
// the text takes the press on it, so the page around it still takes a
// drag that starts there (ljos-web#19). Such a link may wrap, so it is
// pressed on its first line, not the middle of the box around both.
// The drag is a finger's: a mouse drag never scrolls the page, so a
// drag that starts in a live example stays the example's (da87b14).
// Its context has touch, as a phone's has, so the browser takes the
// finger as a reader's and not as touch it was never told it had.
test.describe("with touch", () => {
  test.use({ hasTouch: true });
  test("with script, a press on a link in a page's words shows that page, and a finger's drag from it scrolls", async ({ page }) => {
    await page.goto(`${base}start/`);
    await page.waitForSelector('#app[data-ljos-hydrated="true"]');
    const words = page.locator("a[data-link]", { hasText: "ljos observe" }).first();
    const firstLine = async () => {
      await words.scrollIntoViewIfNeeded();
      return words.evaluate((link) => {
        const { x, y, width, height } = link.getClientRects()[0];
        return { x: x + width / 2, y: y + height / 2 };
      });
    };
    const at = await firstLine();
    await page.mouse.click(at.x, at.y);
    await expect(page).toHaveURL(`${origin}${base}start/observe/`);
    await page.goBack();
    await expect(page).toHaveURL(`${origin}${base}start/`);
    const from = await firstLine();
    // Through the browser's own touch input, as a reader's finger: the
    // page's scroll under a finger is the browser's, not the scene's.
    // The session is let go even when a step fails, so it never outlives
    // the test.
    const cdp = await page.context().newCDPSession(page);
    try {
      const finger = (y) => [{ x: from.x, y, id: 1 }];
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: finger(from.y) });
      for (let step = 1; step <= 8; step++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: finger(from.y - 10 * step) });
        await page.waitForTimeout(16);
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } finally {
      await cdp.detach();
    }
    await expect.poll(async () => (await words.evaluate((link) => link.getClientRects()[0].y))).toBeLessThan(from.y - 20);
    await expect(page).toHaveURL(`${origin}${base}start/`);
  });
});

// Where a link of the page is, down it: it moves up as the page is
// scrolled down.
const down = async (link) => (await link.boundingBox()).y;
// Where it comes to rest, once the wheel has stopped moving the page:
// where it stands in three of the page's animation frames in a row. A
// smooth scroll moves the page every frame it runs, however far apart a
// loaded machine puts them; a quarter second without a move, as this
// once read, was a rest only on a quick one.
async function rest(link) {
  await link.evaluate(
    (element) =>
      new Promise((done) => {
        const seen = [];
        const look = () => {
          seen.push(element.getClientRects()[0]?.y);
          if (seen.length >= 3 && seen.slice(-3).every((y) => y === seen.at(-1))) done();
          else requestAnimationFrame(look);
        };
        requestAnimationFrame(look);
      }),
  );
  return down(link);
}

test("with script, a page pressed to is shown from its top, and back and forward come to where the reader left each", async ({ page }) => {
  // Where the second page's link back is, with the page at its top.
  await page.goto(`${base}start/first-app/`);
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  const back = page.getByRole("link", { name: /^Previous: / });
  const top = await down(back);

  await page.goto(`${base}start/`);
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  const next = page.getByRole("link", { name: /^Next: / });
  const unscrolled = await down(next);
  const { width, height } = page.viewportSize();
  await page.mouse.move(width / 2, height / 2);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => down(next)).toBeLessThan(unscrolled - 300);
  const left = await rest(next);

  await press(page, page.getByRole("link", { name: "Your first app" }).first());
  await expect(page).toHaveURL(`${origin}${base}start/first-app/`);
  await expect.poll(() => down(back)).toBe(top);
  // Over the page, not the sidebar the press was in.
  await page.mouse.move(width / 2, height / 2);
  await page.mouse.wheel(0, 300);
  await expect.poll(() => down(back)).toBeLessThan(top - 100);
  const later = await rest(back);

  await page.goBack();
  await expect(page).toHaveURL(`${origin}${base}start/`);
  await expect.poll(() => down(next)).toBe(left);
  await page.goForward();
  await expect(page).toHaveURL(`${origin}${base}start/first-app/`);
  await expect.poll(() => down(back)).toBe(later);
});

test("with script, a page opened at a heading's fragment is at that heading", async ({ page }) => {
  const heading = (at) => at.getByText("Render a picture without a window", { exact: true }).first();
  await page.goto(`${base}start/first-app/`);
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  const { height } = page.viewportSize();
  expect(await down(heading(page)), "below the first screen at the top").toBeGreaterThan(height);

  await page.goto(`${base}start/first-app/#render-a-picture-without-a-window`);
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  await expect.poll(() => down(heading(page))).toBeLessThan(height / 3);
});

test("with script, a page opened at a heading whose name is not all ASCII is at that heading", async ({ page }) => {
  const heading = () => page.getByText("Where Ljós and Qt differ", { exact: true }).first();
  await page.goto(`${base}language/porting-from-qt/#${encodeURIComponent("where-ljós-and-qt-differ")}`);
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  await expect.poll(() => down(heading())).toBeLessThan(page.viewportSize().height / 3);
});

// A heading names itself in its page's HTML as its anchor, so its
// address lands on it with the browser's own scrolling. (One near the
// end of its page comes up only as far as the page scrolls.)
test("with no script, a page opened at a heading's fragment is at that heading", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const heading = () => page.getByText("Check and format the file", { exact: true }).first();
  await page.goto(`${base}start/first-app/`);
  expect(await down(heading()), "below the first screen at the top").toBeGreaterThan(page.viewportSize().height);
  await page.goto(`${base}start/first-app/#check-and-format-the-file`);
  await expect.poll(() => down(heading())).toBeLessThan(page.viewportSize().height / 3);
  await page.goto(`${base}language/porting-from-qt/#${encodeURIComponent("where-ljós-and-qt-differ")}`);
  const other = page.getByText("Where Ljós and Qt differ", { exact: true }).first();
  await expect.poll(() => down(other)).toBeLessThan(page.viewportSize().height / 3);
  await context.close();
});

test("with script, a page loaded again is where the reader left it", async ({ page }) => {
  await page.goto(`${base}start/`);
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  const next = page.getByRole("link", { name: /^Next: / });
  const unscrolled = await down(next);
  const { width, height } = page.viewportSize();
  await page.mouse.move(width / 2, height / 2);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => down(next)).toBeLessThan(unscrolled - 300);
  const left = await rest(next);
  // The page keeps its place in its history entry once it has stopped
  // moving (a quarter second after, Main.qml's `keeping`): loaded again
  // before that, it has nothing to go back to.
  await test.step("the entry keeps where the page stopped", () =>
    page.waitForFunction((moved) => Math.abs((history.state?.offset ?? 0) - moved) < 1, unscrolled - left, { timeout: 0, polling: "raf" }),
  );

  await page.reload();
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  await expect.poll(() => down(next)).toBe(left);
});

// The demos page loads by route (Site/later.js): loaded again while its
// module is slow to come, it is put where the reader left it once it
// has come, not at the top of the empty page that stood before.
test("with script, the demos page loaded again while its module is slow is where the reader left it", async ({ page }) => {
  await page.goto(`${base}demos/`);
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  const heading = page.getByText("3D you can orbit", { exact: true }).first();
  await expect(heading).toBeVisible({ timeout: 30_000 });
  const unscrolled = await down(heading);
  const { width, height } = page.viewportSize();
  await page.mouse.move(width / 2, height / 2);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => down(heading)).toBeLessThan(unscrolled - 300);
  const left = await rest(heading);
  await test.step("the entry keeps where the page stopped", () =>
    page.waitForFunction((moved) => Math.abs((history.state?.offset ?? 0) - moved) < 1, unscrolled - left, { timeout: 0, polling: "raf" }),
  );

  await page.route("**/DemosPage-*.js", async (route) => {
    await new Promise((done) => setTimeout(done, 1500));
    await route.continue();
  });
  await page.reload();
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  await expect.poll(() => down(heading), { timeout: 30_000 }).toBe(left);
  // Nor is the place cut to the empty page kept while it was fetched.
  expect(await page.evaluate(() => history.state?.offset), "the entry still keeps the place").toBeCloseTo(unscrolled - left, 0);
});

test("with script, back pressed again while a page is still read keeps each page's place", async ({ page }) => {
  await page.goto(`${base}start/`);
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  await press(page, page.getByRole("link", { name: "Your first app" }).first());
  await expect(page).toHaveURL(`${origin}${base}start/first-app/`);
  const back = page.getByRole("link", { name: /^Previous: / });
  const top = await rest(back);
  const { width, height } = page.viewportSize();
  await page.mouse.move(width / 2, height / 2);
  await page.mouse.wheel(0, 300);
  await expect.poll(() => down(back)).toBeLessThan(top - 100);
  const later = await rest(back);
  // On to another page, by the sidebar, which stays where it is.
  await press(page, page.getByRole("link", { name: "Install Ljós", exact: true }).first());
  await expect(page).toHaveURL(`${origin}${base}start/install/`);

  // Loaded again, the shell has read no other page; the one back is
  // slow to come, and back is pressed again before it has.
  await page.reload();
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  let slow = true;
  await page.route(`**${base}start/first-app/page.json`, async (route) => {
    if (slow) await new Promise((done) => setTimeout(done, 1500));
    await route.continue();
  });
  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(`${origin}${base}start/`);
  await expect(page).toHaveTitle("What is Ljós? — Ljós");
  slow = false;

  await page.goForward();
  await expect(page).toHaveURL(`${origin}${base}start/first-app/`);
  await expect.poll(() => down(back)).toBe(later);
});

test("with script, a middle press opens the link in a new tab", async ({ page, context }) => {
  await page.goto(base);
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  const opened = context.waitForEvent("page");
  await press(page, page.getByRole("link", { name: "Docs", exact: true }).first(), { button: "middle" });
  const tab = await opened;
  await tab.waitForLoadState("commit");
  expect(new URL(tab.url()).pathname).toBe(`${base}start/`);
  await expect(page).toHaveURL(`${origin}${base}`);
  await tab.close();
});

test("the site's 404 page has the header, says so, and links home at the base", () => {
  const file = join(dist, "404.html");
  expect(existsSync(file)).toBe(true);
  const html = readFileSync(file, "utf8");
  expect(html).toContain("<style>");
  expect(html).toContain("<header>");
  expect(html).toMatch(/<h1>Page not found<\/h1>/);
  const links = linksIn(html);
  expect(links).toEqual(expect.arrayContaining([
    { name: "Ljós, home", href: base },
    { name: "Docs", href: `${base}start/` },
    { name: "Showcase", href: `${base}showcase/` },
    { name: "Go to the front page", href: base },
    { name: "Community principles", href: "https://community-software.org/" },
  ]));
  // Served at any depth, so nothing in it is relative.
  const relativeAddresses = [...html.matchAll(/\s(?:href|src)="([^"]*)"/g)].map(([, address]) => address).filter((address) => !address.startsWith(base) && !/^https:\/\//.test(address));
  expect(relativeAddresses).toEqual([]);
});

test("an address the site has no page for is answered 404 with the site's page", async ({ request, page }) => {
  for (const missing of [`${base}no-such-page/`, `${base}start/no-such-page/deeper/`, `${base}nothing.html`]) {
    const response = await request.get(missing);
    expect(response.status(), missing).toBe(404);
    expect(await response.text()).toContain("Page not found");
  }
  // And it reads as the site, its links going home from any depth.
  await page.goto(`${base}start/no-such-page/deeper/`);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.getByRole("link", { name: "Go to the front page" }).click();
  await expect(page).toHaveURL(`${origin}${base}`);
});

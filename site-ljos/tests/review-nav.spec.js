// The framework review is one of the site's own places
// (features/review.feature): every shell's main navigation has a link to
// it, wide and on a phone, that a reader reaches with Tab and follows
// with Enter, and the home page names it in its own words, not only in
// the footer every page has.
import { expect, test } from "@playwright/test";

const base = (process.env.LJOS_SITE_BASE ?? "/").replace(/\/?$/, "/");
const at = (route) => `${base}${route.replace(/^\//, "")}`;
const HYDRATED = '#app[data-ljos-hydrated="true"]';
const KEY = "ljos.dev:shell";
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const REVIEW = `${base}review/`;

const region = (page, role, name) => page.getByRole(role, { name, exact: true }).filter({ visible: true });

// Where each shell keeps its main navigation, and how a reader gets
// there on a phone: Elegant and Cyberpunk behind the header's menu,
// Workbench and Desktop in a pane of the tab bar along the bottom.
const NAV = {
  elegant: { wide: ["region", "Ljós"], phone: { menu: true, nav: ["region", "Menu"] } },
  cyberpunk: { wide: ["region", "Sections"], phone: { menu: true, nav: ["region", "Menu"] } },
  workbench: { wide: ["complementary", "Explorer"], phone: { tab: "Explorer", nav: ["complementary", "Explorer"] } },
  desktop: { wide: ["complementary", "Pages"], phone: { tab: "Pages", nav: ["complementary", "Pages"] } },
};

async function reader(browser, viewport, kept) {
  return browser.newContext({
    viewport,
    storageState: { cookies: [], origins: [{ origin: "http://127.0.0.1:4471", localStorage: [{ name: KEY, value: kept }] }] },
  });
}

// Opened, taken over, and the kept shell framing it. A kept shell that
// came after the head's watchdog is picked as a reader would.
async function open(page, route, shell) {
  await page.goto(at(route));
  await page.waitForSelector(HYDRATED, { timeout: 40_000 });
  await page.waitForFunction(() => {
    const said = document.documentElement.dataset;
    return "ljosShellLate" in said || ("ljosShellShown" in said && said.ljosShellShowing);
  });
  await page.waitForFunction(() => !document.documentElement.dataset.ljosSwap);
  const showing = await page.evaluate(() => document.documentElement.dataset.ljosShellShowing ?? "");
  if (showing !== shell) {
    test.info().annotations.push({ type: "late", description: `${shell} came after the watchdog; picked by hand` });
    const menu = page.getByRole("button", { name: "Menu", exact: true }).filter({ visible: true });
    const switcher = () => page.getByRole("button", { name: /^(Switch shell|Current shell: \w+)$/ }).filter({ visible: true }).first();
    if ((await switcher().count()) === 0 && (await menu.count()) > 0) await press(menu.first());
    await press(switcher());
    await press(page.getByRole("radio", { name: shell[0].toUpperCase() + shell.slice(1), exact: true }));
    await page.waitForFunction((name) => document.documentElement.dataset.ljosShellShowing === name && !document.documentElement.dataset.ljosSwap, shell);
    if ((await menu.count()) > 0 && (await region(page, "region", "Menu").count()) > 0) await page.keyboard.press("Escape");
  }
}

// A press where a finger lands: an item's own press area lies over it.
async function press(locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  expect(box, "the control is laid out").toBeTruthy();
  await locator.page().mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

// Tab, from where focus is now, until `link` has it: the keyboard's own
// way there, not a script's focus().
async function tabTo(page, link, most = 120) {
  const target = await link.elementHandle();
  for (let n = 0; n < most; n += 1) {
    await page.keyboard.press("Tab");
    if (await page.evaluate((node) => document.activeElement === node, target)) return n + 1;
  }
  return 0;
}

for (const [shell, where] of Object.entries(NAV)) {
  for (const [form, viewport] of [["wide", DESKTOP], ["phone", PHONE]]) {
    test(`${shell} on a ${form === "wide" ? "desktop" : "phone"}: the main navigation has a link to the review, by keyboard too`, async ({ browser }) => {
      const context = await reader(browser, viewport, shell);
      try {
        const page = await context.newPage();
        await open(page, "/", shell);
        let nav;
        if (form === "wide") {
          nav = region(page, ...where.wide);
        } else {
          const phone = where.phone;
          if (phone.menu) await press(region(page, "region", "Ljós").getByRole("button", { name: "Menu", exact: true }));
          else await press(page.getByRole("tablist", { name: "Views", exact: true }).getByRole("tab", { name: phone.tab, exact: true }));
          nav = region(page, ...phone.nav);
        }
        await expect(nav).toBeVisible();
        const link = nav.locator(`a[href="${REVIEW}"]`).filter({ visible: true });
        await expect(link, "one link to /review/").toHaveCount(1);
        await expect(link).toHaveAccessibleName(/\S/);
        // Its words are on the page, not an icon alone.
        expect((await link.innerText()).trim().length, "the link has words").toBeGreaterThan(0);
        expect(await tabTo(page, link), "Tab reaches the link").toBeGreaterThan(0);
        await page.keyboard.press("Enter");
        await expect(region(page, "main", "Framework review"), "Enter opens the review").toBeVisible({ timeout: 20_000 });
        await expect(page).toHaveURL(new RegExp(`${REVIEW.replace(/\//g, "\\/")}$`));
      } finally {
        await context.close();
      }
    });
  }
}

test("the home page links to the review in its own words, not only in the footer", async ({ browser }) => {
  for (const viewport of [DESKTOP, PHONE]) {
    const context = await reader(browser, viewport, "elegant");
    try {
      const page = await context.newPage();
      await open(page, "/", "elegant");
      const home = region(page, "main", "Home");
      const links = home.locator(`a[href="${REVIEW}"]`);
      const own = await links.evaluateAll((all) => all.findIndex((a) => !a.closest("footer, [role=contentinfo]")));
      expect(own, `a link to /review/ in the home page at ${viewport.width} px, outside its footer`).toBeGreaterThanOrEqual(0);
      const first = links.nth(own);
      await first.scrollIntoViewIfNeeded();
      await expect(first).toBeVisible();
      await first.click();
      await expect(region(page, "main", "Framework review")).toBeVisible({ timeout: 20_000 });
    } finally {
      await context.close();
    }
  }
});

// The site in a shell the reader picks (features/shells.feature): the
// site's state and pages stay, the shell that frames them is swapped
// live, kept for the next visit and put in without a jump, and a reader
// with no script, or on a phone, gets the one every page is written in.
// Which shell frames the page is on its root, `data-ljos-shell-showing`
// (bundle/shells.js `showing`).
import { expect, test } from "@playwright/test";

const base = (process.env.LJOS_SITE_BASE ?? "/").replace(/\/?$/, "/");
const at = (route) => `${base}${route.replace(/^\//, "")}`;
const HYDRATED = '#app[data-ljos-hydrated="true"]';
const KEY = "ljos.dev:shell";
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const LABEL = { marketing: "Marketing", workbench: "Workbench", desktop: "Desktop" };
const SHELLS = Object.keys(LABEL);
// What each kind of page is named as a part of the page (Site/PageView.qml).
const PAGES = [
  { route: "/", region: "Home" },
  { route: "/demos/", region: "Live demos" },
  { route: "/demos/cockpit/", region: "Svala GT cockpit" },
  { route: "/start/first-app/", region: "Your First App" },
];

const showing = (page) => page.evaluate(() => document.documentElement.dataset.ljosShellShowing ?? "");

// A context as a reader's: full motion unless asked, and the shell they
// kept, if any, there before the page is.
async function reader(browser, { viewport = DESKTOP, kept = "", reducedMotion = "no-preference", javaScriptEnabled = true } = {}) {
  const origin = "http://127.0.0.1:4471";
  return browser.newContext({
    viewport,
    reducedMotion,
    javaScriptEnabled,
    storageState: kept ? { cookies: [], origins: [{ origin, localStorage: [{ name: KEY, value: kept }] }] } : undefined,
  });
}

// Every error the page says, to be none.
function listen(page) {
  const said = [];
  page.on("pageerror", (error) => said.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" || /ShellLoader/.test(message.text())) said.push(`${message.type()}: ${message.text()}`);
  });
  return said;
}

// Opened, taken over, and its kept shell in (shells.js `shown`).
async function open(page, route) {
  await page.goto(at(route));
  await page.waitForSelector(HYDRATED, { timeout: 40_000 });
  await page.waitForFunction(() => "ljosShellShown" in document.documentElement.dataset && document.documentElement.dataset.ljosShellShowing);
}

// A press where a finger lands: an item's own press area lies over it.
async function press(locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  expect(box, "the control is laid out").toBeTruthy();
  await locator.page().mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

// Named "Shell: <the one shown>" where its words show, "Shell" as an icon.
const SWITCHER = /^Shell(: \w+)?$/;
const switcher = (page) => page.getByRole("button", { name: SWITCHER }).filter({ visible: true }).first();

// Picks `name` in the shell switcher and waits until it frames the page
// and the swap's transition is over.
async function pick(page, name) {
  await press(switcher(page));
  await press(page.getByRole("radio", { name: LABEL[name], exact: true }));
  // Workbench and Desktop come the first time one is picked
  // (Shells/later.js): the wait is the fetch's, not a fixed few seconds.
  await expect.poll(() => showing(page), { message: `the ${name} shell frames the page`, timeout: 30_000 }).toBe(name);
  await page.waitForFunction(() => !document.documentElement.dataset.ljosSwap);
}

const region = (page, name) => page.getByRole("region", { name, exact: true }).filter({ visible: true });

for (const route of ["/", "/start/first-app/"]) {
  const { region: named } = PAGES.find((one) => one.route === route);
  for (const from of SHELLS) {
    for (const to of SHELLS) {
      if (from === to) continue;
      test(`on ${route}, ${from} swaps to ${to} and the page stays`, async ({ browser }) => {
        const context = await reader(browser);
        try {
          const page = await context.newPage();
          const said = listen(page);
          await open(page, route);
          if (from !== "marketing") await pick(page, from);
          await expect(region(page, named)).toBeVisible();
          await pick(page, to);
          await expect(region(page, named), "the page is still shown").toBeVisible();
          await expect(switcher(page)).toHaveAccessibleName(`Shell: ${LABEL[to]}`);
          expect(said, "what the page said").toEqual([]);
        } finally {
          await context.close();
        }
      });
    }
  }
}

for (const shell of SHELLS) {
  test(`every kind of page stands in the ${shell} shell`, async ({ browser }) => {
    const context = await reader(browser, { kept: shell });
    try {
      const page = await context.newPage();
      const said = listen(page);
      for (const { route, region: named } of PAGES) {
        await open(page, route);
        expect(await showing(page), `${route} is framed by ${shell}`).toBe(shell);
        await expect(region(page, named), `${route} shows its page`).toBeVisible();
      }
      expect(said, "what the pages said").toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test("a running example keeps its count across every swap", async ({ browser }) => {
  const context = await reader(browser);
  try {
    const page = await context.newPage();
    await open(page, "/start/first-app/");
    const picture = page.locator('img[alt="What this example draws"]').first();
    await press(picture);
    await expect(picture, "the example runs in its picture's place").toBeHidden({ timeout: 30_000 });
    const increment = page.getByRole("button", { name: "Increment", exact: true }).filter({ visible: true }).first();
    await press(increment);
    await press(increment);
    const count = page.getByText("Count: 2", { exact: true }).filter({ visible: true });
    await expect(count).toBeVisible();
    for (const shell of ["workbench", "desktop", "marketing"]) {
      await pick(page, shell);
      await expect(count, `the count in ${shell}`).toBeVisible();
    }
  } finally {
    await context.close();
  }
});

test("the reader's place on a docs page is kept across a swap", async ({ browser }) => {
  const context = await reader(browser);
  try {
    const page = await context.newPage();
    await open(page, "/start/first-app/");
    const heading = page.getByRole("heading", { name: /^Edit live with/ }).filter({ visible: true }).first();
    await heading.evaluate((element) => element.scrollIntoView({ block: "start" }));
    await expect(heading).toBeInViewport();
    for (const shell of ["workbench", "desktop", "marketing"]) {
      await pick(page, shell);
      await expect(heading, `the heading is still in view in ${shell}`).toBeInViewport();
    }
  } finally {
    await context.close();
  }
});

test("the pick is kept, and a reload puts it in before the page is seen", async ({ browser }) => {
  const context = await reader(browser);
  try {
    const page = await context.newPage();
    await open(page, "/start/first-app/");
    await pick(page, "desktop");
    // From the first paint on: how the page looked each time another
    // shell came to frame it.
    await page.addInitScript(() => {
      const seen = (window.__seen = []);
      const look = () => {
        const app = document.getElementById("app");
        return app ? getComputedStyle(app).opacity : "";
      };
      document.addEventListener("DOMContentLoaded", () => (window.__atFirst = look()));
      // The script runs before there is a root to watch, so the document
      // is watched, the root's attributes with it.
      new MutationObserver(() => seen.push({ shell: document.documentElement.dataset.ljosShellShowing ?? "", opacity: look() })).observe(document, {
        subtree: true,
        attributes: true,
        attributeFilter: ["data-ljos-shell-showing"],
      });
    });
    await page.reload();
    await page.waitForSelector(HYDRATED);
    await page.waitForFunction(() => "ljosShellShown" in document.documentElement.dataset);
    expect(await showing(page)).toBe("desktop");
    const { seen, first } = await page.evaluate(() => ({ seen: window.__seen, first: window.__atFirst }));
    expect(first, "the page as written is held back").toBe("0");
    for (const { shell, opacity } of seen.filter(({ shell }) => shell !== "desktop"))
      expect(opacity, `the ${shell} shell was not seen`).toBe("0");
    await expect(page.locator("#app")).toHaveCSS("opacity", "1");
  } finally {
    await context.close();
  }
});

test("a reader with no script gets the marketing shell, whatever is kept", async ({ browser }) => {
  const context = await reader(browser, { kept: "desktop", javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(at("/start/first-app/"));
    await expect(page.locator("html")).not.toHaveAttribute("data-ljos-shell");
    await expect(page.locator("#app")).toHaveCSS("opacity", "1");
    await expect(page.getByRole("link", { name: "Docs", exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole("menubar")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("a phone has one menu control, and the switcher says why it shows marketing", async ({ browser }) => {
  const context = await reader(browser, { viewport: PHONE, kept: "workbench" });
  try {
    const page = await context.newPage();
    await open(page, "/");
    expect(await showing(page)).toBe("marketing");
    const header = region(page, "Main");
    const controls = header.getByRole("button").filter({ visible: true });
    await expect(controls).toHaveCount(1);
    await expect(controls.first()).toHaveAccessibleName("Menu");
    await press(controls.first());
    const menu = region(page, "Menu");
    await expect(menu).toBeVisible();
    await press(menu.getByRole("button", { name: SWITCHER }));
    await expect(page.getByText("Workbench and Desktop need a wider window. This one shows Marketing.", { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

// What `data-ljos-swap` was set to, each time (shells.js `swap`).
const swaps = () => {
  const seen = (window.__swaps = []);
  // Before there is a root: the document is watched, the root with it.
  new MutationObserver(() => {
    const kind = document.documentElement.dataset.ljosSwap;
    if (kind) seen.push(kind);
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-ljos-swap"] });
};

test("a swap moves the next shell into place", async ({ browser }) => {
  const context = await reader(browser);
  try {
    const page = await context.newPage();
    await page.addInitScript(swaps);
    await open(page, "/");
    await pick(page, "workbench");
    expect(await page.evaluate(() => window.__swaps)).toEqual(["rich"]);
  } finally {
    await context.close();
  }
});

test("with reduced motion a swap is a crossfade, never a cut", async ({ browser }) => {
  const context = await reader(browser, { reducedMotion: "reduce" });
  try {
    const page = await context.newPage();
    await page.addInitScript(swaps);
    await open(page, "/");
    await pick(page, "desktop");
    expect(await page.evaluate(() => window.__swaps)).toEqual(["calm"]);
    // The crossfade is the head's: an animation of opacity alone.
    const css = await page.evaluate(() =>
      [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules].map((rule) => rule.cssText)).filter((text) => text.includes('data-ljos-swap="calm"')),
    );
    expect(css.join("\n")).toMatch(/ljos-fade-(in|out)/);
  } finally {
    await context.close();
  }
});

test("the shell's own QML is shown, a broken edit falls back and says why, and Reset mends it", async ({ browser }) => {
  const context = await reader(browser);
  try {
    const page = await context.newPage();
    await open(page, "/start/first-app/");
    await pick(page, "workbench");
    await press(switcher(page));
    await press(page.getByRole("button", { name: "View this shell's source", exact: true }));
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Shells/Workbench.qml", { exact: true })).toBeVisible();
    const editor = dialog.getByRole("textbox", { name: "Edit this shell's QML" });
    await expect(editor).toContainText("workbenchShell");
    await editor.click();
    // The field becomes an editor once a reader is in it (Site/CodeEditor.qml).
    await expect(page.locator(`.cm-content[aria-label="Edit this shell's QML"]`)).toBeFocused({ timeout: 30_000 });
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("\n}}");
    await press(dialog.getByRole("button", { name: "Apply", exact: true }));
    await expect.poll(() => showing(page), { message: "the marketing shell stands in", timeout: 30_000 }).toBe("marketing");
    await expect(dialog.getByText(/Shells\/Workbench\.qml:/)).toBeVisible();
    await expect(region(page, "Your First App")).toBeVisible();
    await press(dialog.getByRole("button", { name: "Reset", exact: true }));
    await expect.poll(() => showing(page)).toBe("workbench");
  } finally {
    await context.close();
  }
});

test("the header names the source with an icon", async ({ browser }) => {
  const context = await reader(browser);
  try {
    const page = await context.newPage();
    await open(page, "/");
    const github = page.getByRole("link", { name: "Ljós on GitHub", exact: true }).filter({ visible: true }).first();
    await expect(github).toHaveAttribute("href", "https://github.com/hal-c2/ljos-ui");
    await expect(github).toHaveText("");
  } finally {
    await context.close();
  }
});

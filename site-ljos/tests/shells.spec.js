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

// From the first paint on, each frame: which shell framed the page and
// how much of the page could be seen (sampled as painted, not as
// attributes change: a shell can come between two changes).
const frames = () => {
  const seen = (window.__seen = []);
  const look = () => {
    const app = document.getElementById("app");
    return app ? getComputedStyle(app).opacity : "";
  };
  document.addEventListener("DOMContentLoaded", () => (window.__atFirst = look()));
  const each = () => {
    const opacity = look();
    if (opacity !== "") seen.push({ shell: document.documentElement.dataset.ljosShellShowing ?? "", opacity, t: performance.now() });
    requestAnimationFrame(each);
  };
  requestAnimationFrame(each);
};

// The head's watchdog (assets/head.html: 2500 ms waiting, then a 160 ms
// fade) held where it stands as the page loads, to be set going when a
// test says (`__fade(at, run)`, at in the watchdog's own ms), so a test
// can have it show the page at one moment of the kept shell's coming
// and not another.
//
// The head also says the page is late on its own timer
// (`setTimeout(l, %SHELL_WAIT%)`), which would come before any fade a
// test sets going: that timer is held back here, so only the fade
// starting can say so.
const watchdog = () => {
  const wait = window.setTimeout;
  window.setTimeout = function (run, ms, ...rest) {
    if (document.readyState === "loading" && ms === 2500 && !window.__heldTimer) {
      window.__heldTimer = run;
      return 0;
    }
    return wait.call(this, run, ms, ...rest);
  };
  const find = () => document.getAnimations().find((animation) => animation.animationName === "ljos-shell-late");
  addEventListener("animationstart", (event) => {
    if (event.animationName === "ljos-shell-late") window.__fadeAt = performance.now();
  });
  window.__fade = (at, run) => {
    const animation = find();
    animation.currentTime = at;
    if (run) animation.play();
    else animation.pause();
    return performance.now();
  };
  document.addEventListener("DOMContentLoaded", () => find()?.pause());
};

// The kept shell's swap waits for its shell, and in any case a second
// (shells.js `swap`): that second is held back here, so a test can show
// it is something else that lets the swap go, by order and not by the
// clock. The swap's second resolves the view transition's promise: a
// native resolving function, which no page script's own timer passes.
const fallback = () => {
  const wait = window.setTimeout;
  const resolves = (run) => typeof run === "function" && /\[native code\]/.test(String(run));
  window.setTimeout = function (run, ms, ...rest) {
    if (
      ms === 1000 &&
      "ljosSwap" in document.documentElement.dataset &&
      resolves(run) &&
      !window.__heldFallback
    ) {
      window.__heldFallback = run;
      return 0;
    }
    return wait.call(this, run, ms, ...rest);
  };
};

// When the head's script runs (as near as a page's own script can be,
// before it), when a view transition starts, and when the browser
// shows the page again after its update: until then it holds the last
// picture, whatever the page's styles say (the frames above read the
// styles).
const transitions = () => {
  window.__headAt = performance.now();
  const start = Document.prototype.startViewTransition;
  if (!start) return;
  Document.prototype.startViewTransition = function (...args) {
    window.__swapAt ??= performance.now();
    const transition = start.apply(this, args);
    const letGo = () => (window.__letGoAt ??= performance.now());
    transition.updateCallbackDone.then(letGo, letGo);
    return transition;
  };
};

// A late shell's module as the page's loader has it: its request done,
// the module run (an import of the same address settles only once the
// one the loader waits on has run), and the frames its turn would be
// shown in.
async function settled(page, response) {
  await response.finished();
  await page.evaluate((url) => import(url).then(() => {}, () => {}), response.url());
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
}

// The frames in which a shell other than `kept` could be seen.
const seenOtherThan = (page, kept) => page.evaluate((kept) => window.__seen.filter(({ shell, opacity }) => shell !== kept && opacity !== "0"), kept);

test("the pick is kept, and a reload puts it in before the page is seen", async ({ browser }) => {
  const context = await reader(browser);
  try {
    const page = await context.newPage();
    await open(page, "/start/first-app/");
    await pick(page, "desktop");
    await page.addInitScript(frames);
    await page.reload();
    await page.waitForSelector(HYDRATED);
    await page.waitForFunction(() => "ljosShellShown" in document.documentElement.dataset);
    expect(await showing(page)).toBe("desktop");
    expect(await page.evaluate(() => window.__atFirst), "the page as written is held back").toBe("0");
    await expect(page.locator("#app")).toHaveCSS("opacity", "1");
    expect(await seenOtherThan(page, "desktop"), "frames in which another shell was seen").toEqual([]);
  } finally {
    await context.close();
  }
});

test("with no view transitions, a reload still puts the kept shell in before the page is seen", async ({ browser }) => {
  const context = await reader(browser, { kept: "desktop" });
  try {
    const page = await context.newPage();
    // A browser without them: the swap is made at once (shells.js `swap`).
    await page.addInitScript(() => delete Document.prototype.startViewTransition);
    await page.addInitScript(frames);
    // The shell's module is slow to come, as on a slow connection: well
    // within the head's watchdog, well after the page has come alive.
    await page.route("**/Desktop-*.js", async (route) => {
      await new Promise((done) => setTimeout(done, 600));
      await route.continue();
    });
    await open(page, "/start/first-app/");
    expect(await page.evaluate(() => typeof document.startViewTransition)).toBe("undefined");
    expect(await showing(page)).toBe("desktop");
    await expect(page.locator("#app")).toHaveCSS("opacity", "1");
    expect(await seenOtherThan(page, "desktop"), "frames in which another shell was seen").toEqual([]);
  } finally {
    await context.close();
  }
});

test("a kept shell that comes after the head's watchdog showed the page does not replace it", async ({ browser }) => {
  const context = await reader(browser, { kept: "desktop" });
  try {
    const page = await context.newPage();
    await page.addInitScript(frames);
    // Its module comes long after the head stopped waiting for it.
    let asked = false;
    await page.route("**/Desktop-*.js", async (route) => {
      asked = true;
      await new Promise((done) => setTimeout(done, 5_000));
      await route.continue().catch(() => {});
    });
    const came = page.waitForResponse("**/Desktop-*.js", { timeout: 40_000 });
    await page.goto(at("/start/first-app/"));
    await page.waitForSelector(HYDRATED, { timeout: 40_000 });
    // The watchdog's: the page shows, as written.
    await expect(page.locator("#app")).toHaveCSS("opacity", "1", { timeout: 10_000 });
    const sawFrom = await page.evaluate(() => window.__seen.length);
    // What the module's arrival would set off, given its turn.
    if (asked) await settled(page, await came);
    expect(await showing(page), "the page stays in the shell the reader sees").toBe("marketing");
    const after = await page.evaluate((from) => window.__seen.slice(from).filter(({ shell }) => shell !== "marketing"), sawFrom);
    expect(after, "frames in which another shell came").toEqual([]);
    await expect(page.locator("#app")).toHaveCSS("opacity", "1");
  } finally {
    await context.close();
  }
});

test("when the head's watchdog shows the page during the kept shell's swap, the page is seen at once", async ({ browser }) => {
  const context = await reader(browser, { kept: "desktop" });
  let release = () => {};
  try {
    const page = await context.newPage();
    await page.addInitScript(frames);
    await page.addInitScript(transitions);
    await page.addInitScript(watchdog);
    await page.addInitScript(fallback);
    // The kept shell's module does not come while the test looks: the
    // swap waits for it.
    const released = new Promise((done) => (release = done));
    let responded = false;
    await page.route("**/Desktop-*.js", async (route) => {
      await released;
      await route.continue().catch(() => {});
      responded = true;
    });
    await page.goto(at("/start/first-app/"));
    // In order, not by the clock: the swap has started and is waiting
    // (its own fallback held back), and nothing has said the page is
    // late, the head's timer and fade both held.
    await page.waitForFunction(() => typeof window.__heldFallback === "function", null, { polling: 50, timeout: 40_000 });
    expect(await page.evaluate(() => window.__swapAt !== undefined), "the kept shell's swap has started").toBe(true);
    expect(await page.evaluate(() => window.__letGoAt), "the swap is still holding the page").toBeUndefined();
    expect(await page.evaluate(() => "ljosShellLate" in document.documentElement.dataset), "nothing has said the page is late").toBe(false);
    // Now the head's watchdog: its timer says the page is late as its
    // fade starts (assets/head.html, both at %SHELL_WAIT%).
    await page.evaluate(() => {
      window.__heldTimer();
      window.__fade(2500, true);
    });
    // Only the watchdog can let the swap go now: its fallback never fires.
    await page.waitForFunction(() => window.__letGoAt !== undefined, null, { polling: 50, timeout: 5_000 });
    expect(responded, "the Desktop module is still on its way").toBe(false);
    const letGoAt = await page.evaluate(() => window.__letGoAt);
    await page.waitForFunction((from) => window.__seen.some(({ t, opacity }) => t > from && opacity !== "0"), letGoAt, { polling: 50, timeout: 5_000 });
    const first = await page.evaluate((from) => window.__seen.find(({ t, opacity }) => t > from && opacity !== "0"), letGoAt);
    expect(first.shell, "the page is seen in the shell it is written in").toBe("marketing");
    await expect(page.locator("#app")).toHaveCSS("opacity", "1");
    expect(await showing(page)).toBe("marketing");
  } finally {
    release();
    await context.close();
  }
});

test("a kept shell that comes while the head's watchdog fades the page in does not replace it", async ({ browser }) => {
  const context = await reader(browser, { kept: "desktop" });
  try {
    const page = await context.newPage();
    await page.addInitScript(frames);
    await page.addInitScript(watchdog);
    let asked;
    const wanted = new Promise((done) => (asked = done));
    let release;
    const released = new Promise((done) => (release = done));
    await page.route("**/Desktop-*.js", async (route) => {
      asked();
      await released;
      await route.continue().catch(() => {});
    });
    const came = page.waitForResponse("**/Desktop-*.js", { timeout: 40_000 });
    await page.goto(at("/start/first-app/"));
    await page.waitForSelector(HYDRATED, { timeout: 40_000 });
    // The Desktop module is asked for before anything says the page is
    // late (once it is, Main.qml never asks): whichever comes first.
    const lateFirst = page
      .waitForFunction(() => "ljosShellLate" in document.documentElement.dataset, null, { polling: 50, timeout: 40_000 })
      .then(() => "late");
    expect(await Promise.race([wanted.then(() => "asked"), lateFirst]), "the Desktop module is asked for before the page is said to be late").toBe("asked");
    // The swap to it has stopped waiting (a second, shells.js `swap`):
    // the page is still held back, and the module still on its way.
    await page.waitForFunction(() => !("ljosSwap" in document.documentElement.dataset), null, { polling: 50 });
    expect(await page.evaluate(() => getComputedStyle(document.getElementById("app")).opacity)).toBe("0");
    // Nothing has said the page is late yet: the head's timer is held
    // back, and its fade has not started.
    expect(await page.evaluate(() => typeof window.__heldTimer), "the head's timer is held back").toBe("function");
    expect(await page.evaluate(() => "ljosShellLate" in document.documentElement.dataset)).toBe(false);
    // The watchdog half way through its fade, held there: the reader
    // sees Marketing coming in.
    await page.evaluate(() => window.__fade(2580, false));
    await page.waitForFunction(() => window.__fadeAt !== undefined, null, { polling: 50 });
    const fadeAt = await page.evaluate(() => window.__fadeAt);
    const opacity = Number(await page.evaluate(() => getComputedStyle(document.getElementById("app")).opacity));
    expect(opacity, "the page is half seen").toBeGreaterThan(0);
    expect(opacity, "the page is half seen").toBeLessThan(1);
    // Now the module comes.
    release();
    await settled(page, await came);
    expect(await showing(page), "the page stays in the shell the reader sees").toBe("marketing");
    const after = await page.evaluate((from) => window.__seen.filter(({ t, shell }) => t >= from && shell !== "marketing"), fadeAt);
    expect(after, "frames in which another shell came").toEqual([]);
    await page.evaluate(() => window.__fade(2660, true));
    await expect(page.locator("#app")).toHaveCSS("opacity", "1");
  } finally {
    await context.close();
  }
});

test("the Desktop shell keeps every page the reader opened as a tab", async ({ browser }) => {
  const context = await reader(browser, { kept: "desktop" });
  try {
    const page = await context.newPage();
    await open(page, "/start/first-app/");
    const tabs = page.getByRole("tablist", { name: "Open pages" }).getByRole("tab");
    await expect(tabs).toHaveCount(1);
    await expect(tabs.first()).toHaveAccessibleName(/Your First App/);
    await page.getByRole("link", { name: "Editor Setup", exact: true }).filter({ visible: true }).first().click();
    await page.waitForURL("**/start/editors/");
    await expect(tabs, "the page left is still a tab").toHaveCount(2);
    await expect(tabs.nth(0)).toHaveAccessibleName(/Your First App/);
    await expect(tabs.nth(1)).toHaveAccessibleName(/Editor Setup/);
  } finally {
    await context.close();
  }
});

test("the shell choices come on a later press when the first could not load them", async ({ browser }) => {
  const context = await reader(browser);
  try {
    const page = await context.newPage();
    let first = true;
    await page.route("**/ShellChoices-*.js", (route) => {
      if (!first) return route.continue();
      first = false;
      return route.abort("connectionreset");
    });
    await open(page, "/");
    const failed = page.waitForEvent("requestfailed", (request) => /ShellChoices-/.test(request.url()));
    await press(switcher(page));
    await failed;
    await expect(page.getByRole("radio", { name: LABEL.desktop, exact: true })).toHaveCount(0);
    await press(switcher(page));
    await expect(page.getByRole("radio", { name: LABEL.desktop, exact: true }), "the choices, asked for again").toBeVisible({ timeout: 30_000 });
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

test("each shell's source shows that shell's own QML, and keeps the reader's edits to each", async ({ browser }) => {
  const context = await reader(browser);
  try {
    const page = await context.newPage();
    await open(page, "/start/first-app/");
    await pick(page, "workbench");
    // Named by the file it shows; the shell choices are a dialog too.
    const dialog = page.getByRole("dialog", { name: /^Shells\// });
    const editor = dialog.getByRole("textbox", { name: "Edit this shell's QML" });
    const view = async () => {
      await press(switcher(page));
      await press(page.getByRole("button", { name: "View this shell's source", exact: true }));
      await expect(dialog).toBeVisible();
    };
    await view();
    await expect(editor).toContainText("workbenchShell");
    await editor.click();
    await expect(page.locator(`.cm-content[aria-label="Edit this shell's QML"]`)).toBeFocused({ timeout: 30_000 });
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.type("// the reader's own\n");
    await expect(editor).toContainText("// the reader's own");
    await press(dialog.getByRole("button", { name: "Close", exact: true }));
    await expect(dialog).toBeHidden();
    await pick(page, "desktop");
    await view();
    await expect(dialog).toHaveAccessibleName("Shells/Desktop.qml");
    await expect(editor, "the Desktop shell's own QML").toContainText("desktopShell");
    await expect(editor).not.toContainText("// the reader's own");
    await press(dialog.getByRole("button", { name: "Close", exact: true }));
    await expect(dialog).toBeHidden();
    await pick(page, "workbench");
    await view();
    await expect(dialog).toHaveAccessibleName("Shells/Workbench.qml");
    await expect(editor, "the Workbench edit, kept").toContainText("// the reader's own");
    await expect(editor).toContainText("workbenchShell");
  } finally {
    await context.close();
  }
});

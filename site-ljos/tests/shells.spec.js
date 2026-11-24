// The site in a shell the reader picks (features/shells.feature): the
// site's state and pages stay, the shell that frames them is swapped
// live, kept for the next visit and put in without a jump, and a reader
// with no script, or on a phone, gets the one every page is written in.
// Which shell frames the page is on its root, `data-ljos-shell-showing`
// (bundle/shells.js `showing`).
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const base = (process.env.LJOS_SITE_BASE ?? "/").replace(/\/?$/, "/");
const at = (route) => `${base}${route.replace(/^\//, "")}`;
const HYDRATED = '#app[data-ljos-hydrated="true"]';
const KEY = "ljos.dev:shell";
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const LABEL = { elegant: "Elegant", workbench: "Workbench", desktop: "Desktop" };
const SHELLS = Object.keys(LABEL);
// What each kind of page's main landmark is named (Site/PageView.qml).
const PAGES = [
  { route: "/", region: "Home" },
  { route: "/demos/", region: "Live demos" },
  { route: "/demos/cockpit/", region: "Svala GT cockpit" },
  { route: "/start/first-app/", region: "Your First App" },
];

// bundle/tokens.js, read as the build reads it: each shell's look.
const { looks } = (() => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../bundle/tokens.js"), "utf8").replace(/^\.pragma library$/m, "");
  return new Function(`${source}\nreturn { looks };`)();
})();

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

// Opened, taken over, and its kept shell in (shells.js `shown`). Once
// the head's watchdog has shown the page as written no kept shell comes
// (Main.qml `late`): that fails here as what it is, with when the page
// was taken over, and is not waited on until the test times out.
async function open(page, route) {
  await page.goto(at(route));
  await page.waitForSelector(HYDRATED, { timeout: 40_000 });
  const taken = await page.evaluate(() => Math.round(performance.now()));
  await page.waitForFunction(() => {
    const said = document.documentElement.dataset;
    return "ljosShellLate" in said || ("ljosShellShown" in said && said.ljosShellShowing);
  });
  const late = await page.evaluate(() => "ljosShellLate" in document.documentElement.dataset);
  expect(late, `${route}: the head's watchdog (2500 ms) showed the page before the kept shell was in; it was taken over by ${taken} ms`).toBe(false);
}

// A press where a finger lands: an item's own press area lies over it.
async function press(locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  expect(box, "the control is laid out").toBeTruthy();
  await locator.page().mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

// Named "Current shell: <the one shown>" where its words show, "Switch shell" as an icon.
const SWITCHER = /^(Switch shell|Current shell: \w+)$/;
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
// The page shown: its content is the main landmark, named for the page.
const shownPage = (page, name) => page.getByRole("main", { name, exact: true }).filter({ visible: true });

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
          if (from !== "elegant") await pick(page, from);
          await expect(shownPage(page, named)).toBeVisible();
          await pick(page, to);
          await expect(shownPage(page, named), "the page is still shown").toBeVisible();
          await expect(switcher(page)).toHaveAccessibleName(`Current shell: ${LABEL[to]}`);
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
        await expect(shownPage(page, named), `${route} shows its page`).toBeVisible();
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
    for (const shell of ["workbench", "desktop", "elegant"]) {
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
    for (const shell of ["workbench", "desktop", "elegant"]) {
      await pick(page, shell);
      await expect(heading, `the heading is still in view in ${shell}`).toBeInViewport();
    }
  } finally {
    await context.close();
  }
});

// A swap inside the quarter second the page waits before it keeps where
// the reader stopped (PageView `keeping`). They stopped near the top
// first, so the place it has kept by then is not the one they scrolled
// to. The pick is made in the page, two frames after the scroll: a
// round trip for each press would as often as not outlast the wait.
test("the reader's place is kept when they swap just after scrolling", async ({ browser }) => {
  const context = await reader(browser);
  try {
    const page = await context.newPage();
    await open(page, "/start/first-app/");
    const heading = page.getByRole("heading", { name: /^Edit live with/ }).filter({ visible: true }).first();
    await heading.evaluate((element) => {
      let scroller = element.parentElement;
      while (scroller && !(/auto|scroll/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight)) scroller = scroller.parentElement;
      scroller.scrollTop = 120;
    });
    await expect.poll(() => page.evaluate(() => history.state?.offset), { message: "the page keeps where they first stopped" }).toBe(120);
    await press(switcher(page));
    const box = await page.getByRole("radio", { name: LABEL.workbench, exact: true }).boundingBox();
    await heading.evaluate(async (element, [clientX, clientY]) => {
      const frame = () => new Promise((done) => requestAnimationFrame(done));
      element.scrollIntoView({ block: "start" });
      await frame();
      await frame();
      // A press as the runtime's inspector makes one (inspect.js `press`).
      const pointer = { bubbles: true, cancelable: true, composed: true, clientX, clientY, pointerId: 1, pointerType: "mouse", isPrimary: true, detail: 1 };
      const under = () => document.elementFromPoint(clientX, clientY);
      under().dispatchEvent(new PointerEvent("pointerdown", { ...pointer, buttons: 1 }));
      under().dispatchEvent(new PointerEvent("pointerup", { ...pointer, buttons: 0 }));
    }, [box.x + box.width / 2, box.y + box.height / 2]);
    await expect.poll(() => showing(page), { message: "Workbench frames the page", timeout: 30_000 }).toBe("workbench");
    await page.waitForFunction(() => !document.documentElement.dataset.ljosSwap);
    await expect(heading, "the heading they scrolled to is still in view").toBeInViewport();
  } finally {
    await context.close();
  }
});

// The page reflows as the window narrows (the shell's page is as wide
// as it may grow, so its blocks and what is in them grow shorter): the
// reader stays at the block they were reading, not at the same distance
// from the top, which is somewhere else by then.
test("the reader's place on the page is kept when the window narrows", async ({ browser }) => {
  const context = await reader(browser, { viewport: { width: 1280, height: 800 } });
  try {
    const page = await context.newPage();
    await open(page, "/demos/");
    const heading = page.getByRole("heading", { name: "Motion", exact: true }).filter({ visible: true }).first();
    await heading.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await expect(heading).toBeInViewport();
    // Where the reader is is kept once they are still (PageView's
    // `keeping`), a quarter second after the page stops moving.
    const kept = () =>
      heading.evaluate((node) => {
        let scroller = null;
        for (let up = node.parentElement; up && !scroller; up = up.parentElement) {
          const overflow = getComputedStyle(up).overflowY;
          if ((overflow === "auto" || overflow === "scroll") && up.scrollHeight > up.clientHeight) scroller = up;
        }
        return scroller !== null && scroller.scrollTop > 0 && Math.abs((history.state?.offset ?? 0) - scroller.scrollTop) < 1;
      });
    await expect.poll(kept, { message: "the page keeps where the reader stopped" }).toBe(true);
    const before = await heading.boundingBox();
    await page.setViewportSize({ width: 1040, height: 800 });
    await expect(heading, `the heading is still in view (it was at ${Math.round(before.y)})`).toBeInViewport();
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
// native resolving function, which has no name. No page script's own
// timer passes one; one it bound is native too, but named "bound …".
const fallback = () => {
  const wait = window.setTimeout;
  const resolves = (run) =>
    typeof run === "function" && run.name === "" && /\[native code\]/.test(String(run));
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
    expect(await showing(page), "the page stays in the shell the reader sees").toBe("elegant");
    const after = await page.evaluate((from) => window.__seen.slice(from).filter(({ shell }) => shell !== "elegant"), sawFrom);
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
    expect(first.shell, "the page is seen in the shell it is written in").toBe("elegant");
    await expect(page.locator("#app")).toHaveCSS("opacity", "1");
    expect(await showing(page)).toBe("elegant");
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
    // sees Elegant coming in.
    await page.evaluate(() => window.__fade(2580, false));
    await page.waitForFunction(() => window.__fadeAt !== undefined, null, { polling: 50 });
    const fadeAt = await page.evaluate(() => window.__fadeAt);
    const opacity = Number(await page.evaluate(() => getComputedStyle(document.getElementById("app")).opacity));
    expect(opacity, "the page is half seen").toBeGreaterThan(0);
    expect(opacity, "the page is half seen").toBeLessThan(1);
    // Now the module comes.
    release();
    await settled(page, await came);
    expect(await showing(page), "the page stays in the shell the reader sees").toBe("elegant");
    const after = await page.evaluate((from) => window.__seen.filter(({ t, shell }) => t >= from && shell !== "elegant"), fadeAt);
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

test("a reader with no script gets the Elegant shell, whatever is kept", async ({ browser }) => {
  const context = await reader(browser, { kept: "desktop", javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(at("/start/first-app/"));
    await expect(page.locator("html")).not.toHaveAttribute("data-ljos-shell");
    await expect(page.locator("#app")).toHaveCSS("opacity", "1");
    await expect(page.getByRole("link", { name: "Docs", exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Open pages" })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("a phone has one menu control, and the switcher says why it shows elegant", async ({ browser }) => {
  const context = await reader(browser, { viewport: PHONE, kept: "workbench" });
  try {
    const page = await context.newPage();
    await open(page, "/");
    expect(await showing(page)).toBe("elegant");
    const header = region(page, "Ljós");
    const controls = header.getByRole("button").filter({ visible: true });
    await expect(controls).toHaveCount(1);
    await expect(controls.first()).toHaveAccessibleName("Menu");
    await press(controls.first());
    const menu = region(page, "Menu");
    await expect(menu).toBeVisible();
    await press(menu.getByRole("button", { name: SWITCHER }));
    await expect(page.getByText("Workbench and Desktop need a wider window. This one shows Elegant.", { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

// What a finger presses: the box that takes the press, not the row drawn round it.
// A field's is not its input, which is a line high and takes the presses on
// the item round it (TextInput.js): `missed` presses that instead.
const TARGETS = 'a[href], button, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"]';
const missed = async (fields, least) => {
  const out = [];
  for (const field of await fields.all()) {
    const { x, y, width, height } = await field.boundingBox();
    for (const off of [1 - least / 2, least / 2 - 1]) {
      await field.evaluate((node) => node.blur());
      await field.page().mouse.click(x + width / 2, y + height / 2 + off);
      if (!(await field.evaluate((node) => node === document.activeElement)))
        out.push(`${await field.getAttribute("aria-label")}: no press ${off} from its middle`);
    }
    await field.evaluate((node) => node.blur());
  }
  return out;
};
const short = (nodes, least) =>
  nodes
    .map((node) => ({ name: node.getAttribute("aria-label") || node.textContent.trim() || node.tagName, high: Math.round(node.getBoundingClientRect().height) }))
    .filter(({ high }) => high < least)
    .map(({ name, high }) => `${name}: ${high}`);

for (const shell of ["elegant"]) {
  test(`what a finger presses in ${shell}'s phone header and menu is 44 high`, async ({ browser }) => {
    const context = await reader(browser, { viewport: PHONE, kept: shell });
    try {
      const page = await context.newPage();
      await open(page, "/start/first-app/");
      const small = async (within) => {
        const targets = within.locator(TARGETS).filter({ visible: true });
        expect(await targets.count(), "there is something to press").toBeGreaterThan(0);
        const fields = within.locator("input, textarea").filter({ visible: true });
        return [...(await targets.evaluateAll(short, 44)), ...(await missed(fields, 44))];
      };
      const header = region(page, "Ljós");
      const found = await small(header);
      await press(header.getByRole("button", { name: "Menu", exact: true }));
      const menu = region(page, "Menu");
      await expect(menu).toBeVisible();
      // It slides in: measured once it stands still.
      await expect(menu).toHaveCSS("opacity", "1");
      found.push(...(await small(menu)));
      await press(menu.getByRole("button", { name: SWITCHER }));
      const choices = page.getByRole("radio").or(page.getByRole("button", { name: "View this shell's QML", exact: true })).filter({ visible: true });
      await expect(choices.first()).toBeVisible();
      found.push(...(await choices.evaluateAll(short, 44)));
      expect(found, "under 44 pixels high").toEqual([]);
    } finally {
      await context.close();
    }
  });
}

// A phone shows Elegant whichever shell is kept.
for (const viewport of [DESKTOP, PHONE]) {
  for (const kept of SHELLS) {
    test(`the header is the Ljós landmark in ${kept}, at ${viewport.width}`, async ({ browser }) => {
      const context = await reader(browser, { kept, viewport });
      try {
        const page = await context.newPage();
        await open(page, "/");
        const shown = viewport === PHONE ? "elegant" : kept;
        expect(await showing(page)).toBe(shown);
        const header = region(page, "Ljós");
        await expect(header).toHaveCount(1);
        await expect(header.getByRole("link", { name: "Ljós, home", exact: true }).filter({ visible: true })).toHaveCount(1);
        if (shown === "desktop") await expect(header.getByRole("toolbar", { name: "Toolbar", exact: true })).toBeVisible();
      } finally {
        await context.close();
      }
    });
  }
}

for (const width of [1000, 1100, 1440]) {
  test(`the Desktop shell's buttons are centred in their bars, at ${width}`, async ({ browser }) => {
    const context = await reader(browser, { kept: "desktop", viewport: { width, height: 900 } });
    try {
      const page = await context.newPage();
      await open(page, "/start/cli/");
      expect(await showing(page)).toBe("desktop");
      const header = region(page, "Ljós");
      const top = await header.boundingBox();
      const toolbar = header.getByRole("toolbar", { name: "Toolbar", exact: true });
      const tools = await toolbar.boundingBox();
      const centre = (box) => box.y + box.height / 2;
      const bars = [
        // The menu bar is what the header has above its toolbar.
        { within: header, names: ["File", "View", "Go", "Help"], middle: (top.y + tools.y) / 2 },
        { within: toolbar, names: ["Back", "Forward", "Home"], middle: centre(tools) },
      ];
      for (const { within, names, middle } of bars) {
        for (const name of names) {
          const box = await within.getByRole("button", { name, exact: true }).filter({ visible: true }).boundingBox();
          expect(Math.abs(centre(box) - middle), `${name}'s centre from its bar's`).toBeLessThanOrEqual(1);
        }
      }
    } finally {
      await context.close();
    }
  });
}

test("the Workbench offers only what it can show", async ({ browser }) => {
  const context = await reader(browser, { kept: "workbench" });
  try {
    const page = await context.newPage();
    await open(page, "/start/first-app/");
    expect(await showing(page)).toBe("workbench");
    const landmark = (name) => page.getByRole("complementary", { name, exact: true }).filter({ visible: true });
    await expect(landmark("Pages")).toHaveCount(1);
    await expect(landmark("Inspector").getByText("The QML this page is made from.").filter({ visible: true })).toHaveCount(1);
    for (const name of ["Observer", "Agent"]) await expect(page.getByRole("tab", { name, exact: true })).toHaveCount(0);
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
    await press(page.getByRole("button", { name: "View this shell's QML", exact: true }));
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Source of Shells/Workbench.qml", { exact: true })).toBeVisible();
    const editor = dialog.getByRole("textbox", { name: "Edit this shell's QML" });
    await expect(editor).toContainText("workbenchShell");
    await editor.click();
    // The field becomes an editor once a reader is in it (Site/CodeEditor.qml).
    await expect(page.locator(`.cm-content[aria-label="Edit this shell's QML"]`)).toBeFocused({ timeout: 30_000 });
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("\n}}");
    await press(dialog.getByRole("button", { name: "Apply", exact: true }));
    await expect.poll(() => showing(page), { message: "the Elegant shell stands in", timeout: 30_000 }).toBe("elegant");
    await expect(dialog.getByText(/Shells\/Workbench\.qml:/)).toBeVisible();
    await expect(shownPage(page, "Your First App")).toBeVisible();
    await press(dialog.getByRole("button", { name: "Reset", exact: true }));
    await expect.poll(() => showing(page)).toBe("workbench");
  } finally {
    await context.close();
  }
});

// A reader's shell that moves the page's place and never resizes it:
// neither the window, the place's size, the shell nor the dock changes.
const MOVING_SHELL = `import QtQuick
import Ljos.Blocks

Rectangle {
    id: shell
    property var site: null
    property bool moved: false
    width: parent ? parent.width : 1440
    height: parent ? parent.height : 900

    Rectangle {
        x: 200
        width: 120
        height: 40
        Accessible.role: Accessible.Button
        Accessible.name: "Move the page"
        MouseArea {
            anchors.fill: parent
            onClicked: shell.moved = true
        }
    }
    Item {
        x: shell.moved ? 100 : 0
        y: shell.moved ? 160 : 60
        width: shell.width - 100
        height: shell.height - 200
        Slot { name: "site.page" }
    }
}
`;

test("the Observer follows a shell that moves the page without resizing it", async ({ browser }) => {
  const context = await reader(browser);
  try {
    const page = await context.newPage();
    const said = listen(page);
    await open(page, "/start/first-app/");
    await pick(page, "workbench");
    await press(switcher(page));
    await press(page.getByRole("button", { name: "View this shell's QML", exact: true }));
    const source = page.getByRole("dialog", { name: /^Source of Shells\// });
    const editor = source.getByRole("textbox", { name: "Edit this shell's QML" });
    await expect(editor).toContainText("workbenchShell");
    await editor.click();
    await expect(page.locator(`.cm-content[aria-label="Edit this shell's QML"]`)).toBeFocused({ timeout: 30_000 });
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText(MOVING_SHELL);
    await press(source.getByRole("button", { name: "Apply", exact: true }));
    const move = page.getByRole("button", { name: "Move the page", exact: true });
    await expect(move, "the reader's shell frames the page").toBeVisible({ timeout: 30_000 });
    await press(source.getByRole("button", { name: "Close shell source", exact: true }));
    await expect(source).toBeHidden();

    const picture = page.locator('img[alt="What this example draws"]').first();
    await press(picture);
    await expect(picture).toBeHidden({ timeout: 30_000 });
    await press(page.getByRole("button", { name: /^Observer for / }).filter({ visible: true }).first());
    const docked = page.getByRole("group", { name: "Observer", exact: true });
    await expect(docked).toBeVisible();
    const placed = async () => {
      const panel = await docked.boundingBox();
      const shown = await shownPage(page, "Your First App").boundingBox();
      return { top: Math.round(panel.y), height: Math.round(panel.height), between: Math.round(panel.x - shown.x - shown.width) };
    };
    const height = DESKTOP.height - 200;
    await expect.poll(placed, { message: "docked beside the page" }).toEqual({ top: 60, height, between: 0 });

    await press(move);
    await expect.poll(placed, { message: "still beside the page where it moved" }).toEqual({ top: 160, height, between: 0 });
    expect(said, "what the page said").toEqual([]);
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

// The icon is a picture in the page as written, one for each scheme, so
// it stands in the header's text colour with no script too.
for (const colorScheme of ["light", "dark"]) {
  for (const javaScriptEnabled of [true, false]) {
    test(`the header's icon is a picture in the ${colorScheme} scheme's text colour, script ${javaScriptEnabled ? "on" : "off"}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: DESKTOP, colorScheme, javaScriptEnabled });
      try {
        const page = await context.newPage();
        await page.goto(at("/start/cli/"));
        if (javaScriptEnabled) await page.waitForSelector(HYDRATED, { timeout: 40_000 });
        const link = page.getByRole("link", { name: "Ljós on GitHub", exact: true }).filter({ visible: true }).first();
        const picture = link.locator("img").filter({ visible: true });
        await expect.poll(() => picture.count(), { message: "one picture is shown as the icon" }).toBe(1);
        await expect.poll(() => picture.evaluate((image) => image.complete && image.naturalWidth > 0), { message: "the picture is loaded" }).toBe(true);
        const { src, text } = await picture.evaluate((image) => ({ src: image.src, text: getComputedStyle(document.documentElement).getPropertyValue("--ljos-text").trim() }));
        expect(await (await page.request.get(src)).text()).toContain(`fill="${text}"`);
        const [box, drawn] = [await link.boundingBox(), await picture.boundingBox()];
        expect(drawn.width, "the icon's size").toBeCloseTo(20, 0);
        expect(drawn.x + drawn.width / 2 - box.x, "centred across its link").toBeCloseTo(box.width / 2, 0);
        expect(drawn.y + drawn.height / 2 - box.y, "centred down its link").toBeCloseTo(box.height / 2, 0);
      } finally {
        await context.close();
      }
    });
  }
}

test("the site's buttons are set in its own type", async ({ browser }) => {
  const context = await reader(browser);
  try {
    const page = await context.newPage();
    await open(page, "/start/first-app/");
    // The face of the node the words are in: a button's own node is named by them.
    const face = (button) =>
      button.evaluate((node) => {
        const texts = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        while (texts.nextNode())
          if (texts.currentNode.textContent.trim()) return getComputedStyle(texts.currentNode.parentElement).fontFamily;
        return "no words";
      });
    await press(switcher(page));
    const view = page.getByRole("button", { name: "View this shell's QML", exact: true });
    await expect.poll(() => face(view)).toMatch(/^"?Inter/);
    await press(view);
    const dialog = page.getByRole("dialog", { name: /^Source of Shells\// });
    for (const name of ["Apply", "Reset"])
      await expect.poll(() => face(dialog.getByRole("button", { name, exact: true })), { message: name }).toMatch(/^"?Inter/);
  } finally {
    await context.close();
  }
});

// The other shells' colours are not in the page's head but a stylesheet
// it names (the build's `looks`): a shell picked, or kept, still brings
// its own ground and text to the HTML around the app.
for (const how of ["picked", "kept"]) {
  test(`a shell ${how} brings its own colours to the HTML around the app`, async ({ browser }) => {
    const context = await reader(browser, { kept: how === "kept" ? "workbench" : "" });
    try {
      const page = await context.newPage();
      const said = listen(page);
      await open(page, "/start/cli/");
      if (how === "picked") await pick(page, "workbench");
      expect(await showing(page)).toBe("workbench");
      const tone = (name) => page.evaluate((name) => getComputedStyle(document.documentElement).getPropertyValue(`--ljos-${name}`).trim().toLowerCase(), name);
      await expect.poll(() => tone("canvas"), { message: "the ground is Workbench's" }).toBe(looks.workbench.light.canvas.toLowerCase());
      expect(await tone("text")).toBe(looks.workbench.light.text.toLowerCase());
      expect(said).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test("the header's icon takes the text colour of the shell picked", async ({ browser }) => {
  const context = await reader(browser);
  try {
    const page = await context.newPage();
    await open(page, "/start/cli/");
    await pick(page, "workbench");
    const picture = page.getByRole("link", { name: "Ljós on GitHub", exact: true }).filter({ visible: true }).first().locator("img").filter({ visible: true });
    await expect(picture).toHaveAttribute("src", /github-mark-workbench/);
    const { src, text } = await picture.evaluate((image) => ({ src: image.src, text: getComputedStyle(document.documentElement).getPropertyValue("--ljos-text").trim() }));
    expect(await (await page.request.get(src)).text()).toContain(`fill="${text}"`);
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
    const dialog = page.getByRole("dialog", { name: /^Source of Shells\// });
    const editor = dialog.getByRole("textbox", { name: "Edit this shell's QML" });
    const view = async () => {
      await press(switcher(page));
      await press(page.getByRole("button", { name: "View this shell's QML", exact: true }));
      await expect(dialog).toBeVisible();
    };
    await view();
    await expect(editor).toContainText("workbenchShell");
    await editor.click();
    await expect(page.locator(`.cm-content[aria-label="Edit this shell's QML"]`)).toBeFocused({ timeout: 30_000 });
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.type("// the reader's own\n");
    await expect(editor).toContainText("// the reader's own");
    await press(dialog.getByRole("button", { name: "Close shell source", exact: true }));
    await expect(dialog).toBeHidden();
    await pick(page, "desktop");
    await view();
    await expect(dialog).toHaveAccessibleName("Source of Shells/Desktop.qml");
    await expect(editor, "the Desktop shell's own QML").toContainText("desktopShell");
    await expect(editor).not.toContainText("// the reader's own");
    await press(dialog.getByRole("button", { name: "Close shell source", exact: true }));
    await expect(dialog).toBeHidden();
    await pick(page, "workbench");
    await view();
    await expect(dialog).toHaveAccessibleName("Source of Shells/Workbench.qml");
    await expect(editor, "the Workbench edit, kept").toContainText("// the reader's own");
    await expect(editor).toContainText("workbenchShell");
  } finally {
    await context.close();
  }
});

// What each shell is, in the one line the switcher gives it.
test("the switcher lists every shell, each with a line that says what it is", async ({ browser }) => {
  const context = await reader(browser);
  try {
    const page = await context.newPage();
    await open(page, "/");
    await press(switcher(page));
    const choices = page.getByRole("radio").filter({ visible: true });
    await expect(choices).toHaveCount(SHELLS.length);
    for (const [at, name] of SHELLS.entries()) {
      await expect(choices.nth(at)).toHaveAccessibleName(LABEL[name]);
      await expect(choices.nth(at), `${name}'s line`).toHaveAccessibleDescription(/^\S.{10,90}\.$/);
    }
  } finally {
    await context.close();
  }
});

test("a pick kept under the shell's old name is read as Elegant", async ({ browser }) => {
  const context = await reader(browser, { kept: "marketing" });
  try {
    const page = await context.newPage();
    const said = listen(page);
    await open(page, "/");
    expect(await showing(page)).toBe("elegant");
    await expect(switcher(page)).toHaveAccessibleName("Current shell: Elegant");
    expect(said).toEqual([]);
  } finally {
    await context.close();
  }
});

// The family the text of `node` is drawn in: that of the element that
// holds its first words.
function familyOf(node) {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, { acceptNode: (text) => (text.data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
  const text = walker.nextNode();
  return getComputedStyle(text ? text.parentElement : node).fontFamily;
}
const FACES = { display: "Inter", sans: "Inter", mono: "JetBrains Mono" };

test("Elegant sets its words in the site's own fonts", async ({ browser }) => {
  const context = await reader(browser);
  try {
    const page = await context.newPage();
    const fonts = [];
    page.on("response", (response) => {
      if (/\.woff2(\?|$)/.test(response.url())) fonts.push(new URL(response.url()).pathname);
    });
    await open(page, "/");
    await page.evaluate(() => document.fonts.ready);
    const main = shownPage(page, "Home");
    expect(await main.getByRole("heading", { level: 1 }).first().evaluate(familyOf)).toContain(FACES.display);
    // The words under the headline are the page's body text.
    const body = await main.evaluate((node) => {
      const heading = node.querySelector('[role="heading"][aria-level="1"]');
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let past = false;
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        if (!text.data.trim()) continue;
        if (heading.contains(text.parentElement)) past = true;
        else if (past) return getComputedStyle(text.parentElement).fontFamily;
      }
      return "";
    });
    expect(body).toContain(FACES.sans);
    const code = page.locator(".qq-markup code, .cm-content").filter({ visible: true }).first();
    expect(await code.evaluate((node) => getComputedStyle(node).fontFamily)).toContain(FACES.mono);
    for (const face of Object.values(FACES)) expect(await page.evaluate((face) => document.fonts.check(`16px "${face}"`), face), `${face} is in`).toBe(true);
    // Served by the site, from its own fonts/.
    expect(fonts.length).toBeGreaterThan(0);
    for (const path of fonts) expect(path.startsWith(`${base}fonts/`), path).toBe(true);
  } finally {
    await context.close();
  }
});

// The site ships the fonts its faces name and no others: a file in
// bundle/assets/fonts that no @font-face names is copied to every
// deploy for nothing, and its README row says it is used.
test("the site ships only the fonts its faces name", async ({ page }) => {
  const folder = join(dirname(fileURLToPath(import.meta.url)), "../bundle/assets/fonts");
  const shipped = readdirSync(folder).filter((file) => file.endsWith(".woff2")).sort();
  // The page's head, and the other shells' stylesheet it names.
  let head = await (await page.request.get(at("/"))).text();
  const sheet = /<meta name="ljos-looks" content="([^"]+)"/.exec(head)?.[1];
  if (sheet) head += await (await page.request.get(sheet)).text();
  const named = [...new Set([...head.matchAll(/@font-face\s*\{[^}]*url\("[^"]*fonts\/([^"]+\.woff2)"\)/g)].map((m) => m[1]))].sort();
  expect(named.length, "the head names faces").toBeGreaterThan(0);
  expect(shipped).toEqual(named);
  const listed = [...new Set([...readFileSync(join(folder, "README.md"), "utf8").matchAll(/`([^`]+\.woff2)`/g)].map((m) => m[1]))].sort();
  expect(listed, "the README lists what ships").toEqual(named);
});

for (const [viewport, least, most] of [
  [DESKTOP, 56, 72],
  [PHONE, 36, 40],
]) {
  for (const colorScheme of ["light", "dark"]) {
    test(`Elegant's front page opens on a headline beside a live app at ${viewport.width} in ${colorScheme}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport, colorScheme, reducedMotion: "no-preference" });
      try {
        const page = await context.newPage();
        const said = listen(page);
        await open(page, "/");
        const heading = shownPage(page, "Home").getByRole("heading", { level: 1 }).first();
        const size = await heading.evaluate((node) => {
          const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
          const text = walker.nextNode();
          return parseFloat(getComputedStyle(text ? text.parentElement : node).fontSize);
        });
        expect(size).toBeGreaterThanOrEqual(least);
        expect(size).toBeLessThanOrEqual(most);
        const device = page.getByRole("tablist", { name: "Live app" }).filter({ visible: true });
        await expect(device).toBeVisible();
        await expect(device.getByRole("tab")).toHaveText(["Source", "Observer", "Agent"]);
        for (const name of ["Observer", "Agent", "Source"]) {
          const tab = device.getByRole("tab", { name, exact: true });
          await press(tab);
          await expect(tab).toHaveAttribute("aria-selected", "true");
          await expect(page.getByRole("tabpanel", { name, exact: true }).filter({ visible: true })).toBeVisible();
        }
        expect(said).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
}

// A capability section is a region named for its headline that holds a
// group named "Example": its words are on one side, the example on the
// other, and the sides swap from one section to the next.
const CAPABILITY = (node) => [...node.querySelectorAll('[role="region"]')].filter((section) => section.querySelector(':scope [role="group"][aria-label="Example"]'));
test("Elegant lays a wide page out on a wide grid", async ({ browser }) => {
  const context = await reader(browser);
  try {
    const page = await context.newPage();
    await open(page, "/");
    const main = shownPage(page, "Home");
    const box = await main.evaluate((node) => {
      const own = [...node.querySelectorAll("*")].map((one) => one.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
      const left = Math.min(...own.map((r) => r.left));
      const right = Math.max(...own.map((r) => r.right));
      return { left, right, width: right - left };
    });
    expect(box.width).toBeGreaterThan(1040);
    expect(box.width).toBeLessThanOrEqual(1280);
    expect(Math.abs(box.left - (DESKTOP.width - box.right)), "centred").toBeLessThan(4);
    const sides = await main.evaluate(
      (node, capability) =>
        new Function(`return ${capability}`)()(node).map((section) => {
          const heading = section.querySelector('[role="heading"]').getBoundingClientRect();
          const example = section.querySelector('[role="group"][aria-label="Example"]').getBoundingClientRect();
          return heading.left < example.left ? "words left" : "words right";
        }),
      CAPABILITY.toString(),
    );
    expect(sides.length).toBeGreaterThanOrEqual(2);
    for (let at = 1; at < sides.length; at++) expect(sides[at], `section ${at + 1}`).not.toBe(sides[at - 1]);
  } finally {
    await context.close();
  }
});

// Where a section below the first screen stands and how opaque it is,
// frame by frame, from the moment it is scrolled into view.
async function watchRise(page) {
  const main = shownPage(page, "Home");
  return main.evaluate(async (root, capability) => {
    const node = new Function(`return ${capability}`)()(root).at(-1);
    const opacity = (at) => {
      let value = 1;
      for (let one = at; one; one = one.parentElement) value *= parseFloat(getComputedStyle(one).opacity);
      return value;
    };
    const frames = [];
    node.scrollIntoView({ block: "center" });
    const settle = node.getBoundingClientRect().top;
    const started = performance.now();
    while (performance.now() - started < 900) {
      await new Promise((done) => requestAnimationFrame(done));
      frames.push({ top: node.getBoundingClientRect().top, opacity: opacity(node) });
    }
    return { settle, frames };
  }, CAPABILITY.toString());
}

for (const reducedMotion of ["no-preference", "reduce"]) {
  test(`Elegant's sections ${reducedMotion === "reduce" ? "only fade in with reduced motion" : "rise in the first time they are seen"}`, async ({ browser }) => {
    const context = await reader(browser, { reducedMotion });
    try {
      const page = await context.newPage();
      await open(page, "/");
      const { frames } = await watchRise(page);
      const last = frames.at(-1);
      const moved = Math.max(...frames.map((frame) => frame.top - last.top));
      const faded = Math.min(...frames.map((frame) => frame.opacity));
      expect(last.opacity, "it ends opaque").toBeCloseTo(1, 2);
      expect(faded, "it fades in").toBeLessThan(0.9);
      if (reducedMotion === "reduce") expect(moved, "it does not move").toBeLessThan(0.5);
      else expect(moved, "it rises").toBeGreaterThan(3);
      // Seen once: scrolled away and back, it is simply there.
      await page.mouse.wheel(0, -4000);
      const again = await watchRise(page);
      expect(Math.min(...again.frames.map((frame) => frame.opacity)), "the second time").toBeCloseTo(1, 2);
    } finally {
      await context.close();
    }
  });
}

// The logo is the user's: the mark and the word are main's in every
// shell, whatever that shell's type and colours are (Site/Wordmark.qml).
const LOGO_FACE = "system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, Helvetica Neue, Arial, sans-serif";
for (const kept of SHELLS)
  for (const colorScheme of ["light", "dark"])
    for (const viewport of [DESKTOP, PHONE]) {
      test(`the logo is the user's in ${kept}, ${colorScheme}, at ${viewport.width}`, async ({ browser }) => {
        const context = await reader(browser, { kept, viewport });
        try {
          const page = await context.newPage();
          await page.emulateMedia({ colorScheme });
          await open(page, "/");
          const ink = colorScheme === "dark" ? "rgb(239, 236, 233)" : "rgb(40, 38, 36)";
          const styled = (word) =>
            word.evaluate((node) => {
              const style = getComputedStyle(node);
              return {
                face: style.fontFamily.replaceAll('"', ""),
                size: style.fontSize,
                weight: style.fontWeight,
                spacing: parseFloat(style.letterSpacing) || 0,
                upper: style.textTransform,
                ink: style.color,
              };
            });
          const same = { face: LOGO_FACE, spacing: 0, upper: "none", ink };
          // The mark's size and the space to its word, read in one go: two
          // reads apart could see the page between two layouts.
          const apart = async (mark, word) =>
            page.evaluate(
              ([mark, word]) => {
                const a = mark.getBoundingClientRect();
                const b = word.getBoundingClientRect();
                return { mark: [Math.round(a.width), Math.round(a.height)], gap: b.left - a.right, at: `mark ${a.left}–${a.right}, word from ${b.left}` };
              },
              [await mark.elementHandle(), await word.elementHandle()],
            );

          const home = page.getByRole("link", { name: "Ljós, home", exact: true }).filter({ visible: true }).first();
          const word = home.getByText("Ljós", { exact: true });
          expect(await styled(word), "the header's word").toEqual({ ...same, size: "22px", weight: "700" });
          const header = await apart(home.locator('img[src$="favicon.svg"]'), word);
          expect(header.mark, "the header's mark").toEqual([28, 28]);
          expect(Math.round(header.gap), `its gap (${header.at})`).toBe(8);

          const line = page.getByText("Ljós — malleable software, everywhere", { exact: true }).filter({ visible: true }).last();
          await line.scrollIntoViewIfNeeded();
          expect(await styled(line), "the footer's line").toEqual({ ...same, size: "16px", weight: "600" });
          const footer = await apart(page.locator('img[src$="favicon.svg"]').filter({ visible: true }).last(), line);
          expect(footer.mark, "the footer's mark").toEqual([20, 20]);
          expect(Math.round(footer.gap), `its gap (${footer.at})`).toBe(8);
        } finally {
          await context.close();
        }
      });
    }

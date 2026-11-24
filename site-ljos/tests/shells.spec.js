// The site in a shell the reader picks (features/shells.feature): the
// site's state and pages stay, the shell that frames them is swapped
// live, kept for the next visit and put in without a jump, and a reader
// with no script gets the one every page is written in.
// Which shell frames the page is on its root, `data-ljos-shell-showing`
// (bundle/shells.js `showing`).
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const base = (process.env.LJOS_SITE_BASE ?? "/").replace(/\/?$/, "/");
const at = (route) => `${base}${route.replace(/^\//, "")}`;
const HYDRATED = '#app[data-ljos-hydrated="true"]';
const KEY = "ljos.dev:shell";
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const LABEL = { elegant: "Elegant", cyberpunk: "Cyberpunk", workbench: "Workbench", desktop: "Desktop" };
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

// Opened, taken over, and its kept shell in (shells.js `shown`).
//
// A kept shell is put in only if it is in before the head's watchdog
// shows the page; after that the page stays as the reader sees it
// (Main.qml `late`). On a busy machine the page itself can be taken
// over after the watchdog, and then no kept shell can come, however
// fast it loads. So a test about what a shell is, not about how a kept
// one arrives, takes the page as it was shown: the shell stayed
// Elegant, which is what being late must do, and the test then picks
// the kept shell as a reader would. The report says so.
//
// A test about the arrival itself (`arrival`) fails instead, with when
// the page was taken over, and is not waited on until it times out.
async function open(page, route, { arrival = false } = {}) {
  await page.goto(at(route));
  await page.waitForSelector(HYDRATED, { timeout: 40_000 });
  const taken = await page.evaluate(() => Math.round(performance.now()));
  await page.waitForFunction(() => {
    const said = document.documentElement.dataset;
    return "ljosShellLate" in said || ("ljosShellShown" in said && said.ljosShellShowing);
  });
  const late = await page.evaluate(() => "ljosShellLate" in document.documentElement.dataset);
  const why = `${route}: the head's watchdog (2500 ms) showed the page before the kept shell was in; it was taken over by ${taken} ms`;
  if (late && !arrival) {
    const kept = await page.evaluate((key) => localStorage.getItem(key), KEY);
    await page.waitForFunction(() => !document.documentElement.dataset.ljosSwap);
    expect(await showing(page), `${why}, and the page stays in the shell it was shown in`).toBe("elegant");
    test.info().annotations.push({ type: "late", description: `${why}; ${kept} was then picked` });
    await pick(page, kept);
    return;
  }
  expect(late, why).toBe(false);
  // A kept shell moves into place as a swap does, and a document in a
  // view transition takes no presses: the test presses once it is in.
  await page.waitForFunction(() => !document.documentElement.dataset.ljosSwap);
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
// The shells whose wide bars hold the switcher as an icon only.
const ICON_SWITCHER = new Set(["workbench", "desktop"]);
const switcher = (page) => page.getByRole("button", { name: SWITCHER }).filter({ visible: true }).first();

// Picks `name` in the shell switcher and waits until it frames the page
// and the swap's transition is over.
async function pick(page, name) {
  // On a phone, Elegant keeps the switcher in its menu.
  const menu = page.getByRole("button", { name: "Menu", exact: true }).filter({ visible: true });
  if ((await switcher(page).count()) === 0 && (await menu.count()) > 0) await press(menu.first());
  await press(switcher(page));
  await press(page.getByRole("radio", { name: LABEL[name], exact: true }));
  // Cyberpunk, Workbench and Desktop come the first time one is picked
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
          // Workbench and Desktop keep the switcher as an icon, named for what it does.
          await expect(switcher(page)).toHaveAccessibleName(ICON_SWITCHER.has(to) ? "Switch shell" : `Current shell: ${LABEL[to]}`);
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

// What the page's words stand on is the site's own ground, drawn where a
// contrast checker can read it. A child of negative z moves a
// Rectangle's fill into a layer of its own (the runtime's qq-under), and
// axe then says of every word over it only that it cannot tell
// (`pseudoContent`): the AA checks would pass because nothing was read.
for (const shell of SHELLS) {
  test(`in the ${shell} shell, axe can read what the page's words stand on`, async ({ browser }) => {
    const context = await reader(browser, { kept: shell });
    try {
      const page = await context.newPage();
      await open(page, "/start/first-app/");
      await expect(shownPage(page, "Your First App")).toBeVisible();
      const { incomplete } = await new AxeBuilder({ page }).include("#app").withRules(["color-contrast"]).analyze();
      const unread = incomplete.flatMap(({ nodes }) => nodes.filter((node) => node.any.some(({ data }) => data?.messageKey === "pseudoContent")).map((node) => node.target.join(" ")));
      expect(unread, "words whose ground axe cannot read").toEqual([]);
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
    for (const shell of ["cyberpunk", "workbench", "desktop", "elegant"]) {
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
    for (const shell of ["cyberpunk", "workbench", "desktop", "elegant"]) {
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
    // The head's watchdog runs on the wall clock here: a shell that comes
    // after it has shown the page is never said to be shown, so the wait
    // ends on either and says which.
    const outcome = await page
      .waitForFunction(() => {
        const set = document.documentElement.dataset;
        return "ljosShellShown" in set ? "shown" : "ljosShellLate" in set ? "late" : false;
      })
      .then((handle) => handle.jsonValue());
    expect(outcome, "the kept shell came before the head's watchdog (2500 ms) showed the page without it").toBe("shown");
    expect(await showing(page)).toBe("desktop");
    expect(await page.evaluate(() => window.__atFirst), "the page as written is held back").toBe("0");
    await expect(page.locator("#app")).toHaveCSS("opacity", "1");
    expect(await seenOtherThan(page, "desktop"), "frames in which another shell was seen").toEqual([]);
  } finally {
    await context.close();
  }
});

// The front page's replay starts itself, and its module is the most the
// page asks for after it is taken over. Asked for while the kept shell is
// still coming, it takes the time the head holds the page back for, and
// on a slow machine the head's watchdog gives up on the shell.
test("the front page's replay is asked for only once the kept shell is in", async ({ browser }) => {
  const context = await reader(browser, { kept: "desktop" });
  try {
    const page = await context.newPage();
    // When the kept shell was said to be in, on the page's own clock.
    await page.addInitScript(() => {
      new MutationObserver((_, watching) => {
        if (!("ljosShellShown" in document.documentElement.dataset)) return;
        window.__shownAt = performance.now();
        watching.disconnect();
      }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-ljos-shell-shown"] });
    });
    await open(page, "/");
    // Shown, or given up on by the head's watchdog: the wait says which.
    const outcome = await page
      .waitForFunction(() => {
        const set = document.documentElement.dataset;
        return "ljosShellShown" in set ? "shown" : "ljosShellLate" in set ? "late" : false;
      })
      .then((handle) => handle.jsonValue());
    expect(outcome, "the kept shell came before the head's watchdog (2500 ms) showed the page without it").toBe("shown");
    expect(await showing(page)).toBe("desktop");
    await expect(page.getByRole("button", { name: "Pause the agent replay" }), "the replay started itself").toBeVisible({ timeout: 30_000 });
    const asked = await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .filter((entry) => /\/AgentStage-[^/]*\.js$/.test(entry.name))
        .map((entry) => Math.round(entry.startTime)),
    );
    const shownAt = await page.evaluate(() => Math.round(window.__shownAt));
    expect(asked, "the replay's module, asked for once").toHaveLength(1);
    expect(asked[0], `asked for at ${asked[0]} ms, the kept shell in at ${shownAt} ms`).toBeGreaterThanOrEqual(shownAt);
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
    await open(page, "/start/first-app/", { arrival: true });
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

// A page taken over only after the head's watchdog showed it, as on a
// busy machine: no kept shell can be put in by then, however fast its
// module comes. The page stays in Elegant without a frame of the kept
// shell, and the kept shell is still the reader's to pick.
test("a page taken over after the head's watchdog stays in Elegant, and the kept shell comes when picked", async ({ browser }) => {
  const context = await reader(browser, { kept: "desktop" });
  try {
    const page = await context.newPage();
    await page.addInitScript(frames);
    // The page's start (its `data-ljos-start` module) comes late: that
    // holds the take-over, as a busy machine's would be.
    await page.route("**/assets/solid-*.js", async (route) => {
      await new Promise((done) => setTimeout(done, 3_500));
      await route.continue().catch(() => {});
    });
    // Not to its load, which waits on the module held.
    await page.goto(at("/start/first-app/"), { waitUntil: "commit" });
    // The watchdog's: the page shows, as written, before it is taken over.
    await page.waitForFunction(() => "ljosShellLate" in document.documentElement.dataset, null, { polling: 50, timeout: 10_000 });
    expect(await page.locator(HYDRATED).count(), "the page is not taken over yet").toBe(0);
    await expect(page.locator("#app")).toHaveCSS("opacity", "1");
    await page.waitForSelector(HYDRATED, { timeout: 40_000 });
    await page.evaluate(() => new Promise((done) => setTimeout(done, 1_000)));
    expect(await showing(page), "the page stays in the shell the reader sees").toBe("elegant");
    // Before the take-over the page says no shell; after it, Elegant.
    const others = await page.evaluate(() => window.__seen.filter(({ shell }) => shell !== "" && shell !== "elegant"));
    expect(others, "frames in which another shell came").toEqual([]);
    await pick(page, "desktop");
    expect(await showing(page)).toBe("desktop");
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
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await press(page.getByRole("button", { name: "Close document tab", exact: true }).filter({ visible: true }).first());
    await expect(tabs, "only the page the reader is on").toHaveCount(1);
    await expect(tabs.first()).toHaveAccessibleName(/Editor Setup/);
    expect(new URL(page.url()).pathname).toBe(at("/start/editors/"));
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

// Workbench and Desktop on a phone: one pane, a tab bar along the
// bottom to change it, and the one menu control in the header.
for (const [shell, tabs, pane, region_] of [
  ["workbench", ["Explorer", "Preview", "Inspector", "Problems"], "Explorer", "Explorer"],
  ["desktop", ["Page", "Pages", "Open pages"], "Pages", "Pages"],
]) {
  test(`${shell} stands on a phone as one pane with a tab bar along the bottom`, async ({ browser }) => {
    const context = await reader(browser, { viewport: PHONE, kept: shell });
    try {
      const page = await context.newPage();
      const said = listen(page);
      await open(page, "/");
      expect(await showing(page)).toBe(shell);
      const header = region(page, "Ljós");
      const controls = header.getByRole("button").filter({ visible: true });
      await expect(controls).toHaveCount(1);
      await expect(controls.first()).toHaveAccessibleName("Menu");
      const bar = page.getByRole("tablist", { name: "Views", exact: true });
      await expect(bar.getByRole("tab")).toHaveText(tabs);
      const box = await bar.boundingBox();
      expect(box.y + box.height, "the tab bar sits on the bottom edge").toBeGreaterThanOrEqual(PHONE.height - 1);
      await expect(bar.getByRole("tab", { selected: true })).toHaveText(shell === "workbench" ? "Preview" : "Page");
      await expect(shownPage(page, "Home")).toBeVisible();
      await press(bar.getByRole("tab", { name: pane, exact: true }));
      await expect(bar.getByRole("tab", { name: pane, exact: true })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("complementary", { name: region_, exact: true }).filter({ visible: true })).toBeVisible();
      await expect(shownPage(page, "Home"), "the pane is shown in the page's place").toBeHidden();
      // Nothing is wider than the phone.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(PHONE.width);
      await press(controls.first());
      const menu = region(page, "Menu");
      await expect(menu).toBeVisible();
      await expect(menu.getByRole("textbox", { name: "Search", exact: true })).toBeVisible();
      await expect(menu.getByRole("button", { name: SWITCHER })).toBeVisible();
      await press(menu.getByRole("button", { name: SWITCHER }));
      await expect(page.getByText("Workbench and Desktop need a wider window. This one shows Elegant.", { exact: true })).toHaveCount(0);
      expect(said).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

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

for (const shell of ["elegant", "cyberpunk"]) {
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

for (const [shell, pane] of [
  ["workbench", "Explorer"],
  ["workbench", "Inspector"],
  ["workbench", "Problems"],
  ["desktop", "Pages"],
  ["desktop", "Open pages"],
]) {
  test(`what a finger presses in ${shell}'s ${pane} pane on a phone is 44 high`, async ({ browser }) => {
    const context = await reader(browser, { viewport: PHONE, kept: shell });
    try {
      const page = await context.newPage();
      await open(page, "/start/first-app/");
      const views = page.getByRole("tablist", { name: "Views", exact: true });
      const to = (name) => press(views.getByRole("tab", { name, exact: true }));
      const aside = (name) => page.getByRole("complementary", { name, exact: true }).filter({ visible: true });
      const found = [];
      const measure = async (targets) => {
        await expect(targets.first(), "there is something to press").toBeVisible({ timeout: 30_000 });
        found.push(...(await targets.evaluateAll(short, 44)));
      };
      if (pane === "Open pages") {
        // A page alone has no close: a second is opened first.
        await to("Pages");
        await press(aside("Pages").getByRole("link", { name: "All demos", exact: true }));
        await expect(shownPage(page, "Live demos")).toBeVisible();
      }
      await to(pane);
      if (pane === "Explorer" || pane === "Pages") {
        await measure(aside(pane).locator(TARGETS).filter({ visible: true }));
      } else if (pane === "Inspector") {
        // Its one view is the Source, so it holds no tab: what it holds to press is the editor's.
        await measure(aside(pane).getByRole("button").filter({ visible: true }));
      } else if (pane === "Problems") {
        const tabs = page.getByRole("tablist", { name: "Panel", exact: true }).getByRole("tab");
        await measure(tabs);
        await press(tabs.filter({ hasText: "MCP log" }));
        await measure(page.getByRole("button", { name: "Clear log", exact: true }).filter({ visible: true }));
      } else {
        await measure(page.getByRole("tablist", { name: pane, exact: true }).getByRole("tab"));
        const closes = page.getByRole("button", { name: "Close document tab", exact: true }).filter({ visible: true });
        await measure(closes);
        for (const close of await closes.all()) {
          const { width } = await close.boundingBox();
          if (width < 44) found.push(`Close document tab: ${Math.round(width)} wide`);
        }
      }
      expect(found, "under 44 pixels").toEqual([]);
    } finally {
      await context.close();
    }
  });
}

// Every shell stands on a phone, where Desktop's toolbar has no room.
for (const viewport of [DESKTOP, PHONE]) {
  for (const kept of SHELLS) {
    test(`the header is the Ljós landmark in ${kept}, at ${viewport.width}`, async ({ browser }) => {
      const context = await reader(browser, { kept, viewport });
      try {
        const page = await context.newPage();
        await open(page, "/");
        expect(await showing(page)).toBe(kept);
        const header = region(page, "Ljós");
        await expect(header).toHaveCount(1);
        await expect(header.getByRole("link", { name: "Ljós, home", exact: true }).filter({ visible: true })).toHaveCount(1);
        if (kept === "desktop" && viewport === DESKTOP) await expect(header.getByRole("toolbar", { name: "Toolbar", exact: true })).toBeVisible();
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
        // Its menus are a menu bar's items, as a desktop app's are.
        { within: header.getByRole("menubar", { name: "Menu bar", exact: true }), role: "menuitem", names: ["File", "View", "Go", "Help"], middle: (top.y + tools.y) / 2 },
        { within: toolbar, role: "button", names: ["Back", "Forward", "Home"], middle: centre(tools) },
      ];
      for (const { within, role, names, middle } of bars) {
        for (const name of names) {
          const box = await within.getByRole(role, { name, exact: true }).filter({ visible: true }).boundingBox();
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
    // The site's pages are the Explorer's files, in one landmark, not a second list beside it.
    await expect(landmark("Explorer")).toHaveCount(1);
    await expect(landmark("Pages")).toHaveCount(0);
    await expect(landmark("Inspector").getByRole("textbox", { name: "Edit the running shell's QML" })).toBeVisible();
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
// its own ground and text to the HTML around the app. The colours are
// tested, not how a kept shell arrives: a page taken over after the
// watchdog stays Elegant, and the kept shell is then picked (`open`).
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

// A kept shell's colours hold the page's first frame back until they
// come (the head asks for them with `blocking="render"`), and are the
// page's from then on, before the page says which shell it shows: no
// frame is drawn in the default shell's ground and then changes under
// the reader. Each frame's ground is read where it is drawn: in a
// requestAnimationFrame, which no render-blocked page runs. The frames
// are those drawn while the shell may still come: until it is shown, or
// until the head's watchdog gives up on it (a page taken over late, on a
// busy machine), when the page is Elegant's and takes Elegant's colours.
test("a kept shell's page is never drawn in Elegant's colours while its own come", async ({ browser }) => {
  const context = await reader(browser, { kept: "workbench" });
  try {
    const page = await context.newPage();
    await page.route(/\/looks-[0-9a-f]{10}\.css$/, async (route) => {
      await new Promise((done) => setTimeout(done, 800));
      await route.continue();
    });
    await page.addInitScript(() => {
      window.__grounds = [];
      const look = () => {
        const said = document.documentElement.dataset;
        if ("ljosShellLate" in said) return;
        const ground = getComputedStyle(document.documentElement).getPropertyValue("--ljos-canvas").trim().toLowerCase();
        if (ground) window.__grounds.push(ground);
        if (!("ljosShellShown" in said)) requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    });
    await open(page, "/start/cli/");
    const grounds = await page.evaluate(() => window.__grounds);
    expect(grounds.length, "frames were drawn").toBeGreaterThan(0);
    expect([...new Set(grounds)], "every frame's ground").toEqual([looks.workbench.light.canvas.toLowerCase()]);
  } finally {
    await context.close();
  }
});

// Colours that never come hold the page back no longer than the head's
// watchdog does (2500 ms): as it shows the page it drops their pending
// request, render block and all, and the page stays in Elegant's own
// colours, which a late sheet would otherwise turn into the kept
// shell's under the reader. A frame is seen by a requestAnimationFrame,
// which no render-blocked page runs.
test("colours that never come hold the page back no longer than the watchdog", async ({ browser }) => {
  const context = await reader(browser, { kept: "workbench" });
  let release = () => {};
  const held = new Promise((done) => (release = done));
  try {
    const page = await context.newPage();
    await page.route(/\/looks-[0-9a-f]{10}\.css$/, async (route) => {
      await held;
      await route.continue().catch(() => {});
    });
    await page.addInitScript(() => requestAnimationFrame(() => (window.__drawnAt = performance.now())));
    await page.goto(at("/start/cli/"), { waitUntil: "commit" });
    const drawnAt = await page.waitForFunction(() => window.__drawnAt, null, { polling: 100, timeout: 20_000 }).then((at) => at.jsonValue()).catch(() => null);
    expect(drawnAt, "a frame was drawn while the colours were still on their way").not.toBeNull();
    expect(await page.evaluate(() => "ljosShellLate" in document.documentElement.dataset), "the watchdog showed the page").toBe(true);
    expect(await page.locator("#ljos-looks").count(), "the pending colours are dropped").toBe(0);
    await page.waitForSelector(HYDRATED, { timeout: 40_000 });
    await expect.poll(() => showing(page), { message: "the page stays in Elegant" }).toBe("elegant");
    release();
    await page.waitForTimeout(300);
    const ground = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ljos-canvas").trim().toLowerCase());
    expect(ground, "in Elegant's ground").toBe(looks.elegant.light.canvas.toLowerCase());
  } finally {
    release();
    await context.close();
  }
});

// A kept shell shown in time while its colours are still on their way:
// at the watchdog's deadline their hold on the page ends all the same,
// and they still come to the shell shown. In Chromium hydration itself
// waits behind the render block, so the page can't show the shell in
// time on its own; the test marks it shown, as a browser that runs the
// page under the block would.
test("colours still on their way once the kept shell is shown hold the page back no longer than the watchdog", async ({ browser }) => {
  const context = await reader(browser, { kept: "workbench" });
  let release = () => {};
  const held = new Promise((done) => (release = done));
  try {
    const page = await context.newPage();
    let asked = 0;
    await page.route(/\/looks-[0-9a-f]{10}\.css$/, async (route) => {
      asked++;
      await held;
      await route.continue().catch(() => {});
    });
    await page.addInitScript(() => {
      setTimeout(() => (document.documentElement.dataset.ljosShellShown = ""), 1000);
      requestAnimationFrame(() => (window.__drawnAt = performance.now()));
    });
    await page.goto(at("/start/cli/"), { waitUntil: "commit" });
    const drawnAt = await page.waitForFunction(() => window.__drawnAt, null, { polling: 100, timeout: 10_000 }).then((at) => at.jsonValue()).catch(() => null);
    expect(drawnAt, "a frame was drawn while the colours were still held").not.toBeNull();
    expect("ljosShellLate" in (await page.evaluate(() => ({ ...document.documentElement.dataset }))), "a shell shown in time is not late").toBe(false);
    release();
    const ground = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ljos-canvas").trim().toLowerCase());
    await expect.poll(ground, { message: "the shown shell's colours came" }).toBe(looks.workbench.light.canvas.toLowerCase());
    expect(asked, "asked once").toBe(1);
  } finally {
    release();
    await context.close();
  }
});

// A stylesheet of colours that failed to come is not kept: it is asked
// for once more, whether the page (picked) or the head (kept) asked
// first, and the page takes the shell's colours from the second. A page
// taken over late is Elegant's, and the kept shell is picked (`open`):
// the head's failed request is still the one asked again.
for (const how of ["picked", "kept"]) {
  test(`colours that failed to come for a shell ${how} are asked for once more`, async ({ browser }) => {
    const context = await reader(browser, { kept: how === "kept" ? "workbench" : "" });
    try {
      const page = await context.newPage();
      let asked = 0;
      await page.route(/\/looks-[0-9a-f]{10}\.css$/, (route) => (++asked === 1 ? route.abort() : route.continue()));
      await open(page, "/start/cli/");
      if (how === "picked") await pick(page, "workbench");
      expect(await showing(page)).toBe("workbench");
      const ground = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ljos-canvas").trim().toLowerCase());
      await expect.poll(ground, { message: "the ground is Workbench's" }).toBe(looks.workbench.light.canvas.toLowerCase());
      expect(asked, "asked once more").toBe(2);
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
        // The replay beside the headline, or under it on a phone (from
        // which window it stands beside: the boundary test below).
        const [words, replay] = [await heading.boundingBox(), await page.getByText("Replay · no live agent", { exact: true }).filter({ visible: true }).first().boundingBox()];
        if (viewport.width >= 1279) expect(replay.x, "the replay beside the headline").toBeGreaterThanOrEqual(words.x + words.width);
        else expect(replay.y, "the replay under the headline").toBeGreaterThanOrEqual(words.y + words.height);
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

// The replay stands beside the headline only where the room left it
// beside the words is wide enough for its code beside its app; narrower,
// it goes under them, where it has the page's width. The bound is the
// replay's own, not the page's: at 1176 and 1278 the page is wide, but
// beside the words the replay would stack its code under its app, so it
// stands under them. 1279 is the narrowest window that leaves it room.
for (const [width, beside] of [
  [1176, false],
  [1200, false],
  [1278, false],
  [1279, true],
  [1440, true],
]) {
  test(`at ${width}, the front page's replay stands ${beside ? "beside" : "under"} its headline, its code beside its app`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    try {
      const page = await context.newPage();
      await open(page, "/");
      const box = async (locator) => {
        const shown = locator.filter({ visible: true }).first();
        await expect(shown).toBeVisible();
        return shown.boundingBox();
      };
      const words = await box(shownPage(page, "Home").getByRole("heading", { level: 1 }));
      const replay = await box(page.getByText("Replay · no live agent", { exact: true }));
      const app = await box(page.getByText("North district dispatch", { exact: true }));
      const views = await box(page.getByRole("tablist", { name: "Replay views" }));
      const where = `the replay's label at ${Math.round(replay.x)},${Math.round(replay.y)}, the headline at ${Math.round(words.x)},${Math.round(words.y)} ${Math.round(words.width)}×${Math.round(words.height)}`;
      if (beside) expect(replay.x, `beside the headline: ${where}`).toBeGreaterThanOrEqual(words.x + words.width);
      else expect(replay.y, `under the headline: ${where}`).toBeGreaterThanOrEqual(words.y + words.height);
      expect(views.x, `the replay's views beside its app, at ${Math.round(views.x)},${Math.round(views.y)}; the app's heading ends at ${Math.round(app.x + app.width)}`).toBeGreaterThanOrEqual(app.x + app.width);
    } finally {
      await context.close();
    }
  });
}

// The live app's tabs are one set: an arrow moves the choice and the
// focus with it, so each press goes one tab further. The keys go to the
// item with QML's focus, not the page's, so a press that went on from
// where the last arrow chose is what shows the focus moved: had it
// stayed on Source, the second ArrowRight would choose Observer again.
test("the arrow keys walk the live app's tabs one after another", async ({ browser }) => {
  const context = await reader(browser);
  try {
    const page = await context.newPage();
    await open(page, "/");
    const device = page.getByRole("tablist", { name: "Live app" }).filter({ visible: true });
    const tab = (name) => device.getByRole("tab", { name, exact: true });
    await press(tab("Source"));
    for (const [key, name] of [["ArrowRight", "Observer"], ["ArrowRight", "Agent"], ["ArrowRight", "Agent"], ["ArrowLeft", "Observer"], ["ArrowLeft", "Source"]]) {
      await page.keyboard.press(key);
      await expect(tab(name), `${key} to ${name}`).toHaveAttribute("aria-selected", "true");
    }
  } finally {
    await context.close();
  }
});

// Tab goes from the live app's chosen tab into that tab's panel: the
// panels follow the tabs in the order Tab takes. A console has no tabs:
// there Tab goes through the app first, then the regions beside it. The
// keys go to the item with QML's focus, not the page's, so a button shows
// its focus by its ring, and a task by what Space does to it.
test("Tab goes from the live app's chosen tab into its panel, and in a console from the app on to the regions beside it", async ({ browser }) => {
  const ringed = (button) =>
    button.evaluate((node) => {
      const own = node.getBoundingClientRect();
      return [...node.querySelectorAll("*")].some((part) => {
        const box = part.getBoundingClientRect();
        return box.width > own.width + 2 && box.height > own.height + 2 && getComputedStyle(part).visibility !== "hidden";
      });
    });
  for (const kept of ["elegant", "cyberpunk"]) {
    const context = await reader(browser, { kept });
    try {
      const page = await context.newPage();
      await open(page, "/");
      const main = shownPage(page, "Home");
      if (kept === "elegant") {
        const device = main.getByRole("tablist", { name: "Live app" }).filter({ visible: true });
        await press(device.getByRole("tab", { name: "Agent", exact: true }));
        await page.keyboard.press("Tab");
        const panel = main.getByRole("tabpanel", { name: "Agent", exact: true }).filter({ visible: true });
        await expect.poll(async () => (await Promise.all((await panel.getByRole("button").all()).map(ringed))).some(Boolean), "Tab from the chosen tab goes into its panel").toBe(true);
      } else {
        const stage = main.getByRole("region", { name: "Live stage", exact: true });
        const stream = main.getByRole("region", { name: "Agent MCP stream", exact: true });
        // The panels come after the app but stand at its sides: a press
        // on the app is still the app's.
        const first = stage.getByRole("checkbox").first();
        const was = await first.getAttribute("aria-checked");
        await press(first);
        await expect(first, "a press on the app reaches it").not.toHaveAttribute("aria-checked", was);
        // Back from the agent's first control ("Reset demo" is off until a
        // step is taken) is the app's last task. A press does not give a
        // button the focus, so Tab walks to it from where the press left
        // the keys.
        const next = stream.getByRole("button", { name: "Next step", exact: true });
        let steps = 0;
        while (!(await ringed(next))) {
          expect(++steps, "Tab reaches the agent's first control").toBeLessThan(40);
          await page.keyboard.press("Tab");
        }
        const last = stage.getByRole("checkbox").last();
        const before = await last.getAttribute("aria-checked");
        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Space");
        await expect(last, "Shift+Tab from the agent's calls goes back into the app").not.toHaveAttribute("aria-checked", before);
      }
    } finally {
      await context.close();
    }
  }
});

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

// Cyberpunk's telemetry: each reading is one named group, its label and
// value as one message (Shells/Cyberpunk.qml `Reading`).
const reading = (page, name) => page.getByRole("group", { name }).filter({ visible: true }).first();
const RENDERERS = /^Renderer (WebGPU|WebGL2|Solid DOM)$/;

test("Cyberpunk's telemetry rail says the route, the time, what is alive, the frame rate and the renderer", async ({ browser }) => {
  const context = await reader(browser, { kept: "cyberpunk" });
  try {
    const page = await context.newPage();
    const said = listen(page);
    await open(page, "/start/first-app/");
    expect(await showing(page)).toBe("cyberpunk");
    const rail = region(page, "Ljós");
    await expect(rail.getByRole("group", { name: "Route /start/first-app/", exact: true })).toBeVisible();
    await expect(rail.getByRole("group", { name: /^Clock \d\d:\d\d$/ })).toBeVisible();
    await expect(rail.getByRole("group", { name: /^Objects alive \d+$/ })).toBeVisible();
    // Measured while something moves (the shell's entry): a number, never one made up.
    await expect(rail.getByRole("group", { name: /^Frame rate \d+ fps$/ })).toBeVisible({ timeout: 10_000 });
    await expect(rail.getByRole("group", { name: RENDERERS })).toBeVisible();
    // The time the reader's own clock says.
    const clock = await rail.getByRole("group", { name: /^Clock / }).getAttribute("aria-label");
    const now = await page.evaluate(() => {
      const d = new Date();
      const two = (n) => String(n).padStart(2, "0");
      return [`${two(d.getHours())}:${two(d.getMinutes())}`, `${two(new Date(d.getTime() - 60_000).getHours())}:${two(new Date(d.getTime() - 60_000).getMinutes())}`];
    });
    expect(now, "the clock is the reader's own time").toContain(clock.replace("Clock ", ""));
    // Going elsewhere moves the route the rail says.
    await press(page.getByRole("link", { name: "Demos", exact: true }).filter({ visible: true }).first());
    await expect(rail.getByRole("group", { name: "Route /demos/", exact: true })).toBeVisible();
    expect(said).toEqual([]);
  } finally {
    await context.close();
  }
});

test("Cyberpunk's nav rail goes to each part of the site and marks where the reader is", async ({ browser }) => {
  const context = await reader(browser, { kept: "cyberpunk" });
  try {
    const page = await context.newPage();
    await open(page, "/");
    const rail = region(page, "Sections");
    for (const name of ["Console", "Demos", "Showcase", "Docs", "Shells"]) await expect(rail.getByRole("link", { name, exact: true }), name).toBeVisible();
    await expect(rail.getByRole("button", { name: "Source", exact: true })).toBeVisible();
    // Numbered as a console's channels: 01, 02, …
    await expect(rail.getByText("01", { exact: true })).toBeVisible();
    await expect(rail.getByRole("link", { name: "Console", exact: true })).toHaveAttribute("aria-current", "page");
    await press(rail.getByRole("link", { name: "Demos", exact: true }));
    await expect(shownPage(page, "Live demos")).toBeVisible();
    await expect(rail.getByRole("link", { name: "Demos", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(rail.getByRole("link", { name: "Console", exact: true })).not.toHaveAttribute("aria-current", "page");
    await press(rail.getByRole("link", { name: "Showcase", exact: true }));
    await expect(page.getByRole("heading", { name: "Built with Ljós", exact: true }).filter({ visible: true })).toBeVisible();
    await expect(rail.getByRole("link", { name: "Showcase", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(rail.getByRole("link", { name: "Docs", exact: true })).not.toHaveAttribute("aria-current", "page");
    await press(rail.getByRole("button", { name: "Source", exact: true }));
    await expect(page.getByRole("dialog", { name: "Source of Shells/Cyberpunk.qml" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Edit this shell's QML" })).toContainText("cyberpunkShell");
  } finally {
    await context.close();
  }
});

test("Cyberpunk's front page is a mission console: the Observer tree, the live app and the agent's calls, all at once", async ({ browser }) => {
  const context = await reader(browser, { kept: "cyberpunk" });
  try {
    const page = await context.newPage();
    await open(page, "/");
    const main = shownPage(page, "Home");
    // The live app is shown under "Built for agents": seen there, all of
    // the console is in view at once.
    const agentic = main.getByRole("region", { name: "Your agent can use the app, too.", exact: true });
    const tree = agentic.getByRole("region", { name: "Observer tree", exact: true });
    const stage = agentic.getByRole("region", { name: "Live stage", exact: true });
    const stream = agentic.getByRole("region", { name: "Agent MCP stream", exact: true });
    await stage.scrollIntoViewIfNeeded();
    for (const part of [tree, stage, stream]) await expect(part).toBeInViewport();
    // Each line of the tree reads as a node and its value, never one
    // run over the other: a long name ends in an ellipsis instead.
    const crossed = await tree.evaluate((region) => {
      const words = [...region.querySelectorAll("*")].filter((node) => node.childElementCount === 0 && node.textContent.trim()).map((node) => ({ text: node.textContent.trim(), box: node.getBoundingClientRect() }));
      const over = [];
      for (const a of words)
        for (const b of words)
          if (a !== b && a.box.left < b.box.left && a.box.right > b.box.left + 0.5 && a.box.top < b.box.bottom - 0.5 && b.box.top < a.box.bottom - 0.5) over.push(`${a.text} runs over ${b.text}`);
      return over;
    });
    expect(crossed, "no words in the tree run over others").toEqual([]);
    const [left, centre, right] = await Promise.all([tree, stage, stream].map((part) => part.boundingBox()));
    expect(left.x + left.width, "the tree is left of the app").toBeLessThanOrEqual(centre.x + 1);
    expect(centre.x + centre.width, "the calls are right of the app").toBeLessThanOrEqual(right.x + 1);
    // The tabs give way to the console: nothing to pick, all is shown.
    await expect(agentic.getByRole("tablist").filter({ visible: true })).toHaveCount(0);
    // Sentence case: the headline is written, and drawn, as it is said.
    const headline = main.getByRole("heading", { level: 1 }).first();
    const drawn = await headline.evaluate((node) => getComputedStyle(node.querySelector("*") ?? node).textTransform);
    expect(drawn).not.toBe("uppercase");
    const words = (await headline.textContent()).trim();
    expect(words).not.toBe(words.toUpperCase());
  } finally {
    await context.close();
  }
});

// "Built for agents" gives up its side-by-side only for a console, and
// the device is a console only where it has the width for one
// (DeviceFrame `consoleLayout`): a window that leaves the section
// narrower than that keeps the words beside the tabbed app; 1260 is
// where the hero's own wash once left its device short of one.
for (const width of [1000, 1100, 1200, 1260, 1440]) {
  test(`Cyberpunk's front page stands the live app beside the words, or as a console, at ${width}`, async ({ browser }) => {
    const context = await reader(browser, { kept: "cyberpunk", viewport: { width, height: 900 } });
    try {
      const page = await context.newPage();
      await open(page, "/");
      const agentic = shownPage(page, "Home").getByRole("region", { name: "Your agent can use the app, too.", exact: true });
      await agentic.scrollIntoViewIfNeeded();
      const headline = await agentic.getByRole("heading").first().boundingBox();
      const tabs = agentic.getByRole("tablist").filter({ visible: true });
      if ((await tabs.count()) === 0) {
        await expect(agentic.getByRole("region", { name: "Observer tree", exact: true }), "no tabs, so the app is a console").toBeVisible();
        return;
      }
      const device = await tabs.first().boundingBox();
      expect(device.x, "the tabbed app stands right of the words, not under them").toBeGreaterThanOrEqual(headline.x + headline.width - 1);
    } finally {
      await context.close();
    }
  });
}

test("Cyberpunk stands on a phone, with one menu control and its telemetry along the bottom", async ({ browser }) => {
  const context = await reader(browser, { viewport: PHONE, kept: "cyberpunk" });
  try {
    const page = await context.newPage();
    const said = listen(page);
    await open(page, "/");
    expect(await showing(page)).toBe("cyberpunk");
    const header = region(page, "Ljós");
    const controls = header.getByRole("button").filter({ visible: true });
    await expect(controls).toHaveCount(1);
    await expect(controls.first()).toHaveAccessibleName("Menu");
    const bar = region(page, "Telemetry");
    await expect(bar).toBeVisible();
    const box = await bar.boundingBox();
    expect(box.y + box.height, "the bar sits on the bottom edge").toBeGreaterThanOrEqual(PHONE.height - 1);
    await expect(bar.getByRole("group", { name: "Route /", exact: true })).toBeVisible();
    await expect(bar.getByRole("group", { name: /^Objects alive \d+$/ })).toBeVisible();
    await expect(bar.getByRole("group", { name: /^Frame rate \d+ fps$/ })).toBeVisible({ timeout: 10_000 });
    await expect(bar.getByRole("group", { name: /^Clock \d\d:\d\d$/ })).toBeVisible();
    // Nothing is wider than the phone.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(PHONE.width);
    await press(controls.first());
    await expect(region(page, "Menu")).toBeVisible();
    expect(said).toEqual([]);
  } finally {
    await context.close();
  }
});

// The glitch's bands jump right, past the page's edge; the page clips
// its width only while they do (assets/looks.css), so a phone never
// scrolls sideways and an overflow after it still shows.
test("a phone never scrolls sideways while Cyberpunk glitches in", async ({ browser }) => {
  const context = await reader(browser, { viewport: PHONE, kept: "cyberpunk" });
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__widest = 0;
      window.__glitched = false;
      const frame = () => {
        window.__widest = Math.max(window.__widest, document.documentElement.scrollWidth);
        const app = document.getElementById("app");
        if (app && app.getAnimations().some((animation) => animation.animationName === "ljos-glitch-in")) window.__glitched = true;
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    // The glitch a kept Cyberpunk comes in with is what is tested: a late page fails.
    await open(page, "/", { arrival: true });
    expect(await page.evaluate(() => window.__glitched), "the page glitched in").toBe(true);
    await expect
      .poll(() => page.evaluate(() => document.getElementById("app").getAnimations().filter((animation) => animation.animationName === "ljos-glitch-in").map((animation) => animation.playState)), { message: "the glitch ends" })
      .toEqual(["finished"]);
    expect(await page.evaluate(() => window.__widest), "no frame of the glitch is wider than the phone").toBeLessThanOrEqual(PHONE.width);
    expect(await page.evaluate(() => [getComputedStyle(document.documentElement).overflowX, getComputedStyle(document.body).overflowX])).toEqual(["visible", "visible"]);
  } finally {
    await context.close();
  }
});

// Cyberpunk's scanlines are one still picture, tiled over the whole
// shell; its glitch is the swap's own transition into it (shells.js
// `swap`, assets/looks.css), so it is over when the swap is.
const scanlines = () =>
  [...document.querySelectorAll(".qq-image")]
    .map((node) => ({ node, style: getComputedStyle(node), box: node.getBoundingClientRect() }))
    .filter(({ style, box }) => style.backgroundRepeat === "repeat" && style.backgroundImage.includes("svg") && box.width >= innerWidth - 1 && box.height >= innerHeight - 1)
    .map(({ style }) => style.animationName);

for (const reducedMotion of ["no-preference", "reduce"]) {
  test(`Cyberpunk's scanlines hold still${reducedMotion === "reduce" ? ", and with reduced motion it never glitches" : ", and it glitches as it comes in"}`, async ({ browser }) => {
    const context = await reader(browser, { reducedMotion });
    try {
      const page = await context.newPage();
      await page.addInitScript(swaps);
      await open(page, "/");
      await pick(page, "cyberpunk");
      expect(await page.evaluate(() => window.__swaps)).toEqual([reducedMotion === "reduce" ? "calm" : "glitch"]);
      const glitch = await page.evaluate(() =>
        [...document.styleSheets].flatMap((sheet) =>
          [...sheet.cssRules].filter((rule) => rule.cssText.includes('data-ljos-swap="glitch"')).map((rule) => ({ from: sheet.href ?? "the head", text: rule.cssText })),
        ),
      );
      expect(glitch.map(({ text }) => text).join("\n"), "the glitch is Cyberpunk's own").toMatch(/ljos-glitch/);
      for (const { from } of glitch) expect(from, "it comes with Cyberpunk's colours, not in every page's head").toMatch(/\/looks-[0-9a-f]{10}\.css$/);
      await expect.poll(() => page.evaluate(scanlines), { message: "one still layer of scanlines over the shell" }).toEqual(["none"]);
    } finally {
      await context.close();
    }
  });
}

test("a reader who comes back to Cyberpunk sees it glitch in, unless they asked for reduced motion", async ({ browser }) => {
  const context = await reader(browser, { kept: "cyberpunk" });
  try {
    const page = await context.newPage();
    // How a kept Cyberpunk comes in is what is tested: a late page fails.
    await open(page, "/", { arrival: true });
    const entry = await page.evaluate(() => getComputedStyle(document.getElementById("app")).animationName);
    expect(entry).toContain("ljos-glitch");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await page.waitForSelector(HYDRATED, { timeout: 40_000 });
    expect(await page.evaluate(() => getComputedStyle(document.getElementById("app")).animationName)).not.toContain("ljos-glitch");
  } finally {
    await context.close();
  }
});

// A control of Workbench's or Desktop's whose tooltip says what it does:
// hovered, the one tooltip shown says `words`.
async function tipOf(page, control, words) {
  await control.hover();
  await expect(page.getByRole("tooltip").filter({ visible: true }), `the tooltip of ${await control.getAttribute("aria-label")}`).toHaveText(words);
}
const statusBar = (page) => page.getByRole("status", { name: "Status bar", exact: true }).filter({ visible: true });
const explorerOf = (page) => page.getByRole("complementary", { name: "Explorer", exact: true }).filter({ visible: true });
const inspectorOf = (page) => page.getByRole("complementary", { name: "Inspector", exact: true });
const fontSizeOf = (locator) => locator.evaluate((node) => getComputedStyle(node).fontSize);

test("Workbench lays the site out as an editor's workspace", async ({ browser }) => {
  const context = await reader(browser, { kept: "workbench" });
  try {
    const page = await context.newPage();
    const said = listen(page);
    await open(page, "/start/first-app/");
    const activity = page.getByRole("toolbar", { name: "Activity bar", exact: true });
    for (const [name, tip] of [
      ["Explorer", "Explorer"],
      ["Observer", "Observer"],
      ["Switch shell", "Shell switcher"],
      ["Appearance settings", "Appearance settings"],
    ]) {
      const control = activity.getByRole("button", { name, exact: true });
      await expect(control, `${name} is in the activity bar`).toBeVisible();
      await tipOf(page, control, tip);
    }
    const explorer = explorerOf(page);
    await expect(explorer.getByText("Workspace: ljos.dev", { exact: true })).toBeVisible();
    for (const folder of ["Shells/", "Site/", "Demos/", "Start/", "User interface/"])
      await expect(explorer.getByRole("button", { name: folder, exact: true }), `the folder ${folder}`).toBeVisible();
    await expect(explorer.getByRole("link", { name: "first-app.md", exact: true })).toHaveAttribute("aria-current", "page");

    const inspector = inspectorOf(page);
    await expect(inspector.getByRole("heading", { name: "Source", exact: true })).toBeVisible();
    await expect(inspector.getByRole("tab"), "no tab to stand empty").toHaveCount(0);

    const panel = page.getByRole("tablist", { name: "Panel", exact: true });
    await expect(panel.getByRole("tab")).toHaveText(["Problems", "MCP log", "Output"]);
    await expect(page.getByText("No compiler or lint diagnostics in the open file.", { exact: true })).toBeVisible();

    const status = statusBar(page);
    for (const words of ["Shell: Workbench", "Route: /start/first-app/", "Diagnostics: 0"])
      await expect(status.getByText(words, { exact: true })).toBeVisible();
    await expect(status.getByText(/^Objects: \d+$/)).toBeVisible();
    await expect(status.getByText(/^Renderer: (WebGPU|WebGL2|Solid DOM)$/)).toBeVisible();
    expect(await fontSizeOf(status.getByText("Shell: Workbench", { exact: true })), "the status bar's words").toBe("13px");
    expect(await fontSizeOf(page.getByRole("tablist", { name: "Open files" }).getByRole("tab").first().getByText("first-app.md")), "a tab's words").toBe("13px");

    const shown = shownPage(page, "Your First App");
    const before = (await shown.boundingBox()).width;
    await press(page.getByRole("button", { name: "Collapse inspector", exact: true }));
    await expect(inspector, "the inspector is gone").toBeHidden();
    await expect.poll(async () => (await shown.boundingBox()).width, { message: "the page takes its room" }).toBeGreaterThan(before);
    await press(page.getByRole("button", { name: "Expand inspector", exact: true }));
    await expect(inspector, "the inspector is back").toBeVisible();
    expect(said).toEqual([]);
  } finally {
    await context.close();
  }
});

test("editing Workbench's Source tab changes the running page in place", async ({ browser }) => {
  const shipped = readFileSync(new URL("../bundle/Shells/Workbench.qml", import.meta.url), "utf8");
  expect(shipped).toContain("t`Shell: Workbench`");
  const edited = shipped.replace("t`Shell: Workbench`", "t`Shell: Workbench, edited`");
  const context = await reader(browser, { kept: "workbench" });
  try {
    const page = await context.newPage();
    await open(page, "/start/first-app/");
    const picture = page.locator('img[alt="What this example draws"]').first();
    await press(picture);
    await expect(picture, "the example runs").toBeHidden({ timeout: 30_000 });
    const increment = page.getByRole("button", { name: "Increment", exact: true }).filter({ visible: true }).first();
    await press(increment);
    await press(increment);
    const count = page.getByText("Count: 2", { exact: true }).filter({ visible: true });
    await expect(count).toBeVisible();
    const place = await increment.boundingBox();

    const inspector = inspectorOf(page);
    await inspector.getByRole("textbox", { name: "Edit the running shell's QML" }).click();
    const source = page.locator(`.cm-content[aria-label="Edit the running shell's QML"]`);
    await expect(source).toBeFocused({ timeout: 30_000 });
    await source.fill(edited);
    const status = statusBar(page);
    await expect(status.getByText("Shell: Workbench, edited", { exact: true }), "the edit runs, with no press").toBeVisible({ timeout: 30_000 });
    await expect(count, "the example keeps its state").toBeVisible();
    expect((await increment.boundingBox()).y, "the page is where it was").toBeCloseTo(place.y, 0);
    await expect(source, "the reader is still in the editor").toBeFocused();

    // The editor draws only the lines in sight (CodeMirror), and after
    // the edit the reader is at its end: what it has drawn is the end
    // alone, so filling it again would replace only that end. The braces
    // are typed there, as a reader would.
    const lines = edited.split("\n").length;
    await expect.poll(() => source.evaluate((node) => node.querySelectorAll(".cm-line").length), { message: "only the end is drawn" }).toBeLessThan(lines / 2);
    await source.press("ControlOrMeta+End");
    await page.keyboard.insertText("\n}}");
    const problems = page.getByRole("list", { name: "Problems", exact: true });
    await expect(problems.getByRole("listitem").first(), "what broke, with its line").toHaveText(/Shells\/Workbench\.qml:\d+:\d+/, { timeout: 30_000 });
    await expect(status.getByText("Diagnostics: 1", { exact: true })).toBeVisible();
    await expect(status.getByText("Shell: Workbench, edited", { exact: true }), "the last shell that compiled").toBeVisible();
    expect(await showing(page)).toBe("workbench");

    await press(inspector.getByRole("button", { name: "Reset", exact: true }));
    await expect(status.getByText("Shell: Workbench", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(status.getByText("Diagnostics: 0", { exact: true })).toBeVisible();
    await expect(count).toBeVisible();
  } finally {
    await context.close();
  }
});

// A live edit lays the page out again as another shell does, so the
// place is held first (PageView `hold`): here the edit's explorer is
// wider, and Reset gives the page that width back, pressed before
// `keeping` has marked where the reader scrolled to.
test("the reader's place is kept when a live edit is put back", async ({ browser }) => {
  const shipped = readFileSync(new URL("../bundle/Shells/Workbench.qml", import.meta.url), "utf8");
  const width = "width: !shown ? 0 : shell.wide ? 240 : shell.width";
  expect(shipped).toContain(width);
  const edited = shipped.replace(width, width.replace("240", "320")).replace("t`Shell: Workbench`", "t`Shell: Workbench, edited`");
  const context = await reader(browser, { kept: "workbench" });
  try {
    const page = await context.newPage();
    await open(page, "/start/first-app/");
    const inspector = inspectorOf(page);
    await inspector.getByRole("textbox", { name: "Edit the running shell's QML" }).click();
    const source = page.locator(`.cm-content[aria-label="Edit the running shell's QML"]`);
    await expect(source).toBeFocused({ timeout: 30_000 });
    await source.fill(edited);
    const status = statusBar(page);
    await expect(status.getByText("Shell: Workbench, edited", { exact: true }), "the edit runs").toBeVisible({ timeout: 30_000 });
    const heading = page.getByRole("heading", { name: /^Edit live with/ }).filter({ visible: true }).first();
    await heading.evaluate((element) => {
      let scroller = element.parentElement;
      while (scroller && !(/auto|scroll/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight)) scroller = scroller.parentElement;
      scroller.scrollTop = 120;
    });
    await expect.poll(() => page.evaluate(() => history.state?.offset), { message: "the page keeps where they first stopped" }).toBe(120);
    const box = await inspector.getByRole("button", { name: "Reset", exact: true }).boundingBox();
    await heading.evaluate(async (element, [clientX, clientY]) => {
      const frame = () => new Promise((done) => requestAnimationFrame(done));
      element.scrollIntoView({ block: "start" });
      await frame();
      await frame();
      const pointer = { bubbles: true, cancelable: true, composed: true, clientX, clientY, pointerId: 1, pointerType: "mouse", isPrimary: true, detail: 1 };
      const under = () => document.elementFromPoint(clientX, clientY);
      under().dispatchEvent(new PointerEvent("pointerdown", { ...pointer, buttons: 1 }));
      under().dispatchEvent(new PointerEvent("pointerup", { ...pointer, buttons: 0 }));
    }, [box.x + box.width / 2, box.y + box.height / 2]);
    await expect(status.getByText("Shell: Workbench", { exact: true }), "the shell as shipped").toBeVisible({ timeout: 30_000 });
    // The page is put back after each of its changes of height, until
    // `settling` ends 300 ms after the last.
    await page.waitForTimeout(600);
    await expect(heading, "the heading they scrolled to is still in view").toBeInViewport();
  } finally {
    await context.close();
  }
});

test("an edit still compiling doesn't take over the shell switched to", async ({ browser }) => {
  const shipped = readFileSync(new URL("../bundle/Shells/Workbench.qml", import.meta.url), "utf8");
  const edited = shipped.replace("t`Shell: Workbench`", "t`Shell: Workbench, edited`");
  const context = await reader(browser, { kept: "workbench" });
  let compile;
  let asked;
  const held = new Promise((done) => (compile = done));
  const compiling = new Promise((done) => (asked = done));
  await context.route(/ljos_web_compiler[^/]*\.wasm/, async (route) => {
    asked();
    await held;
    await route.continue();
  });
  try {
    const page = await context.newPage();
    await open(page, "/start/first-app/");
    await inspectorOf(page).getByRole("textbox", { name: "Edit the running shell's QML" }).click();
    const source = page.locator(`.cm-content[aria-label="Edit the running shell's QML"]`);
    await expect(source).toBeFocused({ timeout: 30_000 });
    await source.fill(edited);
    await compiling;
    await pick(page, "desktop");
    compile();
    // Nothing is to happen, so there is nothing to wait for but time.
    await page.waitForTimeout(3000);
    const ran = page.getByText("Shell: Workbench, edited", { exact: true }).filter({ visible: true });
    await expect(ran, "Desktop stays").toHaveCount(0);
    await pick(page, "workbench");
    await expect(ran, "the edit waited").toBeVisible({ timeout: 30_000 });
  } finally {
    compile();
    await context.close();
  }
});

test("the editor holds the shell that asked for it", async ({ browser }) => {
  const context = await reader(browser, { kept: "workbench" });
  let arrive;
  let asked;
  const held = new Promise((done) => (arrive = done));
  const coming = new Promise((done) => (asked = done));
  await context.route(/\/LiveSource-[^/]+\.js$/, async (route) => {
    asked();
    await held;
    await route.continue();
  });
  try {
    const page = await context.newPage();
    await open(page, "/start/first-app/");
    await coming;
    await pick(page, "desktop");
    arrive();
    await pick(page, "workbench");
    const editor = inspectorOf(page).getByRole("textbox", { name: "Edit the running shell's QML" });
    await expect(editor, "Workbench's QML").toContainText("workbenchShell", { timeout: 30_000 });
  } finally {
    arrive();
    await context.close();
  }
});

// A string that names a QML file beside the one it is written in is
// that component to the compiler, and imports it: a name meant as words
// was an empty row, and Workbench brought the other shells with it.
test("Workbench names the site's files without fetching them", async ({ browser }) => {
  const context = await reader(browser, { kept: "workbench" });
  try {
    const page = await context.newPage();
    const scripts = [];
    page.on("request", (request) => {
      if (request.resourceType() === "script") scripts.push(new URL(request.url()).pathname);
    });
    await open(page, "/start/first-app/");
    const explorer = explorerOf(page);
    for (const name of ["Elegant.qml", "Cyberpunk.qml", "Workbench.qml", "Desktop.qml"])
      await expect.soft(explorer.getByRole("button", { name, exact: true }), name).toBeVisible();
    for (const name of ["Landing.qml", "DemosPage.qml"])
      await expect.soft(explorer.getByRole("link", { name, exact: true }), name).toBeVisible();
    const code = (shell) => scripts.filter((path) => new RegExp(`/${shell}-[^/]+\\.js$`).test(path));
    expect(code("Workbench"), "Workbench's own code, so the pattern finds a shell's").not.toEqual([]);
    expect.soft(code("Cyberpunk"), "Cyberpunk's code").toEqual([]);
    expect.soft(code("Desktop"), "Desktop's code").toEqual([]);
  } finally {
    await context.close();
  }
});

test("Workbench's explorer opens each kind of file, and the pages opened stay open across a swap", async ({ browser }) => {
  const context = await reader(browser, { kept: "workbench" });
  try {
    const page = await context.newPage();
    const said = listen(page);
    await open(page, "/start/first-app/");
    const explorer = explorerOf(page);
    await press(explorer.getByRole("link", { name: "Landing.qml", exact: true }));
    await expect(shownPage(page, "Home"), "the front page").toBeVisible();
    const files = page.getByRole("tablist", { name: "Open files", exact: true }).getByRole("tab");
    await expect(files).toHaveText(["first-app.md", "Landing.qml"]);
    await expect(files.nth(1)).toHaveAttribute("aria-selected", "true");

    await press(explorer.getByRole("button", { name: "Desktop.qml", exact: true }));
    const dialog = page.getByRole("dialog", { name: "Source of Shells/Desktop.qml" });
    await expect(dialog).toBeVisible();
    await press(dialog.getByRole("button", { name: "Close shell source", exact: true }));
    await expect(dialog).toBeHidden();

    await press(page.getByRole("button", { name: "Collapse inspector", exact: true }));
    await expect(inspectorOf(page)).toBeHidden();
    await press(explorer.getByRole("button", { name: "Workbench.qml", exact: true }));
    await expect(inspectorOf(page), "the inspector, opened on its Source").toBeVisible();
    await expect(inspectorOf(page).getByRole("textbox", { name: "Edit the running shell's QML" })).toContainText("workbenchShell");

    const demos = explorer.getByRole("button", { name: "Demos/", exact: true });
    await expect(demos).toHaveAttribute("aria-pressed", "true");
    await expect(explorer.getByRole("link", { name: "CockpitDemo.qml", exact: true })).toBeVisible();
    await press(demos);
    await expect(demos, "the folder says it is shut").toHaveAttribute("aria-pressed", "false");
    await expect(explorer.getByRole("link", { name: "CockpitDemo.qml", exact: true })).toBeHidden();

    await pick(page, "desktop");
    const documents = page.getByRole("tablist", { name: "Open pages", exact: true }).getByRole("tab");
    await expect(documents).toHaveCount(2);
    await expect(documents.nth(0)).toHaveAccessibleName(/Your First App/);
    await expect(documents.nth(1)).toHaveAccessibleName(/Home/);
    await expect(documents.nth(1)).toHaveAttribute("aria-selected", "true");
    expect(said).toEqual([]);
  } finally {
    await context.close();
  }
});

// A menu of Desktop's menu bar, and an item in it: one that checks is a
// menu item of its own role.
async function menu(page, title, item) {
  await press(page.getByRole("menubar", { name: "Menu bar", exact: true }).getByRole("menuitem", { name: title, exact: true }));
  const choice = page
    .getByRole("menuitem", { name: item, exact: true })
    .or(page.getByRole("menuitemcheckbox", { name: item, exact: true }))
    .filter({ visible: true });
  await press(choice);
}

test("Desktop's menus do what they say", async ({ browser }) => {
  const context = await reader(browser, { kept: "desktop" });
  try {
    const page = await context.newPage();
    const said = listen(page);
    await open(page, "/start/first-app/");
    await expect(page.getByText("Ljós — Your First App", { exact: true }), "the window's title").toBeVisible();

    await menu(page, "File", "Open demos");
    await expect(shownPage(page, "Live demos")).toBeVisible();
    await expect(page.getByText("Ljós — Demos", { exact: true })).toBeVisible();

    await menu(page, "View", "Dark colour scheme");
    await expect.poll(() => page.evaluate(() => document.documentElement.style.colorScheme), { message: "the site is dark" }).toBe("dark");

    const sidebar = page.getByRole("complementary", { name: "Pages", exact: true });
    await expect(sidebar).toBeVisible();
    await menu(page, "View", "Toggle sidebar");
    await expect(sidebar, "the sidebar is gone").toBeHidden();
    await menu(page, "View", "Toggle sidebar");
    await expect(sidebar, "and back").toBeVisible();

    await menu(page, "Go", "Capability: malleable");
    await page.waitForURL(`**${at("/start/your-own-shell/")}`);

    await menu(page, "Help", "About ljos.dev");
    const about = page.getByRole("dialog", { name: "About ljos.dev", exact: true });
    await expect(about.getByText(/^This site runs Ljós compiled to Solid DOM with ljos-web/)).toBeVisible();
    await press(about.getByRole("button", { name: "Close", exact: true }));
    await expect(about).toBeHidden();

    await menu(page, "File", "View this shell's QML");
    const source = page.getByRole("dialog", { name: "Source of Shells/Desktop.qml" });
    await expect(source).toBeVisible();
    await press(source.getByRole("button", { name: "Close shell source", exact: true }));

    await menu(page, "View", "Switch to Workbench shell");
    await expect.poll(() => showing(page), { message: "the Workbench shell frames the page", timeout: 30_000 }).toBe("workbench");
    expect(said).toEqual([]);
  } finally {
    await context.close();
  }
});

test("Desktop's toolbar says what each button does, and its status bar what runs", async ({ browser }) => {
  const context = await reader(browser, { kept: "desktop" });
  try {
    const page = await context.newPage();
    const said = listen(page);
    await open(page, "/start/first-app/");
    const toolbar = page.getByRole("toolbar", { name: "Toolbar", exact: true });
    for (const [name, tip] of [
      ["Back", "Go to previous route"],
      ["Forward", "Go to next route"],
      ["Home", "Open landing page"],
      ["Demos", "Browse all interactive demos"],
      ["Observer", "Toggle live Observer panel"],
      ["Switch shell", "Switch between Elegant, Cyberpunk, Workbench, and Desktop shells"],
      ["Scheme", "Toggle light and dark colour scheme"],
      ["View QML", "View this shell's QML source"],
    ]) {
      const control = toolbar.getByRole("button", { name, exact: true });
      await expect(control, `${name} is in the toolbar`).toBeVisible();
      await tipOf(page, control, tip);
    }
    const status = statusBar(page);
    await expect(status.getByText("Route: /start/first-app/", { exact: true })).toBeVisible();
    await expect(status.getByText(/^Hydrated in \d+ ms$/)).toBeVisible();
    await expect(status.getByText(/^Objects alive: \d+$/)).toBeVisible();
    await expect(status.getByText(/^Renderer: (WebGPU|WebGL2|Solid DOM)$/)).toBeVisible();
    await expect(status.getByText("Shell: Desktop", { exact: true })).toBeVisible();

    await press(toolbar.getByRole("button", { name: "Observer", exact: true }));
    await expect(page.getByRole("group", { name: "Observer", exact: true }).filter({ visible: true }), "the Observer, open on the page").toBeVisible();
    expect(said).toEqual([]);
  } finally {
    await context.close();
  }
});

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
          const logo = await apart(home.locator('img[src$="favicon.svg"]'), word);
          expect(logo.mark, "the header's mark").toEqual([28, 28]);
          expect(Math.round(logo.gap), `its gap (${logo.at})`).toBe(8);
          if (kept === "desktop") {
            const header = await region(page, "Ljós").first().boundingBox();
            // The landmark holds the toolbar too: the bar ends where that starts.
            const under = viewport === DESKTOP ? (await page.getByRole("toolbar", { name: "Toolbar", exact: true }).boundingBox()).y : header.y + header.height;
            const bar = { y: header.y, height: under - header.y };
            const link = await home.boundingBox();
            expect(link.y + 0.5, "the bar holds it, top").toBeGreaterThanOrEqual(bar.y);
            expect(link.y + link.height - 0.5, "the bar holds it, bottom").toBeLessThanOrEqual(bar.y + bar.height);
          }

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

// A narrow rail's search field (Cyberpunk's is a third of Elegant's)
// once ran its words under the `/` key and out of the box.
for (const shell of SHELLS) {
  test(`${LABEL[shell]}'s search field keeps its words in its box, clear of the key`, async ({ browser }) => {
    const context = await reader(browser, { kept: shell });
    try {
      const page = await context.newPage();
      await open(page, "/start/first-app/");
      expect(await showing(page)).toBe(shell);
      const boxes = await page.evaluate(() => [...document.querySelectorAll('[aria-label="Search"]')]
        .filter((field) => field.getBoundingClientRect().width > 0)
        .map((field) => {
          const box = field.parentElement.parentElement;
          const edge = (node) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, shown: r.width > 0 && getComputedStyle(node).display !== "none" }; };
          const parts = [...box.children];
          const words = parts.find((node) => node.textContent.startsWith("Search docs"));
          const key = parts.find((node) => node.textContent === "/");
          return { box: edge(box), words: words ? { ...edge(words), text: words.textContent } : null, key: key ? edge(key) : null };
        }));
      expect(boxes.length, "a search field is on the page").toBeGreaterThan(0);
      for (const { box, words, key } of boxes) {
        expect(words, "the field says what it searches").not.toBeNull();
        expect(words.right, `"${words.text}" ends inside the field`).toBeLessThanOrEqual(box.right);
        if (key?.shown) expect(words.right, `"${words.text}" ends before the / key`).toBeLessThanOrEqual(key.left);
      }
    } finally {
      await context.close();
    }
  });
}

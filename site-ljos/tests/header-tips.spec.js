// The header's choices (Site/HeaderTip.qml): the shell, the language,
// reduced motion and the theme each say what they do and how they stand,
// in a tip that comes a moment after a pointer rests on them and at once
// when the keyboard reaches them, inside the window, and goes on Escape.
// A screen reader hears the same words as the control's description.
import { expect, test } from "@playwright/test";

const HYDRATED = '#app[data-ljos-hydrated="true"]';
const SIZES = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };

// The tips' words, by state.
const SAYS = {
  themeLight: "Theme: light – switch to dark",
  themeDark: "Theme: dark – switch to light",
  motionOn: "Reduce motion: on – use full motion",
  motionOff: "Reduce motion: off – use less motion",
  shell: (shell) => "Shell: {shell} – choose another layout".replace("{shell}", shell),
  language: (language) => "Language: {language} – choose another".replace("{language}", language),
};

async function open(browser, { shell = "elegant", colorScheme = "light", viewport = SIZES.desktop } = {}) {
  const context = await browser.newContext({ viewport, colorScheme, reducedMotion: "no-preference" });
  await context.addInitScript((name) => {
    try {
      localStorage.setItem("ljos.dev:shell", name);
    } catch {}
  }, shell);
  const page = await context.newPage();
  await page.goto("/");
  await page.waitForSelector(HYDRATED, { state: "attached" });
  await page.waitForFunction(() => "ljosShellShown" in document.documentElement.dataset);
  if (shell !== "elegant") await expect(page.locator("html")).toHaveAttribute("data-ljos-shell-showing", shell);
  return { context, page };
}

const theme = (page) => page.getByRole("button", { name: /^Use the (light|dark) theme$/ }).filter({ visible: true }).first();
const motion = (page) => page.getByRole("checkbox", { name: "Reduce motion" }).filter({ visible: true }).first();
const shellButton = (page) => page.getByRole("button", { name: /^(Current shell: |Switch shell$)/ }).filter({ visible: true }).first();
const language = (page) => page.getByRole("button", { name: /Language: / }).filter({ visible: true }).first();

// The tip with `words`, shown and wholly inside the window.
async function tipSays(page, words) {
  const tip = page.getByText(words, { exact: true }).filter({ visible: true });
  await expect(tip, `a tip saying "${words}"`).toHaveCount(1);
  const box = await tip.boundingBox();
  const { width, height } = page.viewportSize();
  expect(box.x, "inside the window's left").toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, "inside the window's right").toBeLessThanOrEqual(width);
  expect(box.y + box.height, "inside the window's bottom").toBeLessThanOrEqual(height);
  return tip;
}

// What each shell shows at a desktop's width, and the tip each says. The
// Workbench keeps the site's choices in its Appearance popover; Workbench
// and Desktop give the compact shell switcher a tip of their own, and the
// Desktop's theme is a toolbar button with its own tip (its reduced
// motion is an item of its View menu, which names it).
const switcher = (page) => page.getByRole("button", { name: "Switch shell" }).filter({ visible: true }).first();
const CASES = {
  elegant: (page, dark) => [
    [theme(page), dark ? SAYS.themeDark : SAYS.themeLight],
    [motion(page), SAYS.motionOff],
    [shellButton(page), SAYS.shell("Elegant")],
    [language(page), SAYS.language("English")],
  ],
  cyberpunk: (page, dark) => [
    [theme(page), dark ? SAYS.themeDark : SAYS.themeLight],
    [motion(page), SAYS.motionOff],
    [shellButton(page), SAYS.shell("Cyberpunk")],
    [language(page), SAYS.language("English")],
  ],
  workbench: (page, dark) => [
    [switcher(page), "Shell switcher", { own: true }],
    [page.getByRole("button", { name: "Appearance settings" }), null, { click: true }],
    [theme(page), dark ? SAYS.themeDark : SAYS.themeLight],
    [motion(page), SAYS.motionOff],
    [language(page), SAYS.language("English")],
  ],
  desktop: (page) => [
    [switcher(page), "Switch between Elegant, Cyberpunk, Workbench, and Desktop shells", { own: true }],
    [page.getByRole("button", { name: "Scheme" }).filter({ visible: true }), "Toggle light and dark colour scheme", { own: true }],
  ],
};

for (const shell of ["elegant", "cyberpunk", "workbench", "desktop"]) {
  for (const colorScheme of ["light", "dark"]) {
    test(`in ${shell}, ${colorScheme}, each header choice has a tip on hover that says how it stands`, async ({ browser }) => {
      const { context, page } = await open(browser, { shell, colorScheme });
      try {
        for (const [control, words, how = {}] of CASES[shell](page, colorScheme === "dark")) {
          if (how.click) {
            await control.click();
            continue;
          }
          await control.hover();
          const rested = Date.now();
          if (!how.own) {
            // Not at once: a pointer passing over the header raises none. A
            // look that comes after the tip's 600 ms wait, as on a busy
            // machine, tells nothing, so only an earlier one is held to it.
            await page.waitForTimeout(150);
            const shown = await page.getByText(words, { exact: true }).filter({ visible: true }).count();
            const after = Date.now() - rested;
            if (after < 500) expect(shown, `no tip ${after} ms after the pointer came to rest`).toBe(0);
          }
          await tipSays(page, words);
          // One tip at a time: the site's own is not shown over a shell's.
          await expect(page.getByText(/^(Theme|Reduce motion|Shell|Language): .* – /).filter({ visible: true })).toHaveCount(how.own ? 0 : 1);
          if (!how.own) await expect(control).toHaveAttribute("aria-description", words);
          if (shell === "workbench") continue;
          // Off it, the tip goes.
          await page.mouse.move(5, 600);
          await expect(page.getByText(words, { exact: true }).filter({ visible: true })).toHaveCount(0);
        }
      } finally {
        await context.close();
      }
    });
  }
}

// Tab, as a reader goes, until the tip with `words` is shown: the
// keyboard reaching a control shows its tip at once.
async function tabTo(page, words, key = "Tab") {
  const tip = page.getByText(words, { exact: true }).filter({ visible: true });
  for (let tabs = 0; !(await tip.count()); tabs++) {
    expect(tabs, `${key} comes to the control whose tip says "${words}"`).toBeLessThan(60);
    await page.keyboard.press(key);
  }
  return tipSays(page, words);
}

test("a tip comes at once with the keyboard, follows the state, and goes on Escape", async ({ browser }) => {
  const { context, page } = await open(browser);
  try {
    await tabTo(page, SAYS.themeLight);
    await page.keyboard.press("Escape");
    await expect(page.getByText(SAYS.themeLight, { exact: true }).filter({ visible: true })).toHaveCount(0);
    // Pressed, the theme is dark and the tip says so.
    await page.keyboard.press("Enter");
    await expect(theme(page)).toHaveAccessibleName("Use the light theme");
    await expect(theme(page)).toHaveAttribute("aria-description", SAYS.themeDark);
    // Back to the toggle before it: reduced motion, which Space turns on.
    await tabTo(page, SAYS.motionOff, "Shift+Tab");
    await page.keyboard.press("Space");
    await tipSays(page, SAYS.motionOn);
    await expect(motion(page)).toHaveAttribute("aria-description", SAYS.motionOn);
  } finally {
    await context.close();
  }
});

for (const shell of ["elegant", "cyberpunk", "workbench", "desktop"]) {
  test(`on a phone in ${shell}, each header choice in the menu has its tip, inside the window`, async ({ browser }) => {
    const { context, page } = await open(browser, { shell, viewport: SIZES.phone });
    try {
      // On a phone the choices are in the menu.
      await page.getByRole("button", { name: "Menu" }).click();
      for (const [control, words] of [
        [theme(page), SAYS.themeLight],
        [motion(page), SAYS.motionOff],
        [shellButton(page), SAYS.shell(shell[0].toUpperCase() + shell.slice(1))],
        [language(page), SAYS.language("English")],
      ]) {
        await expect(control).toHaveAttribute("aria-description", words);
        await control.hover();
        await tipSays(page, words);
      }
    } finally {
      await context.close();
    }
  });
}

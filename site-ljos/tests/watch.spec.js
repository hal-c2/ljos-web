// The watch is a pro demo (bundle/Demos/pro.json): pro.spec.js checks
// its copy against the ljos-ui commit it names. Here, the watch the
// page runs is the one the reader's edits make.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { demos, targetOf } from "../scripts/pro.mjs";

const target = targetOf(demos.find((demo) => demo.name === "watch"));
// The page's compiler, fetched by its first compile (ljos-web/compiler's
// link.js), and no other wasm the page loads.
const COMPILER = /\/ljos_web_compiler[^/]*\.wasm(\?|$)/;

// An edit to one of the watch's files makes the watch again from it,
// with the reader still typing in the editor; a broken one says where
// and leaves the last watch standing; Reset puts every file back and
// takes what the broken one said away with it.
test("an edit to the watch's files is the watch the page runs", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/demos/watch/");
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  const run = page.getByRole("button", { name: "Run the watch" });
  await run.click();
  await run.waitFor({ state: "hidden", timeout: 60_000 });
  // The rounded square's face counts the steps.
  await page.getByRole("button", { name: /^Round, 454/ }).click();
  await expect(page.getByText(/^[\d,]+ steps$/).first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole("tab", { name: "FacePulse.qml", exact: true }).click();
  const name = "Edit FacePulse.qml of the watch";
  await page.getByRole("textbox", { name }).first().click();
  const editor = page.locator(`.cm-content[aria-label="${name}"]`).first();
  await expect(editor).toBeFocused({ timeout: 30_000 });
  // The line that names the steps, its last word chosen and written over.
  const line = readFileSync(join(target, "FacePulse.qml"), "utf8").split("\n").findIndex((text) => text.includes(" steps`"));
  expect(line).toBeGreaterThan(0);
  await page.keyboard.press("Control+Home");
  for (let i = 0; i < line; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  for (let i = 0; i < "steps".length; i++) await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.type("paces");
  await expect(page.getByText(/^[\d,]+ paces$/).first(), "the watch made again from the edit").toBeVisible({ timeout: 60_000 });
  await expect(editor, "still where the reader types").toBeFocused();

  await page.keyboard.press("Control+Home");
  await page.keyboard.type("Broken {");
  await expect(page.getByText(/FacePulse\.qml:\d+/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/^[\d,]+ paces$/).first(), "the last watch that compiled stays").toBeVisible();
  await expect(editor.locator(".cm-lintRange-error").first()).toBeVisible();

  await page.getByRole("button", { name: "Reset every file" }).click();
  await expect(page.getByText(/^[\d,]+ steps$/).first(), "the watch as it shipped").toBeVisible({ timeout: 30_000 });
  await expect(editor).not.toContainText("Broken");
  await expect(editor.locator(".cm-lintRange-error"), "nothing the broken edit said").toHaveCount(0);
  await expect(page.getByText(/FacePulse\.qml:\d+/)).toHaveCount(0);
  expect(errors).toEqual([]);
});

// A compile still on its way when Reset is pressed lands on files that
// are no longer the reader's: what it says is dropped, so switching
// files after it has landed brings back no squiggles.
test("a broken compile that lands after Reset leaves no squiggles", async ({ page }) => {
  // The compiler's wasm is fetched once, with the page's first compile,
  // and every compile waits on it. It is held back here until Reset has
  // been pressed, so the broken compile is certainly still on its way
  // when the reader sets the files back, however fast the machine. (Once
  // the wasm is in, a compile runs in one go and no click can come in
  // between.) The watch is not run first: running it is a compile of its
  // own, which would wait on the wasm too and, landing last, clear what
  // the broken one said and hide what this looks for.
  let release;
  const held = new Promise((resolve) => (release = resolve));
  await page.route(COMPILER, async (route) => {
    await held;
    await route.continue();
  });
  // Each answer the compiler gives to the broken files is counted, so the
  // test knows when the broken compile has run instead of guessing how
  // long that takes.
  await page.addInitScript(() => {
    globalThis.brokenAnswers = 0;
    const instantiate = WebAssembly.instantiate;
    WebAssembly.instantiate = async function (...args) {
      const made = await instantiate.apply(this, args);
      if (!(made instanceof WebAssembly.Instance) || typeof made.exports.answer_len !== "function") return made;
      let broken = false;
      const exports = Object.assign({}, made.exports, {
        compile: (at, length) => {
          const asked = JSON.parse(new TextDecoder().decode(new Uint8Array(made.exports.memory.buffer, at, length)));
          broken = String(asked.files["FacePulse.qml"] ?? "").startsWith("} ");
          return made.exports.compile(at, length);
        },
        answer_len: () => {
          if (broken) globalThis.brokenAnswers++;
          return made.exports.answer_len();
        },
      });
      return { exports };
    };
  });
  await page.goto("/demos/watch/");
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  const tab = (path) => page.getByRole("tab", { name: path, exact: true });
  await tab("FacePulse.qml").click();
  const name = "Edit FacePulse.qml of the watch";
  const editor = page.locator(`.cm-content[aria-label="${name}"]`).first();
  await page.getByRole("textbox", { name }).first().click();
  await expect(editor).toBeFocused({ timeout: 30_000 });

  // Broken on its first line, so what the compiler says of it has a
  // place in the file as it shipped too, and would show there.
  await page.keyboard.press("Control+Home");
  await page.keyboard.type("} ");
  // Past the half-second debounce the page compiles the broken file, and
  // that compile waits on the held wasm.
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Reset every file" }).click();
  await expect(editor).not.toContainText("} import");
  expect(await page.evaluate(() => globalThis.brokenAnswers), "the broken compile is still on its way").toBe(0);
  release();
  // The broken compile answers after Reset. Nothing is edited meanwhile:
  // a newer compile would clear what it said and hide what this looks
  // for. (With what a compile said kept whatever edits it was of, as
  // pro-live.js did, this test fails below.)
  await page.waitForFunction(() => globalThis.brokenAnswers > 0, null, { timeout: 60_000 });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 250)));
  await tab("Main.qml").click();
  await tab("FacePulse.qml").click();
  await expect(editor).not.toContainText("} import");
  await expect(editor).toContainText("import Ljos.Ui");
  await expect(editor.locator(".cm-lintRange-error"), "nothing the late compile said").toHaveCount(0);
  await expect(page.getByText(/FacePulse\.qml:\d+/)).toHaveCount(0);
});

// On a narrow page the watch's frame takes its compact shape, and the
// picture in it is the one made in that shape, not the wide one
// stretched to it.
test("on a narrow page the watch's picture is its compact one, unstretched", async ({ browser }) => {
  for (const colorScheme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme });
    try {
      const page = await context.newPage();
      await page.goto("/demos/watch/");
      await page.waitForSelector('#app[data-ljos-hydrated="true"]');
      const picture = page.locator('img[src*="/pictures/demo-watch"]').filter({ visible: true }).first();
      await expect(picture).toHaveAttribute("src", colorScheme === "dark" ? /demo-watch-compact-dark\.webp$/ : /demo-watch-compact\.webp$/);
      await picture.evaluate((img) => img.decode());
      const shape = await picture.evaluate((img) => {
        const box = img.getBoundingClientRect();
        return { drawn: box.height / box.width, own: img.naturalHeight / img.naturalWidth, width: box.width };
      });
      expect(shape.width).toBeGreaterThan(300);
      expect(Math.abs(shape.drawn - shape.own), JSON.stringify(shape)).toBeLessThan(0.01);
    } finally {
      await context.close();
    }
  }
});

// The file tabs are one stop on Tab, the chosen file's, and the arrows
// go along them, round past either end, the stop going with them;
// Enter shows the one reached.
// The keyboard's place is read from the ring drawn round a tab (its
// border, two pixels wide while it has the focus).
test("the watch's file tabs are one tab stop, and the arrows go along them", async ({ page }) => {
  await page.goto("/demos/watch/");
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  const tabs = page.getByRole("tablist", { name: /^The files of/ }).getByRole("tab");
  const names = await tabs.evaluateAll((all) => all.map((tab) => tab.getAttribute("aria-label")));
  expect(names.length, names.join(", ")).toBeGreaterThan(2);
  const [first, second, last] = [names[0], names[1], names[names.length - 1]];
  const ringed = () => tabs.evaluateAll((all) => all.filter((tab) => / 2px inset/u.test(tab.style.boxShadow)).map((tab) => tab.getAttribute("aria-label")));
  const chosen = () => tabs.evaluateAll((all) => all.filter((tab) => tab.getAttribute("aria-selected") === "true").map((tab) => tab.getAttribute("aria-label")));
  const shown = (await chosen())[0];
  expect(shown).toBeTruthy();

  for (let n = 0; (await ringed()).length === 0; n++) {
    expect(n, "Tab comes to the file tabs").toBeLessThan(60);
    await page.keyboard.press("Tab");
  }
  expect(await ringed(), "Tab comes to the chosen file's tab").toEqual([shown]);
  await page.keyboard.press("Tab");
  await expect.poll(ringed, { message: "the next Tab leaves the row: it is one stop" }).toEqual([]);
  await page.keyboard.press("Shift+Tab");
  await expect.poll(ringed).toEqual([shown]);

  // To the first file: Home is not the pattern's here, so Left along.
  for (let at = names.indexOf(shown); at > 0; at--) await page.keyboard.press("ArrowLeft");
  await expect.poll(ringed).toEqual([first]);
  await expect.poll(chosen, { message: "an arrow moves the keyboard, not the chosen file" }).toEqual([shown]);
  await page.keyboard.press("ArrowRight");
  await expect.poll(ringed).toEqual([second]);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect.poll(ringed, { message: "Left from the first goes round to the last" }).toEqual([last]);
  await page.keyboard.press("Enter");
  await expect.poll(chosen).toEqual([last]);
  await page.keyboard.press("ArrowRight");
  await expect.poll(ringed, { message: "Right from the last goes round to the first" }).toEqual([first]);
  // The stop is where the keyboard is: out of the row backwards and in
  // again lands on the tab the arrow reached, as Tab does.
  await page.keyboard.press("Shift+Tab");
  await expect.poll(ringed, { message: "Shift+Tab leaves the row" }).toEqual([]);
  await page.keyboard.press("Tab");
  await expect.poll(ringed).toEqual([first]);
  await page.keyboard.press("Tab");
  await expect.poll(ringed, { message: "still one stop" }).toEqual([]);

  // A file chosen by pointer takes the stop: Tab back in lands on it.
  await tabs.nth(1).click();
  await expect.poll(chosen).toEqual([second]);
  for (let n = 0; (await ringed()).length === 0; n++) {
    expect(n, "Tab comes back to the file tabs").toBeLessThan(60);
    await page.keyboard.press("Shift+Tab");
  }
  expect(await ringed(), "the stop is the file chosen by pointer").toEqual([second]);
  // The open file's tab clicked again changes no file, but takes the
  // stop and the keyboard back from the tab an arrow had gone on to.
  await page.keyboard.press("ArrowRight");
  await expect.poll(ringed).toEqual([names[2]]);
  await tabs.nth(1).click();
  await expect.poll(ringed, { message: "the open file's tab, clicked again, has the keyboard" }).toEqual([second]);
  await page.keyboard.press("Shift+Tab");
  await expect.poll(ringed).toEqual([]);
  await page.keyboard.press("Tab");
  await expect.poll(ringed, { message: "and the stop" }).toEqual([second]);

  // The pro demos are one page given the other demo: the cockpit comes in
  // at its own entry file on Tab, not at the place the watch's keyboard had.
  // The watch is on Main.qml, as the cockpit starts, with the keyboard
  // on the first tab; it leaves the row, so it is Tab that brings it back.
  await tabs.nth(names.indexOf("Main.qml")).click();
  await expect.poll(chosen).toEqual(["Main.qml"]);
  await page.keyboard.press("Shift+Tab");
  await expect.poll(ringed).toEqual([]);
  await page.keyboard.press("Tab");
  await expect.poll(ringed).toEqual(["Main.qml"]);
  for (let at = names.indexOf("Main.qml"); at > 0; at--) await page.keyboard.press("ArrowLeft");
  await expect.poll(ringed).toEqual([first]);
  await page.keyboard.press("Shift+Tab");
  await expect.poll(ringed).toEqual([]);
  await page.evaluate(() => {
    history.pushState({}, "", "/demos/cockpit/");
    dispatchEvent(new PopStateEvent("popstate", { state: {} }));
  });
  await expect.poll(() => tabs.evaluateAll((all) => all.length)).not.toBe(names.length);
  const entry = (await chosen())[0];
  expect(entry).toBeTruthy();
  const at = await tabs.evaluateAll((all, entry) => all.findIndex((tab) => tab.getAttribute("aria-label") === entry), entry);
  expect(at, "the cockpit's entry is not where the watch's stop was").not.toBe(0);
  for (let n = 0; (await ringed()).length === 0; n++) {
    expect(n, "Tab comes to the cockpit's file tabs").toBeLessThan(80);
    await page.keyboard.press("Tab");
  }
  expect(await ringed(), "a new demo's stop is its entry file").toEqual([entry]);
});

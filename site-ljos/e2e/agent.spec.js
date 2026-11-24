// The front page's agent replay, run: each recorded call is sent as the
// MCP tool call it was, to the inspector of the dispatch app on the page,
// and the app changes as an agent changes it: a crew button found by role
// and pressed, then board.ts edited, and the running app reloaded from the
// module the build made of the edited file, with the crew kept. What the
// app says it did comes back into the agent's log through app_watch and
// app_logs, the replay's own presses and then the reader's. It starts
// itself unless the reader asked for less motion, and says all along that
// it is a replay (features/front-page.feature).
import { readFileSync } from "node:fs";
import { animationFrames, expect, open, press, runButton, test } from "./fixtures.js";

const steps = 8;
// The steps that are calls, each answered: the one that is not is the edit.
const calls = 7;
// The part of each board.ts the page shows (scripts/build.mjs cuts them the
// same): the list's, which the app starts from, and the board's.
const cut = (version) => {
  const file = readFileSync(new URL(`../bundle/Demos/logic/${version}/board.ts`, import.meta.url), "utf8");
  return file.slice(file.indexOf("export function lanes(")).trimEnd();
};
const SHOWN = { list: cut("before"), board: cut("after") };
const words = (text) => text.replace(/\s+/g, " ").trim();
const shown = (locator) => locator.filter({ visible: true }).first();
// The code the page shows beside the app, as it reads: its lines are rich
// text's breaks, which only the rendered text keeps (textContent runs the
// last word of one line into the first of the next).
const codeOf = (page) => shown(page.getByText(/export function lanes\(/)).evaluate((element) => (element.closest(".qq-text") ?? element).innerText);
const nextStep = "Done. Try Assign crew or List / Board.";
const replayLabel = (page) => shown(page.getByText("Replay · no live agent", { exact: true }));
// The poster, the page as written, has the replay's tabs too, and is
// hidden once the replay is drawn and faded in: a tab found before then
// can be the poster's, gone by the time it is pressed.
// The replay's own tabs: the page's live app further down has an Agent
// and an Observer tab too.
const tab = (page, name) => page.getByRole("tablist", { name: "Replay views" }).getByRole("tab", { name, exact: true });
const takenOver = (page) => expect(tab(page, "Agent").filter({ visible: true }), "the poster gave way to the replay").toHaveCount(1);

test("the agent replay drives the app over MCP, its edit reloads it with the crew kept, and what the app does streams back", async ({ page }) => {
  test.skip(test.info().project.name === "no-webassembly", "the replay's poster stands where nothing runs; site-ljos.spec.js reads it");
  await open(page, "/");
  await expect(page.getByRole("button", { name: "Pause the agent replay" }), "it starts without a press").toBeVisible();
  // It starts as the list: the whole app, one lane, the list's code.
  await expect(shown(page.getByText("North district dispatch", { exact: true })), "under its own heading").toBeVisible();
  await expect(page.getByRole("list", { name: "Tickets", exact: true }).filter({ visible: true }).getByRole("listitem"), "its five tickets").toHaveCount(5);
  // One lane: no lane of the board shows. The poster, the board and its
  // code, stays under the demo while it fades in (ReplayFrame.qml), and
  // comes first on the page, so its code is the first read until it goes.
  await expect(page.getByText("Crew assigned", { exact: true }).filter({ visible: true }), "one lane, the poster's board gone").toHaveCount(0);
  expect(words(await codeOf(page)), "the list's board.ts").toBe(words(SHOWN.list));
  await press(shown(tab(page, "Agent")));

  // Every call answered, none refused: the poster's calls say neither.
  await expect(page.getByText("answered", { exact: true }), "every call is answered").toHaveCount(calls, { timeout: 60_000 });
  await expect(page.getByText("refused", { exact: true })).toHaveCount(0);
  await expect(shown(page.getByText(`Step ${steps} of ${steps}`, { exact: true }))).toBeVisible();

  // The edit, as the log records it: the file, the lines it took out and
  // put in, and the app reloaded from the module built from it.
  await expect(page.getByText("reloaded", { exact: true }), "the edit's reload").toHaveCount(1);
  await expect(page.getByText("kept the last board", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/\+ title: "Crew assigned",/).first(), "a line the edit put in").toBeAttached();

  // The app as the edit left it: a board, and the ticket that had no
  // crew given one before the edit, still with it.
  await expect(shown(page.getByText("North district dispatch", { exact: true }))).toBeVisible();
  await expect(shown(page.getByText("Crew assigned", { exact: true })), "the list became a board").toBeVisible();
  await expect(page.getByRole("button", { name: "Assign crew to BG-415" })).toHaveCount(0);
  // The code beside it is now the board's file.
  await press(shown(tab(page, "TypeScript")));
  expect(words(await codeOf(page)), "the board's board.ts").toBe(words(SHOWN.board));
  await press(shown(tab(page, "Agent")));
  // What the reload kept, read back from the app's answer.
  await expect(page.getByText(/→ crews = .*BG-415.*On-call crew/), "the crew it kept").toHaveCount(1);
  // One ticket is left for a person, where the board says so.
  await expect(page.getByText("→ unassigned = 1", { exact: false }).first()).toBeAttached();
  await expect(shown(page.getByText("Needs a crew", { exact: true }))).toBeVisible();
  await expect(shown(page.getByText("Harbour pump meter check", { exact: true }))).toBeVisible();
  await expect(page.getByRole("button", { name: /^Assign crew to / }).filter({ visible: true })).toHaveAccessibleName("Assign crew to BG-421");
  // At its end there is nothing to pause.
  await expect(page.getByRole("button", { name: "Pause the agent replay" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run again: the agent replay" })).toBeVisible();
  await expect(shown(page.getByText(nextStep, { exact: true })), "the reader's next step").toBeVisible();

  // The replay's own press, said by the app, back in the log.
  await expect(page.getByText(/^app {2}assigned BG-415 to On-call crew$/)).toHaveCount(1);

  // The reader's turn: a press of theirs streams in the same way.
  const filter = shown(page.getByRole("button", { name: "Open only" }));
  await press(filter);
  await expect(page.getByText(/^app {2}filter open only: 4 of 5 tickets$/)).toHaveCount(1);
  await expect(page.getByText("West ridge battery test", { exact: true }).filter({ visible: true }), "the closed ticket filtered out").toHaveCount(0);
  await press(filter);
  await expect(page.getByText(/^app {2}filter off: 5 tickets$/)).toHaveCount(1);
  await expect(shown(page.getByText("West ridge battery test", { exact: true }))).toBeVisible();

  // And so does their own undo of the agent's edit: the app reloaded
  // from the list's module, with the crew it was given.
  await press(shown(page.getByRole("button", { name: "List layout" })));
  await expect(page.getByText("Crew assigned", { exact: true }).filter({ visible: true })).toHaveCount(0);
  await expect(shown(page.getByText("On-call crew", { exact: true }))).toBeVisible();
  await expect(page.getByRole("button", { name: "Assign crew to BG-415" })).toHaveCount(0);
  await expect(page.getByText(/^app {2}layout changed to list$/)).toHaveCount(1);
  await press(shown(tab(page, "TypeScript")));
  expect(words(await codeOf(page)), "the list's board.ts again").toBe(words(SHOWN.list));
});

test("nothing of the whole Observer's is fetched before it is wanted", async ({ page }) => {
  test.skip(test.info().project.name === "no-webassembly", "what plays is the webassembly project's to check");
  const fetched = [];
  page.on("request", (request) => /ObserverPanel/.test(request.url()) && fetched.push(request.url()));
  await open(page, "/");
  await expect(shown(page.getByText("Crew assigned", { exact: true })), "the replay is under way").toBeVisible();
  await page.evaluate(() => new Promise((done) => requestIdleCallback(() => done())));
  await animationFrames(page, 30);
  expect(fetched).toEqual([]);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const phone = viewport.width < 700;

  test.describe(`the front page's first screen at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    // The replay once stood 4 px from its frame's edges, and on a phone its
    // status ran under List and Board: everything keeps the tokens' small
    // step (12 px) from the frame, and each row of the toolbar its own line.
    test("keeps its toolbar off the frame's edges, each row clear of the next", async ({ page }) => {
      test.skip(test.info().project.name === "no-webassembly", "what plays is the webassembly project's to check");
      await open(page, "/");
      const pause = page.getByRole("button", { name: "Pause the agent replay" });
      await expect(pause).toBeVisible();
      const request = shown(page.getByText("Agent: make this a board", { exact: true }));
      const status = shown(page.getByText("Working…", { exact: true }));
      const list = shown(page.getByRole("button", { name: "List layout" }));
      // Under load the kept shell can take over after hydration, and the
      // render read first is then hidden (its boxes all 0): read the boxes
      // again until the shown render has them, then hold it to the gaps.
      await expect(async () => {
        const boxes = await Promise.all([pause, request, status, list].map((locator) => locator.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
        })));
        // The frame: the first painted box round the request that holds the
        // frame's button too.
        const frame = await request.evaluate((element, button) => {
          const held = button.getBoundingClientRect();
          for (let up = element.parentElement; up; up = up.parentElement) {
            const box = up.getBoundingClientRect();
            const painted = !/rgba\(.*, 0\)$|transparent/.test(getComputedStyle(up).backgroundColor);
            if (painted && box.left <= held.left && box.right >= held.right && box.top <= held.top) return { left: box.left, top: box.top, right: box.right };
          }
          return null;
        }, await pause.elementHandle());
        expect(frame, "the frame").not.toBeNull();
        const [paused, asked, said, listed] = boxes;
        const room = {
          "the request from the frame's left": asked.left - frame.left,
          "List from the frame's left": listed.left - frame.left,
          "Pause from the frame's top": paused.top - frame.top,
          "Pause from the frame's right": frame.right - paused.right,
          "List from the frame's top": listed.top - frame.top,
        };
        // A phone's is the smaller step (8 px), so its code keeps 14 pixels.
        // The boxes go with each failure: a request read before it is laid out
        // stands at 0, which says so.
        const where = JSON.stringify({ frame, pause: paused, request: asked, list: listed });
        for (const [what, gap] of Object.entries(room)) expect(gap, `${what}: ${where}`).toBeGreaterThanOrEqual(phone ? 7.5 : 11.5);
        expect(said.top, "the status under List and Board").toBeGreaterThanOrEqual(listed.bottom);
        if (phone) expect(listed.top, "List and Board under Pause").toBeGreaterThanOrEqual(paused.bottom);
      }).toPass({ timeout: 15_000 });
    });

    test("shows the app being reshaped, and says it is a replay while it plays", async ({ page }) => {
      test.skip(test.info().project.name === "no-webassembly", "what plays is the webassembly project's to check");
      await open(page, "/");
      const pause = page.getByRole("button", { name: "Pause the agent replay" });
      await expect(pause).toBeVisible();
      await expect(pause, "Pause").toBeInViewport({ ratio: 1 });
      await expect(replayLabel(page), "its label").toBeInViewport({ ratio: 1 });
      await expect(page.getByText("Replay · no live agent", { exact: true }).filter({ visible: true }), "said once").toHaveCount(1);
      await expect(page.getByRole("button", { name: "Observer for the agent replay" }), "one Observer, its tab").toHaveCount(0);
      await expect(shown(page.getByText("Agent: make this a board", { exact: true })), "what was asked").toBeInViewport({ ratio: 1 });
      await expect(shown(page.getByText("Working…", { exact: true })), "that it is working").toBeInViewport({ ratio: 1 });
      await expect(shown(page.getByText("North district dispatch", { exact: true })), "the app it changes").toBeInViewport({ ratio: 1 });
      const code = shown(page.getByText(/export function lanes\(/));
      if (!phone) {
        await expect(shown(page.getByText("board.ts, the code this app runs", { exact: true })), "its source").toBeInViewport({ ratio: 1 });
        await expect(code, "the code").toBeInViewport({ ratio: 1 });
        for (const layout of ["List", "Board"])
          await expect(shown(page.getByRole("button", { name: `${layout} layout` })), `Edit: ${layout}`).toBeInViewport({ ratio: 1 });
      } else {
        // Over the app, the lines of the running file the edit changes.
        await expect(shown(page.getByText(/^(return \[\{ )?title: "/)), "the code strip").toBeInViewport({ ratio: 1 });
      }
      // The poster, the board and its code, stays under the demo while it
      // fades in and is hidden as the fade ends (ReplayFrame.qml). Found
      // first until then, the poster's code could be hidden between being
      // found and being read, when innerText runs its lines together. What
      // is measured is the running app's code, once it is the only one.
      await expect(page.getByText(/export function lanes\(/).filter({ visible: true }), "the poster's code gone").toHaveCount(1);
      const drawn = await code.evaluate((element) => {
        const text = element.closest(".qq-text") ?? element;
        const range = document.createRange();
        range.selectNodeContents(text);
        const [box, ink] = [text.getBoundingClientRect(), range.getBoundingClientRect()];
        const size = parseFloat(getComputedStyle(range.startContainer.querySelector?.("span") ?? text).fontSize);
        return { past: ink.right - box.right, tall: ink.bottom - box.top, size };
      });
      expect(drawn.past, "no line of the code is cut").toBeLessThanOrEqual(0.5);
      // Whichever file runs as it is measured, word for word, and no line of it wrapped.
      const text = await codeOf(page);
      expect([SHOWN.list, SHOWN.board].map(words), "the running app's board.ts").toContain(words(text));
      const file = words(text) === words(SHOWN.list) ? SHOWN.list : SHOWN.board;
      expect(drawn.tall, "no line of the code wraps").toBeLessThanOrEqual(file.split("\n").length * 22 + 1);
      expect(drawn.size, "large enough to read").toBeGreaterThanOrEqual(14);
      // One toolbar: its parts in the band over the app, its button last.
      const boxOf = (locator) => locator.boundingBox();
      const app = await boxOf(shown(page.getByText("Brekka Grid", { exact: true })));
      const request = await boxOf(shown(page.getByText("Agent: make this a board", { exact: true })));
      const [button, label, list] = [await boxOf(pause), await boxOf(replayLabel(page)), await boxOf(shown(page.getByRole("button", { name: "List layout" })))];
      // By their middles: a button's box is a touch target, taller than
      // the line of words it stands beside.
      for (const [name, box] of Object.entries({ button, label, list })) {
        expect(box.y + box.height / 2, `${name} in the toolbar`).toBeGreaterThanOrEqual(request.y - 16);
        expect(box.y + box.height, `${name} over the app`).toBeLessThanOrEqual(app.y);
      }
      expect(button.x, "the button after the request").toBeGreaterThanOrEqual(request.x + request.width - 1);
      if (!phone) expect(button.x, "the button at the end").toBeGreaterThanOrEqual(list.x + list.width);
      // No fill of the accent: Assign crew, in the app, is the one thing in it.
      const fill = (locator) => locator.evaluate((element) => getComputedStyle(element).backgroundColor);
      expect(await fill(pause), "a quiet button").not.toBe(await fill(shown(page.getByRole("button", { name: /^Assign crew to / }))));
      for (const name of ["Agent", "Observer", "TypeScript"]) {
        await press(shown(tab(page, name)));
        await expect(pause, "still playing").toBeVisible();
        await expect(replayLabel(page), `its label over the ${name} tab`).toBeVisible();
        if (!phone) await expect(replayLabel(page)).toBeInViewport({ ratio: 1 });
      }
    });

    test("the app fits what it shows, and the page stays put", async ({ page }) => {
      test.skip(test.info().project.name === "no-webassembly", "what plays is the webassembly project's to check");
      await open(page, "/");
      await expect(page.getByRole("button", { name: "Pause the agent replay" })).toBeVisible();
      // Rows rise as they come, so each is measured once they stand.
      const measure = () => page.evaluate(() => {
        const seen = (element) => element.checkVisibility({ visibilityProperty: true });
        const named = (words) => [...document.querySelectorAll("#app .qq-text")].find((element) => seen(element) && element.textContent.replaceAll("\n", " ") === words);
        const org = named("Brekka Grid");
        const rows = [...document.querySelectorAll('[role="listitem"]')].filter((row) => seen(row) && /^BG-/.test(row.getAttribute("aria-label") ?? ""));
        let body = org;
        while (!body.contains(rows[0])) body = body.parentElement;
        const card = body.parentElement.getBoundingClientRect();
        const widest = Math.max(...rows.map((row) => row.getBoundingClientRect().width));
        const under = named("Your agent can use the app, too.").getBoundingClientRect().top - org.getBoundingClientRect().top;
        return {
          blank: card.bottom - Math.max(...rows.map((row) => row.getBoundingClientRect().bottom)),
          beside: card.width - widest,
          cut: body.textContent.includes("…"),
          under,
        };
      });
      const look = async (state) => {
        await expect.poll(async () => Math.abs((await measure()).blank - 12), { message: `${state}: the frame is as tall as what is in it` }).toBeLessThanOrEqual(3);
        const now = await measure();
        expect(now.cut, `${state}: nothing cut`).toBe(false);
        return now.under;
      };
      const start = await look("the list");
      await expect(shown(page.getByText("Crew assigned", { exact: true }))).toBeVisible();
      expect(await look("the board"), "the page at the board").toBeCloseTo(start, 0);
      await expect(page.getByText("answered", { exact: true })).toHaveCount(calls, { timeout: 60_000 });
      expect(await look("the end"), "the page at the end").toBeCloseTo(start, 0);
      await press(shown(page.getByRole("button", { name: "Assign crew to BG-421" })));
      await expect(page.getByRole("button", { name: "Assign crew to BG-421" })).toHaveCount(0);
      expect(await look("after the reader's press"), "the page after the press").toBeCloseTo(start, 0);
      await expect(shown(page.getByText("Done", { exact: true })), "nothing left to suggest").toBeVisible();
      // The replay leaves the filter off, so this is already every ticket.
      await expect(shown(page.getByText("West ridge battery test", { exact: true })), "the fullest board").toBeVisible();
      expect(await look("the fullest board"), "the page at the fullest board").toBeCloseTo(start, 0);
      await expect(page.getByText("Needs a crew", { exact: true }).filter({ visible: true }), "no empty lane").toHaveCount(0);
      expect(Math.abs((await measure()).beside - 24), "the crewed lane has the app's whole width").toBeLessThanOrEqual(3);
      // The rest of what every ticket assigned can be: which is tallest isn't assumed.
      await press(shown(page.getByRole("button", { name: "List layout" })));
      await expect(page.getByText("Crew assigned", { exact: true }).filter({ visible: true })).toHaveCount(0);
      expect(await look("the fullest list"), "the page at the fullest list").toBeCloseTo(start, 0);
      await press(shown(page.getByRole("button", { name: "Open only" })));
      await expect(page.getByText("West ridge battery test", { exact: true }).filter({ visible: true })).toHaveCount(0);
      expect(await look("the filtered list"), "the page at the filtered list").toBeCloseTo(start, 0);
      await press(shown(page.getByRole("button", { name: "Board layout" })));
      await expect(shown(page.getByText("Crew assigned", { exact: true }))).toBeVisible();
      expect(await look("the filtered board, all assigned"), "the page at the filtered board, all assigned").toBeCloseTo(start, 0);
    });

    test("says Done only once the last call has answered", async ({ page }) => {
      test.skip(test.info().project.name === "no-webassembly", "what plays is the webassembly project's to check");
      await open(page, "/");
      await expect(page.getByRole("button", { name: "Pause the agent replay" })).toBeVisible();
      // Each frame, so a Done between two of expect's looks is caught too.
      await page.evaluate((calls) => {
        const seen = { early: 0, boardWithoutDone: 0, after: 0 };
        window.saidDone = seen;
        const visible = (node) => node.parentElement.checkVisibility({ visibilityProperty: true, opacityProperty: true });
        const look = () => {
          let [answered, done, board] = [0, false, false];
          const texts = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          for (let node = texts.nextNode(); node; node = texts.nextNode()) {
            if (node.data === "answered") answered += 1;
            else if (/^Done\b/.test(node.data)) done ||= visible(node);
            else if (node.data === "Crew assigned") board ||= visible(node);
          }
          if (done && answered < calls) seen.early += 1;
          if (done && answered >= calls) seen.after += 1;
          if (board && !done && answered < calls) seen.boardWithoutDone += 1;
          if (!seen.after) requestAnimationFrame(look);
        };
        requestAnimationFrame(look);
      }, calls);
      await expect(page.getByText("answered", { exact: true }), "every call is answered").toHaveCount(calls, { timeout: 60_000 });
      await expect(shown(page.getByText(nextStep, { exact: true })), "that it is done, and what to press").toBeInViewport({ ratio: 1 });
      await expect.poll(() => page.evaluate(() => window.saidDone.after), { message: "Done after the last answer" }).toBeGreaterThan(0);
      const seen = await page.evaluate(() => window.saidDone);
      expect(seen.early, "no Done before the last answer").toBe(0);
      expect(seen.boardWithoutDone, "a board still at work was seen").toBeGreaterThan(0);
    });

    test("its Pause is reached by Tab, and Enter on it stops the calls", async ({ page }) => {
      test.skip(test.info().project.name === "no-webassembly", "what plays is the webassembly project's to check");
      await open(page, "/");
      const pause = page.getByRole("button", { name: "Pause the agent replay" });
      await expect(pause).toBeInViewport({ ratio: 1 });
      // A button's focus is the runtime's, so its ring is what says it.
      const parts = () => pause.evaluate((button) => [...button.querySelectorAll("*")].filter((part) => part.checkVisibility({ visibilityProperty: true, opacityProperty: true })).length);
      const unfocused = await parts();
      await press(shown(page.getByRole("heading", { level: 1 })));
      let reached = false;
      for (let tab = 0; tab < 40 && !reached; tab += 1) {
        await page.keyboard.press("Tab");
        await animationFrames(page, 2);
        reached = (await parts()) > unfocused;
      }
      expect(reached, "Tab reaches Pause").toBe(true);
      await page.keyboard.press("Enter");
      await expect(page.getByRole("button", { name: "Resume the agent replay" })).toBeVisible();
      // A call already on its way may still answer; none follows it.
      await page.waitForTimeout(500);
      const answered = await page.getByText("answered", { exact: true }).count();
      expect(answered, "paused before its end").toBeLessThan(calls);
      await page.waitForTimeout(3000);
      expect(await page.getByText("answered", { exact: true }).count(), "no call after Pause").toBe(answered);
    });

    test("a layout the reader picks between a find and its click is found in again, and clicked", async ({ page }) => {
      test.skip(test.info().project.name === "no-webassembly", "what plays is the webassembly project's to check");
      await open(page, "/");
      await expect(page.getByRole("button", { name: "Pause the agent replay" })).toBeVisible({ timeout: 30_000 });
      await takenOver(page);
      await press(shown(tab(page, "Agent")));
      const answered = page.getByText("answered", { exact: true });
      // The find has answered; its click is a second away.
      await expect(page.getByText(/match · .*Assign crew to BG-415/), "the find").toHaveCount(1, { timeout: 30_000 });
      await press(page.getByRole("button", { name: "Pause the agent replay" }));
      await expect(page.getByRole("button", { name: "Resume the agent replay" })).toBeVisible();
      expect(await answered.count(), "paused after the find, before its click").toBe(3);
      // The app the button was found in is gone once the board runs.
      await press(shown(page.getByRole("button", { name: "Board layout" })));
      await press(page.getByRole("button", { name: "Resume the agent replay" }));
      // What the app said while paused streams in once it plays.
      await expect(page.getByText(/^app {2}layout changed to board$/)).toHaveCount(1, { timeout: 30_000 });
      // Found again in the board, and pressed: every call answered, the
      // find twice, and none refused.
      await expect(answered, "every call is answered").toHaveCount(calls + 1, { timeout: 60_000 });
      await expect(page.getByText("refused", { exact: true })).toHaveCount(0);
      await expect(page.getByText(/match · .*Assign crew to BG-415/), "found again").toHaveCount(2);
      await expect(page.getByText(/^app {2}assigned BG-415 to On-call crew$/)).toHaveCount(1);
    });

    test("the Observer's objects are picked from the keyboard, by Enter or Space", async ({ page }) => {
      test.skip(test.info().project.name === "no-webassembly", "what plays is the webassembly project's to check");
      await open(page, "/");
      // The replay's own clicks would take the focus the reader gives.
      await press(page.getByRole("button", { name: "Pause the agent replay" }));
      await expect(page.getByRole("button", { name: "Resume the agent replay" })).toBeVisible();
      await takenOver(page);
      await press(shown(tab(page, "Observer")));
      const rows = page.getByRole("button", { name: /^Inspect / }).filter({ visible: true });
      await expect(rows.first(), "the app's objects").toBeVisible({ timeout: 30_000 });
      const none = page.getByText("Pick an object to see its properties.", { exact: true }).filter({ visible: true });
      await expect(none).toHaveCount(1);
      // A row's focus is the runtime's, so its ring is what says it: one
      // more part of it drawn.
      const parts = () => rows.evaluateAll((all) => all.map((row) => [...row.querySelectorAll("*")].filter((part) => part.checkVisibility({ visibilityProperty: true, opacityProperty: true })).length));
      const unfocused = await parts();
      const ringed = async () => (await parts()).findIndex((count, row) => count > unfocused[row]);
      const fill = (row) => rows.nth(row).evaluate((element) => getComputedStyle(element).backgroundColor);
      let at = -1;
      for (let tab = 0; tab < 60 && at < 0; tab += 1) {
        await page.keyboard.press("Tab");
        await animationFrames(page, 2);
        at = await ringed();
      }
      expect(at, "Tab reaches a row, and its ring shows").toBeGreaterThanOrEqual(0);
      const plain = await fill(at);
      await page.keyboard.press("Enter");
      await expect(none, "Enter picks it").toHaveCount(0);
      await expect.poll(() => fill(at), { message: "the row picked" }).not.toBe(plain);
      const picked = await fill(at);
      await page.keyboard.press("Tab");
      await expect.poll(ringed, { message: "Tab goes on to the next row" }).toBe(at + 1);
      await page.keyboard.press("Space");
      await expect.poll(() => fill(at + 1), { message: "Space picks it" }).toBe(picked);
      expect(await fill(at), "and the one before is not").toBe(plain);
    });

    test("an Observer row reached by Tab is scrolled to where it can be seen", async ({ page }) => {
      test.skip(test.info().project.name === "no-webassembly", "what plays is the webassembly project's to check");
      await open(page, "/");
      await press(page.getByRole("button", { name: "Pause the agent replay" }));
      await expect(page.getByRole("button", { name: "Resume the agent replay" })).toBeVisible();
      await takenOver(page);
      await press(shown(tab(page, "Observer")));
      const rows = page.getByRole("button", { name: /^Inspect / }).filter({ visible: true });
      await expect(rows.first(), "the app's objects").toBeVisible({ timeout: 30_000 });
      const count = await rows.count();
      // Seen: what is drawn at the middle of the row is the row's own.
      const seen = (row) => rows.nth(row).evaluate((element) => {
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return hit !== null && element.contains(hit);
      });
      const hidden = [];
      for (let row = 0; row < count; row += 1) if (!(await seen(row))) hidden.push(row);
      expect(hidden.length, "more rows than the tree shows at once").toBeGreaterThan(0);
      const parts = () => rows.evaluateAll((all) => all.map((row) => [...row.querySelectorAll("*")].filter((part) => part.checkVisibility({ visibilityProperty: true, opacityProperty: true })).length));
      const unfocused = await parts();
      const ringed = async () => (await parts()).findIndex((n, row) => n > unfocused[row]);
      let at = -1;
      for (let tab = 0; tab < 60 && at < 0; tab += 1) {
        await page.keyboard.press("Tab");
        await animationFrames(page, 2);
        at = await ringed();
      }
      expect(at, "Tab reaches a row").toBeGreaterThanOrEqual(0);
      const last = hidden[hidden.length - 1];
      while (at < last) {
        await page.keyboard.press("Tab");
        await expect.poll(ringed, { message: "Tab goes on to the next row" }).toBe(at + 1);
        at += 1;
        await expect.poll(() => seen(at), { message: `row ${at} of ${count}, focused, is seen` }).toBe(true);
      }
    });

    test.describe("with less motion", () => {
      test.use({ reducedMotion: "reduce" });

      test("a replay whose module does not load says so, and is not left starting", async ({ page }) => {
        test.skip(test.info().project.name === "no-webassembly", "what plays is the webassembly project's to check");
        await page.route(/\/assets\/AgentStage-[^/]*\.js$/, (route) => route.abort());
        await open(page, "/");
        const run = runButton(page, "Run the agent replay");
        await expect(run).toBeVisible({ timeout: 30_000 });
        await page.evaluate(() => {
          const said = (window.said = []);
          new MutationObserver((records) => {
            for (const record of records) for (const node of record.addedNodes) if (node.textContent && record.target.closest?.("[aria-live]")) said.push(node.textContent);
          }).observe(document.body, { childList: true, subtree: true });
        });
        await press(run);
        await expect.poll(() => page.evaluate(() => window.said), { message: "what a screen reader is told", timeout: 30_000 }).toContain("The agent replay did not compile");
      });

      test("a replay whose module did not load is tried again from its button", async ({ page }) => {
        test.skip(test.info().project.name === "no-webassembly", "what plays is the webassembly project's to check");
        let aborted = 0;
        await page.route(/\/assets\/AgentStage-[^/]*\.js$/, (route) => {
          aborted += 1;
          return route.abort();
        }, { times: 1 });
        await open(page, "/");
        await press(runButton(page, "Run the agent replay"));
        const again = page.getByRole("button", { name: "Try the agent replay again" });
        await expect(again, "a failed load offers to try again, not a start in progress").toBeVisible({ timeout: 30_000 });
        expect(aborted, "the module's one failed load").toBe(1);
        await press(again);
        await expect(page.getByRole("button", { name: "Pause the agent replay" }), "loaded the second time, and playing").toBeVisible({ timeout: 30_000 });
      });

      test("a pause of the reader's stays one once motion is allowed", async ({ page }) => {
        test.skip(test.info().project.name === "no-webassembly", "what plays is the webassembly project's to check");
        await page.emulateMedia({ reducedMotion: "reduce" });
        await open(page, "/");
        await press(runButton(page, "Run the agent replay"));
        await press(page.getByRole("button", { name: "Pause the agent replay" }));
        const resume = page.getByRole("button", { name: "Resume the agent replay" });
        await expect(resume).toBeVisible();
        await page.waitForTimeout(500);
        const answered = await page.getByText("answered", { exact: true }).count();
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await animationFrames(page, 30);
        await expect(resume, "still paused").toBeVisible();
        await page.waitForTimeout(3000);
        expect(await page.getByText("answered", { exact: true }).count(), "no call after the pause").toBe(answered);
      });

      test("shows the board finished, to change by hand, and waits for Run", async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await open(page, "/");
        await animationFrames(page, 30);
        await expect(page.getByRole("button", { name: "Pause the agent replay" }), "nothing plays").toHaveCount(0);
        await expect(page.getByText("answered", { exact: true }), "no call was sent").toHaveCount(0);
        await expect(replayLabel(page)).toBeInViewport({ ratio: 1 });
        await expect(shown(page.getByText("Agent: make this a board", { exact: true }))).toBeInViewport({ ratio: 1 });
        await expect(shown(page.getByText("End result, not run", { exact: true })), "what stands, before Run").toBeInViewport({ ratio: 1 });
        await expect(page.getByText(/^Done\b/).filter({ visible: true }), "no Done before Run").toHaveCount(0);
        await expect(shown(page.getByText("Crew assigned", { exact: true })), "the result").toBeVisible();
        const run = runButton(page, "Run the agent replay");
        await expect(run).toBeVisible();
        await expect(run, "Run").toBeInViewport({ ratio: 1 });

        // List and Board work on the finished board, with no Run.
        const lanes = page.getByText("Crew assigned", { exact: true }).filter({ visible: true });
        await press(shown(page.getByRole("button", { name: "List layout" })));
        await expect(lanes, "List, without Run").toHaveCount(0);
        await expect(shown(page.getByText("Your edit", { exact: true }))).toBeVisible();
        await press(shown(page.getByRole("button", { name: "Board layout" })));
        await expect(lanes, "Board, without Run").toHaveCount(1);
        await expect(page.getByText("answered", { exact: true }), "still no call was sent").toHaveCount(0);

        // Run starts it from the list, each call in turn. What plays is the
        // webassembly project's to check, as above.
        if (test.info().project.name === "no-webassembly") return;
        await press(run);
        await expect(page.getByRole("button", { name: "Pause the agent replay" }), "Run plays it").toBeVisible();
        await expect(lanes, "from the list").toHaveCount(0);
        await expect.poll(async () => words(await codeOf(page)), { message: "the list's board.ts" }).toBe(words(SHOWN.list));
        await expect(shown(page.getByText("North district dispatch", { exact: true })), "under its heading").toBeVisible();
        const tickets = page.getByRole("list", { name: "Tickets", exact: true }).filter({ visible: true }).getByRole("listitem");
        await expect(tickets, "the five tickets it starts with").toHaveCount(5);
        await expect(tickets.nth(0)).toHaveAccessibleName(/^BG-412 Substation Nord-4 transformer fan alert, /);
        await expect(tickets.nth(1)).toHaveAccessibleName(/^BG-415 Feeder 12 voltage sag log, /);
        await expect(page.getByText(/^Done\b/).filter({ visible: true }), "not Done at its start").toHaveCount(0);
        await expect(lanes, "to the board").toHaveCount(1);
        expect(await page.getByText("answered", { exact: true }).count(), "less motion does not snap every step").toBeLessThan(calls);
        await expect(page.getByText("answered", { exact: true }), "every call is answered").toHaveCount(calls, { timeout: 60_000 });
        await expect(shown(page.getByText(nextStep, { exact: true })), "Done at its end").toBeVisible();
      });
    });
  });
}

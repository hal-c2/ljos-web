// The front page's agent replay, run: each recorded step is sent as the
// MCP tool call it was, to the inspector of the dispatch card on the page,
// and the card changes as an agent's calls change it: its list turned
// into a board, a filter and a crew button found by role and pressed. What
// the card says it did comes back into the agent's log through app_watch
// and app_logs, the replay's own presses and then the reader's. It starts
// itself unless the reader asked for less motion, and says all along that
// it is a replay (features/front-page.feature).
import { readFileSync } from "node:fs";
import { animationFrames, expect, open, press, runButton, test } from "./fixtures.js";

const steps = 14;
// The part of board.ts the page shows (scripts/build.mjs cuts it the same).
const BOARD = readFileSync(new URL("../bundle/Demos/logic/board.ts", import.meta.url), "utf8");
const SHOWN = BOARD.slice(BOARD.indexOf("export function lanes(")).trimEnd();
const shown = (locator) => locator.filter({ visible: true }).first();
const replayLabel = (page) => shown(page.getByText("Replay · no live agent", { exact: true }));

test("the agent replay drives the card over MCP, and what the card does streams back", async ({ page }) => {
  test.skip(test.info().project.name === "no-webassembly", "the replay's poster stands where nothing runs; site-ljos.spec.js reads it");
  await open(page, "/");
  await expect(page.getByRole("button", { name: "Pause the agent replay" }), "it starts without a press").toBeVisible();
  await press(shown(page.getByRole("tab", { name: "Agent", exact: true })));

  // Every call answered, none refused: the poster's calls say neither.
  await expect(page.getByText("answered", { exact: true }), "every step is answered").toHaveCount(steps, { timeout: 60_000 });
  await expect(page.getByText("refused", { exact: true })).toHaveCount(0);
  await expect(shown(page.getByText(`Step ${steps} of ${steps}`, { exact: true }))).toBeVisible();

  // The card as the calls left it: a board, the filter on (the closed
  // ticket gone), and the ticket that had no crew given one.
  await expect(shown(page.getByText("North district dispatch", { exact: true }))).toBeVisible();
  await expect(shown(page.getByText("Crew assigned", { exact: true })), "the list became a board").toBeVisible();
  await expect(page.getByRole("button", { name: "Assign crew to BG-415" })).toHaveCount(0);
  // What it set, each read back from the app's answer.
  await expect(page.getByText(/→ heading: .*North district/), "the heading it set").toHaveCount(1);
  await expect(page.getByText(/→ tickets: /), "the tickets it brought in").toHaveCount(3);
  await expect(page.getByText(/→ filters: .*Open only/), "the filter it offered").toHaveCount(1);
  // One ticket is left for a person, where the board says so.
  await expect(page.getByText("→ unassigned = 1", { exact: false }).first()).toBeAttached();
  await expect(shown(page.getByText("Needs a crew", { exact: true }))).toBeVisible();
  await expect(shown(page.getByText("Harbour pump meter check", { exact: true }))).toBeVisible();
  await expect(page.getByRole("button", { name: /^Assign crew to / }).filter({ visible: true })).toHaveAccessibleName("Assign crew to BG-421");
  // At its end there is nothing to pause.
  await expect(page.getByRole("button", { name: "Pause the agent replay" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Play the agent replay" })).toBeVisible();

  // The replay's own presses, said by the card, back in the log.
  await expect(page.getByText(/^app {2}filter open only: 4 of 5 tickets$/)).toHaveCount(1);
  await expect(page.getByText(/^app {2}assigned BG-415 to On-call crew$/)).toHaveCount(1);

  // The reader's turn: a press of theirs streams in the same way.
  const filter = shown(page.getByRole("button", { name: "Open only" }));
  await press(filter);
  await expect(page.getByText(/^app {2}filter off: 5 tickets$/)).toHaveCount(1);
  await expect(shown(page.getByText("West ridge battery test", { exact: true }))).toBeVisible();

  // And so does their own edit of what the agent changed: the same app,
  // a list again, with the crew it was given.
  await press(shown(page.getByRole("button", { name: "Edit layout: list" })));
  await expect(page.getByText("Crew assigned", { exact: true }).filter({ visible: true })).toHaveCount(0);
  await expect(shown(page.getByText("On-call crew", { exact: true }))).toBeVisible();
  await expect(page.getByRole("button", { name: "Assign crew to BG-415" })).toHaveCount(0);
  await expect(page.getByText(/^app {2}layout changed to list$/)).toHaveCount(1);
});

test("nothing of the whole Observer's is fetched before it is wanted", async ({ page }) => {
  test.skip(test.info().project.name === "no-webassembly", "what plays is the webassembly project's to check");
  const fetched = [];
  page.on("request", (request) => /ObserverPanel/.test(request.url()) && fetched.push(request.url()));
  await open(page, "/");
  await expect(shown(page.getByText("Done · applied live", { exact: true })), "the replay is under way").toBeVisible();
  await page.evaluate(() => new Promise((done) => requestIdleCallback(() => done())));
  await animationFrames(page, 30);
  expect(fetched).toEqual([]);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const phone = viewport.width < 700;

  test.describe(`the front page's first screen at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

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
      await expect(shown(page.getByText("Done · applied live", { exact: true })), "that it is done").toBeInViewport({ ratio: 1 });
      await expect(shown(page.getByText("North district dispatch", { exact: true })), "the app it changes").toBeInViewport({ ratio: 1 });
      const code = shown(page.getByText(/export function lanes\(/));
      if (!phone) {
        await expect(shown(page.getByText("board.ts, the code this app runs", { exact: true })), "its source").toBeInViewport({ ratio: 1 });
        await expect(code, "the code").toBeInViewport({ ratio: 1 });
        for (const layout of ["list", "board"])
          await expect(shown(page.getByRole("button", { name: `Edit layout: ${layout}` })), `Edit: ${layout}`).toBeInViewport({ ratio: 1 });
      }
      const drawn = await code.evaluate((element) => {
        const text = element.closest(".qq-text") ?? element;
        const range = document.createRange();
        range.selectNodeContents(text);
        const [box, ink] = [text.getBoundingClientRect(), range.getBoundingClientRect()];
        return { past: ink.right - box.right, tall: ink.bottom - box.top };
      });
      expect(drawn.past, "no line of the code is cut").toBeLessThanOrEqual(0.5);
      expect(drawn.tall, "no line of the code wraps").toBeLessThanOrEqual(SHOWN.split("\n").length * 17 + 1);
      for (const name of ["Agent", "Observer", "TypeScript"]) {
        await press(shown(page.getByRole("tab", { name, exact: true })));
        await expect(pause, "still playing").toBeVisible();
        await expect(replayLabel(page), `its label over the ${name} tab`).toBeVisible();
        if (!phone) await expect(replayLabel(page)).toBeInViewport({ ratio: 1 });
      }
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
      expect(answered, "paused before its end").toBeLessThan(steps);
      await page.waitForTimeout(3000);
      expect(await page.getByText("answered", { exact: true }).count(), "no call after Pause").toBe(answered);
    });

    test.describe("with less motion", () => {
      test.use({ reducedMotion: "reduce" });

      test("shows the board finished, to change by hand, and waits for Run", async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await open(page, "/");
        await animationFrames(page, 30);
        await expect(page.getByRole("button", { name: "Pause the agent replay" }), "nothing plays").toHaveCount(0);
        await expect(page.getByText("answered", { exact: true }), "no call was sent").toHaveCount(0);
        await expect(replayLabel(page)).toBeInViewport({ ratio: 1 });
        await expect(shown(page.getByText("Agent: make this a board", { exact: true }))).toBeInViewport({ ratio: 1 });
        await expect(shown(page.getByText("Done · applied live", { exact: true }))).toBeInViewport({ ratio: 1 });
        await expect(shown(page.getByText("Crew assigned", { exact: true })), "the result").toBeVisible();
        const run = runButton(page, "Run the agent replay");
        await expect(run).toBeVisible();
        await expect(run, "Run").toBeInViewport({ ratio: 1 });

        // List and Board work on the finished board, with no Run.
        const lanes = page.getByText("Crew assigned", { exact: true }).filter({ visible: true });
        await press(shown(page.getByRole("button", { name: "Edit layout: list" })));
        await expect(lanes, "List, without Run").toHaveCount(0);
        await expect(shown(page.getByText("Your edit", { exact: true }))).toBeVisible();
        await press(shown(page.getByRole("button", { name: "Edit layout: board" })));
        await expect(lanes, "Board, without Run").toHaveCount(1);
        await expect(page.getByText("answered", { exact: true }), "still no call was sent").toHaveCount(0);

        // Run starts it from the list, each call in turn. What plays is the
        // webassembly project's to check, as above.
        if (test.info().project.name === "no-webassembly") return;
        await press(run);
        await expect(page.getByRole("button", { name: "Pause the agent replay" }), "Run plays it").toBeVisible();
        await expect(lanes, "from the list").toHaveCount(0);
        await expect(lanes, "to the board").toHaveCount(1);
        expect(await page.getByText("answered", { exact: true }).count(), "less motion does not snap every step").toBeLessThan(steps);
        await expect(page.getByText("answered", { exact: true }), "every step is answered").toHaveCount(steps, { timeout: 60_000 });
      });
    });
  });
}

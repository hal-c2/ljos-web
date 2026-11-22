// The front page's agent replay, run: each recorded step is sent as the
// MCP tool call it was, to the inspector of the dispatch card on the page,
// and the card changes as an agent's calls change it: its list turned
// into a board, a filter and a crew button found by role and pressed. What
// the card says it did comes back into the agent's log through app_watch
// and app_logs, the replay's own presses and then the reader's. It starts
// itself unless the reader asked for less motion, and says all along that
// it is a replay (features/front-page.feature).
import { animationFrames, expect, open, press, runButton, test } from "./fixtures.js";

const steps = 9;
const shown = (locator) => locator.filter({ visible: true }).first();
const replayLabel = (page) => shown(page.getByText("Replay · no live agent", { exact: true }));

test("the agent replay drives the card over MCP, and what the card does streams back", async ({ page }) => {
  test.skip(test.info().project.name === "no-webassembly", "the replay's poster stands where nothing runs; site-ljos.spec.js reads it");
  await open(page, "/");
  await expect(page.getByRole("button", { name: "Pause the agent replay" }), "it starts without a press").toBeVisible();
  await press(shown(page.getByRole("tab", { name: "Agent", exact: true })));

  // Every call answered, none refused: the poster's calls say "sent".
  await expect(page.getByText("answered", { exact: true }), "every step is answered").toHaveCount(steps, { timeout: 60_000 });
  await expect(page.getByText("refused", { exact: true })).toHaveCount(0);
  await expect(shown(page.getByText(`Step ${steps} of ${steps}`, { exact: true }))).toBeVisible();

  // The card as the calls left it: a board, the filter on (the closed
  // ticket gone), and the ticket that had no crew given one.
  await expect(shown(page.getByText("North district dispatch", { exact: true }))).toBeVisible();
  await expect(shown(page.getByText("Crew assigned", { exact: true })), "the list became a board").toBeVisible();
  await expect(page.getByRole("button", { name: "Assign crew to BG-415" })).toHaveCount(0);
  await expect(page.getByText("→ unassigned = 0", { exact: false }).first()).toBeAttached();

  // The replay's own presses, said by the card, back in the log.
  await expect(page.getByText(/^app {2}filter open only: 3 of 4 tickets$/)).toHaveCount(1);
  await expect(page.getByText(/^app {2}assigned BG-415 to On-call crew$/)).toHaveCount(1);

  // The reader's turn: a press of theirs streams in the same way.
  const filter = shown(page.getByRole("button", { name: "Open only" }));
  await press(filter);
  await expect(page.getByText(/^app {2}filter off: 4 tickets$/)).toHaveCount(1);
  await expect(shown(page.getByText("West ridge battery test", { exact: true }))).toBeVisible();

  // And so does their own edit of what the agent changed: the same app,
  // a list again, with the crew it was given.
  await press(shown(page.getByRole("button", { name: "Edit layout: list" })));
  await expect(page.getByText("Crew assigned", { exact: true }).filter({ visible: true })).toHaveCount(0);
  await expect(shown(page.getByText("On-call crew", { exact: true }))).toBeVisible();
  await expect(page.getByRole("button", { name: "Assign crew to BG-415" })).toHaveCount(0);
  await expect(page.getByText(/^app {2}layout changed to list$/)).toHaveCount(1);
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
      await expect(replayLabel(page), "its label").toBeInViewport({ ratio: 1 });
      await expect(shown(page.getByText('layout: "list" → "board"', { exact: true })), "the change").toBeInViewport({ ratio: 1 });
      await expect(shown(page.getByText("North district dispatch", { exact: true })), "the app it changes").toBeInViewport({ ratio: 1 });
      if (!phone) {
        await expect(shown(page.getByText("board.ts, the code this app runs", { exact: true })), "its source").toBeInViewport({ ratio: 1 });
        await expect(shown(page.getByText(/export function lanes\(/)), "the code").toBeInViewport();
        for (const layout of ["list", "board"])
          await expect(shown(page.getByRole("button", { name: `Edit layout: ${layout}` })), `Edit: ${layout}`).toBeInViewport({ ratio: 1 });
        await expect(pause, "Pause").toBeInViewport({ ratio: 1 });
      }
      for (const name of ["Agent", "Observer", "TypeScript"]) {
        await press(shown(page.getByRole("tab", { name, exact: true })));
        await expect(pause, "still playing").toBeVisible();
        await expect(replayLabel(page), `its label over the ${name} tab`).toBeVisible();
        if (!phone) await expect(replayLabel(page)).toBeInViewport({ ratio: 1 });
      }
    });

    test.describe("with less motion", () => {
      test.use({ reducedMotion: "reduce" });

      test("shows the board finished and waits for Run", async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await open(page, "/");
        await animationFrames(page, 30);
        await expect(page.getByRole("button", { name: "Pause the agent replay" }), "nothing plays").toHaveCount(0);
        await expect(page.getByText("answered", { exact: true }), "no call was sent").toHaveCount(0);
        await expect(replayLabel(page)).toBeInViewport({ ratio: 1 });
        await expect(shown(page.getByText('layout: "list" → "board"', { exact: true }))).toBeInViewport({ ratio: 1 });
        await expect(shown(page.getByText("Crew assigned", { exact: true })), "the result").toBeVisible();
        const run = runButton(page, "Run the agent replay");
        await expect(run).toBeVisible();
        if (!phone) await expect(run, "Run").toBeInViewport({ ratio: 1 });
      });
    });
  });
}

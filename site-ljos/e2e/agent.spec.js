// The front page's agent replay, run: each recorded step is sent as the
// MCP tool call it was, to the inspector of the dispatch card on the page,
// and the card changes as an agent's calls change it: a heading, tickets
// streamed in, a filter and a crew button found by role and pressed. What
// the card says it did comes back into the agent's log through app_watch
// and app_logs, the replay's own presses and then the reader's.
import { expect, open, press, runButton, test } from "./fixtures.js";

const steps = 14;

test("the agent replay drives the card over MCP, and what the card does streams back", async ({ page }) => {
  test.skip(test.info().project.name === "no-webassembly", "the replay's poster stands where nothing runs; site-ljos.spec.js reads it");
  await open(page, "/");
  await press(runButton(page, "Run the agent replay"));

  // Every call answered, none refused: the poster's calls say "sent".
  await expect(page.getByText("answered", { exact: true }), "every step is answered").toHaveCount(steps, { timeout: 60_000 });
  await expect(page.getByText("refused", { exact: true })).toHaveCount(0);
  await expect(page.getByText(`Step ${steps} of ${steps}`, { exact: true }).first()).toBeVisible();

  // The card as the calls left it: its heading set, the filter on (the
  // closed ticket gone), and the ticket that had no crew given one.
  await expect(page.getByText("North district dispatch", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Assign crew to BG-415" })).toHaveCount(0);
  await expect(page.getByText("→ unassigned = 0", { exact: false }).first()).toBeAttached();

  // The replay's own presses, said by the card, back in the log.
  await expect(page.getByText(/^app {2}filter open only: 3 of 4 tickets$/)).toHaveCount(1);
  await expect(page.getByText(/^app {2}assigned BG-415 to On-call crew$/)).toHaveCount(1);

  // The reader's turn: a press of theirs streams in the same way.
  const filter = page.getByRole("button", { name: "Open only" }).first();
  await press(filter);
  await expect(page.getByText(/^app {2}filter off: 4 tickets$/)).toHaveCount(1);
  await expect(page.getByText("West ridge battery test", { exact: true }).first()).toBeVisible();
});

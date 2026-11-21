// The agent-built demo replays a recorded MCP session (agent.spec.js
// checks the session against its recording). Here, the page: each step
// puts the shipped card in the state the agent left it in, and the step
// that waits on the app waits on the reader instead.
import { expect, test } from "@playwright/test";
import { pick, steps } from "../bundle/Demos/logic/session.ts";

const place = (tool, from = 1) => steps.findIndex((step, i) => i + 1 >= from && step.tool === tool) + 1;

async function open(page) {
  await page.goto("/demos/agent-built/");
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  const run = page.getByRole("button", { name: "Run the agent-built replay" });
  await run.click();
  await run.waitFor({ state: "hidden", timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Agent session" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Recorded replay — no live model is called")).toBeVisible();
}

test("each step of the replay is the card as the agent left it", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const step = (n) => page.getByRole("button", { name: `Step ${n}: ${steps[n - 1].tool}` });

  // Before the agent's first edit is taken, the card has no filter.
  await page.getByRole("button", { name: "Restart replay" }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByText(`Step 1 of ${steps.length}`).first()).toBeVisible();
  await expect(page.getByText("Open only", { exact: true })).toHaveCount(0);

  // The audit's step shows what it was called with and what it found.
  const audit = place("app_audit");
  await step(audit).click();
  await expect(page.getByText(`Step ${audit} of ${steps.length}`).first()).toBeVisible();
  await expect(page.getByText("Called with").first()).toBeVisible();
  await expect(page.getByText(/color-text-contrast/).first()).toBeVisible();
  await expect(page.getByText("Open only", { exact: true }).first(), "the filter the reload brought in").toBeVisible();

  // Once the agent has pressed it, the filter is on.
  const press = place("app_click");
  await step(press).click();
  await expect(page.getByText(/^Dispatch · \d+ open$/).first()).toBeVisible();
  // Going back takes it off again.
  await page.getByRole("button", { name: "Previous step" }).click();
  await expect(page.getByText(/^Dispatch · \d+ open$/)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the step that waits on the app waits on the reader, then takes the recorded pick", async ({ page }) => {
  await open(page);
  const wait = steps.findIndex((step) => step.waits) + 1;
  expect(wait).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: `Step ${wait}: ${steps[wait - 1].tool}` }).click();
  await expect(page.getByText(/^Waiting on you: pick a crew/).first()).toBeVisible();
  // Nobody picks, so after its patience the agent's recorded pick is
  // made in the card, and the card's own log line flows back.
  const logged = page.getByRole("list", { name: "From the app" }).getByText(pick.line);
  await expect(logged.first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(`Step ${wait + 1} of ${steps.length}`).first()).toBeVisible({ timeout: 10_000 });
});

test("on a phone the replay's stage sits above its log, and nothing is wider than the page", async ({ browser }) => {
  for (const colorScheme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme });
    try {
      const page = await context.newPage();
      await open(page);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(wide).toBeLessThanOrEqual(390);
      const stage = await page.getByText("Brekka Grid").first().boundingBox();
      const log = await page.getByRole("heading", { name: "Agent session" }).boundingBox();
      expect(stage.y).toBeLessThan(log.y);
    } finally {
      await context.close();
    }
  }
});

// The watch is a pro demo (bundle/Demos/pro.json): pro.spec.js checks
// its copy against the ljos-ui commit it names. Here, the watch the
// page runs is the one the reader's edits make.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { demos, targetOf } from "../scripts/pro.mjs";

const target = targetOf(demos.find((demo) => demo.name === "watch"));

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

  await page.getByRole("button", { name: "FacePulse.qml", exact: true }).click();
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

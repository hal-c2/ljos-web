// Live code blocks on the built site: the prerendered page carries the
// code and a picture of its result, and hydrates into an editor whose
// edits run with state kept. The page is the fixture docs' live-blocks
// page (tests/fixtures/docs), built strictly: every block in it is
// exempt or live, or the build in build-fixture.mjs already failed.
import { expect, test } from "@playwright/test";

const counter = (page) => page.locator("[data-ljos-codeblock]").first();

test("with no JS the code and its picture are the page", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4399/start/live-blocks/");
  await expect(counter(page).locator("pre code")).toContainText("Count: ");
  const picture = counter(page).locator("img");
  await expect(picture).toBeVisible();
  expect(await picture.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(counter(page).locator("textarea")).toHaveCount(0);
  // The old half is labelled, and the shell command stayed plain code.
  await expect(page.locator("[data-ljos-codeblock] .ljos-codeblock__before")).toContainText("Before");
  await context.close();
});

test("a docs block hydrates, edits keep state, and a shell example runs", async ({ page }) => {
  await page.goto("/start/live-blocks/");
  const first = counter(page);
  await first.scrollIntoViewIfNeeded();
  await expect(first).toHaveAttribute("data-state", "live", { timeout: 30000 });
  const stage = first.locator(".ljos-codeblock__stage");
  await stage.click();
  await stage.click();
  await expect(stage).toContainText("Count: 2");
  const editor = first.getByRole("textbox", { name: /Main\.qml/ });
  const value = await editor.inputValue();
  await editor.fill(value.replace("#20242e", "#7a1f1f"));
  await expect
    .poll(() =>
      stage.evaluate(
        (el) => getComputedStyle(el.querySelector(".ljos-codeblock__host").firstElementChild.firstElementChild).backgroundColor,
      ),
    )
    .toBe("rgb(122, 31, 31)");
  await expect(stage).toContainText("Count: 2");

  // A broken edit is said inline; the last good result keeps running.
  await editor.fill(value.replace("width: 320", "width: 320 +"));
  await expect(first.getByRole("alert")).toContainText(/Main\.qml:\d+/, { timeout: 30000 });
  await expect(stage).toContainText("Count: 2");

  // The harnessed snippet and the user's-shell example are live too.
  const harnessed = page.locator("[data-ljos-codeblock]").nth(1);
  await harnessed.scrollIntoViewIfNeeded();
  await expect(harnessed).toHaveAttribute("data-state", "live", { timeout: 30000 });
  await expect(harnessed.locator(".ljos-codeblock__stage")).toContainText("Hello from a snippet");

  const shell = page.locator("[data-ljos-codeblock]").nth(2);
  await shell.scrollIntoViewIfNeeded();
  await expect(shell).toHaveAttribute("data-state", "live", { timeout: 30000 });
  await expect(shell.locator(".ljos-codeblock__stage")).toContainText("My shell");
  await expect(shell.locator(".ljos-codeblock__stage")).toContainText("Count: 0");
});

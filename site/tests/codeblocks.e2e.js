// Live code blocks on the built site: the prerendered page carries the
// code and the result as the prerender wrote it, and hydrates into an
// editor whose edits run with state kept. The page is the fixture docs' live-blocks
// page (tests/fixtures/docs), built strictly: every block in it is
// exempt or live, or the build in build-fixture.mjs already failed.
import { expect, test } from "@playwright/test";

const counter = (page) => page.locator("[data-ljos-codeblock]").first();

// The block's CodeMirror editor once it has come in over the static code.
async function editorOf(figure, name) {
  await expect(figure).toHaveAttribute("data-editor", "ready", { timeout: 30000 });
  return figure.locator(".cm-content").and(figure.getByRole("textbox", { name }));
}
const textOf = (editor) => editor.evaluate((el) => [...el.querySelectorAll(".cm-line")].map((line) => line.textContent).join("\n"));
async function retype(editor, text) {
  await editor.focus();
  await editor.press("ControlOrMeta+a");
  await editor.page().keyboard.insertText(text);
}

test("with no JS the code and its prerendered result are the page", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4399/start/live-blocks/");
  await expect(counter(page).locator("pre code")).toContainText("Count: ");
  await expect(counter(page).locator(".ljos-codeblock__stage")).toContainText("Count: 0");
  await expect(counter(page).locator("[data-hk]").first()).toBeVisible();
  await expect(counter(page).locator("textarea, .cm-editor")).toHaveCount(0);
  // The old half is labelled, and the shell command stayed plain code.
  await expect(page.locator("[data-ljos-codeblock] .ljos-codeblock__before")).toContainText("Before");
  // The fence inside a list item found its prerender (same hash on
  // raw text in the prerender step and on mdast in the remark step).
  const listed = page.locator("[data-ljos-codeblock]").last();
  await expect(listed.locator(".ljos-codeblock__stage")).toContainText("From a list");
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
  const editor = await editorOf(first, /Main\.qml/);
  const value = await textOf(editor);
  await retype(editor, value.replace("#20242e", "#7a1f1f"));
  await expect
    .poll(() =>
      stage.evaluate(
        (el) => [...el.querySelectorAll("*")].some((node) => getComputedStyle(node).backgroundColor === "rgb(122, 31, 31)"),
      ),
    )
    .toBe(true);
  await expect(stage).toContainText("Count: 2");

  // A broken edit is said inline; the last good result keeps running.
  await retype(editor, value.replace("width: 320", "width: 320 +"));
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

  // A Controls example edits and runs: this page is built with them,
  // so the compiler in the page has them to give.
  const controls = page.locator("[data-ljos-codeblock]").nth(3);
  await controls.scrollIntoViewIfNeeded();
  await expect(controls).toHaveAttribute("data-state", "live", { timeout: 30000 });
  await expect(controls.locator(".ljos-codeblock__stage")).toContainText("Pressed: 0");
  await controls.locator(".ljos-codeblock__stage").getByText("Press", { exact: true }).click();
  await expect(controls.locator(".ljos-codeblock__stage")).toContainText("Pressed: 1");
});

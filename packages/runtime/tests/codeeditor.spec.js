// The code editor over a QML item (`codeblock/attach`), as a page that
// draws its own code blocks has it: it takes the look of the Text it
// stands in for, and keeps taking it while it is there.
import { expect, open, test } from "./open.js";

// `codeblock/attach`, from where the page has its runtime.
async function attachIn(page) {
  return page.evaluateHandle(async () => {
    const object = performance.getEntriesByType("resource").find(({ name }) => /\/object\.ts(\?|$)/.test(name)).name;
    return await import(new URL("codeblocks/attach.js", object.replace(/[?#].*$/, "")).href);
  });
}

// With no `--ljos-code-fg` of a page's, the editor's words are the
// Text's colour: a scheme picked once the editor is in (a page's dark
// theme) is the new colour there too, and the new size.
test("the code editor follows the look of the Text it took the place of", async ({ page }) => {
  await open(page, "editorink");
  const attach = await attachIn(page);
  await page.evaluate((attach) => {
    window.editor = attach.attachCodeEditor(window.scene.fieldItem(), { like: window.scene.shownText() });
  }, attach);
  const editor = page.locator(".cm-editor");
  await expect(editor).toBeVisible();
  const look = () => editor.evaluate((element) => ({ color: getComputedStyle(element).color, size: getComputedStyle(element).fontSize }));
  expect(await look()).toEqual({ color: "rgb(27, 31, 42)", size: "14px" });
  await page.evaluate(() => (window.scene.dark = true));
  await expect.poll(look, { message: "the editor's words are the Text's new colour and size" }).toEqual({ color: "rgb(238, 240, 247)", size: "15px" });
  // Gone, it watches nothing: a change after that reaches no editor.
  await page.evaluate(() => (window.host = document.querySelector(".ljos-codeblock__editor--item")));
  await page.evaluate(() => window.editor.destroy());
  await expect(editor).toHaveCount(0);
  await page.evaluate(() => (window.scene.dark = false));
  // The Text took the light scheme (its own style changed, which is what
  // the editor watched), and the editor's old host kept the dark ink.
  const textInk = () => page.evaluate(() => {
    const node = window.scene.shownText().$node;
    return getComputedStyle(node.querySelector(".qq-markup, .qq-text") ?? node).color;
  });
  await expect.poll(textInk).toBe("rgb(27, 31, 42)");
  expect(await page.evaluate(() => window.host.style.color)).toBe("rgb(238, 240, 247)");
});

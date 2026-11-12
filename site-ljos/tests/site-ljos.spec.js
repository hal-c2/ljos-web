// ljos.dev as prerendered Ljós pages: the landing page leads with a
// shell of your own, a docs page reads whole with no script at all —
// its text, its navigation and its place in the sidebar — and with
// script the shell navigates, its contents list lands on a heading,
// and light and dark are the reader's to choose.
import { expect, test } from "@playwright/test";

// A press lands on the MouseArea over the words, as a reader's does:
// press there, not on the text.
async function press(page, locator) {
  const box = await locator.boundingBox();
  expect(box, "the words to press are on the page").toBeTruthy();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

// The size the build prerenders at: with no script there is no
// relayout, and the page keeps the build's geometry (docs/LJOS_WEB.md
// A26 — hydration settles the exact numbers in place).
const BUILD_SIZE = { width: 1440, height: 900 };

test("the landing page leads with your own shell, and never pitches compatibility", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Ljós — malleable software, everywhere", { exact: true })).toBeVisible();
  const words = await page.locator("#app").innerText();
  expect(words.indexOf("Your own shell")).toBeGreaterThan(-1);
  expect(words.indexOf("Your own shell")).toBeLessThan(words.indexOf("TypeScript first"));
  expect(words).toContain("shell.qml");
  expect(words).toContain("ShellLoader");
  expect(words).toContain("Slot");
  expect(words).not.toMatch(/Qt[\s-]?compatible|compatible with Qt/i);
  // Qt is named on the porting page, not on the front page.
  expect(words).not.toContain("Qt");
});

test("a docs page reads with JavaScript off: title, prose, table, code, sidebar and contents", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: BUILD_SIZE });
  try {
    const page = await context.newPage();
    await page.goto("/start/mcp/");
    await expect(page.getByText("MCP Servers for Agents", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Two servers, one model", { exact: true }).first()).toBeVisible();
    // A table's cell, a fenced block's code, the sidebar's order and
    // the page's own contents list are the page's, not a script's.
    await expect(page.getByText("Authoring server", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("ljos mcp --project .", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("What is Ljós?", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("On this page", { exact: true })).toBeVisible();
    await expect(page.getByText("Search the docs…", { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("the demos page names what stands there, flagship first, readable with no script", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: BUILD_SIZE });
  try {
    const page = await context.newPage();
    await page.goto("/demos/");
    const words = await page.locator("#app").innerText();
    expect(words.indexOf("A shell you rewrite")).toBeGreaterThan(-1);
    expect(words.indexOf("A shell you rewrite")).toBeLessThan(words.indexOf("3D you can orbit"));
    await expect(page.getByText("This demo mounts here.").first()).toBeVisible();
  } finally {
    await context.close();
  }
});

test("with script, the sidebar navigates and the contents list lands on its heading", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  await page.goto("/start/");
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  await press(page, page.getByText("MCP Servers for Agents", { exact: true }).first());
  await page.waitForURL("**/start/mcp/");
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  await expect(page.getByText("Two servers, one model", { exact: true }).first()).toBeVisible();
  // The contents entry for a later heading brings it into view.
  const late = page.getByText("The authoring server (ljos mcp)", { exact: true }).last();
  await press(page, late);
  await expect(page.getByText("The authoring server (ljos mcp)", { exact: true }).first()).toBeInViewport();
  expect(errors).toEqual([]);
});

test("light and dark are the reader's", async ({ page }) => {
  await page.goto("/start/");
  await page.waitForSelector('#app[data-ljos-hydrated="true"]');
  // The header's own ground, at a point nothing else covers.
  const ground = () => page.evaluate(() => getComputedStyle(document.elementFromPoint(700, 28)).backgroundColor);
  const before = await ground();
  expect(before).not.toBe("rgba(0, 0, 0, 0)");
  await press(page, page.getByText("Dark", { exact: true }));
  await expect(page.getByText("Light", { exact: true })).toBeVisible();
  expect(await ground()).not.toBe(before);
});

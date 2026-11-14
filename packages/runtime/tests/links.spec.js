// An item whose role is a link is a link of the page's: an `a` with the
// address its `href` says. A plain press is the program's when it holds
// it; a press the program does not hold, a middle press, and a press
// with a modifier are the browser's, as on any link.
import { expect, open, test } from "./open.js";

const elements = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      Object.entries(window.scene.items()).map(([name, item]) => [
        name,
        { tag: item.$node.localName, href: item.$node.getAttribute("href"), role: item.$node.getAttribute("role"), name: item.$node.getAttribute("aria-label") },
      ]),
    ),
  );

const centre = (page, name) =>
  page.evaluate((name) => {
    const { x, y, width, height } = window.scene.items()[name].$node.getBoundingClientRect();
    return { x: x + width / 2, y: y + height / 2 };
  }, name);

test("an item that is a link is an a, with its address and its name", async ({ page }) => {
  await open(page, "links");
  expect(await elements(page)).toEqual({
    held: { tag: "a", href: "/start/", role: "link", name: "Start here" },
    bare: { tag: "a", href: "#bare", role: "link", name: "Bare" },
    // A button that has an `href` property is still a button.
    button: { tag: "div", href: null, role: "button", name: "Press" },
    // What would run a script is no address.
    script: { tag: "a", href: null, role: "link", name: "Script" },
    // A link that is not enabled has no address until it is.
    off: { tag: "a", href: null, role: "link", name: "Off" },
  });
  await page.evaluate(() => window.scene.enable());
  await expect(page.getByRole("link", { name: "Off" })).toHaveAttribute("href", "/off/");
  await expect(page.getByRole("link", { name: "Start here" })).toHaveAttribute("href", "/start/");
  // The address follows what the item's `href` says.
  await page.evaluate(() => window.scene.step());
  await expect(page.getByRole("link", { name: "Start here" })).toHaveAttribute("href", "/start/first-app/");
});

test("a plain press a MouseArea in the link holds is the program's, and the page stays", async ({ page }) => {
  await open(page, "links");
  const before = page.url();
  const at = await centre(page, "held");
  await page.mouse.click(at.x, at.y);
  expect(await page.evaluate(() => window.scene.log)).toEqual(["held"]);
  await page.waitForTimeout(100);
  expect(page.url()).toBe(before);
});

// A press that is held is captured by its scene, so it is let go over
// the scene, not the link. Where a browser sends the click to the link
// it was pressed on, the page still does not go to its address.
test("the click after a press the program held is not the link's to follow", async ({ page }) => {
  await open(page, "links");
  await page.evaluate(() => {
    const link = window.scene.items().held.$node;
    window.clicked = [];
    // After the scene has heard the press let go: the click a browser
    // would send to the link, then.
    window.addEventListener(
      "pointerup",
      () => {
        const click = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 });
        link.dispatchEvent(click);
        window.clicked.push(click.defaultPrevented);
      },
      { once: true },
    );
  });
  const before = page.url();
  const at = await centre(page, "held");
  await page.mouse.click(at.x, at.y);
  expect(await page.evaluate(() => window.clicked)).toEqual([true]);
  expect(await page.evaluate(() => window.scene.log)).toEqual(["held"]);
  expect(page.url()).toBe(before);
});

test("a press on a link nobody in the program holds follows the link", async ({ page }) => {
  await open(page, "links");
  const at = await centre(page, "bare");
  await page.mouse.click(at.x, at.y);
  await expect(page).toHaveURL(/#bare$/);
});

for (const [how, click] of [
  ["the middle button", { button: "middle" }],
  ["a modifier", { modifiers: [process.platform === "darwin" ? "Meta" : "Control"] }],
]) {
  test(`a press with ${how} opens the link in a new tab, and the program hears nothing`, async ({ page, context }) => {
    await open(page, "links");
    const before = page.url();
    const opened = context.waitForEvent("page");
    await page.getByRole("link", { name: "Start here" }).click(click);
    const tab = await opened;
    await tab.waitForLoadState("commit");
    expect(new URL(tab.url()).pathname).toBe("/start/");
    expect(await page.evaluate(() => window.scene.log)).toEqual([]);
    expect(page.url()).toBe(before);
    await tab.close();
  });
}

import { expect, open, test } from "./open.js";

const attributes = (page) =>
  page.evaluate(() => {
    const said = (item) =>
      Object.fromEntries([...item.$node.attributes].filter(({ name }) => name === "role" || name.startsWith("aria-")).map(({ name, value }) => [name, value]));
    const [button, box, caption] = window.scene.items();
    return { button: said(button), box: said(box), caption: said(caption), id: caption.$node.id };
  });

test("what an item is to a reader is said in ARIA on its element", async ({ page }) => {
  await open(page, "accessible");
  expect(await page.evaluate(() => window.scene.read())).toEqual([true, "backspace", false, 43, 41]);
  let said = await attributes(page);
  expect(said.button).toEqual({ role: "button", "aria-label": "backspace" });
  expect(said.box).toEqual({ role: "checkbox", "aria-checked": "false", "aria-labelledby": said.id });
  expect(said.caption).toEqual({});
  await expect(page.getByRole("button", { name: "backspace" })).toHaveCount(1);

  await page.evaluate(() => window.scene.step());
  said = await attributes(page);
  expect(said.button).toEqual({ role: "button", "aria-label": "backspace", "aria-description": "takes one away" });
  expect(said.box["aria-checked"]).toBe("true");
  expect(said.caption).toEqual({ "aria-hidden": "true" });
});

const controls = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      Object.entries(window.scene.items()).map(([name, item]) => [
        name,
        Object.fromEntries([...item.$node.attributes].filter(({ name }) => name === "role" || name.startsWith("aria-")).map(({ name, value }) => [name, value])),
      ]),
    ),
  );

test("a control says what it is and what it is called when its author says nothing", async ({ page }) => {
  await open(page, "accessiblecontrols");
  expect(await page.evaluate(() => window.scene.read())).toEqual([true, "Go", true, true, "Options", "Remove the row", true]);
  let said = await controls(page);
  expect(said.go).toEqual({ role: "button", "aria-label": "Go" });
  expect(said.check).toEqual({ role: "checkbox", "aria-label": "Check", "aria-checked": "false" });
  expect(said.toggle).toEqual({ role: "switch", "aria-label": "Lights", "aria-checked": "false" });
  expect(said.slider).toEqual({ role: "slider", "aria-valuenow": "0", "aria-valuemin": "0", "aria-valuemax": "1" });
  expect(said.group).toEqual({ role: "group", "aria-label": "Options" });
  // Static text has no role of its own in ARIA: it is read as it is.
  expect(said.label).toEqual({});
  expect(said.tabs).toEqual({ role: "tablist" });
  expect(said.tab).toEqual({ role: "tab", "aria-label": "First", "aria-selected": "true" });
  expect(said.second).toEqual({ role: "tab", "aria-label": "Second", "aria-selected": "false" });
  expect(said.mine).toEqual({ role: "button", "aria-label": "Remove the row" });
  expect(said.told).toEqual({ role: "checkbox", "aria-label": "Told", "aria-checked": "true" });
  expect(said.other).toEqual({ role: "link", "aria-label": "Odd" });
  // A text box's saying is on its field, not the box around it:
  // the field is what a reader edits, and it is called by its
  // placeholder until it is given a name.
  expect(said.field).toEqual({});
  expect(said.named).toEqual({});
  await expect(page.getByRole("textbox", { name: "Search" })).toHaveCount(1);
  await expect(page.getByRole("textbox", { name: "Your name" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Go" })).toHaveCount(1);
  await expect(page.getByRole("checkbox", { name: "Check" })).toHaveCount(1);

  await page.evaluate(() => window.scene.step());
  said = await controls(page);
  expect(said.go["aria-label"]).toBe("Stop");
  expect(said.check["aria-checked"]).toBe("true");
});

// A control that takes no input says so, as native Ljós does, and so does
// one inside what takes none: a reader then knows its words are not
// asked of it, and a contrast check passes over them as WCAG does.
test("a control that takes no input says it is disabled, and one in something disabled is too", async ({ page }) => {
  await open(page, "accessiblecontrols");
  let said = await controls(page);
  expect(said.publish).toEqual({ role: "button", "aria-label": "Publish", "aria-disabled": "true" });
  expect(said.inner).toEqual({ role: "button", "aria-label": "Inner", "aria-disabled": "true" });
  await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled();

  await page.evaluate(() => window.scene.step());
  said = await controls(page);
  expect(said.publish).toEqual({ role: "button", "aria-label": "Publish" });
  expect(said.inner["aria-disabled"]).toBe("true");
});

test("what is said is what ARIA allows on the role it is said with", async ({ page }) => {
  await open(page, "accessiblearia");
  let said = await controls(page);
  // A button that checks is a toggle button: ARIA says that with
  // `aria-pressed`, and has no `aria-checked` on a button.
  expect(said.menu).toEqual({ role: "button", "aria-label": "Menu", "aria-pressed": "false" });
  expect(said.bold).toEqual({ role: "button", "aria-label": "Bold", "aria-pressed": "false" });
  expect(said.plain).toEqual({ role: "button", "aria-label": "Plain" });
  // A menu item that checks is ARIA's menu item that checks.
  expect(said.entry).toEqual({ role: "menuitemcheckbox", "aria-label": "Wrap", "aria-checked": "false" });
  // ARIA's heading has a level; one no author gives is its own default.
  expect(said.title).toEqual({ role: "heading", "aria-level": "2" });
  // One whose author gives a level says it, and follows it.
  expect(said.subtitle).toEqual({ role: "heading", "aria-level": "3" });
  // A name on an element with no role is no name at all to ARIA:
  // the item is a named group, as native Ljós tells it.
  expect(said.named).toEqual({ role: "group", "aria-label": "A lit scene" });
  expect(said.picture).toEqual({ role: "img", "aria-label": "A lit scene" });
  expect(said.blank).toEqual({});
  expect(said.caret).toEqual({ role: "group", "aria-label": "Here" });
  // A section is ARIA's region, which a name makes a landmark; the
  // others are landmarks of their own.
  expect(said.section).toEqual({ role: "region", "aria-label": "The page" });
  expect(said.aside).toEqual({ role: "complementary", "aria-label": "On this page" });
  expect(said.footer).toEqual({ role: "contentinfo" });
  await expect(page.getByRole("region", { name: "The page" })).toHaveCount(1);
  // The client area of a window, between its header and its footer,
  // is what the window is for: ARIA's main, which needs no name.
  expect(said.client).toEqual({ role: "main" });
  await expect(page.getByRole("main")).toHaveCount(1);
  // A control of a value says it, and where it lies; a slider with no
  // value to say is none to ARIA, which asks one of it.
  expect(said.progress).toEqual({ role: "progressbar", "aria-valuenow": "0.25", "aria-valuemin": "0", "aria-valuemax": "1" });
  // A progress bar under way at a pace it cannot tell says no value.
  expect(said.busy).toEqual({ role: "progressbar" });
  expect(said.spin).toEqual({ role: "spinbutton", "aria-valuenow": "3", "aria-valuemin": "1", "aria-valuemax": "9" });
  expect(said.puck).toEqual({ role: "group", "aria-label": "Lead the puck" });
  // ARIA has no selected list item: the one chosen is the list's current.
  expect(said.result).toEqual({ role: "listitem", "aria-label": "Result" });
  await expect(page.getByRole("heading", { name: "Title", level: 2 })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Menu", pressed: false })).toHaveCount(1);

  await page.evaluate(() => window.scene.step());
  said = await controls(page);
  expect(said.menu["aria-pressed"]).toBe("true");
  expect(said.bold["aria-pressed"]).toBe("true");
  expect(said.entry["aria-checked"]).toBe("true");
  expect(said.progress["aria-valuenow"]).toBe("0.75");
  expect(said.subtitle["aria-level"]).toBe("4");
  expect(said.busy).toEqual({ role: "progressbar", "aria-valuenow": "0.5", "aria-valuemin": "0", "aria-valuemax": "1" });
  expect(said.result).toEqual({ role: "listitem", "aria-label": "Result", "aria-current": "true" });
});

// Qt's tools find an object by its objectName; a page's tests find the
// item's element by it, without reading words a translation changes.
test("an item's objectName is on its element, and only where it has one", async ({ page }) => {
  await open(page, "objectname");
  const named = () => page.evaluate(() => [...document.querySelectorAll("[data-object-name]")].map((node) => node.dataset.objectName));
  expect(await named()).toEqual(["card"]);
  await page.evaluate(() => (window.objects.named.objectName = "picked"));
  expect(await named()).toEqual(["picked"]);
  await page.evaluate(() => (window.objects.named.objectName = ""));
  expect(await named()).toEqual([]);
});

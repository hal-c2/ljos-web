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
  expect(said.slider).toEqual({ role: "slider" });
  expect(said.group).toEqual({ role: "group", "aria-label": "Options" });
  // Static text has no role of its own in ARIA: it is read as it is.
  expect(said.label).toEqual({});
  expect(said.tabs).toEqual({ role: "tablist" });
  expect(said.tab).toEqual({ role: "tab", "aria-label": "First", "aria-selected": "true" });
  expect(said.second).toEqual({ role: "tab", "aria-label": "Second", "aria-selected": "false" });
  expect(said.mine).toEqual({ role: "button", "aria-label": "Remove the row" });
  expect(said.told).toEqual({ role: "checkbox", "aria-label": "Told", "aria-checked": "true" });
  expect(said.other).toEqual({ role: "link", "aria-label": "Odd" });
  await expect(page.getByRole("button", { name: "Go" })).toHaveCount(1);
  await expect(page.getByRole("checkbox", { name: "Check" })).toHaveCount(1);

  await page.evaluate(() => window.scene.step());
  said = await controls(page);
  expect(said.go["aria-label"]).toBe("Stop");
  expect(said.check["aria-checked"]).toBe("true");
});

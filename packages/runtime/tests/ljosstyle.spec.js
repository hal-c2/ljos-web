// What is expected here is what Ljós's native engine answers for the same
// QML in the same style: ljos-ui's features/controls (button, check-box,
// slider, text-field, combobox, switch) at the commit `controls/` is copied
// from, which run that QML natively.
import { expect, open, test } from "./open.js";

test("the controls are Ljós's own style where no Qt is installed, at the sizes Ljós gives them", async ({ page }) => {
  await open(page, "ljosstyle");
  expect(await page.evaluate(() => JSON.parse(JSON.stringify(window.scene.answers())))).toEqual([
    [100, 40, 6, 8],
    [46, 40, 28, 28, 9, 6],
    [200, 40],
    [200, 40],
    [140, 40, "One"],
    [40],
  ]);
  expect(await page.evaluate(() => window.scene.parts())).toEqual([true, true, true, true, 70, 30, "mine", 2, 2]);
});

test("Ljós's style says what each control is to a reader", async ({ page }) => {
  await open(page, "ljosstyle");
  const said = await page.evaluate(() =>
    Object.fromEntries(
      Object.entries(window.scene.items()).map(([name, item]) => [
        name,
        Object.fromEntries([...item.$node.attributes].filter(({ name }) => name === "role" || name.startsWith("aria-")).map(({ name, value }) => [name, value])),
      ]),
    ),
  );
  expect(said.go).toEqual({ role: "button", "aria-label": "Go" });
  expect(said.check).toMatchObject({ role: "checkbox", "aria-checked": "false" });
  expect(said.toggle).toEqual({ role: "switch", "aria-label": "Lights", "aria-checked": "false" });
  expect(said.slider).toEqual({ role: "slider", "aria-valuenow": "0", "aria-valuemin": "0", "aria-valuemax": "1" });
  expect(said.combo).toMatchObject({ role: "combobox", "aria-label": "One" });
  // What is typed into is the field's text, the page's own text box.
  await expect(page.getByRole("textbox")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Go" })).toHaveCount(1);
  await expect(page.getByRole("switch", { name: "Lights" })).toHaveCount(1);
});

// A Dialog of `import QtQuick.Controls`, in Ljós's style: the style's
// button box has no content item, and holds its buttons itself, in a row
// inside its padding, as Ljós's own runtime does.
import { expect, open, test } from "./open.js";

test("a styled Dialog shows its standard buttons in a row in its footer, and each closes it", async ({ page }) => {
  await open(page, "styleddialog");
  await page.evaluate(() => window.scene.show());
  const ok = page.getByRole("button", { name: "OK" });
  const cancel = page.getByRole("button", { name: "Cancel" });
  await expect(ok).toBeVisible();
  await expect(cancel).toBeVisible();

  // Side by side, in the footer, inside its padding, sharing its width.
  const placed = await page.evaluate(() => {
    const footer = window.objects.confirm.footer;
    const at = (item) => item.mapToItem(footer, 0, 0);
    return {
      footer: [footer.width, footer.height, footer.leftPadding, footer.topPadding, footer.spacing],
      buttons: footer.contentChildren.map((button) => [button.text, at(button).x, at(button).y, button.width, button.height]),
    };
  });
  const [width, , padding, top, spacing] = placed.footer;
  const share = (width - 2 * padding - spacing) / 2;
  const [first, second] = placed.buttons;
  expect(first.slice(1)).toEqual([padding, top, share, first[4]]);
  expect(second.slice(1)).toEqual([padding + share + spacing, top, share, second[4]]);

  await ok.click();
  await expect.poll(() => page.evaluate(() => window.scene.said)).toBe("accepted");
  await expect(ok).toBeHidden();

  await page.evaluate(() => window.scene.show());
  await cancel.click();
  await expect.poll(() => page.evaluate(() => window.scene.said)).toBe("rejected");
});

test("a styled button box lets go of the buttons a Repeater takes back, and shows only the rest", async ({ page }) => {
  await open(page, "repeatedbuttons");
  const held = () =>
    page.evaluate(() => {
      const box = window.objects.box;
      return [box.contentChildren.map((button) => button.text), box.children.filter((child) => child.text).map((child) => child.text)];
    });
  expect(await held()).toEqual([["B0", "B1", "B2"], ["B0", "B1", "B2"]]);
  await page.evaluate(() => {
    window.scene.count = 1;
    window.flush();
  });
  expect(await held()).toEqual([["B0"], ["B0"]]);
  await expect(page.getByRole("button", { name: "B0" })).toBeVisible();
  await expect(page.getByRole("button", { name: "B1" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "B2" })).toHaveCount(0);
});

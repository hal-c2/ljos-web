// The icon of a Qt-style button (QtQuick.Controls.Basic), which its IconLabel
// takes from the button. What is expected is what Ljós's native engine draws
// for the same QML: ljos-ui's crates/ljos_controls/src/icon_label.rs.
import { expect, open, test } from "./open.js";

test("a Basic button's icon is drawn in the colour it was given, as it is when that is transparent, and in its text's colour otherwise", async ({ page }) => {
  await open(page, "buttonicons");
  await page.waitForFunction(() => window.scene.loaded());
  const colors = await page.evaluate(() => JSON.parse(JSON.stringify(window.scene.colors())));
  expect(colors.tinted).toBe("#0066cc");
  // "transparent" is a colour the button was given: it shows the picture untinted.
  expect(colors.asItIs).toBe("#00000000");
  expect(colors.untold[0]).toBe(colors.untold[1]);
  // So is one its action was given.
  expect(colors.acting).toBe("#00000000");
});

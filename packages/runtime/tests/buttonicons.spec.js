// The icon of a Qt-style button (QtQuick.Controls.Basic), which its IconLabel
// takes from the button. What is expected is what Ljós's native engine draws
// for the same QML: ljos-ui's crates/ljos_controls/src/icon_label.rs.
import { expect, open, test } from "./open.js";
import { pixels } from "./pixels.js";

const answer = (page, name) => page.evaluate((name) => JSON.parse(JSON.stringify(window.scene[name]())), name);

test("a Basic button's icon is drawn in the colour it was given, as it is when that is transparent, and in its text's colour otherwise", async ({ page }) => {
  await open(page, "buttonicons");
  await page.waitForFunction(() => window.scene.loaded());
  const colors = await answer(page, "colors");
  expect(colors.tinted).toBe("#0066cc");
  // "transparent" is a colour the button was given: it shows the picture untinted.
  expect(colors.asItIs).toBe("#00000000");
  expect(colors.untold[0]).toBe(colors.untold[1]);
  // So is one its action was given.
  expect(colors.acting).toBe("#00000000");
  // A colour comes with an icon that is another button's, its action's included,
  // and with an icon given whole.
  expect(colors.linked).toBe("#0066cc");
  expect(colors.wholeAction).toBe("#0066cc");
  // A label given its icon whole keeps what that value says.
  expect(colors.holder).toMatch(/circle\.png$/);
});

test("a Basic button's icon given transparent is drawn as the picture is, and one given a colour is painted in it", async ({ page }) => {
  await open(page, "buttonicons");
  await page.waitForFunction(() => window.scene.loaded());
  const middles = await answer(page, "middles");
  const [tinted, asItIs, plain] = await pixels(page, [middles.tinted, middles.asItIs, middles.plain]);
  expect(tinted).toBe("0 102 204");
  expect(asItIs).toBe(plain);
  expect(plain).not.toBe(tinted);
});

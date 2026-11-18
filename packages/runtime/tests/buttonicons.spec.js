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

test("a Basic button given another's icon whole, which was given no colour, is drawn in its action's, and in its text's where that action's icon is the button's own", async ({ page }) => {
  await open(page, "buttonicons");
  await page.waitForFunction(() => window.scene.loaded());
  const colors = await answer(page, "colors");
  // The icon given whole gives the picture it was told; the colour it was not
  // told is the action's, which the button says it has and draws.
  expect(colors.linkedActing).toEqual(["#0066cc", "#0066cc"]);
  // An action whose icon is the button's own gives nothing back: no colour,
  // so the text's, and asking ends.
  const [drawn, text, color] = colors.linkedBack;
  expect(drawn).toBe(text);
  expect(color).toBe("#00000000");
});

test("a Basic button's icon given transparent is drawn as the picture is, and one given a colour is painted in it", async ({ page }) => {
  await open(page, "buttonicons");
  await page.waitForFunction(() => window.scene.loaded());
  const middles = await answer(page, "middles");
  // A tinted picture is painted through a CSS mask, which the browser loads
  // apart from the Image's own load: it is drawn once that has loaded too.
  await expect
    .poll(async () => (await pixels(page, [middles.tinted]))[0], { message: "the tinted icon's middle, once its mask has loaded" })
    .toBe("0 102 204");
  const [tinted, asItIs, plain] = await pixels(page, [middles.tinted, middles.asItIs, middles.plain]);
  expect(asItIs).toBe(plain);
  expect(plain).not.toBe(tinted);
});

test("a Basic button whose action's icon is the button's own is drawn in its text's colour, and asking for its colour ends", async ({ page }) => {
  await open(page, "iconcycle");
  const [icon, text] = await page.evaluate(() => window.scene.colors());
  expect(icon).toBe(text);
});

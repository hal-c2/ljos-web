// Ljós's own controls (`import Ljos.Controls`, `Ljos.Controls.Basic`), from
// `controls/`. What is expected is what Ljós's native engine answers for
// the same QML: ljos-ui's features/controls/ljos-style-labels.feature and
// ljos-style-groups.feature at the commit `controls/` is copied from.
import { expect, open, test } from "./open.js";

const answer = (page, name) => page.evaluate((name) => JSON.parse(JSON.stringify(window.scene[name]())), name);

test("a Ljós button or menu row shows the icon it or its action is given, in its text's colour unless told one", async ({ page }) => {
  await open(page, "ljoscontrols");
  // A picture's size is known once its file has loaded, which may be after
  // the scene is ready.
  await page.waitForFunction(() => window.scene.loaded());
  const icons = await answer(page, "icons");
  // The bare button is all icon, drawn in its ink.
  expect(icons.bare.slice(0, 2)).toEqual([16, true]);
  expect(icons.bare[2]).toBe(icons.bare[3]);
  expect(icons.acting).toEqual([16, true]);
  expect(icons.tinted).toEqual([16, "#0066cc"]);
  // A named glyph wins over a picture.
  expect(icons.named).toEqual([16, true, false]);
  // The icon takes its size and the spacing beside the text.
  expect(icons.roomForIcon).toBe(16 + 8);
  // A row with an icon keeps a gutter for it; one with none has none.
  expect(icons.row).toEqual([true, 24]);
  expect(icons.actingRow).toEqual([true, 24]);
  expect(icons.plainRow).toEqual([false, 0]);
});

test("a Ljós button shows what its display asks for: the icon, the text, or the icon over the text", async ({ page }) => {
  await open(page, "ljoscontrols");
  const shown = await answer(page, "displays");
  // Beside, the default: icon, spacing, text.
  expect(shown.besideWidth).toBe(16 + 8 + shown.labelWidth);
  expect(shown.iconOnly).toEqual([16, true, false]);
  expect(shown.textOnly).toEqual([shown.labelWidth, false, true]);
  expect(shown.pictureTextOnly).toEqual([shown.labelWidth, false]);
  // A menu row shows its icon in the icons' column, or no icon, and keeps
  // the column for none only in a menu that has icons; a tab shows what it
  // is told, the icon over the text too.
  expect(shown.rowIconOnly).toEqual([true, false, 24]);
  expect(shown.rowTextOnly).toEqual([false, true, 0]);
  expect(shown.tabIconOnly).toEqual([true, false]);
  expect(shown.tabTextOnly).toEqual([false, true]);
  // Stacked, it is taller than one line, and keeps half a spacing above
  // and below.
  const [tabOver, tabIconMiddle, tabTextMiddle, tabMiddle, tabPadding] = shown.tabUnder;
  expect([tabOver, tabIconMiddle, tabTextMiddle, tabPadding]).toEqual([true, tabMiddle, tabMiddle, 8]);
  const [width, height, over, iconMiddle, textMiddle, middle, stacked, padding] = shown.under;
  expect(padding).toBe(8);
  expect(width).toBe(shown.labelWidth);
  expect(height).toBe(stacked);
  expect(over).toBe(true);
  expect(iconMiddle).toBe(middle);
  expect(textMiddle).toBe(middle);
});

test("a Ljós empty state's text fits the width it is given, and asks for the width of its text", async ({ page }) => {
  await open(page, "ljoscontrols");
  const texts = await answer(page, "texts");
  for (const [name, natural] of [["narrow", 360], ["basicNarrow", 384]]) {
    const [title, description, available, implicit] = texts[name];
    expect([name, title, description]).toEqual([name, available, available]);
    // What it asks for is what it would with all the room it wants.
    expect([name, implicit]).toEqual([name, natural]);
  }
  expect(texts.natural).toEqual([360, 360, 360, 360]);
  expect(texts.basicNatural).toEqual([360, 360, 360, 384]);
});

test("a Ljós row of buttons is mirrored once, whether by what it is in or by itself", async ({ page }) => {
  await open(page, "ljoscontrols");
  const mirrors = await answer(page, "mirrors");
  // EmptyState, Basic EmptyState, Basic SplitButton, TabButton.
  expect(mirrors.inherited).toEqual([true, true, true, true]);
  expect(mirrors.own).toEqual([true, true, true, true]);
  expect(mirrors.plain).toEqual([false, false, false, false]);
  // The buttons in the row still take the mirroring passed on to them.
  expect(mirrors.buttons).toEqual([true, false]);
});

test("a Ljós popover opens on the side the window has room on, as it is drawn and within its margins", async ({ page }) => {
  await open(page, "ljospopovers");
  const at = await page.evaluate(() => {
    for (const name of ["scaled", "margins", "roomy", "before"]) window.scene.popover(name).open();
    return JSON.parse(JSON.stringify(window.scene.popovers()));
  });
  const TOP = 1, LEFT = 2, BOTTOM = 8;
  // Its button is at 200 to 240 in the window: the popover goes above it,
  // gap and all in the window's pixels, and is not scaled by its button's
  // ancestor.
  expect(at.scaled).toEqual([TOP, 0, -52, 20, 96]);
  // 126 under, 12 of it margin, for 120: above, where 134 is left.
  expect(at.margins).toEqual([TOP, 0, -124, 200, 26]);
  // Room where it is asked to open, so it is where it always was.
  expect(at.roomy).toEqual([BOTTOM, 0, 24, 200, 44]);
  expect(at.before).toEqual([LEFT, -104, 0, 96, 20]);
});

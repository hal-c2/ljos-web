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

test("a Ljós popover follows its button when a transform of an ancestor moves it", async ({ page }) => {
  await open(page, "ljospopovers");
  const TOP = 1, BOTTOM = 8;
  const before = await page.evaluate(() => {
    window.scene.popover("moved").open();
    return JSON.parse(JSON.stringify(window.scene.popovers().moved));
  });
  // No room under its button, at 200 to 220 in a window 300 high.
  expect(before).toEqual([TOP, 0, -104, 280, 96]);
  await page.evaluate(() => {
    window.scene.shift = -150;
  });
  // Moved up to 50, it has room under its button.
  await expect.poll(() => page.evaluate(() => JSON.parse(JSON.stringify(window.scene.popovers().moved)))).toEqual([BOTTOM, 0, 24, 280, 74]);
});

test("a Ljós Basic split button made wider opens its menu against its chevron, in either direction", async ({ page }) => {
  await open(page, "ljoscontrols");
  const edges = await answer(page, "splits");
  expect(edges.plain).toEqual([false, 0]);
  expect(edges.mirrored).toEqual([true, 0]);
});

test("a Ljós button, menu row or tab with only one of its icon and its text shows it, whatever its display", async ({ page }) => {
  await open(page, "ljoslabels");
  const buttons = await answer(page, "buttons");
  expect(buttons.noIcon).toEqual([0, [false, true]]);
  expect(buttons.noText).toEqual([16, [true, false]]);
  const rows = await answer(page, "rows");
  expect(rows.noIcon).toEqual([0, [false, true]]);
  expect(rows.noText).toEqual([24, [true, false]]);
  const tabs = await answer(page, "tabs");
  expect(tabs.noIcon).toEqual([[false, true], 0, 0]);
  expect(tabs.noText).toEqual([[true, false], 0, 0]);
});

test("a Ljós button that shows its icon alone has it in its middle, as tall as it is drawn", async ({ page }) => {
  await open(page, "ljoslabels");
  await page.waitForFunction(() => window.scene.loaded());
  const buttons = await answer(page, "buttons");
  // Its own icon, a picture, mirrored, and with an empty text.
  expect(buttons.middles).toEqual([0, 0, 0, 0]);
  // A 50 pixel picture is drawn at 50 where it may be drawn at 64; a glyph
  // is drawn at the size.
  expect(buttons.heights).toEqual([50, 64]);
});

test("a Ljós menu row shown as its icon is as tall as a row, and a menu keeps no column for icons it hides", async ({ page }) => {
  await open(page, "ljoslabels");
  expect((await answer(page, "rows")).tallFits).toBe(true);
  // A row shown as its text, one with no icon, one told to keep the
  // column, and one beside a row whose icon is all it has.
  expect(await answer(page, "menus")).toEqual([0, 0, 24, 24]);
});

test("a Ljós tab shows its text alone in its middle, and asks for its room alone", async ({ page }) => {
  await open(page, "ljoslabels");
  const tabs = await answer(page, "tabs");
  expect(tabs.textOnly).toEqual([[false, true], 0, 0]);
  expect(tabs.plain).toEqual([[false, true], 0, 0]);
});

test("a Ljós popover's surface is drawn where it is placed, unscaled by its button's ancestor", async ({ page }) => {
  await open(page, "ljospopovers");
  await page.evaluate(() => window.scene.popover("scaled").open());
  // Above its button, at 200 to 240 in the window, by the gap: 96, and as
  // large as it was made.
  const drawn = () =>
    page.evaluate(() => {
      const scene = window.scene.$node.getBoundingClientRect();
      const box = window.scene.surface().$node.getBoundingClientRect();
      return [box.x - scene.x, box.y - scene.y, box.width, box.height].map(Math.round);
    });
  await expect.poll(drawn).toEqual([20, 96, 100, 100]);
});

test("a Ljós popover opened while an ancestor's ScaleAnimator runs is placed by the scale it reads, and again when the animator ends", async ({ page }) => {
  await open(page, "ljospopovers&still");
  const TOP = 1, BOTTOM = 8;
  const advance = (ms) => page.evaluate((ms) => window.clock.advance(ms), ms);
  const growth = () => page.evaluate(() => JSON.parse(JSON.stringify(window.scene.growth())));
  await page.evaluate(() => window.scene.grow());
  // As in Qt, the scale reads 1 while the animator draws it larger, and
  // mapToItem reads the scale: room under the button at 100 to 120.
  await advance(500);
  expect(await growth()).toEqual([1, BOTTOM, 0, 24, 210, 124]);
  // Told 2 at the end, the popover is placed again: above the button, now
  // at 200 to 240.
  await advance(600);
  expect(await growth()).toEqual([2, TOP, 0, -52, 220, 96]);
});

test("a Ljós button given the padding of one edge keeps the other's", async ({ page }) => {
  await open(page, "ljoslabels");
  // Beside its icon a button has none above or below; under it, half a
  // spacing.
  expect(await answer(page, "paddings")).toEqual([0, 4]);
});

test("a Ljós button or tab loads no picture it does not show, and shows it once nothing hides it", async ({ page }) => {
  await open(page, "ljoslabels");
  await page.waitForFunction(() => window.scene.loaded());
  // A glyph wins over the picture, or the display shows the text alone.
  expect(await answer(page, "hiddenPictures")).toEqual([
    ["", false, 0],
    ["", false, 0],
    ["", false, 0],
    ["", false, 0],
  ]);
  await page.evaluate(() => window.scene.showPictures());
  // Its own picture or its action's, beside the text, as large as the
  // style's icons are (a tab's are smaller); a tab shown as its icon shows
  // its picture alone.
  await expect
    .poll(() => answer(page, "shownPictures"))
    .toEqual([
      [true, 16, true],
      [true, 16, true],
      [true, 16, true],
      [true, 12, true],
      [true, 12, false],
      [true, 12, false],
    ]);
});

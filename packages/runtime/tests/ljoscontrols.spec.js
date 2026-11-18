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

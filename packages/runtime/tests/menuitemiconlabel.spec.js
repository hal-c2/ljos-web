// What is expected here is what Qt 6.12 answers for the same QML: the scene
// is run by `qml6` too and asked the same, and `fixtures/menuitemiconlabel.json`
// is what it said.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, open, test } from "./open.js";

const expected = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures/menuitemiconlabel.json"), "utf8"));

test("a MenuItemIconLabel is an IconLabel told which menu item it is in, as Qt 6.12's is", async ({ page }) => {
  await open(page, "menuitemiconlabel");
  await page.waitForFunction(() => window.scene.ready());
  const answers = await page.evaluate(() => JSON.parse(JSON.stringify(window.scene.answers())));
  for (const [index, row] of expected.entries()) expect(answers[index], `row ${index}`).toEqual(row);
  expect(answers.length).toBe(expected.length);
});

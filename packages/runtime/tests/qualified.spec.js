// `import App.Media as M` of a module the project has: its files, reached
// through the name, as qml6 reaches them from its import path.
import { expect, open, test } from "./open.js";

test("a type of the project's own module is made through the name it is imported as", async ({ page }) => {
  await open(page, "qualified");
  expect(await page.evaluate(() => window.scene.said)).toBe("own module");
});

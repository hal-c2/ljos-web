import { expect, open, test } from "./open.js";

// `import "first" as P` and `import "second" as P`: what either has is
// known by the name, a singleton of the first as well as a type of the
// second, and where both have a type it is the second's.
test("directories imported under one name are one namespace", async ({ page }) => {
  await open(page, "shared");
  expect(await page.evaluate(() => window.scene.read())).toEqual([3, "alarm", "second shot"]);
});

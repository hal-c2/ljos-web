// A person opening an example in a browser has no test to route its downloads.
import { expect, test } from "@playwright/test";
import { readManifest } from "../manifest.js";

const manifest = readManifest();

for (const example of manifest.filter((candidate) => candidate.assets)) {
  test(`${example.id}: what it downloads is read, or the page says how to get it`, async ({ page }) => {
    await page.goto(`/?example=${encodeURIComponent(example.id)}`);
    await page.waitForFunction(() => window.gallery && window.gallery.status !== "loading", null, { timeout: 120000 });
    const unfetched = example.fetched.length + example.served.length === 0;
    expect(await page.evaluate(() => window.gallery.unfetched)).toBe(unfetched);
    if (unfetched) {
      await expect(page.locator(".unfetched")).toHaveText(`What this example downloads is not here: mise run assets ${example.id}`);
      return;
    }
    await expect(page.locator(".unfetched")).toHaveCount(0);
    for (const [address, from] of example.served) {
      const answer = await page.evaluate(async (url) => (await fetch(url)).status, `${address}no-such-file`);
      expect(answer, `${address} is answered by the gallery, from ${from}`).toBe(404);
    }
  });
}

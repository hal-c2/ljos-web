// wgpu trapping as it makes a demo's first view leaves none of its views
// undrawn: the JavaScript renderer draws them. On the built site, where
// the renderer's files are named by their hashes, and the wasm is compiled
// as it arrives or, not said to be wasm, from its bytes. See
// docs/LJOS_WEB.md.
import { expect, test } from "@playwright/test";

test.use({ launchOptions: { args: ["--disable-features=WebGPU", "--enable-unsafe-swiftshader"] }, reducedMotion: "no-preference" });

const WASM = /ljos_web_3d_bg[^/?]*\.wasm(\?|$)/;

for (const demo of ["watch", "cockpit"]) {
  for (const type of ["application/wasm", "application/octet-stream"]) {
    test(`the ${demo} is drawn though wgpu traps making it, its wasm served as ${type}`, async ({ page }) => {
      test.setTimeout(180_000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.stack || error.message));
      let served = 0;
      await page.route(WASM, async (route) => {
        served++;
        const response = await route.fetch();
        await route.fulfill({ response, headers: { ...response.headers(), "content-type": type } });
      });
      await page.addInitScript(() => {
        const get = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (kind, ...options) {
          if (kind !== "webgl2" || !this.classList.contains("qq-view3d") || window.contextSpoilt) return get.call(this, kind, ...options);
          window.contextSpoilt = true;
          return {};
        };
      });
      await page.goto(`/demos/${demo}/`);
      await page.waitForSelector('#app[data-ljos-hydrated="true"]');
      await page.getByRole("button", { name: `Run the ${demo}` }).click();
      if (demo === "cockpit") await page.getByRole("button", { name: "Car", exact: true }).click({ timeout: 90_000 });
      await expect.poll(() => page.evaluate(() => window.contextSpoilt), { timeout: 90_000 }).toBe(true);
      expect(served).toBeGreaterThan(0);
      const states = () =>
        page.locator(".qq-view3d").evaluateAll((all) => {
          const drawing = all.filter(({ $view3d }) => $view3d).map(({ $view3d }) => $view3d);
          // One canvas a view, once no picture of before the turn covers it.
          return drawing.length > 0 && new Set(drawing.map(({ view }) => view)).size === drawing.length && drawing.every(({ renderer, frames }) => renderer === "js" && frames > 0);
        });
      await expect.poll(states, { message: "every view drawn by the JavaScript renderer", timeout: 60_000 }).toBe(true);
      // The watch turns as it runs, and goes on turning.
      if (demo === "watch") {
        const canvas = page.locator(".qq-view3d").filter({ visible: true }).first();
        for (let later = 0; later < 2; later++) {
          const before = await canvas.screenshot();
          await expect.poll(async () => (await canvas.screenshot()).equals(before), { timeout: 30_000 }).toBe(false);
        }
      }
      expect(errors).toEqual([]);
    });
  }
}

// Which kernel a page runs. Solid's signals are the default, and a page
// built that way never asks for the wasm kernel. The wasm kernel is opt-in
// (LJOS_KERNEL=wasm, `kernel/checked.js`): it runs Ljós's graph in wasm
// wherever a real check finds WebAssembly working, and Solid's signals
// where it does not or where the wasm does not come down. Each way the page
// is the same page, and a browser on the wasm kernel never fetches Solid's.
import { expect, open, test } from "./open.js";

const OPTED_IN = process.env.LJOS_KERNEL === "wasm";

const WASM_KERNEL = /ljos_web_kernel\.wasm/;
const SOLID_KERNEL = /kernel\/solid\.js/;

// What the page asked the server for.
function asked(page) {
  const urls = [];
  page.on("request", (request) => urls.push(request.url()));
  return urls;
}

async function behaves(page) {
  await open(page, "kernelchoice");
  await expect(page.getByText("Count 0, twice 0", { exact: true })).toBeVisible();
  // The MouseArea over the text is what takes the click.
  await page.getByText("Count 0, twice 0", { exact: true }).click({ force: true });
  await expect(page.getByText("Count 1, twice 2", { exact: true })).toBeVisible();
  await page.getByText("Count 1, twice 2", { exact: true }).click({ force: true });
  expect(await page.evaluate(() => window.scene.read())).toBe("Count 2, twice 4");
}

test.describe("the default kernel", () => {
  test.skip(OPTED_IN, "the build opted into the wasm kernel");

  test("is Solid's, and the page never asks for the wasm kernel", async ({ page }) => {
    const urls = asked(page);
    await behaves(page);
    expect(urls.filter((url) => WASM_KERNEL.test(url))).toEqual([]);
    expect(urls.filter((url) => /kernel\/checked\.js/.test(url))).toEqual([]);
  });
});

test.describe("the opt-in wasm kernel", () => {
  test.skip(!OPTED_IN, "only a build with LJOS_KERNEL=wasm has the wasm kernel to choose");

  test("where WebAssembly runs, the page runs on the wasm kernel and never fetches Solid's", async ({ page }) => {
    const urls = asked(page);
    await behaves(page);
    expect(urls.filter((url) => WASM_KERNEL.test(url))).toHaveLength(1);
    expect(urls.filter((url) => SOLID_KERNEL.test(url))).toEqual([]);
  });

  test("where there is no WebAssembly, the page runs on Solid's kernel and behaves the same", async ({ page }) => {
    // As Safari's Lockdown Mode has it: no `WebAssembly` at all.
    await page.addInitScript(() => {
      delete globalThis.WebAssembly;
    });
    const urls = asked(page);
    await behaves(page);
    expect(urls.filter((url) => WASM_KERNEL.test(url))).toEqual([]);
    expect(urls.filter((url) => SOLID_KERNEL.test(url))).toHaveLength(1);
  });

  test("where WebAssembly is named but refuses to compile, the page runs on Solid's kernel", async ({ page }) => {
    // As a policy that forbids compiling has it: the name is there, and
    // every compile throws.
    await page.addInitScript(() => {
      const refuse = () => {
        throw new WebAssembly.CompileError("WebAssembly is not allowed here");
      };
      WebAssembly.Module = refuse;
      WebAssembly.compile = WebAssembly.compileStreaming = WebAssembly.instantiate = WebAssembly.instantiateStreaming = async () => refuse();
    });
    const urls = asked(page);
    await behaves(page);
    expect(urls.filter((url) => WASM_KERNEL.test(url))).toEqual([]);
    expect(urls.filter((url) => SOLID_KERNEL.test(url))).toHaveLength(1);
  });

  test.describe("where the wasm does not come down", () => {
    // The aborted fetch is the browser's to report, and the fallback the page's.
    test.use({ told: [/the wasm kernel did not load|Failed to load resource/] });

    test("the page says so and runs on Solid's kernel", async ({ page }) => {
      await page.route(WASM_KERNEL, (route) => route.abort());
      const warned = [];
      page.on("console", (message) => message.type() === "warning" && warned.push(message.text()));
      const urls = asked(page);
      await behaves(page);
      expect(urls.filter((url) => SOLID_KERNEL.test(url))).toHaveLength(1);
      expect(warned.some((text) => /the wasm kernel did not load/.test(text))).toBe(true);
    });
  });
});

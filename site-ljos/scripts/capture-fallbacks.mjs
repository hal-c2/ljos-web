// Captures each pro demo's pictures (Demos/pro.json) from the demo
// itself running in the built site, so what a reader without script or
// WebGPU sees is the real thing, in the scheme they read the site in:
//   pnpm --filter ljos-site-ljos build
//   node scripts/capture-fallbacks.mjs [name…] [--out outDir]
// Writes bundle/assets/<picture>.webp (light) and <picture>-dark.webp
// for the demos named, or all of them; look at them before committing.
// The browser encodes the WebP itself (a canvas), so no image tool is
// needed beside Playwright.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { demos, route } from "./pro.mjs";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const at = args.indexOf("--out");
const outDir = resolve(at >= 0 ? args.splice(at, 2)[1] : join(siteRoot, "bundle/assets"));
const unknown = args.filter((name) => !demos.some((demo) => demo.name === name));
if (unknown.length) throw new Error(`no pro demo ${unknown.join(", ")}; there are ${demos.map((demo) => demo.name).join(", ")}`);
const asked = args.length ? demos.filter((demo) => args.includes(demo.name)) : demos;
const port = 4479;
const origin = `http://127.0.0.1:${port}`;
// The pictures stand in a frame at most the page's measure wide, twice
// that for dense screens.
const WIDTH = 1600;
mkdirSync(outDir, { recursive: true });

const server = spawn(process.execPath, [join(siteRoot, "scripts/serve.mjs"), join(siteRoot, "dist"), String(port), "/"], { stdio: "ignore" });
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${origin}/`)).ok) break;
    } catch {}
    if (i > 60) throw new Error("the site's server did not start");
    await new Promise((done) => setTimeout(done, 250));
  }
  // WebGPU on the machine's own GPU through Vulkan: SwiftShader's
  // adapter starts the renderer but leaves its canvases empty, so a
  // demo drawn there would show no models.
  const browser = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=vulkan", "--ignore-gpu-blocklist"] });
  for (const demo of asked) {
    for (const scheme of ["dark", "light"]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: scheme, reducedMotion: "no-preference" });
      await context.addInitScript((picked) => localStorage.setItem("ljos.dev:scheme", picked), scheme);
      const page = await context.newPage();
      await page.goto(`${origin}${route(demo)}`);
      await page.waitForSelector('#app[data-ljos-hydrated="true"]');
      const run = page.getByRole("button", { name: `Run ${demo.what}` });
      await run.scrollIntoViewIfNeeded();
      // The demo's frame is the box around Run: the demo's own shape over
      // the toolbar Run is in. The picture is the part above the
      // toolbar; the page does not move once it is laid out.
      const frame = await run.evaluate(
        (node, { width, height }) => {
          for (let box = node.parentElement; box; box = box.parentElement) {
            const shown = box.getBoundingClientRect();
            const surface = (shown.width * height) / width;
            if (shown.width > 300 && shown.height > surface && shown.height - surface < 120) return { x: shown.x, y: shown.y, width: shown.width, height: Math.round(surface) };
          }
          throw new Error("no frame of the demo's shape around its Run");
        },
        { width: demo.width, height: demo.height },
      );
      await run.click();
      // Once it is drawn the toolbar's Run is its Pause.
      await page.getByRole("button", { name: `Pause ${demo.what}` }).waitFor({ timeout: 60_000 });
      // What comes up as it starts has come up: its models are fetched
      // (in software that outlasts any fixed wait), then drawn.
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(3000);
      const png = await page.screenshot({ clip: frame, animations: "allow" });
      const webp = await page.evaluate(
        async ({ data, width }) => {
          const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
          const canvas = new OffscreenCanvas(width, Math.round((image.height * width) / image.width));
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.82 });
          return Array.from(new Uint8Array(await blob.arrayBuffer()));
        },
        { data: png.toString("base64"), width: WIDTH },
      );
      const name = `${demo.picture}${scheme === "dark" ? "-dark" : ""}.webp`;
      writeFileSync(join(outDir, name), Uint8Array.from(webp));
      console.log("captured", name);
      await context.close();
    }
  }
  await browser.close();
} finally {
  server.kill();
}

// Captures each pro demo's pictures (Demos/pro.json) from the demo
// itself running in the built site, so what a reader without script or
// WebGPU sees is the real thing, in the scheme they read the site in:
//   pnpm --filter ljos-site-ljos build
//   node scripts/capture-fallbacks.mjs [name…] [--out outDir]
// Writes bundle/assets/<picture>.webp (light) and <picture>-dark.webp
// for the demos named, or all of them, and for a demo with a `compact`
// shape <picture>-compact.webp and <picture>-compact-dark.webp, taken in
// a narrow page; look at them before committing.
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
// that for dense screens. A compact one stands in a narrow page, whose
// frame is a phone's width: three times that for a phone's screen.
const WIDE = { suffix: "", viewport: { width: 1440, height: 900 }, scale: 2, width: 1600 };
const COMPACT = { suffix: "-compact", viewport: { width: 400, height: 900 }, scale: 3, width: 1100 };
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
  const shots = asked.flatMap((demo) => [{ demo, at: WIDE, shape: demo }, ...(demo.compact ? [{ demo, at: COMPACT, shape: demo.compact }] : [])]);
  for (const { demo, at, shape } of shots) {
    for (const scheme of ["dark", "light"]) {
      const context = await browser.newContext({ viewport: at.viewport, deviceScaleFactor: at.scale, colorScheme: scheme, reducedMotion: "no-preference" });
      await context.addInitScript((picked) => localStorage.setItem("ljos.dev:scheme", picked), scheme);
      const page = await context.newPage();
      await page.goto(`${origin}${route(demo)}`);
      await page.waitForSelector('#app[data-ljos-hydrated="true"]');
      const run = page.getByRole("button", { name: `Run ${demo.what}` });
      await run.scrollIntoViewIfNeeded();
      // The demo's frame is the box around Run: the demo's own shape over
      // the toolbar Run is in. The picture is the part above the
      // toolbar; the page does not move once it is laid out. A shot is
      // cut at the viewport, so the frame is scrolled to just below the
      // site's bar first, and must then be wholly in view. The page
      // scrolls in its own Flickable, not the window.
      const frame = await run.evaluate(
        (node, { width, height }) => {
          for (let box = node.parentElement; box; box = box.parentElement) {
            const found = box.getBoundingClientRect();
            const surface = (found.width * height) / width;
            if (found.width > 300 && found.height > surface && found.height - surface < 120) {
              let scroller = box.parentElement;
              while (scroller && scroller.scrollHeight <= scroller.clientHeight) scroller = scroller.parentElement;
              (scroller || document.scrollingElement).scrollTop += found.top - 72;
              const shown = box.getBoundingClientRect();
              if (shown.top < 64 || shown.top + surface > window.innerHeight) throw new Error(`the demo's frame (${Math.round(surface)} high) does not fit in the viewport`);
              return { x: shown.x, y: shown.y, width: shown.width, height: Math.round(surface) };
            }
          }
          throw new Error("no frame of the demo's shape around its Run");
        },
        { width: shape.width, height: shape.height },
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
        { data: png.toString("base64"), width: at.width },
      );
      const name = `${demo.picture}${at.suffix}${scheme === "dark" ? "-dark" : ""}.webp`;
      writeFileSync(join(outDir, name), Uint8Array.from(webp));
      console.log("captured", name);
      await context.close();
    }
  }
  await browser.close();
} finally {
  server.kill();
}

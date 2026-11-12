// Captures each showcase demo's fallback picture from the demo
// itself running, so the still a no-JS/no-wasm reader gets is the
// real thing: build the site, run this, commit the results.
//   pnpm --filter ljos-site build
//   node scripts/capture-fallbacks.mjs [outDir]
// Writes PNGs to [outDir] (src/assets/fallbacks by default is NOT
// written: review the PNGs first, then optimize them in — the
// committed files are JPEGs made from these captures).
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(process.argv[2] ?? join(siteRoot, "fallback-captures"));
mkdirSync(outDir, { recursive: true });

const server = spawn("pnpm", ["preview", "--port", "4321", "--host", "127.0.0.1"], { cwd: siteRoot, stdio: "ignore", detached: true });
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch("http://127.0.0.1:4321/")).ok) break;
    } catch {}
    if (i > 60) throw new Error("preview server did not start");
    await new Promise((r) => setTimeout(r, 500));
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(() => localStorage.clear());

  async function shoot(name, route, prepare) {
    await page.goto(`http://127.0.0.1:4321${route}`);
    const fig = page.locator(`[data-ljos-demo='${name}']`);
    await fig.scrollIntoViewIfNeeded();
    await fig.waitFor({ state: "attached" });
    await page.waitForFunction(
      (n) => document.querySelector(`[data-ljos-demo='${n}']`)?.dataset.state === "live",
      name,
      { timeout: 30000 },
    );
    if (prepare) await prepare(fig);
    await page.waitForTimeout(700);
    await fig.locator(".ljos-demo__mount").screenshot({ path: join(outDir, `${name}.png`) });
    console.log("captured", name);
  }
  await shoot("pantry", "/", async (fig) => {
    await fig.getByRole("button", { name: "Add tea" }).click();
    await fig.getByRole("button", { name: "Add tea" }).click();
    await fig.locator(".pantry-stage input:not([type='file'])").click();
    await page.keyboard.type("Extra crusty, please");
  });
  await shoot("orbit", "/demos/", async () => page.waitForTimeout(1600));
  await shoot("shader", "/demos/", async (fig) => {
    const box = await fig.locator(".ljos-demo__mount").boundingBox();
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.55);
  });
  await shoot("fieldguide", "/demos/", async (fig) => {
    await fig.getByRole("button", { name: "Northern gannet" }).click();
    await fig.getByRole("checkbox").click();
  });
  await shoot("motion", "/demos/", async () => {});
  await browser.close();
} finally {
  // The whole group: pnpm's preview child outlives pnpm itself.
  try { process.kill(-server.pid); } catch { server.kill(); }
}

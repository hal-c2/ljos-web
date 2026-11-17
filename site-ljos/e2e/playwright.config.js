import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

// Every example on the built site, driven as a reader drives it: once
// in a browser that runs WebAssembly, once in one without it (Safari's
// Lockdown Mode, a policy without 'wasm-unsafe-eval'). The site is
// served as `tests/` serves it, at the base it was built for.
const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.LJOS_SITE_BASE ?? "/";

export default defineConfig({
  testDir: ".",
  // known-reporter.js says why each expected failure failed, beside the
  // list reporter's ✘ for it.
  reporter: [["list"], ["./known-reporter.js"], ...(process.env.CI ? [["html", { open: "never", outputFolder: "../playwright-report/e2e" }]] : [])],
  outputDir: "../test-results/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:4471",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 900 },
    // Full motion is the default (SITE-4 motion rule): a reader gets
    // the reduced form only by asking for it, so the suite never
    // inherits a CI machine's setting. motion.spec.js asks on purpose.
    reducedMotion: "no-preference",
    hasTouch: true,
  },
  projects: [
    { name: "webassembly", use: { wasm: true } },
    { name: "no-webassembly", use: { wasm: false } },
  ],
  webServer: {
    command: "node scripts/serve.mjs dist 4471",
    cwd: site,
    url: `http://127.0.0.1:4471${base}`,
    reuseExistingServer: false,
  },
});

import { defineConfig } from "@playwright/test";

// The live code blocks on a built site: its own build (fixture docs,
// built by the test:codeblocks script before this config is read, as
// Playwright starts its web server before any global setup) and port,
// so the ordinary suite is untouched by it.
export default defineConfig({
  testDir: "./tests",
  testMatch: "codeblocks.e2e.js",
  timeout: 120_000,
  use: { baseURL: "http://127.0.0.1:4399" },
  webServer: {
    command: "node tests/serve-fixture.mjs",
    url: "http://127.0.0.1:4399",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});

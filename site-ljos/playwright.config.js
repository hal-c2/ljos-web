import { defineConfig } from "@playwright/test";

// The built site, served as static files, read as a reader reads it.
export default defineConfig({
  testDir: "./tests",
  reporter: "list",
  timeout: 60_000,
  use: { baseURL: "http://127.0.0.1:4471" },
  webServer: {
    command: "node scripts/serve.mjs dist 4471",
    url: "http://127.0.0.1:4471/",
    reuseExistingServer: false,
  },
});

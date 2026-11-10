import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  use: { baseURL: "http://127.0.0.1:4321" },
  webServer: { command: "pnpm preview --port 4321 --host 127.0.0.1", url: "http://127.0.0.1:4321", reuseExistingServer: true, timeout: 60000 },
});

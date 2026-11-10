import { defineConfig, devices } from "@playwright/test";
import { port } from "./tests/settings.js";

const url = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests",
  testMatch: ["report.spec.js", "assets.spec.js"],
  fullyParallel: true,
  reporter: [["./tests/table.js"]],
  timeout: 150000,
  use: {
    baseURL: url,
    // As Qt was when the reference pictures were taken.
    locale: "en-US",
    timezoneId: "UTC",
    colorScheme: "light",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], deviceScaleFactor: 1 } }],
  // Vite's dev server, not a built bundle: it compiles an example when the
  // page asks for it, so one whose QML does not compile, or imports what does
  // not resolve, fails by itself. A build has every example in one graph and
  // stops at the first such import. Its own server, on its own port: one left
  // running for another manifest would answer for the wrong examples.
  webServer: {
    command: `pnpm exec vite --host 127.0.0.1 --port ${port} --strictPort`,
    url,
    reuseExistingServer: false,
  },
});

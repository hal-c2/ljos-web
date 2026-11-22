import { defineConfig } from "@playwright/test";

// Tests that run out of time on purpose, for phases.spec.js to read the
// report of. They open no page, and need nothing built or served.
export default defineConfig({
  testDir: ".",
  testMatch: "stalls.js",
  timeout: 2000,
  workers: 1,
});

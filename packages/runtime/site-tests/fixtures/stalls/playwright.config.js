import { defineConfig } from "@playwright/test";

// A run of its own for stalls.spec.js: hooks that stall, with little
// time, so that what they say can be read.
export default defineConfig({
  testDir: ".",
  testMatch: "hook*.js",
  reporter: "line",
  fullyParallel: true,
  workers: 2,
  timeout: 4_000,
});

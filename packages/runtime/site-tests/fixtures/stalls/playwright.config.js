import { defineConfig } from "@playwright/test";

// A run of its own for stalls.spec.js: one hook that stalls, with little
// time, so that what it says can be read.
export default defineConfig({
  testDir: ".",
  testMatch: "hook.js",
  reporter: "line",
  timeout: 4_000,
});

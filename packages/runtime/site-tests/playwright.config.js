import { defineConfig } from "@playwright/test";

// The site builder's tests: each builds a bundle of its own and serves what
// it built itself, on a port of its own so two checkouts can run at once.
export default defineConfig({
  testDir: ".",
  fullyParallel: true,
  reporter: "list",
  // A build compiles every file of the bundle and runs Vite.
  timeout: 120_000,
});

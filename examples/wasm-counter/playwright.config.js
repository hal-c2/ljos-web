import { defineConfig, devices } from "@playwright/test";

// Two checkouts can run their tests at once if each is given its own port.
const port = Number(process.env.LJOS_WEB_PORT ?? 4175);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // The built bundle, as it ships: `pnpm build` runs first. The wasm is
  // built by the mise task before either (`mise run wasm-counter`).
  webServer: {
    command: `pnpm build && pnpm exec vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});

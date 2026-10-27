import { defineConfig } from "@playwright/test";

// Two checkouts can run their tests at once if each is given its own port.
const port = Number(process.env.LJOS_WEB_PORT ?? 4174);

export default defineConfig({
  testDir: ".",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: `vite --config vite.config.js --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
});

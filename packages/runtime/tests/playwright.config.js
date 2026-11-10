import { defineConfig } from "@playwright/test";
import { compilerAt } from "../vite.js";

// The server and the tests run from elsewhere than where it was named from.
if (process.env.QMLC) process.env.QMLC = compilerAt(process.env.QMLC);

// Two checkouts can run their tests at once if each is given its own port.
const port = Number(process.env.LJOS_WEB_PORT ?? 4174);

export default defineConfig({
  testDir: ".",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: `http://127.0.0.1:${port}` },
  webServer: [
    {
      command: `vite --config vite.config.js --host 127.0.0.1 --port ${port} --strictPort`,
      url: `http://127.0.0.1:${port}`,
      reuseExistingServer: false,
    },
    // The same scenes where no Qt is: `qtless.spec.js`.
    {
      command: `vite --config qtless.config.js --host 127.0.0.1 --port ${port + 1} --strictPort`,
      url: `http://127.0.0.1:${port + 1}`,
      reuseExistingServer: false,
    },
  ],
});

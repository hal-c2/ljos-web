import { join } from "node:path";
import { defineConfig } from "@playwright/test";
import { compilerAt } from "../../vite.js";

// The 3D perf harness: `pnpm perf:3d` (or `mise run perf:3d`). The page is
// built as an application is and served by `vite preview`; one browser
// measures one scene at a time, as anything else running at once is in
// what is measured. `setup.js` clears an earlier run's results, and
// `table.js` puts this run's together when all ran.
if (process.env.QMLC) process.env.QMLC = compilerAt(process.env.QMLC);
const port = Number(process.env.LJOS_WEB_PORT ?? 4180);
const vite = join(import.meta.dirname, "../../node_modules/.bin/vite");

export default defineConfig({
  testDir: ".",
  testMatch: /measure\.bench\.js$/,
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  timeout: 10 * 60_000,
  globalSetup: "./setup.js",
  globalTeardown: "./table.js",
  use: { baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: `${vite} build --config vite.config.js --logLevel warn && ${vite} preview --config vite.config.js --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: import.meta.dirname,
    url: `http://127.0.0.1:${port}/?scene=spin`,
    reuseExistingServer: false,
    timeout: 10 * 60_000,
  },
});

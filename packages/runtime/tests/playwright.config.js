import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";
import { compilerAt } from "../vite.js";

// The server and the tests run from elsewhere than where it was named from.
if (process.env.QMLC) process.env.QMLC = compilerAt(process.env.QMLC);

// These specs drive pages the compiler and the wasms are part of:
// without them every scene times out waiting for a page that can
// never be made, and nothing says why. Say it before starting, as
// `mise run test:runtime` builds them first (its depends).
{
  const runtime = join(import.meta.dirname, "..");
  // The compiler the servers use (tests/bundle.js): QMLC as named,
  // else the workspace's own build of it.
  const qmlc = process.env.QMLC ?? join(runtime, "../../target/debug/qmlc");
  const hasCompiler = qmlc.includes("/")
    ? existsSync(qmlc)
    : spawnSync("sh", ["-c", 'command -v "$0"', qmlc], { encoding: "utf8" }).stdout.trim() !== "";
  const missing = [];
  if (!hasCompiler)
    missing.push("the compiler (`cargo build --bin qmlc`, or QMLC naming one)");
  if (!existsSync(join(runtime, "compiler/ljos_web_compiler.wasm")))
    missing.push("the compiler in the page (`mise run build:wasm-compiler`)");
  if (process.env.LJOS_KERNEL === "wasm" && !existsSync(join(runtime, "kernel/ljos_web_kernel.wasm")))
    missing.push("the wasm kernel (`mise run build:kernel`)");
  if (missing.length)
    throw new Error(`these specs need built first: ${missing.join(", ")} — or run them as \`mise run test:runtime\`, which builds them`);
}

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

// Vite's dependency scan reads every page a server has (the harness
// globs all the scenes) before any is asked for. A scene's Qt module
// that this machine's Qt does not have (`QtShelf`, of the stand-in Qt,
// on the server with no Qt) is no dependency to bundle: if the scan
// cannot resolve it, Vite skips pre-bundling for the whole server and
// says so once, and every page then waits for its dependencies to be
// found one by one. Each server's scan finishes with nothing said.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test as plain } from "@playwright/test";
import { createLogger, createServer } from "vite";

for (const config of ["vite.config.js", "qtless.config.js"]) {
  plain(`the dependency scan of the ${config} server resolves every scene's imports`, async () => {
    const said = [];
    const logger = createLogger("warn", { allowClearScreen: false });
    for (const level of ["warn", "warnOnce", "error"]) logger[level] = (message) => said.push(message);
    const cacheDir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-dep-scan-"));
    const server = await createServer({
      configFile: join(import.meta.dirname, config),
      cacheDir,
      customLogger: logger,
      logLevel: "warn",
      server: { middlewareMode: true, hmr: false, ws: false },
      optimizeDeps: { force: true },
    });
    try {
      // Without the optimizer, or before its scan has started, there would
      // be nothing to listen to and the check below would pass on silence.
      const optimizer = server.environments.client.depsOptimizer;
      expect(optimizer?.scanProcessing).toBeDefined();
      await optimizer.scanProcessing;
      expect(Object.keys(optimizer.metadata.discovered)).not.toEqual([]);
      expect(said.filter((message) => /dependency scan|is not exported|Failed to resolve/.test(message))).toEqual([]);
    } finally {
      await server.close();
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });
}

import { join } from "node:path";
import { defaultClientConditions, defineConfig } from "vite";
import qml from "../vite.js";

// A machine with no Qt at all: no directory of Qt's QML modules for the
// plugin to find, whatever this one has installed.
export default defineConfig({
  root: import.meta.dirname,
  cacheDir: join(import.meta.dirname, "../node_modules/.vite/qtless"),
  plugins: [qml({ qmlc: process.env.QMLC ?? join(import.meta.dirname, "../../../target/debug/qmlc"), qt: [] })],
  resolve: {
    dedupe: ["solid-js", "@solidjs/web", "@solidjs/signals"],
    conditions: process.env.LJOS_KERNEL === "wasm" ? ["ljos-wasm-kernel", ...defaultClientConditions] : defaultClientConditions,
  },
});

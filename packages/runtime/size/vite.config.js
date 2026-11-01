import { fileURLToPath } from "node:url";
import { defaultClientConditions, defineConfig } from "vite";

const kernel = process.env.LJOS_KERNEL === "wasm" ? "wasm" : "solid";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  logLevel: "warn",
  resolve: {
    conditions: kernel === "wasm" ? ["ljos-wasm-kernel", ...defaultClientConditions] : defaultClientConditions,
  },
  // The wasm is a file of its own, as a page fetches it, so it is counted.
  build: { target: "es2022", outDir: process.env.LJOS_SIZE_OUT, emptyOutDir: true, assetsInlineLimit: 0 },
});

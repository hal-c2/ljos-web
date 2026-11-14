import { fileURLToPath } from "node:url";
import { defaultClientConditions, defineConfig } from "vite";
import { kernelNamed } from "../vite.js";

const kernel = kernelNamed();

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  logLevel: "warn",
  resolve: {
    conditions: kernel === "wasm" ? ["ljos-wasm-kernel", ...defaultClientConditions] : defaultClientConditions,
  },
  // The wasm is a file of its own, as a page fetches it, so it is counted.
  build: { target: "es2022", outDir: process.env.LJOS_SIZE_OUT, emptyOutDir: true, rollupOptions: { input: fileURLToPath(new URL(process.env.LJOS_SIZE_ENTRY ?? "index.html", import.meta.url)) }, assetsInlineLimit: 0 },
});

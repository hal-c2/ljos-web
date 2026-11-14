import { fileURLToPath } from "node:url";
import { defaultClientConditions, defineConfig } from "vite";
import qml, { kernelConditions } from "ljos-web/vite";

const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [
    qml({
      qmlc: process.env.QMLC ?? path("../../target/debug/qmlc"),
      // What `ljos-web faces` wrote from the Rust (`docs/LJOS_WEB.md` A22).
      faces: path("./pkg/faces"),
    }),
  ],
  resolve: {
    dedupe: ["solid-js", "@solidjs/web", "ljos-web"],
    // `LJOS_KERNEL=wasm`: the same page over Ljós's graph (`kernel/wasm.js`).
    conditions: [...kernelConditions(), ...defaultClientConditions],
  },
});

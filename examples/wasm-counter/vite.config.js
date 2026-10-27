import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import qml from "qml-solid/vite";

const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));

// What compiled QML asks for when it makes a `Counter` is the stand-in
// file the compiler was told of (`types/Example/Counter.qml`). The type
// itself is Rust: this puts its face (`web/Counter.js`, over the wasm)
// where that file is asked for. In ljos-web the compiler learns the type
// from `ljostypes.json` and asks its module for it instead
// (`docs/LJOS_WEB.md`); the face is the same either way.
const wasmTypes = {
  name: "wasm-counter-types",
  enforce: "pre",
  resolveId(source) {
    if (source.endsWith("types/Example/Counter.qml")) return path("./web/Counter.js");
    return null;
  },
};

export default defineConfig({
  base: "./",
  plugins: [
    wasmTypes,
    qml({
      qmlc: process.env.QMLC ?? path("../../target/debug/qmlc"),
      standins: [path("./types")],
    }),
  ],
  resolve: { dedupe: ["solid-js", "@solidjs/web", "qml-solid"] },
});

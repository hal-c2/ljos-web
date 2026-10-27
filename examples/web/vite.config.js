import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import qml from "ljos-web/vite";

const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [qml({ qmlc: process.env.QMLC ?? path("../../target/debug/qmlc") })],
  resolve: {
    // The app behind the UI: where compiled QML finds `Shell` and `Theme`.
    alias: { "ljos-web/host": path("./host.js") },
    // The bricks are links to the compiler's fixtures, which live outside this
    // package: their imports still resolve from here.
    dedupe: ["solid-js", "@solidjs/web", "ljos-web"],
  },
});

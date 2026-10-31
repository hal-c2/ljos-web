import { join } from "node:path";
import { defaultClientConditions, defineConfig } from "vite";
import qml from "../vite.js";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [
    qml({
      qmlc: process.env.QMLC ?? join(import.meta.dirname, "../../../target/debug/qmlc"),
      // A stand-in for the Qt that is installed: the tests are of the
      // runtime, whatever Qt the machine has. In two places, as a Qt with
      // some of its modules elsewhere is.
      qt: [join(import.meta.dirname, "qt"), join(import.meta.dirname, "qt-more")],
      style: (importer) => (importer?.includes("-oak") ? "Oak" : undefined),
      // What an application says of its controls: the file Qt reads, for
      // the scenes that are of one, or what would be in it.
      controls: (importer) =>
        importer?.includes("/scenes/conf")
          ? join(import.meta.dirname, "scenes/qtquickcontrols2.conf")
          : importer?.includes("-said")
            ? { Controls: { Style: "Oak" } }
            : undefined,
      standins: [join(import.meta.dirname, "standins")],
      // The scenes an inspector reads say where their objects are written.
      inspect: (file) => /\/scenes\/inspect/.test(file),
    }),
  ],
  resolve: {
    dedupe: ["solid-js", "@solidjs/web", "@solidjs/signals"],
    // `LJOS_KERNEL=wasm`: the same specs over Ljós's graph (`kernel/wasm.js`).
    conditions: process.env.LJOS_KERNEL === "wasm" ? ["ljos-wasm-kernel", ...defaultClientConditions] : defaultClientConditions,
  },
});

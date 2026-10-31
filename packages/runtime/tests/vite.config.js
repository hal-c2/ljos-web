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
      // A project of its own, whose dumps (`ljostypes.json`) are anywhere
      // in it, as a preview of one is compiled.
      root: (file) => (file.includes("/scenes/dumped/") ? join(import.meta.dirname, "scenes/dumped") : undefined),
      // The scenes an inspector reads say where their objects are written.
      inspect: (file) => /\/scenes\/inspect/.test(file),
      // The page a visitor drops a shell on: its blocks are the Shop module
      // of its own project.
      liveShell: (file) => file.includes("/scenes/drop/"),
      root: (file) => (file.includes("/scenes/drop/") ? join(import.meta.dirname, "scenes/drop") : undefined),
    }),
  ],
  resolve: {
    dedupe: ["solid-js", "@solidjs/web", "@solidjs/signals"],
    // `LJOS_KERNEL=wasm`: the same specs over Ljós's graph (`kernel/wasm.js`).
    conditions: process.env.LJOS_KERNEL === "wasm" ? ["ljos-wasm-kernel", ...defaultClientConditions] : defaultClientConditions,
  },
});

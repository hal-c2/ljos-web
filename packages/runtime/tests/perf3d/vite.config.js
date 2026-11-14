import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultClientConditions, defineConfig } from "vite";
import qml, { kernelConditions } from "../../vite.js";

// The perf page is built as ljos.dev is (site/astro.config.mjs): Ljós's own
// controls and 3D modules, no installed Qt's QML. It is served with what
// makes it cross-origin isolated: a page that is not has its clock rounded
// to a tenth of a millisecond, coarser than much of what it measures.
const ISOLATED = { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" };

// A scene that names its pictures by an expression has them looked for at
// run time beside its chunk, as qml6 looks for them beside the file: so
// they go with the chunks.
const pictures = {
  name: "perf3d-pictures",
  generateBundle() {
    const scenes = join(import.meta.dirname, "scenes");
    for (const name of readdirSync(scenes).filter((name) => name.endsWith(".png")))
      this.emitFile({ type: "asset", fileName: `assets/${name}`, source: readFileSync(join(scenes, name)) });
  },
};

export default defineConfig({
  root: import.meta.dirname,
  plugins: [qml({ qmlc: process.env.QMLC ?? join(import.meta.dirname, "../../../../target/debug/qmlc"), styles: "ljos", qt: [] }), pictures],
  resolve: {
    dedupe: ["solid-js", "@solidjs/web", "@solidjs/signals"],
    conditions: [...kernelConditions(), ...defaultClientConditions],
  },
  build: { outDir: process.env.LJOS_PERF3D_DIST ?? join(import.meta.dirname, "dist"), emptyOutDir: true, target: "esnext" },
  preview: { headers: ISOLATED },
  server: { headers: ISOLATED },
});

// One batch of a docs build's examples bundled for their prerender
// (`renderPrerenders`), in a Node process of its own: the QML plugin
// compiles each file by running `qmlc` to its end, which holds the event
// loop it runs on, so batches bundled in one process take turns however
// many are asked for at once. One process a batch, and they run at once.
//
//   node prerender-bundle.js '{"stage":…,"qmlc":…,"kernel":"solid"|"wasm"}'
//
// It writes one JSON line: `{ ok: true }`, or `{ lacks, error }` with
// what the runtime lacks (the plugin's `lacking`) and the bundler's
// refusal, its errors named by the file each is in, as the caller blames
// them. A refusal is an answer, not a failure of this process.
import { join } from "node:path";
import { CLIENT_CONDITIONS } from "../server/conditions.js";
import qml from "../vite.js";

const runtime = join(import.meta.dirname, "..");
const { stage, qmlc, kernel } = JSON.parse(process.argv[2]);
const { build } = await import("vite");

// No installed Qt, Ljós's own styles: what a block may draw must not
// depend on the building machine, as on the site. Each example compiles
// with its own directory as its project (the plugin's per-file root),
// never one root for the runtime's QML.
const examplesAt = join(stage, "examples") + "/";
const lacks = [];
const told = (error) => ({
  message: String(error?.message ?? error),
  ...(typeof error?.id === "string" ? { id: error.id } : {}),
  ...(typeof error?.loc?.file === "string" ? { loc: { file: error.loc.file } } : {}),
});
let answer;
try {
  await build({
    configFile: false,
    root: stage,
    // A batch that will not build is split until the example that
    // refuses is alone, and its words are kept with it: each refusal on
    // the way is no news, and said by no one.
    logLevel: "silent",
    cacheDir: join(runtime, "node_modules/.vite/ljos-codeblocks"),
    resolve: {
      alias: {
        "codeblock:server": join(runtime, "server.js"),
        "#kernel": join(runtime, kernel === "wasm" ? "kernel/checked.js" : "kernel/solid.js"),
      },
      dedupe: ["solid-js", "@solidjs/web", "@solidjs/signals"],
    },
    plugins: [
      qml({
        qmlc,
        qt: [],
        styles: "ljos",
        theme: false,
        root: (file) => (file.startsWith(examplesAt) ? join(examplesAt, file.slice(examplesAt.length).split("/")[0]) : undefined),
        lacking: ({ source, importer, why }) => lacks.push({ at: [importer], said: `${source} is not in ljos-web: ${why}` }),
      }),
    ],
    build: {
      ssr: join(stage, "entries.js"),
      outDir: join(stage, "server"),
      emptyOutDir: true,
      target: "esnext",
      chunkSizeWarningLimit: 4000,
      rollupOptions: { output: { format: "es", entryFileNames: "entries.mjs" }, checks: { bundlerTimings: false } },
    },
    ssr: { noExternal: true, resolve: { conditions: CLIENT_CONDITIONS } },
    environments: { ssr: { resolve: { noExternal: true, conditions: CLIENT_CONDITIONS } } },
  });
  answer = lacks.length > 0 ? { lacks } : { ok: true };
} catch (error) {
  answer = { lacks, error: { ...told(error), ...(error?.errors?.length ? { errors: error.errors.map(told) } : {}) } };
}
// Vite may leave a handle open; the answer is all there is to wait for.
process.stdout.write(`${JSON.stringify(answer)}\n`, () => process.exit(0));

// ljos-play (hal-c2/ljos-play, MIT), as much of it as the showcase's
// Snail Post runs on: its LjosPlay module, at the bundle's root where an
// `import LjosPlay` finds it, with the licence beside it, and the
// example, beside the showcase's own files. bundle/LjosPlay/UPSTREAM.json
// pins each file, by its path in the bundle, to the commit it came from
// (scripts/sync-play.mjs writes it); the project the showcase's editor
// compiles is those files as they are (`projectOf`).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const bundle = resolve(dirname(fileURLToPath(import.meta.url)), "../bundle");
export const PLAY = {
  repository: "hal-c2/ljos-play",
  module: "LjosPlay",
  example: "Showcase/play/snail-post",
  pin: "LjosPlay/UPSTREAM.json",
  // Where the build writes the editor's project, which Showcase/later.js
  // imports once a reader opens the editor.
  project: "Showcase/snail-post-project.json",
};
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// The files to copy, by their path in the bundle, each from its path in
// ljos-play (`listed`, what `git ls-files` lists there).
export function playFiles(listed) {
  const files = { [`${PLAY.module}/LICENSE`]: "LICENSE", [`${PLAY.example}/Main.qml`]: "examples/snail-post/Main.qml" };
  for (const path of listed.filter((path) => /^qml\/LjosPlay\/[^/]+$/.test(path)).sort()) files[`${PLAY.module}/${path.slice("qml/LjosPlay/".length)}`] = path;
  return files;
}

export const pinned = () => JSON.parse(readFileSync(join(bundle, PLAY.pin), "utf8"));

// The project the editor compiles: the example as `Main.qml`, at its
// root, and the module's files under LjosPlay/ (its qmldir too: it is
// what makes the directory the module the example imports), each with
// its highlighting (`colour(code, lang)`). Only the example is the
// reader's to change; the engine is compiled beside it as it is.
export function projectOf(colour) {
  const { commit, files } = pinned();
  const entry = `${PLAY.example}/Main.qml`;
  const paths = [entry, ...Object.keys(files).filter((path) => path.startsWith(`${PLAY.module}/`) && (path.endsWith(".qml") || path.endsWith("/qmldir")))];
  return {
    commit,
    files: paths.map((path) => {
      const code = readFileSync(join(bundle, path), "utf8");
      const qml = path.endsWith(".qml");
      return { path: path === entry ? "Main.qml" : path, lang: qml ? "qml" : "text", code, rich: path === entry ? colour(code, "qml") : "" };
    }),
  };
}

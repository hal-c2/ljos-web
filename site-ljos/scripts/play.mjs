// ljos-play (hal-c2/ljos-play, MIT), as much of it as the showcase's
// Snail Post runs on: its LjosPlay module, at the bundle's root where an
// `import LjosPlay` finds it, with the licence beside it, and the
// example, beside the showcase's own files. bundle/LjosPlay/UPSTREAM.json
// pins each file, by its path in the bundle, to the commit it came from
// (scripts/sync-play.mjs writes it); the project the showcase's editor
// compiles is those files as they are (`projectOf`).
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
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

// The lines each copy holds in Ljós's dialect, by its path in the bundle:
// for each, the line as ljos-play has it (its showcase entry's
// `upstream`, Showcase/products.json).
export function dialectLines() {
  const products = JSON.parse(readFileSync(join(bundle, "Showcase/products.json"), "utf8"));
  return Object.fromEntries(products.filter((product) => product.engine?.example?.upstream).map(({ engine: { example } }) => [example.copy, example.upstream]));
}

// The copy's bytes as ljos-play holds them: the lines `dialect` (line →
// upstream text) names put back as the repository has them.
export function asUpstream(bytes, dialect = {}) {
  const lines = bytes.toString("utf8").split("\n");
  for (const [line, upstream] of Object.entries(dialect)) lines[Number(line) - 1] = upstream;
  return Buffer.from(lines.join("\n"), "utf8");
}

const fromBundle = (path) => readFileSync(join(bundle, path));

// The paths whose copy (`held[path]`, its bytes, or `read(path)`) is not
// the file the pin names: absent, different from the repository's bytes
// once its dialect lines are put back, or, for a copy held in Ljós's
// dialect, different from the bytes the sync wrote (the pin's `copy`), so
// that a dialect line is the line written there and not any line.
export function drifted(read = fromBundle, pin = JSON.parse(read(PLAY.pin).toString("utf8")), held = {}) {
  const dialect = dialectLines();
  const wanted = [...new Set([...Object.keys(pin.files), `${PLAY.example}/Main.qml`])];
  return wanted.filter((path) => {
    const entry = pin.files[path];
    if (!entry) return true;
    let bytes = held[path];
    if (bytes === undefined) {
      try {
        bytes = read(path);
      } catch {
        return true;
      }
    }
    if (!Object.hasOwn(dialect, path)) return sha256(bytes) !== entry.sha256;
    return sha256(bytes) !== entry.copy || sha256(asUpstream(bytes, dialect[path])) !== entry.sha256;
  });
}

// The files in the vendored folders (the module's and the example's) the
// pin does not name, by their path in the bundle: the build reads those
// folders as they stand, so one would be built in unchecked.
export function strays(pin, list = (dir) => readdirSync(join(bundle, dir))) {
  const named = new Set([...Object.keys(pin.files), PLAY.pin]);
  return [PLAY.module, PLAY.example].flatMap((dir) => list(dir).map((name) => `${dir}/${name}`)).filter((path) => !named.has(path));
}

// The project the editor compiles: the example as `Main.qml`, at its
// root, and the module's files under LjosPlay/ (its qmldir too: it is
// what makes the directory the module the example imports), each with
// its highlighting (`colour(code, lang)`). Only the example is the
// reader's to change; the engine is compiled beside it as it is. The pin
// and each file are read once, and packed only if they are what the pin
// names: a copy that drifted stops the build, named, rather than going
// out as ljos-play's. So does a file in the vendored folders it does not
// name (`strays`): the build calls this before it builds the bundle, so
// the demo and the editor are built from the same checked files.
export function projectOf(colour, read = fromBundle, list = undefined) {
  const pin = JSON.parse(read(PLAY.pin).toString("utf8"));
  const entry = `${PLAY.example}/Main.qml`;
  const paths = [entry, ...Object.keys(pin.files).filter((path) => path.startsWith(`${PLAY.module}/`) && (path.endsWith(".qml") || path.endsWith("/qmldir")))];
  const held = {};
  for (const path of paths) {
    try {
      held[path] = read(path);
    } catch {
      // Absent: drifted names it.
    }
  }
  const changed = [...drifted(read, pin, held), ...strays(pin, list)];
  if (changed.length) throw new Error(`${changed.join(", ")}: not the file ${PLAY.pin} pins; change hal-c2/ljos-play and run scripts/sync-play.mjs`);
  return {
    commit: pin.commit,
    files: paths.map((path) => {
      const code = held[path].toString("utf8");
      const qml = path.endsWith(".qml");
      return { path: path === entry ? "Main.qml" : path, lang: qml ? "qml" : "text", code, rich: path === entry ? colour(code, "qml") : "" };
    }),
  };
}

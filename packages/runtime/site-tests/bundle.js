// A site bundle for a test: a fixture copied to a directory of its own, with
// the manifest an export would write of it (`ljos-site.json`), which a test
// may then tamper with.
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const fixtures = join(import.meta.dirname, "fixtures");
// The stand-in for Ljós's own Ljos.Design (`--with`).
export const design = join(fixtures, "design");
export const qmlc = process.env.QMLC ?? join(import.meta.dirname, "../../../target/debug/qmlc");

const head = spawnSync("git", ["-C", import.meta.dirname, "rev-parse", "HEAD"], { encoding: "utf8" });
const commit = head.status === 0 ? head.stdout.trim() : "0".repeat(40);

function files(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(directory, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`],
  );
}

// What a manifest of the bundle in `dir` says, the way an export writes it.
export function manifest(dir, entry = "Shell.qml") {
  const paths = files(dir).filter((path) => path !== "ljos-site.json").sort();
  const modules = [];
  const blocks = [];
  for (const path of paths.filter((path) => path.endsWith("qmldir"))) {
    const text = readFileSync(join(dir, path), "utf8");
    const module = text.match(/^module\s+(\S+)/m)?.[1];
    if (module) modules.push({ module, qmldir: path });
    for (const [, name, file] of text.matchAll(/^# block (\S+) \S+ (\S+)/gm)) {
      blocks.push({ block: `${module}.${name}`, file: path.replace(/qmldir$/, file) });
    }
  }
  const own = new Set(modules.map(({ module }) => module));
  const imports = new Set();
  for (const path of paths.filter((path) => path.endsWith(".qml"))) {
    for (const [, uri] of readFileSync(join(dir, path), "utf8").matchAll(/^\s*import\s+([A-Za-z_][\w.]*)/gm)) {
      if (!own.has(uri)) imports.add(uri);
    }
  }
  return {
    format: "ljos-site",
    version: 1,
    target: "web",
    entry,
    ...(paths.includes("theme.json") ? { theme: "theme.json" } : {}),
    blocks,
    files: paths.map((path) => ({ path, bytes: statSync(join(dir, path)).size })),
    left_out: [],
    modules,
    imports: [...imports].sort(),
    ljos_web: commit,
  };
}

// The fixture `name` as a bundle in a directory of its own; `change` is
// given the bundle's directory, after its files are copied, and the
// manifest, before it is written, and may change either. `remove()` takes
// the directory and whatever was built beside it.
export function bundle(name = "project", change = () => {}) {
  const root = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-site-test-"));
  const dir = join(root, "bundle");
  cpSync(join(fixtures, name), dir, { recursive: true });
  const written = manifest(dir);
  change(dir, written);
  writeFileSync(join(dir, "ljos-site.json"), `${JSON.stringify(written, null, 2)}\n`);
  return { root, dir, out: join(root, "site"), remove: () => rmSync(root, { recursive: true, force: true }) };
}

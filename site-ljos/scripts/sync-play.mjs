// Copies what the showcase's Snail Post runs on from a checkout of
// hal-c2/ljos-play (MIT): its LjosPlay module into bundle/LjosPlay/, the
// example into bundle/Showcase/play/snail-post/, and the licence beside
// the module, then writes bundle/LjosPlay/UPSTREAM.json: the commit they
// came from and each file's SHA-256, by its path in the bundle. The files
// are the commit's blobs, read from git, so the checkout's line endings
// never change them. The copy is never edited here, but for the example's
// lines in Ljós's dialect, whose copy the pin hashes too (`copy`); a change
// lands in ljos-play first and is brought over by running this again.
// Then the showcase entry's `engine.example.commit` (and its `blob`) in
// Showcase/products.json is changed to the commit the pin names:
// tests/showcase.spec.js fails on a copy that drifted from its pin, and
// on an entry that names another commit.
// Usage: node scripts/sync-play.mjs <checkout>
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { bundle, dialectLines, PLAY, playFiles, sha256 } from "./play.mjs";

const [checkout] = process.argv.slice(2);
if (!checkout) throw new Error("usage: node scripts/sync-play.mjs <ljos-play checkout>");
const git = (...args) => execFileSync("git", ["-C", checkout, ...args], { encoding: "utf8" });
const commit = git("rev-parse", "HEAD").trim();
// What the commit holds, not the checkout: its paths and their blobs.
const listed = git("ls-tree", "-r", "-z", "--name-only", "--full-tree", commit).split("\0").filter(Boolean);
const blob = (path) => execFileSync("git", ["-C", checkout, "cat-file", "blob", `${commit}:${path}`], { maxBuffer: 64 * 1024 * 1024 });
const wanted = playFiles(listed);
// Everything is read and checked before anything in the bundle changes.
// The example is held in Ljós's dialect: the lines its showcase entry
// (Showcase/products.json) has an `upstream` for are written back as the
// copy has them, and the pin hashes the repository's bytes. A line that
// changed upstream is the entry's to change first.
const dialect = dialectLines();
const files = {};
const staged = {};
for (const [here, there] of Object.entries(wanted)) {
  const bytes = blob(there);
  files[here] = { from: there, sha256: sha256(bytes) };
  if (!Object.hasOwn(dialect, here)) {
    staged[here] = bytes;
    continue;
  }
  const held = readFileSync(join(bundle, here), "utf8").split("\n");
  const lines = bytes.toString("utf8").split("\n");
  for (const [line, upstream] of Object.entries(dialect[here])) {
    if (lines[Number(line) - 1] !== upstream) throw new Error(`${here}:${line} is now ${JSON.stringify(lines[Number(line) - 1])} in ${commit}: change its \`upstream\` in Showcase/products.json first`);
    lines[Number(line) - 1] = held[Number(line) - 1];
  }
  staged[here] = Buffer.from(lines.join("\n"), "utf8");
  files[here].copy = sha256(staged[here]);
}
staged[PLAY.pin] = `${JSON.stringify({ repository: PLAY.repository, license: "MIT", commit, files }, null, 2)}\n`;
// A file the module no longer has goes too: the copy is the commit's
// files and nothing else.
const module = join(bundle, PLAY.module);
const gone = existsSync(module) ? readdirSync(module).map((name) => `${PLAY.module}/${name}`).filter((path) => !Object.hasOwn(staged, path)) : [];
// What each path held before, to put back should a write fail part way:
// the bundle is then the copy and pin it was.
const before = {};
for (const path of [...gone, ...Object.keys(staged)]) before[path] = existsSync(join(bundle, path)) ? readFileSync(join(bundle, path)) : null;
try {
  for (const path of gone) rmSync(join(bundle, path));
  // The pin last: until it is written, the old one names what was there.
  for (const path of [...Object.keys(staged).filter((path) => path !== PLAY.pin), PLAY.pin]) {
    mkdirSync(dirname(join(bundle, path)), { recursive: true });
    writeFileSync(join(bundle, path), staged[path]);
  }
} catch (error) {
  for (const [path, bytes] of Object.entries(before)) {
    if (bytes === null) rmSync(join(bundle, path), { force: true });
    else writeFileSync(join(bundle, path), bytes);
  }
  throw error;
}
console.log(`ljos-play: ${Object.keys(files).length} files from ${commit}`);

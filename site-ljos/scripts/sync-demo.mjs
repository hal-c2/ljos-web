// Copies a pro demo's app (bundle/Demos/pro.json names where it lives
// upstream) from a checkout into bundle/Demos/<dir>/ and writes
// UPSTREAM.json: the commit the files came from and each file's
// SHA-256. The copy is never edited here; a change lands upstream first
// and is brought over by running this again (tests/pro.spec.js fails
// on a copy that drifted from its pin).
// Usage: node scripts/sync-demo.mjs <name> <checkout>
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { changedIn, demos, listedIn, sha256, shippedBy, targetOf } from "./pro.mjs";

const [name, checkout] = process.argv.slice(2);
const demo = demos.find((entry) => entry.name === name);
if (!demo || !checkout) throw new Error(`usage: node scripts/sync-demo.mjs <${demos.map((entry) => entry.name).join("|")}> <checkout>`);
const { path: example, repository } = demo.upstream;
const shipped = shippedBy(demo);
const target = targetOf(demo);
// Not trimmed: a path's own spaces are part of it (pro.mjs listedIn).
const git = (...args) => execFileSync("git", ["-C", checkout, ...args], { encoding: "utf8" });
const commit = git("rev-parse", "HEAD").trim();
// The pin says what the files are at that commit, so files changed
// since would be a pin that lies: they are committed first. Paths are
// the repository's, which the example's path is.
const changed = changedIn(git("status", "--porcelain=v1", "-z", "--", example), example).filter(shipped);
if (changed.length) throw new Error(`commit these in ${checkout} first: ${changed.join(", ")}`);
const listed = listedIn(git("ls-files", "-z", "--full-name", "--", example), example);
const files = {};
for (const path of listed.filter(shipped).sort()) {
  const bytes = readFileSync(join(checkout, example, path));
  mkdirSync(dirname(join(target, path)), { recursive: true });
  copyFileSync(join(checkout, example, path), join(target, path));
  files[path] = sha256(bytes);
}
// A file the app no longer has goes too, so the copy is the commit's
// files and nothing else.
const walk = (directory) =>
  existsSync(directory) ? readdirSync(directory, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(directory, entry.name)) : [relative(target, join(directory, entry.name))])) : [];
for (const path of walk(target)) if (path !== "UPSTREAM.json" && !Object.hasOwn(files, path)) rmSync(join(target, path));
writeFileSync(join(target, "UPSTREAM.json"), `${JSON.stringify({ repository, path: example, commit, files }, null, 2)}\n`);
console.log(`${demo.name}: ${Object.keys(files).length} files from ${commit}`);

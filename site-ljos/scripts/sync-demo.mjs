// Copies a pro demo's app (bundle/Demos/pro.json names where it lives
// upstream) from a checkout into bundle/Demos/<dir>/ and writes
// UPSTREAM.json: the commit the files came from and each file's
// SHA-256. The copy is never edited here; a change lands upstream first
// and is brought over by running this again (tests/pro.spec.js fails
// on a copy that drifted from its pin).
// Usage: node scripts/sync-demo.mjs <name> <checkout>
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { demos, sha256, shippedBy, targetOf } from "./pro.mjs";

const [name, checkout] = process.argv.slice(2);
const demo = demos.find((entry) => entry.name === name);
if (!demo || !checkout) throw new Error(`usage: node scripts/sync-demo.mjs <${demos.map((entry) => entry.name).join("|")}> <checkout>`);
const { path: example, repository } = demo.upstream;
const shipped = shippedBy(demo);
const target = targetOf(demo);
const git = (...args) => execFileSync("git", ["-C", checkout, ...args], { encoding: "utf8" }).trim();
const commit = git("rev-parse", "HEAD");
// The pin says what the files are at that commit, so files changed
// since would be a pin that lies: they are committed first.
const changed = git("status", "--porcelain", "--", example).split("\n").filter(Boolean).map((line) => line.slice(line.indexOf(example) + example.length + 1)).filter(shipped);
if (changed.length) throw new Error(`commit these in ${checkout} first: ${changed.join(", ")}`);
const listed = git("ls-files", "--", example).split("\n").map((path) => path.slice(example.length + 1));
const files = {};
for (const path of listed.filter(shipped).sort()) {
  const bytes = readFileSync(join(checkout, example, path));
  mkdirSync(dirname(join(target, path)), { recursive: true });
  copyFileSync(join(checkout, example, path), join(target, path));
  files[path] = sha256(bytes);
}
writeFileSync(join(target, "UPSTREAM.json"), `${JSON.stringify({ repository, path: example, commit, files }, null, 2)}\n`);
console.log(`${demo.name}: ${Object.keys(files).length} files from ${commit}`);

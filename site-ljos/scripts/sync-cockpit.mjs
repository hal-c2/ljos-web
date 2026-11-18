// Copies the car cockpit example from a ljos-ui checkout into
// bundle/Demos/Cockpit/ and writes UPSTREAM.json: the commit the files
// came from and each file's SHA-256. The copy is never edited here; a
// change lands in ljos-ui first and is brought over by running this
// again (tests/cockpit.spec.js fails on a copy that drifted from its
// pin). Usage: node scripts/sync-cockpit.mjs <ljos-ui checkout>
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const example = "examples/car-cockpit";
// What the app runs on: its QML, its typed logic and the parts of the
// car it loads. The Blender script, the whole-car GLB and the rig the
// script writes are how the parts were made, not what runs.
export const shipped = (path) =>
  (path.endsWith(".qml") || path.startsWith("logic/") || (path.startsWith("assets/car/") && path.endsWith(".glb") && path !== "assets/car/car.glb"));

const here = dirname(fileURLToPath(import.meta.url));
export const target = resolve(here, "../bundle/Demos/Cockpit");
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const checkout = process.argv[2];
  if (!checkout) throw new Error("usage: node scripts/sync-cockpit.mjs <ljos-ui checkout>");
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
  writeFileSync(join(target, "UPSTREAM.json"), `${JSON.stringify({ repository: "hal-c2/ljos-ui", path: example, commit, files }, null, 2)}\n`);
  console.log(`${Object.keys(files).length} files from ${commit}`);
}

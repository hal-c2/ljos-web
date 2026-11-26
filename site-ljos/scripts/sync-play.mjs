// Copies what the showcase's Snail Post runs on from a checkout of
// hal-c2/ljos-play (MIT): its LjosPlay module into bundle/LjosPlay/, the
// example into bundle/Showcase/play/snail-post/, and the licence beside
// the module, then writes bundle/LjosPlay/UPSTREAM.json: the commit they
// came from and each file's SHA-256, by its path in the bundle. The copy
// is never edited here; a change lands in ljos-play first and is brought
// over by running this again (tests/showcase.spec.js fails on a copy that
// drifted from its pin, and on an entry that names another commit).
// Usage: node scripts/sync-play.mjs <checkout>
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { bundle, PLAY, playFiles, sha256 } from "./play.mjs";

const [checkout] = process.argv.slice(2);
if (!checkout) throw new Error("usage: node scripts/sync-play.mjs <ljos-play checkout>");
const git = (...args) => execFileSync("git", ["-C", checkout, ...args], { encoding: "utf8" });
const commit = git("rev-parse", "HEAD").trim();
const listed = git("ls-files", "-z", "--full-name").split("\0").filter(Boolean);
const wanted = playFiles(listed);
// The pin says what the files are at that commit, so files changed
// since would be a pin that lies: they are committed first.
const changed = git("status", "--porcelain=v1", "-z", "--", ...Object.values(wanted)).split("\0").filter(Boolean);
if (changed.length) throw new Error(`commit these in ${checkout} first: ${changed.map((line) => line.slice(3)).join(", ")}`);
// A file the module no longer has goes too: the copy is the commit's
// files and nothing else.
const module = join(bundle, PLAY.module);
if (existsSync(module)) for (const name of readdirSync(module)) if (!Object.hasOwn(wanted, `${PLAY.module}/${name}`)) rmSync(join(module, name));
const files = {};
for (const [here, there] of Object.entries(wanted)) {
  mkdirSync(dirname(join(bundle, here)), { recursive: true });
  copyFileSync(join(checkout, there), join(bundle, here));
  files[here] = { from: there, sha256: sha256(readFileSync(join(bundle, here))) };
}
writeFileSync(join(bundle, PLAY.pin), `${JSON.stringify({ repository: PLAY.repository, license: "MIT", commit, files }, null, 2)}\n`);
console.log(`ljos-play: ${Object.keys(files).length} files from ${commit}`);

// Holds a capture's pictures against the deploy before's:
//
//   node shots/compare.mjs --shots dist/screenshots \
//     --before https://ljos.dev/screenshots/manifest.json [--check]
//
// `--before` is the manifest the site has now (an address or a file);
// its pictures are fetched beside it and kept with this deploy's
// (<shots>/before/), as the next deploy replaces them. A picture whose
// pixels differ by more than the threshold is changed, and the picture
// of where is written (<shots>/diff/). A change a pull request means is
// listed in shots/accepted.json with its reason, which the page shows.
// With `--check` it exits 1 when a picture is broken, changed or gone
// without being listed, when one before or their manifest can't be read,
// when an entry in the list isn't whole (ids, a reason), or when there are
// no pictures: what CI fails a deploy on. Gone counts because
// a demo that loses its canvas is a picture gone and another new, never a
// changed one. A deploy with no manifest before it (no such file, or 404)
// has nothing to hold against, and every picture is new.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { THRESHOLD, acceptedFor, difference, readPng, sinceThen, wellDeclared, writePng } from "./pictures.mjs";


const { values } = parseArgs({
  options: {
    shots: { type: "string" },
    before: { type: "string" },
    accepted: { type: "string", default: new URL("./accepted.json", import.meta.url).pathname },
    threshold: { type: "string", default: String(THRESHOLD) },
    check: { type: "boolean", default: false },
    "thumb-width": { type: "string", default: "560" },
  },
});
if (!values.shots) {
  console.error("usage: compare.mjs --shots <dir> [--before <manifest address or file>] [--check]");
  process.exit(2);
}
const dir = resolve(values.shots);
const threshold = Number(values.threshold);
const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));

// What the deploy before wrote, read from where it stands, its pictures
// beside it. `absent` is only where it says there is none: anything else
// that can't be read could be hiding a change.
async function readAt(where) {
  try {
    if (!/^https?:\/\//.test(where)) return { bytes: readFileSync(where), absent: false };
    const response = await fetch(where, { cache: "no-store" });
    if (!response.ok) return { bytes: null, absent: response.status === 404 };
    return { bytes: Buffer.from(await response.arrayBuffer()), absent: false };
  } catch (error) {
    return { bytes: null, absent: error.code === "ENOENT" };
  }
}
const beside = (where, file) => (/^https?:\/\//.test(where) ? new URL(file, where).href : join(where, "..", file));

let previous = null;
const unread = [];
if (values.before) {
  const { bytes, absent } = await readAt(values.before);
  try {
    previous = bytes === null ? null : JSON.parse(bytes.toString("utf8"));
  } catch {
    previous = null;
  }
  if (previous?.format !== "ljos-shots") previous = null;
  if (previous === null && !absent) unread.push("the list before");
}

const listed = JSON.parse(readFileSync(values.accepted, "utf8")).changes;
const declared = listed.filter(wellDeclared);
const undeclared = listed.filter((entry) => !wellDeclared(entry));
const accepted = sinceThen(declared, previous?.declared ?? []);

mkdirSync(join(dir, "before"), { recursive: true });
mkdirSync(join(dir, "diff"), { recursive: true });
const before = new Map((previous?.shots ?? []).map((shot) => [shot.id, shot]));
const thumbWidth = Number(values["thumb-width"]);
const shots = [];
for (const shot of manifest.shots) {
  const was = before.get(shot.id);
  const bytes = was ? (await readAt(beside(values.before, was.file))).bytes : null;
  if (was && bytes === null) unread.push(shot.id);
  if (bytes === null) {
    shots.push({ ...shot, before: null, diff: null, status: shot.health.ok ? "new" : "broken", accepted: null });
    continue;
  }
  const file = `before/${shot.id}.png`;
  const thumb = `before/${shot.id}.webp`;
  writeFileSync(join(dir, file), bytes);
  await sharp(bytes).resize({ width: thumbWidth, withoutEnlargement: true }).webp({ quality: 80 }).toFile(join(dir, thumb));
  // What moved on its own then or now is left out: a turning scene is
  // never caught on the same frame twice.
  const moving = [...(shot.moving ?? []), ...(was.moving ?? [])];
  const { ratio, picture } = difference(readPng(bytes), readPng(readFileSync(join(dir, shot.file))), moving);
  const changed = ratio > threshold;
  let diff = { ratio, file: null };
  if (changed && picture !== null) {
    diff = { ratio, file: `diff/${shot.id}.png` };
    writeFileSync(join(dir, diff.file), writePng(picture));
  }
  const said = changed ? acceptedFor(accepted, shot.id) : null;
  shots.push({ ...shot, before: { file, thumb }, diff, status: !shot.health.ok ? "broken" : changed ? "changed" : "same", accepted: said });
}

const now = new Set(shots.map((shot) => shot.id));
const gone = [...before.keys()].filter((id) => !now.has(id));
// What was taken off on purpose has no tile to say why on, so the page is
// given each reason once, with the pictures it is of.
const removed = new Map();
const lost = [];
for (const id of gone) {
  const said = acceptedFor(accepted, id);
  if (said === null) {
    lost.push(id);
    continue;
  }
  const key = JSON.stringify(said);
  if (!removed.has(key)) removed.set(key, { ...said, ids: [] });
  removed.get(key).ids.push(id);
}
const done = {
  ...manifest,
  threshold,
  declared,
  previous: previous === null ? null : { sha: previous.sha, date: previous.date },
  gone,
  removed: [...removed.values()],
  shots,
};
writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(done, null, 1)}\n`);

const unexpected = shots.filter((shot) => shot.status === "changed" && shot.accepted === null);
const broken = shots.filter((shot) => shot.status === "broken");
for (const shot of unexpected) console.log(`changed ${shot.id}: ${(shot.diff.ratio * 100).toFixed(2)} % of pixels, not in shots/accepted.json`);
for (const shot of broken) console.log(`broken  ${shot.id}: ${shot.health.problems.join("; ")}`);
for (const id of done.gone) console.log(`gone    ${id}${lost.includes(id) ? ", not in shots/accepted.json" : ""}`);
for (const what of unread) console.log(`unread  ${what}: could not be read, so nothing is held against it`);
for (const entry of undeclared) console.log(`undeclared ${JSON.stringify(entry)}: needs ids (a list), a reason and, if given, a pull request's number`);
const count = (status) => shots.filter((shot) => shot.status === status).length;
console.log(`${shots.length} shots against ${previous ? previous.sha.slice(0, 7) : "nothing before"}: ${count("same")} same, ${count("changed")} changed (${unexpected.length} not accepted), ${count("new")} new, ${broken.length} broken, ${done.gone.length} gone`);
const failing = shots.length === 0 || [unexpected, broken, lost, unread, undeclared].some((found) => found.length > 0);
process.exit(values.check && failing ? 1 : 0);

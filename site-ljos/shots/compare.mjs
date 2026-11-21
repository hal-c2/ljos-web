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
// With `--check` it exits 1 when a picture is broken or changed without
// being listed: what CI fails a deploy on. A deploy with no manifest
// before it has nothing to hold against, and every picture is new.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { THRESHOLD, acceptedFor, difference, readPng, sinceThen, writePng } from "./pictures.mjs";


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
// beside it; null where there is none yet.
async function bytesAt(where) {
  if (/^https?:\/\//.test(where)) {
    const response = await fetch(where, { cache: "no-store" });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  }
  try {
    return readFileSync(where);
  } catch {
    return null;
  }
}
const beside = (where, file) => (/^https?:\/\//.test(where) ? new URL(file, where).href : join(where, "..", file));

let previous = null;
if (values.before) {
  const bytes = await bytesAt(values.before);
  try {
    previous = bytes === null ? null : JSON.parse(bytes.toString("utf8"));
  } catch {
    previous = null;
  }
  if (previous?.format !== "ljos-shots") previous = null;
}

const declared = JSON.parse(readFileSync(values.accepted, "utf8")).changes;
const accepted = sinceThen(declared, previous?.declared ?? []);

mkdirSync(join(dir, "before"), { recursive: true });
mkdirSync(join(dir, "diff"), { recursive: true });
const before = new Map((previous?.shots ?? []).map((shot) => [shot.id, shot]));
const thumbWidth = Number(values["thumb-width"]);
const shots = [];
for (const shot of manifest.shots) {
  const was = before.get(shot.id);
  const bytes = was ? await bytesAt(beside(values.before, was.file)) : null;
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
const done = {
  ...manifest,
  threshold,
  declared,
  previous: previous === null ? null : { sha: previous.sha, date: previous.date },
  gone: [...before.keys()].filter((id) => !now.has(id)),
  shots,
};
writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(done, null, 1)}\n`);

const unexpected = shots.filter((shot) => shot.status === "changed" && shot.accepted === null);
const broken = shots.filter((shot) => shot.status === "broken");
for (const shot of unexpected) console.log(`changed ${shot.id}: ${(shot.diff.ratio * 100).toFixed(2)} % of pixels, not in shots/accepted.json`);
for (const shot of broken) console.log(`broken  ${shot.id}: ${shot.health.problems.join("; ")}`);
for (const id of done.gone) console.log(`gone    ${id}`);
const count = (status) => shots.filter((shot) => shot.status === status).length;
console.log(`${shots.length} shots against ${previous ? previous.sha.slice(0, 7) : "nothing before"}: ${count("same")} same, ${count("changed")} changed (${unexpected.length} not accepted), ${count("new")} new, ${broken.length} broken, ${done.gone.length} gone`);
process.exit(values.check && (unexpected.length > 0 || broken.length > 0) ? 1 : 0);

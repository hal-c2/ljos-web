#!/usr/bin/env node
// What the build of an example downloads before it compiles anything:
// pictures, meshes and fonts that are in no repository. They are kept
// outside this one too, in a cache, and are found there by what renders the
// example: the gallery, and Qt when it is run for a reference picture.
//
//   corpus/assets.mjs            # which examples have such assets, and whether they are here
//   corpus/assets.mjs ID...      # download and unpack those of each
//
// `assets` in `corpus/examples.json` says where an example's are downloaded
// from and where its build puts them (`places`). An example that downloads
// them itself, as it starts, asks for them one by one where a browser is
// concerned: `addresses` says at which addresses, and what is kept is given
// for them where there is to be no network. `without` names what is in the
// archive and nothing of the example reads. One that has no archive has the
// names of its files in a source of its own (`listed`), each of them under
// `url`: those are downloaded one by one into `files`. The cache is
// LJOS_WEB_ASSETS, or `ljos-web/assets` in the user's cache directory.
import { spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const cache = process.env.LJOS_WEB_ASSETS ?? join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "ljos-web", "assets");

// Where an example's assets are kept, where each directory of them is in
// the example as built (`places`: `[in the example, in the cache]`) and at
// which address the example asks for it (`addresses`: `[address, in the
// cache]`). Null for an example that has none, or whose assets are not here.
export function assetsOf(example) {
  if (!example.assets) return null;
  const directory = join(cache, example.id);
  const kept = (pairs = {}) => Object.entries(pairs).map(([to, from]) => [to, join(directory, from)]);
  const places = kept(example.assets.places);
  const addresses = kept(example.assets.addresses);
  return [...places, ...addresses].every(([, from]) => existsSync(from)) ? { directory, places, addresses } : null;
}

// The files a source of the example's names, a string on a line each.
function listed(example, examples) {
  const text = readFileSync(join(examples, example.dir, example.assets.listed), "utf8");
  return [...text.matchAll(/^\s*"([^":]+\.\w+)",?\s*$/gm)].map(([, name]) => name);
}

// Each of them, into `files`: which is there when all of them are, so that
// half of them are not taken for what the example has.
async function each(example, examples, directory) {
  const names = listed(example, examples);
  const part = join(directory, "files.part");
  for (const [index, name] of names.entries()) {
    const file = join(part, name);
    if (existsSync(file)) continue;
    console.log(`${example.id}: ${index + 1} of ${names.length}, ${name}`);
    const answer = await fetch(new URL(name, example.assets.url));
    if (!answer.ok) throw new Error(`${answer.url}: ${answer.status} ${answer.statusText}`);
    mkdirSync(dirname(file), { recursive: true });
    await pipeline(Readable.fromWeb(answer.body), createWriteStream(`${file}.part`));
    renameSync(`${file}.part`, file);
  }
  renameSync(part, join(directory, "files"));
}

async function download(example, examples) {
  const directory = join(cache, example.id);
  if (assetsOf(example)) {
    console.log(`${example.id}: ${directory}`);
    return;
  }
  if (example.assets.listed) {
    await each(example, examples, directory);
    if (!assetsOf(example)) throw new Error(`${example.assets.listed} names nothing of ${Object.values({ ...example.assets.places, ...example.assets.addresses }).join(", ")}`);
    console.log(`${example.id}: ${directory}`);
    return;
  }
  const archive = join(directory, basename(new URL(example.assets.url).pathname));
  mkdirSync(directory, { recursive: true });
  if (!existsSync(archive)) {
    console.log(`${example.id}: downloading ${example.assets.url}`);
    const answer = await fetch(example.assets.url);
    if (!answer.ok) throw new Error(`${example.assets.url}: ${answer.status} ${answer.statusText}`);
    // Whole or not at all: half an archive is not one to unpack next time.
    await pipeline(Readable.fromWeb(answer.body), createWriteStream(`${archive}.part`));
    renameSync(`${archive}.part`, archive);
  }
  const without = example.assets.without ?? [];
  const unpacked = [
    ["unzip", ["-o", "-q", archive, "-d", directory, ...(without.length ? ["-x", ...without] : [])]],
    ["bsdtar", ["-xf", archive, "-C", directory, ...without.flatMap((name) => ["--exclude", name])]],
  ].some(([tool, args]) => spawnSync(tool, args, { stdio: "inherit" }).status === 0);
  if (!unpacked) throw new Error(`${archive} could not be unpacked: neither unzip nor bsdtar did`);
  const places = Object.values({ ...example.assets.places, ...example.assets.addresses });
  // Unpacked, the archive is the same again: it is not kept twice.
  rmSync(archive);
  if (!assetsOf(example)) throw new Error(`${archive} has not got ${places.join(", ")}`);
  console.log(`${example.id}: ${directory}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const corpus = dirname(fileURLToPath(import.meta.url));
  const manifest = JSON.parse(readFileSync(join(corpus, "examples.json"), "utf8"));
  const having = manifest.examples.filter((example) => example.assets);
  const wanted = process.argv.slice(2);
  const unknown = wanted.filter((id) => !having.some((example) => example.id === id));
  if (unknown.length) {
    console.error(`no assets to download for: ${unknown.join(", ")}`);
    process.exit(1);
  }
  if (!wanted.length) {
    for (const example of having) console.log(`${example.id}: ${assetsOf(example) ? "here" : "not here"} (${example.assets.url})`);
  }
  for (const example of having.filter((example) => wanted.includes(example.id))) await download(example, join(corpus, manifest.root));
}

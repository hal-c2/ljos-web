// What site.yml's jobs build and wait for, read out of the workflow and
// the site-setup action: the run's critical path is its longest chain of
// jobs, so what a job waits for before it may start is part of how long
// the run takes, not only of what it is given.
//
// `node --test .github/scripts/site-jobs.test.mjs` checks them.

import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").split("\n");
const indent = (line) => line.length - line.trimStart().length;

// Each job of site.yml, as its own lines and what it `needs:`. Keys are
// one per line, so lines are enough; no YAML library is needed.
function jobs() {
  const lines = read("../workflows/site.yml");
  const start = lines.indexOf("jobs:");
  const found = new Map();
  let name = null;
  for (const line of lines.slice(start + 1)) {
    const at = line.match(/^ {2}([a-z0-9-]+):$/);
    if (at) {
      name = at[1];
      found.set(name, { name, lines: [], needs: [] });
      continue;
    }
    if (!name || (line.trim() !== "" && indent(line) < 2)) continue;
    const job = found.get(name);
    job.lines.push(line);
    const needs = line.match(/^ {4}needs: (.*)$/);
    if (needs) job.needs = needs[1].replace(/^\[|\]$/g, "").split(",").map((each) => each.trim());
  }
  return found;
}

const all = jobs();
const runs = (job, command) => job.lines.some((line) => line.trim().replace(/^- /, "").startsWith(`run: ${command}`));
const builders = (command) => [...all.values()].filter((job) => runs(job, command));
// Every job a job waits for, however many jobs away.
function waitsFor(name, seen = new Set()) {
  for (const need of all.get(name)?.needs ?? []) {
    if (seen.has(need)) continue;
    seen.add(need);
    waitsFor(need, seen);
  }
  return seen;
}

test("qmlc, the page's compiler, the kernel and View3D's renderer are each built once in the run", () => {
  for (const command of ["cargo build --bin qmlc --locked", "mise run build:wasm-compiler", "mise run build:kernel", "mise run build:wasm-3d"]) {
    assert.equal(builders(command).length, 1, `${command}: run in ${builders(command).map((job) => job.name).join(", ") || "no job"}`);
  }
});

test("View3D's renderer is built beside qmlc, not after it: neither job waits for the other", () => {
  const [qmlc] = builders("cargo build --bin qmlc --locked");
  const [view3d] = builders("mise run build:wasm-3d");
  assert.notEqual(view3d.name, qmlc.name, `${qmlc.name} builds qmlc and then View3D's renderer, one after the other`);
  assert.ok(!waitsFor(view3d.name).has(qmlc.name), `${view3d.name} waits for ${qmlc.name}`);
  assert.ok(!waitsFor(qmlc.name).has(view3d.name), `${qmlc.name} waits for ${view3d.name}`);
});

test("every job given the Rust artefacts waits for each job that builds them", () => {
  const given = [...all.values()].filter((job) => job.lines.some((line) => line.trim() === 'artefacts: "true"'));
  assert.ok(given.length >= 4, `found ${given.length} jobs given the Rust artefacts`);
  const makers = ["cargo build --bin qmlc --locked", "mise run build:wasm-3d"].map((command) => builders(command)[0].name);
  for (const job of given) for (const maker of makers) assert.ok(waitsFor(job.name).has(maker), `${job.name} is given the artefacts without waiting for ${maker}`);
});

test("each artefact a job builds is uploaded by it under a name the site-setup action downloads, to where it was built", () => {
  const action = read("../actions/site-setup/action.yml");
  // `name:` and `path:` of each download in the action, in order.
  const downloads = [];
  for (const [index, line] of action.entries()) {
    if (!line.includes("uses: actions/download-artifact@")) continue;
    const own = action.slice(index + 1, index + 6);
    const value = (key) => own.map((l) => l.trim().match(new RegExp(`^${key}: (.*)$`))?.[1]).find(Boolean);
    downloads.push({ name: value("name"), path: value("path") ?? "." });
  }
  for (const [command, built] of [
    ["mise run build:wasm-3d", "packages/runtime/QtQuick3D/wgpu/"],
    ["cargo build --bin qmlc --locked", "target/debug/qmlc"],
  ]) {
    const [job] = builders(command);
    const at = job.lines.findIndex((line) => line.includes("uses: actions/upload-artifact@"));
    assert.ok(at >= 0, `${job.name} uploads nothing`);
    const upload = job.lines.slice(at + 1, at + 12);
    const name = upload.map((l) => l.trim().match(/^name: (.*)$/)?.[1]).find(Boolean);
    const download = downloads.find((each) => each.name === name);
    assert.ok(download, `${job.name} uploads ${name}, which site-setup never downloads`);
    assert.ok(upload.some((l) => l.trim() === built || l.trim() === `path: ${built}`), `${job.name}'s ${name} does not hold ${built}`);
    // A single directory uploaded is the artefact's root: it is put
    // back where it was built only when downloaded there.
    const single = upload.some((l) => l.trim() === `path: ${built}`);
    if (single) assert.equal(download.path.replace(/\/?$/, "/"), built.replace(/\/?$/, "/"), `${name} is downloaded to ${download.path}, not ${built}`);
  }
});

// A cold run's site jobs waited 9.5 min on one stalled mirror for the
// packages Chromium needs, and every e2e job waits on them.
test("a browser's system packages are fetched side by side before Playwright installs them, when the cache has none of this image's", () => {
  const action = read("../actions/site-setup/action.yml");
  const at = (pattern) => action.findIndex((line) => pattern.test(line));
  const fetch = at(/bash \.github\/scripts\/fetch-debs\.sh ~\/\.cache\/playwright-debs/);
  assert.ok(fetch >= 0, "site-setup never runs fetch-debs.sh");
  assert.ok(/install-deps --dry-run chromium/.test(action[fetch]), "fetch-debs.sh is not given Playwright's dry run");
  const step = action.slice(0, fetch).findLastIndex((line) => /^ {4}- /.test(line));
  const own = action.slice(step, fetch);
  assert.ok(own.some((line) => line.includes("steps.debs.outputs.cache-hit != 'true'")), "it runs even when this image's cache was found");
  assert.ok(own.some((line) => line.trim() === "continue-on-error: true"), "a failed fetch would fail the job, though apt fetches what it lacks");
  assert.ok(at(/90playwright-debs/) < fetch, "it runs before apt is told where its cache is");
  assert.ok(fetch < at(/exec playwright install(?!-deps --dry-run)/), "it runs after Playwright installs");
  assert.ok(runs(all.get("check"), "bash .github/scripts/fetch-debs.test.sh"), "the check job does not test fetch-debs.sh");
});

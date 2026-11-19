// How the workflows' caches are keyed, read out of ci.yml, site.yml and
// the site-setup action. The repository's caches are held to 10 GB and
// the oldest are evicted past it; the Rust caches of every pull request
// took most of it, and pushed out the site's own between runs.
//
// `node --test .github/scripts/caches.test.mjs` checks them.

import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const files = ["../workflows/ci.yml", "../workflows/site.yml", "../actions/site-setup/action.yml"];
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").split("\n");
const indent = (line) => line.length - line.trimStart().length;

// Each step (`- ` in a steps list) of a file, as its own lines and the
// job it is in ("" in the action). Keys of a step are one per line, so
// lines are enough; no YAML library is needed.
function steps(path) {
  const lines = read(path);
  const found = [];
  let job = "";
  for (let i = 0; i < lines.length; i++) {
    const jobLine = lines[i].match(/^ {2}([a-z0-9-]+):$/);
    if (jobLine && path.includes("workflows/")) job = jobLine[1];
    const item = lines[i].match(/^( *)- (uses|id|if|run|name|shell|with|env):?/);
    if (!item || !/^ +- /.test(lines[i])) continue;
    const depth = item[1].length;
    let end = i + 1;
    while (end < lines.length && (lines[end].trim() === "" || indent(lines[end]) > depth)) end++;
    const own = lines.slice(i, end).map((l) => l.replace(/^( *)- /, "$1  "));
    found.push({ file: path.replace("../", ""), job, lines: own, value: (key) => {
      const m = own.map((l) => l.trim().match(new RegExp(`^${key}: (.*)$`))).find(Boolean);
      return m?.[1];
    } });
  }
  return found;
}
const all = files.flatMap(steps);
const rustCaches = all.filter((s) => s.value("uses")?.startsWith("Swatinem/rust-cache@"));
const onMain = "${{ github.ref == 'refs/heads/main' }}";

test("every Rust cache is read under a key it shares by name, and saved only from main", () => {
  assert.ok(rustCaches.length >= 5, `found ${rustCaches.length} Rust caches`);
  for (const s of rustCaches) {
    const where = `${s.file} ${s.job}`;
    assert.ok(s.value("shared-key"), `${where}: a Rust cache named by its job, not a shared key`);
    assert.ok([onMain, "false"].includes(s.value("save-if")), `${where}: a Rust cache saved from ${s.value("save-if") ?? "every branch"}`);
  }
});

test("each shared Rust key has one job that saves it, and its readers build the same workspaces", () => {
  const byKey = Map.groupBy(rustCaches, (s) => s.value("shared-key"));
  for (const [key, readers] of byKey) {
    const savers = readers.filter((s) => s.value("save-if") === onMain).map((s) => `${s.file} ${s.job}`);
    assert.equal(savers.length, 1, `${key}: saved by ${savers.length ? savers.join(", ") : "no job"}`);
    assert.equal(new Set(readers.map((s) => s.value("workspaces") ?? ".")).size, 1, `${key}: read for other workspaces`);
  }
});

test("no prerender cache is keyed by the runner image's name, only by what it draws with", () => {
  const prerenders = all.filter((s) => s.value("key")?.startsWith("codeblocks-"));
  assert.ok(prerenders.length >= 4, `found ${prerenders.length} prerender caches`);
  for (const s of prerenders) {
    for (const key of ["key", "restore-keys"]) {
      const said = s.value(key);
      if (!said) continue;
      assert.ok(!/outputs\.image|ImageVersion/.test(said), `${s.file} ${s.job}: ${key} names the image: ${said}`);
      assert.match(said, /^codeblocks-[a-z-]+-\$\{\{ steps\.setup\.outputs\.drawing \}\}-/, `${s.file} ${s.job}: ${key} is not keyed by what draws`);
    }
  }
  // The hash is read only where Chromium was set up, so every job keyed
  // by it asks for the browser.
  for (const job of new Set(prerenders.map((s) => s.job))) {
    const setup = all.find((s) => s.job === job && s.value("uses") === "./.github/actions/site-setup");
    assert.equal(setup?.value("browser"), '"true"', `${job}: keyed by what draws, with no browser set up`);
  }
  const drawing = all.find((s) => s.file.endsWith("action.yml") && s.value("id") === "drawing");
  assert.ok(drawing?.lines.some((l) => l.includes(".github/scripts/drawn-with.sh")), "site-setup's drawing hash is not drawn-with.sh's");
  const action = read("../actions/site-setup/action.yml");
  const at = (text) => action.findIndex((l) => l.includes(text));
  assert.ok(at("id: drawing") > at("playwright install-deps chromium"), "the drawing hash is read before Playwright installs what Chromium needs");
});

test("the browser's apt packages start from another image's when their own has none", () => {
  const debs = all.find((s) => s.value("id") === "debs");
  assert.match(debs?.value("restore-keys") ?? "", /^playwright-debs-\$\{\{ steps\.playwright\.outputs\.os \}\}-$/);
});

test("the browser's apt packages are saved holding only what this job installed", () => {
  const action = read("../actions/site-setup/action.yml");
  const at = (text) => action.findIndex((l) => l.includes(text));
  const save = all.find((s) => s.value("key") === "${{ steps.debs.outputs.cache-primary-key }}");
  const prune = all.find((s) => s.lines.some((l) => l.includes(".github/scripts/keep-installed-debs.sh ~/.cache/playwright-debs")));
  assert.ok(prune, "nothing prunes the apt packages before they are saved");
  // A prune that fails (dpkg unreadable) costs this save, not the job.
  assert.equal(prune.value("continue-on-error"), "true", "a failing prune fails the job");
  assert.equal(prune.value("id"), "kept", "the prune has no id for the save to read");
  assert.equal(save?.value("if"), `${prune.value("if")} && steps.kept.outcome == 'success'`, "the save runs after a prune that failed, or under another condition");
  const pruneAt = at(".github/scripts/keep-installed-debs.sh");
  assert.ok(pruneAt > at("playwright install --with-deps chromium") && pruneAt > at("playwright install-deps chromium"), "the packages are pruned before Playwright installs them");
  assert.ok(pruneAt < at("key: ${{ steps.debs.outputs.cache-primary-key }}"), "the packages are pruned after they are saved");
});

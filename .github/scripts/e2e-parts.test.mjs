// How site.yml's e2e parts cut the suite, weighed with how long each
// test took in a run (e2e-seconds.tsv, e2e-seconds.mjs writes it). A
// part's job waits for its longest part, and the longest e2e-wasm part
// ended the run: what a part is given to run is part of how long a run
// takes, not only of what it tests.
//
// `node --test .github/scripts/e2e-parts.test.mjs` checks them.

import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));

// Each test the table holds, by its --grep name, with its seconds on each
// kernel (undefined where it did not run on one).
const recorded = readFileSync(here("e2e-seconds.tsv"), "utf8")
  .split("\n")
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => {
    const [name, plain, wasm] = line.split("\t");
    const number = (value) => (value === "" ? undefined : Number(value));
    return { name, seconds: { default: number(plain), wasm: number(wasm) } };
  });

// The parts each e2e job's matrix lists, read out of site.yml.
function matrixParts(job) {
  const lines = readFileSync(here("../workflows/site.yml"), "utf8").split("\n");
  const start = lines.indexOf(`  ${job}:`);
  assert.ok(start >= 0, `site.yml has no ${job} job`);
  const end = lines.findIndex((line, index) => index > start && /^ {2}[a-z0-9-]+:$/.test(line));
  const part = lines.slice(start, end < 0 ? undefined : end).map((line) => line.match(/^ +part: \[(.*)\]$/)?.[1]).find(Boolean);
  assert.ok(part, `${job} has no matrix of parts`);
  return part.split(",").map((each) => each.trim());
}

// What e2e-part.sh asks Playwright for a part, as the arguments it gives
// pnpm: a stand-in pnpm says them, one to a line, and runs nothing.
const scratch = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-parts-"));
process.on("exit", () => rmSync(scratch, { recursive: true, force: true }));
writeFileSync(join(scratch, "pnpm"), "#!/bin/sh\nprintf '%s\\n' \"$@\"\n");
chmodSync(join(scratch, "pnpm"), 0o755);
function argsOf(part) {
  const ran = spawnSync("bash", [here("e2e-part.sh"), part], { encoding: "utf8", env: { ...process.env, PATH: `${scratch}:${process.env.PATH}` } });
  assert.equal(ran.status, 0, `e2e-part.sh ${part}: ${ran.stderr}`);
  return ran.stdout.split("\n").slice(0, -1);
}

// The tests a part runs, matched as Playwright matches --grep and
// --grep-invert: each a pattern over the test's name, any case.
function matcher(pattern) {
  const re = new RegExp(pattern, "gi");
  return (name) => {
    re.lastIndex = 0;
    return re.test(name);
  };
}
function runs(args) {
  const value = (flag) => {
    const at = args.indexOf(flag);
    return at < 0 ? undefined : args[at + 1];
  };
  const grep = value("--grep");
  const invert = value("--grep-invert");
  const kept = grep === undefined ? () => true : matcher(grep);
  const dropped = invert === undefined ? () => false : matcher(invert);
  return (name) => kept(name) && !dropped(name);
}

const parts = matrixParts("e2e");
const cut = parts.map((part) => ({ part, runs: runs(argsOf(part)) }));

test("both kernels' e2e jobs run the same parts", () => {
  assert.deepEqual(matrixParts("e2e-wasm"), parts);
});

test("each test the suite has runs in one part, and only one", () => {
  for (const { name } of recorded) {
    const in_ = cut.filter(({ runs: has }) => has(name)).map(({ part }) => part);
    assert.equal(in_.length, 1, `${name}: in ${in_.join(", ") || "no part"}`);
  }
  for (const { part, runs: has } of cut) assert.ok(recorded.some(({ name }) => has(name)), `${part} runs no test`);
});

// Playwright's two workers on a runner (site.yml says why not four): a
// part's tests take about half their seconds on the clock. Ten minutes
// of tests is five on the clock, after the setup every part's job pays.
const MOST = 600;
for (const kernel of ["default", "wasm"]) {
  test(`no part takes more than ${MOST / 60} test-minutes on the ${kernel} kernel`, () => {
    const weighed = cut.map(({ part, runs: has }) => ({ part, seconds: Math.round(recorded.filter(({ name }) => has(name)).reduce((sum, { seconds }) => sum + (seconds[kernel] ?? 0), 0)) }));
    const over = weighed.filter(({ seconds }) => seconds > MOST);
    assert.deepEqual(over, [], `parts over ${MOST} s: ${weighed.map(({ part, seconds }) => `${part} ${seconds} s`).join(", ")}`);
  });
}

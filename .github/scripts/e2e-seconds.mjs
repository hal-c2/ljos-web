// How long each e2e test took in a run of site.yml, on each kernel, as
// .github/scripts/e2e-seconds.tsv holds it for e2e-parts.test.mjs. The
// parts are cut by what each test is called, and how long a part takes
// is the sum of its tests' seconds: the table is what a cut is weighed
// with, without running the suite.
//
// Written from a run's logs, each part's job saved with
// `gh run view RUN --job JOB --log`:
//
//   node .github/scripts/e2e-seconds.mjs RUN default.log… -- wasm.log… > .github/scripts/e2e-seconds.tsv
//
// A test is named as Playwright's --grep reads it: its project, its
// file (from the suite's directory, e2e/) and its titles, a space
// between each.

import { readFileSync } from "node:fs";

const [run, ...logs] = process.argv.slice(2);
const split = logs.indexOf("--");
if (!run || split < 1 || split === logs.length - 1) {
  console.error("usage: node e2e-seconds.mjs RUN default.log… -- wasm.log…");
  process.exit(2);
}

// `  ✓   12 [webassembly] › e2e/themes.spec.js:162:9 › in light › … (2.9s)`,
// passed (✓), failed (✘, an expected failure is listed so) or skipped (-).
const LINE = /[✓✘-]\s+\d+ \[([^\]]+)\] › e2e\/([^:]+):\d+:\d+ › (.*) \(([\d.]+)(ms|s|m)\)$/;
function seconds(amount, unit) {
  if (unit === "ms") return Number(amount) / 1000;
  if (unit === "s") return Number(amount);
  return Number(amount) * 60;
}

function read(files) {
  const found = new Map();
  for (const file of files) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const at = LINE.exec(line);
      if (!at) continue;
      const [, project, spec, titles, amount, unit] = at;
      found.set([project, spec, ...titles.split(" › ")].join(" "), seconds(amount, unit));
    }
  }
  return found;
}

const plain = read(logs.slice(0, split));
const wasm = read(logs.slice(split + 1));
const names = [...new Set([...plain.keys(), ...wasm.keys()])].sort();
const say = (value) => (value === undefined ? "" : String(Math.round(value * 1000) / 1000));
process.stdout.write(`# test\tdefault kernel (s)\twasm kernel (s)\tfrom run ${run}\n`);
for (const name of names) process.stdout.write(`${name}\t${say(plain.get(name))}\t${say(wasm.get(name))}\n`);

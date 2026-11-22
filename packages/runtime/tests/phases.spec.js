// What a test that runs out of time says of its parts (open.js `phase`),
// read from the report of tests that do (timeouts/stalls.js).
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const cli = createRequire(import.meta.url).resolve("@playwright/test/cli");
const config = join(import.meta.dirname, "timeouts/playwright.config.js");

function saidBy(title, output) {
  const args = [cli, "test", "-c", config, "--grep", title, "--reporter=json", "--output", output];
  const run = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 25_000 });
  expect(run.status, run.stderr || run.stdout).toBe(1);
  const report = JSON.parse(run.stdout);
  const result = report.suites[0].specs[0].tests[0].results[0];
  expect(result.status).toBe("timedOut");
  return result.errors.map(({ message }) => message).join("\n");
}

test("a part the test ran out of time in stays unfinished though teardown ends its wait", ({}, info) => {
  const said = saidBy("inside a part", info.outputPath("stalls"));
  expect(said).toContain('ran out of time in "waiting"');
  expect(said).toMatch(/waiting: unfinished after \d+ ms/);
  // The parts that ended before it keep their times, the failed one too.
  expect(said).toMatch(/done: \d+ ms/);
  expect(said).toMatch(/failed: \d+ ms/);
});

test("a test that ran out of time between its parts says it was in none", ({}, info) => {
  const said = saidBy("between parts", info.outputPath("stalls"));
  expect(said).toContain('ran out of time in "none of its parts"');
  expect(said).toMatch(/done: \d+ ms/);
});

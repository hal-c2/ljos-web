// A shared hook that runs out of time says where it was: no test's
// fixture runs around a `beforeAll`, and the report of its timeout names
// no part of it, so `shared` prints, before the time runs out, the part
// it is in, every server and what Node waits on.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const cli = join(createRequire(import.meta.url).resolve("@playwright/test/package.json"), "../cli.js");

test("a shared hook that stalls in a part says, before its time runs out, which part and what it waits on", () => {
  const ran = spawnSync(process.execPath, [cli, "test", "-c", join(import.meta.dirname, "fixtures/stalls")], { encoding: "utf8" });
  expect(ran.status, ran.stdout + ran.stderr).not.toBe(0);
  const said = ran.stdout + ran.stderr;
  expect(said).toContain("a shared hook: 2 s before its time runs out");
  expect(said).toContain("build the site and serve it: unfinished after");
  expect(said).toContain("serve it: ");
  expect(said).toContain("build the site: unfinished after");
  expect(said).toMatch(/server http:\/\/127\.0\.0\.1:\d+: 0 connection\(s\) open, no request in flight/);
  expect(said).toContain("Node waits on: ");
  expect(said).toMatch(/Node was kept from its event loop for up to \d+ ms at a time/);
});

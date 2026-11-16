// A shared hook that runs out of time says where it was: no test's
// fixture runs around a `beforeAll`, and the report of its timeout names
// no part of it, so `shared` prints, before the time runs out, the part
// it is in, every server and what Node waits on.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const cli = join(createRequire(import.meta.url).resolve("@playwright/test/package.json"), "../cli.js");

// Far past the fixture's few seconds, well inside this test's own time.
const DEADLINE = 60_000;

// The fixture's own run, in a process group of its own: a run that does
// not end by the deadline is ended with every worker it started, and
// says what it had printed by then.
function run(...args) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [cli, ...args], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let said = "";
    child.stdout.on("data", (chunk) => (said += chunk));
    child.stderr.on("data", (chunk) => (said += chunk));
    const late = setTimeout(() => {
      said += `\n[the run had not ended after ${DEADLINE} ms: ended with its process group]`;
      process.kill(-child.pid, "SIGKILL");
    }, DEADLINE);
    child.on("close", (status, signal) => {
      clearTimeout(late);
      done({ status, signal, said });
    });
  });
}

test("a shared hook that stalls in a part says, before its time runs out, which part and what it waits on", async () => {
  const { status, signal, said } = await run("test", "-c", join(import.meta.dirname, "fixtures/stalls"));
  expect(signal, said).toBeNull();
  expect(status, said).not.toBe(0);
  expect(said).toContain("a shared hook: 2 s before its time runs out");
  expect(said).toContain("build the site and serve it: unfinished after");
  expect(said).toContain("serve it: ");
  expect(said).toContain("build the site: unfinished after");
  expect(said).toMatch(/server http:\/\/127\.0\.0\.1:\d+: 0 connection\(s\) open, no request in flight/);
  expect(said).toContain("Node waits on: ");
  expect(said).toMatch(/Node was kept from its event loop for up to \d+ ms at a time/);
  // Each read 2 s before its own hook's time, not its tests': the
  // project's 4 s, and the 6 s a hook gave itself; before that hook's time
  // ran out, however late a busy machine rang the timer.
  expect(said).toMatch(/build the site and serve it: unfinished after (19|[23]\d)\d\d ms/);
  expect(said).toMatch(/wait for its own time: unfinished after (39|[45]\d)\d\d ms/);
});

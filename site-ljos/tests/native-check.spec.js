// features/native.feature: `mise run site:native --check` itself, run in
// node against a stand-in for ljos (fixtures/native-check/ljos.mjs), so
// what the check does with an inspector that leaves a request unanswered
// is seen without building ljos.
import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/native-check.mjs", import.meta.url));
const ljos = fileURLToPath(new URL("./fixtures/native-check/ljos.mjs", import.meta.url));

function check(drop) {
  const scratch = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ljos-native-check-"));
  const run = spawnSync(process.execPath, [script, ljos, scratch, scratch, scratch], {
    encoding: "utf8",
    timeout: 60_000,
    env: { ...process.env, NATIVE_FAKE_DROP: drop, LJOS_SITE_NATIVE_STEP_MS: "6000", LJOS_SITE_NATIVE_ASK_MS: "1000" },
  });
  return { status: run.status, out: run.stdout + run.stderr };
}

test("the check follows the site through to the search", () => {
  const { status, out } = check("");
  expect(out).toContain("site:native: the search finds pages");
  expect(status, out).toBe(0);
});

test("a request the inspector leaves unanswered is told and asked again within its step", () => {
  const { status, out } = check(`app_find text=Software you can reshape`);
  expect(out).toMatch(/site:native: the inspector left app_find unanswered for 1000 ms while waiting for front page; asking again/);
  expect(out).toContain("site:native: the search finds pages");
  expect(status, out).toBe(0);
});

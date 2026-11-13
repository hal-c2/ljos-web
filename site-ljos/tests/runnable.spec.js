// No QML example on the Ljós site is plain code unless the docs'
// ledger of plain examples says so, and why: the same ledger the
// Astro reference is held to (site/scripts/codeblocks-ledger.mjs), so
// both sites run the same examples. The report is the build's own.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { readLedger, unmarked } from "../../site/scripts/codeblocks-ledger.mjs";

const report = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), ".codeblock-prerenders/report.json");

test("every QML example runs, or the ledger says why it does not", () => {
  expect(existsSync(report), "the build writes its report").toBe(true);
  const records = JSON.parse(readFileSync(report, "utf8"));
  expect(records.length).toBeGreaterThan(100);
  expect(unmarked(records, readLedger())).toEqual([]);
});

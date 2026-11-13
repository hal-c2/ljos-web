// No QML example on the site is plain code unless the docs' ledger of
// plain examples says so, and why (scripts/codeblocks-ledger.mjs). The
// report is what codeblock-prerenders.mjs found, the step whose
// manifest the build embeds.
import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { readLedger, unmarked } from "../scripts/codeblocks-ledger.mjs";

const REPORT = ".codeblock-prerenders/report.json";

test("every QML example runs, or the ledger says why it does not", () => {
  expect(existsSync(REPORT), `${REPORT}: run codeblock-prerenders first`).toBe(true);
  const records = JSON.parse(readFileSync(REPORT, "utf8"));
  expect(records.length).toBeGreaterThan(100);
  expect(unmarked(records, readLedger())).toEqual([]);
});

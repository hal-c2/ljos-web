// No QML example on the Ljós site is plain code unless the docs'
// ledger of plain examples says so, and why: the same ledger the
// Astro reference is held to (site/scripts/codeblocks-ledger.mjs), so
// both sites run the same examples. The report is the build's own.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { liveOutcome, madeNews, pageRecords, readLedger, unmarked } from "../../site/scripts/codeblocks-ledger.mjs";

const report = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), ".codeblock-prerenders/report.json");

test("every QML example runs, or the ledger says why it does not", () => {
  expect(existsSync(report), "the build writes its report").toBe(true);
  const records = JSON.parse(readFileSync(report, "utf8"));
  expect(records.length).toBeGreaterThan(100);
  expect(unmarked(records, readLedger())).toEqual([]);
});

// An example whose light render ran and whose dark one refused stays
// live, drawn light in the dark, and its record says what the dark
// said; one that claims to run is answered for, as a warning would be.
test("a refusal only in the dark is in the record, and fails only an example that claims to run", () => {
  const made = { file: "0123456789abcdef.html", darkFailed: ["Main.qml:1: in the dark scheme: no side in the dark"], logged: ["hello"] };
  expect(madeNews(made, { claimed: false })).toEqual(["said as it was made: hello"]);
  expect(madeNews(made, { claimed: false, logs: true })).toEqual([]);
  expect(madeNews(made, { claimed: true, logs: true })).toEqual(made.darkFailed);
  expect(madeNews({ failed: true, diagnostics: ["x"] }, { claimed: true }), "a failure is answered where it was made").toEqual([]);
  const example = { blocks: [{ line: 3 }] };
  const [record] = pageRecords("page.md", [{ line: 3 }], [example], () => liveOutcome(made), () => false);
  expect(record).toMatchObject({ state: "live", diagnostics: made.darkFailed, logged: ["hello"] });
});

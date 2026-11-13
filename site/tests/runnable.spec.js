// No QML example on the site is plain code unless the docs' ledger of
// plain examples says so, and why (scripts/codeblocks-ledger.mjs). The
// report is what codeblock-prerenders.mjs found, the step whose
// manifest the build embeds.
import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { exampleKeys, listedEverywhere, readLedger, unmarked } from "../scripts/codeblocks-ledger.mjs";

const REPORT = ".codeblock-prerenders/report.json";

test("every QML example runs, or the ledger says why it does not", () => {
  expect(existsSync(REPORT), `${REPORT}: run codeblock-prerenders first`).toBe(true);
  const records = JSON.parse(readFileSync(REPORT, "utf8"));
  expect(records.length).toBeGreaterThan(100);
  expect(unmarked(records, readLedger())).toEqual([]);
});

// A build stops on an example that claims to run and does not, unless
// the ledger lists it everywhere it stands: then it is plain, and the
// test above holds the report to the list.
test.describe("an example the ledger lists may stand plain", () => {
  const fences = [
    { lang: "markdown" },
    { lang: "qml", group: "a" },
    { lang: "qml", group: "a" },
    { lang: "qml" },
  ];
  const examples = [{ blocks: [fences[1], fences[2]] }, { blocks: [fences[3]] }];
  const ledger = readLedger("language/controllers.md 1 web:ts-controller a TS Controller\n");

  test("is named as ljos-ui's docs check names it", () => {
    expect(exampleKeys("language/controllers.md", fences, examples).map(({ key }) => key)).toEqual([
      "language/controllers.md 1",
      "language/controllers.md 3",
    ]);
  });

  test("when every page that shows it lists it", () => {
    expect(listedEverywhere(["language/controllers.md 1"], ledger)).toBe(true);
    expect(listedEverywhere(["language/controllers.md 1", "start/index.md 2"], ledger)).toBe(false);
    expect(listedEverywhere(["language/controllers.md 3"], ledger)).toBe(false);
    expect(listedEverywhere([], ledger)).toBe(false);
  });
});

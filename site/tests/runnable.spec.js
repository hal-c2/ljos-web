// No QML example on the site is plain code unless the docs' ledger of
// plain examples says so, and why (scripts/codeblocks-ledger.mjs). The
// report is what codeblock-prerenders.mjs found, the step whose
// manifest the build embeds.
import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { hashExample } from "ljos-web/codeblocks";
import { assemble, parseMeta } from "ljos-web/codeblocks/parse";
import { liveCodeBlocks } from "ljos-web/codeblocks/remark";
import { holdPlain } from "../scripts/codeblocks-held.mjs";
import { exampleKeys, keysByHash, listedEverywhere, readLedger, unmarked } from "../scripts/codeblocks-ledger.mjs";

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

  // docs_site.rs names a group by its root, the `qml` fence with no
  // `file=`, however many of the group's files the page shows first.
  test("a group by its root, even after its other files", () => {
    const fences = [{ lang: "qml", file: "Badge.qml", group: "b" }, { lang: "qml", group: "b" }, { lang: "qml" }];
    const examples = [{ blocks: [fences[0], fences[1]] }, { blocks: [fences[2]] }];
    expect(exampleKeys("controls/overview.md", fences, examples).map(({ key }) => key)).toEqual([
      "controls/overview.md 2",
      "controls/overview.md 3",
    ]);
  });

  test("when every page that shows it lists it", () => {
    expect(listedEverywhere(["language/controllers.md 1"], ledger)).toBe(true);
    expect(listedEverywhere(["language/controllers.md 1", "start/index.md 2"], ledger)).toBe(false);
    expect(listedEverywhere(["language/controllers.md 3"], ledger)).toBe(false);
    expect(listedEverywhere([], ledger)).toBe(false);
  });

  // A build makes an example once however many pages show it, and is
  // told of it once: every place it stands is its, whichever copy it
  // was told of.
  test("on two pages by its names on both, whichever page's copy is asked of", () => {
    const one = [{ lang: "qml", code: "Item {}" }];
    const two = [{ lang: "markdown" }, { lang: "qml", code: "Item {}" }];
    const pages = [
      { page: "language/controllers.md", fences: one, examples: [{ blocks: [one[0]] }] },
      { page: "start/index.md", fences: two, examples: [{ blocks: [two[1]] }] },
    ];
    const hash = (example) => example.blocks.map((block) => block.code).join("\n");
    const keys = keysByHash(pages, hash);
    expect([...keys]).toEqual([["Item {}", ["language/controllers.md 1", "start/index.md 1"]]]);
    for (const { examples } of pages) expect(listedEverywhere(keys.get(hash(examples[0])), ledger)).toBe(false);
  });
});

// The Markdown step holds every claimed example to running, as the
// prerender step does; an example that step let stand plain because
// the ledger lists it stays plain code here too, and nothing else does.
test.describe("the page build keeps a listed example plain", () => {
  const fence = (id) => ({ type: "code", lang: "qml", meta: "file=Main.qml", value: `import QtQuick\nItem { id: ${id} }` });
  const hashOf = (node) => hashExample(assemble([{ ...parseMeta(node.lang, node.meta), code: node.value }]).examples[0]);
  const page = () => ({ type: "root", children: [fence("listed"), { type: "paragraph", children: [] }, fence("other")] });
  const failed = (...nodes) =>
    Object.fromEntries(nodes.map((node) => [hashOf(node), { failed: true, diagnostics: ["Main.qml: no such type"] }]));

  test("and counts it among the plain blocks", () => {
    const tree = page();
    const [listed, , other] = tree.children;
    let plain = 0;
    const run = holdPlain(liveCodeBlocks, new Set([hashOf(listed)]));
    run({ prerenders: failed(listed), onLegacy: (count) => (plain += count) })(tree, { path: "a.md" });
    expect(tree.children[0]).toBe(listed);
    expect(tree.children[2]).not.toBe(other);
    expect(tree.children[2].type).toBe("html");
    expect(plain).toBe(1);
  });

  test("while another claimed example that does not run still stops it", () => {
    const tree = page();
    const [listed, , other] = tree.children;
    const run = holdPlain(liveCodeBlocks, new Set([hashOf(listed)]));
    expect(() => run({ prerenders: failed(listed, other) })(tree, { path: "a.md" })).toThrow(/a code block does not run/);
  });
});

// The site's own sources: every demo, page and script the site ships reads
// without a single error node, so nothing on it highlights as broken.
import { globSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { parserFor } from "../src/index.js";

const root = new URL("../../../", import.meta.url).pathname;
const files = globSync(
  ["site-ljos/bundle/**/*.{qml,js,lts}", "site/src/**/*.{qml,lts}", "examples/*/src/**/*.{qml,lts}"],
  { cwd: root },
).sort();

test("the site has demos to read", () => assert.ok(files.length > 20, files.join("\n")));

for (const file of files) {
  test(file, () => {
    const code = readFileSync(root + file, "utf8");
    const errors = [];
    parserFor(file).parse(code).iterate({
      enter(n) {
        if (n.type.isError) errors.push(`${code.slice(0, n.from).split("\n").length}: ${code.slice(n.from, n.from + 40)}`);
      },
    });
    assert.deepEqual(errors, []);
  });
}

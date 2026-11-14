// The committed parser is what the grammar builds: `pnpm build` was run.
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildParserFile } from "@lezer/generator";

const src = new URL("../src/", import.meta.url);

test("src/parser.js is generated from src/ljos.grammar", () => {
  const built = buildParserFile(readFileSync(new URL("ljos.grammar", src), "utf8"), {
    fileName: "ljos.grammar",
    moduleStyle: "es",
  });
  assert.equal(readFileSync(new URL("parser.js", src), "utf8"), built.parser, "run `pnpm --filter lezer-ljos build`");
  assert.equal(readFileSync(new URL("parser.terms.js", src), "utf8"), built.terms);
});

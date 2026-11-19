// Every `.txt` here is a Lezer test file: code, `==>`, the tree it parses to.
// Each test names its top rule and dialect in the JSON after its title.
import { readdirSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileTests } from "@lezer/generator/test";
import { parser } from "../src/index.ts";

const dir = new URL(".", import.meta.url);

for (const file of readdirSync(dir).filter((f) => f.endsWith(".txt"))) {
  describe(file, () => {
    for (const { name, run } of fileTests(readFileSync(new URL(file, dir), "utf8"), file)) {
      it(name, () => run(parser));
    }
  });
}

// A .pragma or .import line ends at any newline JavaScript knows, not
// only LF: the statement after it keeps its own tree.
describe("resource header lines, comments and hashbangs", () => {
  for (const [name, nl] of [["CR", "\r"], ["CRLF", "\r\n"], ["U+2028", " "], ["U+2029", " "]]) {
    it(`end at ${name}`, () => {
      const script = parser.configure({ top: "Script" });
      const tree = script.parse(`.pragma library${nl}.import "live.js" as Live${nl}var made = Live`);
      assert.equal(tree.toString(), "Script(Pragma,ResourceImport,VariableDeclaration(var,VariableDefinition,Equals,VariableName))");
    });
    it(`and so does a line comment between them, at ${name}`, () => {
      const script = parser.configure({ top: "Script" });
      const tree = script.parse(`.pragma library${nl}// note${nl}.import "live.js" as Live${nl}var made = Live`);
      assert.equal(tree.toString(), "Script(Pragma,LineComment,ResourceImport,VariableDeclaration(var,VariableDefinition,Equals,VariableName))");
    });
    it(`and a hashbang, at ${name}`, () => {
      const script = parser.configure({ top: "Script" });
      const tree = script.parse(`#!/usr/bin/env node${nl}var made = 1`);
      assert.equal(tree.toString(), "Script(Hashbang,VariableDeclaration(var,VariableDefinition,Equals,Number))");
    });
  }
});

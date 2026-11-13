// Every `.txt` here is a Lezer test file: code, `==>`, the tree it parses to.
// Each test names its top rule and dialect in the JSON after its title.
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileTests } from "@lezer/generator/test";
import { parser } from "../src/index.js";

const dir = new URL(".", import.meta.url);

for (const file of readdirSync(dir).filter((f) => f.endsWith(".txt"))) {
  describe(file, () => {
    for (const { name, run } of fileTests(readFileSync(new URL(file, dir), "utf8"), file)) {
      it(name, () => run(parser));
    }
  });
}

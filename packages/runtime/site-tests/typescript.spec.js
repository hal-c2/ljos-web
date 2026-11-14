import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { parseAst } from "vite";
import { exported } from "../vite.js";

const root = join(import.meta.dirname, "..", "..", "..");

// The directories `pnpm-workspace.yaml` names as packages: each `dir/*` is
// the directories in `dir`, and any other entry is a directory itself.
function workspace() {
  const yaml = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
  const list = /^packages:\n((?:[ \t]+-.*\n?)+)/m.exec(yaml)?.[1] ?? "";
  return list
    .split("\n")
    .map((line) => line.replace(/^\s*-\s*/, "").replace(/^["']|["']$/g, "").trim())
    .filter(Boolean)
    .flatMap((glob) => {
      if (!glob.endsWith("/*")) return [join(root, glob)];
      const parent = join(root, glob.slice(0, -2));
      if (!existsSync(parent)) return [];
      return readdirSync(parent, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(parent, entry.name));
    });
}

// Each package that runs `tsc` pins its own TypeScript (a root pin would
// also be the one Astro's site resolves its own peer to). They are one
// version, so no two packages are checked by different compilers.
test("every package of the workspace that typechecks pins the same TypeScript and @types/node, exactly", () => {
  const pins = workspace()
    .map((directory) => {
      try {
        return JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
      } catch {
        return null;
      }
    })
    .filter((manifest) => manifest?.scripts?.typecheck)
    .map((manifest) => ({
      name: manifest.name,
      typescript: manifest.devDependencies?.typescript,
      node: manifest.devDependencies?.["@types/node"],
    }));
  expect(pins.length).toBeGreaterThan(0);
  for (const pin of pins) {
    expect(pin.typescript, pin.name).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pin.node, pin.name).toMatch(/^\d+\.\d+\.\d+$/);
  }
  const [first] = pins;
  for (const pin of pins) expect({ ...pin, name: first.name }).toEqual(first);
});

// What a namespace re-exports of its native module are the module's values:
// a name only a type has would be an import the browser cannot find.
test("a ported module's exports are its values, not its types", () => {
  const context = { addWatchFile() {}, parse: (code, options) => parseAst(code, options) };
  const names = exported(context, join(import.meta.dirname, "fixtures", "exported", "index.ts"));
  expect([...names].sort()).toEqual(["More", "Value", "make", "value"]);
});

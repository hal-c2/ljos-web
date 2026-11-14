import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const packages = join(import.meta.dirname, "..", "..");

// Each package that runs `tsc` pins its own TypeScript (a root pin would
// also be the one Astro's site resolves its own peer to). They are one
// version, so no two packages are checked by different compilers.
test("every package that typechecks pins the same TypeScript and @types/node, exactly", () => {
  const pins = readdirSync(packages, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      try {
        return JSON.parse(readFileSync(join(packages, entry.name, "package.json"), "utf8"));
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

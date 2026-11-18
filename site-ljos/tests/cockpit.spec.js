// The cockpit demo's files are ljos-ui's examples/car-cockpit as one
// commit has them (bundle/Demos/Cockpit/UPSTREAM.json): a change made
// to the copy here, not brought over by scripts/sync-cockpit.mjs, is a
// copy that drifted from the app it says it is.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "@playwright/test";
import { sha256, shipped, target } from "../scripts/sync-cockpit.mjs";

const upstream = JSON.parse(readFileSync(join(target, "UPSTREAM.json"), "utf8"));
const walk = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(directory, entry.name)) : [relative(target, join(directory, entry.name))]));

test("the cockpit's files are those of the ljos-ui commit they name", () => {
  expect(upstream.commit).toMatch(/^[0-9a-f]{40}$/);
  const changed = Object.entries(upstream.files).filter(([path, hash]) => !existsSync(join(target, path)) || sha256(readFileSync(join(target, path))) !== hash);
  expect(changed.map(([path]) => path), "edit ljos-ui's example and run scripts/sync-cockpit.mjs").toEqual([]);
});

test("the copy holds what the app runs on and nothing else", () => {
  const here = walk(target).filter((path) => path !== "UPSTREAM.json").sort();
  expect(here).toEqual(Object.keys(upstream.files).sort());
  expect(here.every(shipped)).toBe(true);
  expect(here).toContain("Main.qml");
  expect(here.filter((path) => path.endsWith(".glb")).length).toBeGreaterThan(0);
});

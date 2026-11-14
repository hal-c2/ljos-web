// What ljos-web says of its files to a bundler (`sideEffects` in its
// package.json): a file left off the list is kept only for what a page
// uses of it. A file that is imported for what it does, not for what it
// exports (`import "./style.js"`), and the file that imports it so,
// are on it; else a bundler drops them both and the page goes without.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test as plain } from "@playwright/test";
import { modules } from "../compiler/modules.js";

const root = join(import.meta.dirname, "..");
const { sideEffects } = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
);
const SKIPPED = new Set(["node_modules", "tests", "site-tests", "size", "bin"]);

// The globs as a bundler reads them: `**/` any directories, `*` within one.
const listed = sideEffects.map((glob) => {
  const pattern = glob
    .replace(/^\.\//, "")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, "(?:.*/)?");
  return new RegExp(`^${pattern}$`);
});
const has = (file) => listed.some((pattern) => pattern.test(file));

function scripts(dir = root, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIPPED.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) scripts(path, found);
    else if (/\.[jt]s$/.test(entry.name) && !entry.name.endsWith(".d.ts"))
      found.push(relative(root, path));
  }
  return found;
}

plain(
  "a file imported for what it does is listed, with the file that imports it",
  () => {
    const missing = [];
    for (const file of scripts()) {
      const text = readFileSync(join(root, file), "utf8");
      for (const [, spec] of text.matchAll(
        /^import\s+["'](\.[^"']+)["'];?$/gm,
      )) {
        const target = relative(root, join(root, file, "..", spec));
        if (!has(file)) missing.push(`${file} (imports ${spec})`);
        if (!has(target)) missing.push(target);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  },
);

// The compiler's table takes each namespace through a module of its own,
// so a namespace a page also imports is not kept whole in its first chunk.
plain(
  "each module the compiler hands compiled QML is the namespace it names",
  async () => {
    for (const [name, load] of Object.entries(modules)) {
      if (name === "solid-js") continue;
      const rest = name.replace(/^ljos-web\//, "");
      expect(
        readFileSync(join(root, "compiler/whole", `${rest}.js`), "utf8"),
        name,
      ).toBe(`export * from "${name}";\n`);
      expect(load.toString(), name).toContain(`./whole/${rest}.js`);
    }
  },
);

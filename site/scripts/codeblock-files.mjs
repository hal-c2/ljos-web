// The files a docs example reads and its page does not show: the shell
// a ShellLoader loads, the SVG a VectorImage draws, the JSON a model
// reads. Each stands under site/codeblock-files/<page>/<n>/, named as
// the ledger names its example (`<page> <n>`, codeblocks-ledger.mjs),
// and is given to that example (`given`, parse.js's `exampleFiles`):
// it is checked, prerendered and run in the page with them, as it
// would be beside them on disk. A file the page shows is the page's.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exampleKeys } from "./codeblocks-ledger.mjs";

export const GIVEN = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "codeblock-files");

/**
 * Every `<page> <n>` there are files for, each with its files by name.
 * None for docs other than the pinned ones the ledger is of
 * (`LJOS_CODEBLOCKS_LEDGER=none`, as the fixture build says).
 */
export function readGiven(dir = GIVEN, env = process.env) {
  const given = new Map();
  if (env.LJOS_CODEBLOCKS_LEDGER === "none" || !existsSync(dir)) return given;
  const walk = (at) => {
    const names = readdirSync(join(dir, at));
    if (/^\d+$/.test(at.split("/").pop()) && at.includes(".md/")) {
      const files = {};
      for (const name of names) files[name] = readFileSync(join(dir, at, name), "utf8");
      given.set(`${at.replace(/\/(\d+)$/, " $1")}`, files);
      return;
    }
    for (const name of names) if (statSync(join(dir, at, name)).isDirectory()) walk(at ? `${at}/${name}` : name);
  };
  walk("");
  return given;
}

/**
 * Gives each of a page's examples its files, and answers the keys it
 * gave to: files for an example that is not there (the page changed)
 * are for whoever reads `unused` to say.
 */
export function giveFiles(page, fences, examples, given) {
  const gave = [];
  for (const { example, key } of exampleKeys(page, fences, examples)) {
    const files = given.get(key);
    if (!files) continue;
    example.given = files;
    gave.push(key);
  }
  return gave;
}

/** What `readGiven` has that no example took, as problems to tell. */
export function unused(given, gave) {
  const took = new Set(gave);
  return [...given.keys()].filter((key) => !took.has(key)).map((key) => `site/codeblock-files: ${key} is no example's now; move or remove its files`);
}

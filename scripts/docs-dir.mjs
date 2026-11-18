// Where ljos-ui's docs/site is, for both sites' builds: LJOS_DOCS_DIR and
// nothing else. Every task exports it (`mise run site:docs` fetches the
// pinned revision, or prints a checkout the caller named), and CI sets it
// the same way. A guessed sibling checkout would build whatever revision
// it happens to be at, not the one site/ljos-ui.sha pins.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

/** The docs directory as `{ dir }`, or `{ problem }` saying what to set. */
export function findDocsDir() {
  const given = process.env.LJOS_DOCS_DIR;
  if (!given) {
    return { problem: "LJOS_DOCS_DIR is not set. Set it to a ljos-ui docs/site, or run it through mise run site or mise run site:test, which fetch the pinned docs and set it." };
  }
  const dir = resolve(given);
  if (!existsSync(join(dir, "start/index.md"))) return { problem: `LJOS_DOCS_DIR=${given} is not ljos-ui's docs/site (no start/index.md in it).` };
  return { dir };
}

/** The docs directory, or exits with what to set when there is none. */
export function docsDir(who) {
  const { dir, problem } = findDocsDir();
  if (problem) {
    console.error(`${who}: ${problem}`);
    process.exit(1);
  }
  return dir;
}

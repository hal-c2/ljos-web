// Builds the site from the fixture docs (tests/fixtures/docs) into
// dist-fixture/: sync, pictures (the run check), and a real Astro
// build, so the tests see the remark step, the pictures and hydration
// together, as a reader does. This replaces src/content/docs with the
// fixture's pages (they are gitignored copies); the next normal build
// syncs the pinned docs back. Run this suite after the ordinary one.
// The ledger and site/codeblock-files are the pinned docs' and name
// none of the fixture's blocks (LJOS_CODEBLOCKS_LEDGER=none): strict,
// every block here runs or the build stops.
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env, LJOS_DOCS_DIR: join(site, "tests/fixtures/docs"), LJOS_CODEBLOCKS_STRICT: "1", LJOS_CODEBLOCKS_LEDGER: "none" };
for (const command of [
  "node scripts/sync-docs.mjs",
  "node scripts/codeblock-prerenders.mjs",
  "pnpm exec astro build --outDir dist-fixture",
]) {
  execSync(command, { cwd: site, env, stdio: "inherit" });
}

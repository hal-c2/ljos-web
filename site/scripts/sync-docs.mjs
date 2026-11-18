// DECISION: docs come from a pinned ljos-ui checkout, not a git submodule.
// A submodule would pin every ljos-web clone to ljos-ui's tree and make
// docs fixes a two-repo dance; instead CI checks out hal-c2/ljos-ui at
// the SHA in site/ljos-ui.sha and sets LJOS_DOCS_DIR, as the mise
// tasks do locally (scripts/docs-dir.mjs). Bumping docs is then a
// one-line SHA change, reviewable on its own.
// Pages are copied (never symlinked, so Astro's watcher and CI behave
// the same) into src/content/docs/ at build time; the copies are
// gitignored. The source pages are never edited here.
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { docsDir } from "../../scripts/docs-dir.mjs";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = docsDir("sync-docs");
const destRoot = join(siteRoot, "src/content/docs");
const SECTIONS = ["start", "ui", "controls", "data", "language", "quality", "rust"];
let count = 0;
for (const section of SECTIONS) {
  const from = join(src, section);
  const to = join(destRoot, section);
  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  for (const file of readdirSync(from).filter((f) => f.endsWith(".md"))) {
    let text = readFileSync(join(from, file), "utf8");
    // Front matter: title/description pass through; order becomes
    // Starlight's sidebar order; section is ours, so it is dropped.
    text = text.replace(/^---\n([\s\S]*?)\n---/, (_m, fm) => {
      const order = /^order:\s*(\d+)/m.exec(fm)?.[1];
      const kept = fm.split("\n").filter((l) => !/^(section|order):/.test(l)).join("\n");
      return `---\n${kept}${order ? `\nsidebar:\n  order: ${order}` : ""}\n---`;
    });
    // Starlight renders the front-matter title as the page <h1>; the
    // body's own leading "# Title" would duplicate it, so it goes.
    // (Upstream fix reported: drop the body H1s in docs/site.)
    text = text.replace(/^(---\n[\s\S]*?\n---\n)\n?# [^\n]*\n/, "$1");
    // Links: file-relative .md links become Starlight routes.
    text = text.replace(/\]\((\.?\.?\/?)([\w./-]*?)([\w-]+)\.md(#[^)]*)?\)/g, (_m, _dots, dir, slug, hash = "") => {
      const targetSection = dir.replace(/^\.\.\//, "").replace(/\/$/, "") || section;
      const route = slug === "index" ? `/${targetSection}/` : `/${targetSection}/${slug}/`;
      return `](${route}${hash})`;
    });
    writeFileSync(join(to, file), text);
    count++;
  }
}
console.log(`sync-docs: ${count} pages from ${src}`);

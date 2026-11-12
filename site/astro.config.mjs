import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import { loadHarnesses, loadPrerenders } from "ljos-web/codeblocks";
import { liveCodeBlocks } from "ljos-web/codeblocks/remark";
import qml from "ljos-web/vite";

const path = (r) => fileURLToPath(new URL(r, import.meta.url));

// Live code blocks: harnesses and prerenders come from the checkout
// sync-docs reads (the same candidates it tries), and the prerenders
// scripts/codeblock-prerenders.mjs writes. DECISION: strict —
// every non-exempt block must compile or the build fails — is a switch
// (LJOS_CODEBLOCKS_STRICT=1), not inferred from the docs: a docs pin
// that carries harnesses must not by itself start failing this build
// on examples whose dialect this compiler cannot run yet. Until it is
// switched on, a block that claims to run must compile, and one that
// does not claim to stays plain and is counted, so the site never
// promises a block is live when it is not.
const docsCandidates = [
  process.env.LJOS_DOCS_DIR,
  resolve(path("."), "../ljos-ui/docs/site"),
  resolve(path("."), "../../ljos-ui/docs/site"),
  join(homedir(), "dev/ljos-ui/docs/site"),
].filter(Boolean);
const docsDir = docsCandidates.find((c) => existsSync(join(c, "start/index.md")));
const harnessDir = docsDir ? join(docsDir, "harness") : undefined;
const prerendersAt = path(".codeblock-prerenders");
let legacyBlocks = 0;

const SITE = "https://ljos.dev";

export default defineConfig({
  // DECISION: `site:` names the canonical origin so sitemap, canonical
  // and OG URLs are absolute and link previews work. This does not
  // point the domain anywhere: there is still no CNAME and no deploy
  // (Pages runs only on manual dispatch) until the user says so.
  site: SITE,
  integrations: [
    starlight({
      title: "Ljós",
      description: "Ljós is a Rust UI toolkit for malleable software. Declarative interfaces, typed TypeScript, and running apps you can observe, drive and reshape.",
      logo: {
        src: "./src/assets/ljos.svg",
        alt: "Ljós",
        replacesTitle: true,
      },
      head: [
        { tag: "link", attrs: { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" } },
        { tag: "meta", attrs: { property: "og:image", content: new URL("/og-image.png", SITE).href } },
        { tag: "meta", attrs: { property: "og:type", content: "website" } },
        { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
        { tag: "meta", attrs: { name: "twitter:image", content: new URL("/og-image.png", SITE).href } },
      ],
      components: { Head: "./src/components/Head.astro" },
      customCss: ["./src/styles/site.css"],
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/hal-c2/ljos-ui" }],
      sidebar: [
        { label: "Start", autogenerate: { directory: "start" } },
        { label: "User interface", autogenerate: { directory: "ui" } },
        { label: "Controls", autogenerate: { directory: "controls" } },
        { label: "Data and input", autogenerate: { directory: "data" } },
        { label: "Language", autogenerate: { directory: "language" } },
        { label: "Quality", autogenerate: { directory: "quality" } },
        { label: "Rust", autogenerate: { directory: "rust" } },
        { label: "Showcase", link: "/demos/" },
      ],
    }),
  ],
  markdown: {
    remarkPlugins: [
      [
        liveCodeBlocks,
        {
          harnesses: loadHarnesses(harnessDir),
          qmlc: process.env.QMLC ?? path("../target/debug/qmlc"),
          strict: process.env.LJOS_CODEBLOCKS_STRICT === "1",
          prerenders: loadPrerenders(prerendersAt),
          onLegacy: (count, file) => {
            legacyBlocks += count;
            console.warn(`codeblocks: ${count} untagged block(s) left plain in ${file?.path ?? "a page"} (${legacyBlocks} so far)`);
          },
        },
      ],
    ],
  },
  vite: {
    // Ljós's own control styles (docs/LJOS_WEB.md A20) and no installed
    // Qt: a live block's page bundles the modules the in-page compiler
    // may link, controls among them, and which QML they are — and
    // whether a style Ljós has none of is stubbed or taken from a Qt
    // that happens to be installed — must not depend on the building
    // machine. The site builds as it builds in CI, where there is none.
    plugins: [
      qml({
        qmlc: process.env.QMLC ?? path("../target/debug/qmlc"),
        styles: "ljos",
        qt: [],
        // Only the Pantry flagship takes a visitor's shell (A9):
        // its entry carries the block contracts it is compiled
        // against, and no other demo pays for any of it.
        liveShell: (file) => (file.endsWith("/demos/pantry/Shell.qml") ? { site: "pantry-demo" } : false),
        // The Pantry is its own little project: its `Pantry`
        // module is the qmldir under it, found from its root.
        root: (file) => (file.includes("/demos/pantry/") ? path("src/demos/pantry") : undefined),
      }),
    ],
    resolve: {
      dedupe: ["solid-js", "@solidjs/web", "ljos-web"],
      // `LJOS_KERNEL=wasm` builds the same site over Ljós's own
      // reactive graph instead of Solid's, as the runtime's specs
      // run on both kernels; needs `mise run build:kernel` first.
      conditions: process.env.LJOS_KERNEL === "wasm" ? ["ljos-wasm-kernel"] : [],
    },
  },
});

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import { loadHarnesses, loadPrerenders, prerenderStamp, siteFiles } from "ljos-web/codeblocks";
import { liveCodeBlocks } from "ljos-web/codeblocks/remark";
import qml, { kernelConditions } from "ljos-web/vite";
import { giveFiles, readGiven } from "./scripts/codeblock-files.mjs";
import { holdPlain, readHeld } from "./scripts/codeblocks-held.mjs";

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
// The pinned docs' prerenders, or another docs' kept apart
// (LJOS_CODEBLOCK_PRERENDERS, tests/build-fixture.mjs): a directory
// holds one docs' examples, and drops the rest.
// Resolved as the writer resolves it (codeblock-prerenders.mjs): an
// absolute path is itself, a relative one is under the site.
const prerendersAt = resolve(path("."), process.env.LJOS_CODEBLOCK_PRERENDERS ?? ".codeblock-prerenders");
const qmlc = process.env.QMLC ?? path("../target/debug/qmlc");
// Only what this build would make itself: a prerender, or a failure,
// made under another stamp (another kernel or 3D renderer, an older
// compiler or runtime) is not embedded, and its block is compiled
// here and shown unrendered, as with no prerender at all. The stamp is
// the one codeblock-prerenders gives under the same environment, so
// that step is run with the build's (VITE_LJOS_VIEW3D, LJOS_KERNEL).
const stamp = prerenderStamp({ qmlc });
const loaded = Object.entries(loadPrerenders(prerendersAt));
const prerenders = Object.fromEntries(loaded.filter(([, had]) => had.stamp === stamp));
const otherwise = loaded.length - Object.keys(prerenders).length;
const leftOut = `codeblocks: ${otherwise} prerender(s) in ${prerendersAt} were made for another build and are left out; run codeblock-prerenders with this build's environment to embed them`;
// A build that is to embed them (the one published) stops rather than
// ship every block unrendered when its environment and the prerender
// step's drift apart; one that expects none (the wasm kernel's) leaves
// LJOS_PRERENDERS_REQUIRED unset.
if (process.env.LJOS_PRERENDERS_REQUIRED === "1") {
  if (otherwise > 0) throw new Error(leftOut);
  if (Object.keys(prerenders).length === 0) throw new Error(`codeblocks: no prerender in ${prerendersAt}; run codeblock-prerenders before this build`);
} else if (otherwise > 0) console.warn(leftOut);
let legacyBlocks = 0;
const given = readGiven();
const docsAt = path("src/content/docs");

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
        // What codeblock-prerenders let stand plain by the ledger's
        // word stays plain here too, rather than stopping the page.
        holdPlain(liveCodeBlocks, readHeld(prerendersAt)),
        {
          harnesses: loadHarnesses(harnessDir),
          files: siteFiles(docsDir ? join(docsDir, "files") : undefined),
          qmlc,
          strict: process.env.LJOS_CODEBLOCKS_STRICT === "1",
          prerenders,
          // The files an example reads and its page does not show, as
          // codeblock-prerenders gave them, so its hash and its page's
          // live project are the prerender's.
          examples: (examples, { file, blocks }) => file?.path && giveFiles(relative(docsAt, file.path), blocks, examples, given),
          onLegacy: (count, file) => {
            legacyBlocks += count;
            console.warn(`codeblocks: ${count} block(s) left plain, untagged or listed in the ledger, in ${file?.path ?? "a page"} (${legacyBlocks} so far)`);
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
      // Conditions given here replace the browser's own, so they are
      // named again (Vite's defaultClientConditions, as the runtime's
      // test configs spread them): without `browser` a package with a
      // build for each, as sql.js has, is bundled for Node.
      conditions: [...kernelConditions(), "module", "browser", "development|production"],
    },
  },
});

# ljos.dev as Ljós pages

The same site as `site/` (Astro + Starlight), built instead as
prerendered Ljós pages with ljos-web's own site builder
(docs/LJOS_WEB.md A12, A26, A27, A28). The Astro site stays and
keeps deploying; this stands beside it until it reaches parity,
and nothing here is served or deployed yet.

- `bundle/` — the shell and pages as QML: header, sidebar,
  content, an "On this page" contents list, footer; the landing
  page; the demos page; a docs page that shows Markdown blocks.
  Every fence goes through the one code-block face
  (`Site/CodeBlock.qml`): live where the build ran it — an editor
  beside its running result, edits recompiled in the page with
  state kept, a picture of the result standing in the prerendered
  HTML — and highlighted static code where it did not.
- `scripts/build.mjs` — reads the docs of the pinned ljos-ui
  revision (`../site/ljos-ui.sha`, found as the Astro build's
  sync-docs finds them: `LJOS_DOCS_DIR` or a sibling checkout)
  with `ljos-web/markdown`, assembles and checks their examples
  and draws each live one's picture (`ljos-web/codeblocks`,
  cached under `.codeblock-prerenders/`), writes the reading into
  the bundle as `Site/Content.qml` (generated, gitignored), and
  builds every route prerendered into `dist/`.
- `tests/` — the landing page's word, a docs page read with
  JavaScript off, navigation and light/dark with it on, and
  parity: the built routes are the docs' routes (and the Astro
  build's, where it stands), each page's HTML carries its title
  and headings, and every internal link resolves.

Build and read it:

```sh
cargo build --bin qmlc          # or point QMLC at a qmlc
pnpm install
LJOS_DOCS_DIR=/path/to/ljos-ui/docs/site pnpm --filter ljos-site-ljos build
pnpm --filter ljos-site-ljos serve    # http://127.0.0.1:4471/
pnpm --filter ljos-site-ljos test
```

Decisions taken here, of a piece with the sibling lanes':

- The QML is written to lower cleanly with `ljos migrate`
  (verified file by file; 0 errors, 0 warnings under
  `ljos check`) and shipped in the compat form (`import QtQuick`,
  `import Ljos.Blocks`). The dialect form (`import Ljos.Ui`,
  `import Ljos.Layout`) runs on the web now — the compiler's pin
  knows those modules and the runtime has them
  (docs/LJOS_WEB.md A29) — so switching is one
  `ljos migrate --write` over `bundle/` when migrate carries a
  `Ljos.Blocks` import over as it stands (migrate-gaps SM1).
  The showcase demos are the exception that stays compat for
  now: the dialect has no QtQuick3D, `ShaderEffect` or
  animations yet (migrate-gaps SC1–SC3), so three of them
  cannot be lowered at all.
- Showcase demos stand in named `Ljos.Blocks` Slots
  (`showcase-shell`, `showcase`, `demo-*`) as each slot's own
  delegate, so the prerender holds the demo as first made and
  hydration takes it over in place (contributions registered
  from the shell did not settle into a prerender; a slot's own
  delegate is made with it). The demos are the Astro site's
  (`site/src/demos/`) by copy under `bundle/Demos/` and
  `bundle/Pantry/` — the same files, mounted by name there and
  here.

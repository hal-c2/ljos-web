# ljos.dev as Ljós pages

The same site as `site/` (Astro + Starlight), built instead as
prerendered Ljós pages with ljos-web's own site builder
(docs/LJOS_WEB.md A12, A26, A27, A28). This is the site GitHub
Pages serves (below); the Astro site stays as the parity reference
and is built and tested, never deployed.

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

## Design

One place holds each decision; everything else reads it.

- **Colour: `bundle/tokens.js`.** Light and dark, as roles:
  `canvas`, `surface` (raised, hover, pressed, selected), `border`
  (a control's edge, 3:1), `divider` (a hairline that means
  nothing), `focus`, `accent` (hover, pressed, and the text on
  it), `text`, `textMuted`, `link`, `danger`, `scrim`. It also holds
  a code theme with a colour for every highlight tag (`keyword`,
  `string`, `typeName`, …) and for the block's parts (`bg`, `fg`,
  `selection`, `gutter`, `diagnostic-error`,
  `diagnostic-warning`). `Site/Theme.qml` gives the roles to every
  page. The build writes the same table into each page's head as
  `--ljos-<role>` and `--ljos-code-<tag>` custom properties, with
  `.tok-<tag>` rules, for the HTML around the app and for
  highlighted code. Change a colour in tokens.js and both follow.
- **Type, space, shape and motion: `Site/Theme.qml`.**
  - Type: a 16/24 body, and steps of about a fifth up to a 56/64
    hero, every line height on a 4 px grid. The system UI face for
    words and `ui-monospace` for code: no web font to wait for or
    swap in.
  - Space: 4 to 64 on the same grid.
  - Radii: 6, 10 and 16.
  - Motion: 100 to 250 ms with a strong ease-out.
- **Contrast is a test.** `tests/design.spec.js` holds every pair
  read together to WCAG AA in both schemes: text on each surface,
  text on the accent, every code tag on the code background, and
  borders and focus at 3:1. It also checks that the page head says
  the same colours.
- **Light and dark** follow the browser's `prefers-color-scheme`
  until the reader picks one with the header's toggle, which is
  kept. `scheme.js` writes the choice on the page's root before
  the body is read, so the first paint is already in it. The build
  prerenders both schemes at both widths, so nothing changes when
  the script arrives.
- **The mark** (`assets/ljos-mark.svg`) is a lit window: a frame and
  a light in it, drawn to read at 16 px. The build copies it as the
  favicon, beside the touch icon and the social picture
  (`assets/*.png`) drawn from it.
- **No jank:**
  - Every demo stands in a frame of its own size from the first
    paint (`Site/DemoFrame.qml`), showing a picture of the demo
    and its words. The demo is made only near the screen, fades in
    over the picture, and runs only while it is on screen.
  - A browser without WebGPU or wasm keeps the picture and says
    why.
  - Layout shift on the landing, demos and a docs page is held
    under 0.01 by a test.
- **Reduced motion** reduces movement and never removes feedback.
  What would slide or grow only fades, and the demos run gently.
- **Phones:**
  - Under 1000 px the sidebar folds into a menu that holds the
    search.
  - Under 1200 px the "On this page" list goes away.
  - The reading column is 720 px at most.

Build and read it:

```sh
cargo build --bin qmlc          # or point QMLC at a qmlc
pnpm install
LJOS_DOCS_DIR=/path/to/ljos-ui/docs/site pnpm --filter ljos-site-ljos build
pnpm --filter ljos-site-ljos serve    # http://127.0.0.1:4471/
pnpm --filter ljos-site-ljos test
```

## Where it stands: the base

The site stands at a base: `/` at a domain of its own (ljos.dev),
or a project path below one (`/ljos-web/` on github.io). Every
asset a page asks for is relative already. What the base decides is
where a route the site names from its root (`/start/`) goes:
`nav.js` puts it below the base, which the build writes into each
page's head as `<meta name="ljos-base">`. Build, serve and test
read the same variable:

```sh
LJOS_SITE_BASE=/ljos-web/ pnpm --filter ljos-site-ljos build
LJOS_SITE_BASE=/ljos-web/ pnpm --filter ljos-site-ljos serve   # http://127.0.0.1:4471/ljos-web/
LJOS_SITE_BASE=/ljos-web/ pnpm --filter ljos-site-ljos exec playwright test tests/base.spec.js
```

The server answers only below the base, so a page that asks for
anything outside it fails `tests/base.spec.js`. CI builds both
ways on every pull request: the root build runs the whole suite,
the project-path build runs `base.spec.js`.

## Deploying to GitHub Pages

`.github/workflows/site.yml` deploys only on a manual dispatch
(Actions → site → Run workflow), and only when `deploy` is ticked:

| `deploy` | `custom_domain` | What Pages gets |
|---|---|---|
| off | (any) | nothing: the build and its tests only |
| on | off (default) | the preview, built for `/ljos-web/`, at `https://hal-c2.github.io/ljos-web/` |
| on | on | the root build with a `CNAME` naming the repository's Pages domain, for `https://ljos.dev/` |

The deploy step reads the repository's Pages custom domain and
fails when `custom_domain` disagrees with it: on with no domain set,
or off once one is (Pages would serve the project-path build at the
domain's root, where every link 404s). After step 5 below, every
deploy is a dispatch with `custom_domain` on.

Once, before the first deploy: Settings → Pages → Build and
deployment → Source: **GitHub Actions**.

GitHub ignores a `CNAME` file in a deploy made by an Actions
workflow; the domain is the repository's Pages setting. The file
the domain build writes names that setting, and only records which
build is meant for the domain. Set the domain in this order, from GitHub's "Managing a
custom domain for your GitHub Pages site":

1. Verify `ljos.dev` for the hal-c2 organisation (Organisation
   settings → Pages → Add a domain, then its TXT record). A
   verified domain cannot be taken over by another repository.
2. Settings → Pages → Custom domain: `ljos.dev`, Save. Add the
   domain here before the DNS records, so nobody else can serve a
   site on it in between.
3. At the DNS provider for ljos.dev:

   | Host | Type | Value |
   |---|---|---|
   | `@` | A | `185.199.108.153` |
   | `@` | A | `185.199.109.153` |
   | `@` | A | `185.199.110.153` |
   | `@` | A | `185.199.111.153` |
   | `@` | AAAA | `2606:50c0:8000::153` |
   | `@` | AAAA | `2606:50c0:8001::153` |
   | `@` | AAAA | `2606:50c0:8002::153` |
   | `@` | AAAA | `2606:50c0:8003::153` |
   | `www` | CNAME | `hal-c2.github.io` |

   Where the provider has ALIAS or ANAME records, one `@` ALIAS to
   `hal-c2.github.io` may stand instead of the eight A/AAAA
   records. Leave no other `@` A, AAAA, ALIAS or ANAME record: it
   can stop the certificate being issued. The `www` CNAME names
   the organisation's github.io host without the repository's
   name; GitHub redirects `www.ljos.dev` to `ljos.dev`. No
   wildcard records. DNS takes up to 24 hours to spread
   (`dig ljos.dev +noall +answer -t A`, `dig www.ljos.dev +noall
   +answer -t CNAME` show it).
4. When the domain's DNS check passes, GitHub issues the
   certificate; then tick **Enforce HTTPS** (it can take up to 24
   hours to be offered).
5. Dispatch the workflow with `deploy` and `custom_domain` on.

With the custom domain set, `hal-c2.github.io/ljos-web/` redirects
to `ljos.dev`, so the preview build is for before step 2; from then
on a dispatch without `custom_domain` fails rather than deploy it.
Between step 2 and step 5 the domain serves the preview build, whose
links point below `/ljos-web/`: dispatch step 5 as soon as HTTPS is
on.

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

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
  builds every route prerendered into `dist/`, with each page's
  canonical address, `sitemap.xml` and `robots.txt`.
- `tests/` — the landing page's word, a docs page read with
  JavaScript off, navigation and light/dark with it on, and
  parity: the built routes are the docs' routes (and the Astro
  build's, where it stands), each page's HTML carries its title
  and headings, and every internal link resolves; and each page's
  address on ljos.dev, in its head and in the sitemap.

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

## Its address: ljos.dev

ljos.dev is the site's canonical home. Every page's head names its
address there, as `<link rel="canonical">` and `og:url`, and
`sitemap.xml` lists every page the build made at that address;
`robots.txt` lets every crawler in and names the sitemap. A page's
address is the origin and its route (`https://ljos.dev/start/`),
whatever base the build stands at: the github.io preview below
`/ljos-web/` names the ljos.dev page too, so a search engine counts
the two as one. The origin is `LJOS_SITE_ORIGIN`
(`https://ljos.dev` when unset), read by the build and by
`tests/canonical.spec.js`, which holds every page's canonical, its
og:url and its sitemap entry to one address.

## Deploying to GitHub Pages

Every merge to main is live: `.github/workflows/site.yml` builds,
tests, and deploys the root build with a `CNAME` naming the
repository's Pages domain, for `https://ljos.dev/`. Only a push to
main in hal-c2/ljos-web deploys; a fork's push builds and tests
only. A pull request builds and tests at both bases and never
deploys. Deploying runs take turns, and one in flight is never
cancelled; a deploy still waiting may be replaced by a newer one,
and GitHub does not promise to start waiting runs in the order they
were made. So the turns alone do not keep an older commit from
landing after a newer one, or a re-run of an old run from putting
its old build live: the freshness guard (`.github/scripts/fresh-head.sh`)
does. Right before the Pages artifact is uploaded, and again right
before `deploy-pages`, it fails the run unless the run's commit is
still the head of its branch. A re-run of an old run that replaced
a newer waiting one fails the guard, and the newer commit goes live
with the next merge or a dispatch from main. The workflow runs for
every path the build reads (`site/`, `site-ljos/`, `packages/`,
`crates/`, `vendor/`, `mise-tasks/`, `mise.toml`, the Cargo and pnpm
manifests and locks, `.cargo/`, and the workflow and its
`.github/scripts/`); a path missing from that list would be a merge
that changes the site and never deploys it.

A manual dispatch (Actions → site → Run workflow) still deploys
when `deploy` is ticked:

| Run | `deploy` | `custom_domain` | `rollback` | What Pages gets |
|---|---|---|---|---|
| pull request | — | — | — | nothing: the build and its tests only |
| push to main | — | — | — | the root build with a `CNAME` naming the repository's Pages domain, for `https://ljos.dev/`, if its commit is still main's head |
| dispatch | off | (any) | (any) | nothing: the build and its tests only |
| dispatch | on | off (default) | off (default) | the preview, built for `/ljos-web/`, at `https://hal-c2.github.io/ljos-web/`, if its commit is still its branch's head |
| dispatch from main | on | on | off | the root build with its `CNAME`, as a merge deploys it |
| dispatch from another branch | on | on | off | nothing: the run fails, as only main deploys to the custom domain |
| dispatch from any branch | on | (any) | on | the build for that branch's commit, whether or not it is still the head: a rollback |

Every deploying run's freshness guard fails it when its commit is
no longer the head of its branch: a newer merge landed while it
built or waited, or it re-runs an older run. A re-run keeps its
run's inputs, so it can never turn `rollback` on.

To put an older commit live on ljos.dev on purpose, push a branch
at it (`git push origin <commit>:refs/heads/rollback`), then
dispatch from that branch with `deploy`, `custom_domain` and
`rollback` on. The guard warns and lets it through, the pages step
lets a rollback deploy a branch's build to the domain, and the run
takes its turn among main's deploys. It stays live until the next
merge to main deploys. A rollback from main itself only lets a
dispatch deploy although main moved on while it built.

The deploy step reads the repository's Pages custom domain and
fails when the run's build disagrees with it: a merge to main, or a
dispatch with `custom_domain` on, with no domain set; or a preview
dispatch once one is (Pages would serve the project-path build at
the domain's root, where every link 404s). With the domain set, a
merge deploys, and so does a dispatch from main with `custom_domain`
on. A deploying dispatch from another branch takes no turn among
main's deploys, so it never replaces a merge's waiting deploy; with
the domain set it fails either way. The one exception is a rollback
to the custom domain (above): it is meant to replace what main put
there, so it takes its turn with main's deploys.

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
   From then on every merge to main deploys by itself.

With the custom domain set, `hal-c2.github.io/ljos-web/` redirects
to `ljos.dev`, so the preview build is for before step 2; from then
on a dispatch without `custom_domain` fails rather than deploy it.
Between step 2 and step 5 the domain serves the preview build, whose
links point below `/ljos-web/`: dispatch step 5 as soon as HTTPS is
on (the next merge to main deploys the domain build too). Before
step 2 a merge to main fails its deploy step, as it has no domain
to deploy for: nothing is deployed, and the preview stays as it was.

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

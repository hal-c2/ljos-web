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
  sync-docs finds them: `LJOS_DOCS_DIR`, which the mise tasks set)
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
- `e2e/` — every live example and demo, driven as a reader drives
  it, once in a browser with WebAssembly and once without: the
  page says nothing in its console, the example's picture is
  there, a press runs it and it draws, the reader's first move on
  it does what it is for, what moves on its own keeps drawing
  frames, and its source is shown. An example found broken is
  `test.fail` with the reason (`e2e/known.js`): it still runs,
  and turns red the day it starts to work, so the fix takes it
  out of `known.js`. Full motion is the default;
  `e2e/motion.spec.js` asks for reduced motion on purpose.

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
- **The mark** (`assets/ljos-mark.svg`) is the user's: interlocking
  violet and amber panels with a yellow overlap, one mark for both
  schemes (ljos-ui #274). It is the Astro site's
  `site/src/assets/ljos-mark.svg` byte for byte, and reads at 16 px
  as it is. The build copies it as the favicon, beside the touch icon
  and the social picture (`assets/*.png`, the Astro site's own).
  `tests/brand.spec.js` fails on any other mark.
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
pnpm --filter ljos-site-ljos test:e2e  # serves dist/ itself
```

The 3D demos are drawn by wgpu's renderer wherever the browser's
WebGPU gives it an adapter (after `mise run build:wasm-3d`), and by
the JavaScript one on WebGL2 where it does not, or where the browser
has no WebAssembly. `?view3d=` or `VITE_LJOS_VIEW3D` asks for one.

## What runs, and when

DECISION: the rule of thumb for what a page runs.

- Nothing runs until the reader asks: not an example, not a demo. The
  build's picture stands, and on it one control (`Site/Runner.qml`),
  "▶ Run", a button Tab reaches, Return or Space presses and a screen
  reader names ("Run the 3D demo"). A press anywhere on the picture, or
  an edit of the code, runs it too. Only then is the compiler fetched
  (an example) or the demo made: what the reader never asks for costs
  them nothing (about 1.5 MB of compiler, a GPU device). The Pantry,
  the flagship, is drawn with the page as one: it holds still, and its
  shell is the one compiled with the page until the reader's first
  edit, so it has no Run and does not count among the three below.
- The control says where it is, on screen and to a screen reader: the
  picture with "▶ Run"; asked for, "◌ Loading…" in its place; drawn,
  the control steps to the corner, "✎ Edit" on an example (its code
  takes the focus) and "❚❚ Pause" on a demo, which holds the demo
  still where it is, and "▶ Run" goes on from there. One button
  throughout, so a keyboard reader's focus stays on it. Each phase the
  reader asked for is said in the page's polite live region.
- A demo is made when its Run is pressed, not as it nears the screen:
  one the reader never asks for costs them no GPU device
  (`Site/DemoFrame.qml`).
- At most three run at once. A fourth stops one: one that is off
  screen first, else the one that started first. A stopped one waits
  for Run again (a demo is unmade, and gives its device back); a plain
  one runs again when next pressed or edited.
- A demo that leaves the view pauses, and so does every demo while the
  tab is hidden; back in view, it resumes in place (its `active` is
  false, its state kept). An example stays as the reader left it,
  what they typed in it kept, and says nothing while it is away; only
  the budget stops it.
- An example paints its own surface and text from the palette, so it
  reads on the site's light or dark as it runs, and the site lays no
  paper under it. Its picture is drawn once, on the light paper: a page
  whose schemes differed in it would be written twice over.

Motion is full by default. A reader whose system asks for reduced
motion, or who checks the header's "Reduce motion" toggle (kept in
this browser, even where it agrees with the system), gets it
softened, never stopped: `Theme.calm` is set, so the motion
demo's springs settle without overshoot and the 3D and shader demos
turn at a third of their speed.

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
deploys. Each run builds and tests without waiting for any other;
only the deploy job takes turns, one in flight at a time and never
cancelled. A newer push to main cancels older pushes' runs whose
deploy has not started (the `supersede` job,
`.github/scripts/supersede.sh`): their builds could never go live.
A deploy still waiting for its turn is replaced by a newer one, and
GitHub does not promise to start waiting deploys in the order they
were made, so the turns alone do not keep an older commit from
landing after a newer one, or a re-run of an old run from putting
its old build live: the freshness guard (`.github/scripts/fresh-head.sh`)
does. Once the build and every suite pass, the `fresh` job asks it
whether a commit has landed on the run's branch since the run's own
that changes a path the site is built from; if one has, a push's
deploy is skipped, so a stale run never waits for a turn, and the
run still reports its build and tests. A stale dispatch fails there
instead, since no other run will deploy it: dispatch again from the
branch's head. The deploy job asks again right before
`deploy-pages`. Commits that change none of those paths start no run
of the workflow, so the run's build is still the newest site there
is, and it deploys. A re-run of an old run skips its deploy the same
way, and the newer commit's run deploys. The workflow runs for
every path the build reads (`site/`, `site-ljos/`, `packages/`,
`crates/`, `vendor/`, `mise-tasks/`, `mise.toml`, the Cargo and pnpm
manifests and locks, `.cargo/`, and the workflow and its
`.github/scripts/`, listed once more in
`.github/scripts/site-paths.txt` for the guard, and held equal to
it by the guard job's test); a path missing from that list would be
a merge that changes the site and never deploys it.

A manual dispatch (Actions → site → Run workflow) still deploys
when `deploy` is ticked:

| Run | `deploy` | `custom_domain` | `rollback` | What Pages gets |
|---|---|---|---|---|
| pull request | — | — | — | nothing: the build and its tests only |
| push to main | — | — | — | the root build with a `CNAME` naming the repository's Pages domain, for `https://ljos.dev/`, unless a newer commit on main has changed the site |
| dispatch | off | (any) | (any) | nothing: the build and its tests only |
| dispatch | on | off (default) | off (default) | the preview, built for `/ljos-web/`, at `https://hal-c2.github.io/ljos-web/`, unless a newer commit on its branch has changed the site |
| dispatch from main | on | on | off | the root build with its `CNAME`, as a merge deploys it |
| dispatch from another branch | on | on | off | nothing: the run fails, as only main deploys to the custom domain |
| dispatch from any branch | on | (any) | on | the build for that branch's commit, newer site or not, if main holds the commit: a rollback; nothing, and the run fails, for a commit main does not hold |

Every deploying run's freshness guard stops its deploy when a newer
commit on its branch has changed the site: one landed while it built
or waited, or it re-runs an older run. A push's run skips the deploy
and stays green, as the newer push's run deploys; a dispatch's run
fails, so whoever dispatched it knows to dispatch again. The guard
also fails the run when it cannot tell (GitHub's API failing) or
refuses a rollback. A re-run keeps its run's
inputs, so it can never turn `rollback` on.

To put an older commit of main live on ljos.dev on purpose, push a
branch at it (`git push origin <commit>:refs/heads/rollback`), then
dispatch from that branch with `deploy`, `custom_domain` and
`rollback` on. The guard checks that main holds the commit, so only
what was reviewed and merged can go live this way, then warns and
lets it through; the pages step lets a rollback deploy a branch's
build to the domain, and its deploy takes its turn among main's
deploys. It stays live until the next merge to main deploys. A
rollback from main itself only lets a dispatch deploy although main
moved on while it built.

A dispatch runs the workflow as it stands at the dispatched commit,
so this works only for a commit whose `site.yml` has the `rollback`
input: this change and every commit after it. An older commit's
workflow has no `rollback`, and refuses `custom_domain` anywhere
but main. To go back to such a commit, revert what came after it in
a pull request: its merge deploys the reverted site like any other.

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

# ljos.dev (not yet pointed at the domain)

An Astro + Starlight site. Pages are static, so text is in the HTML
for search engines, first paint and screen readers; live examples are
ljos-web apps embedded as lazy, client-only islands.

DECISION: documentation pages live in hal-c2/ljos-ui `docs/site/` and
are read at build time from a pinned ljos-ui checkout — not a git
submodule. `site/ljos-ui.sha` pins the revision; CI checks it out and
sets `LJOS_DOCS_DIR`. A submodule would couple every ljos-web clone to
ljos-ui's tree; a SHA bump is a one-line, reviewable change.
`scripts/sync-docs.mjs` copies the pages in (the copies are
gitignored), maps their `order` front matter to Starlight's sidebar
order, and rewrites file-relative `.md` links to routes. The source
pages are never edited from here; needed fixes are reported upstream.

```sh
cargo build --bin qmlc                 # the demos compile through it
mise run build:wasm-compiler           # the shell drop + live blocks compile in the page
mise run build:wasm-3d                 # the orbit demo's wgpu renderer
mise run build:kernel                  # only for an LJOS_KERNEL=wasm build
LJOS_DOCS_DIR=../ljos-ui/docs/site VITE_LJOS_VIEW3D=wgpu pnpm --filter ljos-site build
pnpm --filter ljos-site check-links    # every built link resolves
pnpm --filter ljos-site test           # Playwright: fallback/live/axe
LJOS_KERNEL=wasm VITE_LJOS_VIEW3D=wgpu pnpm --filter ljos-site build && pnpm --filter ljos-site test  # the same, over Ljós's kernel
```

## Showcase demos

Each demo is a complete app under `src/demos/<id>/` — its QML (and
shader sources) plus one mount module (`index.js`) — so another
host (the Ljós-pages site, a docs page) mounts it by name without
the Astro shell around it. Each passes `ljos check`, is written to
lower cleanly through `ljos migrate`, mounts lazily, pauses off
screen (`active`), and calms under `prefers-reduced-motion`
(`calm`); `src/islands/mount.js` drives those two root properties.
The fallback each figure server-renders is a real screenshot of
the demo running (`scripts/capture-fallbacks.mjs` re-takes them;
review the PNGs, then optimize them into `src/assets/fallbacks/`
as JPEGs) plus its description — what no-JS, no-wasm and
no-WebGPU readers keep.

| id | entry | Ljós-pages slot |
|---|---|---|
| `pantry` | `pantry/Shell.qml` over the `Pantry` blocks | `showcase-shell`, `demo-shell` |
| `orbit` | `orbit/Orbit.qml` | `demo-orbit` |
| `shader` | `shader/Shader.qml` + `light.frag` | `demo-shader` |
| `fieldguide` | `fieldguide/FieldGuide.qml` | `demo-app` |
| `motion` | `motion/Motion.qml` | `demo-motion` |

DECISION: the demos are written in Qt's QML API even though they
lower cleanly to Ljós's dialect, because the web compiler cannot
run the dialect yet (migrate-gaps SC5: no `ljos-web/Ljos/Ui`
runtime module); three of them wait on dialect types besides
(QtQuick3D, ShaderEffect, the animations — SC1–SC3). When those
land, each demo's dialect form is what `ljos migrate --write`
makes of it, with no other change.

This site is never deployed. `.github/workflows/site.yml` builds and
tests it on pull requests and uploads it as an artifact, as the
reference `site-ljos/` is held to; Pages serves `site-ljos/` (its
README says how, and what ljos.dev's DNS needs).

DECISION: `sharp` is pinned exactly to 0.34.5, the version astro
5.18.2 resolves its optional `sharp` dependency to, so the lockfile
holds one copy. The site must name it itself: Astro's image service
does a dynamic `import("sharp")` that Rollup cannot resolve from
Astro's subtree under pnpm's isolated layout, and the build fails
without a site-level dependency (verified). An earlier `^0.35.5`
added a second copy Astro never resolved to; that claim in the
9a2fe8c commit message was wrong.

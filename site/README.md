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
LJOS_DOCS_DIR=../ljos-ui/docs/site pnpm --filter ljos-site build
pnpm --filter ljos-site check-links    # every built link resolves
pnpm --filter ljos-site test           # Playwright: fallback/live/axe
```

Deployment is defined but off: `.github/workflows/site.yml` builds on
pull requests and uploads an artifact; the Pages deploy job runs only
on manual dispatch, and there is no CNAME. Pointing ljos.dev at it is
a deliberate, separate step.

DECISION: `sharp` is pinned exactly to 0.34.5, the version astro
5.18.2 resolves its optional `sharp` dependency to, so the lockfile
holds one copy. The site must name it itself: Astro's image service
does a dynamic `import("sharp")` that Rollup cannot resolve from
Astro's subtree under pnpm's isolated layout, and the build fails
without a site-level dependency (verified). An earlier `^0.35.5`
added a second copy Astro never resolved to; that claim in the
9a2fe8c commit message was wrong.

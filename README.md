Screenshots for draft PRs #170 and #171. Not code, and never merged.

Each folder is named for what was built. Both sets were taken off-screen
on 2026-11-22 in headless Chromium, 1440x900 and 390x844, from builds that
already existed and predate both rebases on da3ad7ff.

- 171/pre-rebase-9d2ffd1c: tracked source at 9d2ffd1c. The docs source and
  the qmlc used by that build are not proven.
- 170/pre-rebase-60936a72-plus-uncommitted: 60936a72 with four uncommitted
  files, later committed as 1f1cbcaa and not proven identical to it. The
  docs source is not proven.
- 171/8478ba62: CI's site-ljos-root artifact (14761659853) of site run
  45036312226, for head 8478ba621d5f847c9efeffcc36f8e67097881b34. Taken on
  2026-11-22 in headless Chromium 158.0.8127.18 with no network, at 1440x900
  and 390x844, light and dark. Four shots identical to another are left out.
  Nothing was pressed: the demos show what they show before Run.
- 171/c734c463: CI's site-ljos-root artifact (14766355994) of site run
  45051613200, for head c734c4634bdd37372c5660f8696f4112509dc61a. Taken on
  2026-11-22 in headless Chromium with no network, at 1440x900 and 390x844,
  light and dark: the replay's start, the board arriving, its end, the code
  further down, and the first screen with reduced motion. Nothing was pressed.

- 171/32aa499e: CI's site-ljos-root artifact (14770033245) of site run 45062353299, for head 32aa499ec80c79feaf56661e56034a7d2c0f4d49. Headless Chromium 158.0.8127.18, no network, 1440x900 at 1x and 390x844 at 2x, light and dark: the front page's replay at its start, middle (5.5 s in) and end.

- 131/507d38d9: CI's site-ljos-root artifact (14759573329) of site run 45034362128, for head 507d38d960bca160846739233824d9c3c14a430e. Headless Chromium 158.0.8127.18, no network, 1440x900 at 1x and 390x844 at 2x, light and dark: each shell, picked as a reader would (stored pick), and the shell switcher open.

- 166/4ec366ea: CI's site-ljos-root artifact (14758588267) of site run 45026470945, for head 4ec366ea578715555c70d5ac3ddbfdf31b8121cd. Headless Chromium 158.0.8127.18, no network, 1440x900 at 1x and 390x844 at 2x, light and dark: /showcase/ at its top and two screens down.

- 164/90bf104c: CI's site-ljos-root artifact (14752865715) of site run 45017349060, for head 90bf104c5c3d30ae1a9f7d5f8d4ab8400a6d5c27. Headless Chromium 158.0.8127.18, no network, 1440x900 at 1x and 390x844 at 2x, light and dark. The first live example on three docs pages, centred on its Run · Edit · Source toolbar so its picture shows: Your First App, Repeater (an example that draws nothing until run), and Motion.

- 165/8486ce06: CI's site-ljos-root artifact (14732409409) of site run 44967650504, for head 8486ce06b27e445b7379f2dc44d683e8adcd1edb. Headless Chromium 158.0.8127.18, no network, 1440x900 at 1x and 390x844 at 2x, light and dark. The first live example on three docs pages, centred on its Run · Edit · Source toolbar: on a phone its stage comes first and long code is folded under Show all; desktop for contrast.

- 177/c15eae4e: CI's site-ljos-root artifact (14761599752) of site run 45038401267, for head c15eae4e25a454e8de56ba194c7b3b4360d5d652. Headless Chromium 158.0.8127.18, no network, 1440x900 at 1x and 390x844 at 2x, light and dark. The first live example on two docs pages, centred on its Run · Edit · Source toolbar: Your First App and Motion, plus Your First App on a narrow 320 px phone.

- 162/6d93bdc4: CI's site-ljos-root artifact (14731281330) of site run 44962969647, for head 6d93bdc43e822207fd9269f3c13727a62567fea7. Headless Chromium 158.0.8127.18, no network, 1440x900 at 1x and 390x844 at 2x, light and dark. These show the pushed head, 6d93bdc4, not the unpushed 279395c5 the text below describes. WebGPU absent: an init script makes `navigator.gpu` undefined before the page loads, and Chromium runs WebGL 2 on SwiftShader (`--use-angle=swiftshader`). Each demo's Run was pressed, and the picture was taken 5 s later. In every view the 3D canvas held a non-2d context while `navigator.gpu` was undefined, so it drew on WebGL 2.

- 170/8d726947: a local build of head 8d726947d1d7a0e57a0c3bde6b8e1e0b38004b70 (site-ljos `scripts/build.mjs` at base `/`, the 3d832bdd prebuilt compiler), served on loopback. Headless Chromium 158.0.8127.18, no network, 1440x900 and 390x844 at 1x, light and dark, the Elegant shell: home, /demos/, /start/first-app/ (a docs page with a live example) and /controls/buttons-and-toggles/ (a code-heavy reference page). Per view: `-0` the first screen, `-1` one screen down, `-end` the footer. Nothing was pressed.

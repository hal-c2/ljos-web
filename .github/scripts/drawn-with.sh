#!/usr/bin/env bash
# What Chromium draws the code blocks' pictures with on this runner, as
# one hash: the fonts fontconfig offers (by file, family, style and
# version), fontconfig's own rules, and the versions of the libraries
# that turn text and WebGL/WebGPU into pixels (fontconfig, FreeType,
# HarfBuzz, Mesa, LLVM for llvmpipe and lavapipe, Vulkan's loader).
# Chromium itself is in the lockfile, which the keys already hash.
#
# The prerender caches were keyed by the runner image's name, and a
# run's jobs land on several images that draw the same: each missed
# the cache another had saved. This names what the pictures depend on
# instead, so images that draw alike share one cache and one that draws
# otherwise starts from nothing. Run it after Playwright has installed
# what Chromium needs of the system: most of these come from there.
set -euo pipefail

etc=${FONTCONFIG_ETC:-/etc/fonts}
fonts=$(fc-list --format '%{file}\t%{family}\t%{style}\t%{fontversion}\n' | LC_ALL=C sort)
# conf.d is mostly links into fontconfig's conf.avail: followed, so a
# rule is hashed by what it says.
rules=$(cd "$etc" && find -L . -type f -print0 | LC_ALL=C sort -z | xargs -0 -r sha256sum)
packages=$(dpkg-query -W -f '${Package}=${Version}\n')
drawing=$(LC_ALL=C grep -E '^(libfontconfig|libfreetype|libharfbuzz|libgl1|libglx|libegl|libgbm|libdrm|libllvm|libvulkan|mesa-)' <<<"$packages" | LC_ALL=C sort || true)

printf 'fonts\n%s\nrules\n%s\nlibraries\n%s\n' "$fonts" "$rules" "$drawing" | sha256sum | cut -c1-16

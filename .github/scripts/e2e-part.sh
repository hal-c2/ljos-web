#!/usr/bin/env bash
# Runs one part of site-ljos's e2e suite: themes-light, themes-dark,
# examples-a, examples-b, demos or rest.
#
# The parts are cut by file and title, not by `--shard`, because shards
# are cut by count, in order: themes.spec and the WebAssembly half of
# examples.spec hold two thirds of the suite's time, so three count-cut
# shards ran 15, 23 and 8 test-minutes. Six parts of 6 to 9 test-minutes
# each (e2e-parts.test.mjs weighs them with a run's seconds,
# e2e-seconds.tsv) end four minutes sooner than three of 15: the run
# waits for its longest part, and runners were free for the other three.
# Each part leaves out what the parts before it take, so together they
# are the whole suite, once, whatever spec is added later: a new file
# runs in `rest`. A pattern that matches nothing fails the run (no
# tests found), so a renamed spec cannot drop a part quietly.
#
# Playwright matches --grep against "<project> <file> <describe> <title>",
# in any case.
set -euo pipefail
themes='themes\.spec\.js '
# The light scheme's examples and demos, and the test that the light
# placeholder is still under AA, which is named for it.
light="${themes}in light "
# The `webassembly` project's, not `no-webassembly`'s: that half is
# short (no example runs without WebAssembly) and stays in `rest`.
examples='(^| )webassembly examples\.spec\.js '
# Cut by the site's sections, which hold about half the examples' time
# each: the language and data pages, and every other page.
first="${examples}/(language|data)/"
# The demos page and the specs that drive its demos.
demos=' (demos|orbit|run|calm)\.spec\.js '
case "${1:?themes-light, themes-dark, examples-a, examples-b, demos or rest}" in
  themes-light) args=(--grep "$light") ;;
  themes-dark) args=(--grep "$themes" --grep-invert "$light") ;;
  examples-a) args=(--grep "$first" --grep-invert "$themes") ;;
  examples-b) args=(--grep "$examples" --grep-invert "$themes|$first") ;;
  demos) args=(--grep "$demos" --grep-invert "$themes|$examples") ;;
  rest) args=(--grep-invert "$themes|$examples|$demos") ;;
  *) echo "unknown part: $1 (themes-light, themes-dark, examples-a, examples-b, demos or rest)" >&2; exit 2 ;;
esac
shift
exec pnpm --filter ljos-site-ljos test:e2e "${args[@]}" "$@"

#!/usr/bin/env bash
# Runs one part of site-ljos's e2e suite: themes, examples or rest.
#
# The parts are cut by file, not by `--shard`, because shards are cut
# by count, in order: themes.spec and the WebAssembly half of
# examples.spec hold two thirds of the suite's time, so three count-cut
# shards ran 15, 23 and 8 test-minutes. These three run about 15 each.
# Each part leaves out what the parts before it take, so together they
# are the whole suite, once, whatever spec is added later: a new file
# runs in `rest`. A pattern that matches nothing fails the run (no
# tests found), so a renamed spec cannot drop a part quietly.
#
# Playwright matches --grep against "<project> <file> <describe> <title>".
set -euo pipefail
themes='themes\.spec\.js'
# The `webassembly` project's, not `no-webassembly`'s: that half is
# short (no example runs without WebAssembly) and stays in `rest`.
examples='(^| )webassembly examples\.spec\.js '
case "${1:?themes, examples or rest}" in
  themes) args=(--grep "$themes") ;;
  examples) args=(--grep "$examples" --grep-invert "$themes") ;;
  rest) args=(--grep-invert "$themes|$examples") ;;
  *) echo "unknown part: $1 (themes, examples or rest)" >&2; exit 2 ;;
esac
shift
exec pnpm --filter ljos-site-ljos test:e2e "${args[@]}" "$@"

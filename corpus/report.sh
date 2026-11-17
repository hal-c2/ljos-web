#!/bin/sh
# How much of Qt's own examples (the qtdoc submodule) the compiler takes, and
# what stops the rest: the yardstick for what to do next.
#
#   git submodule update --init --depth 1 corpus/qtdoc
#   corpus/report.sh [DIRECTORY]      # default: every example
#
# Each file is compiled alone, so types are not checked: this measures the
# language, not which QtQuick types render.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
examples=${1:-$root/corpus/qtdoc/examples}
errors=$(mktemp)
trap 'rm -rf "$errors" "$errors.out"' EXIT

# QMLC names the compiler, as for every other task; without it this
# checkout's is built, where CARGO_TARGET_DIR puts it.
qmlc=${QMLC:-}
if [ -z "$qmlc" ]; then
  cargo build --quiet --manifest-path "$root/Cargo.toml" --bin qmlc
  case ${CARGO_TARGET_DIR:-} in
    "") qmlc="$root/target/debug/qmlc" ;;
    /*) qmlc="$CARGO_TARGET_DIR/debug/qmlc" ;;
    *) qmlc="$root/$CARGO_TARGET_DIR/debug/qmlc" ;;
  esac
fi
# qmlc fails when any file does, which is what is being counted (xargs then
# says 123); xargs failing to run it at all is a broken report.
status=0
find "$examples" -name '*.qml' | sort | xargs "$qmlc" --alone --out-dir "$errors.out" 2>"$errors" >/dev/null || status=$?
if [ "$status" -ne 0 ] && [ "$status" -ne 123 ]; then
  cat "$errors" >&2
  echo "corpus: could not run $qmlc (xargs said $status)" >&2
  exit 1
fi

tail -n 1 "$errors"
echo
echo "errors, by kind:"
grep -v ' compiled, ' "$errors" | sed -E 's/^[^ ]+ //; s/`[^`]*`/`_`/g' | sort | uniq -c | sort -rn

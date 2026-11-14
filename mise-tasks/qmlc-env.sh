# Sourced by mise.toml's [env], not a task (it is not executable).
# Cargo reads a relative CARGO_TARGET_DIR from the repository's root, where
# tasks run; the consumers run elsewhere, so QMLC is made absolute.
if [ -z "${QMLC:-}" ] && [ -n "${CARGO_TARGET_DIR:-}" ]; then
  case $CARGO_TARGET_DIR in
    /*) export QMLC="$CARGO_TARGET_DIR/debug/qmlc" ;;
    *) export QMLC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/$CARGO_TARGET_DIR/debug/qmlc" ;;
  esac
fi

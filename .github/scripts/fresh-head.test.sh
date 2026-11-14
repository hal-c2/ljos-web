#!/usr/bin/env bash
# The freshness guard against a stubbed `gh`: what it does when the
# run's commit is its ref's head, when a newer one has landed, when
# the head cannot be read, and with rollback on.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
guard="$here/fresh-head.sh"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# The stub answers `gh api repos/<repo>/commits/<ref> --jq .sha` with
# $STUB_HEAD, records what it was asked, and fails as the API would
# when STUB_FAIL is set.
mkdir "$work/bin"
cat > "$work/bin/gh" <<'STUB'
#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
if [ -n "${STUB_FAIL:-}" ]; then
  echo "gh: HTTP 502" >&2
  exit 1
fi
echo "$STUB_HEAD"
STUB
chmod +x "$work/bin/gh"

failures=0
fail() {
  echo "FAIL: $1" >&2
  failures=$((failures + 1))
}

# run <name> [VAR=value...]: runs the guard with a clean environment
# plus the given variables, keeping its status and output.
run() {
  local name=$1
  shift
  : > "$work/gh.log"
  set +e
  env -i PATH="$work/bin:$PATH" STUB_LOG="$work/gh.log" \
    REPO=hal-c2/ljos-web GITHUB_REF=refs/heads/main \
    "$@" bash "$guard" > "$work/$name.out" 2>&1
  status=$?
  set -e
  out=$(cat "$work/$name.out")
  asked=$(cat "$work/gh.log")
}

new=1111111111111111111111111111111111111111
old=2222222222222222222222222222222222222222

run same GITHUB_SHA=$new STUB_HEAD=$new ROLLBACK=false
[ "$status" = 0 ] || fail "the head itself is refused: $out"
[ "$asked" = "api repos/hal-c2/ljos-web/commits/heads/main --jq .sha" ] ||
  fail "the head is asked for as '$asked', not main's"

run stale GITHUB_SHA=$old STUB_HEAD=$new ROLLBACK=false
[ "$status" != 0 ] || fail "a commit behind main's head passes"
grep -q "^::error::" <<<"$out" || fail "a stale commit fails without an ::error:: line: $out"
{ grep -q "$old" <<<"$out" && grep -q "$new" <<<"$out"; } ||
  fail "the error names neither the run's commit nor the head: $out"
grep -q "rollback" <<<"$out" || fail "the error does not name rollback: $out"

run rollback GITHUB_SHA=$old STUB_HEAD=$new ROLLBACK=true
[ "$status" = 0 ] || fail "rollback still refuses an older commit: $out"
{ grep -q "^::warning::" <<<"$out" && grep -q "$old" <<<"$out"; } ||
  fail "a rollback does not say what it puts live: $out"

run unread GITHUB_SHA=$new STUB_HEAD=$new STUB_FAIL=1 ROLLBACK=false
[ "$status" != 0 ] || fail "a head that cannot be read passes"

run branch GITHUB_SHA=$new STUB_HEAD=$new ROLLBACK=false GITHUB_REF=refs/heads/site3/preview
[ "$status" = 0 ] || fail "a branch's own head is refused: $out"
[ "$asked" = "api repos/hal-c2/ljos-web/commits/heads/site3/preview --jq .sha" ] ||
  fail "a branch dispatch asks for '$asked', not its own head"

run unset GITHUB_SHA=$new STUB_HEAD=$new
[ "$status" != 0 ] || fail "a run that never said whether it rolls back passes"

if [ "$failures" -gt 0 ]; then
  echo "$failures failed" >&2
  exit 1
fi
echo "fresh-head: all cases pass"

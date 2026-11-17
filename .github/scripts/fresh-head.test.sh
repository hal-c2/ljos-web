#!/usr/bin/env bash
# The freshness guard against a stubbed `gh`: what it answers when the
# run's commit is its ref's head, when newer commits have landed that
# do or do not change the site, when the head cannot be read, and with
# rollback on. A push's stale build is answered fresh=false, not
# failed: its deploy is skipped, and the newer push's run deploys. A
# dispatch's stale build fails: nothing else deploys it.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
guard="$here/fresh-head.sh"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# The stub answers the two calls the guard makes, from variables:
#   commits/<ref>          -> $STUB_HEAD (or $STUB_MAIN for heads/main)
#   compare/<base>...<head> -> $STUB_STATUS, then (unless only the
#                             status is asked for) the count of
#                             $STUB_FILES (one per line), then them
# It records each call, and fails as the API would when STUB_FAIL is set.
mkdir "$work/bin"
cat > "$work/bin/gh" <<'STUB'
#!/usr/bin/env bash
echo "$2" >> "$STUB_LOG"
if [ -n "${STUB_FAIL:-}" ]; then
  echo "gh: HTTP 502" >&2
  exit 1
fi
case "$2" in
  */commits/heads/main) echo "${STUB_MAIN:-$STUB_HEAD}" ;;
  */commits/*) echo "$STUB_HEAD" ;;
  */compare/*)
    echo "$STUB_STATUS"
    # `--jq .status` asks for nothing more.
    [ "$4" != ".status" ] || exit 0
    if [ -n "${STUB_COUNT:-}" ]; then
      echo "$STUB_COUNT"
    elif [ -n "${STUB_FILES:-}" ]; then
      wc -l <<<"$STUB_FILES" | tr -d ' '
    else
      echo 0
    fi
    [ -z "${STUB_FILES:-}" ] || echo "$STUB_FILES"
    ;;
  *) echo "stub gh: unexpected $2" >&2; exit 2 ;;
esac
STUB
chmod +x "$work/bin/gh"

failures=0
fail() {
  echo "FAIL: $1" >&2
  failures=$((failures + 1))
}

# run <name> [VAR=value...]: runs the guard with a clean environment
# plus the given variables, keeping its status, output, answer (what
# it wrote to GITHUB_OUTPUT) and the calls.
run() {
  local name=$1
  shift
  : > "$work/gh.log"
  : > "$work/answer"
  set +e
  env -i PATH="$work/bin:$PATH" STUB_LOG="$work/gh.log" \
    REPO=hal-c2/ljos-web GITHUB_REF=refs/heads/main GITHUB_EVENT_NAME=push GITHUB_OUTPUT="$work/answer" \
    "$@" bash "$guard" > "$work/$name.out" 2>&1
  status=$?
  set -e
  out=$(cat "$work/$name.out")
  asked=$(cat "$work/gh.log")
  answer=$(cat "$work/answer")
}

# answered <name> <true|false> <what>: the guard passed and answered so.
answered() {
  [ "$status" = 0 ] || fail "$3 fails instead of answering: $out"
  [ "$answer" = "fresh=$2" ] || fail "$3 answers '$answer', not fresh=$2: $out"
}

new=1111111111111111111111111111111111111111
old=2222222222222222222222222222222222222222

run same GITHUB_SHA=$new STUB_HEAD=$new ROLLBACK=false
answered same true "the head itself"
[ "$asked" = "repos/hal-c2/ljos-web/commits/heads/main" ] ||
  fail "the head is asked for as '$asked', not main's"

# Newer commits that change the site, by a file, a directory, or a
# rename out of one: the older build is stale, and its deploy skipped.
for files in "site-ljos/bundle/Main.qml" "README.md
Cargo.lock" "docs/moved.md
crates/old.rs" ".github/workflows/site.yml"; do
  run stale GITHUB_SHA=$old STUB_HEAD=$new STUB_STATUS=ahead STUB_FILES="$files" ROLLBACK=false
  answered stale false "a commit behind a site change ($files)"
  grep -q "^::notice::" <<<"$out" || fail "a stale commit is skipped without a ::notice:: line: $out"
  { grep -q "$old" <<<"$out" && grep -q "$new" <<<"$out"; } ||
    fail "the error names neither the run's commit nor the head: $out"
  grep -q "rollback" <<<"$out" || fail "the error does not name rollback: $out"
  grep -q "repos/hal-c2/ljos-web/compare/$old...$new" <<<"$asked" ||
    fail "the guard did not compare the run's commit with the head: $asked"
done

# A dispatch's stale build fails, saying to dispatch again: no newer
# run deploys it. A fresh dispatch is answered as a push is.
run stale-dispatch GITHUB_SHA=$old STUB_HEAD=$new STUB_STATUS=ahead STUB_FILES="site/x.md" ROLLBACK=false GITHUB_EVENT_NAME=workflow_dispatch GITHUB_REF=refs/heads/site3/preview
[ "$status" != 0 ] || fail "a stale dispatch passes: $out"
grep -q "^::error::.*[Dd]ispatch again" <<<"$out" || fail "a stale dispatch does not say to dispatch again: $out"
[ -z "$answer" ] || fail "a stale dispatch answers '$answer'"
run fresh-dispatch GITHUB_SHA=$new STUB_HEAD=$new ROLLBACK=false GITHUB_EVENT_NAME=workflow_dispatch
answered fresh-dispatch true "a dispatch at its branch's head"

run noevent GITHUB_SHA=$new STUB_HEAD=$new ROLLBACK=false GITHUB_EVENT_NAME=
[ "$status" != 0 ] || fail "a run that does not know its event passes"

# Newer commits that change nothing the site is built from start no
# run of site.yml: this build is the newest the site has.
run outside GITHUB_SHA=$old STUB_HEAD=$new STUB_STATUS=ahead ROLLBACK=false STUB_FILES="README.md
docs/TYPESCRIPT.md
.github/workflows/ci.yml
site-other/x
sitemap.txt"
answered outside true "a commit behind only non-site changes"

run empty GITHUB_SHA=$old STUB_HEAD=$new STUB_STATUS=ahead ROLLBACK=false
answered empty true "a commit behind only empty commits"

# A head that does not hold the run's commit (a force-push), or too
# many files apart for GitHub to list them all: not deployed.
run diverged GITHUB_SHA=$old STUB_HEAD=$new STUB_STATUS=diverged STUB_FILES=README.md ROLLBACK=false
answered diverged false "a commit its branch no longer holds"
run many GITHUB_SHA=$old STUB_HEAD=$new STUB_STATUS=ahead STUB_COUNT=300 STUB_FILES=README.md ROLLBACK=false
answered many false "a comparison GitHub cut short"

# Freshness unknown fails, and answers nothing a deploy could read.
run unread GITHUB_SHA=$new STUB_HEAD=$new STUB_FAIL=1 ROLLBACK=false
[ "$status" != 0 ] || fail "a head that cannot be read passes"
[ -z "$answer" ] || fail "a head that cannot be read answers '$answer'"

run branch GITHUB_SHA=$new STUB_HEAD=$new ROLLBACK=false GITHUB_REF=refs/heads/site3/preview
answered branch true "a branch's own head"
[ "$asked" = "repos/hal-c2/ljos-web/commits/heads/site3/preview" ] ||
  fail "a branch dispatch asks for '$asked', not its own head"

# Rollback: an older commit main holds goes live with a warning; one
# main never held does not, whatever branch it is dispatched from.
run rollback GITHUB_SHA=$old STUB_MAIN=$new STUB_STATUS=ahead ROLLBACK=true GITHUB_REF=refs/heads/rollback
answered rollback true "rollback of an older commit of main"
{ grep -q "^::warning::" <<<"$out" && grep -q "$old" <<<"$out"; } ||
  fail "a rollback does not say what it puts live: $out"
grep -q "repos/hal-c2/ljos-web/compare/$old...$new" <<<"$asked" ||
  fail "a rollback does not ask whether main holds its commit: $asked"

run rollback-head GITHUB_SHA=$new STUB_MAIN=$new STUB_STATUS=identical ROLLBACK=true
answered rollback-head true "rollback of main's head itself"

for state in behind diverged; do
  run rollback-$state GITHUB_SHA=$old STUB_MAIN=$new STUB_STATUS=$state ROLLBACK=true GITHUB_REF=refs/heads/unreviewed
  [ "$status" != 0 ] || fail "rollback deploys a commit main does not hold ($state): $out"
  grep -q "^::error::" <<<"$out" || fail "a refused rollback has no ::error:: line: $out"
  [ -z "$answer" ] || fail "a refused rollback answers '$answer'"
done

run unset GITHUB_SHA=$new STUB_HEAD=$new
[ "$status" != 0 ] || fail "a run that never said whether it rolls back passes"
[ -z "$answer" ] || fail "a run that never said whether it rolls back answers '$answer'"

if [ "$failures" -gt 0 ]; then
  echo "$failures failed" >&2
  exit 1
fi
echo "fresh-head: all cases pass"

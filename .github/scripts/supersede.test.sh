#!/usr/bin/env bash
# The supersede step against a stubbed `gh`: which older runs of main's
# pushes it cancels, which it spares (a deploy started or done, a newer
# run, one already completed), and that it fails when it cannot list
# or cancel.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
step="$here/supersede.sh"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# The stub answers from JSON in $STUB_DIR, through the real jq with
# the filter the step gives, as gh's --jq does:
#   GET  .../workflows/<file>/runs?...status=<s> -> the runs.json entries
#        in <s> (fails if STUB_FAIL, or if STUB_FAIL_STATUS is <s>)
#   GET  .../runs/<id>/jobs?...        -> jobs-<id>.json, or no jobs
#   POST .../runs/<id>/cancel          -> fails with cancel-<id>.err
# It records each call as "<method> <path>".
mkdir "$work/bin"
cat > "$work/bin/gh" <<'STUB'
#!/usr/bin/env bash
[ "$1" = api ] || { echo "stub gh: unexpected $1" >&2; exit 2; }
shift
method=GET path="" filter=.
while [ $# -gt 0 ]; do
  case "$1" in
    -X) method=$2; shift 2 ;;
    --jq) filter=$2; shift 2 ;;
    --paginate) method="$method(all pages)"; shift ;;
    *) path=$1; shift ;;
  esac
done
echo "$method $path" >> "$STUB_LOG"
id=$(sed -n 's#.*/actions/runs/\([0-9]*\)/.*#\1#p' <<<"$path")
case "$method $path" in
  "GET(all pages) "*/actions/workflows/*/runs\?*status=*)
    state=$(sed -n 's/.*[?&]status=\([a-z_]*\).*/\1/p' <<<"$path")
    if [ -n "${STUB_FAIL:-}" ] || [ "$state" = "${STUB_FAIL_STATUS:-}" ]; then echo "gh: HTTP 502" >&2; exit 1; fi
    jq --arg s "$state" '{workflow_runs: [.workflow_runs[] | select(.status == $s)]}' "$STUB_DIR/runs.json" | jq -r "$filter"
    ;;
  "GET "*/actions/runs/*/jobs\?*)
    if [ -f "$STUB_DIR/jobs-$id.json" ]; then
      jq -r "$filter" "$STUB_DIR/jobs-$id.json"
    else
      jq -r "$filter" <<<'{"jobs": []}'
    fi
    ;;
  "POST "*/actions/runs/*/cancel)
    if [ -f "$STUB_DIR/cancel-$id.err" ]; then cat "$STUB_DIR/cancel-$id.err" >&2; exit 1; fi
    echo '{}'
    ;;
  *) echo "stub gh: unexpected $method $path" >&2; exit 2 ;;
esac
STUB
chmod +x "$work/bin/gh"

failures=0
fail() {
  echo "FAIL: $1" >&2
  failures=$((failures + 1))
}

# run <name> [VAR=value...]: runs the step in a clean environment as
# run 50 of site.yml, with the fixtures in $work/<name>, keeping its
# status, output and the calls.
run() {
  local name=$1
  shift
  : > "$work/gh.log"
  set +e
  env -i PATH="$work/bin:$PATH" STUB_LOG="$work/gh.log" STUB_DIR="$work/$name" TMPDIR="$work" \
    REPO=hal-c2/ljos-web GITHUB_RUN_NUMBER=50 \
    GITHUB_WORKFLOW_REF=hal-c2/ljos-web/.github/workflows/site.yml@refs/heads/main \
    "$@" bash "$step" > "$work/$name.out" 2>&1
  status=$?
  set -e
  out=$(cat "$work/$name.out")
  asked=$(cat "$work/gh.log")
}

# runs <name> <run_number:id:status>...: the listing GitHub answers.
runs() {
  local name=$1 entry number id state
  shift
  mkdir -p "$work/$name"
  {
    echo '{"workflow_runs": ['
    local sep=""
    for entry in "$@"; do
      IFS=: read -r number id state <<<"$entry"
      printf '%s{"id": %s, "run_number": %s, "status": "%s", "head_branch": "main"}\n' "$sep" "$id" "$number" "$state"
      sep=","
    done
    echo ']}'
  } > "$work/$name/runs.json"
}

# deploy <name> <id> <status> [conclusion]: run <id>'s deploy job.
deploy() {
  local conclusion=null
  [ -z "${4:-}" ] || conclusion="\"$4\""
  printf '{"jobs": [{"name": "build", "status": "completed", "conclusion": "success"}, {"name": "deploy", "status": "%s", "conclusion": %s}]}\n' \
    "$3" "$conclusion" > "$work/$1/jobs-$2.json"
}

cancelled() { grep -q "^POST repos/hal-c2/ljos-web/actions/runs/$1/cancel$" <<<"$asked"; }

runs alone 50:500:in_progress
run alone
[ "$status" = 0 ] || fail "a run with no older one fails: $out"
for state in requested queued pending waiting in_progress; do
  grep -q "^GET(all pages) repos/hal-c2/ljos-web/actions/workflows/site.yml/runs?branch=main&event=push&status=$state&per_page=100$" <<<"$asked" ||
    fail "the step does not list every page of site.yml's $state pushes to main: $asked"
done
grep -q "status=completed" <<<"$asked" && fail "the step lists completed runs: $asked"
! grep -q "^POST" <<<"$asked" || fail "a run with no older one cancels: $asked"

# Older runs still building or testing, or whose deploy waits for its
# turn: cancelled. One whose deploy has started or succeeded: spared.
# A newer run, or one completed: left alone without a look.
runs mixed \
  41:410:completed 42:420:in_progress 43:430:queued 44:440:in_progress \
  45:450:in_progress 46:460:in_progress 47:470:waiting 50:500:in_progress 51:510:in_progress
deploy mixed 420 in_progress
deploy mixed 430 queued
deploy mixed 440 completed success
deploy mixed 450 waiting
deploy mixed 460 completed skipped
run mixed
[ "$status" = 0 ] || fail "superseding fails: $out"
cancelled 420 && fail "a run whose deploy is in flight is cancelled"
cancelled 440 && fail "a run whose deploy succeeded is cancelled"
cancelled 430 || fail "a run whose deploy is queued is not cancelled: $asked"
cancelled 450 || fail "a run whose deploy waits for its turn is not cancelled: $asked"
cancelled 460 || fail "a run whose deploy was skipped is not cancelled: $asked"
cancelled 470 || fail "a run still waiting to start is not cancelled: $asked"
for id in 410 500 510; do
  grep -q "/runs/$id/" <<<"$asked" && fail "run $id (completed, this one, or newer) is touched: $asked"
done
grep -q "^GET repos/hal-c2/ljos-web/actions/runs/430/jobs?per_page=100$" <<<"$asked" ||
  fail "the step does not read an older run's jobs before cancelling it: $asked"
grep -q "run 420: its deploy job is in_progress, spared" <<<"$out" || fail "a spared run is not named: $out"

# A run that completed between the listing and the cancel (409) is no
# failure; any other refusal is, and the rest are still cancelled.
runs raced 48:480:in_progress 49:490:in_progress
echo "gh: Cannot cancel a workflow run that is completed. (HTTP 409)" > "$work/raced/cancel-480.err"
run raced
[ "$status" = 0 ] || fail "a run that completed meanwhile fails the step: $out"
cancelled 490 || fail "a run after one that completed meanwhile is not cancelled: $asked"

runs refused 48:480:in_progress 49:490:in_progress
echo "gh: Resource not accessible by integration (HTTP 403)" > "$work/refused/cancel-480.err"
run refused
[ "$status" != 0 ] || fail "a refused cancel passes: $out"
grep -q "^::error::.*480" <<<"$out" || fail "a refused cancel has no ::error:: naming the run: $out"
cancelled 490 || fail "one refused cancel stops the others: $asked"

runs unread
run unread STUB_FAIL=1
[ "$status" != 0 ] || fail "a listing that cannot be read passes: $out"

# One listing failing fails the step, though the listings after it
# answer: a partial list would leave runs uncancelled, silently.
runs partial 48:480:queued 49:490:in_progress
run partial STUB_FAIL_STATUS=queued
[ "$status" != 0 ] || fail "a failed listing of one status passes: $out"
grep -q "^POST" <<<"$asked" && fail "the step cancels from a partial listing: $asked"

runs unset
run unset GITHUB_RUN_NUMBER=
[ "$status" != 0 ] || fail "a run that does not know its number passes"
run nonnumber GITHUB_RUN_NUMBER='1 or true'
[ "$status" != 0 ] || fail "a run number that is not a number passes"

if [ "$failures" -gt 0 ]; then
  echo "$failures failed" >&2
  exit 1
fi
echo "supersede: all cases pass"

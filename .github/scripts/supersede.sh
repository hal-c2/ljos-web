#!/usr/bin/env bash
# Cancels the runs of this workflow for older pushes to main that are
# still building or testing: a newer push has made their deploy waste.
#
# site.yml runs it in a push to main's run. Such a run exists only
# because the push changed a path the site is built from (the path
# filter is site-paths.txt), so the freshness guard would refuse every
# older push's deploy from now on: building it on is time and runners
# for nothing, taken from the newer run's build. Cancelled, it ends
# cancelled, which is what happened to it.
#
# A run whose deploy job has started is spared, and so is one whose
# deploy succeeded: a deploy that passed its guard before this push
# landed may be uploading or deploying, and is never cancelled mid-
# flight. One that starts after the jobs are read and before the
# cancel reaches it runs its guard first, after this push landed, so
# it stops before touching Pages: the cancel interrupts nothing that
# matters.
#
# Only pushes are superseded, never a dispatch: a dispatch is asked
# for by hand, for a preview or a rollback the newer push does not
# replace.
#
# Reads REPO, GITHUB_WORKFLOW_REF, GITHUB_RUN_NUMBER and GH_TOKEN (for
# gh).
set -euo pipefail

: "${REPO:?}" "${GITHUB_WORKFLOW_REF:?}" "${GITHUB_RUN_NUMBER:?}"
[[ "$GITHUB_RUN_NUMBER" =~ ^[0-9]+$ ]] || {
  echo "::error::GITHUB_RUN_NUMBER is '$GITHUB_RUN_NUMBER', not a number"
  exit 1
}
# owner/repo/.github/workflows/site.yml@refs/heads/main -> site.yml
workflow=${GITHUB_WORKFLOW_REF%@*}
workflow=${workflow##*/}

# Older by run number: a run's number is fixed when its push lands,
# and a re-run keeps it, so a re-run of an older push never cancels a
# newer one.
# Listed by each unfinished status, every page: each listing is short,
# and a re-run of an old push is found however many pushes came after
# it, where one listing of every run would reach back only as far as
# GitHub's limit and cost a call per hundred finished runs.
older=$(for state in requested queued pending waiting in_progress; do
  gh api --paginate "repos/$REPO/actions/workflows/$workflow/runs?branch=main&event=push&status=$state&per_page=100" \
    --jq ".workflow_runs[] | select(.status != \"completed\" and .head_branch == \"main\" and .run_number < $GITHUB_RUN_NUMBER) | .id"
done | sort -u)

err=$(mktemp)
trap 'rm -f "$err"' EXIT
failed=0
for id in $older; do
  deploy=$(gh api "repos/$REPO/actions/runs/$id/jobs?per_page=100" \
    --jq '.jobs[] | select(.name == "deploy") | "\(.status) \(.conclusion // "")"')
  case "$deploy" in
    "in_progress "* | "completed success")
      echo "run $id: its deploy job is ${deploy% }, spared"
      continue
      ;;
  esac
  if gh api -X POST "repos/$REPO/actions/runs/$id/cancel" > /dev/null 2> "$err"; then
    echo "run $id: superseded by run $GITHUB_RUN_NUMBER, cancelled"
  elif grep -q "HTTP 409" "$err"; then
    # It completed between the listing and the cancel.
    echo "run $id: already completed"
  else
    cat "$err" >&2
    echo "::error::could not cancel run $id, which this push supersedes"
    failed=1
  fi
done
exit "$failed"

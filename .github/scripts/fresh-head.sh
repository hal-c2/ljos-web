#!/usr/bin/env bash
# Says whether a build is still the newest site its branch holds, so an
# older build is never deployed over a newer one.
#
# Main's runs build side by side, a re-run keeps its run's commit, and
# GitHub does not promise to start waiting deploys in the order they
# were made, so without this an older build can land over a newer one.
# site.yml runs it in the `fresh` job, before a run's deploy may take
# its turn in the Pages group, and again right before deploy-pages,
# since a newer merge can land while a deploy waits for its turn.
#
# It answers in $GITHUB_OUTPUT: fresh=true, or, for a push, fresh=false
# for a stale build, which is not a failure: the build and its tests
# passed, the deploy is skipped, so a stale run never waits for a turn
# it would only refuse, and the newer push's own run deploys. A stale
# dispatch fails instead: no other run will deploy what it was asked
# for, so the person who dispatched it must know to dispatch again.
# Freshness unknown (gh failing), a ROLLBACK that is not set, or a
# rollback of a commit main does not hold, fails too.
#
# The run's commit passes when it is its branch's head, or when every
# commit since it touches none of the paths the site is built from
# (site-paths.txt, the workflow's own path filter): such a commit
# starts no run of site.yml, so the build of this commit is the
# newest the site has, and refusing it would leave the site change
# undeployed.
#
# ROLLBACK=true lets an older commit of main through on purpose: one
# main holds, so what goes live has been reviewed and merged. It must
# be set either way, so a step that forgets to pass it fails rather
# than skipping the check.
#
# Reads REPO, GITHUB_REF, GITHUB_SHA, GITHUB_EVENT_NAME, GITHUB_OUTPUT,
# ROLLBACK and GH_TOKEN (for gh).
set -euo pipefail

: "${REPO:?}" "${GITHUB_REF:?}" "${GITHUB_SHA:?}" "${GITHUB_EVENT_NAME:?}" "${GITHUB_OUTPUT:?}"
case "${ROLLBACK:-}" in
  true | false) ;;
  *)
    echo "::error::ROLLBACK is '${ROLLBACK:-}', not true or false: the step running the freshness guard must pass it"
    exit 1
    ;;
esac

here=$(cd "$(dirname "$0")" && pwd)
ref=${GITHUB_REF#refs/}
branch=${GITHUB_REF#refs/heads/}

# Whether a path is one the site is built from: each entry is a
# directory (`dir/**`) or a single file.
site_path() {
  local pattern
  while IFS= read -r pattern; do
    case "$pattern" in "" | "#"*) continue ;; esac
    case "$pattern" in
      */\*\*) [[ "$1" == "${pattern%\*\*}"* ]] && return 0 ;;
      *) [ "$1" = "$pattern" ] && return 0 ;;
    esac
  done < "$here/site-paths.txt"
  return 1
}

fresh() {
  echo "fresh=true" >> "$GITHUB_OUTPUT"
  exit 0
}

# A failure to read the head, or a comparison, fails the run:
# freshness unknown is not freshness.
if [ "$ROLLBACK" = "true" ]; then
  main=$(gh api "repos/$REPO/commits/heads/main" --jq .sha)
  status=$(gh api "repos/$REPO/compare/$GITHUB_SHA...$main" --jq .status)
  case "$status" in
    identical | ahead)
      echo "::warning::rollback: deploying $GITHUB_SHA, a commit of main, which is at $main now"
      fresh
      ;;
    *)
      echo "::error::rollback deploys only a commit main holds, and $GITHUB_SHA is not one (main is $status of it, at $main): merge it to main first"
      exit 1
      ;;
  esac
fi

head=$(gh api "repos/$REPO/commits/$ref" --jq .sha)
if [ "$head" = "$GITHUB_SHA" ]; then
  echo "$GITHUB_SHA is the head of $branch"
  fresh
fi

stale() {
  local why="this run is for $GITHUB_SHA, but $branch is at $head now, $1, and deploying would put the older build over the newer one"
  local rollback="To put an older commit of main live on purpose, dispatch from a branch at it with rollback on (site-ljos/README.md, Deploying)."
  if [ "$GITHUB_EVENT_NAME" = "push" ]; then
    echo "::notice::not deploying: $why. The newer push's run deploys. $rollback"
    echo "fresh=false" >> "$GITHUB_OUTPUT"
    exit 0
  fi
  echo "::error::not deploying: $why. Dispatch again from the head of $branch. $rollback"
  exit 1
}

# One call: the status, the count of files (GitHub lists at most 300),
# then each file changed, and the name a renamed one had before.
compare=$(gh api "repos/$REPO/compare/$GITHUB_SHA...$head" \
  --jq '.status, (.files | length), (.files[] | .filename, (.previous_filename // empty))')
status=$(sed -n 1p <<<"$compare")
count=$(sed -n 2p <<<"$compare")
[ "$status" = "ahead" ] || stale "which does not hold this commit (it is $status of it)"
[ "$count" -lt 300 ] || stale "too many files apart to tell whether the site changed"
while IFS= read -r file; do
  if site_path "$file"; then
    stale "and $file, which the site is built from, has changed since"
  fi
done < <(sed -n '3,$p' <<<"$compare")
echo "$GITHUB_SHA is the newest site on $branch: the commits up to its head, $head, change no path the site is built from"
fresh

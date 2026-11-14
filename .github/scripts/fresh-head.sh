#!/usr/bin/env bash
# Refuses to deploy a build older than the site its branch holds now.
#
# A re-run keeps its run's commit, and GitHub does not promise to start
# waiting runs in the order they were made, so without this an older
# build can land over a newer one. site.yml runs it right before the
# Pages artifact is uploaded and again right before deploy-pages, since
# a newer merge can land while a run builds or waits for its turn.
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
# Reads REPO, GITHUB_REF, GITHUB_SHA, ROLLBACK and GH_TOKEN (for gh).
set -euo pipefail

: "${REPO:?}" "${GITHUB_REF:?}" "${GITHUB_SHA:?}"
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

# A failure to read the head, or a comparison, fails the deploy:
# freshness unknown is not freshness.
if [ "$ROLLBACK" = "true" ]; then
  main=$(gh api "repos/$REPO/commits/heads/main" --jq .sha)
  status=$(gh api "repos/$REPO/compare/$GITHUB_SHA...$main" --jq .status)
  case "$status" in
    identical | ahead)
      echo "::warning::rollback: deploying $GITHUB_SHA, a commit of main, which is at $main now"
      ;;
    *)
      echo "::error::rollback deploys only a commit main holds, and $GITHUB_SHA is not one (main is $status of it, at $main): merge it to main first"
      exit 1
      ;;
  esac
  exit 0
fi

head=$(gh api "repos/$REPO/commits/$ref" --jq .sha)
if [ "$head" = "$GITHUB_SHA" ]; then
  echo "$GITHUB_SHA is the head of $branch"
  exit 0
fi

stale() {
  echo "::error::this run is for $GITHUB_SHA, but $branch is at $head now, $1: deploying would put the older build over the newer one. To put an older commit of main live on purpose, dispatch from a branch at it with rollback on (site-ljos/README.md, Deploying)."
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

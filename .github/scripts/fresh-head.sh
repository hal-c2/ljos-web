#!/usr/bin/env bash
# Refuses to deploy a commit that is no longer its ref's head.
#
# A re-run keeps its run's commit, and GitHub does not promise to start
# waiting runs in the order they were made, so without this an older
# build can land over a newer one. site.yml runs it right before the
# Pages artifact is uploaded and again right before deploy-pages, since
# a newer merge can land while a run builds or waits for its turn.
#
# ROLLBACK=true lets the older commit through on purpose. It must be
# set either way, so a step that forgets to pass it fails rather than
# skipping the check.
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

ref=${GITHUB_REF#refs/}
branch=${GITHUB_REF#refs/heads/}
# A failure to read the head fails the deploy: freshness unknown is
# not freshness.
head=$(gh api "repos/$REPO/commits/$ref" --jq .sha)

if [ "$head" = "$GITHUB_SHA" ]; then
  echo "$GITHUB_SHA is the head of $branch"
elif [ "$ROLLBACK" = "true" ]; then
  echo "::warning::rollback: deploying $GITHUB_SHA, though $branch is at $head now"
else
  echo "::error::this run is for $GITHUB_SHA, but $branch is at $head now: a newer commit has landed, or this re-runs an older run, and deploying would put the older build over the newer one. To put an older commit live on purpose, dispatch from a branch at it with rollback on (site-ljos/README.md, Deploying)."
  exit 1
fi

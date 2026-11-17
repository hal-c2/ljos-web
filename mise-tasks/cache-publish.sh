# shellcheck shell=bash
# Sourced by tasks that fetch into a cache under the target dir (controls,
# site:docs). Two runs sharing a target dir can both fetch the same entry;
# checking, replacing and publishing it happen under one lock, so a run
# never removes an entry another run has just published and may be reading.
#
# publish_cache_entry CACHE KEY SCRATCH MARKER
#   Moves SCRATCH to CACHE/KEY unless CACHE/KEY/MARKER already exists.
#   Returns 0 when SCRATCH was published (the caller must no longer delete
#   it), 1 when another run's complete entry was kept (the caller deletes
#   its SCRATCH). mkdir is the lock because it is atomic everywhere,
#   macOS included, where flock(1) is missing.
publish_cache_entry() {
  local cache=$1 key=$2 scratch=$3 marker=$4
  local lock="$cache/.lock-$key" waited=0
  until mkdir "$lock" 2>/dev/null; do
    if [ "$waited" -ge 3000 ]; then
      echo "cache: waited 5 minutes for $lock; if no other run is publishing $key, remove that directory and try again" >&2
      exit 1
    fi
    sleep 0.1
    waited=$((waited + 1))
  done
  # Callers test the result in an `if`, where errexit is off, so each
  # step's failure is checked here rather than left to set -e.
  local published=1
  if [ ! -e "$cache/$key/$marker" ]; then
    if ! rm -rf "${cache:?}/${key:?}" || ! mv "$scratch" "$cache/$key"; then
      rmdir "$lock"
      echo "cache: could not publish $cache/$key (see the error above)" >&2
      exit 1
    fi
    published=0
  fi
  rmdir "$lock"
  return "$published"
}

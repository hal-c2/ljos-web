#!/usr/bin/env bash
# Leaves in apt's package cache ($1) only the packages installed now, at
# the version installed, before the cache is saved. apt never deletes a
# package it has been told to keep, and a runner image with no cache of
# its own starts from another image's, so without this every save would
# hold every version of the fonts and Mesa fetched since the first, and
# grow into the repository's 10 GB of caches. What it keeps is what the
# next job of this image can install as it is.
#
# A package dpkg can't read (a download cut short) goes too. A machine
# whose installed packages can't be listed fails the step and loses
# nothing; site-setup then skips the save. Anything in the directory
# that is not a .deb is left alone.
set -euo pipefail
dir=$1
# dpkg's own fields, for dpkg to fill in, not the shell.
# shellcheck disable=SC2016
format='${Package}:${Architecture}=${Version}\n'
installed=$(dpkg-query -W -f "$format")
kept=0 seen=0
shopt -s nullglob
for deb in "$dir"/*.deb; do
  seen=$((seen + 1))
  if own=$(dpkg-deb --show --showformat "$format" "$deb" 2>/dev/null) \
    && grep -qxF -- "$own" <<<"$installed"; then
    kept=$((kept + 1))
  else
    rm -f -- "$deb"
  fi
done
echo "kept $kept of $seen packages"

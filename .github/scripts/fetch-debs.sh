#!/usr/bin/env bash
# Fetches the packages Chromium needs of the system into apt's package
# cache ($1) before apt installs them, so that apt takes them from there.
# Reads what `playwright install-deps --dry-run chromium` prints.
#
# apt fetches one package at a time from the first mirror of the
# runner's list (/etc/apt/apt-mirrors.txt) and keeps to it however slow
# it is. The same 32 MB took 2 s from azure.archive.ubuntu.com and
# 1 min 13 s, then 9 min 33 s, from us-east-2.ec2.archive.ubuntu.com,
# which stalled 30 s on each of six packages before handing them over:
# a cold run's site jobs waited on that, and every e2e job on them.
# Here each package is fetched at once with the others, and a mirror
# that hands it over slower than SPEED bytes a second for five seconds
# is left for the next one in the list. The last one is left only if it
# stalls: mirrors hand each connection over at 85–105 kB/s at times, all
# of them alike, and eight such fetches at once still beat apt's one.
#
# What lands is what apt's index names, checked by its hash, under the
# name apt looks for, so apt installs exactly what it would have
# fetched. Whatever can't be fetched or doesn't match is left to apt,
# which fetches it as before: this step can only save time, and never
# fails the job.
set -uo pipefail
dir=$1
speed=${SPEED:-262144}
jobs=${JOBS:-8}

# The dry run lists each missing package, dependencies included, two
# spaces in, one to a line.
mapfile -t packages < <(sed -n 's/^  \([a-z0-9][a-z0-9+.:~-]*\)$/\1/p')
if [ ${#packages[@]} -eq 0 ]; then
  echo "fetched 0 of 0 packages"
  exit 0
fi

# Where apt would fetch each package, what it names it, and its hash;
# none already in the cache. No lock: nothing is installed. Asked to
# print where they are, apt names each one's MD5 unless told otherwise.
if ! uris=$(apt-get install --print-uris -qq -y --no-install-recommends \
  -o Debug::NoLocking=1 -o Acquire::ForceHash=SHA256 \
  -o Dir::Cache::Archives="$dir/" "${packages[@]}"); then
  echo "apt can't say where the packages are: apt fetches them"
  exit 0
fi

scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT

fetch() {
  local uri=${1//\'/} name=$2 hash=$4
  local sum=${hash#*:} check
  local kind=${hash%%:*}
  case ${kind,,} in
    sha512) check=sha512sum ;;
    sha256) check=sha256sum ;;
    *) echo "left $name to apt: no hash to check it by ($kind)"; return 0 ;;
  esac
  local urls=()
  if [[ $uri == mirror+file:* ]]; then
    # mirror+file:<list>/pool/…: the same pool path on each mirror the
    # list names, in its order.
    local rest=${uri#mirror+file:}
    local list=${rest%%/pool/*} path=pool/${rest#*/pool/} mirror
    while read -r mirror _; do
      [ -n "$mirror" ] && [[ $mirror != \#* ]] && urls+=("${mirror%/}/$path")
    done < "$list"
  else
    urls=("$uri")
  fi
  local url part=$scratch/$name i floor
  for i in "${!urls[@]}"; do
    url=${urls[i]} floor=(--speed-limit "$speed" --speed-time 5)
    [ "$i" -lt $((${#urls[@]} - 1)) ] || floor=(--speed-limit 1024 --speed-time 30)
    if curl -fsSL --connect-timeout 5 "${floor[@]}" -o "$part" "$url" \
      && [ "$($check < "$part" | cut -d' ' -f1)" = "$sum" ]; then
      mv -f -- "$part" "$dir/$name"
      echo "fetched $name from ${url#*://}"
      return 0
    fi
    rm -f -- "$part"
  done
  echo "left $name to apt"
}
export -f fetch
export dir speed scratch

printf '%s\n' "$uris" | grep -v '^$' | xargs -r -P "$jobs" -L 1 bash -c 'fetch "$@"' _ | tee "$scratch/log"
echo "fetched $(grep -c '^fetched ' "$scratch/log") of $(printf '%s\n' "$uris" | grep -c .) packages"

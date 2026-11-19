#!/usr/bin/env bash
# fetch-debs.sh against a stubbed apt-get and curl: each package
# Playwright's dry run lists is put in apt's cache under apt's own name,
# with the bytes apt's index names, from the first mirror of the
# runner's list that hands it over at a usable speed. A mirror that
# stalls costs one try per package, not one per package per retry, and
# whatever can't be fetched is left to apt, as before.
# The checks call their helpers through check, which shellcheck cannot follow.
# shellcheck disable=SC2329
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
script="$here/fetch-debs.sh"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

body() { printf 'the bytes of %s\n' "$1"; }
sha512() { body "$1" | sha512sum | cut -d' ' -f1; }

# The runner's mirror list, as apt's mirror method reads it: the first
# stalls (as us-east-2.ec2.archive.ubuntu.com did, 30 s a package), the
# second hands everything over.
printf 'http://slow.example/ubuntu/\tpriority:1\nhttp://fast.example/ubuntu\tpriority:2\n' > "$work/mirrors.txt"

# apt-get --print-uris: one line per package not already in the cache,
# for the packages it was asked for. As apt does, it names each
# package's MD5 unless Acquire::ForceHash names another hash. It says
# what it was asked in $STUB_WORK/asked, and fails if STUB_FAIL is set.
mkdir "$work/bin"
cat > "$work/bin/apt-get" <<'STUB'
#!/usr/bin/env bash
[ -z "${STUB_FAIL:-}" ] || { echo "stub apt-get: failed" >&2; exit 100; }
printf '%s\n' "$@" > "$STUB_WORK/asked"
hash=md5 label=MD5Sum
for each in "$@"; do
  case ${each,,} in
    acquire::forcehash=sha256) hash=sha256 label=SHA256 ;;
    acquire::forcehash=sha512) hash=sha512 label=SHA512 ;;
  esac
done
list=mirror+file:$STUB_WORK/mirrors.txt
uri() { # uri name [the bytes the index names]
  local bytes=${3:-the bytes of $2}
  printf "'%s' %s %s %s:%s\n" "$1" "$2" 30 "$label" "$(printf '%s\n' "$bytes" | "${hash}sum" | cut -d' ' -f1)"
}
for each in "$@"; do
  case $each in
    fonts-liberation) uri "$list/pool/main/f/fonts-liberation/fonts-liberation_1%3a2.1.5-3_all.deb" "fonts-liberation_1%3a2.1.5-3_all.deb" ;;
    libgbm1) uri "$list/pool/main/m/mesa/libgbm1_25.2.8_amd64.deb" "libgbm1_25.2.8_amd64.deb" ;;
    libnss3) uri "http://security.example/ubuntu/pool/main/n/nss/libnss3_3.98_amd64.deb" "libnss3_3.98_amd64.deb" ;;
    libxkbcommon0) uri "$list/pool/main/libx/libxkbcommon/libxkbcommon0_1.6_amd64.deb" "libxkbcommon0_1.6_amd64.deb" "other bytes" ;;
  esac
done
STUB
# curl: says each URL it is given, and the speed it is held to, in
# $STUB_LOG; slow.example fails as curl does under --speed-limit (28),
# the others write the bytes.
cat > "$work/bin/curl" <<'STUB'
#!/usr/bin/env bash
out= url= limit=none
while [ $# -gt 0 ]; do
  case $1 in -o) out=$2; shift ;; --speed-limit) limit=$2; shift ;; http*) url=$1 ;; esac
  shift
done
echo "$url speed-limit=$limit" >> "$STUB_LOG"
case $url in http://slow.example/*) exit 28 ;; esac
printf 'the bytes of %s\n' "${url##*/}" > "$out"
STUB
chmod +x "$work/bin/apt-get" "$work/bin/curl"

fail=0
ok() { echo "ok - $1"; }
no() { echo "not ok - $1"; fail=1; }
check() { local what=$1; shift; if "$@"; then ok "$what"; else no "$what"; fi; }
count() { [ "$(grep -c -- "$2" "$1")" -eq "$3" ]; }
holds() { [ "$(sha512sum < "$1/$2" | cut -d' ' -f1)" = "$(sha512 "$2")" ]; }
entries() { [ "$(find "$1" -mindepth 1 | wc -l)" -eq "$2" ]; }
asked_for() { [ "$(tail -n "$#" "$work/asked" | tr '\n' ' ')" = "$* " ]; }

# What `playwright install-deps --dry-run chromium` prints.
dry_run() {
  printf 'Missing system dependencies (%s):\n' $#
  printf '  %s\n' "$@"
}
fetch() {
  local name=$1 input=$2; shift 2
  mkdir -p "$work/$name/cache"
  : > "$work/$name/fetched"
  env PATH="$work/bin:$PATH" STUB_WORK="$work" STUB_LOG="$work/$name/fetched" "$@" bash "$script" "$work/$name/cache" < "$input" > "$work/$name/out" 2>&1
}

dry_run fonts-liberation libgbm1 libnss3 libxkbcommon0 > "$work/dry-run"
if fetch some "$work/dry-run"; then ok "it runs"; else no "it runs ($(tail -1 "$work/some/out"))"; fi
cache=$work/some/cache
fetched=$work/some/fetched
check "apt is asked for the packages the dry run lists" asked_for fonts-liberation libgbm1 libnss3 libxkbcommon0
check "and nothing they only recommend" grep -qx -- --no-install-recommends "$work/asked"
check "apt is asked where they are, not to install them" grep -qx -- --print-uris "$work/asked"
check "with a hash stronger than the MD5 it names by default" grep -qix -- Acquire::ForceHash=SHA256 "$work/asked"
for deb in fonts-liberation_1%3a2.1.5-3_all.deb libgbm1_25.2.8_amd64.deb libnss3_3.98_amd64.deb; do
  check "$deb is in the cache, under apt's name, with the bytes apt's index names" holds "$cache" "$deb"
done
check "a package whose bytes are not the index's is left to apt" test ! -e "$cache/libxkbcommon0_1.6_amd64.deb"
check "nothing else is left in the cache" entries "$cache" 3
# Counted: three packages through the mirror list (one found wrong on
# both mirrors), one straight from its own host.
check "the stalled mirror is tried once for each package from the list" count "$fetched" '^http://slow.example/ubuntu/pool/' 3
check "the next mirror is tried once for each, with no double slash" count "$fetched" '^http://fast.example/ubuntu/pool/' 3
check "a package from a host of its own is fetched from it, once" count "$fetched" '^http://security.example/' 1
check "nothing else is fetched" count "$fetched" . 7
# Every mirror but the last is left as soon as it is slow; the last is
# held only to not stalling, as many fetches at once from one slow
# mirror still beat apt's one at a time from it.
check "the stalled mirror is held to the speed floor" count "$fetched" '^http://slow.example/.* speed-limit=262144$' 3
check "the last mirror is not" count "$fetched" '^http://fast.example/.* speed-limit=262144$' 0
check "it says how many it fetched" grep -qx 'fetched 3 of 4 packages' "$work/some/out"

: > "$work/nothing"
rm -f "$work/asked"
check "nothing missing is fine" fetch none "$work/nothing"
check "and apt is not asked" test ! -e "$work/asked"

check "an apt that can't say where the packages are fails nothing" fetch broken "$work/dry-run" STUB_FAIL=1
check "and nothing is fetched" entries "$work/broken/cache" 0
check "nor tried" count "$work/broken/fetched" . 0

exit $fail

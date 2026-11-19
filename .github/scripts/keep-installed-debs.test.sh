#!/usr/bin/env bash
# keep-installed-debs.sh against a stubbed dpkg: of the packages apt
# left in its cache, only the ones installed now, at the version
# installed, stay. Anything else in the directory is left alone, and a
# machine whose installed packages can't be read loses nothing.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
script="$here/keep-installed-debs.sh"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Each stub .deb holds the one line dpkg-deb --show prints for it
# ("unreadable" makes it fail, as on a truncated download);
# dpkg-query prints $STUB_DIR/installed, or fails if STUB_FAIL is set.
mkdir "$work/bin"
cat > "$work/bin/dpkg-deb" <<'STUB'
#!/usr/bin/env bash
deb=${!#}
[ "$(cat "$deb")" != unreadable ] || { echo "stub dpkg-deb: not a Debian archive" >&2; exit 2; }
cat "$deb"
STUB
cat > "$work/bin/dpkg-query" <<'STUB'
#!/usr/bin/env bash
[ -z "${STUB_FAIL:-}" ] || { echo "stub dpkg-query: failed" >&2; exit 2; }
cat "$STUB_DIR/installed"
STUB
chmod +x "$work/bin/dpkg-deb" "$work/bin/dpkg-query"

fail=0
present() { if [ -e "$2" ]; then echo "ok - $1"; else echo "not ok - $1 (removed)"; fail=1; fi; }
absent() { if [ ! -e "$2" ]; then echo "ok - $1"; else echo "not ok - $1 (still there)"; fail=1; fi; }

cache() {
  local dir="$work/$1"
  mkdir -p "$dir/partial"
  printf 'libgl1-mesa-dri:amd64=25.0.7-0ubuntu0.24.04.2\nfonts-liberation:all=1:2.1.5-3\nlibllvm20:amd64=1:20.1.2-0ubuntu1~24.04.2\n' > "$dir/installed"
  echo 'libgl1-mesa-dri:amd64=25.0.7-0ubuntu0.24.04.2' > "$dir/libgl1-mesa-dri_25.0.7-0ubuntu0.24.04.2_amd64.deb"
  echo 'libgl1-mesa-dri:amd64=25.0.7-0ubuntu0.24.04.1' > "$dir/libgl1-mesa-dri_25.0.7-0ubuntu0.24.04.1_amd64.deb"
  echo 'fonts-liberation:all=1:2.1.5-3' > "$dir/fonts-liberation_1%3a2.1.5-3_all.deb"
  echo 'libllvm20:i386=1:20.1.2-0ubuntu1~24.04.2' > "$dir/libllvm20_1%3a20.1.2-0ubuntu1~24.04.2_i386.deb"
  echo 'libllvm19:amd64=1:19.1.1-1ubuntu1~24.04.2' > "$dir/libllvm19_1%3a19.1.1-1ubuntu1~24.04.2_amd64.deb"
  echo unreadable > "$dir/libdrm2_2.4.122-1~ubuntu0.24.04.1_amd64.deb"
  : > "$dir/lock"
  : > "$dir/partial/libgbm1_25.0.7-0ubuntu0.24.04.2_amd64.deb"
  echo "$dir"
}
prune() {
  local dir=$1; shift
  env PATH="$work/bin:$PATH" STUB_DIR="$dir" "$@" bash "$script" "$dir"
}

dir=$(cache pruned)
prune "$dir" > "$work/pruned.out"
present "a package at the version installed stays" "$dir/libgl1-mesa-dri_25.0.7-0ubuntu0.24.04.2_amd64.deb"
present "an architecture-independent package at the version installed stays" "$dir/fonts-liberation_1%3a2.1.5-3_all.deb"
absent "an older version of an installed package goes" "$dir/libgl1-mesa-dri_25.0.7-0ubuntu0.24.04.1_amd64.deb"
absent "an installed package's version for another architecture goes" "$dir/libllvm20_1%3a20.1.2-0ubuntu1~24.04.2_i386.deb"
absent "a package no longer installed goes" "$dir/libllvm19_1%3a19.1.1-1ubuntu1~24.04.2_amd64.deb"
absent "a package dpkg can't read goes" "$dir/libdrm2_2.4.122-1~ubuntu0.24.04.1_amd64.deb"
present "what is not a package is left alone" "$dir/lock"
present "a partial download is left alone" "$dir/partial/libgbm1_25.0.7-0ubuntu0.24.04.2_amd64.deb"
if grep -qx 'kept 2 of 6 packages' "$work/pruned.out"; then echo "ok - it says how many it kept"; else echo "not ok - it says how many it kept (said '$(cat "$work/pruned.out")')"; fail=1; fi

mkdir "$work/none"
cp "$work/pruned/installed" "$work/none/installed"
if prune "$work/none" > /dev/null 2>&1; then echo "ok - a directory with no packages is fine"; else echo "not ok - a directory with no packages is fine"; fail=1; fi

dir=$(cache unread)
if prune "$dir" STUB_FAIL=1 > /dev/null 2>&1; then
  echo "not ok - unreadable installed packages fail the step"; fail=1
else
  echo "ok - unreadable installed packages fail the step"
fi
present "and nothing is removed" "$dir/libgl1-mesa-dri_25.0.7-0ubuntu0.24.04.1_amd64.deb"

exit $fail

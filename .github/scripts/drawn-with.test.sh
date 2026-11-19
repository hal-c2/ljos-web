#!/usr/bin/env bash
# drawn-with.sh against a stubbed fontconfig and dpkg: the hash moves
# with a font (its version or its file), a fontconfig rule or a library that draws, and with
# nothing else (the runner image's name, the order fc-list lists in,
# a package that draws nothing). A machine it cannot read gives no hash.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
script="$here/drawn-with.sh"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# fc-list prints $STUB_DIR/fonts as it is (failing if STUB_FAIL is
# set); dpkg-query prints $STUB_DIR/packages. Each ignores its
# arguments: the script's format is what these files are written in.
mkdir "$work/bin"
cat > "$work/bin/fc-list" <<'STUB'
#!/usr/bin/env bash
[ -z "${STUB_FAIL:-}" ] || { echo "stub fc-list: failed" >&2; exit 1; }
cat "$STUB_DIR/fonts"
STUB
cat > "$work/bin/dpkg-query" <<'STUB'
#!/usr/bin/env bash
cat "$STUB_DIR/packages"
STUB
chmod +x "$work/bin/fc-list" "$work/bin/dpkg-query"

fail=0
check() {
  if [ "$2" = "$3" ]; then echo "ok - $1"; else echo "not ok - $1 (got '$2', expected '$3')"; fail=1; fi
}
differs() {
  if [ "$2" != "$3" ]; then echo "ok - $1"; else echo "not ok - $1 (both '$2')"; fail=1; fi
}

# A machine: fonts, fontconfig's directory and installed packages.
machine() {
  local dir="$work/$1"
  mkdir -p "$dir/etc/conf.d"
  mkdir -p "$dir/share/dejavu" "$dir/share/liberation"
  echo 'DejaVu Sans glyphs' > "$dir/share/dejavu/DejaVuSans.ttf"
  echo 'Liberation Serif glyphs' > "$dir/share/liberation/LiberationSerif-Regular.ttf"
  printf '%s\tDejaVu Sans\tBook\t160000\n%s\tLiberation Serif\tRegular\t131072\n' "$fonts/dejavu/DejaVuSans.ttf" "$fonts/liberation/LiberationSerif-Regular.ttf" > "$dir/fonts"
  echo '<fontconfig><alias><family>serif</family></alias></fontconfig>' > "$dir/etc/fonts.conf"
  echo '<fontconfig/>' > "$dir/etc/conf.d/10-hinting.conf"
  printf 'curl=8.5.0-2ubuntu10.6\nlibfontconfig1=2.15.0-1.1ubuntu2\nlibgl1-mesa-dri=25.0.7-0ubuntu0.24.04.2\nlibllvm20=1:20.1.2-0ubuntu1~24.04.2\nmesa-vulkan-drivers=25.0.7-0ubuntu0.24.04.2\n' > "$dir/packages"
  echo "$dir"
}
# Every machine's fonts are at one path, as on the runners: a machine's
# own are put there before it is hashed.
fonts="$work/fonts"
hash_of() {
  local dir=$1; shift
  rm -rf "$fonts" && cp -r "$dir/share" "$fonts"
  env PATH="$work/bin:$PATH" STUB_DIR="$dir" FONTCONFIG_ETC="$dir/etc" "$@" bash "$script"
}

base=$(machine base)
first=$(hash_of "$base" ImageOS=ubuntu24 ImageVersion=20261111.127.1)
[ -n "$first" ] || { echo "not ok - a machine gives a hash"; exit 1; }
check "another image of the same fonts and libraries gives the same hash" \
  "$(hash_of "$base" ImageOS=ubuntu24 ImageVersion=20261116.376.1)" "$first"

sorted=$(machine sorted)
tac "$sorted/fonts" > "$sorted/fonts.r" && mv "$sorted/fonts.r" "$sorted/fonts"
check "fonts listed in another order give the same hash" "$(hash_of "$sorted")" "$first"

unrelated=$(machine unrelated)
sed -i 's/^curl=.*/curl=8.5.0-2ubuntu10.7/' "$unrelated/packages"
check "a package that draws nothing, at another version, gives the same hash" "$(hash_of "$unrelated")" "$first"

font=$(machine font)
sed -i 's/\t160000$/\t161000/' "$font/fonts"
differs "a font at another version gives another hash" "$(hash_of "$font")" "$first"

glyphs=$(machine glyphs)
echo 'DejaVu Sans glyphs, redrawn' > "$glyphs/share/dejavu/DejaVuSans.ttf"
differs "a font file changed under the same name and version gives another hash" "$(hash_of "$glyphs")" "$first"

added=$(machine added)
echo 'Noto Color Emoji glyphs' > "$added/share/NotoColorEmoji.ttf"
printf '%s\tNoto Color Emoji\tRegular\t131072\n' "$fonts/NotoColorEmoji.ttf" >> "$added/fonts"
differs "one more font gives another hash" "$(hash_of "$added")" "$first"

rule=$(machine rule)
echo '<fontconfig><match/></fontconfig>' > "$rule/etc/conf.d/10-hinting.conf"
differs "a fontconfig rule changed gives another hash" "$(hash_of "$rule")" "$first"

mesa=$(machine mesa)
sed -i 's/^mesa-vulkan-drivers=.*/mesa-vulkan-drivers=25.0.7-0ubuntu0.24.04.3/' "$mesa/packages"
differs "a Mesa at another version gives another hash" "$(hash_of "$mesa")" "$first"

llvm=$(machine llvm)
sed -i 's/^libllvm20=.*/libllvm21=1:21.1.0-0ubuntu1~24.04.1/' "$llvm/packages"
differs "another LLVM (llvmpipe, lavapipe) gives another hash" "$(hash_of "$llvm")" "$first"

if out=$(hash_of "$base" STUB_FAIL=1 2>/dev/null); then
  echo "not ok - fontconfig failing gives no hash (got '$out')"; fail=1
else
  echo "ok - fontconfig failing gives no hash"
fi

exit $fail

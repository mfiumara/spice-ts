#!/bin/sh
# Pinned existing ngspice-47 source. Native source/binaries stay ignored.
set -eu
root=evidence/1019
sha=a80f6e3e95d51534905b1f23410a951802666656
if [ ! -d "$root/native-src/.git" ]; then
  git init -q "$root/native-src"
  git -C "$root/native-src" fetch --depth 1 https://github.com/ngspice/ngspice.git "$sha"
  git -C "$root/native-src" checkout -q FETCH_HEAD
fi
[ "$(git -C "$root/native-src" rev-parse HEAD)" = "$sha" ]
git -C "$root/native-src" restore src/spicelib/devices/mos2/mos2load.c src/spicelib/devices/mos2/mos2conv.c src/spicelib/analysis/dctran.c src/maths/ni/niiter.c
(cd "$root/native-src" && ./autogen.sh)
python3 "$root/instrument-native.py" "$root/native-src"
python3 "$root/experiments/instrument.py" "$root/native-src"
# Override BISON_BIN for a non-Homebrew installation of bison >=3.
bison=${BISON_BIN:-/opt/homebrew/opt/bison/bin/bison}
mkdir -p "$root/native-build"
(cd "$root/native-build" && BISON="$bison" ../native-src/configure --with-readline=no --disable-debug --disable-openmp)
"$bison" -d -o "$root/native-src/src/frontend/parse-bison.c" "$root/native-src/src/frontend/parse-bison.y"
"$bison" -d -o "$root/native-src/src/spicelib/parser/inpptree-parser.c" "$root/native-src/src/spicelib/parser/inpptree-parser.y"
spice-heavy make -C "$root/native-build" -j2

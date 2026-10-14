#!/usr/bin/env bash
set -euo pipefail
# Run from repository root through spice-heavy. No user's HOME or spinit is read.
: "${TMPDIR:?Set TMPDIR to a dedicated scratch directory}"
here="$(cd "$(dirname "$0")" && pwd)"
source="${NGSPICE_SOURCE:-$TMPDIR/t_e457fe0a-ngspice47}"
if [ ! -d "$source/.git" ]; then
  if [ -d "$source" ]; then
    printf 'Existing non-git source directory; use a fresh TMPDIR or the documented manual build.\n' >&2
    exit 1
  fi
  git clone --branch ngspice-47 --depth 1 https://git.code.sf.net/p/ngspice/ngspice "$source"
fi
[ "$(git -C "$source" rev-parse HEAD)" = a80f6e3e95d51534905b1f23410a951802666656 ]
if ! git -C "$source" apply --reverse --check "$here/native.patch" 2>/dev/null; then
  git -C "$source" apply "$here/native.patch"
fi
(
  cd "$source"
  ./autogen.sh > autogen-receipt.txt 2>&1
  ./configure --disable-debug --without-x --enable-xspice --with-readline=no --disable-openmp > configure-receipt.txt 2>&1
  make -j2 > build-receipt.txt 2>&1
)
mkdir -p "$TMPDIR/t_e457fe0a-home"
printf 'set filetype=ascii\n' > "$TMPDIR/t_e457fe0a-home/.spiceinit"
export HOME="$TMPDIR/t_e457fe0a-home"
GM17_TRACE=1 "$source/src/ngspice" -b -r "$TMPDIR/t_e457fe0a-gm17.raw" "$here/original.cir" > "$TMPDIR/t_e457fe0a-gm17.out" 2> "$TMPDIR/t_e457fe0a-gm17.trace"
GM17_NO_LEAK=1 "$source/src/ngspice" -b -r "$TMPDIR/t_e457fe0a-gm17-no-leak.raw" "$here/original.cir" > "$TMPDIR/t_e457fe0a-gm17-no-leak.out" 2> "$TMPDIR/t_e457fe0a-gm17-no-leak.stderr"
GM17_NO_LEAK=1 "$source/src/ngspice" -b -r "$TMPDIR/t_e457fe0a-storage-no-leak.raw" "$here/storage-write.cir" > "$TMPDIR/t_e457fe0a-storage-no-leak.out" 2> "$TMPDIR/t_e457fe0a-storage-no-leak.stderr"

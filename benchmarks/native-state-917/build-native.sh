#!/bin/sh
# SPDX-License-Identifier: MIT
set -eu
cd "$(dirname "$0")/../.."
SOURCE=benchmarks/native-state-917/.work/ngspice
mkdir -p benchmarks/native-state-917/.work
if [ ! -d "$SOURCE/.git" ]; then
  git clone --depth 1 --branch ngspice-47 https://git.code.sf.net/p/ngspice/ngspice "$SOURCE"
fi
[ "$(git -C "$SOURCE" rev-parse HEAD)" = a80f6e3e95d51534905b1f23410a951802666656 ]
# Restore only the two files this script instruments, within its ignored checkout.
git -C "$SOURCE" restore src/maths/ni/niiter.c src/spicelib/analysis/optran.c
python3 benchmarks/native-state-917/instrument.py "$SOURCE"
BISON=${BISON:-/opt/homebrew/opt/bison/bin/bison}
cd "$SOURCE"
./autogen.sh
./configure YACC="$BISON -y" --with-x=no --enable-xspice --disable-debug --disable-openmp --with-readline=no
make -j2

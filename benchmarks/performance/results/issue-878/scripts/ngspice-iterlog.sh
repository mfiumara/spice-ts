#!/bin/bash
# Issue #878: build ngspice-47 with one per-timepoint iteration print and log
# the CMOS chain scaling deck.
#
#   ngspice-iterlog.sh <ngspice-47-source-dir> <out-dir> [nodes...]   (default 1000 10000)
#
# The source dir is a checkout of the ngspice-47 tag. ngspice-47-iterlog.patch
# adds, after the NIiter call in dctran.c, one stderr line per call when
# NGSPICE_ITERLOG is set: `ITERLOG CKTtime CKTdelta iterations converged
# CKTorder`. The build is configured as below (Homebrew bison 3.8 for the
# parser); its `.options acct` totals must equal the Homebrew ngspice-47
# binary's for the same deck (both report 483 transient iterations).
set -euo pipefail
SRC=$1; OUT=$2; shift 2
SIZES=${*:-1000 10000}
S=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$S/../../../../.." && pwd)
(cd "$SRC" && git apply --check "$S/ngspice-47-iterlog.patch" 2>/dev/null && git apply "$S/ngspice-47-iterlog.patch" || true)
export PATH=/opt/homebrew/opt/bison/bin:$PATH
(cd "$SRC" && ./autogen.sh && mkdir -p build-iterlog && cd build-iterlog \
  && ../configure --enable-xspice --enable-cider --disable-debug --without-x --with-readline=no \
       --disable-openmp CFLAGS=-O2 && make -j4)
mkdir -p "$OUT"
for n in $SIZES; do
  node --input-type=module -e "
    const { m2Netlist } = await import('$ROOT/benchmarks/performance/scaling-m2-fixture.mjs');
    (await import('node:fs')).writeFileSync('$OUT/cmos-inverter-chain-tran-$n.cir', m2Netlist('cmos-inverter-chain-tran', $n).netlist);"
  NGSPICE_ITERLOG=1 "$SRC/build-iterlog/src/ngspice" -b "$OUT/cmos-inverter-chain-tran-$n.cir" \
    > "$OUT/ngspice-$n.out" 2> "$OUT/ngspice-$n.err"
  grep ITERLOG "$OUT/ngspice-$n.err" > "$OUT/ngspice-47-$n.txt"
done

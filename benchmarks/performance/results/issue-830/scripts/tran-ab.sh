#!/bin/bash
# #830 transient A/B: base / step1 (step-limit only) / branch (plus convergenceTest), cmos-chain-tran 10k.
# Prereq: base build copied to $T/830-base (git stash; pnpm -C packages/core build; cp -r packages/core/dist $T/830-base), ngspice decks in $T/830-ng.
T=${TMPDIR:-/tmp}
S=$(cd "$(dirname "$0")" && pwd)
OUT=$T/830-tran-ab.jsonl; : > $OUT
for i in 1 2 3 4 5; do
  BUILD=base SPICE_TS_DIST=$T/830-base node $S/tran-run.mjs 10000 >> $OUT
  BUILD=step1 SPICE_TS_DIST=$T/830-step1 node $S/tran-run.mjs 10000 >> $OUT
  BUILD=branch node $S/tran-run.mjs 10000 >> $OUT
done
cat $OUT

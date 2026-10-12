#!/bin/bash
# Interleaved A/B: base dist vs branch dist, then ngspice-47, on cmos-chain OP decks.
# Prereq: base build copied to $T/830-base (git stash; pnpm -C packages/core build; cp -r packages/core/dist $T/830-base), ngspice decks in $T/830-ng.
T=${TMPDIR:-/tmp}
cd "$(dirname "$0")/../../../../.."
OUT=$T/830-ab.jsonl; : > $OUT
for n in 10000 50000; do
  w=1; [ $n = 50000 ] && w=0
  for i in 1 2 3 4 5; do
    SPICE_TS_DIST=$T/830-base node benchmarks/performance/profile-cmos-op.mjs $n 1 $w | sed 's/^{/{"build":"base",/' >> $OUT
    node benchmarks/performance/profile-cmos-op.mjs $n 1 $w | sed 's/^{/{"build":"branch",/' >> $OUT
    s=$(python3 -c 'import time;print(time.time())')
    ngspice -b $T/830-ng/cmos-op-$n.cir > $T/830-ng/out-$n-$i.log 2>&1
    e=$(python3 -c 'import time;print(time.time())')
    python3 -c "print('{\"build\":\"ngspice-47\",\"nodes\":$n,\"run\":$i,\"ms\":%.1f}' % (($e-$s)*1000))" >> $OUT
  done
done
cat $OUT

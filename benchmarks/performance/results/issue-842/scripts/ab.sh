#!/bin/bash
# Issue #842 interleaved A/B: base dist vs branch dist (and optionally ngspice-47)
# on the M2 scaling decks, one fresh process per sample.
#
#   ab.sh <out.jsonl> <rounds> <nodes> <circuit...>
#
# Odd rounds run base first, even rounds branch first.
# Env: BASE_DIST / BRANCH_DIST (copies of each build's packages/core/dist), NG_DIR (decks written
# by write-decks.mjs; when set, ngspice-47 runs each round too), WARMUPS and
# REPEATS: each spice-ts process runs WARMUPS unmeasured simulate() calls and
# reports the median of REPEATS measured ones (defaults: 1 and 1 below 50k
# nodes, a single cold call at 50k).
set -euo pipefail
OUT=$1; ROUNDS=$2; N=$3; shift 3
S=$(cd "$(dirname "$0")" && pwd)
if [ "$N" -ge 50000 ]; then W=${WARMUPS:-0}; else W=${WARMUPS:-1}; fi; R=${REPEATS:-1}
one() { BUILD=$1 SPICE_TS_DIST=$2 node "$S/run.mjs" "$3" "$N" $W $R | sed "s/^{/{\"round\":$i,/" >> "$OUT"; }
for i in $(seq 1 "$ROUNDS"); do
  for c in "$@"; do
    if [ $((i % 2)) = 1 ]; then
      one base "$BASE_DIST" "$c"; one branch "$BRANCH_DIST" "$c"
    else
      one branch "$BRANCH_DIST" "$c"; one base "$BASE_DIST" "$c"
    fi
    if [ -n "${NG_DIR:-}" ]; then
      s=$(python3 -c 'import time;print(time.time())')
      ngspice -b "$NG_DIR/$c-$N.cir" > "$NG_DIR/$c-$N-$i.log" 2>&1
      e=$(python3 -c 'import time;print(time.time())')
      python3 -c "print('{\"round\":$i,\"build\":\"ngspice-47\",\"circuit\":\"$c\",\"nodes\":$N,\"ms\":%.1f}' % (($e-$s)*1000))" >> "$OUT"
    fi
  done
done

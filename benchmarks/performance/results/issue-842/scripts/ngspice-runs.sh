#!/bin/bash
# Issue #842: ngspice-47 wall time (fresh `ngspice -b` process) and .options acct
# logs for the M2 decks written by write-decks.mjs.
#
#   ngspice-runs.sh <deck-dir> <out.jsonl> <rounds> <nodes> <circuit...>
set -euo pipefail
DIR=$1; OUT=$2; ROUNDS=$3; N=$4; shift 4
for i in $(seq 1 "$ROUNDS"); do
  for c in "$@"; do
    s=$(python3 -c 'import time;print(time.time())')
    ngspice -b "$DIR/$c-$N.cir" > "$DIR/$c-$N-$i.log" 2>&1
    e=$(python3 -c 'import time;print(time.time())')
    python3 -c "print('{\"round\":$i,\"build\":\"ngspice-47\",\"circuit\":\"$c\",\"nodes\":$N,\"ms\":%.1f}' % (($e-$s)*1000))" >> "$OUT"
  done
done

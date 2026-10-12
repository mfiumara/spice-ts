#!/usr/bin/env bash
# Issue #796: alternating main/branch compile-only A/B on every M2 deck.
#   bash benchmarks/performance/results/issue-796/scripts/compile-ab.sh <main-src> <rounds> [out.jsonl]
set -eu
main_src=$1
rounds=${2:-3}
out=${3:-/dev/stdout}
B=benchmarks/performance/results/issue-796/scripts/compile-bench.mts
for spec in "resistor-mesh-op 1000 41" "resistor-mesh-op 10000 15" "resistor-mesh-op 50000 7" \
            "rc-ladder-tran 1000 41" "rc-ladder-tran 10000 15" "rc-ladder-tran 50000 7" \
            "cmos-inverter-chain-tran 1000 41" "cmos-inverter-chain-tran 10000 15" "cmos-inverter-chain-tran 50000 7"; do
  for ((r = 0; r < rounds; r++)); do
    # shellcheck disable=SC2086
    printf '{"build":"main","round":%d,"result":%s}\n' "$r" "$(npx tsx $B $spec "$main_src" < /dev/null)" >> "$out"
    # shellcheck disable=SC2086
    printf '{"build":"branch","round":%d,"result":%s}\n' "$r" "$(npx tsx $B $spec packages/core/src < /dev/null)" >> "$out"
  done
done

#!/usr/bin/env bash
# Issue #796: in-process phase breakdown, main vs branch, alternating rounds.
#   bash benchmarks/performance/results/issue-796/scripts/breakdown-ab.sh <main-src> <out> [rounds]
# <main-src> is a copy of main's packages/core/src; it is mirrored into a
# scratch tree next to the #779 breakdown script and the M2 fixture.
set -u
main_src=$1
out=$2
rounds=${3:-2}
S=benchmarks/performance/results/issue-779/scripts/breakdown.mts
mirror=$(mktemp -d "${TMPDIR:-/tmp}/breakdown-796-XXXX")
mkdir -p "$mirror/packages/core" "$mirror/$(dirname $S)"
cp -r "$main_src" "$mirror/packages/core/src"
cp package.json tsconfig.base.json "$mirror/"
cp packages/core/package.json packages/core/tsconfig.json "$mirror/packages/core/"
cp benchmarks/performance/scaling-m2-fixture.mjs benchmarks/performance/scaling-fixture.mjs "$mirror/benchmarks/performance/" 2>/dev/null
cp "$S" "$mirror/$S"
for ((r = 0; r < rounds; r++)); do
  for build in main branch; do
    script=$S
    [ "$build" = main ] && script="$mirror/$S"
    for spec in "resistor-mesh-op 1000 41" "resistor-mesh-op 10000 11" "resistor-mesh-op 50000 5" \
                "rc-ladder-tran 10000 5" "rc-ladder-tran 50000 3"; do
      # shellcheck disable=SC2086
      line=$(npx tsx "$script" $spec < /dev/null 2>&1 | grep 'median of')
      echo "$build round $r $line (load $(sysctl -n vm.loadavg | awk '{print $2}'))" >> "$out"
    done
  done
done
rm -rf "$mirror"

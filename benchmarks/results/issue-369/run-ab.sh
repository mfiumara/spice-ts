#!/bin/sh
# Back-to-back before/after evidence for issue #369 on a shared, loaded host.
# Usage: sh benchmarks/results/issue-369/run-ab.sh <base-worktree-at-d3eaf5a> <round>
# The base worktree must have `pnpm install --frozen-lockfile` run in it.
set -eu
BASE="$1"
ROUND="$2"
HERE="$(pwd)"
D="$HERE/benchmarks/results/issue-369"
mkdir -p "$D/profiles"

# CPU profiles, before then after, same workload as issue-356.
(cd "$BASE" && pnpm -C packages/core build >/dev/null 2>&1 \
  && node --cpu-prof --cpu-prof-name="tokenizer-before-r$ROUND.cpuprofile" --cpu-prof-dir="$D/profiles" \
     benchmarks/performance/profile-spice-ts.mjs 10000 20)
(pnpm -C packages/core build >/dev/null 2>&1 \
  && node --cpu-prof --cpu-prof-name="tokenizer-after-r$ROUND.cpuprofile" --cpu-prof-dir="$D/profiles" \
     benchmarks/performance/profile-spice-ts.mjs 10000 20)

# Scaling benchmark (acceptance command), before then after.
(cd "$BASE" && pnpm bench:scaling -- --sizes=1000,5000,10000 --warmups=3 --runs=10 \
  --output=benchmarks/results/issue-369/scaling-before-r$ROUND.json >/dev/null \
  && cp "benchmarks/results/issue-369/scaling-before-r$ROUND.json" "$D/")
pnpm bench:scaling -- --sizes=1000,5000,10000 --warmups=3 --runs=10 \
  --output=benchmarks/results/issue-369/scaling-after-r$ROUND.json >/dev/null
echo "round $ROUND done"

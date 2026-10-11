#!/bin/bash
# usage: prof.sh <outdir> [cells...]  (cell = deck:nodes); runs in repo root
P=$1; shift; mkdir -p "$P"
for c in "$@"; do
  deck=${c%%:*}; n=${c##*:}; name=$deck-$n
  node --cpu-prof --cpu-prof-dir="$P" --cpu-prof-name=$name.cpuprofile benchmarks/performance/profile-scaling-m2.mjs $deck $n 1 > "$P/$name.out" 2>&1
  node benchmarks/performance/profile-summary.mjs "$P/$name.cpuprofile" 12 > "$P/$name.summary.txt"
  echo "== $name"; sed -n 1,16p "$P/$name.summary.txt"
done

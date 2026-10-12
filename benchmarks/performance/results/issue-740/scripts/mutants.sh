#!/usr/bin/env bash
# Issue #740 mutation checks: each mutant edits the #740 solver code, runs the
# complex-solver test files, and must make them fail. The source is restored
# after every mutant (and on exit).
#
#   bash benchmarks/performance/results/issue-740/scripts/mutants.sh
set -u
root=$(git rev-parse --show-toplevel)
cd "$root/packages/core"
solver=src/solver/complex-sparse-solver.ts
singletons=src/solver/column-singletons.ts
backup=$(mktemp -d)
cp "$solver" "$backup/solver.ts"
cp "$singletons" "$backup/singletons.ts"
restore() { cp "$backup/solver.ts" "$solver"; cp "$backup/singletons.ts" "$singletons"; }
trap 'restore; rm -rf "$backup"' EXIT

tests="src/solver/complex-sparse-solver-equivalence.test.ts src/solver/complex-sparse-solver.test.ts src/analysis/ac-pivot-order.test.ts"

# name | file | perl substitution (applied once)
mutants=(
  "solve skips the column unpermute|$solver|s/xRe\[colPerm\[j\]\] = zRe;\n      xIm\[colPerm\[j\]\] = zIm;/xRe[j] = zRe;\n      xIm[j] = zIm;/"
  "factorize scatters natural columns|$solver|s/const col = colPerm\[j\];/const col = j;/"
  "row permutation starts at identity|$solver|s/perm\.set\(this\.rowPref\);/for (let i = 0; i < n; i++) perm[i] = i;/"
  "default ordering is natural|$solver|s/options\.ordering \?\? 'amd'/options.ordering ?? 'natural'/"
  "no column singletons first|$solver|s/return columnSingletonsFirst\(union, order\);/return { colPerm: order, rowPref: Int32Array.from(order) };/"
  "union pattern ignores C|$solver|s/const qEnd = C\.colPtr\[j \+ 1\];/const qEnd = q;/"
  "union pattern ignores G|$solver|s/const pEnd = G\.colPtr\[j \+ 1\];/const pEnd = p;/"
  "singleton claims the first row, claimed or not|$singletons|s/if \(!rowClaimed\[rowIdx\[p\]\]\) \{ r = rowIdx\[p\]; break; \}/r = rowIdx[p]; break;/"
  "preferred rows not symmetric (lowest unclaimed)|$singletons|s/if \(!rowClaimed\[c\]\) \{/if (false) {/"
  "backward substitution uses y not z|$solver|s/yRe\[i\] -= uijRe \* zRe - uijIm \* zIm;/yRe[i] -= uijRe * yRe[j] - uijIm * zIm;/"
  "relative pivot threshold dropped|$solver|s/natMag > this\.pivotRelThreshold \* maxMag/natMag > 0/"
  "row-swap counter never increments|$solver|s/        swaps\+\+;\n//"
)

killed=0
total=0
for entry in "${mutants[@]}"; do
  IFS='|' read -r name file expr <<<"$entry"
  total=$((total + 1))
  restore
  perl -0pi -e "$expr" "$file"
  if cmp -s "$file" "$backup/$( [ "$file" = "$solver" ] && echo solver.ts || echo singletons.ts )"; then
    echo "NOT APPLIED  $name"
    continue
  fi
  if pnpm exec vitest run $tests >/dev/null 2>&1; then
    echo "SURVIVED     $name"
  else
    echo "killed       $name"
    killed=$((killed + 1))
  fi
done
restore
echo "$killed/$total mutants killed"

#!/usr/bin/env bash
# Issue #769 mutation checks: each mutant edits the pivot-reuse code of the
# complex AC LU, runs the complex-solver test files, and must make them fail.
# The source is restored after every mutant (and on exit).
#
#   bash benchmarks/performance/results/issue-769/scripts/mutants.sh
set -u
root=$(git rev-parse --show-toplevel)
cd "$root/packages/core"
solver=src/solver/complex-sparse-solver.ts
backup=$(mktemp -d)
cp "$solver" "$backup/solver.ts"
restore() { cp "$backup/solver.ts" "$solver"; }
trap 'restore; rm -rf "$backup"' EXIT

tests="src/solver/complex-sparse-solver-reuse.test.ts src/solver/complex-sparse-solver-equivalence.test.ts src/solver/complex-sparse-solver.test.ts src/analysis/ac-pivot-order.test.ts"

# name | perl substitution (applied once)
mutants=(
  "reuse never attempted|s/&& this\.refactorWithPivots\(G, C, omega\)/\&\& false \&\& this.refactorWithPivots(G, C, omega)/"
  "zero U entry not rejected|s/if \(ukjRe === 0 && ukjIm === 0\) return false;//"
  "recorded zero rows not checked|s/if \(xRe\[zeroRows\[z\]\] !== 0 \|\| xIm\[zeroRows\[z\]\] !== 0\) return false;//"
  "zero L row not rejected|s/if \(aRe === 0 && aIm === 0\) return false;//"
  "preferred pivot: relative threshold dropped|s/pivMag > relThreshold \* maxMag\)\) return false;/pivMag > 0)) return false;/"
  "swapped pivot: may fall below a later L row|s/!\(pivMag >= maxL\) \|\| //"
  "swapped pivot: tie with an earlier L row accepted|s/!\(pivMag > maxBefore\)/!(pivMag >= maxBefore)/"
  "swapped pivot: discovery rank ignored|s/pivotRank\[j\] = lp - lColPtr\[j\];/pivotRank[j] = 0;/"
  "swapped pivot: preferred row passing again not rejected|s/if \(natMag > absThreshold && natMag > relThreshold \* pivMag\) return false;//"
  "structure compared by colPtr only|s/for \(let p = 0; p < nnz; p\+\+\) if \(a\.rowIdx\[p\] !== b\.rowIdx\[p\]\) return false;//"
  "analyzePattern keeps stale pivots|s/this\.workspaceDirty = false;\n    this\.pivotsG = null;\n    this\.pivotsC = null;/this.workspaceDirty = false;/"
  "dirty workspace not cleared before a full factorization|s/if \(this\.workspaceDirty\) \{\n      wsRe\.fill\(0\);/if (false) {\n      wsRe.fill(0);/"
  "C entries scatter to G positions|s/xIm\[cScatterPos\[p\]\]/xIm[gScatterPos[p]]/"
  "zero rows stay in original row space|s/for \(let p = 0; p < zp; p\+\+\) zeroRows\[p\] = pinv\[zeroRows\[p\]\];//"
)

killed=0
total=0
for entry in "${mutants[@]}"; do
  IFS='|' read -r name expr <<<"$entry"
  total=$((total + 1))
  restore
  perl -0pi -e "$expr" "$solver"
  if cmp -s "$solver" "$backup/solver.ts"; then
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

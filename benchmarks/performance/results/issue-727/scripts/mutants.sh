#!/bin/bash
# Mutation checks for the #727 supernodal kernel: each mutant must fail the equivalence test.
cd "$(dirname "$0")/../../../../../packages/core" || exit 1
F=src/solver/gilbert-peierls.ts
cp $F "$TMPDIR/gp-orig-727.ts"
run() {
  name=$1; shift
  cp "$TMPDIR/gp-orig-727.ts" $F
  perl -0pi -e "$1" $F
  if cmp -s $F "$TMPDIR/gp-orig-727.ts"; then echo "$name: MUTATION NOT APPLIED"; return; fi
  if npx vitest run src/solver/gilbert-peierls-equivalence.test.ts >/dev/null 2>&1; then echo "$name: SURVIVED"; else echo "$name: killed"; fi
}
run reverse-first-touch-order 's/for \(let p = lColPtr\[first\]; p < lColPtr\[first \+ 1\]; p\+\+\) \{/for (let p = lColPtr[first + 1] - 1; p >= lColPtr[first]; p--) {/'
run apply-zero-members 's/      if \(u === 0\) continue;\n      if \(up === this.uValues.length\)/      if (up === this.uValues.length)/'
run keep-member-keys 's/while \(activeCount > 0 && activeK\[0\] <= snLast\)/while (false)/'
run no-activation 's/if \(v0 === 0 \|\| v1 === 0 \|\| v2 === 0 \|\| v3 === 0\)/if (false)/'
run reverse-member-order-in-row-blocks 's/      for \(let t = 0; t < count; t\+\+\) \{\n        const m = applied\[t\];/      for (let t = count - 1; t >= 0; t--) {\n        const m = applied[t];/'
run fma-like-pair 's/workspace\[row\] = workspace\[row\] - snValues\[valPtr \+ \(len - m2\) \* width \+ m\] \* u;/workspace[row] = workspace[row] + (-snValues[valPtr + (len - m2) * width + m]) * u * 1.0000000000000002;/'
run no-member-swap 's/    if \(from !== to\) \{/    if (false) {/'
run widen-drops-slot0 's/for \(let slot = m - 1; slot >= 0; slot--\)/for (let slot = m - 1; slot >= 1; slot--)/'
run tail-rows-no-activation 's/        if \(before === 0\) \{\n          activeCount = activateRow/        if (false) {\n          activeCount = activateRow/'
cp "$TMPDIR/gp-orig-727.ts" $F

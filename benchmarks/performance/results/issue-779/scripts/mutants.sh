#!/bin/bash
# Mutation checks for the #779 supernodal fast paths: each mutant must fail
# the equivalence test (bit-identity against the frozen pre-#669 kernel).
cd "$(dirname "$0")/../../../../../packages/core" || exit 1
F=src/solver/gilbert-peierls.ts
ORIG="${TMPDIR:-/tmp}/gp-orig-779.ts"
cp $F "$ORIG"
run() {
  name=$1; shift
  cp "$ORIG" $F
  perl -0pi -e "$1" $F
  if cmp -s $F "$ORIG"; then echo "$name: MUTATION NOT APPLIED"; return; fi
  if npx vitest run src/solver/gilbert-peierls-equivalence.test.ts >/dev/null 2>&1; then echo "$name: SURVIVED"; else echo "$name: killed"; fi
}
# Checked phase of a four-row group ends when only its first row is settled.
run break-on-first-settled 's/nonzeroFlag\[row0\] === settled && nonzeroFlag\[row1\] === settled\n          && nonzeroFlag\[row2\] === settled && nonzeroFlag\[row3\] === settled/nonzeroFlag[row0] === settled/'
# Checked phase of a four-row group never runs (no activation at all).
run skip-checked-phase 's/        \) break;\n        const m = applied\[t\];/        || true) break;\n        const m = applied[t];/'
# Consecutive slots assumed even when a member was skipped (zero U entry).
run always-consecutive 's/const allApplied = count === size - firstSlot;/const allApplied = true;/'
# Consecutive-slot loop starts one slot late.
run consecutive-off-by-one 's/for \(let s = firstSlot \+ t, sEnd/for (let s = firstSlot + t + 1, sEnd/'
# Indirect-slot unchecked loop applies members in reverse order.
run indirect-reverse-order 's/      \} else \{\n        for \(; t < count; t\+\+\) \{/      } else {\n        for (let t2 = count - 1, t0 = t; t2 >= t0; t2--, t++) { const tt = t2;/; s/const m = applied\[t\];\n          const u = appliedU\[t\];\n          v0 -= /const m = applied[tt];\n          const u = appliedU[tt];\n          v0 -= /'
# Remainder rows: only the first subtraction is checked.
run tail-rows-check-once 's/t < count && nonzeroFlag\[row\] !== settled; t\+\+/t < count \&\& t < 1; t++/'
# Triangular part: the updated member value is not written back.
run triangular-no-writeback 's/      workspace\[row\] = u;\n      if \(u === 0\) continue;/      if (u === 0) continue;/'
# Triangular part: earlier members applied in reverse order.
run triangular-reverse-order 's/for \(let t = 0; t < count; t\+\+\) u -= snValues\[base \+ applied\[t\]\] \* appliedU\[t\];/for (let t = count - 1; t >= 0; t--) u -= snValues[base + applied[t]] * appliedU[t];/'
cp "$ORIG" $F

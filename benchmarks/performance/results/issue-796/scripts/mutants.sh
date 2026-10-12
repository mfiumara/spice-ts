#!/bin/bash
# Mutation checks for the #796 compile fast paths: each mutant must fail
# src/compile-fast-paths.test.ts or the existing case-folding tests.
cd "$(dirname "$0")/../../../../../packages/core" || exit 1
TESTS="src/compile-fast-paths.test.ts src/case-folding.test.ts src/case-fold.test.ts"
FILES="src/circuit.ts src/case-fold.ts src/devices/resistor-model.ts"
SAVE="${TMPDIR:-/tmp}/mutants-796"
mkdir -p "$SAVE"
for f in $FILES; do cp "$f" "$SAVE/$(basename "$f")"; done
restore() { for f in $FILES; do cp "$SAVE/$(basename "$f")" "$f"; done; }
run() {
  name=$1; file=$2; shift 2
  restore
  perl -0pi -e "$1" "$file"
  if cmp -s "$file" "$SAVE/$(basename "$file")"; then echo "$name: MUTATION NOT APPLIED"; return; fi
  # shellcheck disable=SC2086
  if npx vitest run $TESTS >/dev/null 2>&1; then echo "$name: SURVIVED"; else echo "$name: killed"; fi
}
# Direct lookup without the folding fallback.
run no-fold-fallback src/circuit.ts 's/        \?\? nodeIndexMap.get\(canonicalByRaw.get\(name\) \?\? canonicalNode\(name\)\)!;/        ?? -1;/'
# Memo keeps the raw spelling instead of the display spelling.
run memo-raw-spelling src/circuit.ts 's/canonicalByRaw.set\(n, this.nodeSet.addCanonical\(globalNode\(n\)\)\)/(this.nodeSet.addCanonical(globalNode(n)), canonicalByRaw.set(n, n))/'
# .global mapping dropped on the fast path.
run no-global-map src/circuit.ts 's/const globalNode = globalNodes.size === 0/const globalNode = true/'
# addCanonical returns the new spelling even when a fold already exists.
run addcanonical-latest src/case-fold.ts 's/if \(spelling !== undefined\) return spelling;/if (spelling !== undefined) return name;/'
# Resistor without a model reads an empty record.
run resistor-empty-instance src/devices/resistor-model.ts 's/let instance = instanceParams;/let instance: Record<string, number> = {};/'
# Resistor with a model drops its card defaults.
run resistor-no-defaults src/devices/resistor-model.ts 's/instance = \{ \.\.\.defaults, \.\.\.instanceParams \};/instance = { ...instanceParams };/'
restore

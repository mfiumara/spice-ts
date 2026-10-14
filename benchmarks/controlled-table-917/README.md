# Smoothed E/G TABLE lowering. Refs #917

TABLE cards now run as B expression input -> XSPICE PWL -> original E/G
output, matching ngspice-47 inpcom.c. The PWL model uses input_domain=.1,
fraction=TRUE and limit=TRUE. The existing code model already implements
corner smoothing, iteration input limiting and operating-point AC derivatives;
no XSPICE device-model changes were needed.

The lowering runs before numparam. It retains preprocessing scopes and guards,
lowers included cards and folds TABLE continuations (including intervening
comments). Generated names avoid identifiers already present in the deck.
Subcircuit instances scope generated nodes/models independently, substitute
parameters per instance and map B-source v(port) and i(Vlocal) references.
G's m= is folded into its output gain, so the multiplier is evaluated in the
same instance scope without changing generic controlled-source stamping.
Output node order and polarity are preserved. Malformed literal tables still
raise ParseError; direct tokenizer/linear-validator callers fail closed on
unlowered TABLE rather than inventing control nodes.

The supervisor explicitly authorized the otherwise reserved parser/index.ts
and circuit.ts seams. They admit scoped PWL model cards and A instances only;
other scoped A families retain their existing unsupported boundary. No solver,
analysis, numparam or subcircuit-syntax files were changed. Existing #917 safety
tests were updated only where parse()/parseAsync() now support TABLE; the raw
tokenizer and direct-validator guards remain tested.

## RED -> GREEN

Fresh main cc40b4fc contains PR955, PR968, PR971, PR998 and PR976. This worktree
normally merged the existing scoped-parser prerequisite c6f66c9f and main.
RED commit 21319030b9368d8d7b0d6619ea7f94c104fae938 recorded 15 failures and
8 passes across the new transfer and scoped-PWL tests, before production
changes: root TABLE hit numparam's Unknown function v, scoped TABLE hit the
fail-closed guard, and scoped A dispatch failed. The initial numeric test
accessor was corrected from result.op to the actual result.dc API after the
parser failures were removed. GREEN production commit is
ce2acdd1a9e722166b9aaaa4b21afd39d9afa074.

Targeted final TABLE coverage passes 44/44, covering all six ngspice reference
inputs, G polarity/multiplicity, independent instance parameters/ports,
i(Vlocal), AC derivative 2.5 at the smoothed zero corner, internal-name
collision, reversed output polarity, table-pair parameters and continuations.
Build, lint/typecheck and guarded full monorepo tests passed. Final core
verification was 3759 passed / 2 skipped. Offline receipt verification
passes 3/3.

## Identical-byte MIT comparison

Both engines consume the unchanged MIT-authored e.cir and g-subckt.cir.
Each ngspice-47 and native DC sweep has 81 rows. before.json was remeasured
with the RED engine in .run/baseline at 21319030; after.json uses GREEN engine
ce2acdd1. The full input/output arrays, hashes and single-run timings remain
in the receipts. Errors below are absolute output-voltage errors over all
matched sweep rows, not rounded representative values.

| Deck | Before native | After native | Max absolute error | RMS absolute error |
| --- | --- | --- | --- | --- |
| e.cir | unsupported, numparam | success, 81 rows | 1.7763568394002505e-15 V | 3.9821690397709235e-16 V |
| g-subckt.cir | unsupported TABLE | success, 81 rows | 2.220446049250313e-15 V | 4.148161982993765e-16 V |

| Input | E output | G output with 1k load |
| --- | --- | --- |
| -2 | -2 | 2 |
| -1 | -1.95 | 1.95 |
| 0 | 0.025 | -0.025 |
| 0.5 | 1.5 | -1.5 |
| 1 | 2.925 | -2.925 |
| 2 | 3 | -3 |

Hard interpolation would miss the smoothed corners. No simulator tolerances
or vendor decks were tuned.

## Vendor 784: remaining execution loss, not parity

Issue #917 must stay OPEN pending the separate #939 solver work. Both original
vendor decks now parse and compile TABLE, but the solve still fails with
SingularMatrixError, pivot 2. There is no native AC waveform to compare.

| Original | Native RED | Native GREEN | ngspice-47 RED/GREEN | AC max/RMS error |
| --- | --- | --- | --- | --- |
| base_159 | unsupported TABLE, 0 completed AC rows | failure pivot 2, 0 completed AC rows | success, 141 rows each | null/null |
| variant_159 | unsupported TABLE, 0 completed AC rows | failure pivot 2, 0 completed AC rows | success, 141 rows each | null/null |

Fresh vendor-before.json and vendor-after.json use the exact same relocated
input bytes in this workspace. InputHashBefore/InputHashAfter agree for both
engines and both revisions, and all included-library hashes agree. The
nativeRevision field identifies the engine revision independently of the
wrapper revision. The original source hashes remain
72f59a88a9ddb4a8dabf4905e7590fdf9d5a51b8c427c60cc5d9e4dd5a722da4 and
119bec477c8d001d63198fce478ac7f2dc08c4f3c86321d9a5efa9cf54f58723.
The reference confirms ltps, XSPICE, SPARSE1.3 and successful dynamic gmin.

Vendor material stays fetch-only under the existing SOURCES.md policy.
No expressions, model bodies, raw vendor logs or error context are published.
The runner preserves #939's attachment verification, byte-preserving include
relocation, bounded child deadlines and cumulative budget. No shunts, pivot
changes or per-deck recovery settings are introduced.

## Timing observations, not a speed claim

Measured on Apple M5 Pro / Darwin arm64, Node v22.23.1, pnpm 10.28.1,
ngspice-47 LTPS. One observation per deck on a shared host:

| Deck | Native RED ms | Native GREEN ms | ngspice GREEN ms |
| --- | --- | --- | --- |
| e.cir | 1.925583 (rejection) | 16.449208 (success) | 20.508667 |
| g-subckt.cir | 1.391666 (rejection) | 7.192709 (success) | 17.019959 |
| base_159 | 7.478458 (rejection) | 167.581458 (solve failure) | 61.277834 |
| variant_159 | 6.585125 (rejection) | 180.109833 (solve failure) | 64.506625 |

These timings compare different execution paths; they cannot establish a
speedup. The reference includes process startup, while native timing is
in-process. Raw timings are retained in JSON.

## Reproduce

    pnpm install --frozen-lockfile
    pnpm -C packages/core exec vitest run src/parser/controlled-table-917*.test.ts
    spice-heavy pnpm exec tsx benchmarks/controlled-table-917/compare.ts after.json
    spice-heavy python3 benchmarks/controlled-table-917/vendor.py after
    pnpm exec tsx --test benchmarks/controlled-table-917/evidence.test.mts
    pnpm build && pnpm lint
    spice-heavy pnpm test
    pnpm -C packages/core exec tsc --noEmit --strict --skipLibCheck --module ESNext --target ES2022 --moduleResolution Bundler --types node ../../benchmarks/controlled-table-917/compare.ts ../../benchmarks/controlled-table-917/vendor-native.mts ../../benchmarks/controlled-table-917/evidence.test.mts

For the same-relocated-byte RED vendor engine, create a detached worktree at
21319030 inside .run/baseline, link the root node_modules there, then run:

    spice-heavy python3 benchmarks/controlled-table-917/vendor.py before benchmarks/controlled-table-917/.run/baseline/benchmarks/controlled-table-917/vendor-native.mts

The RED MIT comparison is the baseline worktree's compare.ts before.json;
its emitted receipt was copied here without altering measured fields.

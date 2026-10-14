# Controlled E/G TABLE safety slice. Refs #917

This implements the goal's fail-closed alternative, not TABLE numeric parity.
Issue #917 must stay open. No solver, structural-diagonal, preprocessor,
subcircuit-syntax, parser/index or circuit changes are made.

## What changed

A new `parser/controlled-table.ts` guard rejects an unlowered E/G TABLE card
with the existing structured `ParseError` (line and context). Two two-line
hooks cover logical-card tokenization and the direct controlled-source
validator. Tokenization rejects scoped/include/continuation forms before a
Circuit or bogus TABLE/expression control node can be returned. A genuine
linear control node called `table`, paired nodes and a braced gain remain legal.

Top-level node-dependent TABLE input was already rejected by numparam with
`Unknown function 'v'`, before tokenization. That structured failure remains.
Top-level constant TABLE input now receives the explicit unsupported error.
This slice does not pretend to implement a hard piecewise B expression:
ngspice-47 uses a smoothed, input-limited XSPICE PWL transfer. The measured
corner values below differ from hard interpolation.

Real lowering requires a pre-numparam hook, parameter/port/current-reference
mapping and scoped transfer-device support. `preprocessor.ts` and
`subcircuit-syntax.ts` are forbidden writers for this card. #955 was still
open when this slice was rebased onto origin/main
`d3901ec1355519e582dc068b4dec5cc033e22de8`. The reserved hotspot files are untouched.
The supervisor must route the remaining lowering and any post-#955 integration.
The independent structural-diagonal weakness diagnosed in #939 remains out
of scope; no shunts, solver pins or per-deck tuning are introduced.

## RED and GREEN

- Original RED commit `f07539c06b140514d7bd4bd05fc1eb4c8164efb2`, now
  `18ae01dcc3649175ce876d6f5c5d5d10066d119e` after rebasing. The 13-test
  regression failed 11 tests, exit 1, before production changes.
- GREEN commit `a485bb1819df815dd135cbefe78a69add931a525` adds the guard and
  one regression protecting paired `table` control nodes with a braced gain.
  Targeted run passed 54 tests (14 safety, 35 behavioural-expression, 5 POLY).
- Final targeted run passed 55 tests (15 safety) after adding protection for
  a genuine `table` control node with an `m=` parameter.
- Before engine receipts were measured with the two new guard calls temporarily
  disabled. The production behavior was the RED baseline; unused imports and
  the new helper were inert. Guard calls were restored before GREEN verification.
  The receipts' baseline field identifies the then-current commit, not a clean
  working tree. After receipts were measured with guards enabled.

## Identical-byte MIT probes

`e.cir` and `g-subckt.cir` are original MIT-authored decks. Both engines consume
identical bytes; each ngspice-47 DC sweep has 81 rows. Both before/after files
retain every reference input/output point, hashes, native errors and timings.
Native values are unavailable, so max/RMS error is null, not zero.

Representative ngspice output volts (input values rounded for presentation):

| Input | E output | G output with 1k load | Native after |
| --- | --- | --- | --- |
| -2 | -2 | 2 | unsupported |
| -1 | -1.95 | 1.95 | unsupported |
| 0 | 0.025 | -0.025 | unsupported |
| 0.5 | 1.5 | -1.5 | unsupported |
| 1 | 2.925 | -2.925 | unsupported |
| 2 | 3 | -3 | unsupported |

The E probe retains its earlier numparam rejection. The scoped G changes from
`SingularMatrixError` to explicit unsupported TABLE `ParseError`. Neither is a
numeric parity win. The reference-only endpoint/corner evidence uses the same
1e-12 absolute assertion for all representative values, not native tolerances.

## Fetch-only vendor 784 originals

`vendor.py` reuses #939's existing attachment SHA256 verification, byte-preserving
include-path relocation, ngspice configuration, child-group deadlines and
600-second cumulative actual-child-wall budget. New outputs are separate from
#939; its tracked receipts are unchanged. `vendor-native.mts` catches failures
and emits only type, status, pivot, timing and a context hash. No vendor error
text, expressions, model bodies or raw logs are published. All heavy execution
was serialized through `spice-heavy`.

| Original | Native before | Native after | ngspice before/after | AC max/RMS error |
| --- | --- | --- | --- | --- |
| base_159 | failure, pivot 2 | unsupported TABLE | success, 141 rows each | null/null |
| variant_159 | failure, pivot 2 | unsupported TABLE | success, 141 rows each | null/null |

Before and after have identical relocated input hashes and include hashes.
Actual single-run timings are retained in each JSON receipt.
Both references confirm ps/lt compatibility, XSPICE, SPARSE1.3 and successful
dynamic gmin. Native completions remain 0/2. Earlier rejection is not a speedup
claim: these are different failure paths, single observations on a shared host.

Original deck hashes remain
`72f59a88a9ddb4a8dabf4905e7590fdf9d5a51b8c427c60cc5d9e4dd5a722da4`
and `119bec477c8d001d63198fce478ac7f2dc08c4f3c86321d9a5efa9cf54f58723`.
Source/licence details remain in `benchmarks/SOURCES.md` and existing ticket
metadata; no vendor redistribution permission is inferred from the MIT probes.

## Reproduce and verification

    pnpm install --frozen-lockfile
    pnpm -C packages/core exec vitest run src/parser/controlled-table-917.test.ts src/parser/poly-trtol-862.test.ts src/parser/behavioral-expression.test.ts
    spice-heavy pnpm exec tsx benchmarks/controlled-table-917/compare.ts after.json
    spice-heavy python3 benchmarks/controlled-table-917/vendor.py after
    pnpm exec tsx --test benchmarks/controlled-table-917/evidence.test.mts
    pnpm build && pnpm lint
    spice-heavy pnpm test
    pnpm -C packages/core exec tsc --noEmit --strict --skipLibCheck --module ESNext --target ES2022 --moduleResolution Bundler --types node ../../benchmarks/controlled-table-917/compare.ts ../../benchmarks/controlled-table-917/vendor-native.mts ../../benchmarks/controlled-table-917/evidence.test.mts

All final commands above exited 0. The full suite ran before the rebase and
passed, including core 3604 passed/2 skipped, plus other workspace/benchmark
suites. The exact-head GitHub required checks remain the final full gate.
Offline receipts tests pass 3/3. RED remains exit 1 by design.

Failed development attempts were not simulator results: initial `.mts` harness
import failed on the root harness's CJS boundary; moving to `.ts` exposed the
need for an async main. Both were fixed and the real comparisons then ran.
The first vendor shim mistakenly used `includeResolver` instead of the actual
`resolveInclude` option; that missing-include trial is not the reported after
result. Final vendor before/after reruns use the correct option and verify
explicit TABLE rejection. Private budget/log history remains under `.run/`.
The plugin skill loader returned an IsADirectory error; poteto-mode and its
bug-fix playbook were loaded from the installed SKILL.md paths instead.

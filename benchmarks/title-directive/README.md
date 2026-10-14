# .title regression (#957), corpus-j j-16

The parser consumes only the `.title` card as metadata before numparam
substitution or subcircuit expansion. Subsequent `+` lines continue the preceding
circuit card, not the title. ngspice-47 replaces the physical
deck title; spice-ts exposes neither physical titles nor `.title` text on Circuit,
so this change adds no title API or circuit semantics. Other unsupported
directives still fail explicitly.

## Identical-input evidence

Original spicelib `examples/testfiles/test_kicad_nets.cir`, revision
`d8f8ecceeb361741f1f660f03b03ac49697f8700`, GPL-3.0-only. Provenance and licence
remain in [corpus-j/SOURCES.md](../corpus/corpus-j/SOURCES.md),
[manifest.json](../corpus/corpus-j/manifest.json) and [benchmarks/SOURCES.md](../SOURCES.md).
No fixture bytes, analyses, tolerances, or source records changed.

SHA-256 `5a124dc0286910a59a8782d0094a9bf8a57507a9c864090b6745ef4230b88f7f`.
Both runs use the unchanged `corpus-j/part2.ts --engine` adapters. Its ngspice
source/write wrapper only exports vectors from the original control deck.
The shared corpus metric and uniform per-quantity floors are unchanged.
No per-circuit tolerance tuning, adapted deck, full-corpus refresh, or speed claim.

- Before: ngspice-47 succeeds (`op:1`); spice-ts unsupported at line 2,
  `Unsupported dot command: '.title'`. Outcome `spice-ts-loss`, zero compared
  signals, error metrics null, not zero. [before.json](before.json) retains this loss.
- After: both engines succeed (`op:1`), 1 compared analysis, 7 compared signals,
  outcome `matched`, worst peak-normalized error 0. [after.json](after.json)
  retains every per-signal max/RMS absolute and relative metric, including nulls.

| Signal | Max absolute | RMS absolute | Max relative | RMS relative |
|---|---:|---:|---:|---:|
| i(v1) | 0 | 0 | null | null |
| i(v2) | 0 | 0 | null | null |
| v(/sub/vin_p) | 0 | 0 | null | null |
| v(/vin_n) | 0 | 0 | null | null |
| v(/vout) | 0 | 0 | null | null |
| v(vcc) | 0 | 0 | 0 | 0 |
| v(vee) | 0 | 0 | 0 | 0 |

Relative error is undefined for the five zero-reference signals, not zero.
The uniform peak-normalized match criterion still applies to them. This simple,
non-functional deck establishes parser compatibility, not nonlinear accuracy.

## Reproduce

At the fixed head, build and rerun only this original fixture:

    pnpm build && pnpm lint
    pnpm -C packages/core exec vitest run src/parser/title-directive-957.test.ts src/parser/parser.test.ts src/parser/preprocessor.test.ts src/parser/parse-preprocess-parity.test.ts
    spice-heavy pnpm exec tsx benchmarks/title-directive/compare.ts after

Initial GREEN: 116 tests across 4 files, including 7 new regression tests. RED at commit
`6e51401a`: all 7 original regressions fail, including the exact j-16 line-2 error.
The GREEN commit also corrects the synthetic test's hierarchical device name
expectation (`X1.R1`). No production device naming changes were made.
For the numerical baseline, build the RED commit and run `compare.ts before`
from this head against that bundle. The adapters load `packages/core/dist`.
Receipts identify the corresponding core tree. Both phases were actually run
serially under one `spice-heavy` slot, rebuilding between phases.
Root full-suite tests were not run locally per the card's targeted-test rule;
required GitHub CI remains the authoritative full gate.

Cold child wall (pnpm/tsx startup, adapter, parse/solve, export included):

| Phase | ngspice wall ms | spice-ts wall ms |
|---|---:|---:|
| Before | 720.316834 | 1243.48575 |
| After (continuation fix, refreshed) | 536.654125 | 945.315 |

One measurement per phase under shared-host load. No statistical speed inference.

## Continuation remediation

PR #976's rejected head `04de921d` incorrectly swallowed title continuations.
The prior synthetic metadata test asserted the wrong reference behavior and is
corrected. RED commit `8d3387fe` adds two regressions, both fail (exit 1);
GREEN `868d17fa` passes 118 tests across the same four files (exit 0).
`pnpm build && pnpm lint` also exits 0. Existing #843 tests pass 20/20 and
#837 tests pass 14/14 (each exit 0). Full tests remain the exact-head CI gate.

Reference [ngspice-47 inpcom.c](https://github.com/imr/ngspice/blob/ngspice-47/src/frontend/inpcom.c)
lines 1442-1456 comment `.title` before stitching at line 1958. Lines 694-702
skip comments while preserving the preceding regular card. The fix mirrors that
ordering, retaining source lines without swallowing `+` input or evaluating title text.

Reproduce the differential probes with
`spice-heavy pnpm exec tsx benchmarks/title-directive/continuations.ts after`.
For `before`, use the RED commit's core sources with this script. Receipts retain
identical deck bytes, hashes, raw ngspice output and exit codes in
`continuations-{before,after}.json`. These original MIT project probes are
registered in `benchmarks/SOURCES.md`; they do not replace j-16 or count as
new public-corpus circuits.

- Resistor across two titles and two continuations: ngspice exits 0, current
  -0.002 A. Before spice-ts rejects R1 at line 3; after current is -0.002 A.
- Undefined `{missing}` on a continuation: ngspice exits 1. Before spice-ts
  wrongly succeeds with -0.001 A; after it rejects the undefined parameter.

The original j-16 before-loss receipt is retained. `after.json` is refreshed on
the corrected core. No benchmark input or tolerance changes, no speed claim.

## PR955 merge interaction

Main `e1d8c9c1145a516977091efbd98da914fca1bf37` introduces raw X-call
continuation lookahead. It initially stopped at `.title` before the later
metadata blanking, leaving an empty RHS or an unmatched brace/quote. The
bounded fix skips title metadata in that lookahead, like blank/comment lines;
it does not alter assignment parsing or source-line accounting.

RED: all 16 new tests failed, covering numeric/bare/braced/quoted RHS values,
top-level/nested calls and titleless/physical-title parsing. GREEN: all 58
tests in the #957/#797 focused suites pass. Eight identical-byte native
ngspice-47 probes succeed before and after with resistance 2000 ohms and
i(v1)=-0.0005 A; spice-ts fails all eight before and succeeds after.

    spice-heavy pnpm exec tsx benchmarks/title-directive/x-continuations.ts after

The before phase was run on the uncommitted main merge before the scanner
fix; both receipts identify that state explicitly rather than claiming HEAD
alone reproduces it. Original MIT project probes, not novel corpus fixtures.

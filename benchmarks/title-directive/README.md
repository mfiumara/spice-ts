# .title regression (#957), corpus-j j-16

The parser consumes `.title` as metadata, including its continuations, before
numparam substitution or subcircuit expansion. ngspice-47 replaces the physical
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

GREEN: 116 tests across 4 files, including 7 new regression tests. RED at commit
`6e51401a`: all 7 regressions fail, including the exact j-16 line-2 error.
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
| After | 838.1244159999999 | 1315.092833 |

One measurement per phase under shared-host load. No statistical speed inference.

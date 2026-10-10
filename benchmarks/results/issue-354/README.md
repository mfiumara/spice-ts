# Issue #354 two-source DC sweep receipt

This receipt verifies the bounded two-source `.dc` support required before VBIC issue #352 can resume. It does not claim VBIC support or waveform parity.

## Identical fixture

- Fixture: `benchmarks/corpus/ngspice/fixtures/tests/vbic/FO.cir`
- SHA-256: `de57231ef8879e785b07068db662bfa5ecfde8734011b88b09f319b826242e92`
- Adaptation: none
- Sweep: `.DC VC 0 5 50M VB 700M 1 50M`

## Before and after

| Engine/state | Primary points | Secondary points | Returned points |
|---|---:|---:|---:|
| spice-ts before #354 | 101 | discarded | 101 |
| ngspice-47 unchanged fixture | 101 | 7 | 707 |
| spice-ts after #354 synthetic execution with the identical grid | 101 | 7 | 707 |

The focused RED test showed that the parsed analysis retained only `VC 0..5 by 0.05`. The GREEN parser preserves `VB 0.7..1 by 0.05`, and the native solver returns the Cartesian product in ngspice order. The first source is the inner, fast-varying dimension. The second source is the outer, slow-varying dimension.

Flat ordering is `secondaryIndex * primaryPoints + primaryIndex`. Receipt samples are `(index, VC, VB)` = `(0, 0, 0.7)`, `(100, 5, 0.7)`, `(101, 0, 0.75)`, and `(706, 5, 1)`.

## Supported contract

- One-source `.dc source start stop step` remains supported unchanged.
- Two-source `.dc source start stop step source2 start2 stop2 step2` is supported for independent voltage or current sources.
- Every grid value must be finite. Steps must be nonzero and directed toward the stop value.
- The two source names must be distinct under SPICE case-insensitive matching.
- Partial secondary ranges, trailing arguments, and three or more dimensions fail explicitly.
- `DCSweepResult.sweepValues` contains point-aligned primary coordinates.
- `DCSweepResult.secondarySweepValues` contains point-aligned outer coordinates when present.
- Text and programmatic `Circuit.addAnalysis('dc', ...)` execution produce identical coordinate arrays.
- Resource-limit preflight counts the full Cartesian product. Step-worker revival preserves both coordinates.

## Reproduce

    pnpm -C packages/core build
    pnpm exec tsx benchmarks/results/issue-354/verify.ts --output benchmarks/results/issue-354/report.json

The verifier hashes the fixture, executes it unchanged with ngspice-47, parses it with spice-ts, and runs a linear synthetic deck with the exact same two-source grid through both spice-ts text and programmatic APIs.

`report.json` is the machine-readable receipt.

## Published losses and boundaries

- spice-ts still rejects the unchanged fixture's unsupported VBIC LEVEL=4 parameters. Issue #354 only removes the nested-sweep blocker.
- No waveform-error metrics are reported because spice-ts cannot yet execute the VBIC device model.
- No runtime comparison or superiority claim is made.
- The fixture, tolerance defaults, and circuit values were not changed.

# Issue 386 aggregate parity refresh receipt

This receipt covers the 100-fixture aggregate run after PR #367 (bounded nonlinear diode distortion, #363) and PR #379 (PULSE zero TR/TF defaults to TSTEP, #375) merged. It makes no M1 completion, parity, speed, or superiority claim.

## Inputs and tools

- Base commit: `2b7e0478` (`main` after #373). Merges since the previous aggregate (`b259a21`, PR #325): #372 (docs only), #371 (`packages/wasm` only), #378 (tokenizer/number-parse performance), #379, #367, #373.
- Previous aggregate: issue #321, PR #325, head `ad7ba71b65848053afa7bc64ba22fd989ef89ca4`, deterministic outcome `68aa8e2e7b78b82f801da84cf5c88c489634d203f44bca5df9345a1946deddb9`.
- Aggregate corpus-tree SHA-256 `01b19fe5baf170d91aa5bd72c3ffb3891ed2f2c45cca5adfee8288552a7e14f1`, unchanged. No fixture, manifest, or tolerance changed.
- `benchmarks/SOURCES.md` SHA-256 is now `49379991e8f1f84c1289f78d50608fc7b6d1b3d3a8bcaed67320e5202213f2e5` (was `f8cc5777…`). The only change is the issue-368 WASM RLC source record merged with #371; this branch does not edit `SOURCES.md`. The aggregate pins this hash, so the pin moves with it.
- Apple M5 Pro, macOS 27.0.1 (Darwin 27.0.0) arm64, Node v22.23.1, pnpm 10.28.1, spice-ts 0.3.0, ngspice-47. Shared host, load average about 23–37 throughout.

## Result

- Deterministic outcome SHA-256: `0cbdd032bb0dd9aef86a9063697a034da918aecfa79643dae307d90ade8b82b5`.
- ngspice-47: 52 success, 9 failed, 39 unsupported (unchanged).
- spice-ts: 55 success, 1 failed, 44 unsupported (was 55/2/43).
- Comparable results: 58 analyses across 43 fixtures (unchanged); 878 absolute and 848 relative signals (unchanged).
- Worst per-signal envelope unchanged: absolute max/RMS `1169140310571.719` (`ngspice/vbic-common-emitter-ac`), relative max `45497356677842.63` and RMS `872317191517.6284` (`classic/coupled-lossy-lines` `v(5)`).

## Status transitions

One, spice-ts only:

- `classic/diode-distortion`: failed → unsupported. #367 removes the ideal-RLC-only `.disto` rejection and `simulate()` now returns a 101-frequency distortion result. The corpus harness does not map `.disto` results, so the row records `no spice-ts result for analyses: disto`. This is not a parity gain; no distortion error is measured yet. Filed as #391.

## Comparison transitions (all published, losses included)

The six fixtures whose metrics changed all use PULSE sources (#379):

| Fixture | spice-ts points | Worst abs max before | Worst abs max after |
|---|---|---|---|
| `xyce/rlc-transient` | 1002 → 1018 | 10 V `v(1)` | 0.000752 V `v(2)` |
| `classic/mos-memory-cell` | 158 → 144 | 22496.7 A `i(vwb)` | 9.91 V `v(8)` (loss remains) |
| `ngspice/ltra-line-transient` | 685 → 665 | 2.499 V `v(168)` | 0.416 V `v(3)` |
| `classic/lossy-line-aluminium` | 3968 → 3969 | 1.3472 V `v(3)` | 1.3472 V `v(3)` |
| `classic/lossy-line-24-inch` | 2831 | 3.6521 V `v(3)` | 3.6521 V `v(3)` |
| `classic/coupled-lossy-lines` | 3646 | 5.1956 V `v(x1.6)` | 5.1956 V `v(x1.6)` |

Per-signal losses:

- `ngspice/ltra-line-transient` `v(3)` absolute RMS +5.2% (0.04522 → 0.04755 V).
- `classic/mos-memory-cell` `i(vw)` absolute RMS +4.7% (0.000823 → 0.000862 A).
- `classic/lossy-line-aluminium`: absolute RMS rises on 89 of 261 signals, by at most 0.1% on non-negligible signals; `v(x1.x1.x1.x1.x1.x1.x1.x1.4)` relative max rises 2314.5 → 7220.6 while its absolute max stays 0.2614 V.
- `classic/lossy-line-24-inch` and `classic/coupled-lossy-lines` change only at rounding level.

Matched samples: absolute 9,182,709 → 9,182,748; relative 9,147,783 → 9,147,852; excluded zero references 34,926 → 34,896.

Runtime sums are single samples on a loaded shared host and support no speed claim.

## Commands

```text
pnpm install --frozen-lockfile            PASS (lockfile unchanged)
pnpm build                                PASS (45 s)
pnpm exec tsx benchmarks/aggregate-report.ts          PASS, outcome 0cbdd032…
pnpm exec tsx benchmarks/aggregate-report.ts --check  PASS, 100 fixtures, 58 analyses (4 min 5 s)
pnpm exec tsx --test benchmarks/aggregate-report.test.ts   PASS 13/13
pnpm lint                                 PASS
pnpm test                                 PASS (core 1082/1082 and all other workspaces)
pnpm bench:accuracy                       PASS, 7 ✓, retained BJT CE bias warning 2.61%
git diff --check                          PASS
```

Two full regenerations produced identical per-fixture statuses and metrics; only runtimes and volatile error text differed.

## TDD receipt

RED: the updated ledger test (`commits the transition ledger against the latest accepted report`) failed against the stale artifacts (12/13). GREEN: 13/13 after regenerating the artifacts from the same 100 fixture bytes.

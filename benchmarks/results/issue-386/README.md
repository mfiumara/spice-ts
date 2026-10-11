# Issue 386 aggregate parity refresh receipt

This receipt covers the 100-fixture aggregate run on `main` after these merges since the previous aggregate (PR #325): #367 (bounded nonlinear diode distortion, #363), #379 (PULSE zero TR/TF defaults to TSTEP, #375), #361 (bounded VBIC FO DC, #352), #390 (diode CJO alias, #365), #394 (per-segment nested DC alignment, #384), #392 (grounded-substrate BJT `.model` resolution, #382), #405 (diode VJ/FC, #388), #383 (classic `.noise` harness mapping, #380), #360 (NHFET level-5, #339) and #377 (inductor-ringing termination, #366). #371, #372, #373, #378, #395, #396, #398 and #399 touch WASM, docs, receipts, refactors, protocol options and tokenizer performance only. It makes no M1 completion, parity, speed, or superiority claim.

## Inputs and tools

- Base: `origin/main` at `b3e534e` (#377).
- Previous aggregate: issue #321, PR #325, head `ad7ba71b65848053afa7bc64ba22fd989ef89ca4`, deterministic outcome `68aa8e2e7b78b82f801da84cf5c88c489634d203f44bca5df9345a1946deddb9`.
- Aggregate corpus-tree SHA-256 is now `00365c397b0ee279767f8167a9d3ee121bf186421cb684af30ef5e1bd44d83d7` (was `01b19fe5…`). The hash covers every file under the five corpus directories. The only changes are the harness files `benchmarks/corpus/classic/report.ts` and `report.test.ts` (#383). No fixture, manifest, or tolerance changed (`git diff ad7ba71 HEAD` on the corpus directories touches only those two files).
- `benchmarks/SOURCES.md` SHA-256 is now `49379991e8f1f84c1289f78d50608fc7b6d1b3d3a8bcaed67320e5202213f2e5` (was `f8cc5777…`). The only change is the issue-368 WASM RLC source record merged with #371. This branch does not edit `SOURCES.md`; the aggregate pin moves with it.
- Apple M5 Pro, macOS 27.0.1 (Darwin 27.0.0) arm64, Node v22.23.1, pnpm 10.28.1, spice-ts 0.3.0, ngspice-47. Shared host, load average about 22–37 throughout.

## Result

- Deterministic outcome SHA-256: `01acbe24a4480bfd1995d1b4d15da012629c9e60ec8bfb6ae4ec907a33ecabf7`.
- ngspice-47: 52 success, 9 failed, 39 unsupported (unchanged).
- spice-ts: 59 success, 0 failed, 41 unsupported (was 55/2/43).
- Comparable results: 63 analyses across 47 fixtures (was 58/43); 894 absolute and 865 relative signals (was 878/848).
- Worst per-signal envelope: absolute max `154.02408984579006` and RMS `66.59015057379884` (`classic/rca3040-wideband-amplifier` AC `v(15)`), down from `1169140310571.719` only because the `ngspice/vbic-common-emitter-ac` pole comparison is no longer made. This is a coverage change, not an accuracy gain. The relative max `45497356677842.63` and RMS `872317191517.6284` (`classic/coupled-lossy-lines` `v(5)`) are unchanged.

## Status transitions (all spice-ts)

- `classic/diode-distortion`: failed → unsupported. #367 removes the ideal-RLC-only `.disto` rejection and `simulate()` now returns a 101-frequency distortion result. The corpus harness does not map `.disto` results, so the row records `no spice-ts result for analyses: disto`. This is not a parity gain because no distortion error is measured yet. Filed as #391.
- `ngspice/vbic-fo`: unsupported → success after #361. The nested sweep returns 707 points in both engines; with #394, 700 align and 7 are excluded out of range. Worst absolute max is `i(vc)` 6.71e-6 A and `i(vb)` 3.77e-6 A, which matches the #352 point-by-point verifier. Before #394 merged, the same run reported 0.3 V on the source-forced nodes `v(v1_n)`/`v(v1_p)`. That was the harness artifact filed as #401, and #394 fixes it.
- `ngspice/vbic-common-emitter-ac`: success → unsupported. After #392, `Q1 2 1 0 0 N1` uses its LEVEL=4 VBIC model instead of a silent default level-1 NPN, and bounded VBIC (#361) rejects `.ac`/`.pz` (`Unsupported bounded VBIC analysis: 'ac'`). The old "success" was not a VBIC simulation. Its AC and PZ comparisons are removed, and the fixture is now a published unsupported loss.
- `ngspice/hfet-inverter`: unsupported → success (#360 accepts the `Z` cards). Published losses: `v(4)` abs max 2.272 V (RMS 1.611 V), `v(3)` 2.231 V, `i(vdd)` 0.00372 A.
- `classic/bjt-noise`, `classic/resistor-noise`: unsupported → success (#383 maps the noise spectra and totals). Worst relative max is 4.9e-4 and 1.7e-7. This is a harness change, not a simulator change.
- `xyce/inductor-transient`: failed → success (#377 ends the non-terminating run). Published loss: `v(1)`/`v(2)` abs max 31.65 V (RMS 8.27 V, rel max ≈1.0). `i(l1)` agrees to 2.4e-14 A.

## Comparison transitions (published, losses included)

Nested DC (#394), worst per-signal absolute max: these were harness artifacts.

| Fixture | Before | After |
|---|---|---|
| `ngspice/jfet-vds-vgs` | 3 V `v(1)` | 3.10e-6 A `i(vd)` |
| `xyce/njfet-2109-dc` | 1.875 V `v(2)` | 1.47e-6 A |
| `xyce/nmos-level1-dc` | 18 V `v(4)` | 0.000682 V `v(2)` |
| `xyce/pnp-dc` | 2 V `v(4)` | 0.00119 V `v(3)` |

Grounded-substrate BJT models (#392):

- Gains: `corpus-e/bjt-rtl-inverter-chain` worst DC 4.71 → 1.86 V, OP 0.194 → 0.119 V. `corpus-e/bjt-diffpair-current-source` worst AC 90.1 → 83.9 V.
- Losses: `bjt-diffpair-transient` and `bjt-diffpair-current-source` OP `v(4)`/`v(5)` 1.107 → 1.148 V. In OP and TRAN, supply currents `i(vcc)`/`i(vee)` rel ≈0.086 → 0.089. `bjt-diffpair-current-source` AC `v(3)` 0.0859 → 0.0997 V. Its TRAN `v(4)` rel max 68.1 → 348.7 (rel RMS 9.54 → 35.3) and `v(5)` rel max 43.8 → 97.5. `bjt-rtl-inverter-chain` DC `i(vin)` rel max 78.2 → 157.9 (rel RMS 17.9 → 35.1). Its TRAN `i(vcc)` abs max 0.00437 → 0.00457 A and `v(2)` rel max 1.13 → 1.21.
- Transient grids change 198 → 191, 111 → 107 and 170 → 156 points.

PULSE (#379):

| Fixture | spice-ts points | Worst abs max before | Worst abs max after |
|---|---|---|---|
| `xyce/rlc-transient` | 1002 → 1018 | 10 V `v(1)` | 0.000752 V `v(2)` |
| `classic/mos-memory-cell` | 158 → 144 | 22496.7 A `i(vwb)` | 9.91 V `v(8)` (loss remains) |
| `ngspice/ltra-line-transient` | 685 → 665 | 2.499 V `v(168)` | 0.416 V `v(3)` |
| `classic/lossy-line-aluminium` | 3968 → 3969 | 1.3472 V `v(3)` | 1.3472 V `v(3)` |

- Losses: `ltra-line-transient` `v(3)` abs RMS +5.2%. `mos-memory-cell` `i(vw)` abs RMS +4.7%. `lossy-line-aluminium` abs RMS rises on 89 of 261 signals, by at most 0.1% on non-negligible signals. On the same fixture, `v(x1.x1.x1.x1.x1.x1.x1.x1.4)` rel max goes 2314.5 → 7220.6 at an unchanged 0.2614 V abs max.
- `classic/lossy-line-24-inch` and `classic/coupled-lossy-lines` change only at rounding level.

Transient step control (#377). This is the only transient-engine change in the final window, and none of these netlists has a diode, HFET or `.noise` card:

- `xyce/rlc-transient` **worsens**: `v(2)` abs max 0.000752 → 0.00213 V, `i(l1)` 0.000251 → 0.000711 A, abs RMS up on all 5 signals; 1018 → 1037 points.
- `ngspice/mos6-inverter-transient` and `classic/mos6-inverter-chain` (3760 → 3777 points): abs RMS falls on 30 and rises on 14 of 44 signals. The worst abs max (5.0044 V on `v(43)`) is essentially unchanged.
- `ngspice/mos6-simple-inverter-transient` (3438 → 3451) and `corpus-e/mos1-inverter-sweep` TRAN (111 → 113) change abs RMS by about 1% or less.

#390 (diode CJO alias) changed no aggregate outcome. The deterministic projection was identical before and after merging it. #405 (diode VJ/FC) changed no compared diode fixture metric.

Matched samples: absolute 9,182,709 → 9,189,895; relative 9,147,783 → 9,155,140; excluded zero references 34,926 → 34,755. Runtime sums are single samples on a loaded shared host and support no speed claim.

## Commands

```text
pnpm install --frozen-lockfile                              PASS (lockfile unchanged)
pnpm build                                                  PASS
pnpm exec tsx benchmarks/aggregate-report.ts                PASS, outcome 01acbe24…
pnpm exec tsx benchmarks/aggregate-report.ts --check        PASS, 100 fixtures, 63 analyses
pnpm exec tsx --test benchmarks/aggregate-report.test.ts    PASS 13/13
pnpm lint                                                   PASS
pnpm test                                                   PASS
pnpm bench:accuracy                                         PASS, 7 ✓, retained BJT CE bias warning 2.61%
git diff --check                                            PASS
```

Repeated regenerations on the same base produced identical per-fixture statuses and metrics. Only runtimes and volatile error text differed.

## TDD receipt

RED: the updated ledger test (`commits the transition ledger against the latest accepted report`) failed against stale artifacts (12/13) after each base update. GREEN: 13/13 after regenerating from the same 100 fixture bytes.

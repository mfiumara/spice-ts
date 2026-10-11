# Issue 386 aggregate parity refresh receipt

This receipt covers the 100-fixture aggregate run on `main` after these merges since the previous aggregate (PR #325): #367 (bounded nonlinear diode distortion, #363), #379 (PULSE zero TR/TF defaults to TSTEP, #375), #361 (bounded VBIC FO DC, #352), #390 (diode CJO alias, #365), #394 (per-segment nested DC alignment, #384), #392 (grounded-substrate BJT `.model` resolution, #382), #405 (diode VJ/FC, #388), #383 (classic `.noise` harness mapping, #380), #360 (NHFET level-5, #339), #377 (inductor-ringing termination, #366), #387 (`.control`/`.endc` contract, #381), #417 (MOS1 bulk-junction currents, #393) and #400 (BJT charge storage and Early gm, #385). #371, #372, #373, #378, #395, #396, #398, #399, #416, #418, #419 and #420 touch WASM, docs, receipts, refactors, protocol options, MCP preflight, benchmark tooling and tokenizer performance only. It makes no M1 completion, parity, speed, or superiority claim.

## Inputs and tools

- Base: `origin/main` at `60f49b2` (#400), merged into this branch. The first revision of this PR ran on `bc99922` (#387, outcome `44261d03…`); review rejected it as stale after #417 and #400 merged. The "#400/#417" section below gives every change between the two runs.
- Previous aggregate: issue #321, PR #325, head `ad7ba71b65848053afa7bc64ba22fd989ef89ca4`, deterministic outcome `68aa8e2e7b78b82f801da84cf5c88c489634d203f44bca5df9345a1946deddb9`.
- Aggregate corpus-tree SHA-256 is now `00365c397b0ee279767f8167a9d3ee121bf186421cb684af30ef5e1bd44d83d7` (was `01b19fe5…`). The hash covers every file under the five corpus directories. The only changes are the harness files `benchmarks/corpus/classic/report.ts` and `report.test.ts` (#383). No fixture, manifest, or tolerance changed (`git diff ad7ba71 HEAD` on the corpus directories touches only those two files).
- `benchmarks/SOURCES.md` SHA-256 is now `539de6042888ad113c1713b9912ac1ec327eddbc83a839774223626a4c868e03` (was `f8cc5777…` at PR #325). Two records changed: the issue-368 WASM RLC source record merged with #371, and the issue-393 MOS1 bulk-junction fixture record merged with #417. This branch does not edit `SOURCES.md`; the aggregate pin moves with it.
- Apple M5 Pro, macOS 27.0.1 (Darwin 27.0.0) arm64, Node v22.23.1, pnpm 10.28.1, spice-ts 0.3.0, ngspice-47. Shared host under load from other lanes.

## Result

- Deterministic outcome SHA-256: `c06be5be0760b502c131926c5494c3caba0d7c072273faaf97159c7db4164ec2`.
- ngspice-47: 52 success, 9 failed, 39 unsupported (unchanged).
- spice-ts: 60 success, 1 failed, 39 unsupported (was 55/2/43).
- Comparable results: 64 analyses across 48 fixtures (was 58/43); 898 absolute and 869 relative signals (was 878/848).
- Worst per-signal envelope: absolute max `31.65338535154384` and RMS `8.272157976952819` (`xyce/inductor-transient` TRAN `v(1)`, the #366 loss), down from `1169140310571.719`. Two things cause the drop. First, the `ngspice/vbic-common-emitter-ac` pole comparison is no longer made (#392), which is a coverage change and not an accuracy gain; that alone leaves `classic/rca3040-wideband-amplifier` AC `v(15)` at `154.02408984579006` as the worst. Second, #400 lowers that `v(15)` error to 1.024. Relative max `350697351664.8823` and RMS `6918151585.579732` (was `45497356677842.63` / `872317191517.6284`) still come from `classic/coupled-lossy-lines` `v(5)`, whose absolute max falls from 1.42 to 0.432 V. The relative metric still divides by near-zero ngspice samples there.

## Status transitions (all spice-ts)

- `classic/diode-distortion`: failed → unsupported. #367 removes the ideal-RLC-only `.disto` rejection and `simulate()` now returns a 101-frequency distortion result. The corpus harness does not map `.disto` results, so the row records `no spice-ts result for analyses: disto`. This is not a parity gain because no distortion error is measured yet. Filed as #391.
- `ngspice/vbic-fo`: unsupported → success after #361. The nested sweep returns 707 points in both engines; with #394, 700 align and 7 are excluded out of range. Worst absolute max is `i(vc)` 6.71e-6 A and `i(vb)` 3.77e-6 A, which matches the #352 point-by-point verifier. Before #394 merged, the same run reported 0.3 V on the source-forced nodes `v(v1_n)`/`v(v1_p)`. That was the harness artifact filed as #401, and #394 fixes it.
- `ngspice/vbic-common-emitter-ac`: success → unsupported. After #392, `Q1 2 1 0 0 N1` uses its LEVEL=4 VBIC model instead of a silent default level-1 NPN, and bounded VBIC (#361) rejects `.ac`/`.pz` (`Unsupported bounded VBIC analysis: 'ac'`). The old "success" was not a VBIC simulation. Its AC and PZ comparisons are removed, and the fixture is now a published unsupported loss.
- `ngspice/hfet-inverter`: unsupported → success (#360 accepts the `Z` cards). Published losses: `v(4)` abs max 2.272 V (RMS 1.611 V), `v(3)` 2.231 V, `i(vdd)` 0.00372 A.
- `classic/bjt-noise`, `classic/resistor-noise`: unsupported → success (#383 maps the noise spectra and totals). Worst relative max is 4.9e-4 and 1.7e-7. This is a harness change, not a simulator change.
- `xyce/inductor-transient`: failed → success (#377 ends the non-terminating run). Published loss: `v(1)`/`v(2)` abs max 31.65 V (RMS 8.27 V, rel max ≈1.0). `i(l1)` agrees to 2.4e-14 A.
- `ngspice/probe-ac`: unsupported → success (#387 accepts the `.control` block). 15 of 16 AC points align (1 excluded out of range), and the worst abs max is 4.4e-16 V.
- `classic/bjt-mixer-distortion`: unsupported → **failed**. This is a published status loss. The cause is not a simulator regression. Before #400, spice-ts rejected the netlist at parse time with `Unsupported bounded BJT model parameter: 'CJS'`. #400 accepts `CJS`, so the netlist now parses fully. Upstream `mixdisto.cir` comments out both `.disto` lines (`*disto dec 20 1.0e3 1.0e8`), so the netlist has no analysis command. `simulate()` throws `No analysis command specified`, and the harness counts that as failed because the message doesn't match its unsupported pattern. ngspice also fails on the same bytes: it exits 0 with no raw analysis data. Neither engine gives a comparable result, and the manifest already records both expected failures. No separate issue was opened, because the behaviour is correct for a netlist with no analysis.

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

The values in the #392, #379 and #377 sections above were measured on `bc99922`, before #417 and #400. The next section gives the final values.

BJT charge storage and Early gm (#400) and MOS1 bulk-junction currents (#417). These change 26 compared fixtures. The values below compare the `bc99922` run (outcome `44261d03…`) with this run. Attribution is by device class (BJT → #400, MOS → #417); I haven't bisected it.

Gains (worst absolute max unless noted):

| Fixture | Analysis | Before | After |
|---|---|---|---|
| `classic/rca3040-wideband-amplifier` | AC | 154.02 `v(15)` | 1.024 `v(15)` |
| `classic/rca3040-wideband-amplifier` | TRAN (1494 → 3994 pts) | 10.42 V `v(17)` | 0.354 V `v(14)` |
| `classic/bjt-differential-pair` | TRAN (190 → 3184 pts) | 7.27 V `v(4)` | 0.119 V `v(7)` |
| `classic/rtl-inverter-chain` | TRAN / DC | 4.73 / 1.87 V `v(5)` | 0.296 / 1.80 V |
| `corpus-e/bjt-rtl-inverter-chain` | TRAN / DC | 4.73 / 1.857 V `v(5)` | 0.295 V `v(3)` / 1.801 V |
| `corpus-e/bjt-diffpair-transient` | OP / TRAN | 1.148 V `v(5)` / 7.01 V `v(4)` | 0.119 V `v(7)` / 0.120 V `v(6)` |
| `corpus-e/bjt-diffpair-current-source` | AC / OP / TRAN | 83.9 / 1.148 / 4.78 V `v(5)` | 0.517 / 0.119 / 0.129 V |
| `classic/lossy-line-24-inch` | TRAN | 3.65 V `v(3)` | 1.125 V `v(3)` |
| `classic/coupled-lossy-lines` | TRAN | 5.20 V `v(x1.6)` | 0.936 V `v(x3.3)`; abs RMS down on 41 of 47 |
| `classic/mos-memory-cell` | TRAN | 9.91 V `v(8)` | 1.91 V `v(8)` |
| `corpus-e/mos1-inverter-sweep` | OP | 4.58 V `v(4)` | 0.214 V `v(4)` |
| `ngspice/mos-amplifier-transient`, `classic/mos-amplifier` | TRAN | `i(vb)` rel max 9.5e6 | 1.6e5; abs RMS down on 18 of 24 |
| `ngspice/schmitt-trigger`, `classic/ecl-schmitt-trigger` | TRAN | 0.989 V `v(6)` | 0.763 V `v(6)` |

Losses (published):

- `corpus-e/mos1-inverter-sweep` TRAN `i(vdd)` abs max 0.0036 → **1.234 A**. It is a spike at t = 2.98083 ns, on a ~1.5 fs step just before the 3 ns PWL corner. ngspice-47 peaks at 1.77e-3 A on the same bytes, and the OP agrees (-1.18703e-3 vs -1.19877e-3 A). Filed as #427 and linked from the fixture row. Also on this fixture: TRAN `v(5)` 2.50 → 3.74 V, DC `i(vdd)` 0.00364 → 0.00757 A, worst DC/TRAN abs max still about 4.35 V, and the TRAN grid grows 113 → 382 points.
- `ngspice/mos6-simple-inverter-transient` (3451 → 3229 points): `i(vdd)` 0.000544 → 0.00191 A (rel max 8072 → 328348), `i(vin)` 9.3e-6 → 2.1e-4 A. `v(11)` improves 4.92 → 4.34 V.
- `ngspice/schmitt-trigger` and `classic/ecl-schmitt-trigger` (3143 → 3232 points): `i(vin)` 2.70e-4 → 5.35e-4 A, `v(2)` 0.0135 → 0.0268 V, `v(6)` rel max 36.1 → 148.3; abs RMS up on 8 of 10 signals.
- `classic/mos-memory-cell`: `i(vs)` 0.00367 → 0.0113 A, `i(vwb)` 0.00052 → 0.00104 A; abs RMS up on 5 of 13 signals.
- `ngspice/mos6-inverter-transient` and `classic/mos6-inverter-chain` (3777 → 3782 points): abs RMS up on 19 and down on 23 of 44 signals; `v(xndinv2.22)` 3.720 → 3.723 V; worst `v(43)` 5.0044 V unchanged.
- Relative-only moves at small absolute error: `corpus-e/bjt-diffpair-transient` TRAN `v(1)` rel max 0.039 → 1.0 (0.0012 V abs); `corpus-e/bjt-rtl-inverter-chain` OP `i(vin)` rel 0.22 → 1.0 (4.6e-12 A abs); `classic/lossy-line-24-inch` `v(3)` rel max 84.5 → 2533; `classic/rca3040-wideband-amplifier` TRAN `v(31)` rel max 518 → 4387 while its abs max falls 0.0387 → 0.0105 V.
- `ngspice/ltra-line-transient`, `classic/bsim1-device-sweep`, `classic/bsim2-device-sweep`, `xyce/nmos-level1-dc` and `xyce/pmos-level1-dc` change only at rounding level.

Matched samples: absolute 9,182,709 → 9,412,848; relative 9,147,783 → 9,377,027; excluded zero references 34,926 → 35,821 (the `bc99922` run had 9,189,955 / 9,155,200 / 34,755). The growth comes from the denser BJT/MOS transient grids. Runtime sums are single samples on a loaded shared host and support no speed claim.

## Commands

```text
git merge origin/main (60f49b2)                             clean merge
pnpm install --frozen-lockfile                              PASS (lockfile unchanged)
pnpm build                                                  PASS
pnpm exec tsx benchmarks/aggregate-report.ts                PASS, outcome c06be5be…
pnpm exec tsx benchmarks/aggregate-report.ts --check        PASS, 100 fixtures, 64 analyses, outcome c06be5be…
pnpm exec tsx --test benchmarks/aggregate-report.test.ts    PASS 18/18
pnpm lint                                                   PASS
pnpm test                                                   PASS (core 1182/1182; 17/8/48/209/57/20 in the other packages)
pnpm bench:accuracy                                         PASS, 7 ✓, retained BJT CE bias warning 2.61%
git diff --check                                            PASS
```

Three runs on `60f49b2`: the first generation, a second generation after adding the #427 gap link, and `--check`. All three gave the same totals, envelope and status transitions. `--check` reproduced the second run's deterministic projection exactly (`c06be5be…`). Only runtimes differed.

## TDD receipt

RED: review reproduced the `--check` preflight failure on the merge with `60f49b2`, caused by the stale `SOURCES.md` pin (`49379991…` pinned, `539de604…` actual). With the pin bumped and the ledger test updated (new `classic/bjt-mixer-distortion` transition, 60/1/39 totals, new envelope, #427 link), `aggregate-report.test.ts` failed 17/18 against artifacts that lacked the new transition and link. GREEN: 18/18 after regenerating from the same 100 fixture bytes, and `--check` passes.

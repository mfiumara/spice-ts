# corpus-f: triage of decks over the 1% parity threshold (#511)

Hand-written companion to the generated [README.md](README.md). Machine-readable version: [triage-511.json](triage-511.json). `triage-511.test.ts` checks it against the committed `outcomes.json`, so it fails when an outcome changes and this file is not updated.

Scope: all ten rows of the #511 table, plus the two other mismatches present in the imported report. The full refresh exposes seven newly runnable mismatches; these remain published losses and are explicitly deferred to [#597](https://github.com/mfiumara/spice-ts/issues/597), not claimed as root-caused here. No fixture, tolerance, threshold or metric was changed. Current measurements use ngspice-47 and the simulator at `bf2e4169`, with the published corpus-f metric (worst over signals of max|spice-ts - ngspice| / max(peak|ngspice|, 1e-12), ngspice interpolated onto spice-ts points with breakpoint alignment). Diagnostic variants are labelled separately.

## Tool

`benchmarks/corpus/corpus-f/triage-detail.ts` runs one fixture through both engines exactly as `outcomes.ts` does. It prints the highest-error signals (use `--top 1000` for all), their published error, and two plain-linear-interpolation diagnostics: the location of the largest difference and the reverse-grid error at ngspice's own points. The locator and reverse-grid columns do not apply breakpoint alignment and need not equal the published error. Diagnostic options, never used for the published table:

- `--tmax <s>`: both engines run the deck with .tran TMAX forced. This separates step and grid effects from model differences.
- `--deck <file>`: both engines run a variant deck (for example one model parameter removed). This isolates a model term.
- `--reference-tmax <s> [--candidate ngspice]`: the reference is ngspice with TMAX forced, and the candidate is spice-ts (or ngspice) on the unchanged deck. These are candidate-grid diagnostics, not a common-grid accuracy ranking. A single fine-step run does not establish step convergence.

```sh
pnpm build
pnpm exec tsx benchmarks/corpus/corpus-f/triage-detail.ts tests-general-mosmem-cir
pnpm exec tsx benchmarks/corpus/corpus-f/triage-detail.ts tests-general-rtlinv-cir --reference-tmax 2e-11
```

## Root causes

| Root cause | Kind | Issue | Fixtures |
|---|---|---|---|
| MOS1 bulk-junction capacitance is constant CBD/CBS; CJ/CJSW/MJ/PB depletion C(V) silently ignored | simulator | https://github.com/mfiumara/spice-ts/issues/590 | mosmem |
| MOS1 has no Meyer intrinsic gate capacitance from TOX | simulator | https://github.com/mfiumara/spice-ts/issues/591 | ltra2_2_line |
| Transient metric scores ngspice's coarse default-step output as spice-ts error | metric | https://github.com/mfiumara/spice-ts/issues/592 | rca3040, rtlinv, mos-test, fourbitadder, ltra2_2_line (secondary signals) |
| Zero or near-zero ngspice peaks turn fV-µV residuals into mismatches | metric | https://github.com/mfiumara/spice-ts/issues/593 | rca3040 (AC v(2)), fourbitadder |
| BSIM1/BSIM2 (LEVEL 4/5) not implemented; typed error since #552 | model gap | https://github.com/mfiumara/spice-ts/issues/565 | bsim1, bsim2 |
| VDMOS .model silently dropped | fixed (#542, #562) | https://github.com/mfiumara/spice-ts/issues/509 | vdmosp-out, ro_11_vdmos |

## Per fixture

| Fixture | #511 table | Now | Classification and evidence |
|---|---|---|---|
| examples/vdmos/vdmosp-out.sp | 5.05e+242 dc i(vs) | matched, 1.48e-8 | Fixed by the VDMOS model (#562) after #509. |
| examples/vdmos/ro_11_vdmos.sp | (not in table; 3.19 in the committed outcomes) | matched, 0.00348 | Same. |
| tests/general/fourbitadder.cir | 8.64 | mismatch, 0.0677 | Worst signals are TTL NAND internal nodes with 75–125 µV peaks (abs error 6.7 µV on a 5 V circuit). At ngspice points: 0.0377. Against fine-step ngspice (TMAX 10 ps), spice-ts default is 0.0107 on its grid and ngspice default is 0.0415 on its grid. Residual 1.1 µV at t≈13 ps with both engines at 10 ps (5/270 signals at 1.02–1.07%) is not root-caused yet; recorded in #593. |
| tests/transmission/ltra2_2_line.cir | 1 | mismatch, 0.974 | i(vs) gate current: 0 in spice-ts, 2.5 µA peak in ngspice. Still 1.0 at TMAX 10 ps. Removing `TOX=18000N` from both cards makes it agree → #591. Other signals ≤ 0.0074 at ngspice points and ≤ 0.0034 at TMAX 10 ps → #592. |
| tests/bsim2/test.cir | 0.738 | spice-ts-loss | LEVEL=5 now raises `UnsupportedModelLevelError` (#552) instead of running Level-1 equations → #565. |
| tests/general/mosmem.cir | 0.714 | mismatch, 0.227 | i(vdd) 0.227, v(6) 0.103, i(vw) 0.0994, v(3) 0.0618, v(8) 0.0311; unchanged at TMAX 0.1 ns. Adding `mj=0` (constant CBD/CBS in ngspice) brings all 13 signals to ≤ 3.95e-4 → #590. Same numbers on classic/mos-memory-cell. |
| tests/bsim1/test.cir | 0.628 | spice-ts-loss | LEVEL=4, as bsim2 → #565. |
| tests/general/rtlinv.cir | 0.432 | mismatch, 0.0527 | At ngspice points: 0.0013. All 16 signals ≤ 8.5e-4 with both engines at TMAX 20 ps. Against the fine-step reference, spice-ts default transient error is 5.24e-4 and ngspice default is 0.0017; DC remains 8.43e-4 → #592. |
| tests/general/rca3040.cir | 0.148 | mismatch, 0.0511 | Tran worst is v(1), the SIN source node itself (108 ngspice points over ten 50 MHz cycles); at ngspice points 0.0021. Against the fine-step reference (TMAX 10 ps), spice-ts tran is ≤ 0.0010 on its grid and ngspice default is 0.031 on its grid → #592. What remains is AC v(2), a node held by `vcc` with no AC value: spice-ts 4.84e-14 V vs ngspice exactly 0, divided by the 1e-12 floor = 0.0484 → #593. |
| examples/xspice/various/xspice_c1.cir | 0.0439 | matched, 2.26e-5 | Imported report was already matched at 4.93e-4. Fresh run includes #531 initial-condition semantics. |
| examples/xspice/original-examples/spice3.deck | 0.0439 | matched, 2.26e-5 | Same circuit and transition as xspice_c1. |
| examples/probe/mos-test.cir | (not in table) | mismatch, 0.176 | The inverter has no capacitance (default MOS1, no TOX/CJ, lambda 0, equal KP), so v(out) jumps vertically at vin = 2.5 V. Interpolating ngspice's 135-point grid across the jump gives 0.176. spice-ts's 3.64 V at vin = 2.33 V is the analytic value. At ngspice points: 0.0023 → #592. |

## What this does not claim

- The metric rows (#592, #593) are not counted as matches. They remain published mismatches until the supervisor/owner decides on a metric change, which applies to every fixture.
- The fine-step diagnostics support a grid-sensitivity investigation. They do not establish convergence or rank engine accuracy: candidate-grid sampling and breakpoint alignment differ between candidates. No simulator-superiority claim follows from these numbers.

## Report refresh attribution

The imported report has 336 fixtures (the original issue predates the final ingestion exclusion), with 11 matched, 10 mismatched, 11 not compared, 274 spice-ts losses and 30 both-engine failures. Regeneration on `bf2e4169` has 26 matched, 13 mismatched, 22 not compared, 245 spice-ts losses and 30 both-engine failures. These are results of earlier merged implementations, **not fixes made by this triage PR**. Neither engine's input bytes nor the 1% rule changed.

All 35 outcome-class transitions are accounted for below. Changes within an outcome class remain in the generated JSON diff.

| Prior implementation | Class transitions | Count |
|---|---|---:|
| #495 B-source expressions | loss → mismatch (ddt-test1, ddt-test3) | 2 |
| #491 CPL/TXL | loss → not-compared (nine examples/transmissionlines decks; .control export gap #521) | 9 |
| #491 CPL/TXL | loss → mismatch (tests/transmission cpl-ibm2, txl1, txl2) | 3 |
| #506 / #562 VDMOS | mismatch → matched (ro_11_vdmos, vdmosp-out); loss → matched (vdmos-out-ir-mtr) | 3 |
| VDMOS charge/initial-state fixes, including #531 | loss → not-compared (crss-coss-ciss; ngspice .control vectors still unavailable, #521) | 1 |
| #487 XSPICE | loss → matched (11 decks) | 11 |
| #487 XSPICE | loss → mismatch (original-examples/analog-models1-transient); loss → not-compared (various/analog-models1-transient, #521) | 2 |
| #552 honest unsupported MOS levels | mismatch → spice-ts-loss (bsim1, bsim2), tracked by #565 | 2 |
| #498 resistor forms | loss → mismatch (res-array); loss → matched (res-partition) | 2 |

The seven newly runnable mismatches have a separate follow-up in #597. This table attributes which feature made a deck runnable; it does not establish the remaining mismatch's root cause. `not-compared` is not a parity win.

The separate 100-fixture aggregate initially failed provenance preflight. Its tree hash includes `classic/report.ts`, changed by the already-merged corpus-f ingestion (#529), despite unchanged deck bytes. This PR refreshes that pin and the aggregate artifacts, without changing the comparison algorithm.

## RED and GREEN mean different things on a triage card

The simulator is unchanged from main `bf2e4169`. Run:

```sh
CORPUS_F_REQUIRE_PARITY=1 pnpm exec tsx --test benchmarks/corpus/corpus-f/triage-511.test.ts
pnpm exec tsx --test benchmarks/corpus/corpus-f/triage-511.test.ts
```

The first command is deliberately **RED**, reproducing mosmem 0.227 and ltra2_2_line 0.974 against the unchanged 0.01 rule on identical decks. It remains RED at this PR head; device fixes belong to #590 and #591. The second command is **GREEN**, checking all original issue rows, explicit follow-up coverage for new losses, exact stored measurements and live reproduction of the two device losses (6 tests with ngspice-47 installed). Without ngspice-47 the two live tests are skipped, not presented as parity passes. This is not a claim that failing physics became passing physics by changing an assertion.

The initial documentation regression run also failed because the saved triage had stale XSPICE measurements and omitted the seven newly exposed mismatches. Updating the measurements and linking #597 resolves that documentation gap.

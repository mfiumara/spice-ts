# corpus-f: triage of decks over the 1% parity threshold (#511)

Hand-written companion to the generated [README.md](README.md). Machine-readable version: [triage-511.json](triage-511.json). `triage-511.test.ts` checks it against the committed `outcomes.json`, so it fails when an outcome changes and this file is not updated.

Scope: all ten rows of the #511 table, the two other mismatches present in the imported report, and the two decks exposed by the refreshes up to main `c317324f` (switches-manual-p92, a mismatch; adder_mos_circ, a mismatch until #624 and a timeout since). The seven newly runnable mismatches found by the first refresh on `bf2e4169` remain published losses. They are explicitly deferred to [#597](https://github.com/mfiumara/spice-ts/issues/597), not claimed as root-caused here. No fixture, tolerance, threshold or metric was changed. Current measurements (the "Now" column and `outcomes.json`) use ngspice-47 and the simulator at main `c317324f`; `packages/` on this branch is byte-identical to it. They use the published corpus-f metric with the published corpus-f metric (worst over signals of max|spice-ts - ngspice| / max(peak|ngspice|, 1e-12), ngspice interpolated onto spice-ts points with breakpoint alignment). Values attributed to `bf2e4169` are historical and appear only where they explain an issue. Diagnostic variants are labelled separately.

This triage covers the batch-1 `outcomes.json` table only. The "Control-vector supplement (#521)" in README.md is generated separately by `control-vectors.ts`. It was refreshed on the same tree (all 207 control decks: 13 matched, 36 mismatched, 13 not compared, 127 spice-ts losses, 1 ngspice-only failure, 17 both-engine failures) but is not triaged here. Its mismatches remain linked to #511 or their gap issues.

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
| MOS1 bulk-junction capacitance was constant CBD/CBS; CJ/CJSW/MJ/PB depletion C(V) ignored | fixed (#601) | https://github.com/mfiumara/spice-ts/issues/590 | mosmem (now matched) |
| MOS1 had no Meyer intrinsic gate capacitance from TOX | fixed (#601) | https://github.com/mfiumara/spice-ts/issues/591 | ltra2_2_line (improved; the residual is a grid effect per #627/#629 → #592) |
| BSIM3 4-bit NAND adder: supply current 10-40x ngspice before #624, exceeds the 120 s bound since | simulator, not root-caused | https://github.com/mfiumara/spice-ts/issues/626 | adder_mos_circ |
| Transient metric scores ngspice's coarse default-step output as spice-ts error | metric | https://github.com/mfiumara/spice-ts/issues/592 | rca3040, rtlinv, mos-test, fourbitadder, switches-manual-p92, ltra2_2_line (secondary signals) |
| Zero or near-zero ngspice peaks turn fV-µV residuals into mismatches | metric | https://github.com/mfiumara/spice-ts/issues/593 | rca3040 (AC v(2)), fourbitadder |
| BSIM1/BSIM2 (LEVEL 4/5) not implemented; typed error since #552 | model gap | https://github.com/mfiumara/spice-ts/issues/565 | bsim1, bsim2 |
| VDMOS .model silently dropped | fixed (#542, #562) | https://github.com/mfiumara/spice-ts/issues/509 | vdmosp-out, ro_11_vdmos |

## Per fixture

| Fixture | #511 table | Now | Classification and evidence |
|---|---|---|---|
| examples/vdmos/vdmosp-out.sp | 5.05e+242 dc i(vs) | matched, 1.48e-8 | Fixed by the VDMOS model (#562) after #509. |
| examples/vdmos/ro_11_vdmos.sp | (not in table; 3.19 in the committed outcomes) | matched, 0.00348 | Same. |
| tests/general/fourbitadder.cir | 8.64 | mismatch, 0.0677 | Worst signals are TTL NAND internal nodes with 75–125 µV peaks (abs error 6.7 µV on a 5 V circuit). At ngspice points: 0.0377. Against fine-step ngspice (TMAX 10 ps), spice-ts default is 0.0107 on its grid and ngspice default is 0.0415 on its grid. Residual 1.1 µV at t≈13 ps with both engines at 10 ps (5/270 signals at 1.02–1.07%) is not root-caused yet; recorded in #593. |
| tests/transmission/ltra2_2_line.cir | 1 | mismatch, 0.374 | At `bf2e4169`: i(vs) gate current 0 in spice-ts vs a 2.5 µA ngspice peak (0.974, still 1.0 at TMAX 10 ps), and removing `TOX=18000N` from both cards made it agree → #591, fixed by #601. Now 0.374 (t≈16.1 ns: −42.5 nA vs −2.4 µA). That is 0.151 at ngspice points and 0.029 with both engines at TMAX 10 ps. #627 (#629) traced the residual to discretisation of a current that is discontinuous at the pulse corners. Against ngspice at TMAX 1 ps, spice-ts default scores 0.0233 and ngspice's own default run 0.0401. The post-breakpoint step rule differs from ngspice (#608) → #592. Other signals ≤ 0.0071 at ngspice points and ≤ 0.0033 at TMAX 10 ps → #592. |
| tests/bsim2/test.cir | 0.738 | spice-ts-loss | LEVEL=5 now raises `UnsupportedModelLevelError` (#552) instead of running Level-1 equations → #565. |
| tests/general/mosmem.cir | 0.714 | matched, 0.0025 | At `bf2e4169`: i(vdd) 0.227, v(6) 0.103, i(vw) 0.0994, v(3) 0.0618, v(8) 0.0311, unchanged at TMAX 0.1 ns. Adding `mj=0` (constant CBD/CBS in ngspice) brought all 13 signals to ≤ 3.95e-4 → #590. Fixed by #601: the unchanged deck has 0/13 signals over 1% (worst v(4) 0.0025, i(vdd) 0.00205). |
| tests/bsim1/test.cir | 0.628 | spice-ts-loss | LEVEL=4, as bsim2 → #565. |
| tests/general/rtlinv.cir | 0.432 | mismatch, 0.0527 | At ngspice points: 0.0013. All 16 signals ≤ 8.5e-4 with both engines at TMAX 20 ps. Against the fine-step reference, spice-ts default transient error is 5.24e-4 and ngspice default is 0.0017; DC remains 8.43e-4 → #592. |
| tests/general/rca3040.cir | 0.148 | mismatch, 0.0511 | Tran worst is v(1), the SIN source node itself (108 ngspice points over ten 50 MHz cycles); at ngspice points 0.0021. Against the fine-step reference (TMAX 10 ps), spice-ts tran is ≤ 0.0010 on its grid and ngspice default is 0.031 on its grid → #592. What remains is AC v(2), a node held by `vcc` with no AC value: spice-ts 4.84e-14 V vs ngspice exactly 0, divided by the 1e-12 floor = 0.0484 → #593. |
| examples/xspice/various/xspice_c1.cir | 0.0439 | matched, 2.26e-5 | Imported report was already matched at 4.93e-4. Fresh runs (`bf2e4169`, `c317324f`) include #531 initial-condition semantics. |
| examples/xspice/original-examples/spice3.deck | 0.0439 | matched, 2.26e-5 | Same circuit and transition as xspice_c1. |
| examples/probe/mos-test.cir | (not in table) | mismatch, 0.176 | The inverter has no capacitance (default MOS1, no TOX/CJ, lambda 0, equal KP), so v(out) jumps vertically at vin = 2.5 V. Interpolating ngspice's 135-point grid across the jump gives 0.176. spice-ts's 3.64 V at vin = 2.33 V is the analytic value. At ngspice points: 0.0023 → #592. |
| examples/probe/switches-manual-p92.cir | (not in table) | mismatch, 0.865 | Runnable since #579 (S/W switches); `spice-ts-loss` at `bf2e4169`. Ideal switches make v(10)/v(20)/v(30)/v(40) jump between consecutive output points. ngspice's default output brackets each edge with points 2 µs apart, for example v(10) crossing 0.5 V between 1.19856 and 1.20056 ms. spice-ts puts the edge inside that interval (1.20029 ms), so interpolating ngspice's chord gives 0.865 (spice-ts 1 vs ngspice 0.135 at t = 1.2 ms). At ngspice points: 2.7e-20. With both engines at TMAX 0.1 µs, the crossing times agree within 1e-8 s, but the metric still reports 1.0 at a vertical edge → #592. The other 8 signals agree to ≤ 5.4e-16. |
| examples/snapshot/adder_mos_circ.cir | (not in table) | spice-ts-loss (timeout) | Runnable since #599 (dotted BSIM3 `version=3.3.0`); `spice-ts-loss` at `bf2e4169`. On main `68b64909` it completed (about 45 s) as a mismatch of 42: 81/90 signals over 1%, i(vcc) near 8.95 ns spice-ts −11.6 mA vs ngspice −25 µA (275 µA peak), 40.6 at ngspice points. That was a real device-level loss, not a grid artefact. After #624 (BSIM3 b3ld.c DC core) spice-ts exceeds the 120 s bound (2m02s wall on a lightly loaded host); ngspice-47 completes. → #626, root cause not established. |

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

### Second refresh on main `c317324f`

Review of the first version of this PR found that the published report was stale against main: #579 had made switches-manual-p92 runnable as a 0.865 mismatch. `outcomes.json` and README.md were regenerated again on the merge of this branch with main `c317324f` (`spice-heavy pnpm exec tsx benchmarks/corpus/corpus-f/outcomes.ts --jobs 4`). Result: 32 matched, 13 mismatched, 53 not compared, 208 spice-ts losses and 30 both-engine failures (outcome SHA-256 `e07901d4…`). Compared with the `bf2e4169` regeneration, all 38 outcome-class transitions are listed below. They come from merged implementations, not from this PR.

| Prior implementation | Class transitions | Count |
|---|---|---:|
| #579 S/W switches | loss → mismatch (switches-manual-p92, 0.865, published loss → #592) | 1 |
| #601 MOS1 depletion and Meyer charges | mismatch → matched (mosmem) | 1 |
| #614 .pz with sources and active elements | loss → matched (polezero filt-bridge-t, filt-multistage, filt-rc) | 3 |
| a merge between `bf2e4169` and `7c66aab9`, not bisected | loss → not-compared (transmissionlines/cpl1-4-line: spice-ts no longer fails with timestep too small, but ngspice runs it from `.control` and exports no vectors) | 1 |
| #584 .control interpreter | loss → not-compared (27 `.control` decks spice-ts now runs; ngspice `-r` exports no vectors, #528) | 27 |
| #584 .control interpreter | loss → matched (control-structs/if-batchmode, various/param-sweep) | 2 |
| #616 numparam .func/.if | loss → not-compared (regression/misc/if-elseif, parser/xpressn-3; `.control` decks, #528) | 2 |
| #603 .global | loss → not-compared (regression/subckt-processing/global-1; `.control` deck, #528) | 1 |

adder_mos_circ is `spice-ts-loss` at both ends, but not for the same reason. #599 made it run (mismatch 42 on `7c66aab9`…`68b64909`), and after #624 it times out at the 120 s bound (#626).

Intermediate full regenerations on main `7c66aab9` (before #584), `e58322ea` (before #616/#623), `0f255516` (before #603/#628/#629/#639) and `68b64909` (before #631/#632/#624) gave the same 14 mismatches with identical values, so the mismatch values are reproducible across five full runs. On `c317324f` the only change is adder_mos_circ: mismatch → timeout (#624). #623 and #628 (LTRA step rules), #629 (test only), #639 (temperature laws), #631 (numparam minus) and #632 (MOS1 batch stamping) changed no corpus-f outcome. Changes within an outcome class: ltra2_2_line 0.974 → 0.374 and txl1_1_line 0.973 → 0.371 (#601), txl2_3_line 0.0904 → 0.0864.

The separate 100-fixture aggregate is not changed by this PR. Its provenance pin and artifacts were refreshed on main by #613 (#598). An earlier version of this file wrongly said this PR did that.

## RED and GREEN mean different things on a triage card

This PR changes no simulator code; `packages/` is identical to main `c317324f`. Run:

```sh
CORPUS_F_REQUIRE_PARITY=1 pnpm exec tsx --test benchmarks/corpus/corpus-f/triage-511.test.ts
pnpm exec tsx --test benchmarks/corpus/corpus-f/triage-511.test.ts
```

The first command is deliberately **RED**. At `bf2e4169` it reproduced mosmem 0.227 and ltra2_2_line 0.974 against the unchanged 0.01 rule. After #601, mosmem matches and is asserted as a regression guard, and the command stays RED on ltra2_2_line (metric residual, #592). The second command is **GREEN**. It checks all original issue rows, explicit follow-up coverage for every current mismatch, exact stored measurements, live reproduction of mosmem matching, and the ltra2_2_line loss (6 tests with ngspice-47 installed). Without ngspice-47 the two live tests are skipped, not presented as parity passes. This is not a claim that failing physics became passing physics by changing an assertion.

The initial documentation regression run also failed because the saved triage had stale XSPICE measurements and omitted the seven newly exposed mismatches. Updating the measurements and linking #597 resolves that documentation gap.

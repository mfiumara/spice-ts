# corpus-f: triage of decks over the 1% parity threshold (#511)

Hand-written companion to the generated [README.md](README.md). Machine-readable version: [triage-511.json](triage-511.json). `triage-511.test.ts` checks it against the committed `outcomes.json`, so it fails when an outcome changes and this file is not updated.

Scope: all ten rows of the #511 table, the two other mismatches present in the imported report, and the decks exposed by the refreshes up to main `03706cc7` (switches-manual-p92; adder_mos_circ; the two #640 transient-noise decks). The seven newly runnable mismatches found by the first refresh on `bf2e4169`, plus adder_bip and measure/func-cap from the `03706cc7` refresh and XSPICE analog_models3_ac/analog_models3_transient from the `b1a1ff58` refresh and tests/transmission/cpl3_4_line from the `e2c73b29` refresh, remain published losses. They are explicitly deferred to [#597](https://github.com/mfiumara/spice-ts/issues/597), not claimed as root-caused here. No fixture, tolerance, threshold or metric was changed. Current measurements (the "Now" column and `outcomes.json`) use ngspice-47 and the simulator at main `dc7cc4a3` (sixth refresh and the dc7cc4a3 check, below); `packages/` on this branch is byte-identical to it. Diagnostic values attributed to earlier trees were not rerun. They use the published corpus-f metric with the published corpus-f metric (worst over signals of max|spice-ts - ngspice| / max(peak|ngspice|, 1e-12), ngspice interpolated onto spice-ts points with breakpoint alignment). Values attributed to `bf2e4169` are historical and appear only where they explain an issue. Diagnostic variants are labelled separately.

This triage covers the batch-1 `outcomes.json` table only. The "Control-vector supplement (#521)" in README.md is generated separately by `control-vectors.ts`. It was refreshed on the same tree (all 207 control decks: 15 matched, 39 mismatched (two of them the stochastic #640 noise decks, 6.03 and 1.78 in the `03706cc7` run, #655), 13 not compared, 122 spice-ts losses, 1 ngspice-only failure, 17 both-engine failures) but is not triaged here. Its mismatches remain linked to #511 or their gap issues.

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
| MOS1 had no Meyer intrinsic gate capacitance from TOX | fixed (#601) | https://github.com/mfiumara/spice-ts/issues/591 | ltra2_2_line (improved; the residual was step control, matched since #689) |
| spice-ts sized transient steps from a node-voltage LTE, not ngspice-47 CKTtrunc | fixed (#689) | https://github.com/mfiumara/spice-ts/issues/621 | ltra2_2_line, rtlinv, fourbitadder, mos-test (all matched on `e2c73b29`) |
| BSIM3 4-bit NAND adder: supply current 10-40x ngspice before #624, timeout after #624, internal-node mismatch 1.54 since #648 | simulator, not root-caused | https://github.com/mfiumara/spice-ts/issues/626 | adder_mos_circ |
| TRNOISE/TRRANDOM decks compare independent random realisations (ngspice reseeds every run) | metric | https://github.com/mfiumara/spice-ts/issues/655 | transient-noise simple-noise, rts-1 |
| Transient metric scores ngspice's coarse default-step output as spice-ts error | metric | https://github.com/mfiumara/spice-ts/issues/592 | rca3040, switches-manual-p92 (rtlinv, mos-test, fourbitadder and ltra2_2_line match since #689, so part of this was spice-ts step control, not only the metric) |
| Zero or near-zero ngspice peaks turn fV-µV residuals into mismatches | metric | https://github.com/mfiumara/spice-ts/issues/593 | rca3040 (AC v(2)), fourbitadder |
| BSIM1/BSIM2 (LEVEL 4/5) not implemented; typed error from #552 until ngspice-47 BSIM1/BSIM2 landed | fixed (#667) | https://github.com/mfiumara/spice-ts/issues/565 | bsim1, bsim2 |
| VDMOS .model silently dropped | fixed (#542, #562) | https://github.com/mfiumara/spice-ts/issues/509 | vdmosp-out, ro_11_vdmos |

## Per fixture

| Fixture | #511 table | Now | Classification and evidence |
|---|---|---|---|
| examples/vdmos/vdmosp-out.sp | 5.05e+242 dc i(vs) | matched, 1.48e-8 | Fixed by the VDMOS model (#562) after #509. |
| examples/vdmos/ro_11_vdmos.sp | (not in table; 3.19 in the committed outcomes) | matched, 0.00348 | Same. |
| tests/general/fourbitadder.cir | 8.64 | matched, 0.00313 | Worst signals are TTL NAND internal nodes with 75–125 µV peaks (abs error 6.7 µV on a 5 V circuit). At ngspice points: 0.0377. Against fine-step ngspice (TMAX 10 ps), spice-ts default is 0.0107 on its grid and ngspice default is 0.0415 on its grid. Residual 1.1 µV at t≈13 ps with both engines at 10 ps (5/270 signals at 1.02–1.07%) is not root-caused yet; recorded in #593. On `e2c73b29` it matches, worst v(x1.x2.x1.x6.8) 0.00313, after #689 ported ngspice-47 CKTtrunc step control (bisected). |
| tests/transmission/ltra2_2_line.cir | 1 | matched, 0.000468 | At `bf2e4169`: i(vs) gate current 0 in spice-ts vs a 2.5 µA ngspice peak (0.974, still 1.0 at TMAX 10 ps), and removing `TOX=18000N` from both cards made it agree → #591, fixed by #601. Now 0.374 (t≈16.1 ns: −42.5 nA vs −2.4 µA). That is 0.151 at ngspice points and 0.029 with both engines at TMAX 10 ps. #627 (#629) traced the residual to discretisation of a current that is discontinuous at the pulse corners. Against ngspice at TMAX 1 ps, spice-ts default scores 0.0233 and ngspice's own default run 0.0401. The post-breakpoint step rule differs from ngspice (#608) → #592. Other signals ≤ 0.0071 at ngspice points and ≤ 0.0033 at TMAX 10 ps → #592. On `b1a1ff58` the published value is 0.42: #677 (the #608 post-breakpoint step from CKTsaveDelta, bisected) raised it from 0.374. On `e2c73b29` it matches: i(vs) 0.000468 after #689 (CKTtrunc step control, bisected). The step-control difference, not the reference grid alone, was the residual. The diagnostics in this row were measured on earlier trees. |
| tests/bsim2/test.cir | 0.738 | matched, 8.17e-12 | The issue-table value came from running Level-1 equations; #552 made LEVEL=5 a typed `UnsupportedModelLevelError` (spice-ts-loss through `b3f04506`). #667 ported ngspice-47 BSIM2 and the unchanged deck now matches (worst dc i(v1)). |
| tests/general/mosmem.cir | 0.714 | matched, 0.00999 | At `bf2e4169`: i(vdd) 0.227, v(6) 0.103, i(vw) 0.0994, v(3) 0.0618, v(8) 0.0311, unchanged at TMAX 0.1 ns. Adding `mj=0` (constant CBD/CBS in ngspice) brought all 13 signals to ≤ 3.95e-4 → #590. Fixed by #601: the unchanged deck has 0/13 signals over 1% (worst v(4) 0.0025, i(vdd) 0.00205). On `b1a1ff58` v(4) is 0.00229 (#677, bisected). On `e2c73b29` the worst is i(vdd) 0.00999 (#689, bisected): still matched, but only just under the 0.01 rule, a published loss of margin. |
| tests/bsim1/test.cir | 0.628 | matched, 9.46e-9 | LEVEL=4, as bsim2; matches after #667 (worst dc i(v4)). |
| tests/general/rtlinv.cir | 0.432 | matched, 0.00238 | At ngspice points: 0.0013. All 16 signals ≤ 8.5e-4 with both engines at TMAX 20 ps. Against the fine-step reference, spice-ts default transient error is 5.24e-4 and ngspice default is 0.0017; DC remains 8.43e-4 → #592. 0.0527 → 0.0526 on `b1a1ff58` (#677, bisected). On `e2c73b29` it matches, 0.00238 (#689, bisected). |
| tests/general/rca3040.cir | 0.148 | mismatch, 0.0564 | Tran worst is v(1), the SIN source node itself (108 ngspice points over ten 50 MHz cycles); at ngspice points 0.0021. Against the fine-step reference (TMAX 10 ps), spice-ts tran is ≤ 0.0010 on its grid and ngspice default is 0.031 on its grid → #592. What remains is AC v(2), a node held by `vcc` with no AC value: spice-ts 4.84e-14 V vs ngspice exactly 0, divided by the 1e-12 floor = 0.0484 → #593. On `03706cc7` this AC v(2) term is the worst signal at 0.0564 (changed by a merge after `b3f04506`, not bisected). |
| examples/xspice/various/xspice_c1.cir | 0.0439 | matched, 2.26e-5 | Imported report was already matched at 4.93e-4. Fresh runs (`bf2e4169`, `4bdbe0c2`, `b3f04506`, `03706cc7`) include #531 initial-condition semantics. |
| examples/xspice/original-examples/spice3.deck | 0.0439 | matched, 2.26e-5 | Same circuit and transition as xspice_c1. |
| examples/probe/mos-test.cir | (not in table) | matched, 0.00811 | The inverter has no capacitance (default MOS1, no TOX/CJ, lambda 0, equal KP), so v(out) jumps vertically at vin = 2.5 V. Interpolating ngspice's 135-point grid across the jump gives 0.176. spice-ts's 3.64 V at vin = 2.33 V is the analytic value. At ngspice points: 0.0023 → #592. On `e2c73b29` it matches, 0.00811 (#689, bisected). |
| examples/probe/switches-manual-p92.cir | (not in table) | mismatch, 0.74 | Runnable since #579 (S/W switches); `spice-ts-loss` at `bf2e4169`. Ideal switches make v(10)/v(20)/v(30)/v(40) jump between consecutive output points. ngspice's default output brackets each edge with points 2 µs apart, for example v(10) crossing 0.5 V between 1.19856 and 1.20056 ms. spice-ts puts the edge inside that interval (1.20029 ms), so interpolating ngspice's chord gives 0.865 (spice-ts 1 vs ngspice 0.135 at t = 1.2 ms). At ngspice points: 2.7e-20. With both engines at TMAX 0.1 µs, the crossing times agree within 1e-8 s, but the metric still reports 1.0 at a vertical edge → #592. The other 8 signals agree to ≤ 5.4e-16. 0.865 → 0.74 on `e2c73b29` (#689, bisected); still a loss → #592. |
| examples/snapshot/adder_mos_circ.cir | (not in table) | mismatch, 0.0451 | Runnable since #599 (dotted BSIM3 `version=3.3.0`); `spice-ts-loss` at `bf2e4169`. On `68b64909` it was a mismatch of 42: i(vcc) −11.6 mA vs −25 µA near 8.95 ns, 40.6 at ngspice points. On `c317324f` (#624) it exceeded the 120 s bound. On `4bdbe0c2` (#648) it completes again: 81/90 signals over 1%, worst internal NAND node v(x1.x2.x1.x8.net.1) 1.54 (2.94 V vs 0.20 V near 0.985 µs), 1.44 at ngspice points. On `03706cc7` (after #661, the ngspice-47 BSIM3v3.3 charge model for #626; not bisected against the other merges) worst is i(vin3a) 0.755. On `b1a1ff58` worst is i(vcc) 0.0451: bisected over every main commit after `03706cc7`, the drop comes from #677 (post-breakpoint step from CKTsaveDelta, #608), not from a BSIM3 change. It is still over the 1% rule, so it stays a device-level loss → #626, root cause not established. |
| examples/transient-noise/simple-noise.cir, rts-1.cir | (not in table) | mismatch, 3.49 / 1.37 | Runnable since #640. Random sources: spice-ts is deterministic and ngspice-47 reseeds each run: 4.71 / 1.55 on `4bdbe0c2`, 3.75 / 1.45 on a triage-detail rerun, 2.5 / 1.36 on `b3f04506`, 5.44 / 1.14 on `03706cc7`, 1.49 (v(4)) / 1.52 (v(21)) on `b1a1ff58`, 7.12 (v(3)) / 1.52 (v(21)) on `e2c73b29`, 3.49 (v(3)) / 1.37 (v(21)) on `dc7cc4a3`. The sample-wise value is not reproducible and is not a parity measure → #655. It stays a published loss. |

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

### Second refresh on main `4bdbe0c2`

Review of the first version of this PR found that the published report was stale against main: #579 had made switches-manual-p92 runnable as a 0.865 mismatch. `outcomes.json` and README.md were regenerated again on the merge of this branch with main `4bdbe0c2` (`spice-heavy pnpm exec tsx benchmarks/corpus/corpus-f/outcomes.ts --jobs 4`). Result: 32 matched, 16 mismatched, 53 not compared, 205 spice-ts losses and 30 both-engine failures (outcome SHA-256 `bca8f348…`). The two transient-noise rows are stochastic, so this digest is not reproducible bit-for-bit until #655 is resolved. Compared with the `bf2e4169` regeneration, all 41 outcome-class transitions are listed below. They come from merged implementations, not from this PR.

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
| #599 BSIM3 version strings (values later moved by #624/#648) | loss → mismatch (adder_mos_circ, 1.54 now, → #626) | 1 |
| #640 TRNOISE/TRRANDOM | loss → mismatch (transient-noise simple-noise, rts-1; stochastic, → #655) | 2 |

Intermediate full regenerations on main `7c66aab9` (before #584), `e58322ea` (before #616/#623), `0f255516` (before #603/#628/#629/#639) and `68b64909` (before #631/#632/#624) gave the same 14 mismatches with identical values, so the mismatch values are reproducible across five full runs. On `c317324f` the only change was adder_mos_circ: mismatch → timeout (#624). On `4bdbe0c2`, adder_mos_circ completes again (#648, mismatch 1.54) and the #640 noise decks are new stochastic mismatches. #645 and #644 changed no corpus-f outcome. #623 and #628 (LTRA step rules), #629 (test only), #639 (temperature laws), #631 (numparam minus) and #632 (MOS1 batch stamping) changed no corpus-f outcome. Changes within an outcome class: ltra2_2_line 0.974 → 0.374 and txl1_1_line 0.973 → 0.371 (#601), txl2_3_line 0.0904 → 0.0864.

### Third refresh on main `b3f04506`

Review of head `d9439881` found the report stale against main `b3f04506` (#651, #652). `outcomes.json`, README.md and the control-vector supplement were regenerated on the merge of this branch with main `b3f04506` (`spice-heavy pnpm exec tsx benchmarks/corpus/corpus-f/outcomes.ts --jobs 4`, then `control-vectors.ts --jobs 4`). Outcome totals are unchanged (32 matched, 16 mismatched, 53 not compared, 205 spice-ts losses, 30 both-engine failures; outcome SHA-256 `832172f0…`). No outcome class changed. Rows that changed (all remain published losses):

| Fixture | Change | Cause |
|---|---|---|
| examples/control_structs/foreach_bjt_ft.sp, examples/various/bjt_ac_par.sp | first error `Unsupported bounded BJT model parameter: 'VAR'` → `Unsupported BJT model parameter: 'PTF' (excess phase is not implemented)` | #652 ports VAR and rejects unported BJT parameters on every card |
| examples/noise/bipolar-noise.cir | unsupported (VAR) → failed: `.noise does not support BJT model parameter 'VAR' for 'q1'`; bucket parse → execution | #652 |
| examples/control_structs/s-param.cir | failed `Undefined variable 'Vbias_in'` → unsupported `.control alter` of a subcircuit device; bucket execution → control (#488) | #651 X-line `params:` |
| examples/memristor/memristor.sp | unsupported `Cannot parse number: '20e3/stime'` → failed `no such vector 'stime'` in `.control`; bucket parse → execution | #651 `.subckt PARAMS:` expression defaults |
| tests/regression/func/func-1.cir | `Unknown function 'v'` → `v() takes one or two node names`; bucket expression → parse | #651 v() B-source sub-expressions |
| examples/transient-noise/simple-noise.cir, rts-1.cir | 4.71 → 2.5, 1.55 (v(9)) → 1.36 (v(21)) | stochastic, #655; no simulator change to these decks |

Control-vector supplement on the same tree: totals unchanged (13/38/13/125/1/17). The same five error-text rows changed; the noise decks moved 6.37 → 4.19 and 1.79 → 1.74 (#655); TransmissionLines/cpl_ibm1.sp moved 1.52 → 2.47 (still a mismatch, linked to #511, not root-caused here).

Harness fix in this refresh: after #651/#652, examples/digital/compare/adder_bip.cir can finish inside the 120 s spice-ts bound (about 89 s alone, 106,319 points x 450 signals). The first regeneration then crashed: the fixture child ran out of its default V8 heap while deserialising one object per sample (about 1.05 GB serialised). `outcomes.ts` now transports the spice-ts child's result as packed Float64Arrays (bit-for-bit round trip, unit-tested in `corpus-f.test.ts`). No metric, bound or fixture changed. Under the regeneration's 4-way parallel load it exceeded the 120 s bound again, so the published row stays a spice-ts-loss (timeout). Run alone on the same tree it completes as a mismatch with worst 0.0242 (tran v(10)). This row is load-sensitive near the bound; it is a published loss either way and is not triaged here.

### Fourth refresh on main `03706cc7`

The supervisor merged the accepted queue (#668, #656, #674, #663, #664, #659, #665, #671, #661, #658, #647, then #673, #672, #667) while the `b3f04506` refresh was in review. `outcomes.json`, README.md and the control-vector supplement were regenerated once more on the merge of this branch with main `03706cc7`, with the same commands. Result: 43 matched, 18 mismatched, 53 not compared, 192 spice-ts losses, 30 both-engine failures (outcome SHA-256 `97a565c5…`). All 15 outcome-class transitions against the `b3f04506` table come from those merged implementations, not from this PR:

| Prior implementation | Class transitions | Count |
|---|---|---:|
| #667 ngspice-47 BSIM1/BSIM2 | loss → matched (tests/bsim1, tests/bsim2; #511 rows, root cause marked fixed) | 2 |
| #672 MES level 1, MESA level 3, Z-card parameters | loss → matched (tests/hfet/id_vgs, tests/mes/subth, tests/mesa mesa13, mesa15, mesa21, mesgout, mesinv) | 7 |
| #647 .meas/.measure | loss → matched (measure/buggy-meas-tran, measure/meas_expression) | 2 |
| #647 .meas/.measure | loss → mismatch (measure/func-cap, 0.5 tran i(vdd); deferred to #597, not root-caused) | 1 |
| a merge after `b3f04506`, not bisected (the deck now finishes inside the 120 s bound) | loss → mismatch (digital/compare/adder_bip, 0.0242 tran v(10); deferred to #597, not root-caused) | 1 |
| #647 parses .meas, so the first error moved further into the deck (attribution per row not bisected; still losses) | loss → loss with a new first error: inv-meas-tran, inv-meas-tran-auto (.options scale/autostop, #494), mos-meas-dc (unknown model 'nch'), rc-meas-ac (singular matrix), ro_17_4 (.options xmu), MonteCarlo, vdp_osc_pss_ctrl, integrate1 (other .control commands), shot_ng (B-source i()) | 0 |

Changes within the mismatch class: adder_mos_circ 1.54 → 0.755 (worst now i(vin3a); #661 BSIM3 charge model is the likely cause, not bisected, still a loss under #626); rca3040 0.0511 → 0.0564 (worst now the #593 AC v(2) term); the stochastic noise decks moved again (5.44 / 1.14, #655). Error-text-only changes on losses: the LEVEL=14/54 BSIM4 rows now list levels 1, 2, 4, 5, 6, 8, 49 (#658, #667); mos-meas-dc-control(-file) remain both-failed with new spice-ts first errors.

Control-vector supplement on the same tree: 15 matched, 39 mismatched, 13 not compared, 122 spice-ts losses, 1 ngspice-only failure, 17 both-engine failures. buggy-meas-tran and meas_expression became matches and adder_bip a 0.0242 mismatch. Notable mismatch moves: ltra5_1_line 51.1 → 0.0568 (the #622 ECL-receiver DC operating point addressed by #664) and txl4_1_line 53.5 → 0.606 (same driver family; not bisected); cpl_ibm1 2.47 → 1.04; VDMOS-DIO 8.54e9 → 2.94e10 (worst signal now ac v(kd)); smaller moves on other transmission-line, param_sweep and theta_nch rows. None of these is triaged here; they stay published losses linked to #511/#595.

adder_bip and the harness fix: the packed Float64Array transport above is what lets this regeneration score adder_bip at all. In this run it finished inside the bound under 4-way load. It remains close to the 120 s bound, so a heavily loaded rerun may publish it as a timeout again.

The separate 100-fixture aggregate is not changed by this PR. Its provenance pin and artifacts were refreshed on main by #613 (#598). An earlier version of this file wrongly said this PR did that.

### Fifth refresh on main `b1a1ff58`

This refresh PR regenerated `outcomes.json`, README.md and the control-vector supplement on main `b1a1ff58` with the same commands (`spice-heavy pnpm exec tsx benchmarks/corpus/corpus-f/outcomes.ts --jobs 4`, then `control-vectors.ts --jobs 4`). Result: 45 matched, 20 mismatched, 53 not compared, 188 spice-ts losses, 30 both-engine failures (outcome SHA-256 `6bf0917e…`). Every changed fixture was rerun on each main commit after `03706cc7` (`506577c9`, `d7fd03c3`, `bcac6a7b`, `22c5976e`, `1ef0780e`, `5389edea`, `2ae73150`, `b1a1ff58`) in a throwaway worktree with that commit's own harness. All 4 outcome-class transitions come from merged implementations, not from this PR:

| Prior implementation | Class transitions | Count |
|---|---|---:|
| #670 XSPICE hyst code model | loss → matched (original-examples/analog_models3_dc, analog_models3_swept_dc) | 2 |
| #670 XSPICE hyst code model | loss → mismatch (analog_models3_ac 1.11 ac v(2), analog_models3_transient 0.0181 tran v(10); deferred to #597, not root-caused) | 2 |

Changes within a class, all bisected to #677 (post-breakpoint step from ngspice CKTsaveDelta, #608): adder_mos_circ 0.755 → 0.0451 (worst now i(vcc), still a #626 loss); ltra2_2_line 0.374 → 0.42 and txl1_1_line 0.371 → 0.422 (published losses); txl2_3_line 0.0864 → 0.0875; rtlinv 0.0527 → 0.0526; mosmem 0.0025 → 0.00229; arbitrary_phase 0.00187 → 0.00113; both cpl3_4_line decks still fail with timestep too small, at an earlier time. Error-text-only changes on losses: the XSPICE "not supported" lists now include the #670 models (analog_models4 now first fails on `triangle` instead of `sine`), regression/misc/convergence.cir moves from the µ suffix (#685) to `set savecurrents`, and various/ro_nand_digi.cir from the misplaced `.endc` (#684) to its D_NAND model card. The stochastic noise decks moved again (1.49 / 1.52, #655).

Control-vector supplement on the same tree: totals unchanged (15/39/13/122/1/17), no class transition. Within-class moves, bisected to #677: ddt-test1 1 → 0.5, cpl_ibm1 1.04 → 1.47 (loss), cpl1_4_line 2.34 → 1.8, cpl2_2_line 0.972 → 0.996 (loss), ltra1_1_line 0.322 → 0.21, ltra6_2_line 0.495 → 0.421, crss_coss_ciss 0.00098 → 0.00127 (still matched), inv_vdmos 0.1 → 0.101; ltra2_2_line, txl1_1_line, txl2_3_line, txl3_1_line, txl4_1_line, ltra3_2/4_1/5_1 and cpl_ibm3 moved by the same amounts as their batch-1 counterparts or by less than 0.01 (those rows were not individually bisected). Error-text attributions above follow the new first error line, not a bisect.

### Sixth refresh on main `e2c73b29`

The supervisor merged #688, #660 and #689 while the fifth refresh was being written, so everything was regenerated once more on main `e2c73b29`. Result: 51 matched, 15 mismatched, 56 not compared, 184 spice-ts losses, 30 both-engine failures (outcome SHA-256 `e7b67c91…`). Bisected over `7b1f6cac` (#688), `be4c3c01` (#660) and `e2c73b29` (#689); #660 changed no corpus-f row. All 10 outcome-class transitions:

| Prior implementation | Class transitions | Count |
|---|---|---:|
| #689 ngspice-47 CKTtrunc step control (#621, #646) | mismatch → matched (probe/mos-test, general/fourbitadder, general/rtlinv, resistance/res_array, transmission/cpl_ibm2, transmission/ltra2_2_line) | 6 |
| #689 | loss → not-compared (TransmissionLines/cpl_ibm1a: finished inside the 120 s bound for the first time; TransmissionLines/cpl3_4_line: no longer fails with timestep too small; both `.control` decks, #528) | 2 |
| #689 | loss → mismatch (tests/transmission/cpl3_4_line, 0.116 tran v(9); deferred to #597) | 1 |
| #688 `set savecurrents` | loss → not-compared (regression/misc/convergence.cir; `.control` deck, #528) | 1 |

Changes within a class, all #689: txl1_1_line 0.422 → 0.0236 and switches-manual-p92 0.865 → 0.74 (still losses); adder_bip 0.0242 → 0.016 (still a loss); txl2_3_line 0.0875 → 0.0878 (published loss); mosmem 0.00229 → 0.00999 and ro_11_vdmos 0.00348 → 0.00694 (still matched, but closer to the 0.01 rule: published losses of margin); arbitrary_phase, meas_expression, buggy-meas-tran, if-batchmode and xspice_c2 improve within matched. adder_mos_circ (0.0451) and rca3040 (0.0564) are unchanged. The noise decks moved again (7.12 / 1.52, #655).

Control-vector supplement on `e2c73b29`: 21 matched, 34 mismatched, 15 not compared, 119 spice-ts losses, 1 ngspice-only failure, 17 both-engine failures. Class transitions, bisected the same way: mismatch → matched for probe/mos-test, TransmissionLines cpl_ibm2, ltra2_2_line, ltra3_2_line, ltra7_4_line and vdmos/inv_vdmos (#689); loss → mismatch for TransmissionLines/cpl3_4_line (0.116, #689); loss → not-compared for TransmissionLines/cpl_ibm1a (#689) and regression/misc/convergence.cir (#688). Within-class gains include cpl_ibm1 1.47 → 0.293, cpl1_4_line 1.8 → 0.213, ltra1_4_line 0.917 → 0.0998, txl4_1_line 0.612 → 0.0817 and ltra5_1_line 0.057 → 0.0113. Published losses: ltra6_2_line 0.421 → 0.58 (#689, bisected), txl2_3_line 0.0875 → 0.0878 and ro_11_vdmos 0.00348 → 0.00694 (still matched).

### Check on main `dc7cc4a3`

#695 (current-source m) and #696 (BSIM3v32 revisions) merged during the sixth refresh. A full regeneration on this branch merged with `dc7cc4a3` gives the same totals and no outcome-class transition (outcome SHA-256 `c9915c38…`). Only first-error text changes on two losses (tclspice tcl-testbench2/4 example.cir, BSIM3 revision rows now reported by #696's checks) and the stochastic #655 noise decks move (3.49 / 1.37). The control-vector supplement was regenerated on the same tree.

## RED and GREEN mean different things on a triage card

This PR changes no simulator code; `packages/` is identical to main `03706cc7`. Run:

```sh
CORPUS_F_REQUIRE_PARITY=1 pnpm exec tsx --test benchmarks/corpus/corpus-f/triage-511.test.ts
pnpm exec tsx --test benchmarks/corpus/corpus-f/triage-511.test.ts
```

The first command was deliberately **RED**. At `bf2e4169` it reproduced mosmem 0.227 and ltra2_2_line 0.974 against the unchanged 0.01 rule. After #601, mosmem matched and became a regression guard, and the command stayed RED on ltra2_2_line. Since #689 (CKTtrunc step control, `e2c73b29`) ltra2_2_line matches too: both live rows are now regression guards, `CORPUS_F_REQUIRE_PARITY` no longer changes the test, and the old "loss still present" assertion was replaced because the simulator, not the assertion, changed. The second command is **GREEN**. It checks all original issue rows, explicit follow-up coverage for every current mismatch, exact stored measurements, and live reproduction of mosmem and ltra2_2_line matching (6 tests with ngspice-47 installed). Without ngspice-47 the two live tests are skipped, not presented as parity passes. This is not a claim that failing physics became passing physics by changing an assertion.

The initial documentation regression run also failed because the saved triage had stale XSPICE measurements and omitted the seven newly exposed mismatches. Updating the measurements and linking #597 resolves that documentation gap.

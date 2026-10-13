# Issue 847: which Newton vector ngspice-47 reports (CKTrhsOld)

Finding: ngspice-47 reports the iterate that the converging Newton solve was
linearised at (`CKTrhsOld`), not that solve. spice-ts reports the converging
solve. Switching spice-ts to report its own linearisation point makes the
#825 VSWITCH deck match ngspice exactly. It also moves 53 of the 71 compared
aggregate rows, 33 of them away from ngspice, and breaks 173 of 3401
ngspice-pinned core tests. spice-ts therefore keeps reporting the converged
solve. Nothing in the simulator changes in this PR: this file publishes the
measurement, and `ckt-rhsold.patch` is the exact change that was measured.

Machine: Apple M5 Pro, macOS Darwin 27.0.1 arm64, Node v22.23.1, ngspice-47
(Homebrew). Base commit `49a4fed46065cfb466abc776a9d8738af7077689`.

## What ngspice-47 does (source)

All paths are relative to `ngspice-47/src`.

- `maths/ni/niiter.c`: each pass loads the devices at `CKTrhsOld`, solves into
  `CKTrhs`, and runs `NIconvTest` (node voltages and each device's
  `CKTconvTest`). Line 287: on the first iteration (`iterno == 1`)
  `CKTnoncon` is forced to 1, so NIiter never converges on its first solve.
  Lines 332-335: in `MODEINITFLOAT` with `CKTnoncon == 0` it does
  `return(OK)` straight away. The `SWAP(double *, ckt->CKTrhs, ckt->CKTrhsOld)`
  at line 363 runs only when the loop continues. On convergence, `CKTrhs`
  therefore holds the converging solve and `CKTrhsOld` the iterate it was
  linearised at.
- `spicelib/analysis/cktdump.c:43`: output uses
  `valData.v.vec.rVec = ckt->CKTrhsOld+1`.
- `spicelib/analysis/dcop.c:101` and `dctran.c:327`: the operating point kept
  for later small-signal analyses is copied from `CKTrhsOld`
  (`CKTrhsOp[i] = CKTrhsOld[i]`).
- The device state (`CKTstate0`) of the accepted point was loaded at that same
  `CKTrhsOld`. The next sweep point or timestep starts from it too.
  `PREDICTOR` is not defined in a default build, so `NIpred`/`CKTsols` are
  not used.

So `CKTrhsOld` at convergence is ngspice's documented output semantics, as the
issue says.

## Direct runs on identical decks

`ngspice -b` with `set ngbehavior=psa` in `.spiceinit`, against spice-ts
`simulate()` on the same text. The `.print` card is stripped for spice-ts.

VSWITCH DC sweep: the #825 test deck, `.dc Vc -2 2 0.25` with SMOD1 and SMOD2.

| v(out) at Vc = -0.25 | value |
| --- | --- |
| ngspice-47 | 9.919552e-01 |
| spice-ts as shipped (converged solve) | 9.914147e-01 (rel. diff 5.4e-4) |
| spice-ts with `ckt-rhsold.patch` | 9.919552e-01 (exact) |

The issue's two-point example (`.dc Vc -0.5 -0.25 0.25`) does not show the
effect. There ngspice-47 itself prints 9.914147e-01, and so does spice-ts
before and after the patch. The gap needs the longer sweep history of the
test deck.

Diode operating point: `V1 in 0 DC 5`, `R1 in a 1k`, `D1 a 0 DMOD`,
`.model DMOD D IS=1e-14 N=1`, `.op`.

| v(a) | value | rel. diff vs ngspice |
| --- | --- | --- |
| ngspice-47 | 6.928910e-01 | |
| spice-ts as shipped | 6.92887890e-01 | 4.5e-6 |
| spice-ts with `ckt-rhsold.patch` | 6.93010925e-01 | 1.7e-4 |

ngspice takes 5 Newton iterations (`.options acct`: "Total iterations = 5",
including the MODEINITJCT pass). spice-ts takes 6 (`convergence.dc.newtonIterations`).
The two engines follow different iterate sequences: different initial
junction handling, limiting and convergence tests. So spice-ts's iterate
before its converging solve is not ngspice's `CKTrhsOld`. Reporting it only
helps where the Newton sequences coincide, as they do on the pswitch deck.

## Aggregate A/B (100 fixtures, 71 compared analyses)

The same tree was run twice, before and after `ckt-rhsold.patch`
(`git apply benchmarks/results/issue-847/ckt-rhsold.patch`, rebuild core,
`pnpm exec tsx benchmarks/aggregate-report.ts`).

On this base the generator refuses to run as committed, for two reasons that
predate this issue. First, its pinned `SOURCES.md` and fixture-tree hashes are
stale. Second, `validateAggregateAccounting` rejects the committed
`ngspice/mos-amplifier-transient` status transition. For this measurement
only, the two pins were set to the actual hashes
(`6c75ee95…be56f`, `2aa6a706…b317ac`) and the final validation call was
skipped. Both A and B runs used that same local edit. It was then reverted,
and none of it is committed.

- Outcomes: before `bf0b40a9f20c71d6c3f2b16de8e8ba4ab1060734615d46a44a5dddf7cc9150f6`,
  after `b115c989e8532b9d4e41e42281468238a180e9e68ac2b64a45625499b7a797b8`.
  No engine status changes (spice-ts 68/1/31 both ways).
- Rows (fixture × analysis) whose metrics change: 53 of 71. 17 are better
  (more signals with lower absolute RMS than higher), 33 worse, 3 mixed.
- Signals with absolute RMS changed by more than 1%: 145 better, 497 worse,
  333 within 1%.
- Every operating-point row is worse: `ngspice/jimi-fuzz`,
  `corpus-e/diode-bias-sweep`, `corpus-e/mos1-inverter-sweep`, and the OP
  rows of `bjt-diffpair-transient`, `bjt-rtl-inverter-chain` and
  `bjt-diffpair-current-source`. OP is the least ambiguous check of which
  vector ngspice prints.
- Worst-signal envelope: absolute max rises from 7018.3 to 757403.3, from
  `ngspice/vbic-common-emitter-ac` `.pz`, because the small-signal
  linearisation now runs at a less converged point. Relative max is unchanged.

Changed rows, worst absolute max before → after:

| Fixture | Analysis | Verdict | Signals RMS ↓ / ↑ / ≈ | Worst abs max |
| --- | --- | --- | --- | --- |
| ngspice/vbic-fo | dc | worse | 0 / 3 / 3 | 6.715e-06 → 4.694e-06 |
| ngspice/vbic-temperature | dc | worse | 0 / 3 / 3 | 9.235e-07 → 1.42e-05 |
| ngspice/mos6-inverter-transient | tran | worse | 1 / 5 / 38 | 0.03104 → 0.03095 |
| ngspice/jfet-vds-vgs | dc | better | 2 / 0 / 2 | 3.097e-06 → 2.143e-06 |
| ngspice/vbic-common-emitter-ac | ac | worse | 0 / 5 / 1 | 1.012e-07 → 0.5756 |
| ngspice/vbic-common-emitter-ac | pz | worse | 0 / 13 / 0 | 7018 → 7.574e+05 |
| ngspice/mos-amplifier-transient | tran | better | 20 / 0 / 4 | 0.1422 → 0.147 |
| ngspice/mos6-simple-inverter-transient | tran | worse | 0 / 3 / 2 | 0.0003123 → 0.0002551 |
| ngspice/ltra-line-transient | tran | better | 4 / 0 / 2 | 1.455e-05 → 1.377e-05 |
| ngspice/hfet-inverter | tran | mixed | 0 / 0 / 6 | 2.272 → 2.272 |
| ngspice/mesa-oscillator | tran | worse | 0 / 36 / 1 | 4.637e-05 → 0.005353 |
| ngspice/jimi-fuzz | op | worse | 0 / 8 / 5 | 3.824e-08 → 7.515e-06 |
| ngspice/jimi-fuzz | tran | better | 9 / 0 / 4 | 2.716 → 2.743 |
| ngspice/schmitt-trigger | tran | worse | 1 / 8 / 1 | 0.008137 → 0.2789 |
| classic/bjt-noise | noise | worse | 0 / 2 / 0 | 2.461e-14 → 3.477e-12 |
| classic/bjt-noise | noise (total) | worse | 0 / 2 / 0 | 7.783e-12 → 1.099e-09 |
| classic/bsim1-device-sweep | dc | worse | 1 / 7 / 16 | 4.121e-13 → 2.081e-09 |
| classic/bsim2-device-sweep | dc | worse | 0 / 6 / 18 | 6.211e-16 → 2.214e-09 |
| classic/bjt-differential-pair | tran | better | 9 / 0 / 3 | 0.0001492 → 5.176e-05 |
| classic/diode-distortion | disto (3 rows) | worse | 0 / 3 / 2 each | 1.618e-11 → 6.264e-10 (two rows), 2.77e-14 → 1.07e-12 |
| classic/lossy-line-24-inch | tran | worse | 0 / 2 / 1 | 0.02178 → 0.04679 |
| classic/lossy-line-aluminium | tran | worse | 1 / 258 / 2 | 0.00971 → 0.009946 |
| classic/coupled-lossy-lines | tran | better | 15 / 14 / 18 | 1.023 → 1.635 |
| classic/mos6-inverter-chain | tran | worse | 1 / 5 / 38 | 0.03104 → 0.03095 |
| classic/mos-amplifier | tran | better | 20 / 0 / 4 | 0.1422 → 0.147 |
| classic/mos-memory-cell | tran | worse | 4 / 7 / 2 | 0.000223 → 0.001408 |
| classic/rca3040-wideband-amplifier | ac | worse | 0 / 18 / 3 | 7.409e-09 → 9.795e-05 |
| classic/rca3040-wideband-amplifier | dc | worse | 0 / 18 / 3 | 0.0004463 → 0.000703 |
| classic/rca3040-wideband-amplifier | tran | better | 12 / 2 / 7 | 0.00624 → 0.006164 |
| classic/rtl-inverter-chain | dc | mixed | 2 / 2 / 4 | 0.00353 → 0.003524 |
| classic/rtl-inverter-chain | tran | better | 4 / 1 / 3 | 0.005858 → 0.005837 |
| classic/ecl-schmitt-trigger | tran | worse | 1 / 8 / 1 | 0.008137 → 0.2789 |
| xyce/diode-sidewall-dc | dc | better | 2 / 0 / 2 | 0.0001033 → 8.55e-05 |
| xyce/njfet-2109-dc | dc | worse | 2 / 3 / 5 | 1.465e-06 → 2.714e-06 |
| xyce/nmos-level1-dc | dc | worse | 0 / 2 / 5 | 0.0006817 → 0.0006639 |
| xyce/npn-dc | dc | better | 7 / 0 / 1 | 0.000544 → 0.0005439 |
| xyce/pmos-level1-dc | dc | better | 1 / 0 / 5 | 0.002003 → 0.00199 |
| xyce/pnp-dc | dc | mixed | 0 / 0 / 12 | 0.0009832 → 0.000983 |
| corpus-e/diode-bias-sweep | dc | better | 2 / 0 / 1 | 0.0002483 → 0.0002143 |
| corpus-e/diode-bias-sweep | op | worse | 0 / 2 / 1 | 2.745e-06 → 8.077e-05 |
| corpus-e/mos1-inverter-sweep | dc | worse | 2 / 4 / 3 | 0.003521 → 0.0008994 |
| corpus-e/mos1-inverter-sweep | op | worse | 1 / 3 / 5 | 4.539e-10 → 4.539e-10 |
| corpus-e/mos1-inverter-sweep | tran | better | 5 / 1 / 3 | 0.0006411 → 0.0001456 |
| corpus-e/bjt-diffpair-transient | op | worse | 0 / 9 / 3 | 1.039e-08 → 8.501e-08 |
| corpus-e/bjt-diffpair-transient | tran | worse | 0 / 1 / 11 | 0.0004393 → 0.0004353 |
| corpus-e/bjt-rtl-inverter-chain | dc | better | 3 / 1 / 4 | 0.001932 → 0.001929 |
| corpus-e/bjt-rtl-inverter-chain | op | worse | 0 / 6 / 2 | 8.018e-09 → 6.131e-07 |
| corpus-e/bjt-rtl-inverter-chain | tran | better | 6 / 0 / 2 | 0.004578 → 0.004375 |
| corpus-e/bjt-diffpair-current-source | ac | worse | 0 / 9 / 3 | 2.278e-05 → 0.0001413 |
| corpus-e/bjt-diffpair-current-source | op | worse | 0 / 9 / 3 | 1.938e-08 → 1.032e-07 |
| corpus-e/bjt-diffpair-current-source | tran | better | 7 / 2 / 3 | 0.0006354 → 0.0003898 |

Some transient rows improve, but they are outnumbered, and no OP row
improves. That is not evidence for adopting the patch.

## Core test suite with the patch

`spice-heavy pnpm -C packages/core exec vitest run` with `ckt-rhsold.patch`
applied gives 173 failed, 3226 passed and 2 skipped (3401). The failures are
almost all ngspice-47-pinned parity tests: diode (48 across 8 files),
BSIM3v3/v3.2 i(VD) (31), BJT (15), the temperature parity tests (12), MOS2,
MOS3, B-sources, `.tf`, `.pz`, `.noise` and `.disto`. The unpatched suite is
this PR's CI run.

## Decision and what parity would need

spice-ts keeps reporting the converged Newton solve. This is a published
convention difference: it is at most RELTOL from ngspice, and it shows where a
large final Newton step (for example XSPICE `conv_limit` input limiting on
pswitch) leaves `CKTrhsOld` near the edge of the tolerance.

Reporting `CKTrhsOld` exactly would need spice-ts's whole DC/transient Newton
iterate sequence to reproduce ngspice's: the MODEINITJCT/INITFIX/INITFLOAT
passes, the first-iteration non-convergence, and every device's
`CKTconvTest`, limiting and bypass. Only then would the vector before the
converging solve be the same in both engines. That is a solver-wide parity
project, not an output switch, and it must be judged on this same aggregate
A/B.

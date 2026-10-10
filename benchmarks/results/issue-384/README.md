# Issue 384: two-source nested DC sweep comparison receipt

Issue #384 reported an 18 V `v(5)` mismatch for `xyce/nmos-level1-dc`
(`benchmarks/corpus/xyce/fixtures/NMOS1_DC/nmos1.cir`, unchanged, SHA-256
`3ab24382b4fb966d2111ba8b2aa0590b989fc09b367c09eb41cc7ac475e0e255`). The netlist runs
`.DC VGG 0 18 1 VDD 0 18 1`, a two-source nested sweep with 19 x 19 = 361 points.

Regenerate `report.json` (requires ngspice-47 on PATH):

    pnpm -C packages/core build && pnpm exec tsx benchmarks/results/issue-384/compare.ts

## Root cause

The error was in the comparison, not the simulator. Since #359, spice-ts and ngspice-47 both return the same
nested grid: the primary sweep restarts for each value of the secondary source. The shared harness
`alignAndMeasure` (`benchmarks/comparison-harness.ts`) treated that grid as one monotonic axis. It
binary-searched and interpolated across the repeated primary values, so most spice-ts points were compared
with an ngspice point from a different secondary value. `v(5)` (= VDD) was then off by the whole 18 V
supply range.

The harness now splits each grid into monotonic segments. A segment ends only where the grid strictly
reverses direction. Points are aligned only inside the segment with the same position in both engines. If
the engines have different segment counts, the points are counted as excluded instead of being compared with
unrelated samples. Monotonic grids (OP, AC, TRAN and single-source DC) form one segment and behave as before.
No simulator code, tolerance, fixture or per-circuit setting was changed.

The same artifact affected every nested-sweep fixture in the aggregate. All four are measured here.

## Before/after (ngspice-47, identical bytes to both engines)

"Before" is copied from the committed `benchmarks/aggregate-report.json` at base `3b200b0`.
"After" is the fixed harness on the same executions.

| fixture | signal | before abs max | before abs RMS | before rel max | after abs max | after abs RMS | after rel max | after rel RMS |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| ngspice/jfet-vds-vgs | i(vd) | 0.005146 | 0.002683 | 47.9 | 3.097e-06 | 3.475e-07 | 0.0006248 | 7.885e-05 |
| ngspice/jfet-vds-vgs | i(vg) | 7.039e-12 | 4.22e-12 | 1 | 6.194e-16 | 6.951e-17 | 0.0002052 | 2.736e-05 |
| ngspice/jfet-vds-vgs | v(1) | 3 | 1.85 | 1 | 0 | 0 | 0 | 0 |
| ngspice/jfet-vds-vgs | v(2) | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| xyce/njfet-2109-dc | i(vds) | 0.003294 | 0.001814 | 0.7135 | 1.465e-06 | 3.364e-07 | 0.0005784 | 0.0001367 |
| xyce/njfet-2109-dc | i(vgs) | 2.823e-10 | 6.089e-11 | 0.01317 | 1.912e-14 | 2.39e-15 | 6.834e-05 | 8.611e-06 |
| xyce/njfet-2109-dc | i(vidmon) | 0.003294 | 0.001814 | 0.7135 | 1.465e-06 | 3.364e-07 | 0.0005784 | 0.0001367 |
| xyce/njfet-2109-dc | i(vigmon) | 2.823e-10 | 6.089e-11 | 0.01317 | 1.912e-14 | 2.39e-15 | 6.834e-05 | 8.611e-06 |
| xyce/njfet-2109-dc | i(vismon) | 0.003294 | 0.001814 | 0.7135 | 1.465e-06 | 3.364e-07 | 0.0005784 | 0.0001367 |
| xyce/njfet-2109-dc | v(1), v(1a), v(3) | 0 | 0 | 0/null | 0 | 0 | 0/null | 0/null |
| xyce/njfet-2109-dc | v(2), v(2a) | 1.875 | 1.148 | 2 | 0 | 0 | 0 | 0 |
| xyce/nmos-level1-dc | i(vdd) | 2.609e-07 | 1.379e-07 | 17 | 1.236e-18 | 3.651e-19 | 4.739e-12 | 2.282e-12 |
| xyce/nmos-level1-dc | i(vgg) | 0.001926 | 0.001062 | 7.399e+08 | 1.363e-06 | 9.388e-08 | 1 | 0.6115 |
| xyce/nmos-level1-dc | v(1) | 5.739 | 3.033 | 17 | 1.776e-15 | 4.636e-16 | 5.223e-16 | 2.014e-16 |
| xyce/nmos-level1-dc | v(2) | 0.9632 | 0.5309 | 7.399e+08 | 0.0006817 | 4.694e-05 | 1 | 0.6115 |
| xyce/nmos-level1-dc | v(3) | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| xyce/nmos-level1-dc | v(4) | 18 | 9.512 | 17 | 1.776e-15 | 4.201e-16 | 1.48e-16 | 4.934e-17 |
| xyce/nmos-level1-dc | v(5) | 18 | 9.512 | 17 | 0 | 0 | 0 | 0 |
| xyce/pnp-dc | i(vbb), i(vmon1) | 7.525e-06 | 3.199e-06 | 14.28 | 6.238e-09 | 2.085e-09 | 0.001831 | 0.0004546 |
| xyce/pnp-dc | i(vmon2) | 0.0003827 | 0.0001577 | 14.37 | 3.742e-07 | 1.197e-07 | 0.001834 | 0.0004513 |
| xyce/pnp-dc | i(vmon3), i(vpos) | 0.0003891 | 0.0001604 | 8.812 | 3.804e-07 | 1.217e-07 | 0.001692 | 0.000423 |
| xyce/pnp-dc | v(1), v(5) | 0 | 0 | 0/null | 0 | 0 | 0/null | 0/null |
| xyce/pnp-dc | v(2), v(7) | 0.7782 | 0.3208 | 8.812 | 0.0007609 | 0.0002434 | 0.001692 | 0.0003802 |
| xyce/pnp-dc | v(3) | 0.7881 | 0.3365 | 6.459 | 0.001185 | 0.0003962 | 0.002564 | 0.0009066 |
| xyce/pnp-dc | v(4), v(6) | 2 | 0.9129 | 3 | 0 | 0 | 0 | 0 |

All grids align fully: 104, 64, 361 and 30 points, with none excluded.

## Remaining losses (published, not hidden)

1. nmos-level1-dc `v(2)` up to 0.68 mV and `i(vgg)` up to 1.36 uA in saturation, for example VGG=4, VDD=16.
   The analytic square-law root there is v(2)=0.7130539993 V. spice-ts returns 0.7130539993 V and ngspice-47
   returns 0.7123723271 V. The gap is about 1e-3 relative, which is ngspice's default RELTOL Newton
   stopping criterion. In a diagnostic-only rerun on a copy of the netlist with
   `.OPTIONS RELTOL=1e-9 VNTOL=1e-12 ABSTOL=1e-15`, the `v(2)` max error drops to 1.9e-8 V and the
   `i(vgg)` max error to 3.8e-11 A (`report.json` → `diagnosticTightNgspice`). That rerun is never used as
   the benchmark reference.
2. nmos-level1-dc relative max 1.0 on `v(2)`/`i(vgg)` happens in cutoff (VGS < VTO). There ngspice reports
   v(2) = RS * (GMIN * VDS + IS), for example 5.05e-10 V at VGG=1, from the MOS1 bulk-drain junction
   (mos1load.c: `gbd = CKTgmin`, `cbd = gbd*vbd - DrainSatCur`, IS = 1e-14 by default). spice-ts MOSFET level 1
   has no bulk-junction diode currents. Its GMIN only enters the Jacobian, so it returns about 2.5e-19 V.
   This is a real device-model gap, at most about 9e-9 V absolute on this fixture. It is tracked as a
   follow-up and not fixed in this harness-only change.
3. pnp-dc: up to 1.19 mV (0.26 % relative) on `v(3)` and 0.18 % on the currents. jfet-vds-vgs and
   njfet-2109-dc: up to 0.06 % relative on drain currents. These residuals are now real model-level
   differences rather than alignment artifacts. They are outside this MOSFET/DC-sweep card.

# Mutually accepted ngspice 47 / Xyce 7.10 references

100 fixtures selected (target 100); 124 of 661 licensed originals are reference-eligible. The initial aggregate subset accepted 26. First 100 reference-eligible rows selected in deterministic order.

Selection uses only both references exporting numeric data on every identical canonical analysis projection, without unsupported or ignored/lossy statements. It never uses spice-ts results. Xyce receives additional output-only .print directives. Original/canonical and projected engine hashes, transformations, every native warning and failure are retained in report.json and hash-manifest.json. Exclusions with per-fixture reasons are in subset-manifest.json. No aggregate ledger or scoring is changed.

Observed reference disagreement is not proof of model equivalence or inequivalence, nor evidence that spice-ts is wrong. No spice-ts engine is executed in this report. Native execution/export/parse failures are separate from convergence evidence. Ignored-dot-line warnings remain in native logs and exclude a fixture.

Order is original aggregate A..E manifest order, followed by F..J original manifest order (hash tie-breaker on equal ordinals; no ties). Already-translated -spice3 decks are not additional original circuits. Every candidate is run, even if the target is reached, and every row retained.

Metrics use the existing harness, target=ngspice and reference=Xyce despite legacy field names. Xyce is linearly interpolated onto the ngspice grid, nested sweep segments matched by ordinal; complex differences are Euclidean. Relative denominator is Xyce magnitude; reference magnitudes <=1e-15 are excluded from relative metrics and counted. Fixture absolute/relative RMS values pool the respective sample counts across all signals and analyses. Mixed voltage/current absolute envelopes are descriptive only; per-signal values below are authoritative. Missing/unmatched signals are never agreement. Partial comparisons on excluded rows remain in report.json, not in the eligible table.

Global descriptive buckets (not parity scoring): all absolute errors <=1e-9; otherwise materially nonzero signals with relative maximum <=1e-3 or >1e-3; absolute-only when no nonzero denominator exists; missing/empty comparison is separate. Thresholds are uniform across circuits and do not change selection.

## Execution provenance

The original run stopped after 632 saved fixtures when JSON.stringify of a large native diagnostic series exceeded V8 string size. Bounded 4096-sample serialization now hashes the identical JSON byte stream without dropping samples. The verified prefix was resumed with --resume. executionSegments in report.json retains both source-hash snapshots and ordinal ranges; the interrupted report is archived separately. This repair changes receipt serialization, not native adapter policy or numerical results.

## Reproduction

Run from repository root with the pinned Xyce serial executable:

`XYCE_BIN=$HOME/.hermes/cache/scratch/xyce-948/install/bin/Xyce spice-heavy pnpm exec tsx benchmarks/reference/subset.ts --output-dir benchmarks/reference/subset-rerun`

Offline render/hash check: `pnpm exec tsx benchmarks/reference/subset.ts --render-only --output-dir benchmarks/reference/mutual-948`.

## Summary buckets (all attempted rows)

- native-failure: 163
- transformed-with-loss: 37
- relative-at-most-1e-3: 14
- absolute-at-most-1e-9: 38
- unsupported: 337
- relative-above-1e-3: 71
- absolute-only-disagreement: 1

## Selected-subset disagreement buckets

- relative-at-most-1e-3: 12
- absolute-at-most-1e-9: 29
- relative-above-1e-3: 58
- absolute-only-disagreement: 1

## Per-fixture errors and retained exclusions

| Fixture | Selected | Eligibility | Disagreement bucket | Max abs | RMS abs | Max rel | RMS rel |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| ngspice/vbic-fo | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| ngspice/vbic-temperature | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| ngspice/mos6-inverter-transient | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| ngspice/jfet-vds-vgs | true | comparable | relative-at-most-1e-3 | 3.096873e-6 | 1.729277e-7 | 9.805982e-4 | 6.580074e-5 |
| ngspice/rc-lowpass-ac | true | comparable | absolute-at-most-1e-9 | 1.777224e-16 | 3.533134e-17 | 2.214034e-15 | 3.855400e-16 |
| ngspice/ac-zero-frequency | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| ngspice/vbic-common-emitter-ac | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| ngspice/probe-ac | true | comparable | absolute-at-most-1e-9 | 4.039485e-16 | 9.580355e-17 | 1.204762e-14 | 1.889651e-15 |
| ngspice/rc-transient | true | comparable | relative-above-1e-3 | 4.489803e-4 | 1.334819e-4 | 2.591879e-1 | 3.468282e-2 |
| ngspice/mos-amplifier-transient | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| ngspice/mos6-simple-inverter-transient | true | comparable | relative-above-1e-3 | 4.971119e-1 | 1.953481e-2 | 7.678318e+1 | 3.094523e+0 |
| ngspice/ltra-line-transient | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| ngspice/hfet-inverter | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| ngspice/mesa-oscillator | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| ngspice/jimi-fuzz | true | comparable | absolute-only-disagreement | 8.708512e+0 | 8.396755e-1 | 2.086082e+14 | 7.447817e+11 |
| ngspice/schmitt-trigger | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| ngspice/inductive-positive-definite-2x2 | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| ngspice/inductive-positive-definite-3x3 | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| ngspice/inductive-positive-definite-4x4 | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| ngspice/inductive-positive-definite-ac | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| classic/bjt-noise | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| classic/bsim1-device-sweep | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| classic/bsim2-device-sweep | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| classic/bjt-differential-pair | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| classic/diode-distortion | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| classic/lossy-line-24-inch | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| classic/lossy-line-aluminium | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| classic/coupled-lossy-lines | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| classic/bjt-mixer-distortion | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| classic/mos6-inverter-chain | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| classic/mos-amplifier | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| classic/mos-memory-cell | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| classic/pole-zero-four-stage | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| classic/pole-zero-three-stage | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| classic/rc-transient | true | comparable | relative-above-1e-3 | 4.489803e-4 | 1.334819e-4 | 2.591879e-1 | 3.468282e-2 |
| classic/rca3040-wideband-amplifier | true | comparable | relative-above-1e-3 | 1.772942e+0 | 3.393949e-1 | 4.375956e+5 | 1.460775e+4 |
| classic/resistor-noise | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| classic/rtl-inverter-chain | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| classic/ecl-schmitt-trigger | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| classic/high-pass-pole-zero | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| xyce/capacitor-rc-transient | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| xyce/capacitor-rc-transient-newlte | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| xyce/capacitor-rc-oscillator | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| xyce/diode-level2-temperature-breakdown | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| xyce/diode-zener-5229 | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| xyce/diode-transient | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| xyce/diode-sidewall-dc | true | comparable | relative-above-1e-3 | 3.047192e-5 | 3.953788e-6 | 1.001267e-3 | 2.184669e-4 |
| xyce/inductor-transient | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| xyce/njfet-2109-dc | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| xyce/njfet-stepped-dc | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| xyce/nmos-level1-dc | true | comparable | relative-above-1e-3 | 6.816736e-4 | 1.774101e-5 | 2.784290e-1 | 8.758216e-2 |
| xyce/npn-dc | true | comparable | relative-at-most-1e-3 | 5.655137e-4 | 9.952447e-5 | 7.342347e-4 | 1.273831e-4 |
| xyce/pmos-level1-dc | true | comparable | relative-at-most-1e-3 | 2.003076e-3 | 4.721296e-4 | 5.187012e-4 | 1.853707e-4 |
| xyce/pnp-dc | true | comparable | relative-at-most-1e-3 | 9.929789e-4 | 1.009129e-4 | 9.499768e-4 | 1.645360e-4 |
| xyce/resistor-dc | true | comparable | absolute-at-most-1e-9 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 |
| xyce/resistor-level3-zero | true | comparable | relative-above-1e-3 | 1.171875e-4 | 4.096910e-5 | 2.343750e-2 | 1.353165e-2 |
| xyce/resistor-negative | true | comparable | absolute-at-most-1e-9 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 |
| xyce/rlc-transient | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| xyce/vccs-dc | true | comparable | absolute-at-most-1e-9 | 8.881784e-16 | 1.281988e-16 | 2.602085e-16 | 9.384695e-17 |
| xyce/vcvs-dc | true | comparable | absolute-at-most-1e-9 | 5.329071e-15 | 1.011974e-15 | 8.899098e-14 | 2.927557e-14 |
| corpus-d/ohms-law-op | true | comparable | absolute-at-most-1e-9 | 6.938894e-18 | 4.906539e-18 | 1.261617e-16 | 8.920980e-17 |
| corpus-d/diode-operating-point | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-d/ekv-bias-sweep | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-d/downscaling-current-mirror | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-d/transresistance-ac | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-d/passive-pole-zero-ac | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-d/resistor-voltage-ac | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-d/series-resonance-ac | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-d/am-source-transient | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-d/fft-source-transient | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-d/coupled-transformer-transient | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-d/rlc-trapezoidal-transient | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-d/diode-voltage-doubler | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-d/ekv-ring-oscillator | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-d/cockcroft-walton-x8 | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-d/pwm-switch | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-d/rlc-gear3 | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-d/rlc-gear5 | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-d/rlc-gear6 | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-d/colpitts-oscillator | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-e/cccs-mixed-analysis | true | comparable | absolute-at-most-1e-9 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 |
| corpus-e/vcvs-operating-point | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-e/diode-bias-sweep | true | comparable | relative-at-most-1e-3 | 2.648096e-4 | 6.167926e-5 | 4.505099e-4 | 1.116192e-4 |
| corpus-e/mos1-inverter-sweep | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-e/transmission-line-ac | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-e/mutual-inductance-ac | true | comparable | relative-above-1e-3 | 1.877054e-4 | 1.522477e-5 | 7.699750e-1 | 6.074703e-2 |
| corpus-e/bjt-diffpair-ac | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-e/opamp-open-loop-ac | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-e/capacitor-step-transient | true | comparable | relative-above-1e-3 | 1.141726e-3 | 3.211330e-4 | 5.176423e-1 | 8.733169e-2 |
| corpus-e/capacitor-initial-condition | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-e/lc-oscillator-transient | true | comparable | relative-above-1e-3 | 8.332913e+0 | 3.511693e+0 | 4.207338e+2 | 2.439373e+1 |
| corpus-e/bjt-diffpair-transient | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-e/bjt-schmitt-trigger | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-e/diode-temperature-sweep | true | comparable | relative-above-1e-3 | 2.624202e-4 | 5.166083e-5 | 4.995004e-1 | 1.662875e-1 |
| corpus-e/mos1-nand-transient | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-e/bjt-rtl-inverter-chain | true | comparable | relative-above-1e-3 | 3.353459e-2 | 2.738417e-3 | 1.000000e+0 | 4.520439e-2 |
| corpus-e/dual-lc-uic-rejection | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-e/opamp-voltage-follower | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-e/mos7-nand-no-bypass | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-e/bjt-diffpair-current-source | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-bjt-astable-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-bjt-colposc-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-bjt-ecp-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-bjt-invchain-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-bjt-meclgate-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-bjt-rtlinv-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-bjt-vco-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-diode-diode-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-diode-diotran-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-diode-pd1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-diode-pindiode-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-jfet-jfet-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-mos-bootinv-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-mos-charge-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-mos-cmosinv-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-mos-nmosinv-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-mos-pass-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-mos-ringosc-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-parallel-ringosc-2u-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-resistor-gaasres-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-resistor-sires-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-serial-astable-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-serial-charge-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-serial-colposc-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-serial-dbridge-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-serial-invchain-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-serial-meclgate-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-serial-nmosinv-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-serial-pass-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-serial-pullup-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-serial-recovery-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-serial-rtlinv-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-serial-vco-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-surfmob-cd4007n-200402idvg-net | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-surfmob-cdxy-net | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-surfmob-tbicmpd1-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-surfmob-tbicmpd1xy-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-surfmob-tbicmpu1-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-cider-surfmob-tbicmpu1xy-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-control-structs-foreach-bjt-ft-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-control-structs-if-batchmode-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-control-structs-if-test-1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-control-structs-new-check-3-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-control-structs-new-check-4-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-control-structs-s-param-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-ddt-ddt-test1-cir | true | comparable | relative-above-1e-3 | 2.000005e+0 | 3.540789e-2 | 2.400000e+1 | 2.725747e-1 |
| corpus-f/examples-ddt-ddt-test2-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-ddt-ddt-test3-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-digital-auto-bridge-shared-line-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-digital-auto-bridge-vcc-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-digital-compare-adder-bip-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-digital-compare-adder-mos-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-digital-digital-devices-xspice-c4-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-loops-instance-loop-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-loops-loop-instance-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-loops-loop-model-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-loops-loop-param-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-measure-buggy-meas-tran-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-measure-func-cap-sp | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-measure-inv-meas-tran-auto-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-measure-inv-meas-tran-control-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-measure-inv-meas-tran-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-measure-meas-expression-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-measure-mos-meas-dc-control-file-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-measure-mos-meas-dc-control-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-measure-mos-meas-dc-sp | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-measure-rc-meas-ac-sp | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-memristor-memristor-x-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-memristor-memristor-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-monte-carlo-mc-ring-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-monte-carlo-montecarlo-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-monte-carlo-opwien-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-monte-carlo-rand-numb-test-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-mos-adder-mos-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-mos-nmos-out-bsim330-plainwrite-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-mos-nmos-pmos-bsim482-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-mos-nmos-pmos-drainresistor-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-mos-nmos-pmos-plotting-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-mos-ro-17-4-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-mos-ro-meas-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-noise-baker-252-gain-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-noise-bipolar-noise-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-noise-resdiv-gain-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-noise-resdiv-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-numparam-strings-cir | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-f/examples-numparam-vector-param-cir | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-f/examples-osdi-hicuml0-bip-subsmod-sp | true | comparable | relative-above-1e-3 | 3.318472e+4 | 1.675080e+3 | 3.244605e+0 | 2.042263e-1 |
| corpus-f/examples-osdi-hicuml0-dff-y-ecl-vbic-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-osdi-hicuml0-vbic-out-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-p-to-n-examples-logic-cir | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-f/examples-p-to-n-examples-mos1-out-cir | true | comparable | absolute-at-most-1e-9 | 5.769525e-12 | 1.363237e-12 | 2.773874e-1 | 1.166420e-1 |
| corpus-f/examples-p-to-n-examples-switch-oscillators-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-plot-inv-chain-pyplot-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-probe-cntrl-sources-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-probe-mos-test-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-probe-probe-i-dev-cir | true | comparable | relative-above-1e-3 | 4.098683e-4 | 1.475949e-5 | 3.244604e+0 | 1.161720e-1 |
| corpus-f/examples-probe-switches-manual-p92-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-rf-hbosc-examples-hb-osc-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-rf-pss-colpitt-osc-pss-ctrl-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-rf-pss-compl-cross-quad-osc-pss-ctrl-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-rf-pss-ring-osc-pss-ctrl-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-rf-pss-vackar-osc-pss-ctrl-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-rf-pss-vdp-osc-pss-ctrl-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-rf-sp-file-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-rf-sp-sp1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-rf-sp-sp2-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-rf-sp-sp3-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-rf-sp-sp4-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-rf-sp-tschebyschef-lp-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-shared-t-cir | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-f/examples-snapshot-adder-mos-circ-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-soa-bjt-soa-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-soa-diode-soa-sh-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-soa-diode-soa-simple-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-tclspice-tcl-testbench2-example-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-tclspice-tcl-testbench4-example-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-tclspice-tcl-diffpair-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-transient-noise-noi-sc-tr-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-transient-noise-noise-vnoi-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-transient-noise-rts-1-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-transient-noise-shot-ng-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-transient-noise-simple-noise-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-transmissionlines-cpl-ibm1-sp | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-transmissionlines-cpl-ibm1a-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-transmissionlines-cpl-ibm2-sp | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-transmissionlines-cpl-ibm3-sp | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-transmissionlines-cpl1-4-line-sp | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-transmissionlines-cpl2-2-line-sp | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-transmissionlines-cpl3-4-line-sp | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-transmissionlines-cpl4-txl-2-line-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-transmissionlines-ltra1-1-line-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-transmissionlines-ltra1-4-line-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-transmissionlines-ltra2-2-line-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-transmissionlines-ltra3-2-line-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-transmissionlines-ltra4-1-line-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-transmissionlines-ltra5-1-line-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-transmissionlines-ltra6-2-line-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-transmissionlines-ltra7-4-line-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-transmissionlines-txl1-1-line-sp | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-f/examples-transmissionlines-txl2-3-line-sp | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-f/examples-transmissionlines-txl3-1-line-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-transmissionlines-txl4-1-line-sp | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-f/examples-transmissionlines-urc-tm-sub-cir | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-f/examples-various-3d-loop-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-various-alterparam-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-various-atanh-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-various-bjt-ac-par-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-various-bjtnoise-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-various-cutout1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-various-dc-loop-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-various-diode-ac-par-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-various-fft-leakage-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-various-gain-stage-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-various-integrate1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-various-mtimeavg-test-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-various-param-sweep-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-various-roessler-attractor-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-various-tmp-noise-2-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-various-tmp-noise-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-various-todo-temper-3-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-various-transformers1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-various-v-i-sources-am-ffm-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-vbic-dff-y-ecl-sp | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-vbic-vbic99-dc-sp | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-vbic-vbic99-tran-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-vdmos-100w-wingspread-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-vdmos-100w-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-vdmos-crss-coss-ciss-sp | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-vdmos-dcdc-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-vdmos-inv-vdmos-sp | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-vdmos-ixtp6n100d2-cap-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-vdmos-ixtp6n100d2-n-weak-inv-sp | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-vdmos-mtriode-nch-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-vdmos-ro-11-vdmos-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-vdmos-self-heating-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-vdmos-soa-chk-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-vdmos-theta-nch-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-vdmos-vdmos-dio-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-vdmos-vdmos-out-ir-mtr-sp | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-vdmos-vdmos-out-sp | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-vdmos-vdmosp-out-mtr-sp | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-vdmos-vdmosp-out-sp | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-wave-rcsim-cir | true | comparable | absolute-at-most-1e-9 | 5.102800e-16 | 9.962161e-17 | 3.012329e-15 | 4.735614e-16 |
| corpus-f/examples-xspice-d-lut-mult4bit-spi | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-d-process-checks-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-delay-analog-delay1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-ghdl-mc-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-ghdl-pwm-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-icarus-verilog-delay-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-icarus-verilog-pwm-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-noise-noise-gain-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-noise-ota-noise-test1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-analog-models1-ac-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-analog-models1-dc-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-analog-models1-swept-dc-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-analog-models1-transient-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-analog-models2-ac-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-analog-models2-dc-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-analog-models2-swept-dc-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-analog-models2-transient-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-analog-models3-ac-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-analog-models3-dc-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-analog-models3-swept-dc-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-analog-models3-transient-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-analog-models4-ac-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-analog-models4-dc-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-analog-models4-swept-dc-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-analog-models4-transient-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-arbitrary-phase-deck | true | comparable | relative-above-1e-3 | 2.180895e-3 | 2.565855e-4 | 8.848696e-3 | 1.219093e-3 |
| corpus-f/examples-xspice-original-examples-bad-io-type-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-bad-io-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-bad-name-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-bad-param-type-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-bad-param-deck | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-digital-invert-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-digital-models-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-digital-models1-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-digital-models2-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-digital-models3-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-digital-models4-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-dot-model-ref-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-hybrid-models1-dc-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-hybrid-models1-transient-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-initial-conditions-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-io-ordering-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-io-types-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-long-names-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-mixed-case-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-mixed-io-size-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-mixed-mode-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-mixed-ref-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-param-defaults-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-param-types-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-parsing-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-polarity-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-spice3-deck | true | comparable | relative-above-1e-3 | 3.317312e-2 | 4.300182e-3 | 1.662247e+0 | 4.417578e-2 |
| corpus-f/examples-xspice-original-examples-suffixes-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-supply-ramping-deck | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-original-examples-user-defined-nodes-deck | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-pwm-osc-fmcw-dosc-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-pwm-osc-pwm-sin-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-see-repeat-loop-seegen-net | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-see-seegen-cm1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-see-set1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-table-table-generator-q-2d-sp | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-transmission-lines-cpline-ac-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-transmission-lines-cpline-tran-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-transmission-lines-cpmline-ac-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-transmission-lines-mlin-tran-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-transmission-lines-mlin-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-various-analog-models1-transient-sp | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-various-astate-pulse-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-various-astate-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-various-pwlts1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-various-ro-nand-digi-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-various-simple-diode-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-various-vswitch-test-lin-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-various-vswitch-test-log-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-various-x-fer-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-various-xspice-c1-cir | true | comparable | relative-above-1e-3 | 3.317312e-2 | 4.300182e-3 | 1.662247e+0 | 4.417578e-2 |
| corpus-f/examples-xspice-various-xspice-c2-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-various-xspice-c3-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-verilator-delay-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/examples-xspice-verilator-pwm-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/tests-bsim1-test-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/tests-bsim2-test-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/tests-general-diffpair-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-general-fourbitadder-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/tests-general-mosmem-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-general-rca3040-cir | true | comparable | relative-above-1e-3 | 1.658215e-1 | 2.008290e-2 | 4.963959e+0 | 1.039211e-1 |
| corpus-f/tests-general-rtlinv-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-hfet-id-vgs-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/tests-mes-subth-cir | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-f/tests-mesa-mesa-12-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/tests-mesa-mesa-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/tests-mesa-mesa11-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/tests-mesa-mesa12-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/tests-mesa-mesa13-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/tests-mesa-mesa14-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/tests-mesa-mesa15-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/tests-mesa-mesa21-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/tests-mesa-mesgout-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/tests-mesa-mesinv-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/tests-polezero-filt-bridge-t-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-polezero-filt-multistage-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-polezero-filt-rc-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-polezero-pz2-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-polezero-pzt-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-polezero-simplepz-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-func-func-1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-lib-processing-scope-1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-lib-processing-scope-2-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-lib-processing-scope-3-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-misc-alter-vec-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-misc-asrc-tc-1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-misc-asrc-tc-2-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-misc-bugs-1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-misc-bugs-2-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-misc-convergence-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-misc-empty-1-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-misc-if-elseif-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-misc-log-functions-1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-misc-resume-1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-misc-test-noise-2-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-misc-test-noise-3-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-model-binning-1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-model-instance-defaults-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-model-special-names-1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-parser-bxpressn-1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-parser-minus-minus-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-parser-xpressn-1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-parser-xpressn-2-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-parser-xpressn-3-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-pz-ac-resistance-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-sens-sens-ac-1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-sens-sens-ac-2-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-sens-sens-dc-1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-sens-sens-dc-2-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-subckt-processing-global-1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-subckt-processing-model-scope-5-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-temper-temper-1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-temper-temper-2-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-temper-temper-3-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-regression-temper-temper-res-1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-resistance-res-array-cir | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-f/tests-resistance-res-partition-cir | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-f/tests-resistance-res-simple-cir | true | comparable | absolute-at-most-1e-9 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 |
| corpus-f/tests-sensitivity-diffpair-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-f/tests-transmission-cpl-ibm2-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/tests-transmission-cpl3-4-line-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/tests-transmission-ltra2-2-line-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/tests-transmission-txl1-1-line-cir | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-f/tests-transmission-txl2-3-line-cir | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-f/tests-vbic-diffamp-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/tests-vbic-fg-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-f/tests-vbic-noise-scale-test-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/abm-abs-abs-cir | true | comparable | absolute-at-most-1e-9 | 1.776357e-15 | 4.613844e-16 | 1.519401e-13 | 3.872942e-14 |
| corpus-g/abm-acos-asin-acos-asin-cir | true | comparable | relative-at-most-1e-3 | 1.093058e-3 | 1.339027e-4 | 9.151426e-4 | 1.236757e-4 |
| corpus-g/abm-atan-tan-atan-tan-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/abm-db-dbtest-cir | true | comparable | absolute-at-most-1e-9 | 4.577567e-16 | 1.006543e-16 | 9.336243e-16 | 2.507955e-16 |
| corpus-g/abm-expln-exp-ln-cir | true | comparable | relative-at-most-1e-3 | 1.854043e+1 | 1.025787e+0 | 9.750406e-4 | 1.193165e-4 |
| corpus-g/abm-freq-rc-simple-hertz-cir | true | comparable | absolute-at-most-1e-9 | 8.286281e-14 | 4.214124e-14 | 1.044577e-15 | 6.109256e-16 |
| corpus-g/abm-func-func-cir | true | comparable | relative-above-1e-3 | 4.711753e+0 | 7.906083e-1 | 1.000000e+0 | 6.719394e-2 |
| corpus-g/abm-int-floor-ceil-int-floor-ceil-cir | true | comparable | relative-above-1e-3 | 1.960566e-3 | 5.964196e-4 | 1.741483e+0 | 9.309900e-4 |
| corpus-g/abm-log-log-cir | true | comparable | relative-above-1e-3 | 7.332217e+0 | 2.070762e+0 | 4.609819e+0 | 9.603107e-1 |
| corpus-g/abm-nint-fmod-fmod-cir | true | comparable | absolute-at-most-1e-9 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 |
| corpus-g/abm-pow-abmpow1-cir | true | comparable | absolute-at-most-1e-9 | 2.220446e-15 | 6.133409e-16 | 9.887924e-15 | 1.415705e-15 |
| corpus-g/abm-sct-sct-cir | true | comparable | relative-at-most-1e-3 | 6.493247e-2 | 3.577336e-3 | 8.044883e-4 | 4.532835e-5 |
| corpus-g/abm-sqrt-sqrt-cir | true | comparable | relative-above-1e-3 | 5.952914e+6 | 4.124720e+5 | 1.041241e+0 | 6.986534e-2 |
| corpus-g/abm-time-time-cir | true | comparable | relative-above-1e-3 | 6.829583e-3 | 1.064567e-3 | 8.800000e-1 | 1.163466e-1 |
| corpus-g/abm-ddt-cir | true | comparable | relative-above-1e-3 | 3.015929e+0 | 2.498595e-2 | 2.400000e+1 | 1.218665e-1 |
| corpus-g/acsens-ac-sens-current-obj-fd-cir | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-g/actests-bsim3-gain-stage-cir | true | comparable | relative-above-1e-3 | 2.984396e-1 | 1.218898e-1 | 2.870009e+5 | 1.152347e+5 |
| corpus-g/agecap-agecap-ref-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/bjt-analytic-ramp-test1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/bjt-extnode-npn-rb-rc-re-1-cir | true | comparable | relative-at-most-1e-3 | 6.066901e-4 | 1.191592e-4 | 9.288500e-4 | 1.823607e-4 |
| corpus-g/bjt-ic-bjt-ic-nonzero-cir | true | comparable | relative-above-1e-3 | 1.837094e+1 | 5.292640e+0 | 4.910377e+0 | 1.441362e+0 |
| corpus-g/bjt-off-bjt-off-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/bjt-pspice-nk-bjt-test-nk-cir | true | comparable | relative-above-1e-3 | 5.706897e-5 | 1.019883e-5 | 2.418310e-1 | 2.690655e-2 |
| corpus-g/bsimsoi3-b3soitrandefaults-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-g/bsrc-bsrc-a1-cir | true | comparable | relative-at-most-1e-3 | 2.000000e-1 | 6.262243e-2 | 9.746589e-4 | 2.869474e-4 |
| corpus-g/bug-139-in-line-comment-cir | true | comparable | relative-at-most-1e-3 | 6.413588e-9 | 3.472194e-9 | 1.513302e-9 | 1.021484e-9 |
| corpus-g/bug-237-bug-237-a1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/bug-374-capacitor-bug-cir | true | comparable | relative-above-1e-3 | 8.633830e-3 | 5.543435e-5 | 1.175333e+1 | 6.394556e-1 |
| corpus-g/bug-458-bug458-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/cccs-ftest-cir | true | comparable | relative-above-1e-3 | 2.500000e+3 | 1.235783e+3 | 1.000000e+0 | 1.000000e+0 |
| corpus-g/certification-tests-bug-1011-sand23-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-g/circuitsim90-bjt-vreg-cir | true | comparable | relative-above-1e-3 | 6.552575e-2 | 4.861236e-3 | 5.207773e-2 | 8.596704e-3 |
| corpus-g/commandline-command-line-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-g/comparator-comparator-cir | true | comparable | relative-above-1e-3 | 5.544811e+0 | 1.262978e+0 | 4.061389e+7 | 1.720376e+6 |
| corpus-g/complex-num-test1-cir | true | comparable | absolute-at-most-1e-9 | 2.343714e-13 | 8.910374e-14 | 4.830010e-14 | 9.697444e-15 |
| corpus-g/diagnostic-dc-currentcheck1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/diode-analytic-reverse-model-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/diode-cmc-diodeclipper-ac-cir | true | comparable | relative-above-1e-3 | 4.125259e-4 | 1.216937e-4 | 1.793398e-3 | 8.043737e-4 |
| corpus-g/diode-diode-with-sidewall-fcs-cir | true | comparable | relative-above-1e-3 | 3.047192e-5 | 3.953788e-6 | 1.001267e-3 | 2.184669e-4 |
| corpus-g/ekv26-inverter-transient-ekv26-cir | true | comparable | relative-above-1e-3 | 2.101988e+0 | 2.827241e-1 | 1.000000e+0 | 5.288414e-1 |
| corpus-g/embedded-printline-for-embedded-cmosinverter-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-g/expprint-expprint-cir | true | comparable | absolute-at-most-1e-9 | 1.387779e-17 | 3.054791e-18 | 6.672013e-16 | 1.262730e-16 |
| corpus-g/fourier-bad-dot-four-line1-cir | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-g/gencoupapi-rlc-series-vccs-ac-nogenext-cir | true | comparable | absolute-at-most-1e-9 | 5.894964e-13 | 1.628629e-14 | 3.451123e-8 | 1.612563e-9 |
| corpus-g/globalnode-global-hspice-cir | true | comparable | absolute-at-most-1e-9 | 1.110223e-16 | 3.925248e-17 | 3.330669e-16 | 1.177574e-16 |
| corpus-g/gmin-stepping-gstep-cont3a-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/homotopy-schmidt-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | true | comparable | relative-above-1e-3 | 1.107711e-2 | 1.113265e-3 | 2.062826e+3 | 6.499383e+1 |
| corpus-g/iexp-iexp-cir | true | comparable | relative-above-1e-3 | 2.479218e+3 | 9.430892e+2 | 1.000000e+0 | 1.000000e+0 |
| corpus-g/inductor-errormessagetest-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/init-conds-inv1xic-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-g/invalid-chars-colon-fails-device-name-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-g/ipulse-ipulse-cir | true | comparable | relative-above-1e-3 | 2.500000e+3 | 1.235783e+3 | 1.000000e+0 | 1.000000e+0 |
| corpus-g/ipwl-ipwl-cir | true | comparable | relative-above-1e-3 | 2.500000e+3 | 8.457643e+2 | 1.000000e+0 | 1.000000e+0 |
| corpus-g/isffm-isffm-cir | true | comparable | relative-above-1e-3 | 2.122473e-2 | 2.117569e-3 | 2.838401e-2 | 4.871227e-3 |
| corpus-g/isin-isin-cir | true | comparable | relative-above-1e-3 | 1.087917e+0 | 4.399057e-1 | 1.000000e+0 | 1.000000e+0 |
| corpus-g/juncap200-diodeclipper-cir | true | comparable | relative-above-1e-3 | 6.261246e-1 | 1.976106e-1 | 1.601591e+6 | 7.926558e+2 |
| corpus-g/lead-currents-lead-bsrc-ac-cir | true | comparable | absolute-at-most-1e-9 | 2.765130e-16 | 5.519192e-17 | 1.736414e-12 | 9.730832e-14 |
| corpus-g/load-load-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-g/ltra-ltra1-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-g/mcnc-bjt-latch-latch-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-g/mcnc-bjt-opampal-opampal-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-g/mcnc-bjt-rca-rca-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/measure-ac-dotopnoac-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-g/measure-cont-derivtest1dc-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/measure-dc-avgtest2dc-cir | true | comparable | absolute-at-most-1e-9 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 |
| corpus-g/measure-noise-dotopnonoise-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-g/measure-bad-dot-measure-line5-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-g/message-device-core-safebarrier-1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/mextram-acfreq-gbb-noflip-p-cir | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-g/minductors-inductoricbug-cir | true | comparable | relative-above-1e-3 | 4.949176e+0 | 2.470067e-1 | 1.082834e+2 | 2.752154e+0 |
| corpus-g/model-binning-comparatorbaseline-forglobal-cir | true | comparable | relative-above-1e-3 | 5.544811e+0 | 1.262978e+0 | 4.061389e+7 | 1.720376e+6 |
| corpus-g/mos13-ic-invert42-mos3-cir | true | comparable | relative-above-1e-3 | 5.203604e+0 | 1.464945e-1 | 4.799089e+9 | 1.329940e+7 |
| corpus-g/mos6-invert-mos6-cir | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-g/mosfet-paramaliases-invert1-alt-cir | true | comparable | relative-above-1e-3 | 1.411462e+0 | 3.999313e-2 | 7.765589e+4 | 1.279717e+3 |
| corpus-g/mpde-invert1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/multiplicity-factor-bjt-diffpair-noise-baseline-net | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/nmesfet-nmesfet-cir | true | comparable | absolute-at-most-1e-9 | 1.931121e-10 | 2.616702e-11 | 5.771404e-4 | 3.426349e-5 |
| corpus-g/nmos-analytic-mosfet-level1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/nmos3-dc-mos3-dc-cir | true | comparable | relative-above-1e-3 | 2.481036e-8 | 7.681688e-9 | 1.310193e-3 | 3.932909e-4 |
| corpus-g/noise-cascodebjtnoise-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/nonlinear-convergencetests-nlstrategy1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/op-comparator-op-cir | true | comparable | relative-above-1e-3 | 5.544811e+0 | 1.262505e+0 | 4.061389e+7 | 1.714788e+6 |
| corpus-g/output-ac-ac-csv-cir | true | comparable | absolute-at-most-1e-9 | 4.577567e-16 | 1.006543e-16 | 9.336243e-16 | 2.507955e-16 |
| corpus-g/param-refactor-paramhomotopy-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/params1-params-a0-cir | true | comparable | relative-above-1e-3 | 2.000000e+1 | 3.630364e+0 | 2.729975e+1 | 2.694134e+0 |
| corpus-g/params2-params-a0-cir | true | comparable | absolute-at-most-1e-9 | 5.421011e-20 | 1.564911e-20 | 1.807004e-16 | 5.714247e-17 |
| corpus-g/parser-aasamp-cir | true | comparable | relative-above-1e-3 | 2.500000e+12 | 9.574271e+11 | 1.000000e+12 | 5.773503e+11 |
| corpus-g/pce-ni-regression-printline-for-cmosinverter-regr-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-g/pjfet-dc-pjfet-2108-cir | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-g/pjfet-switch-pjfet-tran-cir | true | comparable | relative-above-1e-3 | 7.646066e-4 | 5.274613e-5 | 5.892956e-3 | 1.677258e-4 |
| corpus-g/polyg-polyg-cir | true | comparable | relative-above-1e-3 | 9.019980e-3 | 4.671638e-5 | 1.000000e+0 | 1.383272e-2 |
| corpus-g/power-power-bjt-gear-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/powernode-resinner-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/pseudo-pseudo-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/psp102-idvg0-id-t27-pmos-cir | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-g/psp103-invert-psp-testdta0-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/resistor-td-temp-dep-cir | true | comparable | absolute-at-most-1e-9 | 8.673617e-19 | 3.129822e-19 | 2.034927e-16 | 1.130153e-16 |
| corpus-g/resistor-defaultvaluewarning-cir | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-g/rom-autosize-rc-ladder100-cir | true | comparable | relative-above-1e-3 | 3.132439e-3 | 1.767757e-4 | 4.835829e+4 | 1.384959e+1 |
| corpus-g/sandler1-sandler1-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-g/sandler2-sandler2-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/sandler21-sandler21-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/sandler22-sandler22-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-g/sandler23-sandler23-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-g/sandler25-sandler25-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/semic-capacitor-semicap-subc-cir | true | comparable | relative-above-1e-3 | 6.725516e-4 | 1.226478e-5 | 9.760747e+2 | 6.217967e+0 |
| corpus-g/semic-resistor-semic-resistor-cir | true | comparable | absolute-at-most-1e-9 | 4.336809e-19 | 1.251929e-19 | 2.168404e-16 | 6.857097e-17 |
| corpus-g/sens-bsim4-issue694-fd-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/soln-dep-res-multsoldepres-cir | true | comparable | absolute-at-most-1e-9 | 2.220446e-16 | 1.206940e-16 | 1.665335e-16 | 1.004235e-16 |
| corpus-g/subckt-subckt-a0-cir | true | comparable | relative-above-1e-3 | 1.422702e+0 | 3.758611e-2 | 3.532094e+7 | 3.345322e+5 |
| corpus-g/supernode-supernode1-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/testjac-testjac-comp-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/tia-erroroption-erroroption-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/tl1x-tl1x-mpi-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/transline-errormessagetest2-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-g/twolevelapi-resinnertran-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/users-guide-diodeclipper-cir | true | comparable | relative-above-1e-3 | 1.209658e-2 | 1.586412e-3 | 4.680159e+2 | 2.646620e-1 |
| corpus-g/vanoise-commonemitterbjt-mextram-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/verilog-power-power-juncap200-gear-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/vexp-vexp-cir | true | comparable | relative-at-most-1e-3 | 2.123931e-3 | 4.862639e-4 | 4.378283e-4 | 2.083835e-4 |
| corpus-g/vpulse-vpulse-cir | true | comparable | absolute-at-most-1e-9 | 4.440892e-16 | 1.169443e-16 | 3.397232e-15 | 6.590005e-16 |
| corpus-g/vpwl-vpwl-cir | true | comparable | relative-above-1e-3 | 3.000000e+0 | 2.771596e-2 | 1.000000e+0 | 1.318468e-2 |
| corpus-g/vsffm-vsffm-cir | true | comparable | relative-above-1e-3 | 7.263525e-4 | 2.063221e-4 | 7.241100e-3 | 4.193140e-4 |
| corpus-g/vsin-bug1679-cir | false | comparable | relative-above-1e-3 | 3.231808e-3 | 6.588303e-4 | 9.997513e-1 | 1.416495e-2 |
| corpus-g/vstartest-vstartest-cir | false | comparable | relative-above-1e-3 | 9.235774e-1 | 4.317284e-2 | 1.131430e+4 | 8.057035e+2 |
| corpus-g/wampde-blocking-simple-single-channel-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-g/xdm-hspice-controlled-sources-current-controlled-sources-w-extraneous-identifiers-cir | false | comparable | absolute-at-most-1e-9 | 1.776357e-15 | 2.073868e-16 | 2.537653e-16 | 8.273363e-17 |
| corpus-h/kicad-qa-data-eeschema-issue13162-spice | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-h/kicad-qa-data-eeschema-issue13431-spice | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-h/kicad-qa-data-eeschema-spice-netlists-legacy-pspice-legacy-pspice-spice | false | comparable | relative-at-most-1e-3 | 1.187095e-2 | 3.368873e-4 | 1.285208e-5 | 1.031120e-5 |
| corpus-h/kicad-qa-data-eeschema-spice-netlists-legacy-sources-legacy-sources-spice | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-h/kicad-qa-data-eeschema-spice-netlists-tlines-tlines-spice | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-h/pyspice-examples-c-examples-ngspice-cb-examples-adder-mos-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-h/pyspice-examples-spice-examples-ac-coupled-transistor-amplifier-cir | false | comparable | relative-above-1e-3 | 3.333923e-2 | 3.744890e-3 | 5.460732e+1 | 3.766741e-1 |
| corpus-h/pyspice-examples-spice-examples-low-pass-rc-filter-cir | false | comparable | absolute-at-most-1e-9 | 1.241267e-16 | 6.284241e-17 | 3.147442e-14 | 9.119373e-15 |
| corpus-h/pyspice-examples-spice-examples-operational-amplifier-model-1-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-h/pyspice-examples-spice-examples-operational-amplifier-model-2-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-h/pyspice-examples-spice-examples-small-signal-amplifier-cir | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-h/pyspice-examples-spice-examples-voltage-divider-cir | false | comparable | absolute-at-most-1e-9 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 |
| corpus-h/pyspice-issues-issue-172-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-h/spicelib-examples-testfiles-dc-rawtest-net | false | comparable | absolute-at-most-1e-9 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 |
| corpus-h/spicelib-examples-testfiles-testfile-ngspice-net | false | comparable | absolute-at-most-1e-9 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 |
| corpus-h/spicesharpparser-circuits-cookbook-custom-components-ideal-diode-power-or-ideal-diode-power-or-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-h/spicesharpparser-circuits-cookbook-pure-spice-active-anti-alias-filter-active-anti-alias-filter-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-h/spicesharpparser-circuits-cookbook-pure-spice-astable-led-flasher-astable-led-flasher-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-h/spicesharpparser-circuits-cookbook-pure-spice-bjt-audio-preamplifier-bjt-audio-preamplifier-cir | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-h/spicesharpparser-circuits-cookbook-pure-spice-bjt-relay-driver-bjt-relay-driver-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-h/spicesharpparser-circuits-cookbook-pure-spice-diode-envelope-detector-diode-envelope-detector-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-h/spicesharpparser-circuits-cookbook-pure-spice-loaded-voltage-divider-loaded-voltage-divider-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-h/spicesharpparser-circuits-cookbook-pure-spice-pwm-dac-pwm-dac-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-h/spicesharpparser-circuits-cookbook-pure-spice-rc-sensor-input-filter-rc-sensor-input-filter-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-h/spicesharpparser-circuits-cookbook-pure-spice-rectifier-power-supply-rectifier-power-supply-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-h/spicesharpparser-circuits-cookbook-pure-spice-transmission-line-termination-transmission-line-termination-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-h/spicesharpparser-src-spicesharpparser-integrationtests-examples-circuits-example04-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-h/spicesharpparser-src-spicesharpparser-integrationtests-examples-circuits-example04-nested-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-h/spicesharpparser-src-spicesharpparser-integrationtests-examples-circuits-example04-reversed-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-h/spicesharpparser-src-spicesharpparser-integrationtests-examples-circuits-example05-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-h/spicesharpparser-src-spicesharpparser-integrationtests-examples-circuits-example06-cir | false | comparable | absolute-at-most-1e-9 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 |
| corpus-h/spicesharpparser-src-spicesharpparser-integrationtests-examples-circuits-example08-cir | false | comparable | relative-above-1e-3 | 9.900000e+0 | 4.062689e-1 | 9.900010e+1 | 2.921397e+0 |
| corpus-h/spicesharpparser-src-spicesharpparser-integrationtests-examples-circuits-example09-cir | false | comparable | absolute-at-most-1e-9 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 |
| corpus-h/spicesharpparser-src-spicesharpparser-integrationtests-examples-circuits-example10-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-h/spicesharpparser-src-spicesharpparser-integrationtests-examples-circuits-example01-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-h/spicesharpparser-src-spicesharpparser-integrationtests-examples-circuits-example01-stringwriter-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-h/spicesharpparser-src-spicesharpparser-integrationtests-examples-circuits-example01-without-params-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-h/spicesharpparser-src-spicesharpparser-integrationtests-examples-circuits-example02-cir | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-h/spicesharpparser-src-spicesharpparser-integrationtests-examples-circuits-example03-cir | false | comparable | relative-at-most-1e-3 | 3.221323e-5 | 6.094690e-6 | 3.889154e-4 | 1.251736e-4 |
| corpus-h/xictools-wrspice-devlib-jfet2-docs-id-cir | false | comparable | relative-above-1e-3 | 3.564139e-4 | 7.689282e-5 | 1.065356e+1 | 4.438921e+0 |
| corpus-h/xictools-wrspice-devlib-obsolete-bsim1tst-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-h/xictools-wrspice-devlib-obsolete-bsim2tst-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-h/xictools-wrspice-examples-bjtnoise-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-h/xictools-wrspice-examples-diodisto-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-h/xictools-wrspice-examples-mos6inv-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-h/xictools-wrspice-examples-mosamp2-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-h/xictools-wrspice-examples-mosmem-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-h/xictools-wrspice-examples-pz2-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-h/xictools-wrspice-examples-pzt-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-h/xictools-wrspice-examples-resnoise-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-h/xictools-wrspice-examples-schmitt-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-h/xictools-wrspice-examples-simplepz-cir | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-i/esim-examples-4-bit-jk-ff-4-bit-jk-ff-cir-out | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-i/esim-examples-basicgates-basicgates-cir-out | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-i/esim-examples-fulladder-half-adder-cir-out | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-i/esim-examples-high-pass-filter-high-pass-filter-cir-out | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-i/esim-examples-jk-flipflop-jk-flipflop-cir-out | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-i/esim-examples-low-pass-filter-low-pass-filter-cir-out | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-i/esim-examples-parallel-resonance-parallel-resonance-cir-out | false | comparable | relative-above-1e-3 | 2.434194e-1 | 8.966461e-2 | 1.244693e+1 | 2.227869e+0 |
| corpus-i/esim-examples-rc-rc-cir-out | false | comparable | relative-above-1e-3 | 5.915374e+1 | 1.622147e+1 | 7.851418e+1 | 7.679446e+0 |
| corpus-i/esim-examples-rl-rl-cir-out | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-i/esim-examples-rlc-rlc-cir-out | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-i/esim-examples-series-resonance-series-resonance-cir-out | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-i/esim-examples-transformer-transformer-cir-out | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-i/esim-examples-zener-characteristic-zener-characteristic-cir-out | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-i/vacask-benchmark-graetz-xyce-runme-sim | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-i/vacask-benchmark-mul-xyce-runme-sim | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-i/vacask-benchmark-rc-xyce-runme-sim | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-i/vacask-benchmark-vadistiller-bjtring-xyce-runme-sim | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-i/vacask-test-spice-cccs-cir | false | comparable | absolute-at-most-1e-9 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 |
| corpus-i/vacask-test-spice-diode-cir | false | comparable | relative-above-1e-3 | 1.997032e-3 | 2.771516e-4 | 8.094382e+1 | 2.130660e+0 |
| corpus-i/vacask-test-spice-mos-cir | false | comparable | relative-above-1e-3 | 3.422081e-3 | 1.878443e-5 | 1.560611e+1 | 1.441535e-1 |
| corpus-i/vacask-test-spice-rc-cir | false | comparable | relative-above-1e-3 | 2.817343e-3 | 4.220714e-4 | 1.000000e+0 | 1.130520e-2 |
| corpus-i/vacask-test-spice-regressions-cir | false | comparable | relative-above-1e-3 | 3.648865e-3 | 1.337100e-4 | 9.883282e+6 | 5.472449e+5 |
| corpus-i/vacask-test-spice-subckt-cir | false | comparable | relative-above-1e-3 | 2.366644e-3 | 4.023928e-4 | 1.000000e+0 | 9.329289e-3 |
| corpus-i/vacask-test-spice-vcvs-cir | false | comparable | relative-above-1e-3 | 1.317944e-3 | 2.178469e-4 | 3.532912e-3 | 2.953569e-4 |
| corpus-i/vacask-test-spice-warnonly-cir | false | comparable | absolute-at-most-1e-9 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 |
| corpus-j/j-1 | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-j/j-2 | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-j/j-3 | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-j/j-4 | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-j/j-5 | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-j/j-6 | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-j/j-7 | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-j/j-8 | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-j/j-9 | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-j/j-10 | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-j/j-11 | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-j/j-12 | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-j/j-13 | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-j/j-14 | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-j/j-15 | false | native-failure | native-failure | n/a | n/a | n/a | n/a |
| corpus-j/j-16 | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-j/j-17 | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |
| corpus-j/j-18 | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-j/j-19 | false | unsupported | unsupported | n/a | n/a | n/a | n/a |
| corpus-j/j-20 | false | transformed-with-loss | transformed-with-loss | n/a | n/a | n/a | n/a |

## Per-signal errors (all eligible reference rows)

| Fixture | Ordinal / analysis | Signal | Samples | Max abs | RMS abs | Max rel | RMS rel | Relative samples / zero excluded |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| ngspice/jfet-vds-vgs | 0 / op | i(vd) | 1 | 2.8279678945808406e-14 | 2.8279678945808406e-14 | 2.9206466241633555e-11 | 2.9206466241633555e-11 | 1 / 0 |
| ngspice/jfet-vds-vgs | 0 / op | i(vg) | 1 | 2.82948097285229e-14 | 2.82948097285229e-14 | 0.0009805982164052972 | 0.0009805982164052972 | 1 / 0 |
| ngspice/jfet-vds-vgs | 0 / op | v(1) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| ngspice/jfet-vds-vgs | 0 / op | v(2) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| ngspice/jfet-vds-vgs | 1 / dc | i(vd) | 104 | 0.0000030968731972759456 | 3.4751410013102437e-7 | 0.0006251991752392124 | 0.00007889045491012186 | 103 / 1 |
| ngspice/jfet-vds-vgs | 1 / dc | i(vg) | 104 | 6.200167124605455e-16 | 6.959583917964412e-17 | 0.00020534999421866482 | 0.00002739918488161421 | 103 / 1 |
| ngspice/jfet-vds-vgs | 1 / dc | v(1) | 104 | 0 | 0 | 0 | 0 | 78 / 26 |
| ngspice/jfet-vds-vgs | 1 / dc | v(2) | 104 | 0 | 0 | 0 | 0 | 100 / 4 |
| ngspice/rc-lowpass-ac | 0 / op | i(v1) | 1 | 0 | 0 | n/a | n/a | 0 / 1 |
| ngspice/rc-lowpass-ac | 0 / op | v(1) | 1 | 0 | 0 | n/a | n/a | 0 / 1 |
| ngspice/rc-lowpass-ac | 0 / op | v(2) | 1 | 0 | 0 | n/a | n/a | 0 / 1 |
| ngspice/rc-lowpass-ac | 1 / ac | i(v1) | 31 | 1.5152185993940876e-20 | 7.641301278198077e-21 | 2.7324900473238425e-16 | 1.1311754233539163e-16 | 31 / 0 |
| ngspice/rc-lowpass-ac | 1 / ac | v(1) | 31 | 0 | 0 | 0 | 0 | 31 / 0 |
| ngspice/rc-lowpass-ac | 1 / ac | v(2) | 31 | 1.7772239894833365e-16 | 6.217486660764321e-17 | 2.2140336011298917e-15 | 6.58124298284717e-16 | 31 / 0 |
| ngspice/probe-ac | 0 / ac | i(v1) | 16 | 3.2526065174565133e-19 | 1.43736275088417e-19 | 3.3800012366279024e-16 | 2.249264748020873e-16 | 16 / 0 |
| ngspice/probe-ac | 0 / ac | v(1) | 16 | 0 | 0 | 0 | 0 | 16 / 0 |
| ngspice/probe-ac | 0 / ac | v(2) | 16 | 4.0394852956559763e-16 | 1.615576292952149e-16 | 8.030005311748855e-15 | 2.119399596975976e-15 | 16 / 0 |
| ngspice/probe-ac | 0 / ac | v(3) | 16 | 3.03027195060315e-16 | 1.0301647014563424e-16 | 1.204762393147188e-14 | 3.1210065317660237e-15 | 16 / 0 |
| ngspice/rc-transient | 0 / tran | i(vin) | 86 | 0.0004489802523934272 | 0.0001634812833495757 | 0.09859383224112095 | 0.025074813950006717 | 85 / 1 |
| ngspice/rc-transient | 0 / tran | v(1) | 86 | 1.1102230246251565e-16 | 1.1996660949316754e-17 | 2.7495461510897667e-16 | 3.9586214961636354e-17 | 85 / 1 |
| ngspice/rc-transient | 0 / tran | v(2) | 86 | 0.0004489802523933717 | 0.00016348128334958237 | 0.2591879328535026 | 0.0545889005473661 | 85 / 1 |
| ngspice/mos6-simple-inverter-transient | 0 / tran | i(vdd) | 308 | 0.000023576360575998834 | 0.000009702532004152054 | 63.40964182460028 | 4.506330285185575 | 308 / 0 |
| ngspice/mos6-simple-inverter-transient | 0 / tran | i(vin) | 308 | 0.000008887368094750401 | 7.587446396945165e-7 | 76.78318131005067 | 5.246686219766492 | 307 / 1 |
| ngspice/mos6-simple-inverter-transient | 0 / tran | v(1) | 308 | 2.6645352591003757e-15 | 6.860025653040095e-16 | 6.505213034913028e-16 | 2.260409346310483e-16 | 307 / 1 |
| ngspice/mos6-simple-inverter-transient | 0 / tran | v(100) | 308 | 0 | 0 | 0 | 0 | 308 / 0 |
| ngspice/mos6-simple-inverter-transient | 0 / tran | v(11) | 308 | 0.49711191866995286 | 0.043681164014082924 | 0.8905553168361164 | 0.2698621857484444 | 308 / 0 |
| ngspice/jimi-fuzz | 0 / tran | i(v_v1) | 243504 | 0.0008056636036811793 | 0.0002681391590842699 | 0.8014756940233639 | 0.28062696392009967 | 243504 / 0 |
| ngspice/jimi-fuzz | 0 / tran | i(v_v2) | 243504 | 0.00094602663993337 | 0.00002377583008752657 | 79555432185.24193 | 6500717588.602296 | 205021 / 38483 |
| ngspice/jimi-fuzz | 0 / tran | v(1) | 243504 | 0 | 0 | 0 | 0 | 243504 / 0 |
| ngspice/jimi-fuzz | 0 / tran | v(10) | 243504 | 0.2999999999955677 | 0.2131508235452795 | n/a | n/a | 0 / 243504 |
| ngspice/jimi-fuzz | 0 / tran | v(11) | 243504 | 8.37304444535639 | 2.8994166132320807 | 17.224608595325133 | 3.1890822058825563 | 243504 / 0 |
| ngspice/jimi-fuzz | 0 / tran | v(2) | 243504 | 0.883037339907223 | 0.33801338877041637 | 503370.767263469 | 1178.81212703567 | 243503 / 1 |
| ngspice/jimi-fuzz | 0 / tran | v(3) | 243504 | 8.708512476182351 | 0.22061564255273652 | 208608240467200.12 | 1918603726313.597 | 243410 / 94 |
| ngspice/jimi-fuzz | 0 / tran | v(4) | 243504 | 0.27287949711883464 | 0.09257842886346453 | 0.03126859878111275 | 0.01059063579197043 | 243504 / 0 |
| ngspice/jimi-fuzz | 0 / tran | v(5) | 243504 | 0.04626698059039421 | 0.01422190064563796 | 296.39532176997096 | 0.774265084997063 | 243503 / 1 |
| ngspice/jimi-fuzz | 0 / tran | v(6) | 243504 | 0.9325282960422482 | 0.30639678780440227 | 89.62261446339464 | 0.42710859158336933 | 243503 / 1 |
| ngspice/jimi-fuzz | 0 / tran | v(7) | 243504 | 0.788591834774163 | 0.3371834767334615 | 43539.355671683305 | 102.01269545753254 | 243503 / 1 |
| ngspice/jimi-fuzz | 0 / tran | v(8) | 243504 | 1.6873940626278088 | 0.5502370671909684 | 1.0352069227131482 | 0.3456290149952909 | 243504 / 0 |
| ngspice/jimi-fuzz | 0 / tran | v(9) | 243504 | 6.9668099809458806 | 0.17649251404219035 | 168165635056189.66 | 1700046099804.9124 | 243370 / 134 |
| ngspice/jimi-fuzz | 1 / op | i(v_v1) | 1 | 0.00011854242656179524 | 0.00011854242656179524 | 0.11032625899820626 | 0.11032625899820626 | 1 / 0 |
| ngspice/jimi-fuzz | 1 / op | i(v_v2) | 1 | 0 | 0 | n/a | n/a | 0 / 1 |
| ngspice/jimi-fuzz | 1 / op | v(1) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| ngspice/jimi-fuzz | 1 / op | v(10) | 1 | 0 | 0 | n/a | n/a | 0 / 1 |
| ngspice/jimi-fuzz | 1 / op | v(11) | 1 | 0.8565360091802611 | 0.8565360091802611 | 17.224608595325133 | 17.224608595325133 | 1 / 0 |
| ngspice/jimi-fuzz | 1 / op | v(2) | 1 | 0.7229752054496634 | 0.7229752054496634 | n/a | n/a | 0 / 1 |
| ngspice/jimi-fuzz | 1 / op | v(3) | 1 | 8.708512476182351 | 8.708512476182351 | 1 | 1 | 1 / 0 |
| ngspice/jimi-fuzz | 1 / op | v(4) | 1 | 0.0329267246246161 | 0.0329267246246161 | 0.003780981506849785 | 0.003780981506849785 | 1 / 0 |
| ngspice/jimi-fuzz | 1 / op | v(5) | 1 | 0.04083540680234245 | 0.04083540680234245 | n/a | n/a | 0 / 1 |
| ngspice/jimi-fuzz | 1 / op | v(6) | 1 | 0.816708136046849 | 0.816708136046849 | n/a | n/a | 0 / 1 |
| ngspice/jimi-fuzz | 1 / op | v(7) | 1 | 0.7229752054496634 | 0.7229752054496634 | n/a | n/a | 0 / 1 |
| ngspice/jimi-fuzz | 1 / op | v(8) | 1 | 0.8068723456160823 | 0.8068723456160823 | 1.0352069227131482 | 1.0352069227131482 | 1 / 0 |
| ngspice/jimi-fuzz | 1 / op | v(9) | 1 | 6.9668099809458806 | 6.9668099809458806 | 1 | 1 | 1 / 0 |
| classic/rc-transient | 0 / tran | i(vin) | 86 | 0.0004489802523934272 | 0.0001634812833495757 | 0.09859383224112095 | 0.025074813950006717 | 85 / 1 |
| classic/rc-transient | 0 / tran | v(1) | 86 | 1.1102230246251565e-16 | 1.1996660949316754e-17 | 2.7495461510897667e-16 | 3.9586214961636354e-17 | 85 / 1 |
| classic/rc-transient | 0 / tran | v(2) | 86 | 0.0004489802523933717 | 0.00016348128334958237 | 0.2591879328535026 | 0.0545889005473661 | 85 / 1 |
| classic/rca3040-wideband-amplifier | 0 / ac | i(vcc) | 100 | 0.00000566683027642885 | 0.000002405618952578023 | 0.012181444501985658 | 0.010455970018876725 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 0 / ac | i(vee) | 100 | 0.000001947115750050601 | 0.0000015955044943895505 | 0.00840909337792386 | 0.007378211411019523 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 0 / ac | i(vin) | 100 | 0.000009528497032284016 | 0.0000036307932189255273 | 0.2108219813323128 | 0.16849111786276227 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 0 / ac | v(1) | 100 | 0 | 0 | 0 | 0 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 0 / ac | v(10) | 100 | 0.060593189775451604 | 0.05230386836593414 | 0.12811308628227344 | 0.10532891865692812 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 0 / ac | v(11) | 100 | 0.06058416082033848 | 0.052296676766109676 | 0.1280939962274503 | 0.10530136640882903 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 0 / ac | v(12) | 100 | 0.000270782542753694 | 0.000048304880484148045 | 299566.9210118243 | 49316.26355271088 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 0 / ac | v(13) | 100 | 0.00013838324392344216 | 0.000024533789268458543 | 299566.9210491504 | 49316.263558855695 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 0 / ac | v(14) | 100 | 1.7729424362683022 | 1.3864045417175908 | 0.022507103077089963 | 0.013576723006494009 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 0 / ac | v(15) | 100 | 1.7710990576946328 | 1.384876579995134 | 0.022446900728422665 | 0.013570900945913731 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 0 / ac | v(16) | 100 | 1.7201830060049896 | 1.3368893399179205 | 0.022019983037301773 | 0.013194349998543901 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 0 / ac | v(17) | 100 | 1.7220291933511351 | 1.3384119681958047 | 0.022080241108815464 | 0.013198801453294835 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 0 / ac | v(2) | 100 | 0 | 0 | n/a | n/a | 0 / 100 |
| classic/rca3040-wideband-amplifier | 0 / ac | v(3) | 100 | 0 | 0 | n/a | n/a | 0 / 100 |
| classic/rca3040-wideband-amplifier | 0 / ac | v(30) | 100 | 0.009528497032283959 | 0.003630793218925531 | 0.009932759945832748 | 0.0037887371290253736 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 0 / ac | v(31) | 100 | 0.009439262275940857 | 0.003535277060779743 | 0.24173924867115207 | 0.19969708665938288 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 0 / ac | v(5) | 100 | 0.009563158767470402 | 0.0036922302280670938 | 0.010264115652647832 | 0.0039345437380121475 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 0 / ac | v(6) | 100 | 0.009814770260873672 | 0.0039008237168073646 | 0.154866662170001 | 0.1293527076070995 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 0 / ac | v(7) | 100 | 0.0007884525872843121 | 0.00041801044229232117 | 0.0025363508175813613 | 0.0011022014130981298 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 0 / ac | v(8) | 100 | 0.0008000155500750313 | 0.0007202795461527865 | 346933.28718035185 | 57298.60144623184 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 0 / ac | v(9) | 100 | 0.001161805737116448 | 0.001054219127564709 | 437595.61817558727 | 72273.59484267877 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 1 / dc | i(vcc) | 100 | 0.00004704323343093786 | 0.00002878391879814363 | 0.0020277346522084468 | 0.0012531851026173402 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 1 / dc | i(vee) | 100 | 0.000017126906509675605 | 0.000016502183381530195 | 0.0007387402413120802 | 0.0007133472035092194 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 1 / dc | i(vin) | 100 | 0.000008789020075243483 | 0.000008531895438629095 | 0.23097646298238564 | 0.22859799123611899 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 1 / dc | v(1) | 100 | 0 | 0 | 0 | 0 | 99 / 1 |
| classic/rca3040-wideband-amplifier | 1 / dc | v(10) | 100 | 0.006244690662627339 | 0.00463318699129579 | 0.007550316959323133 | 0.00563891622013557 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 1 / dc | v(11) | 100 | 0.00622683378320521 | 0.004563750930688519 | 0.007528685756402077 | 0.005577717716836598 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 1 / dc | v(12) | 100 | 0.0006365992429471223 | 0.00045657812409543376 | 0.0003973315392469974 | 0.0002868962947319191 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 1 / dc | v(13) | 100 | 0.00031829962609808415 | 0.00022828906599418555 | 0.00039733154501976213 | 0.00028689629972606355 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 1 / dc | v(14) | 100 | 0.06299893488302599 | 0.023177152161147244 | 0.050127902928090926 | 0.010189113063096389 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 1 / dc | v(15) | 100 | 0.06366132996854201 | 0.023186857738285317 | 0.05086854078994324 | 0.010311334235013594 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 1 / dc | v(16) | 100 | 0.057162267635944675 | 0.0212695336208256 | 0.12528993451952572 | 0.03170969353124079 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 1 / dc | v(17) | 100 | 0.056500310468825976 | 0.021275183664403716 | 0.12327900793742375 | 0.030764913668254346 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 1 / dc | v(2) | 100 | 0 | 0 | 0 | 0 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 1 / dc | v(3) | 100 | 0 | 0 | 0 | 0 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 1 / dc | v(30) | 100 | 0.008789020075243514 | 0.008531895438629101 | 4.160339931436677 | 0.5667715146045532 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 1 / dc | v(31) | 100 | 0.008763904587948672 | 0.00853992322216813 | 0.22911246628680632 | 0.2286223207553343 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 1 / dc | v(5) | 100 | 0.016302343245110373 | 0.016073647153411547 | 0.027062732313923744 | 0.019936986430757142 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 1 / dc | v(6) | 100 | 0.016347987518718243 | 0.016084336007931268 | 0.019341855113990915 | 0.01906580127144035 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 1 / dc | v(7) | 100 | 0.017439353473852837 | 0.017287691363600897 | 0.011803928390441247 | 0.010620324396184584 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 1 / dc | v(8) | 100 | 0.00462442965566634 | 0.0043437254566057616 | 0.0011000636575191482 | 0.0010332894797263985 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 1 / dc | v(9) | 100 | 0.006741056458965389 | 0.006328403294338157 | 0.0013328491294501896 | 0.0012512588898803982 | 100 / 0 |
| classic/rca3040-wideband-amplifier | 2 / tran | i(vcc) | 108 | 0.00005383197110479451 | 0.0000467396575238717 | 0.0023184782434068087 | 0.002014533260917852 | 108 / 0 |
| classic/rca3040-wideband-amplifier | 2 / tran | i(vee) | 108 | 0.000019028881451103874 | 0.000016316035578491973 | 0.0008214885384650019 | 0.0007052529009362432 | 108 / 0 |
| classic/rca3040-wideband-amplifier | 2 / tran | i(vin) | 108 | 0.000011566846437587417 | 0.000008684360468220914 | 13.801185514078732 | 3.3269232940086537 | 108 / 0 |
| classic/rca3040-wideband-amplifier | 2 / tran | v(1) | 108 | 0.005614993930788286 | 0.001246583451073607 | 1 | 0.2250171444555125 | 107 / 1 |
| classic/rca3040-wideband-amplifier | 2 / tran | v(10) | 108 | 0.008077003598723431 | 0.004497009560480013 | 0.011060214173781207 | 0.005937215821592353 | 108 / 0 |
| classic/rca3040-wideband-amplifier | 2 / tran | v(11) | 108 | 0.007761518641594023 | 0.0047032703728894475 | 0.010890640314068278 | 0.0061965068040899 | 108 / 0 |
| classic/rca3040-wideband-amplifier | 2 / tran | v(12) | 108 | 0.0009736128702135805 | 0.0005205494038870226 | 0.0006052130850141589 | 0.00032343953453796567 | 108 / 0 |
| classic/rca3040-wideband-amplifier | 2 / tran | v(13) | 108 | 0.0004986657859953336 | 0.0002641894345509502 | 0.000619947514149596 | 0.00032830567097353805 | 108 / 0 |
| classic/rca3040-wideband-amplifier | 2 / tran | v(14) | 108 | 0.13521793418261474 | 0.06654817237526238 | 0.02473488712901607 | 0.009950533220338575 | 108 / 0 |
| classic/rca3040-wideband-amplifier | 2 / tran | v(15) | 108 | 0.17586898357585667 | 0.07666164708009128 | 0.022068308566286093 | 0.009937609945402073 | 108 / 0 |
| classic/rca3040-wideband-amplifier | 2 / tran | v(16) | 108 | 0.17204026833931518 | 0.07528811916819474 | 0.0240826880089649 | 0.010964527220011214 | 108 / 0 |
| classic/rca3040-wideband-amplifier | 2 / tran | v(17) | 108 | 0.13944749573239967 | 0.06698210191676532 | 0.030657945822903772 | 0.01161760834187534 | 108 / 0 |
| classic/rca3040-wideband-amplifier | 2 / tran | v(2) | 108 | 0 | 0 | 0 | 0 | 108 / 0 |
| classic/rca3040-wideband-amplifier | 2 / tran | v(3) | 108 | 0 | 0 | 0 | 0 | 108 / 0 |
| classic/rca3040-wideband-amplifier | 2 / tran | v(30) | 108 | 0.010541530323198454 | 0.008450803980319917 | 33.798532160050705 | 5.505716117418245 | 108 / 0 |
| classic/rca3040-wideband-amplifier | 2 / tran | v(31) | 108 | 0.01055891151619835 | 0.008538200274108858 | 1.2551557991426199 | 0.4621032342902145 | 108 / 0 |
| classic/rca3040-wideband-amplifier | 2 / tran | v(5) | 108 | 0.01797171519627694 | 0.015980458181550944 | 0.023545610832692267 | 0.019104397704413686 | 108 / 0 |
| classic/rca3040-wideband-amplifier | 2 / tran | v(6) | 108 | 0.018329223377451687 | 0.01606771131239505 | 0.022234536572949163 | 0.019100747638468345 | 108 / 0 |
| classic/rca3040-wideband-amplifier | 2 / tran | v(7) | 108 | 0.018839857168408747 | 0.016934658318833055 | 0.011629694284975806 | 0.010154845025076627 | 108 / 0 |
| classic/rca3040-wideband-amplifier | 2 / tran | v(8) | 108 | 0.0055633761405582405 | 0.004275447059866266 | 0.0013258261526508993 | 0.0010172343674835706 | 108 / 0 |
| classic/rca3040-wideband-amplifier | 2 / tran | v(9) | 108 | 0.007743730583475106 | 0.006227455982460987 | 0.001533793360709249 | 0.0012314741211320952 | 108 / 0 |
| xyce/diode-sidewall-dc | 0 / dc | i(vin) | 60 | 0.00003047192323839265 | 0.000005591500747624041 | 0.001001267246592247 | 0.00031026524205993037 | 59 / 1 |
| xyce/diode-sidewall-dc | 0 / dc | i(vmon) | 60 | 0.00003047192323839265 | 0.000005591500747624041 | 0.001001267246592247 | 0.00031026524205993037 | 59 / 1 |
| xyce/diode-sidewall-dc | 0 / dc | v(1) | 60 | 0 | 0 | 0 | 0 | 60 / 0 |
| xyce/diode-sidewall-dc | 0 / dc | v(2) | 60 | 0 | 0 | 0 | 0 | 60 / 0 |
| xyce/nmos-level1-dc | 0 / dc | i(vdd) | 361 | 9.598471479167325e-19 | 3.7638310140624955e-19 | 4.288726335295535e-12 | 2.3943723529765874e-12 | 342 / 19 |
| xyce/nmos-level1-dc | 0 / dc | i(vgg) | 361 | 0.0000013633472783823684 | 9.387641512939336e-8 | 0.27842904047762473 | 0.16385122653718712 | 342 / 19 |
| xyce/nmos-level1-dc | 0 / dc | v(1) | 361 | 8.881784197001252e-16 | 3.941507226809392e-16 | 3.4820631226879913e-16 | 1.8762598041942077e-16 | 342 / 19 |
| xyce/nmos-level1-dc | 0 / dc | v(2) | 361 | 0.0006816736391914713 | 0.000046938207564696764 | 0.27842904047762485 | 0.16385122653718712 | 342 / 19 |
| xyce/nmos-level1-dc | 0 / dc | v(3) | 361 | 0 | 0 | 0 | 0 | 342 / 19 |
| xyce/nmos-level1-dc | 0 / dc | v(4) | 361 | 8.881784197001252e-16 | 2.0376210396350005e-16 | 1.4802973661668753e-16 | 3.4890943526306116e-17 | 342 / 19 |
| xyce/nmos-level1-dc | 0 / dc | v(5) | 361 | 0 | 0 | 0 | 0 | 342 / 19 |
| xyce/npn-dc | 0 / dc | i(vcc) | 13 | 1.5158001535908478e-7 | 4.7138312981820104e-8 | 0.00017518113776039204 | 0.0000675229341024191 | 12 / 1 |
| xyce/npn-dc | 0 / dc | i(vmon1) | 13 | 1.5000364489846683e-9 | 4.663261384682213e-10 | 0.00017509294978608356 | 0.00006733642078877891 | 12 / 1 |
| xyce/npn-dc | 0 / dc | i(vmon2) | 13 | 1.500799789101899e-7 | 4.6671987258246524e-8 | 0.00017518201964008068 | 0.00006752480218301947 | 12 / 1 |
| xyce/npn-dc | 0 / dc | v(1) | 13 | 0.0005655137412649003 | 0.0001758049542020386 | 0.0007342347254686288 | 0.0002372925831754028 | 12 / 1 |
| xyce/npn-dc | 0 / dc | v(2) | 13 | 0.00030015995782006755 | 0.00009334397451635703 | 0.00013127012586240877 | 0.00004208910825558799 | 12 / 1 |
| xyce/npn-dc | 0 / dc | v(3) | 13 | 0.00030015995782006755 | 0.00009334397451635703 | 0.00013127012586240877 | 0.00004208910825558799 | 12 / 1 |
| xyce/npn-dc | 0 / dc | v(4) | 13 | 0 | 0 | 0 | 0 | 12 / 1 |
| xyce/npn-dc | 0 / dc | v(5) | 13 | 0.0005655137412649003 | 0.0001758049542020386 | 0.0007342347254686288 | 0.0002372925831754028 | 12 / 1 |
| xyce/pmos-level1-dc | 0 / dc | i(vdd) | 6 | 2.670768347959882e-7 | 1.0903366122932926e-7 | 0.0004727899720821354 | 0.00021143810368538083 | 5 / 1 |
| xyce/pmos-level1-dc | 0 / dc | i(vmon) | 6 | 2.670768347959882e-7 | 1.0903366122932926e-7 | 0.0005187012446088025 | 0.0002319969882642218 | 5 / 1 |
| xyce/pmos-level1-dc | 0 / dc | v(1) | 6 | 1.1102230246251565e-16 | 6.409875621278546e-17 | 2.220446049250313e-16 | 1.1102230246251565e-16 | 5 / 1 |
| xyce/pmos-level1-dc | 0 / dc | v(2) | 6 | 0 | 0 | 0 | 0 | 5 / 1 |
| xyce/pmos-level1-dc | 0 / dc | v(3) | 6 | 0.0020030762609701824 | 0.0008177524592200801 | 0.0005187012446088725 | 0.00023199698826425149 | 5 / 1 |
| xyce/pmos-level1-dc | 0 / dc | v(4) | 6 | 0.0020030762609701824 | 0.0008177524592200801 | 0.0005187012446088725 | 0.00023199698826425149 | 5 / 1 |
| xyce/pnp-dc | 0 / dc | i(vbb) | 30 | 5.226204611042946e-9 | 1.358715980864517e-9 | 0.000558533890553419 | 0.00016859568479404602 | 29 / 1 |
| xyce/pnp-dc | 0 / dc | i(vmon1) | 30 | 5.226204611042946e-9 | 1.358715980864517e-9 | 0.000558533890553419 | 0.00016859568479404602 | 29 / 1 |
| xyce/pnp-dc | 0 / dc | i(vmon2) | 30 | 3.1353193977016764e-7 | 8.203186699596261e-8 | 0.0005584619576398277 | 0.00017059528655150535 | 29 / 1 |
| xyce/pnp-dc | 0 / dc | i(vmon3) | 30 | 3.187568675512911e-7 | 8.33339250083251e-8 | 0.0005584608998662588 | 0.00016963124340434936 | 29 / 1 |
| xyce/pnp-dc | 0 / dc | i(vpos) | 30 | 3.1875686755139954e-7 | 8.33339250083262e-8 | 0.0005584608998664487 | 0.00016963124340435272 | 29 / 1 |
| xyce/pnp-dc | 0 / dc | v(1) | 30 | 0 | 0 | 0 | 0 | 25 / 5 |
| xyce/pnp-dc | 0 / dc | v(2) | 30 | 0.0006375137351029014 | 0.0001666678500167221 | 0.000599249404285839 | 0.0001541038847130899 | 29 / 1 |
| xyce/pnp-dc | 0 / dc | v(3) | 30 | 0.0009929788760985048 | 0.0002581560363643045 | 0.0009499768004571815 | 0.0003061476442572228 | 29 / 1 |
| xyce/pnp-dc | 0 / dc | v(4) | 30 | 0 | 0 | 0 | 0 | 24 / 6 |
| xyce/pnp-dc | 0 / dc | v(5) | 30 | 0 | 0 | n/a | n/a | 0 / 30 |
| xyce/pnp-dc | 0 / dc | v(6) | 30 | 0 | 0 | 0 | 0 | 24 / 6 |
| xyce/pnp-dc | 0 / dc | v(7) | 30 | 0.0006375137351029014 | 0.0001666678500167221 | 0.000599249404285839 | 0.0001541038847130899 | 29 / 1 |
| xyce/resistor-dc | 0 / dc | i(v1) | 6 | 0 | 0 | 0 | 0 | 5 / 1 |
| xyce/resistor-dc | 0 / dc | v(1) | 6 | 0 | 0 | 0 | 0 | 5 / 1 |
| xyce/resistor-level3-zero | 0 / dc | i(v1) | 6 | 0.0001171875000000001 | 0.00007096055517416002 | 0.02343750000000002 | 0.02343750000000002 | 5 / 1 |
| xyce/resistor-level3-zero | 0 / dc | v(a) | 6 | 0 | 0 | 0 | 0 | 5 / 1 |
| xyce/resistor-level3-zero | 0 / dc | v(b) | 6 | 5.329070518200751e-15 | 3.1365847250231425e-15 | 1.0658141036401502e-15 | 1.0202836170640765e-15 | 5 / 1 |
| xyce/resistor-negative | 0 / dc | i(v1) | 6 | 0 | 0 | 0 | 0 | 5 / 1 |
| xyce/resistor-negative | 0 / dc | v(a) | 6 | 0 | 0 | 0 | 0 | 5 / 1 |
| xyce/vccs-dc | 0 / dc | i(vin) | 12 | 1.734723475976807e-18 | 1.127170562742727e-18 | 2.6020852139652106e-16 | 1.8381017057652515e-16 | 12 / 0 |
| xyce/vccs-dc | 0 / dc | v(1) | 12 | 0 | 0 | 0 | 0 | 12 / 0 |
| xyce/vccs-dc | 0 / dc | v(2) | 12 | 8.881784197001252e-16 | 2.5639502485114184e-16 | 1.3158198810372225e-16 | 3.798444812609509e-17 | 12 / 0 |
| xyce/vccs-dc | 0 / dc | v(3) | 12 | 0 | 0 | 0 | 0 | 12 / 0 |
| xyce/vcvs-dc | 0 / dc | i(e) | 10 | 1.0408340855860843e-17 | 6.72310261544613e-18 | 1.2027416100105861e-15 | 6.426602751257853e-16 | 10 / 0 |
| xyce/vcvs-dc | 0 / dc | i(vin) | 10 | 8.876905287225068e-18 | 4.566852048615199e-18 | 8.89909755044313e-14 | 7.170692498100962e-14 | 10 / 0 |
| xyce/vcvs-dc | 0 / dc | v(1) | 10 | 0 | 0 | 0 | 0 | 10 / 0 |
| xyce/vcvs-dc | 0 / dc | v(2) | 10 | 1.7763568394002505e-15 | 1.1085564392102945e-15 | 3.561595462997502e-16 | 1.7535352473718235e-16 | 10 / 0 |
| xyce/vcvs-dc | 0 / dc | v(3) | 10 | 0 | 0 | 0 | 0 | 10 / 0 |
| xyce/vcvs-dc | 0 / dc | v(4) | 10 | 5.329070518200751e-15 | 2.217112878420589e-15 | 3.4638958368304885e-16 | 1.633801013790697e-16 | 10 / 0 |
| corpus-d/ohms-law-op | 0 / op | i(v1) | 1 | 6.938893903907228e-18 | 6.938893903907228e-18 | 1.261617073437678e-16 | 1.261617073437678e-16 | 1 / 0 |
| corpus-d/ohms-law-op | 0 / op | v(supply) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-e/cccs-mixed-analysis | 0 / op | i(e1) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-e/cccs-mixed-analysis | 0 / op | i(v2) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-e/cccs-mixed-analysis | 0 / op | i(v7) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-e/cccs-mixed-analysis | 0 / op | v(1) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-e/cccs-mixed-analysis | 0 / op | v(2) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-e/cccs-mixed-analysis | 0 / op | v(3) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-e/cccs-mixed-analysis | 0 / op | v(4) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-e/cccs-mixed-analysis | 0 / op | v(5) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-e/cccs-mixed-analysis | 0 / op | v(6) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-e/cccs-mixed-analysis | 0 / op | v(7) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-e/cccs-mixed-analysis | 1 / tran | i(e1) | 59 | 0 | 0 | 0 | 0 | 59 / 0 |
| corpus-e/cccs-mixed-analysis | 1 / tran | i(v2) | 59 | 0 | 0 | 0 | 0 | 59 / 0 |
| corpus-e/cccs-mixed-analysis | 1 / tran | i(v7) | 59 | 0 | 0 | 0 | 0 | 59 / 0 |
| corpus-e/cccs-mixed-analysis | 1 / tran | v(1) | 59 | 0 | 0 | 0 | 0 | 59 / 0 |
| corpus-e/cccs-mixed-analysis | 1 / tran | v(2) | 59 | 0 | 0 | 0 | 0 | 59 / 0 |
| corpus-e/cccs-mixed-analysis | 1 / tran | v(3) | 59 | 0 | 0 | 0 | 0 | 59 / 0 |
| corpus-e/cccs-mixed-analysis | 1 / tran | v(4) | 59 | 0 | 0 | 0 | 0 | 59 / 0 |
| corpus-e/cccs-mixed-analysis | 1 / tran | v(5) | 59 | 0 | 0 | 0 | 0 | 59 / 0 |
| corpus-e/cccs-mixed-analysis | 1 / tran | v(6) | 59 | 0 | 0 | 0 | 0 | 59 / 0 |
| corpus-e/cccs-mixed-analysis | 1 / tran | v(7) | 59 | 0 | 0 | 0 | 0 | 59 / 0 |
| corpus-e/cccs-mixed-analysis | 2 / ac | i(e1) | 2 | 0 | 0 | 0 | 0 | 2 / 0 |
| corpus-e/cccs-mixed-analysis | 2 / ac | i(v2) | 2 | 0 | 0 | 0 | 0 | 2 / 0 |
| corpus-e/cccs-mixed-analysis | 2 / ac | i(v7) | 2 | 0 | 0 | 0 | 0 | 2 / 0 |
| corpus-e/cccs-mixed-analysis | 2 / ac | v(1) | 2 | 0 | 0 | 0 | 0 | 2 / 0 |
| corpus-e/cccs-mixed-analysis | 2 / ac | v(2) | 2 | 0 | 0 | 0 | 0 | 2 / 0 |
| corpus-e/cccs-mixed-analysis | 2 / ac | v(3) | 2 | 0 | 0 | 0 | 0 | 2 / 0 |
| corpus-e/cccs-mixed-analysis | 2 / ac | v(4) | 2 | 0 | 0 | 0 | 0 | 2 / 0 |
| corpus-e/cccs-mixed-analysis | 2 / ac | v(5) | 2 | 0 | 0 | 0 | 0 | 2 / 0 |
| corpus-e/cccs-mixed-analysis | 2 / ac | v(6) | 2 | 0 | 0 | 0 | 0 | 2 / 0 |
| corpus-e/cccs-mixed-analysis | 2 / ac | v(7) | 2 | 0 | 0 | 0 | 0 | 2 / 0 |
| corpus-e/diode-bias-sweep | 0 / op | i(v1) | 1 | 1.6733125952558825e-10 | 1.6733125952558825e-10 | 0.000001778977457808892 | 0.000001778977457808892 | 1 / 0 |
| corpus-e/diode-bias-sweep | 0 / op | v(1) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-e/diode-bias-sweep | 0 / op | v(2) | 1 | 0.000016733125952739236 | 0.000016733125952739236 | 0.000028171951535607416 | 0.000028171951535607416 | 1 / 0 |
| corpus-e/diode-bias-sweep | 1 / dc | i(v1) | 11 | 2.6480960508971137e-9 | 1.11467854938957e-9 | 0.00006092745533300684 | 0.000023879273892201094 | 10 / 1 |
| corpus-e/diode-bias-sweep | 1 / dc | v(1) | 11 | 0 | 0 | 0 | 0 | 10 / 1 |
| corpus-e/diode-bias-sweep | 1 / dc | v(2) | 11 | 0.0002648096050898996 | 0.00011146785493915375 | 0.0004505099392965683 | 0.00020115745979334547 | 10 / 1 |
| corpus-e/mutual-inductance-ac | 0 / ac | i(e3a) | 9 | 1.949153083228106e-17 | 9.991689494357015e-18 | 3.4073609093953106e-15 | 1.261263341689453e-15 | 9 / 0 |
| corpus-e/mutual-inductance-ac | 0 / ac | i(e3b) | 9 | 5.330262513176503e-18 | 2.7694627032082184e-18 | 3.7642379746002504e-15 | 1.7207689818191763e-15 | 9 / 0 |
| corpus-e/mutual-inductance-ac | 0 / ac | i(l1a) | 9 | 2.3792449566854803e-17 | 1.0933305469016238e-17 | 3.66571814238798e-14 | 1.2257368645904387e-14 | 9 / 0 |
| corpus-e/mutual-inductance-ac | 0 / ac | i(l1b) | 9 | 1.69753193125282e-17 | 7.667283271026983e-18 | 4.142339612425142e-14 | 1.42256091036191e-14 | 9 / 0 |
| corpus-e/mutual-inductance-ac | 0 / ac | i(l2a) | 9 | 1.3878211317825933e-17 | 6.940629019984812e-18 | 2.605967764823793e-15 | 9.789903032603677e-16 | 9 / 0 |
| corpus-e/mutual-inductance-ac | 0 / ac | i(l2b) | 9 | 1.3879481770324007e-17 | 7.085127852440213e-18 | 3.6943220451962955e-15 | 1.3107255985099243e-15 | 9 / 0 |
| corpus-e/mutual-inductance-ac | 0 / ac | i(l2c) | 9 | 7.490613065739336e-18 | 4.960525274437463e-18 | 1.7218732712096225e-14 | 7.324141451922288e-15 | 9 / 0 |
| corpus-e/mutual-inductance-ac | 0 / ac | i(l3a) | 9 | 1.949153083228106e-17 | 9.991689494357015e-18 | 3.4073609093953106e-15 | 1.261263341689453e-15 | 9 / 0 |
| corpus-e/mutual-inductance-ac | 0 / ac | i(l3b) | 9 | 5.317014118589118e-18 | 2.815533043103566e-18 | 3.768580557684706e-15 | 1.7160156588837328e-15 | 9 / 0 |
| corpus-e/mutual-inductance-ac | 0 / ac | i(v1) | 9 | 2.1103821920200808e-17 | 1.2145500987709381e-17 | 2.7480724797782116e-14 | 9.280405861077709e-15 | 9 / 0 |
| corpus-e/mutual-inductance-ac | 0 / ac | i(v2) | 9 | 1.3878211317825933e-17 | 7.326137989028961e-18 | 2.0207785553758795e-15 | 7.904852219873717e-16 | 9 / 0 |
| corpus-e/mutual-inductance-ac | 0 / ac | i(v3) | 9 | 1.949153083228106e-17 | 1.072498327822525e-17 | 3.341353204082425e-15 | 1.392241729765671e-15 | 9 / 0 |
| corpus-e/mutual-inductance-ac | 0 / ac | v(1) | 9 | 0 | 0 | 0 | 0 | 9 / 0 |
| corpus-e/mutual-inductance-ac | 0 / ac | v(10) | 9 | 4.965068306494546e-16 | 3.1350964414077596e-16 | 4.3520371289741715e-16 | 2.675674807453506e-16 | 9 / 0 |
| corpus-e/mutual-inductance-ac | 0 / ac | v(11) | 9 | 8.881784197001252e-16 | 4.765149259784538e-16 | 2.0962017787333e-14 | 7.253190120113204e-15 | 9 / 0 |
| corpus-e/mutual-inductance-ac | 0 / ac | v(12) | 9 | 2.237726045655905e-16 | 1.0773119934684459e-16 | 2.402081924709681e-15 | 1.0100189847644765e-15 | 9 / 0 |
| corpus-e/mutual-inductance-ac | 0 / ac | v(2) | 9 | 4.441027621704298e-16 | 2.378758344701171e-16 | 3.4783291317080034e-15 | 1.2085780021825004e-15 | 9 / 0 |
| corpus-e/mutual-inductance-ac | 0 / ac | v(3) | 9 | 1.274606961602382e-15 | 5.735904019068281e-16 | 4.1470834294678916e-14 | 1.4247777812804546e-14 | 9 / 0 |
| corpus-e/mutual-inductance-ac | 0 / ac | v(4) | 9 | 0 | 0 | 0 | 0 | 9 / 0 |
| corpus-e/mutual-inductance-ac | 0 / ac | v(5) | 9 | 2.7755575615628914e-16 | 1.6182186269917295e-16 | 1.1282554915816861e-14 | 3.785823752496823e-15 | 9 / 0 |
| corpus-e/mutual-inductance-ac | 0 / ac | v(6) | 9 | 6.984330422984656e-16 | 2.715141664723159e-16 | 5.112615499959546e-15 | 1.8177410740990755e-15 | 9 / 0 |
| corpus-e/mutual-inductance-ac | 0 / ac | v(7) | 9 | 5.602921856063174e-16 | 3.848121602476999e-16 | 1.7219494147527687e-14 | 7.335820088622756e-15 | 9 / 0 |
| corpus-e/mutual-inductance-ac | 0 / ac | v(8) | 9 | 0 | 0 | 0 | 0 | 9 / 0 |
| corpus-e/mutual-inductance-ac | 0 / ac | v(9) | 9 | 3.885935469125957e-16 | 1.9251241681204787e-16 | 6.068931065443743e-15 | 2.7912692548103155e-15 | 9 / 0 |
| corpus-e/mutual-inductance-ac | 1 / tran | i(e3a) | 126 | 0.0000013482521990203222 | 3.615735294013084e-7 | 0.7697579743378027 | 0.07916294701141732 | 98 / 28 |
| corpus-e/mutual-inductance-ac | 1 / tran | i(e3b) | 126 | 7.426475298558805e-7 | 2.284841556962955e-7 | 0.769631304408619 | 0.07914536091969265 | 98 / 28 |
| corpus-e/mutual-inductance-ac | 1 / tran | i(l1a) | 126 | 0.0000013482521995719643 | 3.615735297724828e-7 | 0.7697579743389166 | 0.07916294701152127 | 98 / 28 |
| corpus-e/mutual-inductance-ac | 1 / tran | i(l1b) | 126 | 7.426475306521185e-7 | 2.284841560543278e-7 | 0.7696313044079854 | 0.07914536091960578 | 98 / 28 |
| corpus-e/mutual-inductance-ac | 1 / tran | i(l2a) | 126 | 0.000001348252197993366 | 3.615735290044092e-7 | 0.7697579743398636 | 0.07916294701165255 | 98 / 28 |
| corpus-e/mutual-inductance-ac | 1 / tran | i(l2b) | 126 | 6.056046687177505e-7 | 1.413291067524864e-7 | 0.7699749732662106 | 0.07919307142889616 | 98 / 28 |
| corpus-e/mutual-inductance-ac | 1 / tran | i(l2c) | 126 | 7.426475292747481e-7 | 2.2848415533875577e-7 | 0.7696313044089326 | 0.07914536091973694 | 98 / 28 |
| corpus-e/mutual-inductance-ac | 1 / tran | i(l3a) | 126 | 0.0000013482521988555235 | 3.615735294007762e-7 | 0.7697579743393793 | 0.07916294701158542 | 98 / 28 |
| corpus-e/mutual-inductance-ac | 1 / tran | i(l3b) | 126 | 7.426475300796598e-7 | 2.2848415570880792e-7 | 0.7696313044084478 | 0.07914536091966978 | 98 / 28 |
| corpus-e/mutual-inductance-ac | 1 / tran | i(v1) | 126 | 0.0000013482521995719643 | 3.6157352977274357e-7 | 0.7697579743380955 | 0.07916294701143711 | 98 / 28 |
| corpus-e/mutual-inductance-ac | 1 / tran | i(v2) | 126 | 0.000001348252197993366 | 3.6157352900469194e-7 | 0.7697579743388284 | 0.0791629470115481 | 98 / 28 |
| corpus-e/mutual-inductance-ac | 1 / tran | i(v3) | 126 | 0.0000013482521990203222 | 3.615735294013084e-7 | 0.7697579743378027 | 0.07916294701141732 | 98 / 28 |
| corpus-e/mutual-inductance-ac | 1 / tran | v(1) | 126 | 3.3306690738754696e-16 | 9.47781433762123e-17 | 3.226791897074788e-13 | 4.013074858852729e-14 | 74 / 52 |
| corpus-e/mutual-inductance-ac | 1 / tran | v(10) | 126 | 0.0001481888704145673 | 0.00004277158175307287 | 0.0035846190814754447 | 0.00037696819096792717 | 98 / 28 |
| corpus-e/mutual-inductance-ac | 1 / tran | v(11) | 126 | 0.00018770538892365352 | 0.00005520821428425886 | 0.002254555446089915 | 0.00027444404352857 | 98 / 28 |
| corpus-e/mutual-inductance-ac | 1 / tran | v(12) | 126 | 0.00005569856473919277 | 0.000017136311677223723 | 0.7696313044086185 | 0.07914536091969258 | 98 / 28 |
| corpus-e/mutual-inductance-ac | 1 / tran | v(2) | 126 | 0.00002966154839068036 | 0.00000795461765501157 | 0.001692669592180905 | 0.00017724078101597493 | 98 / 28 |
| corpus-e/mutual-inductance-ac | 1 / tran | v(3) | 126 | 0.000055698564798811745 | 0.00001713631170407609 | 0.7696313044079856 | 0.07914536091960578 | 98 / 28 |
| corpus-e/mutual-inductance-ac | 1 / tran | v(4) | 126 | 3.3306690738754696e-16 | 9.47781433762123e-17 | 3.226791897074788e-13 | 4.013074858852729e-14 | 74 / 52 |
| corpus-e/mutual-inductance-ac | 1 / tran | v(5) | 126 | 0.00002966154835584711 | 0.000007954617638113384 | 0.0016926694797990214 | 0.00017724077004020484 | 98 / 28 |
| corpus-e/mutual-inductance-ac | 1 / tran | v(6) | 126 | 0.000013479502105825936 | 0.000003335147981863617 | 0.00016923444359323396 | 0.000033543311671932546 | 98 / 28 |
| corpus-e/mutual-inductance-ac | 1 / tran | v(7) | 126 | 0.00005569856469550549 | 0.00001713631165040887 | 0.769631304408932 | 0.07914536091973688 | 98 / 28 |
| corpus-e/mutual-inductance-ac | 1 / tran | v(8) | 126 | 3.3306690738754696e-16 | 9.47781433762123e-17 | 3.226791897074788e-13 | 4.013074858852729e-14 | 74 / 52 |
| corpus-e/mutual-inductance-ac | 1 / tran | v(9) | 126 | 0.000029661548378412395 | 0.000007954617646838536 | 0.0016926695402041496 | 0.00017724077593794685 | 98 / 28 |
| corpus-e/capacitor-step-transient | 0 / tran | i(v1) | 71 | 0.0011417259226231269 | 0.0003933059370949116 | 0.5176423433464854 | 0.14862404170711704 | 70 / 1 |
| corpus-e/capacitor-step-transient | 0 / tran | v(1) | 71 | 1.1102230246251565e-16 | 1.5184501238077465e-17 | 1.542759999465112e-16 | 3.145057400918464e-17 | 70 / 1 |
| corpus-e/capacitor-step-transient | 0 / tran | v(2) | 71 | 0.0011417259226230714 | 0.00039330593709489484 | 0.1061433032806924 | 0.028131254057223935 | 70 / 1 |
| corpus-e/lc-oscillator-transient | 0 / tran | i(l1) | 219 | 8.332913088094116 | 3.532699684338701 | 209.02759659562 | 16.162970489198454 | 219 / 0 |
| corpus-e/lc-oscillator-transient | 0 / tran | v(1) | 219 | 8.202397759317876 | 3.4905592879041167 | 420.73378187477897 | 30.502423624001146 | 218 / 1 |
| corpus-e/diode-temperature-sweep | 0 / op | i(v1) | 1 | 1.3212331375451677e-10 | 1.3212331375451677e-10 | 0.0000014020007819204686 | 0.0000014020007819204686 | 1 / 0 |
| corpus-e/diode-temperature-sweep | 0 / op | v(1) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-e/diode-temperature-sweep | 0 / op | v(2) | 1 | 0.00001321233137596689 | 0.00001321233137596689 | 0.00002293455388400871 | 0.00002293455388400871 | 1 / 0 |
| corpus-e/diode-temperature-sweep | 1 / dc | i(v1) | 11 | 2.6242016273073055e-9 | 1.0747265093000028e-9 | 0.4995004495376896 | 0.3527490220662965 | 10 / 1 |
| corpus-e/diode-temperature-sweep | 1 / dc | v(1) | 11 | 0 | 0 | 0 | 0 | 10 / 1 |
| corpus-e/diode-temperature-sweep | 1 / dc | v(2) | 11 | 0.00026242016273181346 | 0.00010747265092998159 | 0.00046043934516322736 | 0.00019992961740103747 | 10 / 1 |
| corpus-e/diode-temperature-sweep | 2 / dc | i(v1) | 3 | 1.6229136486295773e-10 | 1.5288035413081112e-10 | 0.0000017220921645186753 | 0.0000016222375442275263 | 3 / 0 |
| corpus-e/diode-temperature-sweep | 2 / dc | v(1) | 3 | 0 | 0 | 0 | 0 | 3 / 0 |
| corpus-e/diode-temperature-sweep | 2 / dc | v(2) | 3 | 0.0000162291364879108 | 0.000015288035413331166 | 0.000028171411417576936 | 0.000026537840203984068 | 3 / 0 |
| corpus-e/diode-temperature-sweep | 3 / op | i(v1) | 1 | 1.3212331375451677e-10 | 1.3212331375451677e-10 | 0.0000014020007819204686 | 0.0000014020007819204686 | 1 / 0 |
| corpus-e/diode-temperature-sweep | 3 / op | v(1) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-e/diode-temperature-sweep | 3 / op | v(2) | 1 | 0.00001321233137596689 | 0.00001321233137596689 | 0.00002293455388400871 | 0.00002293455388400871 | 1 / 0 |
| corpus-e/bjt-rtl-inverter-chain | 0 / op | i(vcc) | 1 | 4.336787273913345e-9 | 4.336787273913345e-9 | 8.484689247381513e-7 | 8.484689247381513e-7 | 1 / 0 |
| corpus-e/bjt-rtl-inverter-chain | 0 / op | i(vin) | 1 | 2.0392345557037457e-18 | 2.0392345557037457e-18 | 4.4117457711241637e-7 | 4.4117457711241637e-7 | 1 / 0 |
| corpus-e/bjt-rtl-inverter-chain | 0 / op | v(1) | 1 | 0 | 0 | n/a | n/a | 0 / 1 |
| corpus-e/bjt-rtl-inverter-chain | 0 / op | v(2) | 1 | 2.0392345555047054e-14 | 2.0392345555047054e-14 | 4.411745770693554e-7 | 4.411745770693554e-7 | 1 / 0 |
| corpus-e/bjt-rtl-inverter-chain | 0 / op | v(3) | 1 | 0.000002084848031991271 | 0.000002084848031991271 | 4.5105249714758936e-7 | 4.5105249714758936e-7 | 1 / 0 |
| corpus-e/bjt-rtl-inverter-chain | 0 / op | v(4) | 1 | 0.000022929055452314273 | 0.000022929055452314273 | 0.000027166040455695414 | 0.000027166040455695414 | 1 / 0 |
| corpus-e/bjt-rtl-inverter-chain | 0 / op | v(5) | 1 | 0.0000022519392409714456 | 0.0000022519392409714456 | 0.000008449875157561198 | 0.000008449875157561198 | 1 / 0 |
| corpus-e/bjt-rtl-inverter-chain | 0 / op | v(6) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-e/bjt-rtl-inverter-chain | 1 / dc | i(vcc) | 51 | 0.0000017152831019986645 | 2.8079972866969865e-7 | 0.00032172720167359276 | 0.00005239656858906863 | 51 / 0 |
| corpus-e/bjt-rtl-inverter-chain | 1 / dc | i(vin) | 51 | 9.326098934753875e-9 | 2.5768186717259135e-9 | 0.12412550474032778 | 0.02478616230134591 | 51 / 0 |
| corpus-e/bjt-rtl-inverter-chain | 1 / dc | v(1) | 51 | 0 | 0 | 0 | 0 | 50 / 1 |
| corpus-e/bjt-rtl-inverter-chain | 1 / dc | v(2) | 51 | 0.00009326098934747673 | 0.000025768186717259948 | 0.00012074463202335961 | 0.00003278259473893717 | 51 / 0 |
| corpus-e/bjt-rtl-inverter-chain | 1 / dc | v(3) | 51 | 0.00045424045761777165 | 0.00010900874300134228 | 0.0001639097490673938 | 0.000056910653701835415 | 51 / 0 |
| corpus-e/bjt-rtl-inverter-chain | 1 / dc | v(4) | 51 | 0.0004551639900624016 | 0.0000765786833026032 | 0.000581411687604187 | 0.00010234716852882283 | 51 / 0 |
| corpus-e/bjt-rtl-inverter-chain | 1 / dc | v(5) | 51 | 0.0015813678773457518 | 0.0002451392568036893 | 0.0005409078982653154 | 0.00011201494515443658 | 51 / 0 |
| corpus-e/bjt-rtl-inverter-chain | 1 / dc | v(6) | 51 | 0 | 0 | 0 | 0 | 51 / 0 |
| corpus-e/bjt-rtl-inverter-chain | 2 / tran | i(vcc) | 80 | 0.000023056972578417573 | 0.0000061854709649649726 | 0.004484087323649997 | 0.0012476240335358316 | 80 / 0 |
| corpus-e/bjt-rtl-inverter-chain | 2 / tran | i(vin) | 80 | 2.977266246534526e-7 | 9.129672449103766e-8 | 0.029415550986025336 | 0.006286451554477679 | 80 / 0 |
| corpus-e/bjt-rtl-inverter-chain | 2 / tran | v(1) | 80 | 2.1316282072801242e-14 | 2.407362714728454e-15 | 1 | 0.22941573387056177 | 38 / 42 |
| corpus-e/bjt-rtl-inverter-chain | 2 / tran | v(2) | 80 | 0.002977266246534563 | 0.000912967244910424 | 0.14688578850742415 | 0.01815369177635118 | 80 / 0 |
| corpus-e/bjt-rtl-inverter-chain | 2 / tran | v(3) | 80 | 0.01134700087528362 | 0.0045451966377762125 | 0.017897311512352583 | 0.004029427501225869 | 80 / 0 |
| corpus-e/bjt-rtl-inverter-chain | 2 / tran | v(4) | 80 | 0.002941879568324479 | 0.0005823008345569142 | 0.00422257389776418 | 0.0008128816677881727 | 80 / 0 |
| corpus-e/bjt-rtl-inverter-chain | 2 / tran | v(5) | 80 | 0.033534585586583066 | 0.008780908189205607 | 0.06029455431532376 | 0.008383289384714256 | 80 / 0 |
| corpus-e/bjt-rtl-inverter-chain | 2 / tran | v(6) | 80 | 0 | 0 | 0 | 0 | 80 / 0 |
| corpus-f/examples-ddt-ddt-test1-cir | 0 / tran | i(b2) | 8029 | 0 | 0 | n/a | n/a | 0 / 8029 |
| corpus-f/examples-ddt-ddt-test1-cir | 0 / tran | i(v1) | 8029 | 0 | 0 | n/a | n/a | 0 / 8029 |
| corpus-f/examples-ddt-ddt-test1-cir | 0 / tran | v(1) | 8029 | 1.8318679906315083e-15 | 4.271478860343231e-16 | 2.9591491292197223e-13 | 5.27216358204371e-15 | 6020 / 2009 |
| corpus-f/examples-ddt-ddt-test1-cir | 0 / tran | v(2) | 8029 | 2.000004596980402 | 0.07081577076000355 | 24 | 0.43089263045137083 | 4016 / 4013 |
| corpus-f/examples-osdi-hicuml0-bip-subsmod-sp | 0 / dc | i(vb) | 120 | 331.8472443224164 | 41.02886054158534 | 3.244604504076312 | 0.40845067911312366 | 120 / 0 |
| corpus-f/examples-osdi-hicuml0-bip-subsmod-sp | 0 / dc | i(vc) | 120 | 33184.724440835416 | 4102.886055136967 | 0.009197724977667082 | 0.0012632703487307551 | 120 / 0 |
| corpus-f/examples-osdi-hicuml0-bip-subsmod-sp | 0 / dc | i(vs) | 120 | 1e-12 | 1.0000000000000004e-12 | n/a | n/a | 0 / 120 |
| corpus-f/examples-osdi-hicuml0-bip-subsmod-sp | 0 / dc | v(b) | 120 | 0 | 0 | 0 | 0 | 120 / 0 |
| corpus-f/examples-osdi-hicuml0-bip-subsmod-sp | 0 / dc | v(c) | 120 | 0 | 0 | 0 | 0 | 120 / 0 |
| corpus-f/examples-osdi-hicuml0-bip-subsmod-sp | 0 / dc | v(s) | 120 | 0 | 0 | n/a | n/a | 0 / 120 |
| corpus-f/examples-p-to-n-examples-mos1-out-cir | 0 / dc | i(vb) | 306 | 5.769525172367069e-12 | 3.3392341660271027e-12 | 0.27738735017047866 | 0.27231183843608175 | 300 / 6 |
| corpus-f/examples-p-to-n-examples-mos1-out-cir | 0 / dc | i(vd) | 306 | 5.769525265528208e-12 | 3.339234186530434e-12 | 0.27738735017047866 | 0.11063571501728521 | 300 / 6 |
| corpus-f/examples-p-to-n-examples-mos1-out-cir | 0 / dc | i(vg) | 306 | 0 | 0 | n/a | n/a | 0 / 306 |
| corpus-f/examples-p-to-n-examples-mos1-out-cir | 0 / dc | i(vs1) | 306 | 2.168404344971009e-19 | 4.739529867793583e-20 | 6.748846389576747e-16 | 1.7548066666056818e-16 | 250 / 56 |
| corpus-f/examples-p-to-n-examples-mos1-out-cir | 0 / dc | i(vs2) | 306 | 1.6263032587282567e-19 | 3.125985098885106e-20 | 5.561912649549441e-16 | 1.5561298477543428e-16 | 250 / 56 |
| corpus-f/examples-p-to-n-examples-mos1-out-cir | 0 / dc | i(vs3) | 306 | 1.0842021724855044e-19 | 2.050508620113369e-20 | 5.199179215883174e-16 | 1.6623779690838902e-16 | 250 / 56 |
| corpus-f/examples-p-to-n-examples-mos1-out-cir | 0 / dc | v(nvd) | 306 | 0 | 0 | 0 | 0 | 300 / 6 |
| corpus-f/examples-p-to-n-examples-mos1-out-cir | 0 / dc | v(nvf) | 306 | 0 | 0 | n/a | n/a | 0 / 306 |
| corpus-f/examples-p-to-n-examples-mos1-out-cir | 0 / dc | v(nvg) | 306 | 0 | 0 | 0 | 0 | 255 / 51 |
| corpus-f/examples-p-to-n-examples-mos1-out-cir | 0 / dc | v(nvs1) | 306 | 0 | 0 | n/a | n/a | 0 / 306 |
| corpus-f/examples-p-to-n-examples-mos1-out-cir | 0 / dc | v(nvs2) | 306 | 0 | 0 | n/a | n/a | 0 / 306 |
| corpus-f/examples-p-to-n-examples-mos1-out-cir | 0 / dc | v(nvs3) | 306 | 0 | 0 | n/a | n/a | 0 / 306 |
| corpus-f/examples-probe-probe-i-dev-cir | 0 / dc | i(vbb) | 200 | 8.354664053438453e-8 | 5.918299317162786e-8 | 3.2446038060903484 | 0.3190250586506732 | 200 / 0 |
| corpus-f/examples-probe-probe-i-dev-cir | 0 / dc | i(vbb1) | 200 | 7.674597365481348e-8 | 7.674589642990297e-8 | 0.00013871679980351486 | 0.00013871666024052544 | 200 / 0 |
| corpus-f/examples-probe-probe-i-dev-cir | 0 / dc | i(vcc) | 200 | 0.000004098682599610638 | 5.512844037165347e-7 | 0.0008032792652864757 | 0.0003287635701368346 | 200 / 0 |
| corpus-f/examples-probe-probe-i-dev-cir | 0 / dc | i(vcc1) | 200 | 6.003385371287917e-8 | 6.003352650061026e-8 | 0.000006527822016653112 | 0.0000065277864371947865 | 200 / 0 |
| corpus-f/examples-probe-probe-i-dev-cir | 0 / dc | i(vee) | 200 | 0.000004140122758539144 | 5.610302865990292e-7 | 0.9999000120235972 | 0.29512432372882197 | 200 / 0 |
| corpus-f/examples-probe-probe-i-dev-cir | 0 / dc | i(vee1) | 200 | 1.3678066143434087e-7 | 1.3678025689604875e-7 | 0.000014028973337772411 | 0.000014028931846609789 | 200 / 0 |
| corpus-f/examples-probe-probe-i-dev-cir | 0 / dc | i(vss1) | 200 | 8.340460684054211e-13 | 8.340460683761995e-13 | n/a | n/a | 0 / 200 |
| corpus-f/examples-probe-probe-i-dev-cir | 0 / dc | v(1) | 200 | 0 | 0 | 0 | 0 | 200 / 0 |
| corpus-f/examples-probe-probe-i-dev-cir | 0 / dc | v(11) | 200 | 0 | 0 | 0 | 0 | 200 / 0 |
| corpus-f/examples-probe-probe-i-dev-cir | 0 / dc | v(12) | 200 | 0 | 0 | 0 | 0 | 200 / 0 |
| corpus-f/examples-probe-probe-i-dev-cir | 0 / dc | v(2) | 200 | 0 | 0 | 0 | 0 | 199 / 1 |
| corpus-f/examples-probe-probe-i-dev-cir | 0 / dc | v(b) | 200 | 0.000025063992160290205 | 0.00001775489795154418 | 0.000030188573785190523 | 0.000021136728165849546 | 200 / 0 |
| corpus-f/examples-probe-probe-i-dev-cir | 0 / dc | v(b1) | 200 | 0.000023023792096399376 | 0.000023023768928929904 | 0.00002760570255931539 | 0.000027605674780571094 | 200 / 0 |
| corpus-f/examples-probe-probe-i-dev-cir | 0 / dc | v(c) | 200 | 0.0004098682599610881 | 0.00005512844037164891 | 0.0013369247832725566 | 0.00016080800801143532 | 200 / 0 |
| corpus-f/examples-probe-probe-i-dev-cir | 0 / dc | v(c1) | 200 | 0.000006003385371086689 | 0.000006003352649925962 | 0.00007472595888592655 | 0.00007472555157070545 | 200 / 0 |
| corpus-f/examples-probe-probe-i-dev-cir | 0 / dc | v(e) | 200 | 0 | 0 | n/a | n/a | 0 / 200 |
| corpus-f/examples-probe-probe-i-dev-cir | 0 / dc | v(e1) | 200 | 0 | 0 | n/a | n/a | 0 / 200 |
| corpus-f/examples-probe-probe-i-dev-cir | 0 / dc | v(s1) | 200 | 0 | 0 | n/a | n/a | 0 / 200 |
| corpus-f/examples-wave-rcsim-cir | 0 / ac | i(v1) | 50 | 1.7649532655793076e-18 | 7.476279581556576e-19 | 8.041217215787411e-16 | 2.228311676782693e-16 | 50 / 0 |
| corpus-f/examples-wave-rcsim-cir | 0 / ac | v(1) | 50 | 0 | 0 | 0 | 0 | 50 / 0 |
| corpus-f/examples-wave-rcsim-cir | 0 / ac | v(2) | 50 | 3.608224830031759e-16 | 1.2580848049897274e-16 | 2.185873217799128e-15 | 5.416463582006558e-16 | 50 / 0 |
| corpus-f/examples-wave-rcsim-cir | 0 / ac | v(3) | 50 | 5.10280049072227e-16 | 1.5449766374442886e-16 | 3.0123292699621437e-15 | 7.443164051604522e-16 | 50 / 0 |
| corpus-f/examples-xspice-original-examples-arbitrary-phase-deck | 0 / tran | i(v1) | 136 | 0.0000021808953846155278 | 5.131707249326887e-7 | 0.008848696225330605 | 0.001724057828577642 | 136 / 0 |
| corpus-f/examples-xspice-original-examples-arbitrary-phase-deck | 0 / tran | i(v2) | 136 | 4.9873299934333204e-18 | 7.250881418258682e-19 | 4.987329993433295e-15 | 7.265974374704265e-16 | 136 / 0 |
| corpus-f/examples-xspice-original-examples-arbitrary-phase-deck | 0 / tran | v(1) | 136 | 0.0021808953846155776 | 0.0005131707249326863 | 0.008848696225330186 | 0.0017240578285776641 | 136 / 0 |
| corpus-f/examples-xspice-original-examples-arbitrary-phase-deck | 0 / tran | v(2) | 136 | 4.884981308350689e-15 | 7.313599596332163e-16 | 4.884981308350665e-15 | 7.335978823034401e-16 | 136 / 0 |
| corpus-f/examples-xspice-original-examples-spice3-deck | 0 / tran | i(vcc) | 208 | 0.000008422130072654587 | 0.0000026314655733087842 | 0.011633422423033318 | 0.0033718225470831162 | 208 / 0 |
| corpus-f/examples-xspice-original-examples-spice3-deck | 0 / tran | i(vin) | 208 | 5.180098978320292e-7 | 1.6679011085329475e-7 | 1.662246746139718 | 0.11617935645711594 | 207 / 1 |
| corpus-f/examples-xspice-original-examples-spice3-deck | 0 / tran | v(1) | 208 | 0.008377248715270735 | 0.002712894386373608 | 0.1310057001781891 | 0.012878604628279484 | 206 / 2 |
| corpus-f/examples-xspice-original-examples-spice3-deck | 0 / tran | v(base) | 208 | 0.008379703299976171 | 0.0027140542636898642 | 0.00586297149514913 | 0.0017260484485996743 | 208 / 0 |
| corpus-f/examples-xspice-original-examples-spice3-deck | 0 / tran | v(coll) | 208 | 0.03317311571205117 | 0.010368459659543547 | 0.005710640922600744 | 0.0018145853250707024 | 208 / 0 |
| corpus-f/examples-xspice-original-examples-spice3-deck | 0 / tran | v(emit) | 208 | 0.008590994549255604 | 0.0026851677562930135 | 0.015646633586331005 | 0.00420646626691107 | 208 / 0 |
| corpus-f/examples-xspice-original-examples-spice3-deck | 0 / tran | v(vcc) | 208 | 0 | 0 | 0 | 0 | 208 / 0 |
| corpus-f/examples-xspice-various-xspice-c1-cir | 0 / tran | i(vcc) | 208 | 0.000008422130072654587 | 0.0000026314655733087842 | 0.011633422423033318 | 0.0033718225470831162 | 208 / 0 |
| corpus-f/examples-xspice-various-xspice-c1-cir | 0 / tran | i(vin) | 208 | 5.180098978320292e-7 | 1.6679011085329475e-7 | 1.662246746139718 | 0.11617935645711594 | 207 / 1 |
| corpus-f/examples-xspice-various-xspice-c1-cir | 0 / tran | v(1) | 208 | 0.008377248715270735 | 0.002712894386373608 | 0.1310057001781891 | 0.012878604628279484 | 206 / 2 |
| corpus-f/examples-xspice-various-xspice-c1-cir | 0 / tran | v(base) | 208 | 0.008379703299976171 | 0.0027140542636898642 | 0.00586297149514913 | 0.0017260484485996743 | 208 / 0 |
| corpus-f/examples-xspice-various-xspice-c1-cir | 0 / tran | v(coll) | 208 | 0.03317311571205117 | 0.010368459659543547 | 0.005710640922600744 | 0.0018145853250707024 | 208 / 0 |
| corpus-f/examples-xspice-various-xspice-c1-cir | 0 / tran | v(emit) | 208 | 0.008590994549255604 | 0.0026851677562930135 | 0.015646633586331005 | 0.00420646626691107 | 208 / 0 |
| corpus-f/examples-xspice-various-xspice-c1-cir | 0 / tran | v(vcc) | 208 | 0 | 0 | 0 | 0 | 208 / 0 |
| corpus-f/tests-general-rca3040-cir | 0 / ac | i(vcc) | 100 | 7.010503899976799e-9 | 1.5329658428726841e-9 | 0.000008027689513623396 | 0.000002320921181369309 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 0 / ac | i(vee) | 100 | 1.618380639156728e-9 | 3.327245766243744e-10 | 0.000002803339528905475 | 8.382621936685e-7 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 0 / ac | i(vin) | 100 | 2.239575667650218e-9 | 5.644939528667349e-10 | 0.00001956103620357716 | 0.00001567350108836449 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 0 / ac | v(1) | 100 | 0 | 0 | 0 | 0 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 0 / ac | v(10) | 100 | 0.000014914078815519174 | 0.000003568943828689236 | 0.000011668631852997447 | 0.000003711665234454466 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 0 / ac | v(11) | 100 | 0.000014871080992808489 | 0.0000035535584658090615 | 0.000012974013689691753 | 0.0000041416741225231144 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 0 / ac | v(12) | 100 | 4.311385989030738e-7 | 7.372402073647769e-8 | 0.000047547326208052 | 0.00003536587235841353 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 0 / ac | v(13) | 100 | 2.2589439195390832e-7 | 3.8945374491424325e-8 | 0.00004754752980121431 | 0.00003538244163839974 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 0 / ac | v(14) | 100 | 0.00262028464509035 | 0.002221676644683452 | 0.00002336547100491344 | 0.00002029427512961079 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 0 / ac | v(15) | 100 | 0.002620300452349718 | 0.0022216194452886846 | 0.00002336597664004611 | 0.000020419218476750528 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 0 / ac | v(16) | 100 | 0.002622676103301769 | 0.0022236126187406874 | 0.00002349751956187497 | 0.000020541789356492468 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 0 / ac | v(17) | 100 | 0.002622660599486781 | 0.0022236691934587795 | 0.00002349701392720486 | 0.00002041178909522404 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 0 / ac | v(2) | 100 | 0 | 0 | n/a | n/a | 0 / 100 |
| corpus-f/tests-general-rca3040-cir | 0 / ac | v(3) | 100 | 0 | 0 | n/a | n/a | 0 / 100 |
| corpus-f/tests-general-rca3040-cir | 0 / ac | v(30) | 100 | 0.0000022395756676776997 | 5.644939528751045e-7 | 0.000002445180555461344 | 6.64201568911703e-7 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 0 / ac | v(31) | 100 | 0.0000022412500267653174 | 5.521013883038367e-7 | 0.00002425709960017344 | 0.0000203883126216006 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 0 / ac | v(5) | 100 | 0.0000020157384010678574 | 5.178913166428103e-7 | 0.0000022964622803755443 | 8.376611423968107e-7 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 0 / ac | v(6) | 100 | 0.0000019651463826687507 | 4.999135381906185e-7 | 0.00001099551994945828 | 0.000009446096049227524 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 0 / ac | v(7) | 100 | 5.950161876942825e-7 | 8.996879418768438e-8 | 0.000001737523191503645 | 6.582826619537624e-7 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 0 / ac | v(8) | 100 | 8.516825779631144e-7 | 1.805085619016363e-7 | 0.000004514740509696862 | 0.0000024494848766488605 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 0 / ac | v(9) | 100 | 9.786345249225063e-7 | 2.072938845822246e-7 | 0.000005291581966225115 | 0.000004607262540235257 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 1 / dc | i(vcc) | 100 | 1.305224528319604e-7 | 4.2034758941464714e-8 | 0.000005618071149469598 | 0.0000018343437960290947 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 1 / dc | i(vee) | 100 | 3.8208030503361634e-8 | 3.820702260131197e-8 | 0.00000165406905454646 | 0.0000016504763395540772 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 1 / dc | i(vin) | 100 | 5.437604591585193e-11 | 4.599173797713539e-11 | 0.0000018424037463732448 | 0.000001591532249176173 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 1 / dc | v(1) | 100 | 0 | 0 | 0 | 0 | 99 / 1 |
| corpus-f/tests-general-rca3040-cir | 1 / dc | v(10) | 100 | 0.00004363658774209078 | 0.0000231983867929864 | 0.00005262971216321687 | 0.00003090242544302856 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 1 / dc | v(11) | 100 | 0.000048962298643373536 | 0.000023241212680152064 | 0.00006438110843102541 | 0.00003106937703953505 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 1 / dc | v(12) | 100 | 0.00006689982823737672 | 0.00004546897722426274 | 0.00004158941936767576 | 0.000028517723228425876 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 1 / dc | v(13) | 100 | 0.00003344990995091113 | 0.00002273448339043226 | 0.00004158941418573614 | 0.000028517716663707062 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 1 / dc | v(14) | 100 | 0.00010232096353113285 | 0.000039778017796678754 | 0.00010227821262178231 | 0.000027352909242225963 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 1 / dc | v(15) | 100 | 0.0000971313087649861 | 0.000037164800998005925 | 0.00008355431180089337 | 0.00002518909346226348 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 1 / dc | v(16) | 100 | 0.0003556438624037206 | 0.00005703163574728574 | 0.000431720894264182 | 0.00008935113991898266 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 1 / dc | v(17) | 100 | 0.00009630975393370989 | 0.00004031998658618074 | 0.0005343525839620272 | 0.00008961875696220527 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 1 / dc | v(2) | 100 | 0 | 0 | 0 | 0 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 1 / dc | v(3) | 100 | 0 | 0 | 0 | 0 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 1 / dc | v(30) | 100 | 5.437604590902145e-8 | 4.599173798235113e-8 | 0.00005914460896857964 | 0.000006201235309430772 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 1 / dc | v(31) | 100 | 5.432911701769294e-8 | 4.581716172214669e-8 | 0.000001851551235003713 | 0.000001585939683783029 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 1 / dc | v(5) | 100 | 0.000022416913388001447 | 0.00002238730682616119 | 0.00003831769175424887 | 0.000028261340856424126 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 1 / dc | v(6) | 100 | 0.00002240899244498884 | 0.00002238826283639507 | 0.000027095102464929486 | 0.00002705601092029973 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 1 / dc | v(7) | 100 | 0.00004604755990933462 | 0.00004583782214677818 | 0.00003196757220320191 | 0.0000284742498933949 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 1 / dc | v(8) | 100 | 1.280551185089962e-7 | 1.2764525531936766e-7 | 3.049266894550305e-8 | 3.0395765163796026e-8 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 1 / dc | v(9) | 100 | 0.000023469707168821685 | 0.00002346839646285334 | 0.000004646149355032534 | 0.000004646029867942759 | 100 / 0 |
| corpus-f/tests-general-rca3040-cir | 2 / tran | i(vcc) | 108 | 0.0000072890235666527026 | 0.000002583080156281364 | 0.00031396090116106576 | 0.00011115158561338337 | 108 / 0 |
| corpus-f/tests-general-rca3040-cir | 2 / tran | i(vee) | 108 | 0.0000026484662297675265 | 7.857412947055948e-7 | 0.00011437993198687821 | 0.000033934410937209104 | 108 / 0 |
| corpus-f/tests-general-rca3040-cir | 2 / tran | i(vin) | 108 | 0.000004250734214160906 | 0.0000010334743766900866 | 0.14267007599235515 | 0.04613487289487841 | 108 / 0 |
| corpus-f/tests-general-rca3040-cir | 2 / tran | v(1) | 108 | 0.005614993930788286 | 0.0011420229835124314 | 1 | 0.22528016846738744 | 107 / 1 |
| corpus-f/tests-general-rca3040-cir | 2 / tran | v(10) | 108 | 0.004033912714504817 | 0.0020046914799438723 | 0.005532837016845929 | 0.002595519941846063 | 108 / 0 |
| corpus-f/tests-general-rca3040-cir | 2 / tran | v(11) | 108 | 0.004250438029760328 | 0.001954401889982209 | 0.005841632462568288 | 0.0025432672678094665 | 108 / 0 |
| corpus-f/tests-general-rca3040-cir | 2 / tran | v(12) | 108 | 0.0006108897451646556 | 0.00033216813730152804 | 0.00037967025750804416 | 0.0002064437906885557 | 108 / 0 |
| corpus-f/tests-general-rca3040-cir | 2 / tran | v(13) | 108 | 0.00031716578708906873 | 0.0001709659006614791 | 0.00039423321674408846 | 0.00021251491546051576 | 108 / 0 |
| corpus-f/tests-general-rca3040-cir | 2 / tran | v(14) | 108 | 0.16215503845767554 | 0.07739467382640149 | 0.03622816601183333 | 0.01266828802414532 | 108 / 0 |
| corpus-f/tests-general-rca3040-cir | 2 / tran | v(15) | 108 | 0.16582145929905323 | 0.0779803903482487 | 0.02735387876272468 | 0.010677328935867357 | 108 / 0 |
| corpus-f/tests-general-rca3040-cir | 2 / tran | v(16) | 108 | 0.16512567094034658 | 0.07794990001103203 | 0.03142193715645712 | 0.012024817604862282 | 108 / 0 |
| corpus-f/tests-general-rca3040-cir | 2 / tran | v(17) | 108 | 0.16146593830372247 | 0.07730818761510493 | 0.04386195324898964 | 0.01467688397981876 | 108 / 0 |
| corpus-f/tests-general-rca3040-cir | 2 / tran | v(2) | 108 | 0 | 0 | 0 | 0 | 108 / 0 |
| corpus-f/tests-general-rca3040-cir | 2 / tran | v(3) | 108 | 0 | 0 | 0 | 0 | 108 / 0 |
| corpus-f/tests-general-rca3040-cir | 2 / tran | v(30) | 108 | 0.004055584050489915 | 0.0008175780007409072 | 4.963958720815545 | 0.4786909646224495 | 108 / 0 |
| corpus-f/tests-general-rca3040-cir | 2 / tran | v(31) | 108 | 0.002310522857092408 | 0.0007368659527542781 | 3.3547128894523954 | 0.5868315757417571 | 108 / 0 |
| corpus-f/tests-general-rca3040-cir | 2 / tran | v(5) | 108 | 0.004386150701028324 | 0.0008308720678405505 | 0.005355592287560587 | 0.0010204377529795697 | 108 / 0 |
| corpus-f/tests-general-rca3040-cir | 2 / tran | v(6) | 108 | 0.0025301226308349634 | 0.0008012728921690292 | 0.0031291744985781603 | 0.0009738407885318542 | 108 / 0 |
| corpus-f/tests-general-rca3040-cir | 2 / tran | v(7) | 108 | 0.0031814442009561184 | 0.0007320733352288747 | 0.0019286943806678717 | 0.0004447530515989354 | 108 / 0 |
| corpus-f/tests-general-rca3040-cir | 2 / tran | v(8) | 108 | 0.0012598271502541891 | 0.0003297903233440453 | 0.00030054171417014835 | 0.000078545596051846 | 108 / 0 |
| corpus-f/tests-general-rca3040-cir | 2 / tran | v(9) | 108 | 0.0014437035164895917 | 0.00038513724515608935 | 0.00028631025359637774 | 0.00007624687181879852 | 108 / 0 |
| corpus-f/tests-resistance-res-simple-cir | 0 / tran | i(v1) | 59 | 0 | 0 | 0 | 0 | 59 / 0 |
| corpus-f/tests-resistance-res-simple-cir | 0 / tran | v(1) | 59 | 0 | 0 | 0 | 0 | 59 / 0 |
| corpus-g/abm-abs-abs-cir | 0 / dc | i(b1) | 21 | 1.5178830414797062e-17 | 5.830097898277941e-18 | 1.519400924521186e-13 | 7.685040673218067e-14 | 20 / 1 |
| corpus-g/abm-abs-abs-cir | 0 / dc | i(vs) | 21 | 7.169286865560398e-18 | 4.0035820595278425e-18 | 1.0252080217751367e-13 | 5.562186289474077e-14 | 20 / 1 |
| corpus-g/abm-abs-abs-cir | 0 / dc | v(1) | 21 | 0 | 0 | 0 | 0 | 20 / 1 |
| corpus-g/abm-abs-abs-cir | 0 / dc | v(2) | 21 | 1.7763568394002505e-15 | 8.22293433142597e-16 | 3.5562663924793017e-16 | 1.3199215879336783e-16 | 20 / 1 |
| corpus-g/abm-abs-abs-cir | 0 / dc | v(3) | 21 | 0 | 0 | 0 | 0 | 20 / 1 |
| corpus-g/abm-abs-abs-cir | 0 / dc | v(4) | 21 | 1.7763568394002505e-15 | 7.752656836003963e-16 | 3.5562663924793017e-16 | 1.2573300409139671e-16 | 20 / 1 |
| corpus-g/abm-acos-asin-acos-asin-cir | 0 / dc | i(b2) | 198 | 0.0010930580432602088 | 0.00016399670261533773 | 0.0009151425726158148 | 0.00016002933363837413 | 197 / 1 |
| corpus-g/abm-acos-asin-acos-asin-cir | 0 / dc | i(b3) | 198 | 0.0010930580432599868 | 0.00016399670261528507 | 0.0009064737419569941 | 0.00014231133773807375 | 198 / 0 |
| corpus-g/abm-acos-asin-acos-asin-cir | 0 / dc | i(v1) | 198 | 0 | 0 | 0 | 0 | 197 / 1 |
| corpus-g/abm-acos-asin-acos-asin-cir | 0 / dc | v(1) | 198 | 0 | 0 | 0 | 0 | 197 / 1 |
| corpus-g/abm-acos-asin-acos-asin-cir | 0 / dc | v(2) | 198 | 0.0010930580432602088 | 0.00016399670261533773 | 0.0009151425726158148 | 0.00016002933363837413 | 197 / 1 |
| corpus-g/abm-acos-asin-acos-asin-cir | 0 / dc | v(3) | 198 | 0.0010930580432599868 | 0.00016399670261528507 | 0.0009064737419569941 | 0.00014231133773807375 | 198 / 0 |
| corpus-g/abm-db-dbtest-cir | 0 / ac | i(v1) | 20 | 4.577566798522237e-16 | 1.571152242838182e-16 | 9.33624275297068e-16 | 3.797146411121988e-16 | 20 / 0 |
| corpus-g/abm-db-dbtest-cir | 0 / ac | v(a) | 20 | 0 | 0 | 0 | 0 | 20 / 0 |
| corpus-g/abm-db-dbtest-cir | 0 / ac | v(b) | 20 | 2.2887833992611187e-16 | 7.555581317987742e-17 | 5.522400810920814e-16 | 2.1097861667816666e-16 | 20 / 0 |
| corpus-g/abm-expln-exp-ln-cir | 0 / tran | i(b2) | 145 | 18.540428694515867 | 1.776715416934211 | 0.0009750405888556968 | 0.0002066560156396896 | 145 / 0 |
| corpus-g/abm-expln-exp-ln-cir | 0 / tran | i(b3) | 145 | 0.000014402319877149239 | 0.000009356832106825904 | 0.000003969584805348273 | 0.0000016016502834164059 | 145 / 0 |
| corpus-g/abm-expln-exp-ln-cir | 0 / tran | i(vs) | 145 | 3.552713678800501e-15 | 1.166818372331678e-15 | 4.1552206769596475e-16 | 1.435485649024976e-16 | 145 / 0 |
| corpus-g/abm-expln-exp-ln-cir | 0 / tran | v(1) | 145 | 3.552713678800501e-15 | 1.166818372331678e-15 | 4.1552206769596475e-16 | 1.435485649024976e-16 | 145 / 0 |
| corpus-g/abm-expln-exp-ln-cir | 0 / tran | v(2) | 145 | 18.540428694515867 | 1.776715416934211 | 0.0009750405888556968 | 0.0002066560156396896 | 145 / 0 |
| corpus-g/abm-expln-exp-ln-cir | 0 / tran | v(3) | 145 | 0.000014402319877149239 | 0.000009356832106825904 | 0.000003969584805348273 | 0.0000016016502834164059 | 145 / 0 |
| corpus-g/abm-freq-rc-simple-hertz-cir | 0 / ac | v(1) | 5 | 8.286281022897839e-14 | 4.214123537266209e-14 | 1.0445765867736689e-15 | 6.109255828693064e-16 | 5 / 0 |
| corpus-g/abm-func-func-cir | 0 / tran | i(bf) | 111 | 4.7117525420540005 | 2.236176948804859 | 1 | 0.09492320430280855 | 111 / 0 |
| corpus-g/abm-func-func-cir | 0 / tran | i(vx) | 111 | 1.1368683772161603e-12 | 4.866220065047855e-13 | 1 | 0.0949157995752499 | 111 / 0 |
| corpus-g/abm-func-func-cir | 0 / tran | i(vy) | 111 | 1.1368683772161603e-12 | 4.559870355079114e-13 | 1 | 0.0949157995752499 | 111 / 0 |
| corpus-g/abm-func-func-cir | 0 / tran | i(vz) | 111 | 1.0231815394945443e-12 | 3.1662869632363973e-13 | 1.008060630043888e-15 | 1.7227699662292634e-16 | 111 / 0 |
| corpus-g/abm-func-func-cir | 0 / tran | v(f) | 111 | 0.004711752542053915 | 0.0022361769488049676 | 1 | 0.09492320430280855 | 111 / 0 |
| corpus-g/abm-func-func-cir | 0 / tran | v(x) | 111 | 1.1102230246251565e-15 | 4.77438221895147e-16 | 3.1918911957977315e-14 | 3.5509273210402377e-15 | 110 / 1 |
| corpus-g/abm-func-func-cir | 0 / tran | v(y) | 111 | 1.1102230246251565e-15 | 4.526035538635646e-16 | 3.1918911957977315e-14 | 3.5494901349016215e-15 | 110 / 1 |
| corpus-g/abm-func-func-cir | 0 / tran | v(z) | 111 | 1.1102230246251565e-15 | 3.097459322200694e-16 | 1.0778864316749125e-15 | 2.0370553382846536e-16 | 111 / 0 |
| corpus-g/abm-int-floor-ceil-int-floor-ceil-cir | 0 / tran | i(v1) | 5000008 | 0.0019605657274972543 | 0.0005964195629109676 | 1.7414825704900623 | 0.000930990031900421 | 5000007 / 1 |
| corpus-g/abm-int-floor-ceil-int-floor-ceil-cir | 0 / tran | v(1) | 5000008 | 0.0019605657274972543 | 0.0005964195629109676 | 1.7414825704900623 | 0.000930990031900421 | 5000007 / 1 |
| corpus-g/abm-log-log-cir | 0 / tran | i(b3) | 71 | 7.332216548688359 | 4.030401994780503 | 4.609818646669683 | 1.4170216267704245 | 70 / 1 |
| corpus-g/abm-log-log-cir | 0 / tran | i(b4) | 71 | 1.4553409345513422 | 0.9529311605411079 | 1.3388580398344534 | 1.3065927434109925 | 70 / 1 |
| corpus-g/abm-log-log-cir | 0 / tran | i(v1) | 71 | 5.093170329928398e-11 | 1.685938180221642e-11 | 6.062550297282841e-15 | 9.888219516872469e-16 | 71 / 0 |
| corpus-g/abm-log-log-cir | 0 / tran | i(v2) | 71 | 7.105427357601002e-15 | 1.5268160679352971e-15 | 5.868131773217986e-16 | 1.576138519607144e-16 | 71 / 0 |
| corpus-g/abm-log-log-cir | 0 / tran | v(1) | 71 | 5.093170329928398e-11 | 1.685938180221642e-11 | 6.062550297282841e-15 | 9.888219516872469e-16 | 71 / 0 |
| corpus-g/abm-log-log-cir | 0 / tran | v(2) | 71 | 7.105427357601002e-15 | 1.5268160679352971e-15 | 5.868131773217986e-16 | 1.576138519607144e-16 | 71 / 0 |
| corpus-g/abm-log-log-cir | 0 / tran | v(3) | 71 | 7.332216548688359 | 4.030401994780503 | 4.609818646669683 | 1.4170216267704245 | 70 / 1 |
| corpus-g/abm-log-log-cir | 0 / tran | v(4) | 71 | 1.4553409345513422 | 0.9529311605411079 | 1.3388580398344534 | 1.3065927434109925 | 70 / 1 |
| corpus-g/abm-nint-fmod-fmod-cir | 0 / dc | i(v1) | 19 | 0 | 0 | 0 | 0 | 19 / 0 |
| corpus-g/abm-nint-fmod-fmod-cir | 0 / dc | v(1) | 19 | 0 | 0 | 0 | 0 | 19 / 0 |
| corpus-g/abm-pow-abmpow1-cir | 0 / dc | i(b4) | 50 | 2.220446049250313e-15 | 8.673950565292077e-16 | 9.887923813067485e-15 | 2.012298297738474e-15 | 49 / 1 |
| corpus-g/abm-pow-abmpow1-cir | 0 / dc | i(vs) | 50 | 0 | 0 | 0 | 0 | 50 / 0 |
| corpus-g/abm-pow-abmpow1-cir | 0 / dc | v(1) | 50 | 0 | 0 | 0 | 0 | 50 / 0 |
| corpus-g/abm-pow-abmpow1-cir | 0 / dc | v(4) | 50 | 2.220446049250313e-15 | 8.673950565292077e-16 | 9.887923813067485e-15 | 2.012298297738474e-15 | 49 / 1 |
| corpus-g/abm-sct-sct-cir | 0 / dc | i(b2) | 66 | 6.661338147750939e-16 | 2.419192545127102e-16 | 1.3016476718549112e-14 | 2.329910608993221e-15 | 65 / 1 |
| corpus-g/abm-sct-sct-cir | 0 / dc | i(b3) | 66 | 8.881784197001252e-16 | 2.507254233748302e-16 | 2.0583685377556767e-14 | 2.7972269722762653e-15 | 66 / 0 |
| corpus-g/abm-sct-sct-cir | 0 / dc | i(b4) | 66 | 5.002220859751105e-12 | 6.708055517758422e-13 | 1.6429732130436204e-13 | 2.233514180295728e-14 | 65 / 1 |
| corpus-g/abm-sct-sct-cir | 0 / dc | i(b5) | 66 | 0.06493247116117118 | 0.007999167357891584 | 0.0008044882714192037 | 0.00010151307923992795 | 65 / 1 |
| corpus-g/abm-sct-sct-cir | 0 / dc | i(vs) | 66 | 0 | 0 | 0 | 0 | 65 / 1 |
| corpus-g/abm-sct-sct-cir | 0 / dc | v(1) | 66 | 0 | 0 | 0 | 0 | 65 / 1 |
| corpus-g/abm-sct-sct-cir | 0 / dc | v(2) | 66 | 6.661338147750939e-16 | 2.419192545127102e-16 | 1.3016476718549112e-14 | 2.329910608993221e-15 | 65 / 1 |
| corpus-g/abm-sct-sct-cir | 0 / dc | v(3) | 66 | 8.881784197001252e-16 | 2.507254233748302e-16 | 2.0583685377556767e-14 | 2.7972269722762653e-15 | 66 / 0 |
| corpus-g/abm-sct-sct-cir | 0 / dc | v(4) | 66 | 5.002220859751105e-12 | 6.708055517758422e-13 | 1.6429732130436204e-13 | 2.233514180295728e-14 | 65 / 1 |
| corpus-g/abm-sct-sct-cir | 0 / dc | v(5) | 66 | 0.06493247116117118 | 0.007999167357891584 | 0.0008044882714192037 | 0.00010151307923992795 | 65 / 1 |
| corpus-g/abm-sqrt-sqrt-cir | 0 / tran | i(b2) | 90 | 5065.24818366002 | 668.4635417202037 | 1.0412414523193156 | 0.12101018736324205 | 89 / 1 |
| corpus-g/abm-sqrt-sqrt-cir | 0 / tran | i(b3) | 90 | 5952913.522367477 | 714422.1768900447 | 0.0009857535936925099 | 0.00017351015275441498 | 89 / 1 |
| corpus-g/abm-sqrt-sqrt-cir | 0 / tran | i(vs) | 90 | 0.0000019073486328125 | 2.4751716603462557e-7 | 1.5521535873419404e-15 | 2.224368971881248e-16 | 89 / 1 |
| corpus-g/abm-sqrt-sqrt-cir | 0 / tran | v(1) | 90 | 0.0000019073486328125 | 2.4751716603462557e-7 | 1.5521535873419404e-15 | 2.224368971881248e-16 | 89 / 1 |
| corpus-g/abm-sqrt-sqrt-cir | 0 / tran | v(2) | 90 | 5065.24818366002 | 668.4635417202037 | 1.0412414523193156 | 0.12101018736324205 | 89 / 1 |
| corpus-g/abm-sqrt-sqrt-cir | 0 / tran | v(3) | 90 | 5952913.522367477 | 714422.1768900447 | 0.0009857535936925099 | 0.00017351015275441498 | 89 / 1 |
| corpus-g/abm-time-time-cir | 0 / tran | i(b2) | 73 | 0.000006829583312897847 | 0.0000021291331342296745 | 0.88 | 0.16453897236519474 | 60 / 13 |
| corpus-g/abm-time-time-cir | 0 / tran | i(vs) | 73 | 3.469446951953614e-18 | 1.1161872097786704e-18 | 5.178279032766593e-16 | 1.8530456835061298e-16 | 60 / 13 |
| corpus-g/abm-time-time-cir | 0 / tran | v(1) | 73 | 3.552713678800501e-15 | 9.349550290873122e-16 | 5.302557729552991e-16 | 1.5813781650235115e-16 | 60 / 13 |
| corpus-g/abm-time-time-cir | 0 / tran | v(2) | 73 | 0.006829583312896403 | 0.0021291331342302377 | 0.88 | 0.16453897236519474 | 60 / 13 |
| corpus-g/abm-ddt-cir | 0 / tran | i(v1) | 25008 | 3.015928947466512 | 0.035335473436368094 | 24.000000004109467 | 0.17234522332190613 | 25007 / 1 |
| corpus-g/abm-ddt-cir | 0 / tran | v(1) | 25008 | 0.00003648139676717954 | 0.000008321006318473751 | 0.000424703111273235 | 0.00008606126198165389 | 25007 / 1 |
| corpus-g/actests-bsim3-gain-stage-cir | 0 / ac | i(vdd1) | 70 | 0.0000119375832144444 | 0.000011902562589681408 | 287000.9195144816 | 182201.98755719664 | 70 / 0 |
| corpus-g/actests-bsim3-gain-stage-cir | 0 / ac | i(vin) | 70 | 7.608127876698041e-7 | 2.446070487549525e-7 | 0.8671794303376288 | 0.864010087273425 | 70 / 0 |
| corpus-g/actests-bsim3-gain-stage-cir | 0 / ac | v(1) | 70 | 0 | 0 | 0 | 0 | 70 / 0 |
| corpus-g/actests-bsim3-gain-stage-cir | 0 / ac | v(2) | 70 | 0.0760812787669804 | 0.02446070487549525 | 2.7175876839849824 | 0.5555721085517143 | 70 / 0 |
| corpus-g/actests-bsim3-gain-stage-cir | 0 / ac | v(3) | 70 | 0.29843958036111 | 0.29756406474203506 | 287000.9195144817 | 182201.9875571967 | 70 / 0 |
| corpus-g/actests-bsim3-gain-stage-cir | 0 / ac | v(vdd) | 70 | 0 | 0 | n/a | n/a | 0 / 70 |
| corpus-g/bjt-extnode-npn-rb-rc-re-1-cir | 0 / dc | i(vcc) | 12 | 9.713341588468618e-8 | 3.201510708558981e-8 | 0.00010119727982949394 | 0.000037916129384590316 | 12 / 0 |
| corpus-g/bjt-extnode-npn-rb-rc-re-1-cir | 0 / dc | i(vmon1) | 12 | 1.6092576271899172e-9 | 6.093114124730731e-10 | 0.00019519221461040511 | 0.00008187849784397957 | 12 / 0 |
| corpus-g/bjt-extnode-npn-rb-rc-re-1-cir | 0 / dc | i(vmon2) | 12 | 9.591363558318199e-8 | 3.173640603993219e-8 | 0.00010058130844207447 | 0.000037800574664691176 | 12 / 0 |
| corpus-g/bjt-extnode-npn-rb-rc-re-1-cir | 0 / dc | v(1) | 12 | 0.0006066901255452617 | 0.00022971040238365433 | 0.0009288499627884972 | 0.00035330479320226627 | 12 / 0 |
| corpus-g/bjt-extnode-npn-rb-rc-re-1-cir | 0 / dc | v(2) | 12 | 0.00019182727135880207 | 0.00006347281212310042 | 0.00017553516430804232 | 0.000058413531463365915 | 12 / 0 |
| corpus-g/bjt-extnode-npn-rb-rc-re-1-cir | 0 / dc | v(3) | 12 | 0.00019182727135880207 | 0.00006347281212310042 | 0.00017553516430804232 | 0.000058413531463365915 | 12 / 0 |
| corpus-g/bjt-extnode-npn-rb-rc-re-1-cir | 0 / dc | v(4) | 12 | 0 | 0 | 0 | 0 | 12 / 0 |
| corpus-g/bjt-extnode-npn-rb-rc-re-1-cir | 0 / dc | v(5) | 12 | 0.0006066901255452617 | 0.00022971040238365433 | 0.0009288499627884972 | 0.00035330479320226627 | 12 / 0 |
| corpus-g/bjt-ic-bjt-ic-nonzero-cir | 0 / dc | i(vb) | 10 | 3.3266165295130955e-11 | 2.410379017997285e-11 | 4.9103774406815734 | 4.145532870422393 | 10 / 0 |
| corpus-g/bjt-ic-bjt-ic-nonzero-cir | 0 / dc | i(vc) | 10 | 4.894220216000124e-12 | 2.6889743762528964e-12 | 0.24302669470135013 | 0.13737068127194393 | 10 / 0 |
| corpus-g/bjt-ic-bjt-ic-nonzero-cir | 0 / dc | i(vic) | 10 | 4.894221304238835e-12 | 2.6889749434972626e-12 | 0.24302674873877492 | 0.1373707103477958 | 10 / 0 |
| corpus-g/bjt-ic-bjt-ic-nonzero-cir | 0 / dc | v(1) | 10 | 0 | 0 | 0 | 0 | 10 / 0 |
| corpus-g/bjt-ic-bjt-ic-nonzero-cir | 0 / dc | v(3) | 10 | 1.6633077137839791e-9 | 1.2051894517048193e-9 | 6.606437620612658e-10 | 3.0822204556230374e-10 | 10 / 0 |
| corpus-g/bjt-ic-bjt-ic-nonzero-cir | 0 / dc | v(4) | 10 | 0 | 0 | 0 | 0 | 10 / 0 |
| corpus-g/bjt-ic-bjt-ic-nonzero-cir | 0 / dc | v(5) | 10 | 18.370943869168883 | 15.877918966158123 | 1.374664603831437 | 1.2143051290021223 | 10 / 0 |
| corpus-g/bjt-ic-bjt-ic-nonzero-cir | 0 / dc | v(6) | 10 | 4.89421836391557e-9 | 2.6889734845012566e-9 | 3.262812246990947e-10 | 1.7926489920102777e-10 | 10 / 0 |
| corpus-g/bjt-ic-bjt-ic-nonzero-cir | 0 / dc | v(7) | 10 | 4.89421836391557e-9 | 2.6889734845012566e-9 | 3.262812246990947e-10 | 1.7926489920102777e-10 | 10 / 0 |
| corpus-g/bjt-pspice-nk-bjt-test-nk-cir | 0 / dc | i(vbb) | 16 | 0.000057068974331303535 | 0.000018208592515809114 | 0.014093834863745613 | 0.0036158128558024766 | 16 / 0 |
| corpus-g/bjt-pspice-nk-bjt-test-nk-cir | 0 / dc | i(vmon1) | 16 | 0.000011561739516670333 | 0.000003854259461820819 | 0.24183096529936185 | 0.06580633489321355 | 16 / 0 |
| corpus-g/bjt-pspice-nk-bjt-test-nk-cir | 0 / dc | i(vmon2) | 16 | 0.00005660715582359033 | 0.000016664000459038408 | 0.0008280222729810487 | 0.00047687385886687064 | 16 / 0 |
| corpus-g/bjt-pspice-nk-bjt-test-nk-cir | 0 / dc | v(1) | 16 | 0 | 0 | 0 | 0 | 16 / 0 |
| corpus-g/bjt-pspice-nk-bjt-test-nk-cir | 0 / dc | v(2) | 16 | 0 | 0 | 0 | 0 | 16 / 0 |
| corpus-g/bjt-pspice-nk-bjt-test-nk-cir | 0 / dc | v(6) | 16 | 0 | 0 | 0 | 0 | 16 / 0 |
| corpus-g/bsrc-bsrc-a1-cir | 0 / dc | i(b1) | 51 | 0.000020000000000013063 | 0.000012524485821703783 | 0.000974658869395333 | 0.0004038108138442559 | 51 / 0 |
| corpus-g/bsrc-bsrc-a1-cir | 0 / dc | i(v1) | 51 | 1.0842021724855044e-19 | 3.7054428916961105e-20 | 4.517509052022934e-16 | 1.4591802105507417e-16 | 50 / 1 |
| corpus-g/bsrc-bsrc-a1-cir | 0 / dc | v(1) | 51 | 0 | 0 | 0 | 0 | 50 / 1 |
| corpus-g/bsrc-bsrc-a1-cir | 0 / dc | v(2) | 51 | 0.20000000000015916 | 0.12524485821704415 | 0.0009746588693953785 | 0.0004038108138442672 | 51 / 0 |
| corpus-g/bug-139-in-line-comment-cir | 0 / dc | i(vdd) | 1 | 2.9152661187858975e-12 | 2.9152661187858975e-12 | 1.5130964592126171e-9 | 1.5130964592126171e-9 | 1 / 0 |
| corpus-g/bug-139-in-line-comment-cir | 0 / dc | i(vmon) | 1 | 2.915266769307201e-12 | 2.915266769307201e-12 | 1.513301694671762e-9 | 1.513301694671762e-9 | 1 / 0 |
| corpus-g/bug-139-in-line-comment-cir | 0 / dc | v(1) | 1 | 8.881784197001252e-16 | 8.881784197001252e-16 | 1.547583610083552e-16 | 1.547583610083552e-16 | 1 / 0 |
| corpus-g/bug-139-in-line-comment-cir | 0 / dc | v(2) | 1 | 1.4576327922455334e-9 | 1.4576327922455334e-9 | 1.5133010796391063e-9 | 1.5133010796391063e-9 | 1 / 0 |
| corpus-g/bug-139-in-line-comment-cir | 0 / dc | v(3) | 1 | 6.413587883002947e-9 | 6.413587883002947e-9 | 4.660408285626983e-10 | 4.660408285626983e-10 | 1 / 0 |
| corpus-g/bug-139-in-line-comment-cir | 0 / dc | v(4) | 1 | 6.413587883002947e-9 | 6.413587883002947e-9 | 4.660408285626983e-10 | 4.660408285626983e-10 | 1 / 0 |
| corpus-g/bug-139-in-line-comment-cir | 0 / dc | v(5) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-g/bug-374-capacitor-bug-cir | 0 / tran | i(vin) | 20017 | 0.000008633829560695673 | 8.764935913783314e-8 | 11.753334827017333 | 1.011055133378629 | 10008 / 10009 |
| corpus-g/bug-374-capacitor-bug-cir | 0 / tran | i(vmon) | 20017 | 0.000008633829560695646 | 8.764935913783304e-8 | 11.753334827824924 | 1.0110551254088045 | 10008 / 10009 |
| corpus-g/bug-374-capacitor-bug-cir | 0 / tran | v(1) | 20017 | 5.082212428675348e-12 | 6.887426615137551e-14 | 1.1458761446806486e-10 | 1.488250662520512e-12 | 10009 / 10008 |
| corpus-g/bug-374-capacitor-bug-cir | 0 / tran | v(2) | 20017 | 0.008633829560695583 | 0.00008764935913775799 | 0.9310896666044844 | 0.00936057398726183 | 10009 / 10008 |
| corpus-g/bug-374-capacitor-bug-cir | 0 / tran | v(3) | 20017 | 0.008633829560695583 | 0.00008764935913775799 | 0.9310896666044844 | 0.00936057398726183 | 10009 / 10008 |
| corpus-g/cccs-ftest-cir | 0 / tran | i(vmon) | 115 | 5.0000000000000036 | 3.0270339909899757 | 1 | 1 | 115 / 0 |
| corpus-g/cccs-ftest-cir | 0 / tran | i(vmona) | 115 | 5.0000000000000036 | 3.0270339909899757 | 1 | 1 | 115 / 0 |
| corpus-g/cccs-ftest-cir | 0 / tran | v(1) | 115 | 2500.0000000000023 | 1513.5169954949877 | 1 | 1 | 115 / 0 |
| corpus-g/cccs-ftest-cir | 0 / tran | v(1a) | 115 | 2500.0000000000023 | 1513.5169954949877 | 1 | 1 | 115 / 0 |
| corpus-g/cccs-ftest-cir | 0 / tran | v(2) | 115 | 2500.0000000000023 | 1513.5169954949877 | 1 | 1 | 115 / 0 |
| corpus-g/cccs-ftest-cir | 0 / tran | v(2a) | 115 | 2500.0000000000023 | 1513.5169954949877 | 1 | 1 | 115 / 0 |
| corpus-g/circuitsim90-bjt-vreg-cir | 0 / op | i(vcc) | 1 | 2.1095280009810305e-28 | 2.1095280009810305e-28 | n/a | n/a | 0 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 0 / op | v(1) | 1 | 1.053941495272837e-27 | 1.053941495272837e-27 | n/a | n/a | 0 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 0 / op | v(10) | 1 | 2.3244397463627822e-20 | 2.3244397463627822e-20 | n/a | n/a | 0 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 0 / op | v(11) | 1 | 1.8421444661215133e-28 | 1.8421444661215133e-28 | n/a | n/a | 0 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 0 / op | v(12) | 1 | 8.296510833455142e-20 | 8.296510833455142e-20 | n/a | n/a | 0 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 0 / op | v(13) | 1 | 1.0452028384865722e-19 | 1.0452028384865722e-19 | n/a | n/a | 0 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 0 / op | v(14) | 1 | 5.785574372142018e-27 | 5.785574372142018e-27 | n/a | n/a | 0 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 0 / op | v(15) | 1 | 6.331872790385847e-27 | 6.331872790385847e-27 | n/a | n/a | 0 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 0 / op | v(16) | 1 | 1.927731715931916e-19 | 1.927731715931916e-19 | n/a | n/a | 0 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 0 / op | v(17) | 1 | 1.8061002035728127e-26 | 1.8061002035728127e-26 | n/a | n/a | 0 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 0 / op | v(18) | 1 | 5.094048105436903e-19 | 5.094048105436903e-19 | n/a | n/a | 0 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 0 / op | v(19) | 1 | 1.8000646259060813e-26 | 1.8000646259060813e-26 | n/a | n/a | 0 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 0 / op | v(2) | 1 | 1.0523710322889679e-27 | 1.0523710322889679e-27 | n/a | n/a | 0 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 0 / op | v(3) | 1 | 1.0683169718185351e-27 | 1.0683169718185351e-27 | n/a | n/a | 0 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 0 / op | v(4) | 1 | 1.2236857986470657e-20 | 1.2236857986470657e-20 | n/a | n/a | 0 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 0 / op | v(5) | 1 | 2.8466638594428944e-20 | 2.8466638594428944e-20 | n/a | n/a | 0 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 0 / op | v(6) | 1 | 7.035320341572992e-20 | 7.035320341572992e-20 | n/a | n/a | 0 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 0 / op | v(7) | 1 | 0 | 0 | n/a | n/a | 0 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 0 / op | v(8) | 1 | 5.094048099646931e-19 | 5.094048099646931e-19 | n/a | n/a | 0 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 0 / op | v(9) | 1 | 2.4242058140624147e-27 | 2.4242058140624147e-27 | n/a | n/a | 0 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 1 / dc | i(vcc) | 16 | 0.002431922630837635 | 0.0007024832004158277 | 0.052076117944702974 | 0.013885940866575254 | 15 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 1 / dc | v(1) | 16 | 0.006082684556890872 | 0.0015306831513716718 | 0.05207612255715121 | 0.013732453847235752 | 15 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 1 / dc | v(10) | 16 | 0.0013814931475035763 | 0.0005861311793052286 | 0.0014575464211118248 | 0.00043538790873949514 | 15 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 1 / dc | v(11) | 16 | 0.0014606200546170012 | 0.0006060472044378131 | 0.0014697999374252194 | 0.0004426258379406186 | 15 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 1 / dc | v(12) | 16 | 0.06552574850885184 | 0.01735161752824131 | 0.04062696679512976 | 0.013811730053485611 | 15 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 1 / dc | v(13) | 16 | 0.032411023718915466 | 0.010691854287866153 | 0.03788858281240607 | 0.010985882284309571 | 15 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 1 / dc | v(14) | 16 | 0.006082717812268323 | 0.001977719007844006 | 0.05207761305280803 | 0.013809671454149226 | 15 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 1 / dc | v(15) | 16 | 0.00608272028942991 | 0.0020629457044588225 | 0.0520777261861583 | 0.013822254440476058 | 15 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 1 / dc | v(16) | 16 | 0.0030882401884680943 | 0.0008832588871479634 | 0.008530283284416207 | 0.0022214630841209805 | 15 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 1 / dc | v(17) | 16 | 0.010584767380869442 | 0.003508621392927655 | 0.03415303267376386 | 0.008956687775152317 | 15 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 1 / dc | v(18) | 16 | 0.01145610412002318 | 0.0037051382925293473 | 0.011917008439174055 | 0.003261078439976133 | 15 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 1 / dc | v(19) | 16 | 0.010584827971401756 | 0.0035209787319946547 | 0.03430010060647124 | 0.008997276756428496 | 15 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 1 / dc | v(2) | 16 | 0.006538547632329861 | 0.0022542734260561086 | 0.052076122062701534 | 0.013814719994624976 | 15 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 1 / dc | v(3) | 16 | 0.006567509263755378 | 0.0022646676072054115 | 0.010507437409563305 | 0.00383472665685951 | 15 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 1 / dc | v(4) | 16 | 0.008699807051311126 | 0.0030605236244868666 | 0.0066888800823315855 | 0.0021851713957823614 | 15 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 1 / dc | v(5) | 16 | 0.00292714784473036 | 0.0012310137035393507 | 0.002151821928763382 | 0.0008420015805580798 | 15 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 1 / dc | v(6) | 16 | 0.0021364468647830925 | 0.0008867628038621953 | 0.007563983210569502 | 0.0020137239920034918 | 15 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 1 / dc | v(7) | 16 | 0 | 0 | 0 | 0 | 15 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 1 / dc | v(8) | 16 | 0.011541542672204086 | 0.0037315149394899997 | 0.011974410928782573 | 0.003275508573707807 | 15 / 1 |
| corpus-g/circuitsim90-bjt-vreg-cir | 1 / dc | v(9) | 16 | 0.0006449639073807245 | 0.00020953393598863501 | 0.002733076453249466 | 0.0007096386788747007 | 15 / 1 |
| corpus-g/comparator-comparator-cir | 0 / tran | i(va) | 121 | 0.0009391179374612083 | 0.00029496639305248934 | 7551532.629339515 | 938237.0554923051 | 102 / 19 |
| corpus-g/comparator-comparator-cir | 0 / tran | i(vb) | 121 | 0.00011361258628172447 | 0.000018707524644166943 | 1116.083238249693 | 342.12873202905973 | 102 / 19 |
| corpus-g/comparator-comparator-cir | 0 / tran | i(vdd) | 121 | 0.0008607599790440222 | 0.00026132358261820736 | 15.039210218047037 | 4.697676358795736 | 121 / 0 |
| corpus-g/comparator-comparator-cir | 0 / tran | v(1) | 121 | 1.344652892270279 | 0.3255382189075656 | 26901940.289215002 | 4101307.207272709 | 86 / 35 |
| corpus-g/comparator-comparator-cir | 0 / tran | v(2) | 121 | 3.9593737695110933 | 2.038969704217979 | 283.372421522546 | 37.49690436565585 | 121 / 0 |
| corpus-g/comparator-comparator-cir | 0 / tran | v(3) | 121 | 2.4002137018358236 | 1.0665055734504088 | 7.294522027479594 | 2.992855990719664 | 121 / 0 |
| corpus-g/comparator-comparator-cir | 0 / tran | v(8) | 121 | 5.014521001251846 | 2.5326972758958646 | 40613889.73862148 | 5340247.5688295 | 121 / 0 |
| corpus-g/comparator-comparator-cir | 0 / tran | v(9) | 121 | 5.068886996556126 | 1.948931548158602 | 49321.98815177611 | 5471.069213148664 | 121 / 0 |
| corpus-g/comparator-comparator-cir | 0 / tran | v(a) | 121 | 6.623590564913684e-13 | 9.49121818320599e-14 | 1 | 0.1767766952966369 | 64 / 57 |
| corpus-g/comparator-comparator-cir | 0 / tran | v(anot) | 121 | 5.544810507891885 | 1.8714950152697738 | 2404.779600609146 | 366.11067204570935 | 121 / 0 |
| corpus-g/comparator-comparator-cir | 0 / tran | v(aorbnot) | 121 | 0.13055046807506354 | 0.035292445703592974 | 0.02543227738739786 | 0.006971792748157638 | 121 / 0 |
| corpus-g/comparator-comparator-cir | 0 / tran | v(b) | 121 | 0 | 0 | n/a | n/a | 0 / 121 |
| corpus-g/comparator-comparator-cir | 0 / tran | v(bnot) | 121 | 0.2556326458817155 | 0.05844150510081556 | 0.053946079140718445 | 0.012081798440296493 | 121 / 0 |
| corpus-g/comparator-comparator-cir | 0 / tran | v(e1) | 121 | 0 | 0 | 0 | 0 | 121 / 0 |
| corpus-g/comparator-comparator-cir | 0 / tran | v(lnot) | 121 | 3.9800410198048968 | 1.64236848014969 | 20.17320502910559 | 7.161696916826055 | 121 / 0 |
| corpus-g/comparator-comparator-cir | 0 / tran | v(qnot) | 121 | 3.2927449679939156 | 1.9244699107051029 | 5.534685889525528 | 3.1783319204500717 | 121 / 0 |
| corpus-g/complex-num-test1-cir | 0 / ac | v(1) | 50 | 2.3437142008433856e-13 | 8.910373796107343e-14 | 4.830009854272977e-14 | 9.697444417273922e-15 | 50 / 0 |
| corpus-g/diode-cmc-diodeclipper-ac-cir | 0 / ac | i(vcc) | 31 | 3.050193999254352e-7 | 2.808567158544836e-7 | 0.001793397666054535 | 0.0016488221031441307 | 31 / 0 |
| corpus-g/diode-cmc-diodeclipper-ac-cir | 0 / ac | i(vin) | 31 | 4.125259412970307e-7 | 2.1152857998624651e-7 | 0.0009378698235288499 | 0.0004816919983612066 | 31 / 0 |
| corpus-g/diode-cmc-diodeclipper-ac-cir | 0 / ac | v(1) | 31 | 0 | 0 | n/a | n/a | 0 / 31 |
| corpus-g/diode-cmc-diodeclipper-ac-cir | 0 / ac | v(2) | 31 | 0.00041252594129700016 | 0.0002115285799862432 | 0.0007364613138547444 | 0.00037712325584159616 | 31 / 0 |
| corpus-g/diode-cmc-diodeclipper-ac-cir | 0 / ac | v(3) | 31 | 0 | 0 | 0 | 0 | 31 / 0 |
| corpus-g/diode-cmc-diodeclipper-ac-cir | 0 / ac | v(4) | 31 | 0.0004125259412969197 | 0.0002100276997242068 | 0.0007364613138547355 | 0.00037712325584161063 | 31 / 0 |
| corpus-g/diode-diode-with-sidewall-fcs-cir | 0 / dc | i(vin) | 60 | 0.00003047192323839265 | 0.000005591500747624041 | 0.001001267246592247 | 0.00031026524205993037 | 59 / 1 |
| corpus-g/diode-diode-with-sidewall-fcs-cir | 0 / dc | i(vmon) | 60 | 0.00003047192323839265 | 0.000005591500747624041 | 0.001001267246592247 | 0.00031026524205993037 | 59 / 1 |
| corpus-g/diode-diode-with-sidewall-fcs-cir | 0 / dc | v(1) | 60 | 0 | 0 | 0 | 0 | 60 / 0 |
| corpus-g/diode-diode-with-sidewall-fcs-cir | 0 / dc | v(2) | 60 | 0 | 0 | 0 | 0 | 60 / 0 |
| corpus-g/ekv26-inverter-transient-ekv26-cir | 0 / tran | i(vdd) | 507 | 0.00005392056560464557 | 0.00002165471266584738 | 0.92575245451659 | 0.4853989463177297 | 507 / 0 |
| corpus-g/ekv26-inverter-transient-ekv26-cir | 0 / tran | i(vsig) | 507 | 6.746622771442752e-8 | 4.057471318300576e-8 | 1 | 1 | 506 / 1 |
| corpus-g/ekv26-inverter-transient-ekv26-cir | 0 / tran | v(1) | 507 | 2.1019879590237687 | 0.6321870630153172 | 0.8527956374249166 | 0.4044983134407916 | 507 / 0 |
| corpus-g/ekv26-inverter-transient-ekv26-cir | 0 / tran | v(supply) | 507 | 0 | 0 | 0 | 0 | 507 / 0 |
| corpus-g/ekv26-inverter-transient-ekv26-cir | 0 / tran | v(vi) | 507 | 0.005450347785455278 | 0.0020103070971168664 | 0.01872116820863188 | 0.0020988271967735954 | 506 / 1 |
| corpus-g/expprint-expprint-cir | 0 / dc | i(vt1) | 70 | 1.3877787807814457e-17 | 4.320126356458786e-18 | 6.67201336914157e-16 | 1.785770157439012e-16 | 69 / 1 |
| corpus-g/expprint-expprint-cir | 0 / dc | v(4) | 70 | 0 | 0 | 0 | 0 | 69 / 1 |
| corpus-g/gencoupapi-rlc-series-vccs-ac-nogenext-cir | 0 / ac | i(l1) | 210 | 1.85122758655628e-17 | 1.3520547712387225e-18 | 2.5676352897230586e-8 | 2.2519899293359168e-9 | 210 / 0 |
| corpus-g/gencoupapi-rlc-series-vccs-ac-nogenext-cir | 0 / ac | i(v1) | 210 | 1.85122758655628e-17 | 1.3517671247482793e-18 | 3.451122701240666e-8 | 3.6236798794092077e-9 | 210 / 0 |
| corpus-g/gencoupapi-rlc-series-vccs-ac-nogenext-cir | 0 / ac | v(1) | 210 | 0 | 0 | 0 | 0 | 210 / 0 |
| corpus-g/gencoupapi-rlc-series-vccs-ac-nogenext-cir | 0 / ac | v(1a) | 210 | 1.8477215231700543e-14 | 1.3487670639256077e-15 | 3.603322681496433e-14 | 2.52919945160837e-15 | 210 / 0 |
| corpus-g/gencoupapi-rlc-series-vccs-ac-nogenext-cir | 0 / ac | v(1b) | 210 | 3.7050461002764645e-14 | 2.7040228464337283e-15 | 2.820037361491897e-13 | 1.948299025796692e-14 | 210 / 0 |
| corpus-g/gencoupapi-rlc-series-vccs-ac-nogenext-cir | 0 / ac | v(1c) | 210 | 5.894964357310106e-13 | 4.296223200144386e-14 | 3.745174462649671e-14 | 3.485770211228935e-15 | 210 / 0 |
| corpus-g/gencoupapi-rlc-series-vccs-ac-nogenext-cir | 0 / ac | v(2) | 210 | 1.8477215231700543e-14 | 1.3487670639256077e-15 | 3.603322681496433e-14 | 2.52919945160837e-15 | 210 / 0 |
| corpus-g/globalnode-global-hspice-cir | 0 / tran | i(v3) | 1000008 | 1.1102230246251565e-16 | 6.798713374829771e-17 | 3.3306690738754696e-16 | 2.0396140124489315e-16 | 1000008 / 0 |
| corpus-g/globalnode-global-hspice-cir | 0 / tran | v(1) | 1000008 | 5.551115123125783e-17 | 1.4686811367752538e-19 | 1.6653345369377346e-16 | 4.4060434103257615e-19 | 1000008 / 0 |
| corpus-g/globalnode-global-hspice-cir | 0 / tran | v(g) | 1000008 | 0 | 0 | 0 | 0 | 1000008 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 0 / op | i(vap) | 1 | 0 | 0 | n/a | n/a | 0 / 1 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 0 / op | i(vdd) | 1 | 1.3659845458533978e-9 | 1.3659845458533978e-9 | 0.000004203330555668257 | 0.000004203330555668257 | 1 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 0 / op | i(vin) | 1 | 0 | 0 | n/a | n/a | 0 / 1 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 0 / op | v(1) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 0 / op | v(11) | 1 | 9.640084142059635e-7 | 9.640084142059635e-7 | 9.443924425277798e-7 | 9.443924425277798e-7 | 1 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 0 / op | v(12) | 1 | 2.2443090497148432e-8 | 2.2443090497148432e-8 | 8.977232641109766e-9 | 8.977232641109766e-9 | 1 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 0 / op | v(3) | 1 | 9.550993735896185e-7 | 9.550993735896185e-7 | 9.356646559384724e-7 | 9.356646559384724e-7 | 1 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 0 / op | v(32) | 1 | 0.0000025949879596254277 | 0.0000025949879596254277 | 6.85766834788342e-7 | 6.85766834788342e-7 | 1 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 0 / op | v(33) | 1 | 2.2443090497148432e-8 | 2.2443090497148432e-8 | 8.977232641109766e-9 | 8.977232641109766e-9 | 1 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 0 / op | v(34) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 0 / op | v(36) | 1 | 9.208621361000979e-7 | 9.208621361000979e-7 | 9.021913178389681e-7 | 9.021913178389681e-7 | 1 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 0 / op | v(4) | 1 | 9.728226064709133e-7 | 9.728226064709133e-7 | 8.778886821169354e-7 | 8.778886821169354e-7 | 1 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 0 / op | v(5) | 1 | 5.344209785818066e-7 | 5.344209785818066e-7 | 2.2496617835399136e-7 | 2.2496617835399136e-7 | 1 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 0 / op | v(6) | 1 | 2.8191895662388333e-7 | 2.8191895662388333e-7 | 7.799814471020642e-8 | 7.799814471020642e-8 | 1 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 0 / op | v(7) | 1 | 2.882137684068198e-7 | 2.882137684068198e-7 | 7.454553408437602e-8 | 7.454553408437602e-8 | 1 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 0 / op | v(9) | 1 | 3.9983709454460836e-7 | 3.9983709454460836e-7 | 3.280030030899085e-7 | 3.280030030899085e-7 | 1 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 0 / op | v(99) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 1 / tran | i(vap) | 118 | 6.325398592331117e-8 | 3.536795295132418e-8 | 2062.8259429646037 | 190.91162754592833 | 117 / 1 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 1 / tran | i(vdd) | 118 | 0.00001380272805037708 | 0.000003638439752513556 | 0.0427213491815334 | 0.01088484962845449 | 118 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 1 / tran | i(vin) | 118 | 6.325398592331117e-8 | 3.536795295132418e-8 | 2062.8259429646037 | 190.91162754592833 | 117 / 1 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 1 / tran | v(1) | 118 | 0 | 0 | 0 | 0 | 118 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 1 / tran | v(11) | 118 | 0.007614792250646207 | 0.0018670540587024994 | 0.007112559282735755 | 0.001773910289798951 | 118 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 1 / tran | v(12) | 118 | 0.005917919312330877 | 0.0015548094962095403 | 0.0024413767282607207 | 0.0006449426238406026 | 118 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 1 / tran | v(3) | 118 | 0.0030064228131849724 | 0.0008397407837160033 | 0.0029647113764519114 | 0.0008277625134700715 | 118 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 1 / tran | v(32) | 118 | 0.0029629382608704624 | 0.0008640407109398451 | 0.0007995896786395082 | 0.0002280768068713983 | 118 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 1 / tran | v(33) | 118 | 0.005910315575845093 | 0.001555041629275205 | 0.00243827121319069 | 0.000645032106713778 | 118 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 1 / tran | v(34) | 118 | 6.661338147750939e-15 | 1.0047261060640104e-15 | 2.6645352591003686e-15 | 3.7957667521033916e-16 | 118 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 1 / tran | v(36) | 118 | 0.002182908090569091 | 0.0007217011637773471 | 0.002238836948254845 | 0.0007119316702347369 | 118 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 1 / tran | v(4) | 118 | 0.004151041197471006 | 0.0012416293667032478 | 0.00370924199141999 | 0.0011137243135556532 | 118 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 1 / tran | v(5) | 118 | 0.0010407468215167803 | 0.000270666077809326 | 0.00043683205377691956 | 0.00011382686986826083 | 118 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 1 / tran | v(6) | 118 | 0.011077109893307124 | 0.003052334390132481 | 0.0030650869848306557 | 0.0008609667019627198 | 118 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 1 / tran | v(7) | 118 | 0.00016367536060091226 | 0.00004316830426865871 | 0.00004233410230528967 | 0.000011168290069271671 | 118 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 1 / tran | v(9) | 118 | 0.0005371318710143402 | 0.000141597260065576 | 0.0004385088333534973 | 0.00011604299793232868 | 118 / 0 |
| corpus-g/ic-and-nodeset-hussamp-par1-cir | 1 / tran | v(99) | 118 | 0 | 0 | 0 | 0 | 118 / 0 |
| corpus-g/iexp-iexp-cir | 0 / tran | i(vmon) | 59 | 4.958435970238823 | 2.3100850581398467 | 1 | 1 | 59 / 0 |
| corpus-g/iexp-iexp-cir | 0 / tran | v(1) | 59 | 2479.2179851194123 | 1155.0425290699236 | 1 | 1 | 59 / 0 |
| corpus-g/iexp-iexp-cir | 0 / tran | v(2) | 59 | 2479.2179851194123 | 1155.0425290699236 | 1 | 1 | 59 / 0 |
| corpus-g/ipulse-ipulse-cir | 0 / tran | i(vmon) | 115 | 5.0000000000000036 | 3.0270339909899757 | 1 | 1 | 115 / 0 |
| corpus-g/ipulse-ipulse-cir | 0 / tran | v(1) | 115 | 2500.0000000000023 | 1513.5169954949877 | 1 | 1 | 115 / 0 |
| corpus-g/ipulse-ipulse-cir | 0 / tran | v(2) | 115 | 2500.0000000000023 | 1513.5169954949877 | 1 | 1 | 115 / 0 |
| corpus-g/ipwl-ipwl-cir | 0 / tran | i(vmon) | 74 | 5 | 2.071688998814206 | 1 | 1 | 55 / 19 |
| corpus-g/ipwl-ipwl-cir | 0 / tran | v(1) | 74 | 2500 | 1035.8444994071033 | 1 | 1 | 55 / 19 |
| corpus-g/ipwl-ipwl-cir | 0 / tran | v(2) | 74 | 2500 | 1035.8444994071033 | 1 | 1 | 55 / 19 |
| corpus-g/isffm-isffm-cir | 0 / tran | i(vmon) | 208 | 0.021224729749861337 | 0.0021175689752158194 | 0.028384007458342787 | 0.004871226884478204 | 207 / 1 |
| corpus-g/isffm-isffm-cir | 0 / tran | v(1) | 208 | 0.021224729749861337 | 0.0021175689752158194 | 0.028384007458342787 | 0.004871226884478204 | 207 / 1 |
| corpus-g/isffm-isffm-cir | 0 / tran | v(2) | 208 | 0.021224729749861337 | 0.0021175689752158194 | 0.028384007458342787 | 0.004871226884478204 | 207 / 1 |
| corpus-g/isin-isin-cir | 0 / tran | i(vmon) | 108 | 1.0879165876962746 | 0.439905671507658 | 1 | 1 | 108 / 0 |
| corpus-g/isin-isin-cir | 0 / tran | v(1) | 108 | 1.0879165876962746 | 0.439905671507658 | 1 | 1 | 108 / 0 |
| corpus-g/isin-isin-cir | 0 / tran | v(2) | 108 | 1.0879165876962746 | 0.439905671507658 | 1 | 1 | 108 / 0 |
| corpus-g/juncap200-diodeclipper-cir | 0 / tran | i(vcc) | 1000008 | 0.006162160361230174 | 0.002719783374288607 | 0.6552642017958187 | 0.3319191772485455 | 1000008 / 0 |
| corpus-g/juncap200-diodeclipper-cir | 0 / tran | i(vin) | 1000008 | 0.0006256888152407847 | 0.00035582108576936755 | 1369.0182298483082 | 1.6121077419395384 | 1000008 / 0 |
| corpus-g/juncap200-diodeclipper-cir | 0 / tran | v(1) | 1000008 | 0 | 0 | 0 | 0 | 1000008 / 0 |
| corpus-g/juncap200-diodeclipper-cir | 0 / tran | v(2) | 1000008 | 0.6261245922735129 | 0.360569717553496 | 1601590.7344669795 | 1941.5971302902747 | 1000008 / 0 |
| corpus-g/juncap200-diodeclipper-cir | 0 / tran | v(3) | 1000008 | 0.020332148262042438 | 0.007979001068041489 | 29.598487085899716 | 0.05100235436310509 | 1000007 / 1 |
| corpus-g/juncap200-diodeclipper-cir | 0 / tran | v(4) | 1000008 | 0.6215547121738765 | 0.3228282104806547 | 2174.6360651767086 | 3.9643156361547103 | 1000007 / 1 |
| corpus-g/lead-currents-lead-bsrc-ac-cir | 0 / op | i(b6) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-g/lead-currents-lead-bsrc-ac-cir | 0 / op | i(eamp) | 1 | 8.673617379884035e-19 | 8.673617379884035e-19 | n/a | n/a | 0 / 1 |
| corpus-g/lead-currents-lead-bsrc-ac-cir | 0 / op | i(h5) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-g/lead-currents-lead-bsrc-ac-cir | 0 / op | i(v1) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-g/lead-currents-lead-bsrc-ac-cir | 0 / op | v(1) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-g/lead-currents-lead-bsrc-ac-cir | 0 / op | v(2) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-g/lead-currents-lead-bsrc-ac-cir | 0 / op | v(3) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-g/lead-currents-lead-bsrc-ac-cir | 0 / op | v(4) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-g/lead-currents-lead-bsrc-ac-cir | 0 / op | v(5) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-g/lead-currents-lead-bsrc-ac-cir | 0 / op | v(6) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-g/lead-currents-lead-bsrc-ac-cir | 1 / ac | i(b6) | 31 | 2.7651296315394197e-16 | 1.0237684375928254e-16 | 7.820556071079822e-15 | 1.8276951273653625e-15 | 31 / 0 |
| corpus-g/lead-currents-lead-bsrc-ac-cir | 1 / ac | i(eamp) | 31 | 3.529906531158615e-18 | 1.0148442257617502e-18 | 1.7364139593336828e-12 | 3.121347660583978e-13 | 31 / 0 |
| corpus-g/lead-currents-lead-bsrc-ac-cir | 1 / ac | i(h5) | 31 | 0 | 0 | 0 | 0 | 31 / 0 |
| corpus-g/lead-currents-lead-bsrc-ac-cir | 1 / ac | i(v1) | 31 | 0 | 0 | 0 | 0 | 31 / 0 |
| corpus-g/lead-currents-lead-bsrc-ac-cir | 1 / ac | v(1) | 31 | 0 | 0 | 0 | 0 | 31 / 0 |
| corpus-g/lead-currents-lead-bsrc-ac-cir | 1 / ac | v(2) | 31 | 0 | 0 | 0 | 0 | 31 / 0 |
| corpus-g/lead-currents-lead-bsrc-ac-cir | 1 / ac | v(3) | 31 | 0 | 0 | 0 | 0 | 31 / 0 |
| corpus-g/lead-currents-lead-bsrc-ac-cir | 1 / ac | v(4) | 31 | 2.7651296315394197e-16 | 1.0237684375928254e-16 | 7.820556071079822e-15 | 1.8276951273653625e-15 | 31 / 0 |
| corpus-g/lead-currents-lead-bsrc-ac-cir | 1 / ac | v(5) | 31 | 0 | 0 | 0 | 0 | 31 / 0 |
| corpus-g/lead-currents-lead-bsrc-ac-cir | 1 / ac | v(6) | 31 | 2.7651296315394197e-16 | 1.0237684375928254e-16 | 7.820556071079822e-15 | 1.8276951273653625e-15 | 31 / 0 |
| corpus-g/measure-dc-avgtest2dc-cir | 0 / dc | i(vsrc1) | 10 | 0 | 0 | 0 | 0 | 10 / 0 |
| corpus-g/measure-dc-avgtest2dc-cir | 0 / dc | i(vsrc2) | 10 | 0 | 0 | 0 | 0 | 10 / 0 |
| corpus-g/measure-dc-avgtest2dc-cir | 0 / dc | v(1a) | 10 | 0 | 0 | 0 | 0 | 10 / 0 |
| corpus-g/measure-dc-avgtest2dc-cir | 0 / dc | v(1b) | 10 | 0 | 0 | 0 | 0 | 10 / 0 |
| corpus-g/measure-dc-avgtest2dc-cir | 0 / dc | v(2a) | 10 | 0 | 0 | 0 | 0 | 10 / 0 |
| corpus-g/minductors-inductoricbug-cir | 0 / tran | i(l1) | 511 | 0.03664570320173954 | 0.004469948593900299 | 0.008017738970278266 | 0.0010880494919663212 | 511 / 0 |
| corpus-g/minductors-inductoricbug-cir | 0 / tran | i(l2) | 511 | 0.036580523998805625 | 0.004458520391623725 | 0.20368462602771298 | 0.022898495672887677 | 511 / 0 |
| corpus-g/minductors-inductoricbug-cir | 0 / tran | v(1) | 511 | 0.036580523998805625 | 0.004458520391623725 | 0.20368462602771298 | 0.022898495672887677 | 511 / 0 |
| corpus-g/minductors-inductoricbug-cir | 0 / tran | v(2) | 511 | 4.949175999173084 | 0.49395298979812247 | 108.28336697725665 | 5.5042130455685125 | 511 / 0 |
| corpus-g/model-binning-comparatorbaseline-forglobal-cir | 0 / tran | i(va) | 121 | 0.0009391179374612083 | 0.00029496639305248934 | 7551532.629339515 | 938237.0554923051 | 102 / 19 |
| corpus-g/model-binning-comparatorbaseline-forglobal-cir | 0 / tran | i(vb) | 121 | 0.00011361258628172447 | 0.000018707524644166943 | 1116.083238249693 | 342.12873202905973 | 102 / 19 |
| corpus-g/model-binning-comparatorbaseline-forglobal-cir | 0 / tran | i(vdd) | 121 | 0.0008607599790440222 | 0.00026132358261820736 | 15.039210218047037 | 4.697676358795736 | 121 / 0 |
| corpus-g/model-binning-comparatorbaseline-forglobal-cir | 0 / tran | v(1) | 121 | 1.344652892270279 | 0.3255382189075656 | 26901940.289215002 | 4101307.207272709 | 86 / 35 |
| corpus-g/model-binning-comparatorbaseline-forglobal-cir | 0 / tran | v(2) | 121 | 3.9593737695110933 | 2.038969704217979 | 283.372421522546 | 37.49690436565585 | 121 / 0 |
| corpus-g/model-binning-comparatorbaseline-forglobal-cir | 0 / tran | v(3) | 121 | 2.4002137018358236 | 1.0665055734504088 | 7.294522027479594 | 2.992855990719664 | 121 / 0 |
| corpus-g/model-binning-comparatorbaseline-forglobal-cir | 0 / tran | v(8) | 121 | 5.014521001251846 | 2.5326972758958646 | 40613889.73862148 | 5340247.5688295 | 121 / 0 |
| corpus-g/model-binning-comparatorbaseline-forglobal-cir | 0 / tran | v(9) | 121 | 5.068886996556126 | 1.948931548158602 | 49321.98815177611 | 5471.069213148664 | 121 / 0 |
| corpus-g/model-binning-comparatorbaseline-forglobal-cir | 0 / tran | v(a) | 121 | 6.623590564913684e-13 | 9.49121818320599e-14 | 1 | 0.1767766952966369 | 64 / 57 |
| corpus-g/model-binning-comparatorbaseline-forglobal-cir | 0 / tran | v(anot) | 121 | 5.544810507891885 | 1.8714950152697738 | 2404.779600609146 | 366.11067204570935 | 121 / 0 |
| corpus-g/model-binning-comparatorbaseline-forglobal-cir | 0 / tran | v(aorbnot) | 121 | 0.13055046807506354 | 0.035292445703592974 | 0.02543227738739786 | 0.006971792748157638 | 121 / 0 |
| corpus-g/model-binning-comparatorbaseline-forglobal-cir | 0 / tran | v(b) | 121 | 0 | 0 | n/a | n/a | 0 / 121 |
| corpus-g/model-binning-comparatorbaseline-forglobal-cir | 0 / tran | v(bnot) | 121 | 0.2556326458817155 | 0.05844150510081556 | 0.053946079140718445 | 0.012081798440296493 | 121 / 0 |
| corpus-g/model-binning-comparatorbaseline-forglobal-cir | 0 / tran | v(e1) | 121 | 0 | 0 | 0 | 0 | 121 / 0 |
| corpus-g/model-binning-comparatorbaseline-forglobal-cir | 0 / tran | v(lnot) | 121 | 3.9800410198048968 | 1.64236848014969 | 20.17320502910559 | 7.161696916826055 | 121 / 0 |
| corpus-g/model-binning-comparatorbaseline-forglobal-cir | 0 / tran | v(qnot) | 121 | 3.2927449679939156 | 1.9244699107051029 | 5.534685889525528 | 3.1783319204500717 | 121 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | i(vdddev) | 5802 | 0.004038212927063966 | 0.0009274394264010952 | 4683.103125435204 | 83.53353012066117 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | i(vin1) | 5802 | 0.00019637990834156093 | 0.000011791051976095068 | 10838240.242696181 | 575987.6790903156 | 2815 / 2987 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(1) | 5802 | 7.983835814684426e-12 | 4.563675547233203e-13 | 1 | 0.06359146930611466 | 3167 / 2635 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(in) | 5802 | 0.19637990834405494 | 0.011791051976087244 | 4799088825.21469 | 97378078.69178528 | 4958 / 844 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out10) | 5802 | 1.1710780499790967 | 0.06530451235519547 | 3801397.979670327 | 77709.96908415634 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out11) | 5802 | 1.7207836532614094 | 0.07680347392061761 | 7767449.43697932 | 116694.68513515763 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out12) | 5802 | 1.5467840704120703 | 0.07040612469048177 | 3232649.157693114 | 47001.93076282752 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out13) | 5802 | 1.9078266935737231 | 0.08350885922123043 | 3203736.3437972274 | 66707.32421221132 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out14) | 5802 | 1.5744206401482714 | 0.07964808190584527 | 562182.704664551 | 12164.899609643411 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out15) | 5802 | 2.0829046305673358 | 0.09687467676031528 | 1224971.663280422 | 50010.868201542035 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out16) | 5802 | 1.8239481188037834 | 0.09264100020904181 | 1973014.9418102612 | 37947.81739607887 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out17) | 5802 | 2.399020429342421 | 0.11243598463990039 | 6801525.271238156 | 107844.48935336384 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out18) | 5802 | 1.9697628805812082 | 0.10685344929707467 | 170455.66477925115 | 5617.353638429286 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out19) | 5802 | 2.4587131561681823 | 0.11824144122017372 | 23046200.366385162 | 331405.42392433574 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out2) | 5802 | 0.4659525548329504 | 0.027413592613634078 | 138203.79677222602 | 13230.648157213482 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out20) | 5802 | 2.110946156033236 | 0.11646740010208624 | 804958.6938592517 | 16682.64678248668 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out21) | 5802 | 2.5966530617507133 | 0.13353162296722976 | 2870256.8430852634 | 76290.24745107986 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out22) | 5802 | 2.2572189581115234 | 0.1278722919547416 | 3272051.496819196 | 43109.53373409784 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out23) | 5802 | 2.8252367534852505 | 0.14059007266082085 | 656158.8235214361 | 61459.977409777166 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out24) | 5802 | 2.4167724725709148 | 0.1404473898349938 | 2600924.9121887274 | 37746.412490627095 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out25) | 5802 | 3.182865027343482 | 0.15435180118872424 | 495267.2361115783 | 84541.72760356625 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out26) | 5802 | 2.6696201111140883 | 0.14489364481554956 | 1310255.2796814824 | 24982.65349445373 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out27) | 5802 | 3.531711989763129 | 0.16004814419218322 | 697586.3975793637 | 98911.65889426645 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out28) | 5802 | 3.0483936579201028 | 0.156169154336533 | 11472823.012782514 | 216332.8318664446 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out29) | 5802 | 3.6081827698444053 | 0.16536213003951514 | 495011.84170689073 | 89106.93880287158 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out3) | 5802 | 0.7685495562173741 | 0.03381334452301861 | 191259387.1531684 | 2514935.640272804 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out30) | 5802 | 3.027937438358317 | 0.15889686996473704 | 1087450.17695248 | 19319.173527351097 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out31) | 5802 | 3.5198911356189306 | 0.1725388812433528 | 502300.26435324043 | 100647.298566769 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out32) | 5802 | 3.0969230824647025 | 0.16670635517156954 | 1900172.4675793035 | 71506.60955582136 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out33) | 5802 | 3.702542094475637 | 0.19014813717558068 | 522022.75485381944 | 94574.48570822408 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out34) | 5802 | 3.1085680269671916 | 0.19448742327736473 | 284056.86962019315 | 26885.87868943804 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out35) | 5802 | 3.8506917884664595 | 0.2084813255598451 | 30143763.6885069 | 814942.5000001616 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out36) | 5802 | 3.2870671203590334 | 0.19217127675912837 | 3130851.262445877 | 70355.22585228294 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out37) | 5802 | 4.022609851320066 | 0.21234155695771614 | 159207598.54294372 | 2098547.139698222 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out38) | 5802 | 3.4873552769229508 | 0.20280766137769005 | 27480.67702623951 | 397.20484646759115 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out39) | 5802 | 4.187744419667318 | 0.2162691708534108 | 193496.8535996124 | 5356.848703635561 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out4) | 5802 | 0.9486524491640529 | 0.04163641548050943 | 271684.4889530273 | 20927.628184142784 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out40) | 5802 | 3.6557963735913264 | 0.2205572882612945 | 24683.11233010744 | 428.96685581828115 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out41) | 5802 | 4.336832965352099 | 0.23824583038780345 | 180601.17600014922 | 3368.349427646878 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out42) | 5802 | 3.767170887529469 | 0.23137576447209324 | 68265.77029501897 | 1360.5067106872482 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out5) | 5802 | 1.364767172113564 | 0.05271036374153188 | 10937799.122447932 | 196765.16063936532 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out6) | 5802 | 1.0844582193102295 | 0.052078940158468874 | 185787.12921636555 | 12734.736789243658 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out7) | 5802 | 1.5036109200302026 | 0.06205156189764116 | 58063939.524061814 | 996979.6751253438 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out8) | 5802 | 1.3394597073123213 | 0.0638466025525901 | 1161162.3823792057 | 30718.36533025771 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(out9) | 5802 | 1.3414320259597123 | 0.060853418949182024 | 4077077.3807669175 | 88240.05322353629 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(vdd) | 5802 | 0 | 0 | 0 | 0 | 5802 / 0 |
| corpus-g/mos13-ic-invert42-mos3-cir | 0 / tran | v(vout) | 5802 | 5.203603602610309 | 0.4059462679033335 | 10315.067846304326 | 502.1850249162911 | 5802 / 0 |
| corpus-g/mosfet-paramaliases-invert1-alt-cir | 0 / tran | i(vdddev) | 1929 | 0.0002223839129790045 | 0.000027814824002968504 | 21941.92597627707 | 521.5006000596903 | 1929 / 0 |
| corpus-g/mosfet-paramaliases-invert1-alt-cir | 0 / tran | i(vin1) | 1929 | 0.00022170961649719265 | 0.000024363426145529292 | 11314.299796536272 | 817.1656031894404 | 1846 / 83 |
| corpus-g/mosfet-paramaliases-invert1-alt-cir | 0 / tran | v(1) | 1929 | 5.2625681590257045e-12 | 6.340368903033122e-13 | 2.1204328060752635 | 0.09885864188146846 | 1074 / 855 |
| corpus-g/mosfet-paramaliases-invert1-alt-cir | 0 / tran | v(in) | 1929 | 0.22170961649519594 | 0.024363426145574792 | 11314.299797105074 | 748.962134061644 | 1929 / 0 |
| corpus-g/mosfet-paramaliases-invert1-alt-cir | 0 / tran | v(vdd) | 1929 | 0 | 0 | 0 | 0 | 1929 / 0 |
| corpus-g/mosfet-paramaliases-invert1-alt-cir | 0 / tran | v(vout) | 1929 | 1.4114621321753065 | 0.09488479599797633 | 77655.89328588224 | 2749.142087134127 | 1929 / 0 |
| corpus-g/nmesfet-nmesfet-cir | 0 / dc | i(vds) | 70 | 1.931121380426698e-10 | 4.53226150176095e-11 | 0.000010833323186197164 | 0.0000019304854029036107 | 70 / 0 |
| corpus-g/nmesfet-nmesfet-cir | 0 / dc | i(vgs) | 70 | 1.3091622015879223e-16 | 2.7044477352678512e-17 | 0.0005771404049731051 | 0.00008388364850160148 | 70 / 0 |
| corpus-g/nmesfet-nmesfet-cir | 0 / dc | i(vids) | 70 | 1.931121380426698e-10 | 4.53226150176095e-11 | 0.000010833323186197164 | 0.0000019304854029036107 | 70 / 0 |
| corpus-g/nmesfet-nmesfet-cir | 0 / dc | v(1) | 70 | 2.220446049250313e-16 | 1.5700924586837752e-16 | 1.1686558153949016e-16 | 8.263644519388289e-17 | 70 / 0 |
| corpus-g/nmesfet-nmesfet-cir | 0 / dc | v(2) | 70 | 2.220446049250313e-16 | 1.5700924586837752e-16 | 1.1686558153949016e-16 | 8.263644519388289e-17 | 70 / 0 |
| corpus-g/nmesfet-nmesfet-cir | 0 / dc | v(3) | 70 | 0 | 0 | 0 | 0 | 70 / 0 |
| corpus-g/nmos3-dc-mos3-dc-cir | 0 / dc | i(vds) | 2404 | 2.481035657833381e-8 | 1.3305074174232887e-8 | 0.0013101925223338853 | 0.0006219512222701155 | 2400 / 4 |
| corpus-g/nmos3-dc-mos3-dc-cir | 0 / dc | i(vgs) | 2404 | 0 | 0 | n/a | n/a | 0 / 2404 |
| corpus-g/nmos3-dc-mos3-dc-cir | 0 / dc | i(vmon) | 2404 | 2.481035657833381e-8 | 1.3305074174232887e-8 | 0.0013101925223338853 | 0.0006219512222701155 | 2400 / 4 |
| corpus-g/nmos3-dc-mos3-dc-cir | 0 / dc | v(1) | 2404 | 0 | 0 | 0 | 0 | 2404 / 0 |
| corpus-g/nmos3-dc-mos3-dc-cir | 0 / dc | v(3) | 2404 | 0 | 0 | 0 | 0 | 2400 / 4 |
| corpus-g/nmos3-dc-mos3-dc-cir | 0 / dc | v(4) | 2404 | 0 | 0 | 0 | 0 | 2400 / 4 |
| corpus-g/op-comparator-op-cir | 0 / op | i(va) | 1 | 0 | 0 | n/a | n/a | 0 / 1 |
| corpus-g/op-comparator-op-cir | 0 / op | i(vb) | 1 | 0 | 0 | n/a | n/a | 0 / 1 |
| corpus-g/op-comparator-op-cir | 0 / op | i(vdd) | 1 | 0.00021494010392416354 | 0.00021494010392416354 | 3.0721423055766204 | 3.0721423055766204 | 1 / 0 |
| corpus-g/op-comparator-op-cir | 0 / op | v(1) | 1 | 1.304101100030651e-24 | 1.304101100030651e-24 | n/a | n/a | 0 / 1 |
| corpus-g/op-comparator-op-cir | 0 / op | v(2) | 1 | 2.471239421229751 | 2.471239421229751 | 0.9775636481309583 | 0.9775636481309583 | 1 / 0 |
| corpus-g/op-comparator-op-cir | 0 / op | v(3) | 1 | 0.9562814004005589 | 0.9562814004005589 | 3.9340585822219567 | 3.9340585822219567 | 1 / 0 |
| corpus-g/op-comparator-op-cir | 0 / op | v(8) | 1 | 3.1503011164322503 | 3.1503011164322503 | 0.6300602262138132 | 0.6300602262138132 | 1 / 0 |
| corpus-g/op-comparator-op-cir | 0 / op | v(9) | 1 | 1.6728450676082594e-8 | 1.6728450676082594e-8 | 1.0783699650546152 | 1.0783699650546152 | 1 / 0 |
| corpus-g/op-comparator-op-cir | 0 / op | v(a) | 1 | 0 | 0 | n/a | n/a | 0 / 1 |
| corpus-g/op-comparator-op-cir | 0 / op | v(anot) | 1 | 4.0607046614127285e-9 | 4.0607046614127285e-9 | 8.121409355605543e-10 | 8.121409355605543e-10 | 1 / 0 |
| corpus-g/op-comparator-op-cir | 0 / op | v(aorbnot) | 1 | 2.3875064592004946e-8 | 2.3875064592004946e-8 | 4.775013033572888e-9 | 4.775013033572888e-9 | 1 / 0 |
| corpus-g/op-comparator-op-cir | 0 / op | v(b) | 1 | 0 | 0 | n/a | n/a | 0 / 1 |
| corpus-g/op-comparator-op-cir | 0 / op | v(bnot) | 1 | 4.0607046614127285e-9 | 4.0607046614127285e-9 | 8.121409355605543e-10 | 8.121409355605543e-10 | 1 / 0 |
| corpus-g/op-comparator-op-cir | 0 / op | v(e1) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-g/op-comparator-op-cir | 0 / op | v(lnot) | 1 | 4.735563141622379e-8 | 4.735563141622379e-8 | 9.47112674313184e-9 | 9.47112674313184e-9 | 1 / 0 |
| corpus-g/op-comparator-op-cir | 0 / op | v(qnot) | 1 | 2.4986188162651377 | 2.4986188162651377 | 4.722058501017968 | 4.722058501017968 | 1 / 0 |
| corpus-g/op-comparator-op-cir | 1 / tran | i(va) | 121 | 0.0009391179374612083 | 0.00029496639305248934 | 7551532.629339515 | 938237.0554923051 | 102 / 19 |
| corpus-g/op-comparator-op-cir | 1 / tran | i(vb) | 121 | 0.00011361258628172447 | 0.000018707524644166943 | 1116.083238249693 | 342.12873202905973 | 102 / 19 |
| corpus-g/op-comparator-op-cir | 1 / tran | i(vdd) | 121 | 0.0008607599790440222 | 0.00026132358261820736 | 15.039210218047037 | 4.697676358795736 | 121 / 0 |
| corpus-g/op-comparator-op-cir | 1 / tran | v(1) | 121 | 1.344652892270279 | 0.3255382189075656 | 26901940.289215002 | 4101307.207272709 | 86 / 35 |
| corpus-g/op-comparator-op-cir | 1 / tran | v(2) | 121 | 3.9593737695110933 | 2.038969704217979 | 283.372421522546 | 37.49690436565585 | 121 / 0 |
| corpus-g/op-comparator-op-cir | 1 / tran | v(3) | 121 | 2.4002137018358236 | 1.0665055734504088 | 7.294522027479594 | 2.992855990719664 | 121 / 0 |
| corpus-g/op-comparator-op-cir | 1 / tran | v(8) | 121 | 5.014521001251846 | 2.5326972758958646 | 40613889.73862148 | 5340247.5688295 | 121 / 0 |
| corpus-g/op-comparator-op-cir | 1 / tran | v(9) | 121 | 5.068886996556126 | 1.948931548158602 | 49321.98815177611 | 5471.069213148664 | 121 / 0 |
| corpus-g/op-comparator-op-cir | 1 / tran | v(a) | 121 | 6.623590564913684e-13 | 9.49121818320599e-14 | 1 | 0.1767766952966369 | 64 / 57 |
| corpus-g/op-comparator-op-cir | 1 / tran | v(anot) | 121 | 5.544810507891885 | 1.8714950152697738 | 2404.779600609146 | 366.11067204570935 | 121 / 0 |
| corpus-g/op-comparator-op-cir | 1 / tran | v(aorbnot) | 121 | 0.13055046807506354 | 0.035292445703592974 | 0.02543227738739786 | 0.006971792748157638 | 121 / 0 |
| corpus-g/op-comparator-op-cir | 1 / tran | v(b) | 121 | 0 | 0 | n/a | n/a | 0 / 121 |
| corpus-g/op-comparator-op-cir | 1 / tran | v(bnot) | 121 | 0.2556326458817155 | 0.05844150510081556 | 0.053946079140718445 | 0.012081798440296493 | 121 / 0 |
| corpus-g/op-comparator-op-cir | 1 / tran | v(e1) | 121 | 0 | 0 | 0 | 0 | 121 / 0 |
| corpus-g/op-comparator-op-cir | 1 / tran | v(lnot) | 121 | 3.9800410198048968 | 1.64236848014969 | 20.17320502910559 | 7.161696916826055 | 121 / 0 |
| corpus-g/op-comparator-op-cir | 1 / tran | v(qnot) | 121 | 3.2927449679939156 | 1.9244699107051029 | 5.534685889525528 | 3.1783319204500717 | 121 / 0 |
| corpus-g/output-ac-ac-csv-cir | 0 / ac | i(v1) | 20 | 4.577566798522237e-16 | 1.571152242838182e-16 | 9.33624275297068e-16 | 3.797146411121988e-16 | 20 / 0 |
| corpus-g/output-ac-ac-csv-cir | 0 / ac | v(a) | 20 | 0 | 0 | 0 | 0 | 20 / 0 |
| corpus-g/output-ac-ac-csv-cir | 0 / ac | v(b) | 20 | 2.2887833992611187e-16 | 7.555581317987742e-17 | 5.522400810920814e-16 | 2.1097861667816666e-16 | 20 / 0 |
| corpus-g/params1-params-a0-cir | 0 / tran | i(v1) | 80 | 0.0008264862745197842 | 0.0002859458235053328 | 22.776662640901815 | 2.6547890457718646 | 80 / 0 |
| corpus-g/params1-params-a0-cir | 0 / tran | i(v2) | 80 | 0.00029535190393915634 | 0.00012058839727671026 | 27.299754507688608 | 5.038442025424517 | 80 / 0 |
| corpus-g/params1-params-a0-cir | 0 / tran | v(1) | 80 | 20 | 7.672001042752798 | 0.95 | 0.432117870098584 | 41 / 39 |
| corpus-g/params1-params-a0-cir | 0 / tran | v(2) | 80 | 6.497741886661432 | 2.6529447400876256 | 1.1745846118832415 | 0.47311349000164865 | 80 / 0 |
| corpus-g/params1-params-a0-cir | 0 / tran | v(3) | 80 | 0 | 0 | 0 | 0 | 80 / 0 |
| corpus-g/params2-params-a0-cir | 0 / dc | i(v1) | 6 | 5.421010862427522e-20 | 2.2131184171720676e-20 | 1.807003620809174e-16 | 8.081165863435133e-17 | 5 / 1 |
| corpus-g/params2-params-a0-cir | 0 / dc | v(1) | 6 | 0 | 0 | 0 | 0 | 5 / 1 |
| corpus-g/parser-aasamp-cir | 0 / dc | i(v1) | 5 | 2499999999997.5 | 1658312395176.0415 | 999999999999 | 999999999998.9999 | 5 / 0 |
| corpus-g/parser-aasamp-cir | 0 / dc | v(1) | 5 | 0 | 0 | 0 | 0 | 5 / 0 |
| corpus-g/parser-aasamp-cir | 0 / dc | v(2) | 5 | 0 | 0 | 0 | 0 | 5 / 0 |
| corpus-g/pjfet-switch-pjfet-tran-cir | 0 / tran | i(vds) | 707 | 0.0000015292131704744416 | 2.4200068662750755e-7 | 0.00008033769878205823 | 0.00005938886627672084 | 707 / 0 |
| corpus-g/pjfet-switch-pjfet-tran-cir | 0 / tran | i(vin) | 707 | 0.00000970132774760768 | 9.057508198457957e-7 | 0.0058929555579559185 | 0.00024369608640530723 | 707 / 0 |
| corpus-g/pjfet-switch-pjfet-tran-cir | 0 / tran | v(1) | 707 | 0.0007646065852400241 | 0.00012100034331378211 | 0.0002841682089008786 | 0.00004138765239457048 | 707 / 0 |
| corpus-g/pjfet-switch-pjfet-tran-cir | 0 / tran | v(2) | 707 | 0.0004850663873803285 | 0.00004528754091978876 | 0.005566191528681268 | 0.0003132977636659734 | 707 / 0 |
| corpus-g/pjfet-switch-pjfet-tran-cir | 0 / tran | v(3) | 707 | 1.021405182655144e-12 | 2.1180731465679824e-13 | 1.4118336129805547e-12 | 8.863363616463059e-14 | 556 / 151 |
| corpus-g/pjfet-switch-pjfet-tran-cir | 0 / tran | v(4) | 707 | 0 | 0 | 0 | 0 | 707 / 0 |
| corpus-g/polyg-polyg-cir | 0 / tran | i(v1) | 10018 | 3.75699471533153e-21 | 3.7536707680040235e-23 | 4.13590306276514e-16 | 2.369295786271916e-17 | 1015 / 9003 |
| corpus-g/polyg-polyg-cir | 0 / tran | i(v2) | 10018 | 0.00009019980078551343 | 9.475532460373741e-7 | 1 | 0.03137284839048195 | 1016 / 9002 |
| corpus-g/polyg-polyg-cir | 0 / tran | i(v3) | 10018 | 0.00008760739030765768 | 9.208173414523086e-7 | 1 | 0.031372845208778595 | 1016 / 9002 |
| corpus-g/polyg-polyg-cir | 0 / tran | v(1) | 10018 | 3.7569947153315297e-13 | 3.753621955594618e-15 | 1 | 0.03137279025690793 | 1016 / 9002 |
| corpus-g/polyg-polyg-cir | 0 / tran | v(10) | 10018 | 0 | 0 | 0 | 0 | 10018 / 0 |
| corpus-g/polyg-polyg-cir | 0 / tran | v(11) | 10018 | 0.00876073903071628 | 0.0000920817341445994 | 1 | 0.031372845208778595 | 1016 / 9002 |
| corpus-g/polyg-polyg-cir | 0 / tran | v(8) | 10018 | 0 | 0 | 0 | 0 | 10018 / 0 |
| corpus-g/polyg-polyg-cir | 0 / tran | v(9) | 10018 | 0.009019980078602607 | 0.00009475532460417305 | 1 | 0.03137284839048195 | 1016 / 9002 |
| corpus-g/resistor-td-temp-dep-cir | 0 / dc | i(v1) | 6 | 8.673617379884035e-19 | 4.4262368343441355e-19 | 2.03492667421451e-16 | 1.5982776950161014e-16 | 5 / 1 |
| corpus-g/resistor-td-temp-dep-cir | 0 / dc | v(1) | 6 | 0 | 0 | 0 | 0 | 5 / 1 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | i(vs) | 120020 | 0.00006312151362528565 | 0.000001723212232226187 | 48358.28636607297 | 141.3442946409809 | 117512 / 2508 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(1) | 120020 | 4.218847493575595e-15 | 2.242335408993323e-16 | 2.6365874323207308e-15 | 1.578683200027086e-16 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(10) | 120020 | 0.0031016723784984546 | 0.0001344164805881692 | 0.001560535431009346 | 0.00007723758015271678 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(100) | 120020 | 0.0008357378462042764 | 0.0002277028565060851 | 0.0005307966742702278 | 0.00016851094212045267 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(101) | 120020 | 0.0008359460873677005 | 0.00022777307646356502 | 0.0005309640019065768 | 0.00016856078801704696 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(11) | 120020 | 0.0030933583757850602 | 0.0001374684542377189 | 0.0015555366719174283 | 0.000079362025217763 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(12) | 120020 | 0.00304034621040028 | 0.00013969646664049792 | 0.001528166064377501 | 0.00008113063885355302 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(13) | 120020 | 0.0029513571753829737 | 0.0001412871753962186 | 0.0014828226584089927 | 0.00008263680954177964 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(14) | 120020 | 0.002834338038136597 | 0.00014239375947866013 | 0.0014235034327841208 | 0.00008395374597299396 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(15) | 120020 | 0.002696345814653167 | 0.00014314211945306695 | 0.0013537524401263047 | 0.00008513875904440683 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(16) | 120020 | 0.002543496902477793 | 0.00014363536135496906 | 0.0012766469124746325 | 0.00008623635411658685 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(17) | 120020 | 0.002423808082232526 | 0.0001439572618000779 | 0.0012174369308656661 | 0.00008728065947159176 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(18) | 120020 | 0.002297421538730804 | 0.00014417510290876213 | 0.0011535599067037986 | 0.00008829742663772691 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(19) | 120020 | 0.0021621965906593044 | 0.00014434207996918806 | 0.0010853501815814841 | 0.00008930569172783796 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(2) | 120020 | 0.0012624302725070535 | 0.00003446424464455178 | 0.0006597572616639617 | 0.000020523900503828345 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(20) | 120020 | 0.002076353590697577 | 0.00014449939271299632 | 0.0010453346374746904 | 0.00009031914290065798 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(21) | 120020 | 0.0020155458238095836 | 0.00014467808675142592 | 0.0010141448795574202 | 0.00009134723472991939 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(22) | 120020 | 0.001944019048583101 | 0.0001449006870943479 | 0.0009776858844223104 | 0.0000923960907908663 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(23) | 120020 | 0.0018636489024286274 | 0.00014518265030986436 | 0.0009368518871431382 | 0.00009346923251058183 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(24) | 120020 | 0.0017761977735573087 | 0.000145533652938166 | 0.0008925400750605322 | 0.00009456816714054355 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(25) | 120020 | 0.0016832740792811496 | 0.00014595872951146132 | 0.0008455654310234325 | 0.00009569286285839692 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(26) | 120020 | 0.0015864163010410604 | 0.00014645927180745216 | 0.0007966772729141686 | 0.00009684213476698236 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(27) | 120020 | 0.0014870237844160084 | 0.00014703389996335086 | 0.000746571277468131 | 0.00009801396134870603 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(28) | 120020 | 0.0013863498517092676 | 0.00014767921493890563 | 0.0006958698143946548 | 0.00009920574649032516 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(29) | 120020 | 0.0013353295236093743 | 0.0001483904405559559 | 0.0006819142665253548 | 0.0001004145378383407 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(3) | 120020 | 0.00211342261536962 | 0.00006068635327317967 | 0.001061475686135536 | 0.00003559618973055272 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(30) | 120020 | 0.0013291297981246064 | 0.0001491619623471715 | 0.0006777502945634537 | 0.00010163720853512934 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(31) | 120020 | 0.0013192702504003506 | 0.00014998777002649434 | 0.000671799366886978 | 0.0001028706067132444 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(32) | 120020 | 0.0013059018750900542 | 0.00015086181059603367 | 0.0006641389644250353 | 0.00010411167557438141 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(33) | 120020 | 0.0012891549038474004 | 0.0001517782597353612 | 0.0006548645943503022 | 0.00010535754625352822 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(34) | 120020 | 0.0012692429922784854 | 0.0001527317198903918 | 0.0006504812399393848 | 0.00010660560565123882 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(35) | 120020 | 0.0012462862424618137 | 0.0001537173541240043 | 0.0006473308080752177 | 0.00010785354169010435 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(36) | 120020 | 0.0012205282931090355 | 0.00015473096513584327 | 0.0006424414264480832 | 0.00010909936877522953 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(37) | 120020 | 0.0011921002630466138 | 0.00015576902883754137 | 0.0006358462645408662 | 0.000110341436468704 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(38) | 120020 | 0.0011612530899947071 | 0.000156828691499544 | 0.0006275959953652458 | 0.00011157842446601126 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(39) | 120020 | 0.0011281422037190403 | 0.0001579077388315349 | 0.0006177333611838878 | 0.00011280932688020262 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(4) | 120020 | 0.0026559214395789343 | 0.00008083533665168568 | 0.0013336367565298015 | 0.00004690057042169479 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(40) | 120020 | 0.0010929950735494298 | 0.00015900454451040253 | 0.0006063070195772152 | 0.00011403342862883858 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(41) | 120020 | 0.0010560147290847866 | 0.0001601180047088794 | 0.0005933780541521475 | 0.00011525027641290259 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(42) | 120020 | 0.001017390460841261 | 0.00016124746418335383 | 0.000599094126858723 | 0.00011645964642309938 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(43) | 120020 | 0.0009773460441069304 | 0.0001623926385026869 | 0.0006050555999460202 | 0.00011766151053675856 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(44) | 120020 | 0.0009360826841928738 | 0.00016355353608233346 | 0.0006103383824563062 | 0.00011885600240741063 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(45) | 120020 | 0.0008937889613649386 | 0.00016473038285442414 | 0.0006149471597372112 | 0.00012004338451754336 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(46) | 120020 | 0.0008506632557983007 | 0.0001659235516659209 | 0.0006188821069184806 | 0.00012122401697210473 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(47) | 120020 | 0.0008068980195605757 | 0.00016713349785885465 | 0.0006221497545991644 | 0.0001223983285625491 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(48) | 120020 | 0.0007896147337198567 | 0.00016836070194541197 | 0.0006247586044987942 | 0.00012356679042570688 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(49) | 120020 | 0.0007813002876806419 | 0.00016960561984326152 | 0.0006267190578076153 | 0.00012472989245866466 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(5) | 120020 | 0.0029688168527768344 | 0.00009639887167025354 | 0.001490500085090543 | 0.00005551628064397223 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(50) | 120020 | 0.0007720266325914604 | 0.0001708686407739378 | 0.0006280433374407711 | 0.00012588812252318309 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(51) | 120020 | 0.0007618275717362621 | 0.00017215005264150396 | 0.0006287488552897608 | 0.00012704194837627746 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(52) | 120020 | 0.0007507387525234055 | 0.00017345001449368957 | 0.0006288529785067694 | 0.00012819180219368525 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(53) | 120020 | 0.0007388015688321037 | 0.00017476853551227274 | 0.0006283678621153132 | 0.00012933806750368076 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(54) | 120020 | 0.0007260535782949162 | 0.0001761054598793633 | 0.0006273121239808511 | 0.0001304810683183667 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(55) | 120020 | 0.0007125331153647885 | 0.00017746045680992428 | 0.0006257057507988936 | 0.00013162106023257967 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(56) | 120020 | 0.0006982846404970378 | 0.0001788330150250945 | 0.0006235699997127587 | 0.00013275822325698928 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(57) | 120020 | 0.0006833547580951116 | 0.00018022244095436548 | 0.0006209357366443842 | 0.00013389265615669927 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(58) | 120020 | 0.0006677826479497551 | 0.00018162785999377735 | 0.0006178196471900693 | 0.00013502437207974841 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(59) | 120020 | 0.0006557496830967846 | 0.00018304822020409788 | 0.0006142446776933253 | 0.00013615329527945198 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(6) | 120020 | 0.0031120233224919414 | 0.00010843688213193295 | 0.001561972418567378 | 0.00006216219432354722 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(60) | 120020 | 0.0006637933870716761 | 0.00018448229790106279 | 0.0006102361443886804 | 0.00013727925875691986 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(61) | 120020 | 0.0006716764239103057 | 0.00018592870466474122 | 0.0006058225836447056 | 0.00013840200267588556 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(62) | 120020 | 0.0006793966831961651 | 0.00018738589537283773 | 0.0006010369083217713 | 0.0001395211734300221 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(63) | 120020 | 0.0006869520923242778 | 0.00018885217693686356 | 0.0005958978869249889 | 0.0001406363232685129 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(64) | 120020 | 0.000694340617666267 | 0.00019032571749090532 | 0.0005904333075473037 | 0.00014174691041182066 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(65) | 120020 | 0.0007015602656088582 | 0.00019180455584695067 | 0.0005846743809263482 | 0.00014285229961396825 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(66) | 120020 | 0.0007086090834746983 | 0.0001932866110845236 | 0.0005786553596171068 | 0.00014395176314711572 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(67) | 120020 | 0.0007154851603381474 | 0.00019476969218975687 | 0.0005723960513449225 | 0.00014504448220221234 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(68) | 120020 | 0.0007221866277782318 | 0.0001962515076960386 | 0.0005659252201660673 | 0.0001461295487135115 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(69) | 120020 | 0.0007287117514851449 | 0.00019772967530607184 | 0.0005592812653782764 | 0.0001472059676233697 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(7) | 120020 | 0.0031324387588749225 | 0.00011772962175247761 | 0.0015719245495620343 | 0.00006733766340807879 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(70) | 120020 | 0.0007350586968148942 | 0.0001992017314962668 | 0.0005524861066339964 | 0.00014827265961066277 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(71) | 120020 | 0.0007412256885166446 | 0.00020066514111751694 | 0.0005455654611508575 | 0.00014932846430881696 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(72) | 120020 | 0.0007472110346267158 | 0.00020211730701317904 | 0.0005385559660528963 | 0.00015037214403808071 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(73) | 120020 | 0.0007530130889550346 | 0.00020355557967739716 | 0.0005314819790060819 | 0.00015140238807355723 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(74) | 120020 | 0.000758630251722181 | 0.00020497726697556737 | 0.0005248694756253994 | 0.00015241781746544623 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(75) | 120020 | 0.0007640609702357359 | 0.00020637964394322074 | 0.0005237134748562986 | 0.00015341699041909618 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(76) | 120020 | 0.000769303739561078 | 0.00020775996267437312 | 0.0005224474625986355 | 0.00015439840823545283 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(77) | 120020 | 0.0007743571032243768 | 0.00020911546230110889 | 0.0005210861395827512 | 0.00015536052180126222 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(78) | 120020 | 0.0007792196539209151 | 0.00021044337906003162 | 0.0005196441223449267 | 0.0001563017386104813 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(79) | 120020 | 0.0007838900342262978 | 0.00021174095643079803 | 0.0005181379795034151 | 0.00015722043028627811 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(8) | 120020 | 0.003065552178890263 | 0.00012486864972872735 | 0.00153796394942759 | 0.00007140567440298375 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(80) | 120020 | 0.0007883669373136559 | 0.0002130054553267786 | 0.0005165844433872339 | 0.00015811494056649486 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(81) | 120020 | 0.0007926491076692965 | 0.00021423416430870355 | 0.0005149928983215287 | 0.00015898359370357788 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(82) | 120020 | 0.0007967353417943634 | 0.0002154244097880728 | 0.0005133771015520396 | 0.00015982470322496343 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(83) | 120020 | 0.0008006244888929537 | 0.00021657356618136553 | 0.0005117504808739127 | 0.0001606365809918383 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(84) | 120020 | 0.0008043154515371409 | 0.00021767906597187442 | 0.0005101269593571548 | 0.00016141754648797102 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(85) | 120020 | 0.0008078071863173442 | 0.00021873840963468544 | 0.0005085477966089457 | 0.00016216593626775528 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(86) | 120020 | 0.0008110987044500639 | 0.00021974917537693928 | 0.0005111498364293677 | 0.00016288011348755753 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(87) | 120020 | 0.0008141890723623035 | 0.00022070902864604873 | 0.0005135976727641371 | 0.00016355847744347552 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(88) | 120020 | 0.0008170774122449043 | 0.00022161573135714974 | 0.0005158897091539563 | 0.000164199473036559 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(89) | 120020 | 0.000819762902563026 | 0.0002224671507939848 | 0.0005180244443677062 | 0.0001648016000889801 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(9) | 120020 | 0.003056003790651518 | 0.0001303114262447239 | 0.001538465474470368 | 0.00007463739595729919 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(90) | 120020 | 0.0008222447785355413 | 0.00022326126813635707 | 0.0005200004746558626 | 0.00016536342243273592 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(91) | 120020 | 0.0008245223325709095 | 0.00022399618657036846 | 0.0005218164958711312 | 0.00016588357669638907 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(92) | 120020 | 0.0008265949146799567 | 0.00022467013894056633 | 0.0005234713054378566 | 0.00016636078071811592 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(93) | 120020 | 0.0008284619328329246 | 0.0002252814949041468 | 0.0005249638041811443 | 0.0001667938415155886 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(94) | 120020 | 0.0008301228532869853 | 0.0002258287675513744 | 0.0005262929979935523 | 0.00016718166274849012 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(95) | 120020 | 0.000831577200889777 | 0.00022631061945911152 | 0.0005274579993549608 | 0.0001675232516132564 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(96) | 120020 | 0.000832824559325207 | 0.00022672586814756574 | 0.000528458028686894 | 0.00016781772511514852 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(97) | 120020 | 0.000833864571348597 | 0.00022707349091325904 | 0.0005292924155472884 | 0.00016806431566781862 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(98) | 120020 | 0.0008346969389660952 | 0.00022735262901525582 | 0.0005299605996531184 | 0.0001682623759763789 | 120020 / 0 |
| corpus-g/rom-autosize-rc-ladder100-cir | 0 / tran | v(99) | 120020 | 0.0008353214235994333 | 0.00022756259119387017 | 0.0005304621317446411 | 0.00016841138316536005 | 120020 / 0 |
| corpus-g/semic-capacitor-semicap-subc-cir | 0 / tran | i(vin) | 20017 | 6.725515728022565e-7 | 1.9392315077821457e-8 | 976.0746541897412 | 9.831760527041132 | 10008 / 10009 |
| corpus-g/semic-capacitor-semicap-subc-cir | 0 / tran | i(vmon) | 20017 | 6.725515727995273e-7 | 1.9392315077812583e-8 | 976.0746575157945 | 9.831760561192862 | 10008 / 10009 |
| corpus-g/semic-capacitor-semicap-subc-cir | 0 / tran | v(1) | 20017 | 3.388234137702284e-12 | 4.494046017105595e-14 | 1.254196648102649e-10 | 1.551472886344553e-12 | 10009 / 10008 |
| corpus-g/semic-capacitor-semicap-subc-cir | 0 / tran | v(2) | 20017 | 0.0006725515728022158 | 0.000019392315078935568 | 0.7833687605771116 | 0.007879389035419355 | 10009 / 10008 |
| corpus-g/semic-capacitor-semicap-subc-cir | 0 / tran | v(3) | 20017 | 0.0006725515728022158 | 0.000019392315078935568 | 0.7833687605771116 | 0.007879389035419355 | 10009 / 10008 |
| corpus-g/semic-resistor-semic-resistor-cir | 0 / dc | i(vin) | 6 | 4.336808689942018e-19 | 1.770494733737654e-19 | 2.1684043449710094e-16 | 9.697399036122162e-17 | 5 / 1 |
| corpus-g/semic-resistor-semic-resistor-cir | 0 / dc | i(vmon) | 6 | 4.336808689942018e-19 | 1.770494733737654e-19 | 2.1684043449710094e-16 | 9.697399036122162e-17 | 5 / 1 |
| corpus-g/semic-resistor-semic-resistor-cir | 0 / dc | v(1) | 6 | 0 | 0 | 0 | 0 | 5 / 1 |
| corpus-g/semic-resistor-semic-resistor-cir | 0 / dc | v(2) | 6 | 0 | 0 | 0 | 0 | 5 / 1 |
| corpus-g/soln-dep-res-multsoldepres-cir | 0 / dc | i(v1) | 1 | 2.220446049250313e-16 | 2.220446049250313e-16 | 1.6653345369377348e-16 | 1.6653345369377348e-16 | 1 / 0 |
| corpus-g/soln-dep-res-multsoldepres-cir | 0 / dc | i(v12) | 1 | 2.220446049250313e-16 | 2.220446049250313e-16 | 1.6653345369377348e-16 | 1.6653345369377348e-16 | 1 / 0 |
| corpus-g/soln-dep-res-multsoldepres-cir | 0 / dc | i(v13) | 1 | 2.220446049250313e-16 | 2.220446049250313e-16 | 1.6653345369377348e-16 | 1.6653345369377348e-16 | 1 / 0 |
| corpus-g/soln-dep-res-multsoldepres-cir | 0 / dc | i(vcontrol) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-g/soln-dep-res-multsoldepres-cir | 0 / dc | v(1) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-g/soln-dep-res-multsoldepres-cir | 0 / dc | v(12) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-g/soln-dep-res-multsoldepres-cir | 0 / dc | v(13) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-g/soln-dep-res-multsoldepres-cir | 0 / dc | v(2) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-g/soln-dep-res-multsoldepres-cir | 0 / dc | v(22) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-g/soln-dep-res-multsoldepres-cir | 0 / dc | v(23) | 1 | 1.1102230246251565e-16 | 1.1102230246251565e-16 | 1.6653345369377348e-16 | 1.6653345369377348e-16 | 1 / 0 |
| corpus-g/soln-dep-res-multsoldepres-cir | 0 / dc | v(cntl) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-g/subckt-subckt-a0-cir | 0 / tran | i(vdddev) | 1987 | 0.0008460751687503975 | 0.00013413241198818868 | 1345.8588952290115 | 50.44348362500329 | 1987 / 0 |
| corpus-g/subckt-subckt-a0-cir | 0 / tran | i(vin1) | 1987 | 0.00018749291102367104 | 0.00001176963245998205 | 504295.4041738132 | 11698.28061761938 | 1904 / 83 |
| corpus-g/subckt-subckt-a0-cir | 0 / tran | v(1) | 1987 | 6.777689520731656e-12 | 8.405755219713032e-13 | 1 | 0.10986647720589478 | 1061 / 926 |
| corpus-g/subckt-subckt-a0-cir | 0 / tran | v(in) | 1987 | 0.1874929110244703 | 0.01176963245995984 | 15369.451420542286 | 819.9363779601363 | 1987 / 0 |
| corpus-g/subckt-subckt-a0-cir | 0 / tran | v(mid) | 1987 | 0.3610742716378681 | 0.036549333029638226 | 35320936.65484929 | 852303.7314706214 | 1987 / 0 |
| corpus-g/subckt-subckt-a0-cir | 0 / tran | v(out) | 1987 | 1.4227018895089623 | 0.09173121296246922 | 7563.952480207067 | 478.2075579400616 | 1987 / 0 |
| corpus-g/subckt-subckt-a0-cir | 0 / tran | v(vdd) | 1987 | 0 | 0 | 0 | 0 | 1987 / 0 |
| corpus-g/users-guide-diodeclipper-cir | 0 / tran | i(vcc) | 1000008 | 0.000012508784653947742 | 0.0000012500562085899568 | 254.67566173720826 | 0.4189066810850891 | 1000008 / 0 |
| corpus-g/users-guide-diodeclipper-cir | 0 / tran | i(vin) | 1000008 | 0.000009561099413727195 | 0.000002879517231325422 | 468.0158517332673 | 0.47568681564977455 | 1000008 / 0 |
| corpus-g/users-guide-diodeclipper-cir | 0 / tran | v(1) | 1000008 | 0 | 0 | 0 | 0 | 1000008 / 0 |
| corpus-g/users-guide-diodeclipper-cir | 0 / tran | v(2) | 1000008 | 0.01164845756245958 | 0.0014501577862804824 | 46.75577489109853 | 0.06260143072406879 | 1000008 / 0 |
| corpus-g/users-guide-diodeclipper-cir | 0 / tran | v(3) | 1000008 | 0.009630868128899905 | 0.0032624139299134293 | 6.1535182895195515 | 0.007823291969725758 | 1000007 / 1 |
| corpus-g/users-guide-diodeclipper-cir | 0 / tran | v(4) | 1000008 | 0.0120965759029803 | 0.0015342414126384828 | 101.42018092705484 | 0.1205610158084941 | 1000007 / 1 |
| corpus-g/vexp-vexp-cir | 0 / tran | i(vexp) | 58 | 0.0000042478614942168674 | 0.0000013753592268987633 | 0.0004378283422961447 | 0.00020838349610844455 | 40 / 18 |
| corpus-g/vexp-vexp-cir | 0 / tran | v(1) | 58 | 0.002123930747107927 | 0.0006876796134494085 | 0.00043782834229604033 | 0.00020838349610845933 | 40 / 18 |
| corpus-g/vpulse-vpulse-cir | 0 / tran | i(vpulse) | 68 | 1.3010426069826053e-18 | 4.327060354942865e-19 | 3.397231516293054e-15 | 6.802048820101024e-16 | 66 / 2 |
| corpus-g/vpulse-vpulse-cir | 0 / tran | v(1) | 68 | 4.440892098500626e-16 | 1.6538369838912694e-16 | 2.9817986337292176e-15 | 6.37090764425173e-16 | 66 / 2 |
| corpus-g/vpwl-vpwl-cir | 0 / tran | i(vpwl1) | 3146 | 1.474514954580286e-17 | 7.149611073950741e-19 | 1.2092242355352252e-13 | 2.6799167955292536e-15 | 3144 / 2 |
| corpus-g/vpwl-vpwl-cir | 0 / tran | i(vpwl2) | 3146 | 1.474514954580286e-17 | 7.149611073950741e-19 | 1.2092242355352252e-13 | 2.6799167955292536e-15 | 3144 / 2 |
| corpus-g/vpwl-vpwl-cir | 0 / tran | i(vpwl3) | 3146 | 1.474514954580286e-17 | 7.149611073950741e-19 | 1.2092242355352252e-13 | 2.6799167955292536e-15 | 3144 / 2 |
| corpus-g/vpwl-vpwl-cir | 0 / tran | i(vpwl4) | 3146 | 1.7765736798347476e-15 | 5.488388865135873e-17 | 1.7765736798344317e-12 | 3.343149107172008e-14 | 3037 / 109 |
| corpus-g/vpwl-vpwl-cir | 0 / tran | i(vpwl5) | 3146 | 0.005999999999999998 | 0.00010697243734810035 | 1 | 0.018151839895669614 | 3035 / 111 |
| corpus-g/vpwl-vpwl-cir | 0 / tran | i(vpwl6) | 3146 | 0.004 | 0.00015946509441945985 | 0.6666666666666666 | 0.0270725487627465 | 3032 / 114 |
| corpus-g/vpwl-vpwl-cir | 0 / tran | v(1) | 3146 | 7.105427357601002e-15 | 3.483758541718125e-16 | 9.214851104655143e-14 | 1.7364261188928775e-15 | 3144 / 2 |
| corpus-g/vpwl-vpwl-cir | 0 / tran | v(2) | 3146 | 7.105427357601002e-15 | 3.483758541718125e-16 | 9.214851104655143e-14 | 1.7364261188928775e-15 | 3144 / 2 |
| corpus-g/vpwl-vpwl-cir | 0 / tran | v(3) | 3146 | 7.105427357601002e-15 | 3.483758541718125e-16 | 9.214851104655143e-14 | 1.7364261188928775e-15 | 3144 / 2 |
| corpus-g/vpwl-vpwl-cir | 0 / tran | v(4) | 3146 | 8.886225089099753e-13 | 2.7442098953838455e-14 | 1.7764678617023973e-12 | 3.34273752303455e-14 | 3037 / 109 |
| corpus-g/vpwl-vpwl-cir | 0 / tran | v(5) | 3146 | 3 | 0.05348621867405019 | 1 | 0.018151839895669614 | 3035 / 111 |
| corpus-g/vpwl-vpwl-cir | 0 / tran | v(6) | 3146 | 2 | 0.07973254720972993 | 0.6666666666666666 | 0.0270725487627465 | 3032 / 114 |
| corpus-g/vsffm-vsffm-cir | 0 / tran | i(vssfm) | 1008 | 0.0007263524641782926 | 0.00020632206503411575 | 0.0072411003275050095 | 0.00041931395294188316 | 1007 / 1 |
| corpus-g/vsffm-vsffm-cir | 0 / tran | v(1) | 1008 | 0.0007263524641782926 | 0.00020632206503411575 | 0.0072411003275050095 | 0.00041931395294188316 | 1007 / 1 |
| corpus-g/vsin-bug1679-cir | 0 / tran | i(vvinp) | 1000008 | 3.231808066901445e-11 | 9.31726677046152e-12 | 0.9997513204425307 | 0.013989021367912911 | 999989 / 19 |
| corpus-g/vsin-bug1679-cir | 0 / tran | v(vinp) | 1000008 | 0.003231808066900488 | 0.0009317266770461747 | 0.9997513204425252 | 0.014338716889019104 | 1000006 / 2 |
| corpus-g/vstartest-vstartest-cir | 0 / tran | i(vdddev) | 374 | 0.0002068737435669489 | 0.000031628319142460366 | 214.08709241274153 | 13.877964344481363 | 374 / 0 |
| corpus-g/vstartest-vstartest-cir | 0 / tran | i(vin1) | 374 | 0.00013808335441141417 | 0.00002218185476796836 | 11314.299796536272 | 1489.6901686074402 | 291 / 83 |
| corpus-g/vstartest-vstartest-cir | 0 / tran | v(1) | 374 | 8.473222123939195e-13 | 9.35983253647962e-14 | 1.233345738038749e-12 | 1.2340145471790332e-13 | 204 / 170 |
| corpus-g/vstartest-vstartest-cir | 0 / tran | v(in) | 374 | 0.13808335441141528 | 0.022181854767957795 | 11314.299797105074 | 1313.9825038198287 | 374 / 0 |
| corpus-g/vstartest-vstartest-cir | 0 / tran | v(vdd) | 374 | 0 | 0 | 0 | 0 | 374 / 0 |
| corpus-g/vstartest-vstartest-cir | 0 / tran | v(vout) | 374 | 0.9235774493811877 | 0.10339887234431867 | 860.1813562400564 | 48.828858155826936 | 374 / 0 |
| corpus-g/xdm-hspice-controlled-sources-current-controlled-sources-w-extraneous-identifiers-cir | 0 / dc | i(h1) | 11 | 6.938893903907228e-18 | 2.816650180058294e-18 | 2.3129646346357425e-16 | 1.228148163574804e-16 | 10 / 1 |
| corpus-g/xdm-hspice-controlled-sources-current-controlled-sources-w-extraneous-identifiers-cir | 0 / dc | i(h2) | 11 | 1.3877787807814457e-17 | 4.468845532040982e-18 | 1.7347234759768068e-16 | 9.865938230014407e-17 | 10 / 1 |
| corpus-g/xdm-hspice-controlled-sources-current-controlled-sources-w-extraneous-identifiers-cir | 0 / dc | i(va) | 11 | 0 | 0 | 0 | 0 | 10 / 1 |
| corpus-g/xdm-hspice-controlled-sources-current-controlled-sources-w-extraneous-identifiers-cir | 0 / dc | v(1) | 11 | 8.881784197001252e-16 | 2.67795869548738e-16 | 1.4802973661668753e-16 | 4.681111291435601e-17 | 10 / 1 |
| corpus-g/xdm-hspice-controlled-sources-current-controlled-sources-w-extraneous-identifiers-cir | 0 / dc | v(2) | 11 | 1.7763568394002505e-15 | 5.988097684046441e-16 | 2.5376526277146434e-16 | 9.290296632092876e-17 | 10 / 1 |
| corpus-g/xdm-hspice-controlled-sources-current-controlled-sources-w-extraneous-identifiers-cir | 0 / dc | v(3) | 11 | 0 | 0 | 0 | 0 | 10 / 1 |
| corpus-g/xdm-hspice-controlled-sources-current-controlled-sources-w-extraneous-identifiers-cir | 0 / dc | v(4) | 11 | 8.881784197001252e-16 | 2.67795869548738e-16 | 1.4802973661668753e-16 | 4.681111291435601e-17 | 10 / 1 |
| corpus-g/xdm-hspice-controlled-sources-current-controlled-sources-w-extraneous-identifiers-cir | 0 / dc | v(5) | 11 | 5.551115123125783e-17 | 1.6737241846796126e-17 | 1.850371707708594e-16 | 5.851389114294501e-17 | 10 / 1 |
| corpus-g/xdm-hspice-controlled-sources-current-controlled-sources-w-extraneous-identifiers-cir | 0 / dc | v(6) | 11 | 1.1102230246251565e-16 | 4.511493967785517e-17 | 2.4671622769447924e-16 | 1.3893164088305048e-16 | 10 / 1 |
| corpus-g/xdm-hspice-controlled-sources-current-controlled-sources-w-extraneous-identifiers-cir | 0 / dc | v(7) | 11 | 2.220446049250313e-16 | 9.468013766583036e-17 | 1.850371707708594e-16 | 7.706734582308258e-17 | 10 / 1 |
| corpus-g/xdm-hspice-controlled-sources-current-controlled-sources-w-extraneous-identifiers-cir | 0 / dc | v(8) | 11 | 1.1102230246251565e-16 | 5.292780598495874e-17 | 1.850371707708594e-16 | 9.379476408978138e-17 | 10 / 1 |
| corpus-g/xdm-hspice-controlled-sources-current-controlled-sources-w-extraneous-identifiers-cir | 0 / dc | v(in) | 11 | 0 | 0 | n/a | n/a | 0 / 11 |
| corpus-h/kicad-qa-data-eeschema-spice-netlists-legacy-pspice-legacy-pspice-spice | 0 / ac | i(l1) | 501 | 0.0000037679755743904304 | 4.02160514023659e-7 | 0.000012851975509177048 | 0.000012024597932984262 | 501 / 0 |
| corpus-h/kicad-qa-data-eeschema-spice-netlists-legacy-pspice-legacy-pspice-spice | 0 / ac | i(l2) | 501 | 4.310602689433149e-7 | 6.462617888191413e-8 | 0.000012852080643690952 | 0.000012024607305895121 | 501 / 0 |
| corpus-h/kicad-qa-data-eeschema-spice-netlists-legacy-pspice-legacy-pspice-spice | 0 / ac | i(v1) | 501 | 5.518655529411384e-7 | 1.4589566971756316e-7 | 0.000012566787577765462 | 0.000011019708004737385 | 501 / 0 |
| corpus-h/kicad-qa-data-eeschema-spice-netlists-legacy-pspice-legacy-pspice-spice | 0 / ac | i(v2) | 501 | 1.2321340415393868e-9 | 1.1265237365984148e-9 | 0.0000049349985906898935 | 0.000004620839711683154 | 501 / 0 |
| corpus-h/kicad-qa-data-eeschema-spice-netlists-legacy-pspice-legacy-pspice-spice | 0 / ac | v(+12v) | 501 | 0 | 0 | n/a | n/a | 0 / 501 |
| corpus-h/kicad-qa-data-eeschema-spice-netlists-legacy-pspice-legacy-pspice-spice | 0 / ac | v(/vbase) | 501 | 0.0002367145319080525 | 0.00021222834485567677 | 0.000012421471436770227 | 0.000011923656742853064 | 501 / 0 |
| corpus-h/kicad-qa-data-eeschema-spice-netlists-legacy-pspice-legacy-pspice-spice | 0 / ac | v(/vin) | 501 | 0.000002467398268725059 | 9.969870932822822e-7 | 0.00000478560298119472 | 0.0000017321077525181322 | 501 / 0 |
| corpus-h/kicad-qa-data-eeschema-spice-netlists-legacy-pspice-legacy-pspice-spice | 0 / ac | v(net-_c3-pad1_) | 501 | 0.0013828090938201884 | 0.0002535278347074275 | 0.000012852080643896226 | 0.0000120246030023272 | 501 / 0 |
| corpus-h/kicad-qa-data-eeschema-spice-netlists-legacy-pspice-legacy-pspice-spice | 0 / ac | v(net-_c4-pad2_) | 501 | 0.000005402595123590327 | 0.0000012875263139500595 | 0.00001285197538397969 | 0.000012024597932981608 | 501 / 0 |
| corpus-h/kicad-qa-data-eeschema-spice-netlists-legacy-pspice-legacy-pspice-spice | 0 / ac | v(net-_l2-pad1_) | 501 | 0.00023758991817452712 | 0.00021175929811843755 | 0.00001285208064526544 | 0.000012024603000217964 | 501 / 0 |
| corpus-h/kicad-qa-data-eeschema-spice-netlists-legacy-pspice-legacy-pspice-spice | 0 / ac | v(net-_q1-e_) | 501 | 0.00023910028268206386 | 0.0002132317647773923 | 0.000012852080645129897 | 0.000012024603000832638 | 501 / 0 |
| corpus-h/kicad-qa-data-eeschema-spice-netlists-legacy-pspice-legacy-pspice-spice | 0 / ac | v(net-_q2-c_) | 501 | 0.00024644065099310416 | 0.00022717676845809408 | 0.000011823318431049592 | 0.000011331576252632724 | 501 / 0 |
| corpus-h/kicad-qa-data-eeschema-spice-netlists-legacy-pspice-legacy-pspice-spice | 0 / ac | v(net-_q2-e_) | 501 | 0.000004307204765029842 | 0.000003938505620914592 | 0.000005246849309621637 | 0.0000049142409187484916 | 501 / 0 |
| corpus-h/kicad-qa-data-eeschema-spice-netlists-legacy-pspice-legacy-pspice-spice | 0 / ac | v(net-_q3-b_) | 501 | 0.000008157094786736831 | 0.000007524047809742311 | 0.000012420250705633589 | 0.000011923114230012177 | 501 / 0 |
| corpus-h/kicad-qa-data-eeschema-spice-netlists-legacy-pspice-legacy-pspice-spice | 0 / ac | v(net-_v2-e1_) | 501 | 0 | 0 | 0 | 0 | 501 / 0 |
| corpus-h/kicad-qa-data-eeschema-spice-netlists-legacy-pspice-legacy-pspice-spice | 0 / ac | v(vout) | 501 | 0.01187094544776894 | 0.0012508307823385014 | 0.000012851975512852911 | 0.00001202459793257785 | 501 / 0 |
| corpus-h/pyspice-examples-spice-examples-ac-coupled-transistor-amplifier-cir | 0 / tran | i(vcc) | 10008 | 0.000008459793150199972 | 0.0000022905770586676036 | 0.011800570135416459 | 0.002865553203248848 | 10008 / 0 |
| corpus-h/pyspice-examples-spice-examples-ac-coupled-transistor-amplifier-cir | 0 / tran | i(vin) | 10008 | 5.439061267110227e-7 | 1.4570651262051977e-7 | 32.30748276931875 | 0.3732860562950927 | 10007 / 1 |
| corpus-h/pyspice-examples-spice-examples-ac-coupled-transistor-amplifier-cir | 0 / tran | v(1) | 10008 | 0.008848271679707365 | 0.002369289688036414 | 54.607323172352956 | 0.924059697021492 | 10007 / 1 |
| corpus-h/pyspice-examples-spice-examples-ac-coupled-transistor-amplifier-cir | 0 / tran | v(base) | 10008 | 0.008872647541813272 | 0.0023728072592240188 | 0.006067212302317789 | 0.001477890412992263 | 10008 / 0 |
| corpus-h/pyspice-examples-spice-examples-ac-coupled-transistor-amplifier-cir | 0 / tran | v(coll) | 10008 | 0.033339226539909284 | 0.009025640326195211 | 0.007729062046324149 | 0.0015263360728465212 | 10008 / 0 |
| corpus-h/pyspice-examples-spice-examples-ac-coupled-transistor-amplifier-cir | 0 / tran | v(emit) | 10008 | 0.008634000644657247 | 0.0023374117069823873 | 0.015606581998258772 | 0.0035771612539828236 | 10008 / 0 |
| corpus-h/pyspice-examples-spice-examples-ac-coupled-transistor-amplifier-cir | 0 / tran | v(vcc) | 10008 | 0 | 0 | 0 | 0 | 10008 / 0 |
| corpus-h/pyspice-examples-spice-examples-low-pass-rc-filter-cir | 0 / ac | i(vinput) | 4 | 1.9775572340427743e-19 | 1.6367509451428026e-19 | 3.1474422166300685e-14 | 1.5792562758460583e-14 | 4 / 0 |
| corpus-h/pyspice-examples-spice-examples-low-pass-rc-filter-cir | 0 / ac | v(in) | 4 | 0 | 0 | 0 | 0 | 4 / 0 |
| corpus-h/pyspice-examples-spice-examples-low-pass-rc-filter-cir | 0 / ac | v(out) | 4 | 1.2412670766236366e-16 | 1.088461226848233e-16 | 5.375258584676795e-16 | 2.895334633212454e-16 | 4 / 0 |
| corpus-h/pyspice-examples-spice-examples-voltage-divider-cir | 0 / op | i(vinput) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-h/pyspice-examples-spice-examples-voltage-divider-cir | 0 / op | v(in) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-h/pyspice-examples-spice-examples-voltage-divider-cir | 0 / op | v(out) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-h/spicelib-examples-testfiles-dc-rawtest-net | 0 / dc | i(v1) | 6 | 0 | 0 | 0 | 0 | 5 / 1 |
| corpus-h/spicelib-examples-testfiles-dc-rawtest-net | 0 / dc | v(r) | 6 | 0 | 0 | 0 | 0 | 5 / 1 |
| corpus-h/spicelib-examples-testfiles-testfile-ngspice-net | 0 / op | i(v1) | 1 | 0 | 0 | n/a | n/a | 0 / 1 |
| corpus-h/spicelib-examples-testfiles-testfile-ngspice-net | 0 / op | v(in) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-h/spicelib-examples-testfiles-testfile-ngspice-net | 0 / op | v(out) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-h/spicesharpparser-src-spicesharpparser-integrationtests-examples-circuits-example06-cir | 0 / op | i(b1) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-h/spicesharpparser-src-spicesharpparser-integrationtests-examples-circuits-example06-cir | 0 / op | v(1) | 1 | 0 | 0 | 0 | 0 | 1 / 0 |
| corpus-h/spicesharpparser-src-spicesharpparser-integrationtests-examples-circuits-example08-cir | 0 / tran | i(v1) | 1011 | 0.00098999999999999 | 0.00007036783389785817 | 99.000098999999 | 3.5779673092172772 | 1011 / 0 |
| corpus-h/spicesharpparser-src-spicesharpparser-integrationtests-examples-circuits-example08-cir | 0 / tran | v(in) | 1011 | 9.9 | 0.703678338978666 | 99 | 3.5779637312535986 | 1011 / 0 |
| corpus-h/spicesharpparser-src-spicesharpparser-integrationtests-examples-circuits-example08-cir | 0 / tran | v(out) | 1011 | 1.2502018260050762e-8 | 8.356495504411185e-9 | 0.00000770080339173143 | 0.0000026172976533489134 | 1011 / 0 |
| corpus-h/spicesharpparser-src-spicesharpparser-integrationtests-examples-circuits-example09-cir | 0 / tran | v(1) | 59 | 0 | 0 | n/a | n/a | 0 / 59 |
| corpus-h/spicesharpparser-src-spicesharpparser-integrationtests-examples-circuits-example09-cir | 1 / ac | v(1) | 1000 | 0 | 0 | 0 | 0 | 1000 / 0 |
| corpus-h/spicesharpparser-src-spicesharpparser-integrationtests-examples-circuits-example03-cir | 0 / dc | i(v1) | 200 | 0.000032213233900402205 | 0.000008619193515274073 | 0.0003889153793285143 | 0.00017702226050612374 | 199 / 1 |
| corpus-h/spicesharpparser-src-spicesharpparser-integrationtests-examples-circuits-example03-cir | 0 / dc | v(out) | 200 | 0 | 0 | 0 | 0 | 199 / 1 |
| corpus-h/xictools-wrspice-devlib-jfet2-docs-id-cir | 0 / dc | i(vds) | 305 | 0.00035641385183358677 | 0.0001537856385041423 | 10.65355531140086 | 8.641056533347038 | 304 / 1 |
| corpus-h/xictools-wrspice-devlib-jfet2-docs-id-cir | 0 / dc | i(vgs) | 305 | 3.029488912210811e-17 | 1.7531282431857498e-18 | 0.00018934305701317567 | 0.000010926539171603501 | 304 / 1 |
| corpus-h/xictools-wrspice-devlib-jfet2-docs-id-cir | 0 / dc | v(1) | 305 | 0 | 0 | 0 | 0 | 244 / 61 |
| corpus-h/xictools-wrspice-devlib-jfet2-docs-id-cir | 0 / dc | v(2) | 305 | 0 | 0 | 0 | 0 | 300 / 5 |
| corpus-i/esim-examples-parallel-resonance-parallel-resonance-cir-out | 0 / ac | i(l1) | 20 | 4.4702800766818725e-19 | 2.073554128319543e-19 | 3.101814949496444e-15 | 1.1718012788395294e-15 | 20 / 0 |
| corpus-i/esim-examples-parallel-resonance-parallel-resonance-cir-out | 0 / ac | i(v1) | 20 | 2.170785317945311e-19 | 1.0073711241851622e-19 | 2.3122571208709945e-16 | 1.0459696466801867e-16 | 20 / 0 |
| corpus-i/esim-examples-parallel-resonance-parallel-resonance-cir-out | 0 / ac | v(in) | 20 | 0.24341937274190192 | 0.12680490915260595 | 0.2545709232987631 | 0.12747167047059385 | 20 / 0 |
| corpus-i/esim-examples-parallel-resonance-parallel-resonance-cir-out | 0 / ac | v(out) | 20 | 0.24341937274190192 | 0.12680490915260595 | 12.446934100968312 | 4.453915218718078 | 20 / 0 |
| corpus-i/esim-examples-rc-rc-cir-out | 0 / tran | i(v1) | 77 | 0.000008453088471444426 | 0.0000035084458808507295 | 0.021984819765107827 | 0.0104937076253111 | 76 / 1 |
| corpus-i/esim-examples-rc-rc-cir-out | 0 / tran | v(in) | 77 | 59.153064604522534 | 19.866459562258346 | 78.51418019601726 | 9.355942325612705 | 76 / 1 |
| corpus-i/esim-examples-rc-rc-cir-out | 0 / tran | v(out) | 77 | 59.153737943121634 | 19.86786757806873 | 77.28094844972313 | 9.45451812200508 | 76 / 1 |
| corpus-i/vacask-test-spice-cccs-cir | 0 / tran | i(vin) | 10008 | 0 | 0 | 0 | 0 | 10008 / 0 |
| corpus-i/vacask-test-spice-cccs-cir | 0 / tran | i(vsense) | 10008 | 0 | 0 | 0 | 0 | 10008 / 0 |
| corpus-i/vacask-test-spice-cccs-cir | 0 / tran | v(1) | 10008 | 0 | 0 | 0 | 0 | 10008 / 0 |
| corpus-i/vacask-test-spice-cccs-cir | 0 / tran | v(2) | 10008 | 0 | 0 | 0 | 0 | 10008 / 0 |
| corpus-i/vacask-test-spice-cccs-cir | 0 / tran | v(sp) | 10008 | 0 | 0 | n/a | n/a | 0 / 10008 |
| corpus-i/vacask-test-spice-diode-cir | 0 / tran | i(vin) | 1008 | 0.0000019970319289088455 | 2.592045271081092e-7 | 80.94373956050957 | 2.6095143124418563 | 1007 / 1 |
| corpus-i/vacask-test-spice-diode-cir | 0 / tran | v(1) | 1008 | 0.0012777254702116547 | 0.00040404457609351805 | 0.0010237780050707064 | 0.0002994218661151749 | 1007 / 1 |
| corpus-i/vacask-test-spice-diode-cir | 0 / tran | v(2) | 1008 | 0.001997031928908731 | 0.00025920452710785657 | 80.9438155874752 | 2.60951665381239 | 1007 / 1 |
| corpus-i/vacask-test-spice-mos-cir | 0 / tran | i(vdd) | 10020 | 3.4220807677357566e-7 | 4.200325602013675e-9 | 15.60611354930325 | 0.2649581302212056 | 10020 / 0 |
| corpus-i/vacask-test-spice-mos-cir | 0 / tran | i(vin) | 10020 | 2.3274122313819377e-9 | 4.1108161948622306e-11 | 1.1136557110063994 | 0.6834655714808454 | 8 / 10012 |
| corpus-i/vacask-test-spice-mos-cir | 0 / tran | v(in) | 10020 | 1.7346124536743446e-12 | 1.7530712622716644e-14 | 1 | 0.01578969237952532 | 4011 / 6009 |
| corpus-i/vacask-test-spice-mos-cir | 0 / tran | v(out) | 10020 | 0.003422080767735869 | 0.00004200325602013431 | 0.0025963733179178816 | 0.000040289557876079005 | 10020 / 0 |
| corpus-i/vacask-test-spice-mos-cir | 0 / tran | v(vdd) | 10020 | 0 | 0 | 0 | 0 | 10020 / 0 |
| corpus-i/vacask-test-spice-rc-cir | 0 / tran | i(v1) | 10024 | 0.0000028173425522027597 | 7.310487827918035e-7 | 0.005869946093030087 | 0.0004661601785897958 | 9016 / 1008 |
| corpus-i/vacask-test-spice-rc-cir | 0 / tran | v(1) | 10024 | 4.3369752233957115e-12 | 6.25836057595944e-14 | 1 | 0.02231609213387259 | 4016 / 6008 |
| corpus-i/vacask-test-spice-rc-cir | 0 / tran | v(2) | 10024 | 0.002817342552202895 | 0.0007310487827910899 | 0.8863151008251023 | 0.00951312347777271 | 9016 / 1008 |
| corpus-i/vacask-test-spice-regressions-cir | 0 / tran | i(l1) | 2065 | 0.0000036561743391107928 | 2.995831620191823e-7 | 52989.896757723305 | 2507.1139028559955 | 1913 / 152 |
| corpus-i/vacask-test-spice-regressions-cir | 0 / tran | i(v1) | 2065 | 0.0000036488645991851503 | 2.98983694979898e-7 | 57578.058970995706 | 2171.4507463127775 | 1913 / 152 |
| corpus-i/vacask-test-spice-regressions-cir | 0 / tran | v(mid) | 2065 | 0.0036488645991851146 | 0.0002989836949869222 | 57577.99964662774 | 2410.840479662009 | 1957 / 108 |
| corpus-i/vacask-test-spice-regressions-cir | 0 / tran | v(out) | 2065 | 0.0000073097399256767535 | 5.99578405570787e-7 | 9883282.068978123 | 1150327.6591281742 | 1935 / 130 |
| corpus-i/vacask-test-spice-regressions-cir | 0 / tran | v(supply) | 2065 | 1.6940893132755264e-12 | 5.85602245222616e-14 | 1 | 0.04902903378454601 | 832 / 1233 |
| corpus-i/vacask-test-spice-subckt-cir | 0 / tran | i(vin) | 10022 | 0.0000011833218033778688 | 3.4848231830801035e-7 | 0.0056503195009335715 | 0.0003941302904578356 | 10021 / 1 |
| corpus-i/vacask-test-spice-subckt-cir | 0 / tran | v(in) | 10022 | 4.3369752233957115e-12 | 4.383395102752966e-14 | 1 | 0.022302213102656416 | 4021 / 6001 |
| corpus-i/vacask-test-spice-subckt-cir | 0 / tran | v(out1) | 10022 | 0.00236664360675487 | 0.0006969646366165321 | 0.1623745260951434 | 0.003042820733918452 | 10021 / 1 |
| corpus-i/vacask-test-spice-vcvs-cir | 0 / tran | i(e1) | 5008 | 0.0000013179436900209035 | 3.8969622434155816e-7 | 0.0035329116603257755 | 0.00029537660083010705 | 5006 / 2 |
| corpus-i/vacask-test-spice-vcvs-cir | 0 / tran | i(vin) | 5008 | 0 | 0 | n/a | n/a | 0 / 5008 |
| corpus-i/vacask-test-spice-vcvs-cir | 0 / tran | v(1) | 5008 | 0.0006589718450104032 | 0.00019484811217077922 | 0.0035329116601782867 | 0.00029534710300152534 | 5007 / 1 |
| corpus-i/vacask-test-spice-vcvs-cir | 0 / tran | v(2) | 5008 | 0.0013179436900210284 | 0.0003896962243415565 | 0.003532911660178039 | 0.00029534710300152355 | 5007 / 1 |
| corpus-i/vacask-test-spice-warnonly-cir | 0 / tran | i(l1) | 10008 | 0 | 0 | 0 | 0 | 10008 / 0 |
| corpus-i/vacask-test-spice-warnonly-cir | 0 / tran | i(l2) | 10008 | 0 | 0 | 0 | 0 | 10008 / 0 |
| corpus-i/vacask-test-spice-warnonly-cir | 0 / tran | i(vin) | 10008 | 0 | 0 | 0 | 0 | 10008 / 0 |
| corpus-i/vacask-test-spice-warnonly-cir | 0 / tran | i(vin2) | 10008 | 0 | 0 | 0 | 0 | 10008 / 0 |
| corpus-i/vacask-test-spice-warnonly-cir | 0 / tran | v(mid) | 10008 | 0 | 0 | 0 | 0 | 10008 / 0 |
| corpus-i/vacask-test-spice-warnonly-cir | 0 / tran | v(mid2) | 10008 | 0 | 0 | 0 | 0 | 10008 / 0 |
| corpus-i/vacask-test-spice-warnonly-cir | 0 / tran | v(out) | 10008 | 0 | 0 | 0 | 0 | 10008 / 0 |
| corpus-i/vacask-test-spice-warnonly-cir | 0 / tran | v(out2) | 10008 | 0 | 0 | 0 | 0 | 10008 / 0 |
| corpus-i/vacask-test-spice-warnonly-cir | 0 / tran | v(vin) | 10008 | 0 | 0 | 0 | 0 | 10008 / 0 |
| corpus-i/vacask-test-spice-warnonly-cir | 0 / tran | v(vin2) | 10008 | 0 | 0 | 0 | 0 | 10008 / 0 |

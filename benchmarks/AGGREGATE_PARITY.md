# Aggregate 100-circuit parity report

This report publishes all outcomes, including failures and unsupported cases. It makes no speed or superiority claim.

## Reproduction

- Generate: `pnpm exec tsx benchmarks/aggregate-report.ts`
- Verify committed outcomes: `pnpm exec tsx benchmarks/aggregate-report.ts --check`
- Machine: Apple M5 Pro; darwin 27.0.0 arm64; Node v22.23.1
- Tools: spice-ts 0.3.0; ngspice-47; pnpm 10.28.1
- Deterministic outcome SHA-256 (host, timings, and error text excluded): `01acbe24a4480bfd1995d1b4d15da012629c9e60ec8bfb6ae4ec907a33ecabf7`
- Aggregate fixture-tree SHA-256: `00365c397b0ee279767f8167a9d3ee121bf186421cb684af30ef5e1bd44d83d7`.
- Source catalogue SHA-256: `49379991e8f1f84c1289f78d50608fc7b6d1b3d3a8bcaed67320e5202213f2e5`.
- Runtime is one wall-clock sample per engine/fixture. Treat it as diagnostic data, not a performance comparison.

## Policy and totals

- Both engines receive the exact same fixture bytes; each row records the common SHA-256.
- No fixture adaptation and no per-circuit tolerance tuning.
- Accounted fixtures: 100 (ngspice=20, classic=20, xyce=20, corpus-d=20, corpus-e=20).
- ngspice: 52 success, 9 failed, 39 unsupported.
- spice-ts: 59 success, 0 failed, 41 unsupported.
- Matched-point errors: 63 analyses across 47 fixtures. Full per-signal max/RMS absolute and relative errors are in `benchmarks/aggregate-report.json`.
- Matched signals: 894 absolute (9189895 samples); 865 relative (9155140 samples, 34755 zero references excluded).
- Matched-point envelope (worst per signal): absolute max 154.02408984579006, absolute RMS 66.59015057379884, relative max 45497356677842.63, relative RMS 872317191517.6284.
- Descriptive single-run runtime sums: ngspice 14086.854 ms; spice-ts 78047.449 ms.

## Transition from the previous accepted report

- Baseline: [issue #321](https://github.com/mfiumara/spice-ts/issues/321), [PR #325](https://github.com/mfiumara/spice-ts/pull/325), head `ad7ba71b65848053afa7bc64ba22fd989ef89ca4`, outcome `68aa8e2e7b78b82f801da84cf5c88c489634d203f44bca5df9345a1946deddb9`.
- Previous totals: ngspice 52/9/39 success/failed/unsupported; spice-ts 55/2/43; 58 analyses across 43 fixtures.
- Previous matched-point envelope: absolute max 1169140310571.719, absolute RMS 1169140310571.719, relative max 45497356677842.63, relative RMS 872317191517.6284.
- spiceTs `classic/diode-distortion`: failed → unsupported. Accepted bounded nonlinear diode distortion (#363, PR #367) removes the ideal-RLC-only .disto rejection, and simulate() now returns a 101-frequency distortion result for the unchanged fixture. The corpus harness does not map .disto results yet, so the row records no comparable disto analysis (#391). This is not a parity gain: no distortion error is measured or published until the harness maps the result.
- spiceTs `ngspice/vbic-fo`: unsupported → success. Accepted bounded VBIC FO DC support (#352, PR #361) lets the unchanged nested DC sweep complete with 707 points, adding one DC comparison of 6 signals. With per-segment nested-DC alignment (#384, PR #394) 700 points align and 7 are excluded out of range; worst absolute max is 6.71e-6 A on i(vc) and 3.77e-6 A on i(vb), matching the #352 point-by-point verifier. Before #394 the same run reported a 0.3 V harness artifact on source-forced nodes (#401).
- spiceTs `ngspice/vbic-common-emitter-ac`: success → unsupported. Accepted grounded-substrate BJT model resolution (#382, PR #392) makes Q1 use its LEVEL=4 VBIC .model instead of silently running a default level-1 NPN, and bounded VBIC support (#361) rejects .ac and .pz. The previous success was not a VBIC simulation; its AC and pole-zero comparisons (including the 1169140310571.719 pole envelope) are removed, and the fixture is now a published unsupported loss.
- spiceTs `ngspice/hfet-inverter`: unsupported → success. Accepted bounded NHFET level-5 support (#339, PR #360) accepts the Z cards, so the unchanged transient completes and adds one comparison. Published losses: v(4) absolute max 2.272 V (RMS 1.611 V) and v(3) 2.231 V (RMS 1.239 V); i(vdd) absolute max 0.00372 A.
- spiceTs `classic/bjt-noise`: unsupported → success. Accepted classic-corpus .noise mapping (#380, PR #383) compares the noise spectra and integrated totals spice-ts already produced, adding two noise analyses. Worst relative max is 4.9e-4 (bjt-noise onoise) and 1.7e-7 (resistor-noise). The change is in the harness, not the simulator.
- spiceTs `classic/resistor-noise`: unsupported → success. Accepted classic-corpus .noise mapping (#380, PR #383) compares the noise spectra and integrated totals spice-ts already produced, adding two noise analyses. Worst relative max is 4.9e-4 (bjt-noise onoise) and 1.7e-7 (resistor-noise). The change is in the harness, not the simulator.
- spiceTs `xyce/inductor-transient`: failed → success. Accepted inductor-ringing step-loop termination (#366, PR #377) lets the unchanged transient finish inside the 120000 ms bound and adds one comparison. Published loss: v(1) and v(2) absolute max 31.65 V (RMS 8.27 V, relative max about 1.0), while i(l1) agrees to 2.4e-14 A.
- Totals: ngspice unchanged at 52/9/39 success/failed/unsupported; spice-ts 55/2/43 to 59/0/41. Comparable coverage changes from 58 analyses across 43 fixtures to 63 across 47: ngspice/vbic-fo, ngspice/hfet-inverter and xyce/inductor-transient add one analysis each, classic/bjt-noise and classic/resistor-noise add two each, and ngspice/vbic-common-emitter-ac removes its AC and PZ analyses. Signals change from 878 to 894 absolute and from 848 to 865 relative. Samples change from 9,182,709 to 9,189,895 absolute and from 9,147,783 to 9,155,140 relative; excluded zero references change from 34,926 to 34,755.
- Nested DC sweeps are now aligned per segment (#384, PR #394). Worst per-signal absolute max: ngspice/jfet-vds-vgs 3 V v(1) to 3.10e-6 A i(vd); xyce/njfet-2109-dc 1.875 V v(2) to 1.47e-6 A; xyce/nmos-level1-dc 18 V v(4) to 0.000682 V v(2); xyce/pnp-dc 2 V v(4) to 0.00119 V v(3). The old values were harness artifacts, not simulator errors.
- Grounded-substrate BJT model resolution (#382, PR #392) changes three corpus-e fixtures. Gains: bjt-rtl-inverter-chain worst DC abs max 4.71 to 1.86 V and OP 0.194 to 0.119 V; bjt-diffpair-current-source worst AC abs max 90.1 to 83.9 V. Published losses: bjt-diffpair-transient and bjt-diffpair-current-source OP v(4)/v(5) abs 1.107 to 1.148 V and supply currents i(vcc)/i(vee) rel about 0.086 to 0.089 in OP and TRAN; bjt-diffpair-current-source AC v(3) abs max 0.0859 to 0.0997 V and TRAN v(4) rel max 68.1 to 348.7 (rel RMS 9.54 to 35.3) and v(5) rel max 43.8 to 97.5; bjt-rtl-inverter-chain DC i(vin) rel max 78.2 to 157.9 (rel RMS 17.9 to 35.1), TRAN i(vcc) abs max 0.00437 to 0.00457 A and v(2) rel max 1.13 to 1.21. Transient grids change from 198 to 191, 111 to 107 and 170 to 156 points.
- PULSE zero TR/TF now defaults to TSTEP like ngspice (#375, PR #379). xyce/rlc-transient worst absolute max falls from 10 V v(1) to 0.000752 V v(2) on 1018 instead of 1002 points; classic/mos-memory-cell from 22496.7 A i(vwb) to 9.91 V v(8) on 144 instead of 158 points (v(8) remains a 9.9 V loss); ngspice/ltra-line-transient from 2.499 V v(168) to 0.416 V v(3) on 665 instead of 685 points. Published losses: ltra-line-transient v(3) abs RMS +5.2% (0.04522 to 0.04755 V); mos-memory-cell i(vw) abs RMS +4.7%; classic/lossy-line-aluminium (3968 to 3969 points) raises abs RMS on 89 of 261 signals by at most 0.1% on non-negligible signals and v(x1.x1.x1.x1.x1.x1.x1.x1.4) rel max 2314.5 to 7220.6 at an unchanged 0.2614 V abs max. classic/lossy-line-24-inch and classic/coupled-lossy-lines change only at rounding level.
- Worst per-signal envelope: absolute max falls from 1169140310571.719 to 154.02408984579006 and absolute RMS from 1169140310571.719 to 66.59015057379884, now from classic/rca3040-wideband-amplifier AC v(15), only because the ngspice/vbic-common-emitter-ac pole comparison is no longer made. That is a coverage change, not an accuracy gain. Relative max 45497356677842.63 and RMS 872317191517.6284 from classic/coupled-lossy-lines v(5) are unchanged. No tolerance changed.
- Diode CJO aliasing (#365, PR #390) changed no aggregate outcome: the deterministic projection was identical before and after merging it.
- Transient step-control change from inductor-ringing termination (#366, PR #377), the only transient-engine change merged in the final window (none of these netlists has a diode, HFET or .noise card, so #405, #360 and #383 cannot affect them): xyce/rlc-transient worsens, with abs max 0.000752 to 0.00213 V on v(2) and 0.000251 to 0.000711 A on i(l1), abs RMS up on all 5 signals, 1018 to 1037 points. This is a published loss. ngspice/mos6-inverter-transient and classic/mos6-inverter-chain (3760 to 3777 points) lower abs RMS on 30 and raise it on 14 of 44 signals, with worst abs max 5.0044 V on v(43) essentially unchanged. ngspice/mos6-simple-inverter-transient (3438 to 3451 points) and corpus-e/mos1-inverter-sweep TRAN (111 to 113 points) change abs RMS by about 1% or less.
- Diode VJ/FC depletion-capacitance parity (#388, PR #405) changed no compared diode fixture metric in this run.
- The runtime sums in the totals above are single samples on a shared, heavily loaded host. No spice-ts run hit the 120000 ms bound in this run. They are not comparable with the previous 77150.906 / 270491.926 ms sample and support no speed claim.

## Gap tracking

- https://github.com/mfiumara/spice-ts/issues/76 — parser syntax, directives, expressions, and unsupported device cards
- https://github.com/mfiumara/spice-ts/issues/75 — noise, pole-zero, and distortion analyses
- https://github.com/mfiumara/spice-ts/issues/7 — transmission-line devices
- https://github.com/mfiumara/spice-ts/issues/5 — BJT model coverage
- https://github.com/mfiumara/spice-ts/issues/3 — MOS model coverage
- https://github.com/mfiumara/spice-ts/issues/123 — jimi-fuzz transient waveform divergence
- https://github.com/mfiumara/spice-ts/issues/280 — newly exposed classic-corpus execution failures and RCA3040 regression
- https://github.com/mfiumara/spice-ts/issues/366 — non-terminating xyce/inductor-transient simulation
- https://github.com/mfiumara/spice-ts/issues/391 — unmapped .disto results in the corpus harness

## Per-circuit outcomes

| Fixture | Analyses | ngspice | spice-ts | Runtime ms (ng/spice-ts) | Compared analyses | Gap issues |
|---|---|---|---|---:|---:|---|
| ngspice/vbic-fo | dc | success/converged | success/converged | 141.094/558.763 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/vbic-temperature | dc | success/converged | unsupported/not-run | 61.915/107.381 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/mos6-inverter-transient | tran | success/converged | success/converged | 53.688/7529.919 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/jfet-vds-vgs | op, dc | success/converged | success/converged | 64.326/209.779 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/rc-lowpass-ac | op, ac | success/converged | success/converged | 67.654/294.756 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/ac-zero-frequency | ac | failed/not-run | unsupported/not-run | 26.667/102.144 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/vbic-common-emitter-ac | ac, pz | success/converged | unsupported/not-run | 34.794/73.872 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| ngspice/probe-ac | ac | success/converged | unsupported/not-run | 31.197/185.074 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/rc-transient | tran | success/converged | success/converged | 28.031/156.192 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/mos-amplifier-transient | tran | success/converged | success/converged | 749.23/1496.09 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/mos6-simple-inverter-transient | tran | success/converged | success/converged | 102.022/362.415 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/ltra-line-transient | tran | success/converged | success/converged | 80.836/272.716 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#7](https://github.com/mfiumara/spice-ts/issues/7) |
| ngspice/hfet-inverter | tran | success/converged | success/converged | 38.69/287.133 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/mesa-oscillator | tran | success/converged | unsupported/not-run | 98.812/134.636 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/jimi-fuzz | op, tran | success/converged | success/converged | 6317.462/33589.673 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#123](https://github.com/mfiumara/spice-ts/issues/123) |
| ngspice/schmitt-trigger | tran | success/converged | success/converged | 114.337/1454.786 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/inductive-positive-definite-2x2 | op | failed/not-run | unsupported/not-run | 107.256/149.877 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/inductive-positive-definite-3x3 | op | failed/not-run | unsupported/not-run | 60.124/124.693 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/inductive-positive-definite-4x4 | op | failed/not-run | unsupported/not-run | 27.695/222.78 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/inductive-positive-definite-ac | op, ac | failed/not-run | unsupported/not-run | 28.03/137.37 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/bjt-noise | noise | success/converged | success/converged | 48.867/269.043 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/bsim1-device-sweep | dc | success/converged | success/converged | 103.818/188.829 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/bsim2-device-sweep | dc | success/converged | success/converged | 85.491/215.771 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/bjt-differential-pair | tran | success/converged | success/converged | 109.51/209.138 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/diode-distortion | disto | success/converged | unsupported/not-run | 30.333/222.818 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/lossy-line-24-inch | tran | success/converged | success/converged | 140.474/1526.984 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#7](https://github.com/mfiumara/spice-ts/issues/7) |
| classic/lossy-line-aluminium | tran | success/converged | success/converged | 724.96/3297.335 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#7](https://github.com/mfiumara/spice-ts/issues/7) |
| classic/coupled-lossy-lines | tran | success/converged | success/converged | 165.228/1680.806 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#7](https://github.com/mfiumara/spice-ts/issues/7) |
| classic/bjt-mixer-distortion | none | failed/not-run | unsupported/not-run | 27.587/138.682 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/mos6-inverter-chain | tran | success/converged | success/converged | 96.897/8470.625 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#280](https://github.com/mfiumara/spice-ts/issues/280) |
| classic/mos-amplifier | tran | success/converged | success/converged | 906.276/986.759 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#280](https://github.com/mfiumara/spice-ts/issues/280) |
| classic/mos-memory-cell | tran | success/converged | success/converged | 31.906/183.371 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#280](https://github.com/mfiumara/spice-ts/issues/280) |
| classic/pole-zero-four-stage | pz | success/converged | success/converged | 28.145/124.664 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/pole-zero-three-stage | pz | success/converged | success/converged | 63.965/85.039 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/rc-transient | tran | success/converged | success/converged | 63.828/99.974 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/rca3040-wideband-amplifier | ac, dc, tran | success/converged | success/converged | 41.132/536.144 | 3 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#280](https://github.com/mfiumara/spice-ts/issues/280) |
| classic/resistor-noise | noise | success/converged | success/converged | 26.702/92.816 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/rtl-inverter-chain | dc, tran | success/converged | success/converged | 64.867/183.148 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/ecl-schmitt-trigger | tran | success/converged | success/converged | 130.932/906.128 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/high-pass-pole-zero | pz | success/converged | success/converged | 83.764/156.197 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| xyce/capacitor-rc-transient | tran | unsupported/failed | success/converged | 27.07/196.885 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/capacitor-rc-transient-newlte | tran | unsupported/failed | unsupported/not-run | 27.879/180.009 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/capacitor-rc-oscillator | tran | unsupported/failed | success/converged | 20.508/216.888 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/diode-level2-temperature-breakdown | tran | unsupported/failed | unsupported/not-run | 71.004/588.914 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/diode-zener-5229 | dc | unsupported/failed | unsupported/not-run | 75.185/216.072 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/diode-transient | tran | unsupported/failed | success/converged | 22.634/221.728 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/diode-sidewall-dc | dc | success/converged | success/converged | 66.805/141.758 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/inductor-transient | tran | success/converged | success/converged | 29.32/285.189 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#366](https://github.com/mfiumara/spice-ts/issues/366) |
| xyce/njfet-2109-dc | dc | success/converged | success/converged | 45.822/151.946 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/njfet-stepped-dc | dc | unsupported/failed | unsupported/not-run | 56.109/109.3 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/nmos-level1-dc | dc | success/converged | success/converged | 30.932/216.952 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#3](https://github.com/mfiumara/spice-ts/issues/3) |
| xyce/npn-dc | dc | success/converged | success/converged | 32.622/94.462 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#5](https://github.com/mfiumara/spice-ts/issues/5) |
| xyce/pmos-level1-dc | dc | success/converged | success/converged | 65.035/99.515 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#3](https://github.com/mfiumara/spice-ts/issues/3) |
| xyce/pnp-dc | dc | success/converged | success/converged | 24.638/127.955 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#5](https://github.com/mfiumara/spice-ts/issues/5) |
| xyce/resistor-dc | dc | success/converged | success/converged | 26.498/164.351 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/resistor-level3-zero | dc | success/converged | success/converged | 34.082/205.541 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/resistor-negative | dc | success/converged | success/converged | 90.494/131.816 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/rlc-transient | tran | success/converged | success/converged | 35.681/210.094 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/vccs-dc | dc | success/converged | success/converged | 29.524/138.697 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/vcvs-dc | dc | success/converged | success/converged | 30.383/100.266 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/ohms-law-op | op | unsupported/failed | unsupported/not-run | 28.556/84.754 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/diode-operating-point | op | unsupported/failed | unsupported/not-run | 45.071/406.017 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/ekv-bias-sweep | op, dc | unsupported/failed | unsupported/not-run | 76.489/357.222 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/downscaling-current-mirror | op, dc | unsupported/failed | unsupported/not-run | 243.502/692.767 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/transresistance-ac | op, ac | unsupported/failed | unsupported/not-run | 40.835/398.751 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/passive-pole-zero-ac | op, pz, ac | unsupported/failed | unsupported/not-run | 20.283/381.954 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| corpus-d/resistor-voltage-ac | op, ac | unsupported/failed | unsupported/not-run | 61.108/297.123 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/series-resonance-ac | op, ac | unsupported/failed | unsupported/not-run | 54.989/172.152 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/am-source-transient | tran | unsupported/failed | unsupported/not-run | 129.429/137.453 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/fft-source-transient | tran | unsupported/failed | unsupported/not-run | 67.819/123.013 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/coupled-transformer-transient | tran, pss | unsupported/failed | unsupported/not-run | 67.522/166.374 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/rlc-trapezoidal-transient | op, tran | unsupported/failed | unsupported/not-run | 25.052/129.381 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/diode-voltage-doubler | op, tran | unsupported/failed | unsupported/not-run | 66.122/126.207 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/ekv-ring-oscillator | op, tran | unsupported/failed | unsupported/not-run | 27.688/126.588 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/cockcroft-walton-x8 | op, tran | unsupported/failed | unsupported/not-run | 25.805/108.149 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/pwm-switch | op, tran | unsupported/failed | unsupported/not-run | 103.213/212.031 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/rlc-gear3 | op, tran | unsupported/failed | unsupported/not-run | 26.367/140.991 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/rlc-gear5 | op, tran | unsupported/failed | unsupported/not-run | 42.677/70.742 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/rlc-gear6 | op, tran | unsupported/failed | unsupported/not-run | 107.766/71.901 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/colpitts-oscillator | op, tran | unsupported/failed | unsupported/not-run | 69.157/127.37 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/cccs-mixed-analysis | op, tran, ac | unsupported/failed | success/converged | 27.447/124.423 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/vcvs-operating-point | op, ac | failed/failed | unsupported/not-run | 27.044/88.56 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/diode-bias-sweep | op, dc | success/converged | success/converged | 30.527/120.345 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/mos1-inverter-sweep | op, dc, tran | success/converged | success/converged | 85.254/136.053 | 3 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/transmission-line-ac | ac | unsupported/failed | unsupported/not-run | 24.559/90.794 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/mutual-inductance-ac | ac, tran | unsupported/failed | unsupported/not-run | 28.155/85.079 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/bjt-diffpair-ac | dc, tran, op, ac | unsupported/failed | success/converged | 19.84/133.104 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/opamp-open-loop-ac | op, ac, dc | failed/failed | unsupported/not-run | 70.41/88.512 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/capacitor-step-transient | tran | unsupported/failed | success/converged | 25.744/105.657 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/capacitor-initial-condition | tran | unsupported/failed | success/converged | 25.457/90.684 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/lc-oscillator-transient | tran | unsupported/failed | success/converged | 24.209/120.879 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/bjt-diffpair-transient | op, tran | success/converged | success/converged | 73.66/126.177 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/bjt-schmitt-trigger | op, tran | unsupported/failed | success/converged | 27.356/747.572 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/diode-temperature-sweep | op, dc | unsupported/failed | success/converged | 28.202/139.456 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/mos1-nand-transient | op, tran | unsupported/failed | success/converged | 27.828/110.108 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/bjt-rtl-inverter-chain | op, dc, tran | success/converged | success/converged | 29.187/138.999 | 3 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/dual-lc-uic-rejection | tran | unsupported/failed | success/converged | 44.076/161.299 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/opamp-voltage-follower | op, ac, dc, tran | unsupported/failed | unsupported/not-run | 24.086/89.203 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/mos7-nand-no-bypass | op, tran | failed/failed | unsupported/not-run | 32.13/75.028 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/bjt-diffpair-current-source | op, tran, ac | success/converged | success/converged | 31.466/121.919 | 3 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |

Every unsupported or failed spice-ts row is a published loss. Engine error strings, input hashes, commands, signal lists, point counts, and matched-point metrics are retained in the JSON report.

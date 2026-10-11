# Aggregate 100-circuit parity report

This report publishes all outcomes, including failures and unsupported cases. It makes no speed or superiority claim.

## Reproduction

- Generate: `pnpm exec tsx benchmarks/aggregate-report.ts`
- Verify committed outcomes: `pnpm exec tsx benchmarks/aggregate-report.ts --check`
- Machine: Apple M5 Pro; darwin 27.0.0 arm64; Node v22.23.1
- Tools: spice-ts 0.3.0; ngspice-47; pnpm 10.28.1
- Deterministic outcome SHA-256 (host, timings, and error text excluded): `2a6f337af8f3b52c13dd135a542e9ffe743600df0045f9c6c04bd11dd05f19e7`
- Aggregate fixture-tree SHA-256: `00365c397b0ee279767f8167a9d3ee121bf186421cb684af30ef5e1bd44d83d7`.
- Source catalogue SHA-256: `539de6042888ad113c1713b9912ac1ec327eddbc83a839774223626a4c868e03`.
- Runtime is one wall-clock sample per engine/fixture. Treat it as diagnostic data, not a performance comparison.

## Policy and totals

- Both engines receive the exact same fixture bytes; each row records the common SHA-256.
- No fixture adaptation and no per-circuit tolerance tuning.
- Accounted fixtures: 100 (ngspice=20, classic=20, xyce=20, corpus-d=20, corpus-e=20).
- ngspice: 52 success, 9 failed, 39 unsupported.
- spice-ts: 61 success, 1 failed, 38 unsupported.
- Matched-point errors: 65 analyses across 49 fixtures. Full per-signal max/RMS absolute and relative errors are in `benchmarks/aggregate-report.json`.
- Matched signals: 935 absolute (9488031 samples); 906 relative (9452220 samples, 35811 zero references excluded).
- Matched-point envelope (worst per signal): absolute max 31.65338535154384, absolute RMS 8.272157976952819, relative max 318874896057.84845, relative RMS 6401850478.823812.
- Descriptive single-run runtime sums: ngspice 9253.024 ms; spice-ts 57576.890 ms.

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
- spiceTs `ngspice/probe-ac`: unsupported → success. Accepted ngspice .control/.endc block contract (#381, PR #387) no longer rejects the control block, so the unchanged AC fixture completes and adds one comparison of 4 signals. 15 of 16 points align (1 excluded out of range), and the worst absolute max is 4.4e-16 V.
- spiceTs `classic/bjt-mixer-distortion`: unsupported → failed. Accepted BJT charge storage (#385, PR #400) now accepts the CJS model parameter that used to reject this netlist at parse time. Upstream comments out both .disto commands, so the fixture has no analysis at all: spice-ts now parses it fully and fails with "No analysis command specified", and the corpus harness classifies that as failed. ngspice also fails on the same bytes (exits 0 with no raw analysis data). This is a published status loss, not a simulator regression: neither engine produces a comparable result.
- spiceTs `ngspice/mesa-oscillator`: unsupported → success. Accepted B-source I= expressions and NMF level-2 MESFET (#340, PR #421) let the unchanged transient complete, adding one comparison of 37 signals. 2041 points align and 3266 are excluded out of range; 3219 of those are before TSTART = 1 ns, which spice-ts emits and ngspice omits (#432). Published loss: worst absolute max 0.178 V on v(6) (RMS 0.0244 V), with relative max up to 0.86 on v(8).
- Totals: ngspice unchanged at 52/9/39 success/failed/unsupported; spice-ts 55/2/43 to 61/1/38. Comparable coverage changes from 58 analyses across 43 fixtures to 65 across 49: ngspice/vbic-fo, ngspice/hfet-inverter, xyce/inductor-transient, ngspice/probe-ac and ngspice/mesa-oscillator add one analysis each, classic/bjt-noise and classic/resistor-noise add two each, and ngspice/vbic-common-emitter-ac removes its AC and PZ analyses. classic/bjt-mixer-distortion moves from unsupported to failed and adds no comparison. Signals change from 878 to 935 absolute and from 848 to 906 relative. Samples change from 9,182,709 to 9,488,031 absolute and from 9,147,783 to 9,452,220 relative; excluded zero references change from 34,926 to 35,811. Most of the sample growth comes from the denser transient grids after #400/#417 (see below) and the 75,517 mesa-oscillator samples.
- Nested DC sweeps are now aligned per segment (#384, PR #394). Worst per-signal absolute max: ngspice/jfet-vds-vgs 3 V v(1) to 3.10e-6 A i(vd); xyce/njfet-2109-dc 1.875 V v(2) to 1.47e-6 A; xyce/nmos-level1-dc 18 V v(4) to 0.000682 V v(2); xyce/pnp-dc 2 V v(4) to 0.00119 V v(3). The old values were harness artifacts, not simulator errors.
- Grounded-substrate BJT model resolution (#382, PR #392) changes three corpus-e fixtures. Gains: bjt-rtl-inverter-chain worst DC abs max 4.71 to 1.86 V and OP 0.194 to 0.119 V; bjt-diffpair-current-source worst AC abs max 90.1 to 83.9 V. Published losses: bjt-diffpair-transient and bjt-diffpair-current-source OP v(4)/v(5) abs 1.107 to 1.148 V and supply currents i(vcc)/i(vee) rel about 0.086 to 0.089 in OP and TRAN; bjt-diffpair-current-source AC v(3) abs max 0.0859 to 0.0997 V and TRAN v(4) rel max 68.1 to 348.7 (rel RMS 9.54 to 35.3) and v(5) rel max 43.8 to 97.5; bjt-rtl-inverter-chain DC i(vin) rel max 78.2 to 157.9 (rel RMS 17.9 to 35.1), TRAN i(vcc) abs max 0.00437 to 0.00457 A and v(2) rel max 1.13 to 1.21. Transient grids change from 198 to 191, 111 to 107 and 170 to 156 points.
- PULSE zero TR/TF now defaults to TSTEP like ngspice (#375, PR #379). xyce/rlc-transient worst absolute max falls from 10 V v(1) to 0.000752 V v(2) on 1018 instead of 1002 points; classic/mos-memory-cell from 22496.7 A i(vwb) to 9.91 V v(8) on 144 instead of 158 points (v(8) remains a 9.9 V loss); ngspice/ltra-line-transient from 2.499 V v(168) to 0.416 V v(3) on 665 instead of 685 points. Published losses: ltra-line-transient v(3) abs RMS +5.2% (0.04522 to 0.04755 V); mos-memory-cell i(vw) abs RMS +4.7%; classic/lossy-line-aluminium (3968 to 3969 points) raises abs RMS on 89 of 261 signals by at most 0.1% on non-negligible signals and v(x1.x1.x1.x1.x1.x1.x1.x1.4) rel max 2314.5 to 7220.6 at an unchanged 0.2614 V abs max. classic/lossy-line-24-inch and classic/coupled-lossy-lines change only at rounding level.
- Worst per-signal envelope: absolute max falls from 1169140310571.719 to 31.65338535154384 and absolute RMS from 1169140310571.719 to 8.272157976952819, now from xyce/inductor-transient TRAN v(1) (the #366 loss). Two things cause this. First, the ngspice/vbic-common-emitter-ac pole comparison is no longer made (#392), which is a coverage change, not an accuracy gain; it leaves classic/rca3040-wideband-amplifier AC v(15) at 154.02408984579006 (RMS 66.59015057379884). Second, BJT charge storage (#400) then lowers that rca3040 AC v(15) error to 1.0237. Relative max falls from 45497356677842.63 to 318874896057.84845 and relative RMS from 872317191517.6284 to 6401850478.823812, still from classic/coupled-lossy-lines v(5), whose absolute max falls from 1.42 to 0.431 V; the relative metric still divides by near-zero ngspice samples. No tolerance changed.
- Diode CJO aliasing (#365, PR #390) changed no aggregate outcome: the deterministic projection was identical before and after merging it.
- Transient step-control change from inductor-ringing termination (#366, PR #377), the only transient-engine change merged in the final window (none of these netlists has a diode, HFET or .noise card, so #405, #360 and #383 cannot affect them): xyce/rlc-transient worsens, with abs max 0.000752 to 0.00213 V on v(2) and 0.000251 to 0.000711 A on i(l1), abs RMS up on all 5 signals, 1018 to 1037 points. This is a published loss. ngspice/mos6-inverter-transient and classic/mos6-inverter-chain (3760 to 3777 points) lower abs RMS on 30 and raise it on 14 of 44 signals, with worst abs max 5.0044 V on v(43) essentially unchanged. ngspice/mos6-simple-inverter-transient (3438 to 3451 points) and corpus-e/mos1-inverter-sweep TRAN (111 to 113 points) change abs RMS by about 1% or less.
- Diode VJ/FC depletion-capacitance parity (#388, PR #405) changed no compared diode fixture metric in this run.
- BJT charge storage and Early gm (#385, PR #400) and MOS1 bulk-junction currents (#393, PR #417) were merged after the bc99922 refresh and change 26 compared fixtures. The item values above for #392, #379 and #377 were measured before these two merges. Below, A to B means the bc99922 aggregate value (outcome 44261d03) to the 60f49b2 run (outcome c06be5be). Attribution is by device class (BJT to #400, MOS to #417), not bisected. Gains, worst absolute max: classic/rca3040-wideband-amplifier AC v(15) 154.02 to 1.024 and TRAN v(17) 10.42 to 0.311 V (1494 to 3994 points); classic/bjt-differential-pair TRAN v(4) 7.27 to 0.076 V (190 to 3184 points); classic/rtl-inverter-chain TRAN v(5) 4.73 to 0.296 V and DC 1.87 to 1.80 V; corpus-e/bjt-rtl-inverter-chain TRAN v(5) 4.73 to 0.293 V and DC 1.857 to 1.801 V; corpus-e/bjt-diffpair-transient OP v(5) 1.148 to 0.0616 V and TRAN v(4) 7.01 to 0.111 V; corpus-e/bjt-diffpair-current-source AC v(5) 83.9 to 0.517 V, OP v(5) 1.148 to 0.0616 V and TRAN v(5) 4.78 to 0.129 V (TRAN v(4) rel max 348.7 to 286.9); classic/lossy-line-24-inch v(3) 3.65 to 1.125 V; classic/coupled-lossy-lines v(x1.6) 5.20 to 0.391 V with abs RMS down on 41 of 47 signals; classic/mos-memory-cell v(8) 9.91 to 1.91 V; corpus-e/mos1-inverter-sweep OP v(4) 4.58 to 0.214 V; ngspice/mos-amplifier-transient and classic/mos-amplifier abs RMS down on 18 of 24 signals and i(vb) rel max 9.5e6 to 1.6e5; ngspice/mos6-simple-inverter-transient v(11) 4.92 to 4.34 V; ngspice/schmitt-trigger and classic/ecl-schmitt-trigger v(6) 0.989 to 0.763 V. Published losses: corpus-e/mos1-inverter-sweep TRAN i(vdd) 0.0036 to 1.234 A, a spike on a femtosecond step before the 3 ns PWL corner where ngspice peaks at 1.77e-3 A (#427), TRAN v(5) 2.50 to 3.74 V, DC i(vdd) 0.00364 to 0.00757 A, and worst DC/TRAN abs max still about 4.35 V; ngspice/mos6-simple-inverter-transient i(vdd) 0.000544 to 0.00191 A (rel max 8072 to 328348) and i(vin) 9.3e-6 to 2.1e-4 A on 3451 to 3229 points; ngspice/schmitt-trigger and classic/ecl-schmitt-trigger i(vin) 2.70e-4 to 5.35e-4 A and v(2) 0.0135 to 0.0268 V, v(6) rel max 36.1 to 148.3, with abs RMS up on 8 of 10 signals; classic/mos-memory-cell i(vs) 0.00367 to 0.0113 A and i(vwb) 0.00052 to 0.00104 A; ngspice/mos6-inverter-transient and classic/mos6-inverter-chain abs RMS up on 19 and down on 23 of 44 signals with v(xndinv2.22) 3.720 to 3.723 V; corpus-e/bjt-diffpair-transient TRAN v(1) rel max 0.039 to 1.0 at 0.0012 V abs; corpus-e/bjt-rtl-inverter-chain OP i(vin) rel 0.22 to 1.0 at 4.6e-12 A abs; classic/lossy-line-24-inch v(3) rel max 84.5 to 2533 and classic/rca3040-wideband-amplifier TRAN v(31) rel max 518 to 4387 at lower absolute error. ngspice/ltra-line-transient, classic/bsim1-device-sweep, classic/bsim2-device-sweep, xyce/nmos-level1-dc and xyce/pmos-level1-dc change only at rounding level.
- Merged after the 60f49b2 run: .ac sweep point counts (PR #397), transient Newton limiting only on nonlinear device nodes (#376, PR #425), and B-source I= expressions with NMF level-2 MESFET (#340, PR #421). Apart from the ngspice/mesa-oscillator transition above, no compared metric, grid or engine status changed for any fixture across these three merges.
- Diode VT = kT/q and ngspice-47 model aliases (#402/#404, PR #431) merged after the 26a163a run and change six compared analyses (26a163a run to this run). Gains: xyce/diode-sidewall-dc worst i(vin) abs max 5.20e-4 to 1.03e-4 A; corpus-e/diode-bias-sweep DC v(2) 5.86e-4 to 2.48e-4 V and OP v(2) 3.45e-4 to 2.88e-6 V; classic/coupled-lossy-lines worst abs max 0.936 V v(x3.3) to 0.868 V v(x3.1) on 3781 to 3776 points, with abs RMS down on 27 of 47 signals. Published losses: classic/coupled-lossy-lines abs RMS up on 14 of 47 signals, v(x3.2) abs max 0.443 to 0.449 V and v(2) 0.311 to 0.319 V; classic/lossy-line-24-inch abs RMS up on all 3 signals and v(2) abs max 1.1210 to 1.1235 V on 3162 to 3129 points (v(3) improves 1.1252 to 1.1211 V); classic/lossy-line-aluminium abs RMS up on 121 and down on 50 of 261 signals at an unchanged worst abs max of 1.3472 V v(3).
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
- https://github.com/mfiumara/spice-ts/issues/427 — MOS1 inverter transient supply-current spike after #417
- https://github.com/mfiumara/spice-ts/issues/432 — transient output emitted before .tran TSTART

## Per-circuit outcomes

| Fixture | Analyses | ngspice | spice-ts | Runtime ms (ng/spice-ts) | Compared analyses | Gap issues |
|---|---|---|---|---:|---:|---|
| ngspice/vbic-fo | dc | success/converged | success/converged | 53.004/348.382 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/vbic-temperature | dc | success/converged | unsupported/not-run | 61.238/91.099 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/mos6-inverter-transient | tran | success/converged | success/converged | 80.748/6737.545 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/jfet-vds-vgs | op, dc | success/converged | success/converged | 24.626/96.342 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/rc-lowpass-ac | op, ac | success/converged | success/converged | 26.288/98.569 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/ac-zero-frequency | ac | failed/not-run | unsupported/not-run | 23.774/81.131 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/vbic-common-emitter-ac | ac, pz | success/converged | unsupported/not-run | 34.054/85.307 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| ngspice/probe-ac | ac | success/converged | success/converged | 23.731/91.629 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/rc-transient | tran | success/converged | success/converged | 23.317/94.102 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/mos-amplifier-transient | tran | success/converged | success/converged | 466.364/877.379 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/mos6-simple-inverter-transient | tran | success/converged | success/converged | 21.265/239.137 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/ltra-line-transient | tran | success/converged | success/converged | 34.05/147.503 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#7](https://github.com/mfiumara/spice-ts/issues/7) |
| ngspice/hfet-inverter | tran | success/converged | success/converged | 26.201/185.896 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/mesa-oscillator | tran | success/converged | success/converged | 50.205/7143.692 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#432](https://github.com/mfiumara/spice-ts/issues/432) |
| ngspice/jimi-fuzz | op, tran | success/converged | success/converged | 4043.969/11640.724 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#123](https://github.com/mfiumara/spice-ts/issues/123) |
| ngspice/schmitt-trigger | tran | success/converged | success/converged | 27.687/769.553 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/inductive-positive-definite-2x2 | op | failed/not-run | unsupported/not-run | 24.892/83.979 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/inductive-positive-definite-3x3 | op | failed/not-run | unsupported/not-run | 22.983/83.198 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/inductive-positive-definite-4x4 | op | failed/not-run | unsupported/not-run | 23.882/86.364 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/inductive-positive-definite-ac | op, ac | failed/not-run | unsupported/not-run | 23.333/91.16 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/bjt-noise | noise | success/converged | success/converged | 29.633/95.691 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/bsim1-device-sweep | dc | success/converged | success/converged | 36.331/126.265 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/bsim2-device-sweep | dc | success/converged | success/converged | 46.817/193.558 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/bjt-differential-pair | tran | success/converged | success/converged | 35.433/698.147 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/diode-distortion | disto | success/converged | unsupported/not-run | 33.146/67.752 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/lossy-line-24-inch | tran | success/converged | success/converged | 98.751/802.316 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#7](https://github.com/mfiumara/spice-ts/issues/7) |
| classic/lossy-line-aluminium | tran | success/converged | success/converged | 291.449/1372.179 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#7](https://github.com/mfiumara/spice-ts/issues/7) |
| classic/coupled-lossy-lines | tran | success/converged | success/converged | 143.563/1460.051 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#7](https://github.com/mfiumara/spice-ts/issues/7) |
| classic/bjt-mixer-distortion | none | failed/not-run | failed/not-run | 22.364/96.397 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/mos6-inverter-chain | tran | success/converged | success/converged | 54.928/7269.411 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#280](https://github.com/mfiumara/spice-ts/issues/280) |
| classic/mos-amplifier | tran | success/converged | success/converged | 552.114/1195.134 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#280](https://github.com/mfiumara/spice-ts/issues/280) |
| classic/mos-memory-cell | tran | success/converged | success/converged | 32.351/254.504 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#280](https://github.com/mfiumara/spice-ts/issues/280) |
| classic/pole-zero-four-stage | pz | success/converged | success/converged | 38.426/229.712 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/pole-zero-three-stage | pz | success/converged | success/converged | 38.292/207.488 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/rc-transient | tran | success/converged | success/converged | 61.065/201.804 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/rca3040-wideband-amplifier | ac, dc, tran | success/converged | success/converged | 43.291/3153.859 | 3 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#280](https://github.com/mfiumara/spice-ts/issues/280) |
| classic/resistor-noise | noise | success/converged | success/converged | 28.086/96.766 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/rtl-inverter-chain | dc, tran | success/converged | success/converged | 29.235/523.971 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/ecl-schmitt-trigger | tran | success/converged | success/converged | 70/1378.889 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/high-pass-pole-zero | pz | success/converged | success/converged | 63.442/191.424 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| xyce/capacitor-rc-transient | tran | unsupported/failed | success/converged | 36.845/111.47 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/capacitor-rc-transient-newlte | tran | unsupported/failed | unsupported/not-run | 26.018/116.507 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/capacitor-rc-oscillator | tran | unsupported/failed | success/converged | 70.34/189.676 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/diode-level2-temperature-breakdown | tran | unsupported/failed | unsupported/not-run | 27.775/273.02 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/diode-zener-5229 | dc | unsupported/failed | unsupported/not-run | 170.965/137.632 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/diode-transient | tran | unsupported/failed | success/converged | 25.966/110.606 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/diode-sidewall-dc | dc | success/converged | success/converged | 28.015/132.709 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/inductor-transient | tran | success/converged | success/converged | 19.703/113.968 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#366](https://github.com/mfiumara/spice-ts/issues/366) |
| xyce/njfet-2109-dc | dc | success/converged | success/converged | 29.105/106.47 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/njfet-stepped-dc | dc | unsupported/failed | unsupported/not-run | 26.79/104.36 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/nmos-level1-dc | dc | success/converged | success/converged | 30.308/117.789 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#3](https://github.com/mfiumara/spice-ts/issues/3) |
| xyce/npn-dc | dc | success/converged | success/converged | 26.894/144.158 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#5](https://github.com/mfiumara/spice-ts/issues/5) |
| xyce/pmos-level1-dc | dc | success/converged | success/converged | 17.709/163.502 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#3](https://github.com/mfiumara/spice-ts/issues/3) |
| xyce/pnp-dc | dc | success/converged | success/converged | 27.622/407.68 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#5](https://github.com/mfiumara/spice-ts/issues/5) |
| xyce/resistor-dc | dc | success/converged | success/converged | 59.89/261.406 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/resistor-level3-zero | dc | success/converged | success/converged | 64.88/317.595 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/resistor-negative | dc | success/converged | success/converged | 21.137/315.224 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/rlc-transient | tran | success/converged | success/converged | 459.707/323.735 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/vccs-dc | dc | success/converged | success/converged | 102.877/176.263 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/vcvs-dc | dc | success/converged | success/converged | 71.834/188.071 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/ohms-law-op | op | unsupported/failed | unsupported/not-run | 31.123/109.173 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/diode-operating-point | op | unsupported/failed | unsupported/not-run | 26.535/93.597 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/ekv-bias-sweep | op, dc | unsupported/failed | unsupported/not-run | 25.594/69.233 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/downscaling-current-mirror | op, dc | unsupported/failed | unsupported/not-run | 116.881/91.571 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/transresistance-ac | op, ac | unsupported/failed | unsupported/not-run | 23.136/89.746 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/passive-pole-zero-ac | op, pz, ac | unsupported/failed | unsupported/not-run | 22.244/83.37 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| corpus-d/resistor-voltage-ac | op, ac | unsupported/failed | unsupported/not-run | 23.402/72.913 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/series-resonance-ac | op, ac | unsupported/failed | unsupported/not-run | 18.108/97.184 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/am-source-transient | tran | unsupported/failed | unsupported/not-run | 24.1/80.289 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/fft-source-transient | tran | unsupported/failed | unsupported/not-run | 20.695/81.729 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/coupled-transformer-transient | tran, pss | unsupported/failed | unsupported/not-run | 22.63/81.342 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/rlc-trapezoidal-transient | op, tran | unsupported/failed | unsupported/not-run | 21.384/82.093 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/diode-voltage-doubler | op, tran | unsupported/failed | unsupported/not-run | 22.375/81.15 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/ekv-ring-oscillator | op, tran | unsupported/failed | unsupported/not-run | 22.316/62.418 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/cockcroft-walton-x8 | op, tran | unsupported/failed | unsupported/not-run | 57.304/92.595 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/pwm-switch | op, tran | unsupported/failed | unsupported/not-run | 30.732/66.514 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/rlc-gear3 | op, tran | unsupported/failed | unsupported/not-run | 17.845/67.292 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/rlc-gear5 | op, tran | unsupported/failed | unsupported/not-run | 29.093/90.215 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/rlc-gear6 | op, tran | unsupported/failed | unsupported/not-run | 22.365/80.376 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/colpitts-oscillator | op, tran | unsupported/failed | unsupported/not-run | 21.515/67.766 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/cccs-mixed-analysis | op, tran, ac | unsupported/failed | success/converged | 17.938/79.668 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/vcvs-operating-point | op, ac | failed/failed | unsupported/not-run | 27.871/79.76 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/diode-bias-sweep | op, dc | success/converged | success/converged | 25.365/92.645 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/mos1-inverter-sweep | op, dc, tran | success/converged | success/converged | 25.496/148.585 | 3 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#427](https://github.com/mfiumara/spice-ts/issues/427) |
| corpus-e/transmission-line-ac | ac | unsupported/failed | unsupported/not-run | 21.601/72.007 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/mutual-inductance-ac | ac, tran | unsupported/failed | unsupported/not-run | 20.059/76.6 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/bjt-diffpair-ac | dc, tran, op, ac | unsupported/failed | success/converged | 19.107/119.102 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/opamp-open-loop-ac | op, ac, dc | failed/failed | unsupported/not-run | 20.324/71.678 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/capacitor-step-transient | tran | unsupported/failed | success/converged | 20.219/83.164 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/capacitor-initial-condition | tran | unsupported/failed | success/converged | 18.162/85.421 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/lc-oscillator-transient | tran | unsupported/failed | success/converged | 18.749/78.741 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/bjt-diffpair-transient | op, tran | success/converged | success/converged | 16.954/530.956 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/bjt-schmitt-trigger | op, tran | unsupported/failed | success/converged | 22.728/564.317 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/diode-temperature-sweep | op, dc | unsupported/failed | success/converged | 29.706/93.402 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/mos1-nand-transient | op, tran | unsupported/failed | success/converged | 25.753/116.329 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/bjt-rtl-inverter-chain | op, dc, tran | success/converged | success/converged | 27.025/377.215 | 3 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/dual-lc-uic-rejection | tran | unsupported/failed | success/converged | 22.004/121.764 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/opamp-voltage-follower | op, ac, dc, tran | unsupported/failed | unsupported/not-run | 20.495/82.329 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/mos7-nand-no-bypass | op, tran | failed/failed | unsupported/not-run | 21.182/76.092 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/bjt-diffpair-current-source | op, tran, ac | success/converged | success/converged | 24.201/486.699 | 3 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |

Every unsupported or failed spice-ts row is a published loss. Engine error strings, input hashes, commands, signal lists, point counts, and matched-point metrics are retained in the JSON report.

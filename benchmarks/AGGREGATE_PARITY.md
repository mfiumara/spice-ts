# Aggregate 100-circuit parity report

This report publishes all outcomes, including failures and unsupported cases. It makes no speed or superiority claim.

## Reproduction

- Generate: `pnpm exec tsx benchmarks/aggregate-report.ts`
- Verify committed outcomes: `pnpm exec tsx benchmarks/aggregate-report.ts --check`
- Machine: Apple M5 Pro; darwin 27.0.0 arm64; Node v22.23.1
- Tools: spice-ts 0.3.0; ngspice-47; pnpm 10.28.1
- Deterministic outcome SHA-256 (host, timings, and error text excluded): `94d6a7d3432ff8bf2f73c61273da6ec3c95d2dac69d7478ae5d0b51d887a1e5d`
- Aggregate fixture-tree SHA-256: `23aaa91cfde358550eec443e8b5aaec134d7a7f930b1810f6e7f7db2532d6307`.
- Source catalogue SHA-256: `7785fe7a3bd52b0d2c8e63ac99ad34168c538e7a9b1965d0d6a5407cb20c969a`.
- Runtime is one wall-clock sample per engine/fixture. Treat it as diagnostic data, not a performance comparison.

## Policy and totals

- Both engines receive the exact same fixture bytes; each row records the common SHA-256.
- No fixture adaptation and no per-circuit tolerance tuning.
- Comparison method: errors are evaluated at the spice-ts output points with ngspice linearly interpolated onto them; relative errors divide by that ngspice value.
- Breakpoint alignment ([#445](https://github.com/mfiumara/spice-ts/issues/445)): At a source breakpoint both engines report the left limit, so a waveform that steps there (for example L·di/dt at a PWL corner) shows its right limit only at the next ngspice sample. Linear interpolation across that interval invents values neither engine produced and charges them as error at every spice-ts point inside it. For transients, every time point present in both engines' grids is treated as a breakpoint. Inside an ngspice interval that opens at one, each spice-ts sample is compared with the nearer of the linear interpolation and the right-sided reconstruction from the next two ngspice samples. Every other sample, analysis, and tolerance is unchanged.
- The pre-#445 plain-linear metric is still published for every comparison as `linearMetrics` in `benchmarks/aggregate-report.json`, so the change hides no loss. The envelope below uses the primary breakpoint-aligned metric.
- Accounted fixtures: 100 (ngspice=20, classic=20, xyce=20, corpus-d=20, corpus-e=20).

| Engine | Success | Failed | Unsupported |
|---|---:|---:|---:|
| ngspice | 52 | 9 | 39 |
| spice-ts | 68 | 1 | 31 |

- Matched-point errors: 71 analyses across 52 fixtures. Full per-signal max/RMS absolute and relative errors are in `benchmarks/aggregate-report.json`.
- Matched signals: 975 absolute (3669358 samples); 939 relative (3658412 samples, 10946 zero references excluded).
- Matched-point envelope (worst per signal): absolute max 7018.333251953125, absolute RMS 7018.333251953125, relative max 436128.09132992564, relative RMS 243438.5559477603.
- Descriptive single-run runtime sums: ngspice 7831.268 ms; spice-ts 43216.837 ms.

## Transition from the previous accepted report

- Baseline: [issue #502](https://github.com/mfiumara/spice-ts/issues/502), [PR #603](https://github.com/mfiumara/spice-ts/pull/603), head `a91fd90db94c6f5fbfe1f53b420aa5d4298527f1`, outcome `4cb5cbd09a8045fbd35e337d44fcc7064175bfdd0521a85d477da768d08d063f`.
- Previous totals: ngspice 52/9/39 success/failed/unsupported; spice-ts 61/1/38; 67 analyses across 48 fixtures.
- Previous matched-point envelope: absolute max 7853.15771484375, absolute RMS 7853.15771484375, relative max 975815.5539797375, relative RMS 203361.3440880642.
- spiceTs `ngspice/mos-amplifier-transient`: unsupported → success.
- spiceTs `classic/bsim1-device-sweep`: unsupported → success.
- spiceTs `classic/bsim2-device-sweep`: unsupported → success.
- spiceTs `classic/mos-amplifier`: unsupported → success.
- spiceTs `xyce/capacitor-rc-transient-newlte`: unsupported → success.
- spiceTs `xyce/diode-zener-5229`: unsupported → success.
- spiceTs `corpus-e/mutual-inductance-ac`: unsupported → success.
- Top 10 aggregate metric moves by |change / baseline| (zero baselines first; null and unchanged values omitted). Includes coverage counts and both error increases and decreases; not a per-circuit ranking.
- Metric relativeSamples: 9364906 → 3658412.
- Metric absoluteSamples: 9388792 → 3669358.
- Metric maximumRelativeError: 975815.5539797375 → 436128.09132992564.
- Metric excludedZeroReferences: 23886 → 10946.
- Metric maximumRelativeRms: 203361.3440880642 → 243438.5559477603.
- Metric comparedSignals: 879 → 975.
- Metric relativeComparedSignals: 847 → 939.
- Metric maximumAbsoluteError: 7853.15771484375 → 7018.333251953125.
- Metric maximumAbsoluteRms: 7853.15771484375 → 7018.333251953125.
- Metric comparedFixtures: 48 → 52.
- [Full transition ledger](results/aggregate-transitions/94d6a7d3432ff8bf2f73c61273da6ec3c95d2dac69d7478ae5d0b51d887a1e5d.json) (7 status changes, 62 historical narratives).

## Gap tracking

- [#76] — parser syntax, directives, expressions, and unsupported device cards
- [#75] — noise, pole-zero, and distortion analyses
- [#7] — transmission-line devices
- [#5] — BJT model coverage
- [#3] — MOS model coverage
- [#123] — jimi-fuzz transient waveform divergence
- [#280] — newly exposed classic-corpus execution failures and RCA3040 regression
- [#366] — non-terminating xyce/inductor-transient simulation
- [#391] — unmapped .disto results in the corpus harness (classic/diode-distortion now compared; see the ledger)
- [#427] — MOS1 inverter transient supply-current spike after #417 (closed by PR #436; residual mos1-inverter-sweep TRAN losses published in the ledger)
- [#432] — transient output emitted before .tran TSTART (closed by PR #440)
- [#451] — .pz root-finder missed poles and zeros on wide-spread time constants (closed by PR #466; vbic-common-emitter-ac now matches ngspice's 7 poles and 6 zeros at relative error up to 1.2e-7)
- [#468] — MOS6 (level 6) still uses the generic C(v) trapezoidal history instead of the #456 charge state
- [#469] — charge-based LTE (ngspice CKTterr) for device charges; targets the post-#456 mesa-oscillator and bjt-rtl-inverter-chain step-control losses
- [#461] — trapezoidal ringing in source currents driving voltage-dependent capacitance (MOS6 i(vin) loss)

[#76]: https://github.com/mfiumara/spice-ts/issues/76
[#75]: https://github.com/mfiumara/spice-ts/issues/75
[#7]: https://github.com/mfiumara/spice-ts/issues/7
[#5]: https://github.com/mfiumara/spice-ts/issues/5
[#3]: https://github.com/mfiumara/spice-ts/issues/3
[#123]: https://github.com/mfiumara/spice-ts/issues/123
[#280]: https://github.com/mfiumara/spice-ts/issues/280
[#366]: https://github.com/mfiumara/spice-ts/issues/366
[#391]: https://github.com/mfiumara/spice-ts/issues/391
[#427]: https://github.com/mfiumara/spice-ts/issues/427
[#432]: https://github.com/mfiumara/spice-ts/issues/432
[#451]: https://github.com/mfiumara/spice-ts/issues/451
[#468]: https://github.com/mfiumara/spice-ts/issues/468
[#469]: https://github.com/mfiumara/spice-ts/issues/469
[#461]: https://github.com/mfiumara/spice-ts/issues/461

## Per-circuit outcomes

| Fixture | Analyses | ngspice | spice-ts | Runtime ms (ng/spice-ts) | Compared analyses | Gap issues |
|---|---|---|---|---:|---:|---|
| ngspice/vbic-fo | dc | success | success | 26.9/618.6 | 1 | [#76] |
| ngspice/vbic-temperature | dc | success | success | 21.3/360.2 | 1 | [#76] |
| ngspice/mos6-inverter-transient | tran | success | success | 43.1/427.0 | 1 | [#76], [#461] |
| ngspice/jfet-vds-vgs | op, dc | success | success | 21.4/307.3 | 2 | [#76] |
| ngspice/rc-lowpass-ac | op, ac | success | success | 26.9/328.1 | 2 | [#76] |
| ngspice/ac-zero-frequency | ac | failed | success | 25.0/352.2 | 0 | [#76] |
| ngspice/vbic-common-emitter-ac | ac, pz | success | success | 38.2/353.0 | 2 | [#76], [#75], [#451] |
| ngspice/probe-ac | ac | success | success | 22.7/325.0 | 1 | [#76] |
| ngspice/rc-transient | tran | success | success | 25.1/335.7 | 1 | [#76] |
| ngspice/mos-amplifier-transient | tran | success | success | 581.6/4643.3 | 1 | [#76] |
| ngspice/mos6-simple-inverter-transient | tran | success | success | 28.9/476.5 | 1 | [#76], [#461] |
| ngspice/ltra-line-transient | tran | success | success | 72.4/627.7 | 1 | [#76], [#7] |
| ngspice/hfet-inverter | tran | success | success | 32.7/363.0 | 1 | [#76] |
| ngspice/mesa-oscillator | tran | success | success | 40.8/380.5 | 1 | [#76], [#432] |
| ngspice/jimi-fuzz | op, tran | success | success | 3937.1/2592.7 | 2 | [#76], [#123] |
| ngspice/schmitt-trigger | tran | success | success | 90.8/865.1 | 1 | [#76] |
| ngspice/inductive-positive-definite-2x2 | op | failed | unsupported | 31.4/597.5 | 0 | [#76] |
| ngspice/inductive-positive-definite-3x3 | op | failed | unsupported | 25.7/506.1 | 0 | [#76] |
| ngspice/inductive-positive-definite-4x4 | op | failed | unsupported | 39.6/572.9 | 0 | [#76] |
| ngspice/inductive-positive-definite-ac | op, ac | failed | unsupported | 41.9/554.5 | 0 | [#76] |
| classic/bjt-noise | noise | success | success | 25.5/656.5 | 2 | [#76], [#75] |
| classic/bsim1-device-sweep | dc | success | success | 51.9/717.0 | 1 | [#76] |
| classic/bsim2-device-sweep | dc | success | success | 50.0/592.7 | 1 | [#76] |
| classic/bjt-differential-pair | tran | success | success | 43.1/690.8 | 1 | [#76] |
| classic/diode-distortion | disto | success | success | 33.4/491.2 | 3 | [#76], [#75] |
| classic/lossy-line-24-inch | tran | success | success | 101.3/654.8 | 1 | [#76], [#7] |
| classic/lossy-line-aluminium | tran | success | success | 403.3/525.4 | 1 | [#76], [#7] |
| classic/coupled-lossy-lines | tran | success | success | 91.5/413.2 | 1 | [#76], [#7] |
| classic/bjt-mixer-distortion | none | failed | failed | 15.6/200.3 | 0 | [#76], [#75] |
| classic/mos6-inverter-chain | tran | success | success | 33.1/349.3 | 1 | [#76], [#461], [#280] |
| classic/mos-amplifier | tran | success | success | 344.4/3348.9 | 1 | [#76], [#280] |
| classic/mos-memory-cell | tran | success | success | 18.7/257.3 | 1 | [#76], [#280] |
| classic/pole-zero-four-stage | pz | success | success | 17.8/218.3 | 1 | [#76], [#75] |
| classic/pole-zero-three-stage | pz | success | success | 16.1/221.8 | 1 | [#76], [#75] |
| classic/rc-transient | tran | success | success | 17.2/232.1 | 1 | [#76] |
| classic/rca3040-wideband-amplifier | ac, dc, tran | success | success | 21.2/283.7 | 3 | [#76], [#280] |
| classic/resistor-noise | noise | success | success | 17.9/240.3 | 2 | [#76], [#75] |
| classic/rtl-inverter-chain | dc, tran | success | success | 18.5/258.2 | 2 | [#76] |
| classic/ecl-schmitt-trigger | tran | success | success | 18.4/270.3 | 1 | [#76] |
| classic/high-pass-pole-zero | pz | success | success | 19.7/213.0 | 1 | [#76], [#75] |
| xyce/capacitor-rc-transient | tran | unsupported | success | 16.0/227.2 | 0 | [#76] |
| xyce/capacitor-rc-transient-newlte | tran | unsupported | success | 16.6/224.2 | 0 | [#76] |
| xyce/capacitor-rc-oscillator | tran | unsupported | success | 16.9/257.9 | 0 | [#76] |
| xyce/diode-level2-temperature-breakdown | tran | unsupported | unsupported | 28.3/251.0 | 0 | [#76] |
| xyce/diode-zener-5229 | dc | unsupported | success | 18.5/223.4 | 0 | [#76] |
| xyce/diode-transient | tran | unsupported | success | 15.9/217.0 | 0 | [#76] |
| xyce/diode-sidewall-dc | dc | success | success | 15.3/206.6 | 1 | [#76] |
| xyce/inductor-transient | tran | success | success | 74.6/208.5 | 1 | [#76], [#366] |
| xyce/njfet-2109-dc | dc | success | success | 21.0/222.2 | 1 | [#76] |
| xyce/njfet-stepped-dc | dc | unsupported | unsupported | 16.1/214.4 | 0 | [#76] |
| xyce/nmos-level1-dc | dc | success | success | 16.0/210.6 | 1 | [#76], [#3] |
| xyce/npn-dc | dc | success | success | 15.2/201.0 | 1 | [#76], [#5] |
| xyce/pmos-level1-dc | dc | success | success | 15.2/193.1 | 1 | [#76], [#3] |
| xyce/pnp-dc | dc | success | success | 15.0/187.7 | 1 | [#76], [#5] |
| xyce/resistor-dc | dc | success | success | 14.3/183.9 | 1 | [#76] |
| xyce/resistor-level3-zero | dc | success | success | 14.9/230.7 | 1 | [#76] |
| xyce/resistor-negative | dc | success | success | 29.2/221.7 | 1 | [#76] |
| xyce/rlc-transient | tran | success | success | 21.4/238.3 | 1 | [#76] |
| xyce/vccs-dc | dc | success | success | 19.0/251.1 | 1 | [#76] |
| xyce/vcvs-dc | dc | success | success | 21.7/291.2 | 1 | [#76] |
| corpus-d/ohms-law-op | op | unsupported | unsupported | 18.1/227.6 | 0 | [#76] |
| corpus-d/diode-operating-point | op | unsupported | unsupported | 16.5/228.4 | 0 | [#76] |
| corpus-d/ekv-bias-sweep | op, dc | unsupported | unsupported | 16.2/232.1 | 0 | [#76] |
| corpus-d/downscaling-current-mirror | op, dc | unsupported | unsupported | 17.5/219.6 | 0 | [#76] |
| corpus-d/transresistance-ac | op, ac | unsupported | unsupported | 14.3/247.3 | 0 | [#76] |
| corpus-d/passive-pole-zero-ac | op, pz, ac | unsupported | unsupported | 34.5/279.7 | 0 | [#76], [#75] |
| corpus-d/resistor-voltage-ac | op, ac | unsupported | unsupported | 15.2/244.8 | 0 | [#76] |
| corpus-d/series-resonance-ac | op, ac | unsupported | unsupported | 39.3/343.5 | 0 | [#76] |
| corpus-d/am-source-transient | tran | unsupported | unsupported | 23.2/370.1 | 0 | [#76] |
| corpus-d/fft-source-transient | tran | unsupported | unsupported | 29.5/370.2 | 0 | [#76] |
| corpus-d/coupled-transformer-transient | tran, pss | unsupported | unsupported | 23.1/386.1 | 0 | [#76] |
| corpus-d/rlc-trapezoidal-transient | op, tran | unsupported | unsupported | 25.4/308.1 | 0 | [#76] |
| corpus-d/diode-voltage-doubler | op, tran | unsupported | unsupported | 23.2/293.3 | 0 | [#76] |
| corpus-d/ekv-ring-oscillator | op, tran | unsupported | unsupported | 17.2/371.5 | 0 | [#76] |
| corpus-d/cockcroft-walton-x8 | op, tran | unsupported | unsupported | 22.3/282.9 | 0 | [#76] |
| corpus-d/pwm-switch | op, tran | unsupported | unsupported | 21.1/260.6 | 0 | [#76] |
| corpus-d/rlc-gear3 | op, tran | unsupported | unsupported | 19.4/270.5 | 0 | [#76] |
| corpus-d/rlc-gear5 | op, tran | unsupported | unsupported | 17.5/321.7 | 0 | [#76] |
| corpus-d/rlc-gear6 | op, tran | unsupported | unsupported | 28.8/303.1 | 0 | [#76] |
| corpus-d/colpitts-oscillator | op, tran | unsupported | unsupported | 23.1/277.2 | 0 | [#76] |
| corpus-e/cccs-mixed-analysis | op, tran, ac | unsupported | success | 20.5/300.3 | 0 | [#76] |
| corpus-e/vcvs-operating-point | op, ac | failed | unsupported | 21.7/272.6 | 0 | [#76] |
| corpus-e/diode-bias-sweep | op, dc | success | success | 20.2/278.4 | 2 | [#76] |
| corpus-e/mos1-inverter-sweep | op, dc, tran | success | success | 19.8/324.8 | 3 | [#76], [#427] |
| corpus-e/transmission-line-ac | ac | unsupported | unsupported | 31.0/780.4 | 0 | [#76] |
| corpus-e/mutual-inductance-ac | ac, tran | unsupported | success | 37.4/532.6 | 0 | [#76] |
| corpus-e/bjt-diffpair-ac | dc, tran, op, ac | unsupported | success | 25.1/393.1 | 0 | [#76] |
| corpus-e/opamp-open-loop-ac | op, ac, dc | failed | unsupported | 22.5/361.6 | 0 | [#76] |
| corpus-e/capacitor-step-transient | tran | unsupported | success | 23.6/319.7 | 0 | [#76] |
| corpus-e/capacitor-initial-condition | tran | unsupported | success | 23.7/325.7 | 0 | [#76] |
| corpus-e/lc-oscillator-transient | tran | unsupported | success | 22.3/305.8 | 0 | [#76] |
| corpus-e/bjt-diffpair-transient | op, tran | success | success | 26.5/336.0 | 2 | [#76] |
| corpus-e/bjt-schmitt-trigger | op, tran | unsupported | success | 20.8/329.5 | 0 | [#76] |
| corpus-e/diode-temperature-sweep | op, dc | unsupported | success | 20.5/281.1 | 0 | [#76] |
| corpus-e/mos1-nand-transient | op, tran | unsupported | success | 18.5/250.3 | 0 | [#76] |
| corpus-e/bjt-rtl-inverter-chain | op, dc, tran | success | success | 17.2/244.1 | 3 | [#76] |
| corpus-e/dual-lc-uic-rejection | tran | unsupported | success | 15.5/241.3 | 0 | [#76] |
| corpus-e/opamp-voltage-follower | op, ac, dc, tran | unsupported | unsupported | 14.4/197.9 | 0 | [#76] |
| corpus-e/mos7-nand-no-bypass | op, tran | failed | unsupported | 14.8/192.5 | 0 | [#76] |
| corpus-e/bjt-diffpair-current-source | op, tran, ac | success | success | 16.7/227.6 | 3 | [#76] |

Every unsupported or failed spice-ts row is a published loss. Convergence details, unrounded runtimes, engine error strings, input hashes, commands, signal lists, point counts, and matched-point metrics are retained in [the JSON report](aggregate-report.json).

## Transient fine-step reference (#592)

- Fine-step reference (#592): ngspice-47 runs the same deck with every active .tran card rewritten to TMAX_fine = min(TSTEP, (TSTOP - TSTART)/50, deck TMAX if given) / 10, i.e. the ngspice default step ceiling divided by 10; TSTEP, TSTOP, TSTART, UIC and every other card are unchanged. The rule is the same for every transient fixture. No reference is generated when the deck has no parsable .tran card outside .control, or when TSTOP/TMAX_fine exceeds 1000000 steps; the ngspice run is bounded at 600 s. Each default run (spice-ts, ngspice) is scored by the same procedure: at the reference's output points, with the default run linearly interpolated onto them, over the transient signals of the headline comparison, normalised by the reference peak with the same per-quantity floors. The headline's one-sided breakpoint alignment applies at every default-run time point within ngspice's breakpoint merge distance (CKTminBreak = 0.00005 x TMAX_fine) of a reference time point; the headline matches breakpoints bit for bit, which here would favour ngspice, whose default run lands on its own reference's breakpoint times exactly while spice-ts's land a few ulps away. This charges each engine for its own published waveform, so a coarse output grid counts against whichever engine produced it. Status (matched/mismatch) is defined by the headline column only. One fine reference is not a convergence proof, and neither column is an accuracy ranking of the engines.
- One fine reference is not a convergence proof: it is one more discretisation of the same circuit by the same engine. These columns are diagnostics of grid sensitivity, not an accuracy ranking and not a claim that either engine is more accurate. Status stays defined by the headline column.
- Transient rows: 26; fine reference compared for 25, unavailable for 1. Above 0.01 among compared rows: headline (transient signals) 7, spice-ts vs fine 18, ngspice default vs fine 18.

| Fixture | Status (headline) | Headline tran worst (vs ngspice default) | spice-ts vs fine | ngspice default vs fine | Fine TMAX | Note |
|---|---|---|---|---|---|---|
| ngspice/mos6-inverter-transient | success/success | 0.00798 (v(xndinv4.14)) | 0.083 (i(vin)) | 0.0831 (i(vin)) | 5e-11 |  |
| ngspice/rc-transient | success/success | 1.4e-15 (i(vin)) | 0.00171 (i(vin)) | 0.00171 (i(vin)) | 0.01 |  |
| ngspice/mos-amplifier-transient | success/success | 0.0119 (v(6)) | 0.0489 (v(6)) | 0.0464 (v(6)) | 1e-8 |  |
| ngspice/mos6-simple-inverter-transient | success/success | 0.000326 (i(vin)) | 0.231 (i(vin)) | 0.231 (i(vin)) | 5e-11 |  |
| ngspice/ltra-line-transient | success/success | 0.000796 (i(vs)) | 0.367 (i(vs)) | 0.368 (i(vs)) | 1e-11 |  |
| ngspice/hfet-inverter | success/success | 8.25 (v(4)) | 8.25 (v(4)) | 0.0207 (i(vdd)) | 1e-12 |  |
| ngspice/mesa-oscillator | success/success | 0.000151 (i(vnoise)) | 0.889 (i(vnoise)) | 0.89 (i(vnoise)) | 1e-13 |  |
| ngspice/jimi-fuzz | success/success | 0.336 (v(9)) |  |  | 0.00000208333 | TSTOP/TMAX_fine = 2400004 steps exceeds the 1000000-step budget |
| ngspice/schmitt-trigger | success/success | 0.107 (i(vin)) | 0.897 (i(vin)) | 0.92 (i(vin)) | 1e-9 |  |
| classic/bjt-differential-pair | success/success | 0.000194 (i(vin)) | 0.00308 (v(1)) | 0.00308 (v(1)) | 5e-10 |  |
| classic/lossy-line-24-inch | success/success | 0.00395 (v(3)) | 0.0815 (v(3)) | 0.0847 (v(3)) | 1e-11 |  |
| classic/lossy-line-aluminium | success/success | 0.0018 (v(x1.x2.x1.3)) | 244 (i(vcc)) | 244 (i(vcc)) | 1e-13 |  |
| classic/coupled-lossy-lines | success/success | 0.488 (v(x3.2)) | 0.552 (v(x3.2)) | 0.59 (v(x3.2)) | 1e-11 |  |
| classic/mos6-inverter-chain | success/success | 0.00798 (v(xndinv4.14)) | 0.083 (i(vin)) | 0.0831 (i(vin)) | 5e-11 |  |
| classic/mos-amplifier | success/success | 0.0119 (v(6)) | 0.0489 (v(6)) | 0.0464 (v(6)) | 1e-8 |  |
| classic/mos-memory-cell | success/success | 0.000636 (i(vdd)) | 0.00265 (v(4)) | 0.00262 (v(4)) | 2e-9 |  |
| classic/rc-transient | success/success | 1.4e-15 (i(vin)) | 0.00171 (i(vin)) | 0.00171 (i(vin)) | 0.01 |  |
| classic/rca3040-wideband-amplifier | success/success | 0.0111 (v(31)) | 0.0489 (v(1)) | 0.0489 (v(1)) | 2e-10 |  |
| classic/rtl-inverter-chain | success/success | 0.00148 (v(2)) | 0.0539 (v(2)) | 0.0534 (v(2)) | 2e-10 |  |
| classic/ecl-schmitt-trigger | success/success | 0.107 (i(vin)) | 0.897 (i(vin)) | 0.92 (i(vin)) | 1e-9 |  |
| xyce/inductor-transient | success/success | 1.61e-13 (v(2)) | 1.27e-12 (v(2)) | 9.52e-13 (v(1)) | 0.00001 |  |
| xyce/rlc-transient | success/success | 5.11e-14 (i(v1)) | 0.000285 (i(l1)) | 0.000285 (i(l1)) | 0.001 |  |
| corpus-e/mos1-inverter-sweep | success/success | 0.00014 (v(4)) | 0.167 (v(3)) | 0.167 (v(3)) | 1e-11 |  |
| corpus-e/bjt-diffpair-transient | success/success | 0.00207 (v(3)) | 0.0123 (v(1)) | 0.0123 (v(1)) | 1e-9 |  |
| corpus-e/bjt-rtl-inverter-chain | success/success | 0.00208 (v(2)) | 0.0537 (v(2)) | 0.0532 (v(2)) | 4e-10 |  |
| corpus-e/bjt-diffpair-current-source | success/success | 0.000216 (v(3)) | 0.00386 (v(1)) | 0.00386 (v(1)) | 5.6e-10 |  |

Status in this table is the engine status pair (ngspice/spice-ts); the aggregate report has no matched/mismatch status. The columns use the corpus-f normalised metric (worst |error| / reference peak with the per-quantity floors), not the absolute and relative metrics above.

# Aggregate 100-circuit parity report

This report publishes all outcomes, including failures and unsupported cases. It makes no speed or superiority claim.

## Reproduction

- Generate: `pnpm exec tsx benchmarks/aggregate-report.ts`
- Verify committed outcomes: `pnpm exec tsx benchmarks/aggregate-report.ts --check`
- Machine: Apple M5 Pro; darwin 27.0.0 arm64; Node v22.23.1
- Tools: spice-ts 0.3.0; ngspice-47; pnpm 10.28.1
- Deterministic outcome SHA-256 (host, timings, and error text excluded): `2c5abd0d6ffb637d98ef8a9248ce2007932b0b211064a6445175fc3bb9056ba8`
- Aggregate fixture-tree SHA-256: `9bea16d967510fe868e68bfad672b02b477802d63bfe191660d4a0a737602cba`.
- Source catalogue SHA-256: `b6540a743d176a01cc8e8aff6412655cc09f5fbf30554a53222c1d290c3029a1`.
- Runtime is one wall-clock sample per engine/fixture. Treat it as diagnostic data, not a performance comparison.

## Policy and totals

- Both engines receive the exact same fixture bytes; each row records the common SHA-256.
- No fixture adaptation and no per-circuit tolerance tuning.
- Accounted fixtures: 100 (ngspice=20, classic=20, xyce=20, corpus-d=20, corpus-e=20).
- ngspice: 52 success, 9 failed, 39 unsupported.
- spice-ts: 28 success, 9 failed, 63 unsupported.
- Matched-point errors: 28 analyses across 18 fixtures. Full per-signal max/RMS absolute and relative errors are in `benchmarks/aggregate-report.json`.
- Matched signals: 253 absolute (7413027 samples); 235 relative (7410627 samples, 2400 zero references excluded).
- Matched-point envelope (worst per signal): absolute max 90.09458674829554, absolute RMS 59.660512653520904, relative max 273625086.91875815, relative RMS 131055144.90676585.
- Descriptive single-run runtime sums: ngspice 10199.135 ms; spice-ts 7428.371 ms.

## Transition from the previous accepted report

- Baseline: [issue #209](https://github.com/mfiumara/spice-ts/issues/209), [PR #213](https://github.com/mfiumara/spice-ts/pull/213), head `f98cb95bbbdd93393e1f555dfe86e45ab6bcd00c`, outcome `45aee36e07a056380b1b0057b9397cc323f594fdb381f254b023e11fdfe2b009`.
- Previous totals: ngspice 52/9/39 success/failed/unsupported; spice-ts 15/4/81; 20 analyses across 13 fixtures.
- Previous matched-point envelope: absolute max 183.91564521207212, absolute RMS 87.25304257950958, relative max 9829734.595793912, relative RMS 1160907.113030371.
- spiceTs `classic/bsim1-device-sweep`: unsupported → success. Merged parser and MOS coverage now runs the unchanged DC sweep.
- spiceTs `classic/bsim2-device-sweep`: unsupported → success. Merged parser and MOS coverage now runs the unchanged DC sweep.
- spiceTs `classic/bjt-differential-pair`: unsupported → success. Merged source-card and BJT coverage now runs the unchanged transient analysis.
- spiceTs `classic/diode-distortion`: unsupported → failed. The parser now reaches execution, where the bounded distortion implementation rejects the diode device.
- spiceTs `classic/mos6-inverter-chain`: unsupported → failed. The parser now reaches transient execution, which stops with a timestep-too-small failure.
- spiceTs `classic/mos-amplifier`: unsupported → failed. The parser now reaches execution, which stops on a singular matrix at the vddn branch.
- spiceTs `classic/mos-memory-cell`: unsupported → failed. The parser now reaches transient execution, which stops with a timestep-too-small failure.
- spiceTs `classic/rca3040-wideband-amplifier`: success → failed. Operating-point convergence now oscillates, removing the prior OP, AC, and transient comparisons.
- spiceTs `classic/rtl-inverter-chain`: unsupported → success. Merged parser and BJT coverage now runs the unchanged DC and transient analyses.
- spiceTs `corpus-e/cccs-mixed-analysis`: unsupported → success. Merged Gnucap control/output handling and device coverage now run the unchanged fixture.
- spiceTs `corpus-e/mos1-inverter-sweep`: unsupported → success. Merged source-card and MOS coverage now runs OP, DC, and transient analyses.
- spiceTs `corpus-e/bjt-diffpair-ac`: unsupported → success. Merged source-card and BJT coverage now runs the unchanged fixture.
- spiceTs `corpus-e/capacitor-step-transient`: unsupported → success. Merged source-card and transient coverage now runs the unchanged fixture.
- spiceTs `corpus-e/capacitor-initial-condition`: unsupported → success. Merged initial-condition and transient coverage now runs the unchanged fixture.
- spiceTs `corpus-e/lc-oscillator-transient`: unsupported → success. Merged source-card and transient coverage now runs the unchanged fixture.
- spiceTs `corpus-e/diode-temperature-sweep`: unsupported → success. Merged temperature-sweep and diode coverage now runs the unchanged fixture.
- spiceTs `corpus-e/mos1-nand-transient`: unsupported → success. Merged source-card and MOS coverage now runs the unchanged fixture.
- spiceTs `corpus-e/bjt-rtl-inverter-chain`: unsupported → success. Merged source-card and BJT coverage now runs OP, DC, and transient analyses.
- spiceTs `corpus-e/dual-lc-uic-rejection`: unsupported → success. Merged transient and initial-condition validation now runs the unchanged fixture.
- Comparable coverage rose from 20 to 28 analyses and from 13 to 18 fixtures. Eleven newly comparable analyses were added, while the RCA3040 regression removed three prior comparisons.
- Matched absolute signals rose from 189 to 253 and samples from 7,384,608 to 7,413,027. Relative signals rose from 178 to 235 and samples from 7,384,277 to 7,410,627.
- Excluded zero-reference samples rose from 331 to 2,400 because the newly compared analyses include more exact-zero ngspice reference points.
- Absolute max fell from 183.91564521207212 to 90.09458674829554 and absolute RMS fell from 87.25304257950958 to 59.660512653520904 because the failed RCA3040 AC result no longer contributes its v(15) loss. This is not an accuracy improvement.
- Relative max rose from 9829734.595793912 to 273625086.91875815 and relative RMS rose from 1160907.113030371 to 131055144.90676585. The new worst signal is v(4) in the corpus-e MOS1 inverter transient.

## Gap tracking

- https://github.com/mfiumara/spice-ts/issues/76 — parser syntax, directives, expressions, and unsupported device cards
- https://github.com/mfiumara/spice-ts/issues/75 — noise, pole-zero, and distortion analyses
- https://github.com/mfiumara/spice-ts/issues/7 — transmission-line devices
- https://github.com/mfiumara/spice-ts/issues/5 — BJT model coverage
- https://github.com/mfiumara/spice-ts/issues/3 — MOS model coverage
- https://github.com/mfiumara/spice-ts/issues/123 — jimi-fuzz transient waveform divergence
- https://github.com/mfiumara/spice-ts/issues/280 — newly exposed classic-corpus execution failures and RCA3040 regression

## Per-circuit outcomes

| Fixture | Analyses | ngspice | spice-ts | Runtime ms (ng/spice-ts) | Compared analyses | Gap issues |
|---|---|---|---|---:|---:|---|
| ngspice/vbic-fo | dc | success/converged | unsupported/not-run | 23.937/58.627 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/vbic-temperature | dc | success/converged | unsupported/not-run | 14.234/13.383 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/mos6-inverter-transient | tran | success/converged | unsupported/not-run | 40.231/0.995 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/jfet-vds-vgs | op, dc | success/converged | unsupported/not-run | 13.322/0.564 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/rc-lowpass-ac | op, ac | success/converged | unsupported/not-run | 12.567/11.895 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/ac-zero-frequency | ac | failed/not-run | unsupported/not-run | 12.253/0.572 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/vbic-common-emitter-ac | ac, pz | success/converged | unsupported/not-run | 19.494/15.87 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| ngspice/probe-ac | ac | success/converged | unsupported/not-run | 13.182/12.596 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/rc-transient | tran | success/converged | unsupported/not-run | 13.25/12.492 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/mos-amplifier-transient | tran | success/converged | unsupported/not-run | 268.924/0.379 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/mos6-simple-inverter-transient | tran | success/converged | unsupported/not-run | 16.863/0.637 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/ltra-line-transient | tran | success/converged | unsupported/not-run | 20.591/0.802 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#7](https://github.com/mfiumara/spice-ts/issues/7) |
| ngspice/hfet-inverter | tran | success/converged | unsupported/not-run | 16.679/0.786 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/mesa-oscillator | tran | success/converged | unsupported/not-run | 24.957/23.459 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/jimi-fuzz | op, tran | success/converged | success/converged | 7735.911/6771.548 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#123](https://github.com/mfiumara/spice-ts/issues/123) |
| ngspice/schmitt-trigger | tran | success/converged | unsupported/not-run | 14.674/0.651 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/inductive-positive-definite-2x2 | op | failed/not-run | unsupported/not-run | 13.094/0.451 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/inductive-positive-definite-3x3 | op | failed/not-run | unsupported/not-run | 12.152/0.359 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/inductive-positive-definite-4x4 | op | failed/not-run | unsupported/not-run | 12.255/0.397 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/inductive-positive-definite-ac | op, ac | failed/not-run | unsupported/not-run | 13.176/0.521 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/bjt-noise | noise | success/converged | unsupported/not-run | 12.152/0.374 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/bsim1-device-sweep | dc | success/converged | success/converged | 28.766/8.776 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/bsim2-device-sweep | dc | success/converged | success/converged | 24.421/19.617 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/bjt-differential-pair | tran | success/converged | success/converged | 27.636/13.9 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/diode-distortion | disto | success/converged | failed/not-run | 15.154/14.146 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/lossy-line-24-inch | tran | success/converged | unsupported/not-run | 26.246/0.529 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#7](https://github.com/mfiumara/spice-ts/issues/7) |
| classic/lossy-line-aluminium | tran | success/converged | unsupported/not-run | 174.803/119.903 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#7](https://github.com/mfiumara/spice-ts/issues/7) |
| classic/coupled-lossy-lines | tran | success/converged | unsupported/not-run | 59.95/0.653 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#7](https://github.com/mfiumara/spice-ts/issues/7) |
| classic/bjt-mixer-distortion | none | failed/not-run | unsupported/not-run | 11.241/10.879 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/mos6-inverter-chain | tran | success/converged | failed/failed | 63.437/38.414 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#280](https://github.com/mfiumara/spice-ts/issues/280) |
| classic/mos-amplifier | tran | success/converged | failed/failed | 298.759/9.496 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#280](https://github.com/mfiumara/spice-ts/issues/280) |
| classic/mos-memory-cell | tran | success/converged | failed/failed | 24.856/7.881 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#280](https://github.com/mfiumara/spice-ts/issues/280) |
| classic/pole-zero-four-stage | pz | success/converged | unsupported/not-run | 18.426/2.279 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/pole-zero-three-stage | pz | success/converged | unsupported/not-run | 16.343/1.09 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/rc-transient | tran | success/converged | success/converged | 15.795/1.307 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/rca3040-wideband-amplifier | ac, dc, tran | success/converged | failed/failed | 36.569/15.002 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#280](https://github.com/mfiumara/spice-ts/issues/280) |
| classic/resistor-noise | noise | success/converged | unsupported/not-run | 15.512/0.728 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/rtl-inverter-chain | dc, tran | success/converged | success/converged | 32.129/10.304 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/ecl-schmitt-trigger | tran | success/converged | unsupported/not-run | 16.545/0.487 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/high-pass-pole-zero | pz | success/converged | unsupported/not-run | 15.439/1.016 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| xyce/capacitor-rc-transient | tran | unsupported/failed | success/converged | 15.122/0.906 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/capacitor-rc-transient-newlte | tran | unsupported/failed | unsupported/not-run | 15.076/0.467 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/capacitor-rc-oscillator | tran | unsupported/failed | unsupported/not-run | 14.503/0.931 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/diode-level2-temperature-breakdown | tran | unsupported/failed | unsupported/not-run | 13.658/0.797 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/diode-zener-5229 | dc | unsupported/failed | unsupported/not-run | 14.365/0.508 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/diode-transient | tran | unsupported/failed | unsupported/not-run | 13.565/0.611 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/diode-sidewall-dc | dc | success/converged | success/converged | 18.319/1.052 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/inductor-transient | tran | success/converged | unsupported/not-run | 14.367/0.495 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/njfet-2109-dc | dc | success/converged | success/converged | 14.313/1.02 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/njfet-stepped-dc | dc | unsupported/failed | unsupported/not-run | 14.833/1.507 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/nmos-level1-dc | dc | success/converged | failed/not-run | 16.765/0.626 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#3](https://github.com/mfiumara/spice-ts/issues/3) |
| xyce/npn-dc | dc | success/converged | failed/not-run | 16.476/0.584 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#5](https://github.com/mfiumara/spice-ts/issues/5) |
| xyce/pmos-level1-dc | dc | success/converged | failed/not-run | 14.244/0.471 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#3](https://github.com/mfiumara/spice-ts/issues/3) |
| xyce/pnp-dc | dc | success/converged | failed/not-run | 12.932/0.46 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#5](https://github.com/mfiumara/spice-ts/issues/5) |
| xyce/resistor-dc | dc | success/converged | success/converged | 13.183/0.541 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/resistor-level3-zero | dc | success/converged | success/converged | 16.695/0.487 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/resistor-negative | dc | success/converged | success/converged | 14.195/0.426 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/rlc-transient | tran | success/converged | unsupported/not-run | 17.796/0.503 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/vccs-dc | dc | success/converged | success/converged | 12.319/11.84 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/vcvs-dc | dc | success/converged | success/converged | 11.916/0.617 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/ohms-law-op | op | unsupported/failed | unsupported/not-run | 11.443/0.381 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/diode-operating-point | op | unsupported/failed | unsupported/not-run | 11.183/0.368 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/ekv-bias-sweep | op, dc | unsupported/failed | unsupported/not-run | 11.187/0.392 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/downscaling-current-mirror | op, dc | unsupported/failed | unsupported/not-run | 11.052/0.4 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/transresistance-ac | op, ac | unsupported/failed | unsupported/not-run | 11.226/0.327 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/passive-pole-zero-ac | op, pz, ac | unsupported/failed | unsupported/not-run | 11.187/0.374 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| corpus-d/resistor-voltage-ac | op, ac | unsupported/failed | unsupported/not-run | 10.916/0.335 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/series-resonance-ac | op, ac | unsupported/failed | unsupported/not-run | 11.16/0.341 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/am-source-transient | tran | unsupported/failed | unsupported/not-run | 10.866/0.356 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/fft-source-transient | tran | unsupported/failed | unsupported/not-run | 11.306/0.359 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/coupled-transformer-transient | tran, pss | unsupported/failed | unsupported/not-run | 11.779/0.423 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/rlc-trapezoidal-transient | op, tran | unsupported/failed | unsupported/not-run | 11.37/0.36 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/diode-voltage-doubler | op, tran | unsupported/failed | unsupported/not-run | 11.789/0.478 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/ekv-ring-oscillator | op, tran | unsupported/failed | unsupported/not-run | 11.298/0.426 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/cockcroft-walton-x8 | op, tran | unsupported/failed | unsupported/not-run | 11.588/0.394 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/pwm-switch | op, tran | unsupported/failed | unsupported/not-run | 11.588/0.402 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/rlc-gear3 | op, tran | unsupported/failed | unsupported/not-run | 11.059/0.378 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/rlc-gear5 | op, tran | unsupported/failed | unsupported/not-run | 11.362/0.389 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/rlc-gear6 | op, tran | unsupported/failed | unsupported/not-run | 11.775/0.356 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/colpitts-oscillator | op, tran | unsupported/failed | unsupported/not-run | 11.613/0.415 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/cccs-mixed-analysis | op, tran, ac | unsupported/failed | success/converged | 13.67/1.59 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/vcvs-operating-point | op, ac | failed/failed | unsupported/not-run | 12.324/0.46 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/diode-bias-sweep | op, dc | success/converged | success/converged | 13.233/0.748 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/mos1-inverter-sweep | op, dc, tran | success/converged | success/converged | 19.788/5.527 | 3 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/transmission-line-ac | ac | unsupported/failed | unsupported/not-run | 11.494/0.408 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/mutual-inductance-ac | ac, tran | unsupported/failed | unsupported/not-run | 12.085/0.596 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/bjt-diffpair-ac | dc, tran, op, ac | unsupported/failed | success/converged | 17.334/5.911 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/opamp-open-loop-ac | op, ac, dc | failed/failed | unsupported/not-run | 11.792/0.647 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/capacitor-step-transient | tran | unsupported/failed | success/converged | 13.489/0.658 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/capacitor-initial-condition | tran | unsupported/failed | success/converged | 11.595/0.513 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/lc-oscillator-transient | tran | unsupported/failed | success/converged | 15.019/3.87 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/bjt-diffpair-transient | op, tran | success/converged | success/converged | 20.198/7.118 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/bjt-schmitt-trigger | op, tran | unsupported/failed | success/converged | 158.407/145.794 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/diode-temperature-sweep | op, dc | unsupported/failed | success/converged | 13.015/0.733 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/mos1-nand-transient | op, tran | unsupported/failed | success/converged | 14.128/1.899 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/bjt-rtl-inverter-chain | op, dc, tran | success/converged | success/converged | 15.859/2.847 | 3 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/dual-lc-uic-rejection | tran | unsupported/failed | success/converged | 17.948/6.757 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/opamp-voltage-follower | op, ac, dc, tran | unsupported/failed | unsupported/not-run | 11.267/0.476 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/mos7-nand-no-bypass | op, tran | failed/failed | unsupported/not-run | 10.951/0.35 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/bjt-diffpair-current-source | op, tran, ac | success/converged | success/converged | 18.225/5.201 | 3 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |

Every unsupported or failed spice-ts row is a published loss. Engine error strings, input hashes, commands, signal lists, point counts, and matched-point metrics are retained in the JSON report.

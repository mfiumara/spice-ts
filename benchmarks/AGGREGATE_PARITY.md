# Aggregate 100-circuit parity report

This report publishes all outcomes, including failures and unsupported cases. It makes no speed or superiority claim.

## Reproduction

- Generate: `pnpm exec tsx benchmarks/aggregate-report.ts`
- Verify committed outcomes: `pnpm exec tsx benchmarks/aggregate-report.ts --check`
- Machine: Apple M5 Pro; darwin 27.0.0 arm64; Node v22.23.1
- Tools: spice-ts 0.3.0; ngspice-47; pnpm 10.28.1
- Deterministic outcome SHA-256 (host, timings, and error text excluded): `45aee36e07a056380b1b0057b9397cc323f594fdb381f254b023e11fdfe2b009`
- Runtime is one wall-clock sample per engine/fixture. Treat it as diagnostic data, not a performance comparison.

## Policy and totals

- Both engines receive the exact same fixture bytes; each row records the common SHA-256.
- No fixture adaptation and no per-circuit tolerance tuning.
- Accounted fixtures: 100 (ngspice=20, classic=20, xyce=20, corpus-d=20, corpus-e=20).
- ngspice: 52 success, 9 failed, 39 unsupported.
- spice-ts: 15 success, 4 failed, 81 unsupported.
- Matched-point errors: 20 analyses across 13 fixtures. Full per-signal max/RMS absolute and relative errors are in `benchmarks/aggregate-report.json`.
- Matched signals: 189 absolute (7384608 samples); 178 relative (7384277 samples, 331 zero references excluded).
- Matched-point envelope (worst per signal): absolute max 183.91564521207212, absolute RMS 87.25304257950958, relative max 9829734.595793912, relative RMS 1160907.113030371.
- Descriptive single-run runtime sums: ngspice 9326.901 ms; spice-ts 5566.460 ms.

## Transition from the previous accepted report

- Baseline: [issue #200](https://github.com/mfiumara/spice-ts/issues/200), [PR #201](https://github.com/mfiumara/spice-ts/pull/201), head `c41391cb9b4dc537863f430a80288d1f28024f6c`, outcome `1623472590a082b6af2a82d9fd09b0756ef0458a50f2fd4b1d095b90bf6b6e7f`.
- Previous totals: ngspice 52/9/39 success/failed/unsupported; spice-ts 15/4/81; 20 analyses across 13 fixtures.
- Previous matched-point envelope: absolute max 183.91564521207212, absolute RMS 87.25304257950958, relative max 9829734.595793912, relative RMS 1160907.113030371.
- Status transitions: none. Both engines retained every prior success, failure, and unsupported classification.

## Gap tracking

- https://github.com/mfiumara/spice-ts/issues/76 — parser syntax, directives, expressions, and unsupported device cards
- https://github.com/mfiumara/spice-ts/issues/75 — noise, pole-zero, and distortion analyses
- https://github.com/mfiumara/spice-ts/issues/7 — transmission-line devices
- https://github.com/mfiumara/spice-ts/issues/5 — BJT model coverage
- https://github.com/mfiumara/spice-ts/issues/3 — MOS model coverage
- https://github.com/mfiumara/spice-ts/issues/123 — jimi-fuzz transient waveform divergence

## Per-circuit outcomes

| Fixture | Analyses | ngspice | spice-ts | Runtime ms (ng/spice-ts) | Compared analyses | Gap issues |
|---|---|---|---|---:|---:|---|
| ngspice/vbic-fo | dc | success/converged | unsupported/not-run | 18.919/49.035 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/vbic-temperature | dc | success/converged | unsupported/not-run | 13.614/12.866 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/mos6-inverter-transient | tran | success/converged | unsupported/not-run | 24.133/0.863 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/jfet-vds-vgs | op, dc | success/converged | unsupported/not-run | 11.754/0.525 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/rc-lowpass-ac | op, ac | success/converged | unsupported/not-run | 11.294/10.699 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/ac-zero-frequency | ac | failed/not-run | unsupported/not-run | 11.4/0.377 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/vbic-common-emitter-ac | ac, pz | success/converged | unsupported/not-run | 16.52/0.572 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| ngspice/probe-ac | ac | success/converged | unsupported/not-run | 11.092/0.36 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/rc-transient | tran | success/converged | unsupported/not-run | 11.744/0.47 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/mos-amplifier-transient | tran | success/converged | unsupported/not-run | 253.995/0.389 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/mos6-simple-inverter-transient | tran | success/converged | unsupported/not-run | 13.375/12.618 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/ltra-line-transient | tran | success/converged | unsupported/not-run | 16.021/0.356 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#7](https://github.com/mfiumara/spice-ts/issues/7) |
| ngspice/hfet-inverter | tran | success/converged | unsupported/not-run | 13.455/12.782 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/mesa-oscillator | tran | success/converged | unsupported/not-run | 22.588/21.102 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/jimi-fuzz | op, tran | success/converged | success/converged | 7320.622/5170.305 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#123](https://github.com/mfiumara/spice-ts/issues/123) |
| ngspice/schmitt-trigger | tran | success/converged | unsupported/not-run | 13.47/0.52 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/inductive-positive-definite-2x2 | op | failed/not-run | unsupported/not-run | 11.626/11.248 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/inductive-positive-definite-3x3 | op | failed/not-run | unsupported/not-run | 11.024/0.326 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/inductive-positive-definite-4x4 | op | failed/not-run | unsupported/not-run | 10.594/0.4 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/inductive-positive-definite-ac | op, ac | failed/not-run | unsupported/not-run | 10.664/0.375 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/bjt-noise | noise | success/converged | unsupported/not-run | 10.983/0.343 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/bsim1-device-sweep | dc | success/converged | unsupported/not-run | 15.731/0.362 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/bsim2-device-sweep | dc | success/converged | unsupported/not-run | 17.641/0.359 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/bjt-differential-pair | tran | success/converged | unsupported/not-run | 12.317/11.702 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/diode-distortion | disto | success/converged | unsupported/not-run | 12.54/0.385 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/lossy-line-24-inch | tran | success/converged | unsupported/not-run | 23.414/0.456 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#7](https://github.com/mfiumara/spice-ts/issues/7) |
| classic/lossy-line-aluminium | tran | success/converged | unsupported/not-run | 167.824/0.68 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#7](https://github.com/mfiumara/spice-ts/issues/7) |
| classic/coupled-lossy-lines | tran | success/converged | unsupported/not-run | 57.586/0.565 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#7](https://github.com/mfiumara/spice-ts/issues/7) |
| classic/bjt-mixer-distortion | none | failed/not-run | unsupported/not-run | 10.846/0.421 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/mos6-inverter-chain | tran | success/converged | unsupported/not-run | 22.522/0.408 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/mos-amplifier | tran | success/converged | unsupported/not-run | 245.77/0.361 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/mos-memory-cell | tran | success/converged | unsupported/not-run | 12.716/12.02 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/pole-zero-four-stage | pz | success/converged | unsupported/not-run | 11.265/0.382 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/pole-zero-three-stage | pz | success/converged | unsupported/not-run | 11.023/10.576 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/rc-transient | tran | success/converged | success/converged | 11.58/0.914 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/rca3040-wideband-amplifier | ac, dc, tran | success/converged | success/converged | 40.689/23.859 | 3 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/resistor-noise | noise | success/converged | unsupported/not-run | 11.154/10.667 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/rtl-inverter-chain | dc, tran | success/converged | unsupported/not-run | 12.018/0.291 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/ecl-schmitt-trigger | tran | success/converged | unsupported/not-run | 11.507/0.307 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/high-pass-pole-zero | pz | success/converged | unsupported/not-run | 11.084/1.096 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| xyce/capacitor-rc-transient | tran | unsupported/failed | success/converged | 10.261/0.641 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/capacitor-rc-transient-newlte | tran | unsupported/failed | unsupported/not-run | 9.627/0.345 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/capacitor-rc-oscillator | tran | unsupported/failed | unsupported/not-run | 9.67/0.36 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/diode-level2-temperature-breakdown | tran | unsupported/failed | unsupported/not-run | 10.096/0.594 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/diode-zener-5229 | dc | unsupported/failed | unsupported/not-run | 9.9/0.293 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/diode-transient | tran | unsupported/failed | unsupported/not-run | 9.645/0.343 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/diode-sidewall-dc | dc | success/converged | success/converged | 10.99/0.752 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/inductor-transient | tran | success/converged | unsupported/not-run | 11.171/0.368 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/njfet-2109-dc | dc | success/converged | success/converged | 11.681/0.852 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/njfet-stepped-dc | dc | unsupported/failed | unsupported/not-run | 12.774/1.144 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/nmos-level1-dc | dc | success/converged | failed/not-run | 11.718/0.413 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#3](https://github.com/mfiumara/spice-ts/issues/3) |
| xyce/npn-dc | dc | success/converged | failed/not-run | 11.173/10.689 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#5](https://github.com/mfiumara/spice-ts/issues/5) |
| xyce/pmos-level1-dc | dc | success/converged | failed/not-run | 10.448/0.33 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#3](https://github.com/mfiumara/spice-ts/issues/3) |
| xyce/pnp-dc | dc | success/converged | failed/not-run | 10.522/0.373 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#5](https://github.com/mfiumara/spice-ts/issues/5) |
| xyce/resistor-dc | dc | success/converged | success/converged | 10.326/0.356 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/resistor-level3-zero | dc | success/converged | success/converged | 10.469/0.371 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/resistor-negative | dc | success/converged | success/converged | 10.207/0.349 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/rlc-transient | tran | success/converged | unsupported/not-run | 13.821/0.336 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/vccs-dc | dc | success/converged | success/converged | 10.994/0.533 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/vcvs-dc | dc | success/converged | success/converged | 10.655/0.511 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/ohms-law-op | op | unsupported/failed | unsupported/not-run | 9.835/0.31 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/diode-operating-point | op | unsupported/failed | unsupported/not-run | 9.412/0.275 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/ekv-bias-sweep | op, dc | unsupported/failed | unsupported/not-run | 9.896/0.31 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/downscaling-current-mirror | op, dc | unsupported/failed | unsupported/not-run | 9.652/0.308 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/transresistance-ac | op, ac | unsupported/failed | unsupported/not-run | 9.442/0.259 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/passive-pole-zero-ac | op, pz, ac | unsupported/failed | unsupported/not-run | 10.617/0.239 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| corpus-d/resistor-voltage-ac | op, ac | unsupported/failed | unsupported/not-run | 9.658/0.292 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/series-resonance-ac | op, ac | unsupported/failed | unsupported/not-run | 9.481/0.258 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/am-source-transient | tran | unsupported/failed | unsupported/not-run | 9.408/0.277 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/fft-source-transient | tran | unsupported/failed | unsupported/not-run | 9.659/0.306 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/coupled-transformer-transient | tran, pss | unsupported/failed | unsupported/not-run | 9.777/0.283 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/rlc-trapezoidal-transient | op, tran | unsupported/failed | unsupported/not-run | 9.633/0.295 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/diode-voltage-doubler | op, tran | unsupported/failed | unsupported/not-run | 10.044/0.299 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/ekv-ring-oscillator | op, tran | unsupported/failed | unsupported/not-run | 9.452/0.36 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/cockcroft-walton-x8 | op, tran | unsupported/failed | unsupported/not-run | 10.016/0.309 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/pwm-switch | op, tran | unsupported/failed | unsupported/not-run | 9.605/0.297 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/rlc-gear3 | op, tran | unsupported/failed | unsupported/not-run | 9.344/0.305 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/rlc-gear5 | op, tran | unsupported/failed | unsupported/not-run | 9.24/0.276 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/rlc-gear6 | op, tran | unsupported/failed | unsupported/not-run | 9.974/0.265 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/colpitts-oscillator | op, tran | unsupported/failed | unsupported/not-run | 10.146/0.314 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/cccs-mixed-analysis | op, tran, ac | unsupported/failed | unsupported/not-run | 10.506/0.361 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/vcvs-operating-point | op, ac | failed/failed | unsupported/not-run | 10.284/0.363 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/diode-bias-sweep | op, dc | success/converged | success/converged | 11.225/0.648 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/mos1-inverter-sweep | op, dc, tran | success/converged | unsupported/not-run | 11.515/0.307 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/transmission-line-ac | ac | unsupported/failed | unsupported/not-run | 12.363/0.306 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/mutual-inductance-ac | ac, tran | unsupported/failed | unsupported/not-run | 10.587/0.48 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/bjt-diffpair-ac | dc, tran, op, ac | unsupported/failed | unsupported/not-run | 9.976/0.329 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/opamp-open-loop-ac | op, ac, dc | failed/failed | unsupported/not-run | 12.176/0.381 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/capacitor-step-transient | tran | unsupported/failed | unsupported/not-run | 10.19/0.356 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/capacitor-initial-condition | tran | unsupported/failed | unsupported/not-run | 10.28/0.358 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/lc-oscillator-transient | tran | unsupported/failed | unsupported/not-run | 10.086/0.349 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/bjt-diffpair-transient | op, tran | success/converged | success/converged | 12.818/1.543 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/bjt-schmitt-trigger | op, tran | unsupported/failed | success/converged | 149.554/138.512 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/diode-temperature-sweep | op, dc | unsupported/failed | unsupported/not-run | 10.47/10.096 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/mos1-nand-transient | op, tran | unsupported/failed | unsupported/not-run | 10.608/0.36 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/bjt-rtl-inverter-chain | op, dc, tran | success/converged | unsupported/not-run | 11.316/0.318 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/dual-lc-uic-rejection | tran | unsupported/failed | unsupported/not-run | 10.234/0.355 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/opamp-voltage-follower | op, ac, dc, tran | unsupported/failed | unsupported/not-run | 10.456/0.409 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/mos7-nand-no-bypass | op, tran | failed/failed | unsupported/not-run | 10.016/0.329 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/bjt-diffpair-current-source | op, tran, ac | success/converged | success/converged | 13.688/2.168 | 3 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |

Every unsupported or failed spice-ts row is a published loss. Engine error strings, input hashes, commands, signal lists, point counts, and matched-point metrics are retained in the JSON report.

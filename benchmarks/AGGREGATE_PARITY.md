# Aggregate 100-circuit parity report

This report publishes all outcomes, including failures and unsupported cases. It makes no speed or superiority claim.

## Reproduction

- Generate: `pnpm exec tsx benchmarks/aggregate-report.ts`
- Verify committed outcomes: `pnpm exec tsx benchmarks/aggregate-report.ts --check`
- Machine: Apple M5 Pro; darwin 27.0.0 arm64; Node v22.23.1
- Tools: spice-ts 0.3.0; ngspice-47; pnpm 10.28.1
- Deterministic outcome SHA-256 (host, timings, and error text excluded): `68aa8e2e7b78b82f801da84cf5c88c489634d203f44bca5df9345a1946deddb9`
- Aggregate fixture-tree SHA-256: `01b19fe5baf170d91aa5bd72c3ffb3891ed2f2c45cca5adfee8288552a7e14f1`.
- Source catalogue SHA-256: `f8cc57771ac07684b1bdebb43ad2ab572f048a9e67d5df98386dc9eb706a188f`.
- Runtime is one wall-clock sample per engine/fixture. Treat it as diagnostic data, not a performance comparison.

## Policy and totals

- Both engines receive the exact same fixture bytes; each row records the common SHA-256.
- No fixture adaptation and no per-circuit tolerance tuning.
- Accounted fixtures: 100 (ngspice=20, classic=20, xyce=20, corpus-d=20, corpus-e=20).
- ngspice: 52 success, 9 failed, 39 unsupported.
- spice-ts: 55 success, 2 failed, 43 unsupported.
- Matched-point errors: 58 analyses across 43 fixtures. Full per-signal max/RMS absolute and relative errors are in `benchmarks/aggregate-report.json`.
- Matched signals: 878 absolute (9182709 samples); 848 relative (9147783 samples, 34926 zero references excluded).
- Matched-point envelope (worst per signal): absolute max 1169140310571.719, absolute RMS 1169140310571.719, relative max 45497356677842.63, relative RMS 872317191517.6284.
- Descriptive single-run runtime sums: ngspice 77150.906 ms; spice-ts 270491.926 ms.

## Transition from the previous accepted report

- Baseline: [issue #321](https://github.com/mfiumara/spice-ts/issues/321), [PR #325](https://github.com/mfiumara/spice-ts/pull/325), head `e400d87c791dfa27f572a349777c8ebb9f2450d4`, outcome `26be9f80744c077c0bdb98fa5c6c9cffc8615c2e2589383507abd59fd6fed41b`.
- Previous totals: ngspice 52/9/39 success/failed/unsupported; spice-ts 51/3/46; 54 analyses across 39 fixtures.
- Previous matched-point envelope: absolute max 1169140310571.719, absolute RMS 1169140310571.719, relative max 2110199067.731876, relative RMS 326930690.296368.
- spiceTs `ngspice/ltra-line-transient`: unsupported → success. Accepted benchmark-bounded lossy LTRA parsing and transient stamping (#308, PR #320) lets the unchanged fixture complete; every per-signal max/RMS error remains published.
- spiceTs `classic/lossy-line-24-inch`: unsupported → success. Accepted benchmark-bounded lossy LTRA parsing and transient stamping (#308, PR #320) lets the unchanged fixture complete; every per-signal max/RMS error remains published.
- spiceTs `classic/lossy-line-aluminium`: unsupported → success. Accepted benchmark-bounded lossy LTRA parsing and transient stamping (#308, PR #320) lets the unchanged fixture complete; every per-signal max/RMS error remains published.
- spiceTs `classic/coupled-lossy-lines`: unsupported → success. Accepted benchmark-bounded lossy LTRA parsing and transient stamping (#308, PR #320) lets the unchanged fixture complete; every per-signal max/RMS error remains published.
- spiceTs `ngspice/hfet-inverter`: failed → unsupported. Accepted subcircuit device validation (#338, PR #341) now rejects the unsupported Z or B card at parse time; the earlier singular-matrix failure no longer occurs, and the fixture remains a published loss.
- spiceTs `ngspice/mesa-oscillator`: failed → unsupported. Accepted subcircuit device validation (#338, PR #341) now rejects the unsupported Z or B card at parse time; the earlier singular-matrix failure no longer occurs, and the fixture remains a published loss.
- spiceTs `xyce/inductor-transient`: unsupported → failed. Accepted disabled NEWBPSTEPPING TIMEINT compatibility (#322, PR #326) removes the parse rejection. The unchanged transient then never terminates, so the aggregate now bounds spice-ts at the same 120000 ms wall clock as ngspice and records a failed execution (#366).
- Comparable coverage increased from 54 analyses across 39 fixtures to 58 analyses across 43 fixtures. The four LTRA fixtures add one transient comparison each.
- Two-source nested DC sweeps (#354, PR #359) now emit every nested point. ngspice/jfet-vds-vgs, xyce/njfet-2109-dc, xyce/nmos-level1-dc, and xyce/pnp-dc compare on the full nested grid with the same signal sets. corpus-e/diode-temperature-sweep emits 2 DC points instead of 3. It has no ngspice comparison.
- Matched coverage increased from 561 to 878 absolute signals and from 535 to 848 relative signals. Absolute samples increased from 7,959,622 to 9,182,709; relative samples increased from 7,944,908 to 9,147,783; excluded zero references increased from 14,714 to 34,926. The LTRA fixtures add 317 signals and 1,219,613 absolute samples; the nested DC grids add 3,474 absolute samples.
- The worst per-signal absolute max and RMS remain 1169140310571.719 from ngspice/vbic-common-emitter-ac. classic/coupled-lossy-lines v(5) raises the worst relative max from 2110199067.731876 to 45497356677842.63 and relative RMS from 326930690.296368 to 872317191517.6284. These are published losses: the relative metric divides by near-zero ngspice samples on that signal, whose absolute max is 1.4200318868351707 V. No tolerance changed.
- Status-preserving diagnostic changes: bounded TEMP LIST stepping (#318, PR #327) makes xyce/diode-level2-temperature-breakdown report a missing top-level transient result instead of a TEMP step error. The classic noise-interval fix (#336, PR #337) makes classic/bjt-noise and classic/resistor-noise report a missing noise result instead of a parse error. All three remain unsupported.
- spice-ts now runs in a child process bounded at the 120000 ms ngspice subprocess timeout. Its runtime is the child-measured adapter time, and the engines now run sequentially so neither receipt includes the other engine. Runtime sums are not comparable with the previous in-process sample and support no speed claim.

## Gap tracking

- https://github.com/mfiumara/spice-ts/issues/76 — parser syntax, directives, expressions, and unsupported device cards
- https://github.com/mfiumara/spice-ts/issues/75 — noise, pole-zero, and distortion analyses
- https://github.com/mfiumara/spice-ts/issues/7 — transmission-line devices
- https://github.com/mfiumara/spice-ts/issues/5 — BJT model coverage
- https://github.com/mfiumara/spice-ts/issues/3 — MOS model coverage
- https://github.com/mfiumara/spice-ts/issues/123 — jimi-fuzz transient waveform divergence
- https://github.com/mfiumara/spice-ts/issues/280 — newly exposed classic-corpus execution failures and RCA3040 regression
- https://github.com/mfiumara/spice-ts/issues/366 — non-terminating xyce/inductor-transient simulation

## Per-circuit outcomes

| Fixture | Analyses | ngspice | spice-ts | Runtime ms (ng/spice-ts) | Compared analyses | Gap issues |
|---|---|---|---|---:|---:|---|
| ngspice/vbic-fo | dc | success/converged | unsupported/not-run | 275.391/187.61 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/vbic-temperature | dc | success/converged | unsupported/not-run | 86.264/390.949 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/mos6-inverter-transient | tran | success/converged | success/converged | 410.084/14382.564 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/jfet-vds-vgs | op, dc | success/converged | success/converged | 28.497/213.506 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/rc-lowpass-ac | op, ac | success/converged | success/converged | 104.536/291.438 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/ac-zero-frequency | ac | failed/not-run | unsupported/not-run | 108.188/314.592 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/vbic-common-emitter-ac | ac, pz | success/converged | success/converged | 96.098/209.106 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| ngspice/probe-ac | ac | success/converged | unsupported/not-run | 78.931/192.019 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/rc-transient | tran | success/converged | success/converged | 85.576/309.683 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/mos-amplifier-transient | tran | success/converged | success/converged | 1487.872/1791.385 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/mos6-simple-inverter-transient | tran | success/converged | success/converged | 106.165/588.015 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/ltra-line-transient | tran | success/converged | success/converged | 260.846/380.297 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#7](https://github.com/mfiumara/spice-ts/issues/7) |
| ngspice/hfet-inverter | tran | success/converged | unsupported/not-run | 93.715/193.743 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/mesa-oscillator | tran | success/converged | unsupported/not-run | 167.464/230.527 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/jimi-fuzz | op, tran | success/converged | success/converged | 11700.337/37492.414 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#123](https://github.com/mfiumara/spice-ts/issues/123) |
| ngspice/schmitt-trigger | tran | success/converged | success/converged | 1721.346/1109.54 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/inductive-positive-definite-2x2 | op | failed/not-run | unsupported/not-run | 79.745/1183.219 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/inductive-positive-definite-3x3 | op | failed/not-run | unsupported/not-run | 303.603/121.924 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/inductive-positive-definite-4x4 | op | failed/not-run | unsupported/not-run | 85.595/1407.754 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| ngspice/inductive-positive-definite-ac | op, ac | failed/not-run | unsupported/not-run | 279.704/107.307 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/bjt-noise | noise | success/converged | unsupported/not-run | 25.048/269.13 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/bsim1-device-sweep | dc | success/converged | success/converged | 76.858/1472.627 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/bsim2-device-sweep | dc | success/converged | success/converged | 193.445/196.204 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/bjt-differential-pair | tran | success/converged | success/converged | 77.095/204.465 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/diode-distortion | disto | success/converged | failed/not-run | 76.11/722.372 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/lossy-line-24-inch | tran | success/converged | success/converged | 235.739/1701.588 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#7](https://github.com/mfiumara/spice-ts/issues/7) |
| classic/lossy-line-aluminium | tran | success/converged | success/converged | 1296.721/8076.966 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#7](https://github.com/mfiumara/spice-ts/issues/7) |
| classic/coupled-lossy-lines | tran | success/converged | success/converged | 505.853/5484.619 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#7](https://github.com/mfiumara/spice-ts/issues/7) |
| classic/bjt-mixer-distortion | none | failed/not-run | unsupported/not-run | 86.502/484.574 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/mos6-inverter-chain | tran | success/converged | success/converged | 301.483/19504.686 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#280](https://github.com/mfiumara/spice-ts/issues/280) |
| classic/mos-amplifier | tran | success/converged | success/converged | 2599.834/3087.596 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#280](https://github.com/mfiumara/spice-ts/issues/280) |
| classic/mos-memory-cell | tran | success/converged | success/converged | 95.033/374.058 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#280](https://github.com/mfiumara/spice-ts/issues/280) |
| classic/pole-zero-four-stage | pz | success/converged | success/converged | 183.113/215.855 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/pole-zero-three-stage | pz | success/converged | success/converged | 34.308/182.032 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/rc-transient | tran | success/converged | success/converged | 29.77/412.641 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/rca3040-wideband-amplifier | ac, dc, tran | success/converged | success/converged | 480.062/673.923 | 3 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#280](https://github.com/mfiumara/spice-ts/issues/280) |
| classic/resistor-noise | noise | success/converged | unsupported/not-run | 86.106/180.661 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| classic/rtl-inverter-chain | dc, tran | success/converged | success/converged | 85.902/562.303 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/ecl-schmitt-trigger | tran | success/converged | success/converged | 185.267/1717.062 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| classic/high-pass-pole-zero | pz | success/converged | success/converged | 392.648/594.829 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| xyce/capacitor-rc-transient | tran | unsupported/failed | success/converged | 217.432/470.509 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/capacitor-rc-transient-newlte | tran | unsupported/failed | unsupported/not-run | 194.875/403.91 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/capacitor-rc-oscillator | tran | unsupported/failed | success/converged | 302.291/379.935 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/diode-level2-temperature-breakdown | tran | unsupported/failed | unsupported/not-run | 83.322/221.102 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/diode-zener-5229 | dc | unsupported/failed | unsupported/not-run | 43.396/496.853 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/diode-transient | tran | unsupported/failed | success/converged | 80.761/279.335 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/diode-sidewall-dc | dc | success/converged | success/converged | 76.179/257.135 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/inductor-transient | tran | success/converged | failed/failed | 86.031/120342.326 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#366](https://github.com/mfiumara/spice-ts/issues/366) |
| xyce/njfet-2109-dc | dc | success/converged | success/converged | 22322.589/2286.562 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/njfet-stepped-dc | dc | unsupported/failed | unsupported/not-run | 4173.773/1936.932 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/nmos-level1-dc | dc | success/converged | success/converged | 2176.233/2183.61 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#3](https://github.com/mfiumara/spice-ts/issues/3) |
| xyce/npn-dc | dc | success/converged | success/converged | 3732.148/998.158 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#5](https://github.com/mfiumara/spice-ts/issues/5) |
| xyce/pmos-level1-dc | dc | success/converged | success/converged | 910.119/983.509 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#3](https://github.com/mfiumara/spice-ts/issues/3) |
| xyce/pnp-dc | dc | success/converged | success/converged | 595.691/861.729 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#5](https://github.com/mfiumara/spice-ts/issues/5) |
| xyce/resistor-dc | dc | success/converged | success/converged | 715.483/614.138 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/resistor-level3-zero | dc | success/converged | success/converged | 862.642/808.383 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/resistor-negative | dc | success/converged | success/converged | 331.325/699.514 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/rlc-transient | tran | success/converged | success/converged | 571.895/1082.022 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/vccs-dc | dc | success/converged | success/converged | 511.668/1083.48 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| xyce/vcvs-dc | dc | success/converged | success/converged | 487.745/806.87 | 1 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/ohms-law-op | op | unsupported/failed | unsupported/not-run | 589.673/872.884 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/diode-operating-point | op | unsupported/failed | unsupported/not-run | 484.131/541.616 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/ekv-bias-sweep | op, dc | unsupported/failed | unsupported/not-run | 411.763/809.157 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/downscaling-current-mirror | op, dc | unsupported/failed | unsupported/not-run | 690.375/699.85 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/transresistance-ac | op, ac | unsupported/failed | unsupported/not-run | 403.182/498.44 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/passive-pole-zero-ac | op, pz, ac | unsupported/failed | unsupported/not-run | 479.871/830.522 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76), [#75](https://github.com/mfiumara/spice-ts/issues/75) |
| corpus-d/resistor-voltage-ac | op, ac | unsupported/failed | unsupported/not-run | 697.313/871.255 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/series-resonance-ac | op, ac | unsupported/failed | unsupported/not-run | 512.61/867.521 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/am-source-transient | tran | unsupported/failed | unsupported/not-run | 404.841/775.716 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/fft-source-transient | tran | unsupported/failed | unsupported/not-run | 589.616/893.424 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/coupled-transformer-transient | tran, pss | unsupported/failed | unsupported/not-run | 293.785/586.154 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/rlc-trapezoidal-transient | op, tran | unsupported/failed | unsupported/not-run | 327.389/682.385 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/diode-voltage-doubler | op, tran | unsupported/failed | unsupported/not-run | 500.269/901.838 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/ekv-ring-oscillator | op, tran | unsupported/failed | unsupported/not-run | 597.249/698.925 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/cockcroft-walton-x8 | op, tran | unsupported/failed | unsupported/not-run | 520.815/858.562 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/pwm-switch | op, tran | unsupported/failed | unsupported/not-run | 893.713/391.707 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/rlc-gear3 | op, tran | unsupported/failed | unsupported/not-run | 196.285/590.249 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/rlc-gear5 | op, tran | unsupported/failed | unsupported/not-run | 310.812/495.764 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/rlc-gear6 | op, tran | unsupported/failed | unsupported/not-run | 299.183/485.611 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-d/colpitts-oscillator | op, tran | unsupported/failed | unsupported/not-run | 320.658/531.468 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/cccs-mixed-analysis | op, tran, ac | unsupported/failed | success/converged | 145.447/606.203 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/vcvs-operating-point | op, ac | failed/failed | unsupported/not-run | 209.972/441.017 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/diode-bias-sweep | op, dc | success/converged | success/converged | 366.14/709.819 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/mos1-inverter-sweep | op, dc, tran | success/converged | success/converged | 235.285/582.832 | 3 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/transmission-line-ac | ac | unsupported/failed | unsupported/not-run | 303.502/432.133 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/mutual-inductance-ac | ac, tran | unsupported/failed | unsupported/not-run | 140.155/529.568 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/bjt-diffpair-ac | dc, tran, op, ac | unsupported/failed | success/converged | 274.438/837.367 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/opamp-open-loop-ac | op, ac, dc | failed/failed | unsupported/not-run | 237.006/413.176 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/capacitor-step-transient | tran | unsupported/failed | success/converged | 286.044/588.774 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/capacitor-initial-condition | tran | unsupported/failed | success/converged | 133.881/399.791 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/lc-oscillator-transient | tran | unsupported/failed | success/converged | 188.997/346.604 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/bjt-diffpair-transient | op, tran | success/converged | success/converged | 121.978/467.499 | 2 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/bjt-schmitt-trigger | op, tran | unsupported/failed | success/converged | 177.31/1989.564 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/diode-temperature-sweep | op, dc | unsupported/failed | success/converged | 358.363/587.401 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/mos1-nand-transient | op, tran | unsupported/failed | success/converged | 293.99/394.05 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/bjt-rtl-inverter-chain | op, dc, tran | success/converged | success/converged | 144.035/500.535 | 3 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/dual-lc-uic-rejection | tran | unsupported/failed | success/converged | 217.38/803.504 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/opamp-voltage-follower | op, ac, dc, tran | unsupported/failed | unsupported/not-run | 202.995/458.552 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/mos7-nand-no-bypass | op, tran | failed/failed | unsupported/not-run | 299.592/434.278 | 0 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |
| corpus-e/bjt-diffpair-current-source | op, tran, ac | success/converged | success/converged | 208.411/674.416 | 3 | [#76](https://github.com/mfiumara/spice-ts/issues/76) |

Every unsupported or failed spice-ts row is a published loss. Engine error strings, input hashes, commands, signal lists, point counts, and matched-point metrics are retained in the JSON report.

# Published-reference corpus (#1113)

This baseline contains 20 distinct worked circuits from Tony R. Kuphaldt’s *Lessons in Electric Circuits* (seven chapters, one author/source family). Textbook-style published examples are explicitly permitted by #1113. The directory name is the requested umbrella, not a claim that these are vendor measurements. All reference data here are published historical SPICE simulation tables. There are no measured references, vendor app-note cases or commercial-simulator runs in this baseline.

Circuit selection used availability of complete components and numerical output, before running either engine. Sweeps remain one case each. Losses, missing samples and ambiguous reconstruction are retained. No simulator code or existing corpus totals change.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm exec tsx --test benchmarks/corpus/vendor-published/report.test.ts
spice-heavy pnpm exec tsx benchmarks/corpus/vendor-published/compare.ts --check
# Optional: re-fetch source facts; inspect upstream changes before accepting
python3 benchmarks/corpus/vendor-published/fetch-references.py
```

`compare.ts` without `--check` rewrites the JSON receipt and this document. `--check` re-runs both engines and verifies the committed receipt’s observations, statuses, hashes and totals (not timings). It does not require engines to match a historical reference: that would erase published losses. Run from repo root. No simulator install or accounts are required; ngspice-47 must already be available.

## Reference and uncertainty policy

The fetcher locates zero-based HTML PRE blocks, extracts numeric tokens and retains every displayed digit, source URL, retrieval date and page SHA-256 in `manifest.json`. No plots are digitized in this baseline: digitization uncertainty is 0. Rounding half-width is half the last displayed decimal place, including scientific notation. This is a transcription interval only, not experimental uncertainty, model uncertainty or the historical SPICE2g6 solver error. No undocumented extra tolerance is applied. A value outside that interval is reported even if both modern engines agree. Missing data is never a zero-error observation.

Voltages are differential rectangular phasors before magnitude/phase reduction. Phase residuals use the shortest angular distance in degrees. Relative error is absolute residual / absolute published value and is null for an exactly zero reference. Every point has absolute and relative errors in the JSON receipt. Since volts, amperes and degrees cannot honestly share an absolute-error RMS, the overall table reports dimensionless error / published rounding half-width; per-point absolute errors retain their units.

Both engines receive the exact committed deck bytes. Engine defaults are not adjusted; incomplete legacy AC `sin` tokens are removed only for AC-only sources. Initial DC values omitted by the book are filled with sweep starts. Legacy print/plot output is replaced by raw data; implicit operating-point examples receive explicit `.op`. Original sensor orientations, tiny resistors and coupling factors remain intact. No restricted model is used. The BJT keeps the published generic NPN model with BF=50; other parameters use engine defaults, so historical default differences are possible and not calibrated away.

No copyrighted figure, PDF or chapter HTML is redistributed. Each chapter footer links to the [CC BY 4.0 appendix](https://www.ibiblio.org/kuphaldt/electricCircuits/Ref/REF_A3.html) and [licence](https://creativecommons.org/licenses/by/4.0/). Attribution is Tony R. Kuphaldt, *Lessons in Electric Circuits*. Source links and adapted factual component reconstructions are retained per case; normalization changes are listed below. `benchmarks/SOURCES.md` records this source family. The author does not endorse this comparison.

## Overall results

Tools: ngspice-47; spice-ts 0.3.0; v22.23.1. Simulator base revision: `e85c2d79c8f237ef36a817870929ce17ef75f48f` (no simulator changes; new harness fingerprint `d85baaeeea1e6de431558d9c58ce2a9c8a0e5314a2de32e7e58fa3ff84c8a2f7`). Machine: darwin 27.0.0, arm64, Apple M5 Pro. Generated 2026-10-14T18:01:27.902Z.

Cases: 20; eligible: 19; ambiguous/excluded: 1. Published simulated cases: 20; measured cases: 0.

| Engine | Compared points | Missing points | Outside printed rounding | Max rounding units | RMS rounding units |
| --- | ---: | ---: | ---: | ---: | ---: |
| spiceTs | 267 | 1 | 30 | 1.991182e+4 | 1.723250e+3 |
| ngspice | 267 | 1 | 29 | 1.575460e+5 | 1.330542e+4 |

The maximum/RMS rounding-unit totals are dominated by the instrumentation-amplifier table’s near-zero cancellation residue (~1e-10 V), not a large physical voltage error. Keep those points, but do not interpret this normalization as engineering accuracy or engine superiority. Shared modern-vs-historical losses occur in RC transient output, rounded phase output and the generic BJT sweep. Both engines lack the RC UIC time-zero sample; it is missing, not extrapolated. The BJT has both TS-only and ngspice-only outside-rounding observations; neither engine is treated as the published oracle.

## Per-case summary

| Case | Analysis | Published simulation points | Measured | TS status / outside / missing | ngspice status / outside / missing | Included |
| --- | --- | ---: | --- | --- | --- | --- |
| dc-single-resistor | op | 2 | none | success / 0 / 0 | success / 0 / 0 | yes |
| dc-series | dc | 4 | none | success / 0 / 0 | success / 0 / 0 | yes |
| dc-parallel | dc | 6 | none | success / 0 / 0 | success / 0 / 0 | yes |
| dc-two-source | dc | 3 | none | success / 0 / 0 | success / 0 / 0 | yes |
| dc-wheatstone | dc | 5 | none | success / 0 / 0 | success / 0 / 0 | yes |
| ac-series-rl | ac | 6 | none | success / 0 / 0 | success / 0 / 0 | yes |
| ac-series-rc | ac | 6 | none | success / 0 / 0 | success / 0 / 0 | yes |
| ac-series-rlc | ac | 8 | none | success / 0 / 0 | success / 0 / 0 | yes |
| ac-parallel-rlc | ac | 8 | none | success / 0 / 0 | success / 0 / 0 | yes |
| ac-mixed-rlc | ac | 14 | none | success / 0 / 0 | success / 0 / 0 | yes |
| ac-lc-ladder | ac | 30 | none | success / 0 / 0 | success / 0 / 0 | yes |
| dc-intro-network | op | 2 | none | success / 0 / 0 | success / 0 / 0 | no |
| tran-rc-delay | tran | 21 | none | success / 13 / 1 | success / 13 / 1 | yes |
| ac-multiple-source | ac | 1 | none | success / 0 / 0 | success / 0 / 0 | yes |
| ac-phase-shift | ac | 4 | none | success / 2 / 0 | success / 2 / 0 | yes |
| ac-three-winding-transformer | ac | 3 | none | success / 0 / 0 | success / 0 / 0 | yes |
| dc-common-base-bjt | dc | 51 | none | success / 13 / 0 | success / 12 / 0 | yes |
| dc-inverting-opamp | dc | 71 | none | success / 0 / 0 | success / 0 / 0 | yes |
| dc-noninverting-opamp | op | 3 | none | success / 0 / 0 | success / 0 / 0 | yes |
| dc-instrumentation-amplifier | dc | 22 | none | success / 2 / 0 | success / 2 / 0 | yes |

## All reference points and residuals

Published values below are simulated, not measured. Each ± interval is printed rounding; digitization uncertainty is 0 throughout. Timings and all relative errors are in `corpus/vendor-published/results.json`. One process startup per ngspice case and warm in-process TS execution make these timing receipts unsuitable for a speed claim.

### dc-single-resistor

Source: [Lessons in Electric Circuits: my first circuit                                                                ](https://www.ibiblio.org/kuphaldt/electricCircuits/DC/DC_2.html), retrieved 2026-10-14.

- Original node numbers, polarity and ideal component values retained; names capitalized.
- Legacy print/plot cards replaced by native raw output; explicit .op added where the publication relies on implicit OP.
- No tolerance overrides; no model calibration. Published AC amplitude convention retained, not converted to RMS or peak.

| Coordinate | Signal | Unit | Published simulated | ± rounding | spice-ts | TS abs error | ngspice-47 | ng abs error |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | v(1) | V | 10.0000 | 5.000000e-5 | 1.000000e+1 | 0.000000e+0 | 1.000000e+1 | 0.000000e+0 |
| 0 | i(v) | A | -2.000E+00 | 5.000000e-4 | -2.000000e+0 | 0.000000e+0 | -2.000000e+0 | 0.000000e+0 |

### dc-series

Source: [Lessons in Electric Circuits: series circuit](https://www.ibiblio.org/kuphaldt/electricCircuits/DC/DC_5.html), retrieved 2026-10-14.

- Original node numbers, polarity and ideal component values retained; names capitalized.
- Legacy print/plot cards replaced by native raw output; explicit .op added where the publication relies on implicit OP.
- No tolerance overrides; no model calibration. Published AC amplitude convention retained, not converted to RMS or peak.
- Fill omitted initial source DC value with sweep start; published .dc sweep is unchanged.

| Coordinate | Signal | Unit | Published simulated | ± rounding | spice-ts | TS abs error | ngspice-47 | ng abs error |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 9 | v(1,2) | V | 1.500E+00 | 5.000000e-4 | 1.500000e+0 | 8.881784e-16 | 1.500000e+0 | 0.000000e+0 |
| 9 | v(2,3) | V | 5.000E+00 | 5.000000e-4 | 5.000000e+0 | 8.881784e-16 | 5.000000e+0 | 0.000000e+0 |
| 9 | v(3) | V | 2.500E+00 | 5.000000e-4 | 2.500000e+0 | 0.000000e+0 | 2.500000e+0 | 0.000000e+0 |
| 9 | i(v1) | A | -5.000E-04 | 5.000000e-8 | -5.000000e-4 | 0.000000e+0 | -5.000000e-4 | 1.084202e-19 |

### dc-parallel

Source: [Lessons in Electric Circuits: Parallel circuit](https://www.ibiblio.org/kuphaldt/electricCircuits/DC/DC_5.html), retrieved 2026-10-14.

- Original node numbers, polarity and ideal component values retained; names capitalized.
- Legacy print/plot cards replaced by native raw output; explicit .op added where the publication relies on implicit OP.
- No tolerance overrides; no model calibration. Published AC amplitude convention retained, not converted to RMS or peak.
- Fill omitted initial source DC value with sweep start; published .dc sweep is unchanged.

| Coordinate | Signal | Unit | Published simulated | ± rounding | spice-ts | TS abs error | ngspice-47 | ng abs error |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 9 | v(2) | V | 9.000E+00 | 5.000000e-4 | 9.000000e+0 | 0.000000e+0 | 9.000000e+0 | 0.000000e+0 |
| 9 | v(3) | V | 9.000E+00 | 5.000000e-4 | 9.000000e+0 | 0.000000e+0 | 9.000000e+0 | 0.000000e+0 |
| 9 | v(4) | V | 9.000E+00 | 5.000000e-4 | 9.000000e+0 | 0.000000e+0 | 9.000000e+0 | 0.000000e+0 |
| 9 | i(vr1) | A | 9.000E-04 | 5.000000e-8 | 9.000000e-4 | 1.084202e-19 | 9.000000e-4 | 1.084202e-19 |
| 9 | i(vr2) | A | 4.500E-03 | 5.000000e-7 | 4.500000e-3 | 8.673617e-19 | 4.500000e-3 | 1.734723e-18 |
| 9 | i(vr3) | A | 9.000E-03 | 5.000000e-7 | 9.000000e-3 | 1.734723e-18 | 9.000000e-3 | 1.734723e-18 |

### dc-two-source

Source: [Lessons in Electric Circuits: network analysis example   ](https://www.ibiblio.org/kuphaldt/electricCircuits/DC/DC_10.html), retrieved 2026-10-14.

- Original node numbers, polarity and ideal component values retained; names capitalized.
- Legacy print/plot cards replaced by native raw output; explicit .op added where the publication relies on implicit OP.
- No tolerance overrides; no model calibration. Published AC amplitude convention retained, not converted to RMS or peak.
- Fill omitted initial source DC value with sweep start; published .dc sweep is unchanged.

| Coordinate | Signal | Unit | Published simulated | ± rounding | spice-ts | TS abs error | ngspice-47 | ng abs error |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 28 | v(1,2) | V | 2.000E+01 | 5.000000e-3 | 2.000000e+1 | 0.000000e+0 | 2.000000e+1 | 0.000000e+0 |
| 28 | v(2) | V | 8.000E+00 | 5.000000e-4 | 8.000000e+0 | 0.000000e+0 | 8.000000e+0 | 0.000000e+0 |
| 28 | v(2,3) | V | 1.000E+00 | 5.000000e-4 | 1.000000e+0 | 0.000000e+0 | 1.000000e+0 | 0.000000e+0 |

### dc-wheatstone

Source: [Lessons in Electric Circuits: unbalanced wheatstone bridge   ](https://www.ibiblio.org/kuphaldt/electricCircuits/DC/DC_10.html), retrieved 2026-10-14.

- Original node numbers, polarity and ideal component values retained; names capitalized.
- Legacy print/plot cards replaced by native raw output; explicit .op added where the publication relies on implicit OP.
- No tolerance overrides; no model calibration. Published AC amplitude convention retained, not converted to RMS or peak.
- Fill omitted initial source DC value with sweep start; published .dc sweep is unchanged.

| Coordinate | Signal | Unit | Published simulated | ± rounding | spice-ts | TS abs error | ngspice-47 | ng abs error |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 24 | v(1,2) | V | 6.345E+00 | 5.000000e-4 | 6.344828e+0 | 1.724138e-4 | 6.344828e+0 | 1.724138e-4 |
| 24 | v(1,3) | V | 4.690E+00 | 5.000000e-4 | 4.689655e+0 | 3.448276e-4 | 4.689655e+0 | 3.448276e-4 |
| 24 | v(3,2) | V | 1.655E+00 | 5.000000e-4 | 1.655172e+0 | 1.724138e-4 | 1.655172e+0 | 1.724138e-4 |
| 24 | v(2) | V | 1.766E+01 | 5.000000e-3 | 1.765517e+1 | 4.827586e-3 | 1.765517e+1 | 4.827586e-3 |
| 24 | v(3) | V | 1.931E+01 | 5.000000e-3 | 1.931034e+1 | 3.448276e-4 | 1.931034e+1 | 3.448276e-4 |

### ac-series-rl

Source: [Lessons in Electric Circuits: ac r-l circuit   ](https://www.ibiblio.org/kuphaldt/electricCircuits/AC/AC_3.html), retrieved 2026-10-14.

- Original node numbers, polarity and ideal component values retained; names capitalized.
- Legacy print/plot cards replaced by native raw output; explicit .op added where the publication relies on implicit OP.
- No tolerance overrides; no model calibration. Published AC amplitude convention retained, not converted to RMS or peak.
- Remove incomplete trailing SIN token from AC-only voltage sources; retain AC amplitude and phase.

| Coordinate | Signal | Unit | Published simulated | ± rounding | spice-ts | TS abs error | ngspice-47 | ng abs error |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 60 | v(1,2) | V | 7.985E+00 | 5.000000e-4 | 7.984712e+0 | 2.884490e-4 | 7.984712e+0 | 2.884490e-4 |
| 60 | v(2) | V | 6.020E+00 | 5.000000e-4 | 6.020331e+0 | 3.306759e-4 | 6.020331e+0 | 3.306759e-4 |
| 60 | i(v1) | A | 1.597E+00 | 5.000000e-4 | 1.596942e+0 | 5.768980e-5 | 1.596942e+0 | 5.768980e-5 |
| 60 | vp(1,2) | degree | -3.702E+01 | 5.000000e-3 | -3.701564e+1 | 4.355427e-3 | -3.701564e+1 | 4.355427e-3 |
| 60 | vp(2) | degree | 5.298E+01 | 5.000000e-3 | 5.298436e+1 | 4.355427e-3 | 5.298436e+1 | 4.355427e-3 |
| 60 | ip(v1) | degree | 1.430E+02 | 5.000000e-2 | 1.429844e+2 | 1.564457e-2 | 1.429844e+2 | 1.564457e-2 |

### ac-series-rc

Source: [Lessons in Electric Circuits: ac r-c circuit   ](https://www.ibiblio.org/kuphaldt/electricCircuits/AC/AC_4.html), retrieved 2026-10-14.

- Original node numbers, polarity and ideal component values retained; names capitalized.
- Legacy print/plot cards replaced by native raw output; explicit .op added where the publication relies on implicit OP.
- No tolerance overrides; no model calibration. Published AC amplitude convention retained, not converted to RMS or peak.
- Remove incomplete trailing SIN token from AC-only voltage sources; retain AC amplitude and phase.

| Coordinate | Signal | Unit | Published simulated | ± rounding | spice-ts | TS abs error | ngspice-47 | ng abs error |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 60 | v(1,2) | V | 1.852E+00 | 5.000000e-4 | 1.852336e+0 | 3.355412e-4 | 1.852336e+0 | 3.355412e-4 |
| 60 | v(2) | V | 9.827E+00 | 5.000000e-4 | 9.826945e+0 | 5.474510e-5 | 9.826945e+0 | 5.474510e-5 |
| 60 | i(v1) | A | 3.705E-01 | 5.000000e-5 | 3.704671e-1 | 3.289176e-5 | 3.704671e-1 | 3.289176e-5 |
| 60 | vp(1,2) | degree | 7.933E+01 | 5.000000e-3 | 7.932525e+1 | 4.749412e-3 | 7.932525e+1 | 4.749412e-3 |
| 60 | vp(2) | degree | -1.067E+01 | 5.000000e-3 | -1.067475e+1 | 4.749412e-3 | -1.067475e+1 | 4.749412e-3 |
| 60 | ip(v1) | degree | -1.007E+02 | 5.000000e-2 | -1.006747e+2 | 2.525059e-2 | -1.006747e+2 | 2.525059e-2 |

### ac-series-rlc

Source: [Lessons in Electric Circuits: ac r-l-c circuit   ](https://www.ibiblio.org/kuphaldt/electricCircuits/AC/AC_5.html), retrieved 2026-10-14.

- Original node numbers, polarity and ideal component values retained; names capitalized.
- Legacy print/plot cards replaced by native raw output; explicit .op added where the publication relies on implicit OP.
- No tolerance overrides; no model calibration. Published AC amplitude convention retained, not converted to RMS or peak.
- Remove incomplete trailing SIN token from AC-only voltage sources; retain AC amplitude and phase.

| Coordinate | Signal | Unit | Published simulated | ± rounding | spice-ts | TS abs error | ngspice-47 | ng abs error |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 60 | v(1,2) | V | 1.943E+01 | 5.000000e-3 | 1.943355e+1 | 3.553228e-3 | 1.943355e+1 | 3.553228e-3 |
| 60 | v(2,3) | V | 1.905E+01 | 5.000000e-3 | 1.904832e+1 | 1.679887e-3 | 1.904832e+1 | 1.679887e-3 |
| 60 | v(3) | V | 1.375E+02 | 5.000000e-2 | 1.374643e+2 | 3.573075e-2 | 1.374643e+2 | 3.573075e-2 |
| 60 | i(v1) | A | 7.773E-02 | 5.000000e-6 | 7.773421e-2 | 4.212910e-6 | 7.773421e-2 | 4.212910e-6 |
| 60 | vp(1,2) | degree | 8.068E+01 | 5.000000e-3 | 8.068012e+1 | 1.168203e-4 | 8.068012e+1 | 1.168203e-4 |
| 60 | vp(2,3) | degree | 1.707E+02 | 5.000000e-2 | 1.706801e+2 | 1.988318e-2 | 1.706801e+2 | 1.988318e-2 |
| 60 | vp(3) | degree | -9.320E+00 | 5.000000e-4 | -9.319883e+0 | 1.168203e-4 | -9.319883e+0 | 1.168203e-4 |
| 60 | ip(v1) | degree | -9.932E+01 | 5.000000e-3 | -9.931988e+1 | 1.168203e-4 | -9.931988e+1 | 1.168203e-4 |

### ac-parallel-rlc

Source: [Lessons in Electric Circuits: ac r-l-c circuit ](https://www.ibiblio.org/kuphaldt/electricCircuits/AC/AC_5.html), retrieved 2026-10-14.

- Original node numbers, polarity and ideal component values retained; names capitalized.
- Legacy print/plot cards replaced by native raw output; explicit .op added where the publication relies on implicit OP.
- No tolerance overrides; no model calibration. Published AC amplitude convention retained, not converted to RMS or peak.
- Remove incomplete trailing SIN token from AC-only voltage sources; retain AC amplitude and phase.

| Coordinate | Signal | Unit | Published simulated | ± rounding | spice-ts | TS abs error | ngspice-47 | ng abs error |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 60 | i(vi) | A | 6.390E-01 | 5.000000e-5 | 6.390279e-1 | 2.791533e-5 | 6.390279e-1 | 2.791533e-5 |
| 60 | i(vir) | A | 4.800E-01 | 5.000000e-5 | 4.800000e-1 | 0.000000e+0 | 4.800000e-1 | 0.000000e+0 |
| 60 | i(vil) | A | 4.897E-01 | 5.000000e-5 | 4.897075e-1 | 7.517206e-6 | 4.897075e-1 | 7.517206e-6 |
| 60 | i(vic) | A | 6.786E-02 | 5.000000e-6 | 6.785840e-2 | 1.598682e-6 | 6.785840e-2 | 1.598682e-6 |
| 60 | ip(vi) | degree | -4.131E+01 | 5.000000e-3 | -4.131070e+1 | 6.974255e-4 | -4.131070e+1 | 6.974255e-4 |
| 60 | ip(vir) | degree | 0.000E+00 | 5.000000e-4 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 |
| 60 | ip(vil) | degree | -9.000E+01 | 5.000000e-3 | -9.000000e+1 | 0.000000e+0 | -9.000000e+1 | 0.000000e+0 |
| 60 | ip(vic) | degree | 9.000E+01 | 5.000000e-3 | 9.000000e+1 | 0.000000e+0 | 9.000000e+1 | 0.000000e+0 |

### ac-mixed-rlc

Source: [Lessons in Electric Circuits: ac series-parallel r-l-c circuit  ](https://www.ibiblio.org/kuphaldt/electricCircuits/AC/AC_5.html), retrieved 2026-10-14.

- Original node numbers, polarity and ideal component values retained; names capitalized.
- Legacy print/plot cards replaced by native raw output; explicit .op added where the publication relies on implicit OP.
- No tolerance overrides; no model calibration. Published AC amplitude convention retained, not converted to RMS or peak.
- Remove incomplete trailing SIN token from AC-only voltage sources; retain AC amplitude and phase.

| Coordinate | Signal | Unit | Published simulated | ± rounding | spice-ts | TS abs error | ngspice-47 | ng abs error |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 60 | v(2,3) | V | 8.276E+01 | 5.000000e-3 | 8.275976e+1 | 2.391821e-4 | 8.275976e+1 | 2.391821e-4 |
| 60 | vp(2,3) | degree | -3.163E+01 | 5.000000e-3 | -3.162883e+1 | 1.170110e-3 | -3.162883e+1 | 1.170110e-3 |
| 60 | i(vit) | A | 1.466E-01 | 5.000000e-5 | 1.466386e-1 | 3.856552e-5 | 1.466386e-1 | 3.856552e-5 |
| 60 | ip(vit) | degree | 5.837E+01 | 5.000000e-3 | 5.837117e+1 | 1.170110e-3 | 5.837117e+1 | 1.170110e-3 |
| 60 | v(4,5) | V | 1.059E+01 | 5.000000e-3 | 1.059369e+1 | 3.694440e-3 | 1.059369e+1 | 3.694440e-3 |
| 60 | vp(4,5) | degree | -1.388E+02 | 5.000000e-2 | -1.387755e+2 | 2.451469e-2 | -1.387755e+2 | 2.451469e-2 |
| 60 | i(vilc) | A | 4.323E-02 | 5.000000e-6 | 4.323177e-2 | 1.765021e-6 | 4.323177e-2 | 1.765021e-6 |
| 60 | ip(vilc) | degree | 1.312E+02 | 5.000000e-2 | 1.312245e+2 | 2.451469e-2 | 1.312245e+2 | 2.451469e-2 |
| 60 | v(5) | V | 7.645E+01 | 5.000000e-3 | 7.645055e+1 | 5.455735e-4 | 7.645055e+1 | 5.455735e-4 |
| 60 | vp(5) | degree | 4.122E+01 | 5.000000e-3 | 4.122451e+1 | 4.514686e-3 | 4.122451e+1 | 4.514686e-3 |
| 60 | v(6) | V | 6.586E+01 | 5.000000e-3 | 6.585685e+1 | 3.148867e-3 | 6.585685e+1 | 3.148867e-3 |
| 60 | vp(6) | degree | 4.122E+01 | 5.000000e-3 | 4.122451e+1 | 4.514686e-3 | 4.122451e+1 | 4.514686e-3 |
| 60 | i(vir) | A | 1.401E-01 | 5.000000e-5 | 1.401210e-1 | 2.095986e-5 | 1.401210e-1 | 2.095986e-5 |
| 60 | ip(vir) | degree | 4.122E+01 | 5.000000e-3 | 4.122451e+1 | 4.514686e-3 | 4.122451e+1 | 4.514686e-3 |

### ac-lc-ladder

Source: [Lessons in Electric Circuits: Lowpass filter](https://www.ibiblio.org/kuphaldt/electricCircuits/Ref/REF_7.html), retrieved 2026-10-14.

- Original node numbers, polarity and ideal component values retained; names capitalized.
- Legacy print/plot cards replaced by native raw output; explicit .op added where the publication relies on implicit OP.
- No tolerance overrides; no model calibration. Published AC amplitude convention retained, not converted to RMS or peak.
- Remove incomplete trailing SIN token from AC-only voltage sources; retain AC amplitude and phase.

| Coordinate | Signal | Unit | Published simulated | ± rounding | spice-ts | TS abs error | ngspice-47 | ng abs error |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 500 | v(4) | V | 1.935E-01 | 5.000000e-5 | 1.934984e-1 | 1.583007e-6 | 1.934984e-1 | 1.583007e-6 |
| 1000 | v(4) | V | 3.275E-02 | 5.000000e-6 | 3.275404e-2 | 4.044106e-6 | 3.275404e-2 | 4.044106e-6 |
| 1500 | v(4) | V | 1.057E-02 | 5.000000e-6 | 1.057179e-2 | 1.794023e-6 | 1.057179e-2 | 1.794023e-6 |
| 2000 | v(4) | V | 4.614E-03 | 5.000000e-7 | 4.613810e-3 | 1.899271e-7 | 4.613810e-3 | 1.899271e-7 |
| 2500 | v(4) | V | 2.402E-03 | 5.000000e-7 | 2.401654e-3 | 3.457335e-7 | 2.401654e-3 | 3.457335e-7 |
| 3000 | v(4) | V | 1.403E-03 | 5.000000e-7 | 1.402724e-3 | 2.761080e-7 | 1.402724e-3 | 2.761080e-7 |
| 3500 | v(4) | V | 8.884E-04 | 5.000000e-8 | 8.883501e-4 | 4.987092e-8 | 8.883501e-4 | 4.987092e-8 |
| 4000 | v(4) | V | 5.973E-04 | 5.000000e-8 | 5.973314e-4 | 3.140306e-8 | 5.973314e-4 | 3.140306e-8 |
| 4500 | v(4) | V | 4.206E-04 | 5.000000e-8 | 4.205975e-4 | 2.543025e-9 | 4.205975e-4 | 2.543025e-9 |
| 5000 | v(4) | V | 3.072E-04 | 5.000000e-8 | 3.071786e-4 | 2.143022e-8 | 3.071786e-4 | 2.143022e-8 |
| 5500 | v(4) | V | 2.311E-04 | 5.000000e-8 | 2.311023e-4 | 2.314663e-9 | 2.311023e-4 | 2.314663e-9 |
| 6000 | v(4) | V | 1.782E-04 | 5.000000e-8 | 1.781926e-4 | 7.443730e-9 | 1.781926e-4 | 7.443730e-9 |
| 6500 | v(4) | V | 1.403E-04 | 5.000000e-8 | 1.402668e-4 | 3.321366e-8 | 1.402668e-4 | 3.321366e-8 |
| 7000 | v(4) | V | 1.124E-04 | 5.000000e-8 | 1.123777e-4 | 2.228351e-8 | 1.123777e-4 | 2.228351e-8 |
| 7500 | v(4) | V | 9.141E-05 | 5.000000e-9 | 9.141474e-5 | 4.736677e-9 | 9.141474e-5 | 4.736677e-9 |
| 8000 | v(4) | V | 7.536E-05 | 5.000000e-9 | 7.535549e-5 | 4.505633e-9 | 7.535549e-5 | 4.505633e-9 |
| 8500 | v(4) | V | 6.285E-05 | 5.000000e-9 | 6.284655e-5 | 3.448095e-9 | 6.284655e-5 | 3.448095e-9 |
| 9000 | v(4) | V | 5.296E-05 | 5.000000e-9 | 5.295894e-5 | 1.058481e-9 | 5.295894e-5 | 1.058481e-9 |
| 9500 | v(4) | V | 4.504E-05 | 5.000000e-9 | 4.504068e-5 | 6.757588e-10 | 4.504068e-5 | 6.757588e-10 |
| 10000 | v(4) | V | 3.863E-05 | 5.000000e-9 | 3.862502e-5 | 4.979266e-9 | 3.862502e-5 | 4.979266e-9 |
| 10500 | v(4) | V | 3.337E-05 | 5.000000e-9 | 3.337190e-5 | 1.897784e-9 | 3.337190e-5 | 1.897784e-9 |
| 11000 | v(4) | V | 2.903E-05 | 5.000000e-9 | 2.902954e-5 | 4.584033e-10 | 2.902954e-5 | 4.584033e-10 |
| 11500 | v(4) | V | 2.541E-05 | 5.000000e-9 | 2.540887e-5 | 1.132726e-9 | 2.540887e-5 | 1.132726e-9 |
| 12000 | v(4) | V | 2.237E-05 | 5.000000e-9 | 2.236600e-5 | 4.002138e-9 | 2.236600e-5 | 4.002138e-9 |
| 12500 | v(4) | V | 1.979E-05 | 5.000000e-9 | 1.979014e-5 | 1.427264e-10 | 1.979014e-5 | 1.427264e-10 |
| 13000 | v(4) | V | 1.760E-05 | 5.000000e-9 | 1.759505e-5 | 4.948063e-9 | 1.759505e-5 | 4.948063e-9 |
| 13500 | v(4) | V | 1.571E-05 | 5.000000e-9 | 1.571290e-5 | 2.902483e-9 | 1.571290e-5 | 2.902483e-9 |
| 14000 | v(4) | V | 1.409E-05 | 5.000000e-9 | 1.408986e-5 | 1.352233e-10 | 1.408986e-5 | 1.352233e-10 |
| 14500 | v(4) | V | 1.268E-05 | 5.000000e-9 | 1.268285e-5 | 2.847348e-9 | 1.268285e-5 | 2.847348e-9 |
| 15000 | v(4) | V | 1.146E-05 | 5.000000e-9 | 1.145708e-5 | 2.921089e-9 | 1.145708e-5 | 2.921089e-9 |

### dc-intro-network

Source: [Lessons in Electric Circuits: Example netlist](https://www.ibiblio.org/kuphaldt/electricCircuits/Ref/REF_7.html), retrieved 2026-10-14.

Excluded: Netlist says R3=150 ohm but explanatory prose says 150 kohm. Use explicit netlist for diagnostic runs only; exclude from totals.

- Original node numbers, polarity and ideal component values retained; names capitalized.
- Legacy print/plot cards replaced by native raw output; explicit .op added where the publication relies on implicit OP.
- No tolerance overrides; no model calibration. Published AC amplitude convention retained, not converted to RMS or peak.

| Coordinate | Signal | Unit | Published simulated | ± rounding | spice-ts | TS abs error | ngspice-47 | ng abs error |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | v(1) | V | 15.0000 | 5.000000e-5 | 1.500000e+1 | 0.000000e+0 | 1.500000e+1 | 0.000000e+0 |
| 0 | v(2) | V | 0.6522 | 5.000000e-5 | 6.521739e-1 | 2.608696e-5 | 6.521739e-1 | 2.608696e-5 |

### tran-rc-delay

Source: [Lessons in Electric Circuits: RC time delay circuit](https://www.ibiblio.org/kuphaldt/electricCircuits/Ref/REF_7.html), retrieved 2026-10-14.

- Original node numbers, polarity and ideal component values retained; names capitalized.
- Legacy print/plot cards replaced by native raw output; explicit .op added where the publication relies on implicit OP.
- No tolerance overrides; no model calibration. Published AC amplitude convention retained, not converted to RMS or peak.
- Retain UIC and both capacitor IC=0 cards. Linear interpolation at every published time; historical integration error is not covered by printed rounding.

| Coordinate | Signal | Unit | Published simulated | ± rounding | spice-ts | TS abs error | ngspice-47 | ng abs error |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | v(1,2) | V | 7.701E-06 | 5.000000e-10 | missing | missing | missing | missing |
| 0.05 | v(1,2) | V | 1.967E+00 | 5.000000e-4 | 1.971839e+0 | 4.838579e-3 | 1.971839e+0 | 4.838579e-3 |
| 0.1 | v(1,2) | V | 3.551E+00 | 5.000000e-4 | 3.554919e+0 | 3.919183e-3 | 3.554919e+0 | 3.919183e-3 |
| 0.15 | v(1,2) | V | 4.824E+00 | 5.000000e-4 | 4.821301e+0 | 2.699497e-3 | 4.821301e+0 | 2.699497e-3 |
| 0.2 | v(1,2) | V | 5.844E+00 | 5.000000e-4 | 5.846879e+0 | 2.878811e-3 | 5.846879e+0 | 2.878811e-3 |
| 0.25 | v(1,2) | V | 6.664E+00 | 5.000000e-4 | 6.662917e+0 | 1.082531e-3 | 6.662917e+0 | 1.082531e-3 |
| 0.3 | v(1,2) | V | 7.322E+00 | 5.000000e-4 | 7.323786e+0 | 1.785985e-3 | 7.323786e+0 | 1.785985e-3 |
| 0.35 | v(1,2) | V | 7.851E+00 | 5.000000e-4 | 7.849630e+0 | 1.369958e-3 | 7.849630e+0 | 1.369958e-3 |
| 0.4 | v(1,2) | V | 8.274E+00 | 5.000000e-4 | 8.275485e+0 | 1.484599e-3 | 8.275485e+0 | 1.484599e-3 |
| 0.45 | v(1,2) | V | 8.615E+00 | 5.000000e-4 | 8.614331e+0 | 6.687435e-4 | 8.614331e+0 | 6.687435e-4 |
| 0.5 | v(1,2) | V | 8.888E+00 | 5.000000e-4 | 8.888746e+0 | 7.460601e-4 | 8.888746e+0 | 7.460601e-4 |
| 0.55 | v(1,2) | V | 9.107E+00 | 5.000000e-4 | 9.107094e+0 | 9.417268e-5 | 9.107094e+0 | 9.417268e-5 |
| 0.6 | v(1,2) | V | 9.283E+00 | 5.000000e-4 | 9.283923e+0 | 9.232874e-4 | 9.283923e+0 | 9.232874e-4 |
| 0.65 | v(1,2) | V | 9.425E+00 | 5.000000e-4 | 9.424624e+0 | 3.762002e-4 | 9.424624e+0 | 3.762002e-4 |
| 0.7 | v(1,2) | V | 9.538E+00 | 5.000000e-4 | 9.538570e+0 | 5.700425e-4 | 9.538570e+0 | 5.700425e-4 |
| 0.75 | v(1,2) | V | 9.629E+00 | 5.000000e-4 | 9.629236e+0 | 2.355121e-4 | 9.629236e+0 | 2.355121e-4 |
| 0.8 | v(1,2) | V | 9.702E+00 | 5.000000e-4 | 9.702661e+0 | 6.608994e-4 | 9.702661e+0 | 6.608994e-4 |
| 0.85 | v(1,2) | V | 9.761E+00 | 5.000000e-4 | 9.761084e+0 | 8.447755e-5 | 9.761084e+0 | 8.447755e-5 |
| 0.9 | v(1,2) | V | 9.808E+00 | 5.000000e-4 | 9.808399e+0 | 3.987844e-4 | 9.808399e+0 | 3.987844e-4 |
| 0.95 | v(1,2) | V | 9.846E+00 | 5.000000e-4 | 9.846046e+0 | 4.613243e-5 | 9.846046e+0 | 4.613244e-5 |
| 1 | v(1,2) | V | 9.877E+00 | 5.000000e-4 | 9.876535e+0 | 4.651808e-4 | 9.876535e+0 | 4.651808e-4 |

### ac-multiple-source

Source: [Lessons in Electric Circuits: Multiple ac source](https://www.ibiblio.org/kuphaldt/electricCircuits/Ref/REF_7.html), retrieved 2026-10-14.

- Original node numbers, polarity and ideal component values retained; names capitalized.
- Legacy print/plot cards replaced by native raw output; explicit .op added where the publication relies on implicit OP.
- No tolerance overrides; no model calibration. Published AC amplitude convention retained, not converted to RMS or peak.
- Remove incomplete trailing SIN token from AC-only voltage sources; retain AC amplitude and phase.

| Coordinate | Signal | Unit | Published simulated | ± rounding | spice-ts | TS abs error | ngspice-47 | ng abs error |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 30 | v(2) | V | 1.413E+02 | 5.000000e-2 | 1.413088e+2 | 8.789455e-3 | 1.413088e+2 | 8.789455e-3 |

### ac-phase-shift

Source: [Lessons in Electric Circuits: phase shift](https://www.ibiblio.org/kuphaldt/electricCircuits/Ref/REF_7.html), retrieved 2026-10-14.

- Original node numbers, polarity and ideal component values retained; names capitalized.
- Legacy print/plot cards replaced by native raw output; explicit .op added where the publication relies on implicit OP.
- No tolerance overrides; no model calibration. Published AC amplitude convention retained, not converted to RMS or peak.
- Remove incomplete trailing SIN token from AC-only voltage sources; retain AC amplitude and phase.

| Coordinate | Signal | Unit | Published simulated | ± rounding | spice-ts | TS abs error | ngspice-47 | ng abs error |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1000 | v(1,2) | V | 6.366E-04 | 5.000000e-8 | 6.366198e-4 | 1.976430e-8 | 6.366198e-4 | 1.976430e-8 |
| 1000 | v(1,3) | V | 6.349E-04 | 5.000000e-8 | 6.348199e-4 | 8.013014e-8 | 6.348199e-4 | 8.013014e-8 |
| 1000 | vp(1,2) | degree | -9.000E+01 | 5.000000e-3 | -8.999088e+1 | 9.118906e-3 | -8.999088e+1 | 9.118906e-3 |
| 1000 | vp(1,3) | degree | 0.000E+00 | 5.000000e-4 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 |

### ac-three-winding-transformer

Source: [Lessons in Electric Circuits: transformer                                                                     ](https://www.ibiblio.org/kuphaldt/electricCircuits/Ref/REF_7.html), retrieved 2026-10-14.

- Original node numbers, polarity and ideal component values retained; names capitalized.
- Legacy print/plot cards replaced by native raw output; explicit .op added where the publication relies on implicit OP.
- No tolerance overrides; no model calibration. Published AC amplitude convention retained, not converted to RMS or peak.
- Remove incomplete trailing SIN token from AC-only voltage sources; retain AC amplitude and phase.

| Coordinate | Signal | Unit | Published simulated | ± rounding | spice-ts | TS abs error | ngspice-47 | ng abs error |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 60 | v(1) | V | 1.200E+02 | 5.000000e-2 | 1.200000e+2 | 0.000000e+0 | 1.200000e+2 | 0.000000e+0 |
| 60 | v(2) | V | 1.199E+01 | 5.000000e-3 | 1.198636e+1 | 3.643705e-3 | 1.198636e+1 | 3.643687e-3 |
| 60 | v(3) | V | 5.993E+01 | 5.000000e-3 | 5.992912e+1 | 8.757679e-4 | 5.992912e+1 | 8.757637e-4 |

### dc-common-base-bjt

Source: [Lessons in Electric Circuits: Common-base BJT amplifier](https://www.ibiblio.org/kuphaldt/electricCircuits/Ref/REF_7.html), retrieved 2026-10-14.

- Original node numbers, polarity and ideal component values retained; names capitalized.
- Legacy print/plot cards replaced by native raw output; explicit .op added where the publication relies on implicit OP.
- No tolerance overrides; no model calibration. Published AC amplitude convention retained, not converted to RMS or peak.
- Fill omitted initial source DC value with sweep start; published .dc sweep is unchanged.
- BF=50 as published; all unspecified NPN model parameters use engine defaults. Historical SPICE2g6 defaults may differ; comparison is not a measured device validation.

| Coordinate | Signal | Unit | Published simulated | ± rounding | spice-ts | TS abs error | ngspice-47 | ng abs error |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | v(2,3) | V | 2.400E+01 | 5.000000e-3 | 2.400000e+1 | 3.840017e-8 | 2.400000e+1 | 3.840017e-8 |
| 0.1 | v(2,3) | V | 2.410E+01 | 5.000000e-3 | 2.410000e+1 | 3.841439e-8 | 2.410000e+1 | 3.841052e-8 |
| 0.2 | v(2,3) | V | 2.420E+01 | 5.000000e-3 | 2.420000e+1 | 3.862585e-8 | 2.420000e+1 | 3.862585e-8 |
| 0.3 | v(2,3) | V | 2.430E+01 | 5.000000e-3 | 2.430000e+1 | 4.825814e-8 | 2.430000e+1 | 4.825814e-8 |
| 0.4 | v(2,3) | V | 2.440E+01 | 5.000000e-3 | 2.440000e+1 | 5.078519e-7 | 2.440000e+1 | 5.078519e-7 |
| 0.5 | v(2,3) | V | 2.450E+01 | 5.000000e-3 | 2.449998e+1 | 2.245658e-5 | 2.449998e+1 | 2.245658e-5 |
| 0.6 | v(2,3) | V | 2.460E+01 | 5.000000e-3 | 2.459893e+1 | 1.065911e-3 | 2.459893e+1 | 1.065900e-3 |
| 0.7 | v(2,3) | V | 2.466E+01 | 5.000000e-3 | 2.465752e+1 | 2.477805e-3 | 2.465752e+1 | 2.477677e-3 |
| 0.8 | v(2,3) | V | 2.439E+01 | 5.000000e-3 | 2.439114e+1 | 1.137483e-3 | 2.439114e+1 | 1.138498e-3 |
| 0.9 | v(2,3) | V | 2.383E+01 | 5.000000e-3 | 2.382742e+1 | 2.581655e-3 | 2.382742e+1 | 2.579428e-3 |
| 1 | v(2,3) | V | 2.317E+01 | 5.000000e-3 | 2.316582e+1 | 4.177064e-3 | 2.316637e+1 | 3.632483e-3 |
| 1.1 | v(2,3) | V | 2.246E+01 | 5.000000e-3 | 2.246442e+1 | 4.424083e-3 | 2.246444e+1 | 4.444779e-3 |
| 1.2 | v(2,3) | V | 2.174E+01 | 5.000000e-3 | 2.174222e+1 | 2.215796e-3 | 2.174304e+1 | 3.041093e-3 |
| 1.3 | v(2,3) | V | 2.101E+01 | 5.000000e-3 | 2.100737e+1 | 2.630766e-3 | 2.100778e+1 | 2.215636e-3 |
| 1.4 | v(2,3) | V | 2.026E+01 | 5.000000e-3 | 2.026408e+1 | 4.079809e-3 | 2.026423e+1 | 4.227569e-3 |
| 1.5 | v(2,3) | V | 1.951E+01 | 5.000000e-3 | 1.951477e+1 | 4.769510e-3 | 1.951484e+1 | 4.842277e-3 |
| 1.6 | v(2,3) | V | 1.876E+01 | 5.000000e-3 | 1.876096e+1 | 9.572031e-4 | 1.876100e+1 | 9.997803e-4 |
| 1.7 | v(2,3) | V | 1.800E+01 | 5.000000e-3 | 1.800366e+1 | 3.655609e-3 | 1.800368e+1 | 3.681518e-3 |
| 1.8 | v(2,3) | V | 1.724E+01 | 5.000000e-3 | 1.724357e+1 | 3.572602e-3 | 1.724359e+1 | 3.589121e-3 |
| 1.9 | v(2,3) | V | 1.648E+01 | 5.000000e-3 | 1.648122e+1 | 1.221847e-3 | 1.648123e+1 | 1.232858e-3 |
| 2 | v(2,3) | V | 1.572E+01 | 5.000000e-3 | 1.571699e+1 | 3.012417e-3 | 1.571700e+1 | 3.004806e-3 |
| 2.1 | v(2,3) | V | 1.495E+01 | 5.000000e-3 | 1.495116e+1 | 1.164560e-3 | 1.495117e+1 | 1.169984e-3 |
| 2.2 | v(2,3) | V | 1.418E+01 | 5.000000e-3 | 1.418398e+1 | 3.983725e-3 | 1.418399e+1 | 3.987691e-3 |
| 2.3 | v(2,3) | V | 1.342E+01 | 5.000000e-3 | 1.341563e+1 | 4.370675e-3 | 1.341563e+1 | 4.367709e-3 |
| 2.4 | v(2,3) | V | 1.265E+01 | 5.000000e-3 | 1.264625e+1 | 3.749334e-3 | 1.264625e+1 | 3.747073e-3 |
| 2.5 | v(2,3) | V | 1.188E+01 | 5.000000e-3 | 1.187597e+1 | 4.029610e-3 | 1.187597e+1 | 4.027856e-3 |
| 2.6 | v(2,3) | V | 1.110E+01 | 5.000000e-3 | 1.110489e+1 | 4.890450e-3 | 1.110489e+1 | 4.891830e-3 |
| 2.7 | v(2,3) | V | 1.033E+01 | 5.000000e-3 | 1.033310e+1 | 3.096500e-3 | 1.033310e+1 | 3.097601e-3 |
| 2.8 | v(2,3) | V | 9.560E+00 | 5.000000e-4 | 9.560661e+0 | 6.611863e-4 | 9.560662e+0 | 6.620752e-4 |
| 2.9 | v(2,3) | V | 8.787E+00 | 5.000000e-4 | 8.787647e+0 | 6.466447e-4 | 8.787647e+0 | 6.473701e-4 |
| 3 | v(2,3) | V | 8.014E+00 | 5.000000e-4 | 8.014106e+0 | 1.064312e-4 | 8.014107e+0 | 1.070289e-4 |
| 3.1 | v(2,3) | V | 7.240E+00 | 5.000000e-4 | 7.240087e+0 | 8.702744e-5 | 7.240088e+0 | 8.752433e-5 |
| 3.2 | v(2,3) | V | 6.465E+00 | 5.000000e-4 | 6.465629e+0 | 6.291292e-4 | 6.465629e+0 | 6.294476e-4 |
| 3.3 | v(2,3) | V | 5.691E+00 | 5.000000e-4 | 5.690768e+0 | 2.318100e-4 | 5.690768e+0 | 2.315415e-4 |
| 3.4 | v(2,3) | V | 4.915E+00 | 5.000000e-4 | 4.915536e+0 | 5.358231e-4 | 4.915536e+0 | 5.360513e-4 |
| 3.5 | v(2,3) | V | 4.140E+00 | 5.000000e-4 | 4.139960e+0 | 4.001767e-5 | 4.139960e+0 | 3.982264e-5 |
| 3.6 | v(2,3) | V | 3.364E+00 | 5.000000e-4 | 3.364066e+0 | 6.558886e-5 | 3.364066e+0 | 6.575656e-5 |
| 3.7 | v(2,3) | V | 2.588E+00 | 5.000000e-4 | 2.587875e+0 | 1.250457e-4 | 2.587875e+0 | 1.249008e-4 |
| 3.8 | v(2,3) | V | 1.811E+00 | 5.000000e-4 | 1.811408e+0 | 4.081316e-4 | 1.811408e+0 | 4.082576e-4 |
| 3.9 | v(2,3) | V | 1.034E+00 | 5.000000e-4 | 1.034683e+0 | 6.832097e-4 | 1.034683e+0 | 6.833197e-4 |
| 4 | v(2,3) | V | 2.587E-01 | 5.000000e-5 | 2.588565e-1 | 1.564795e-4 | 2.588559e-1 | 1.558786e-4 |
| 4.1 | v(2,3) | V | 9.744E-02 | 5.000000e-6 | 9.745124e-2 | 1.123675e-5 | 9.721631e-2 | 2.236907e-4 |
| 4.2 | v(2,3) | V | 7.815E-02 | 5.000000e-6 | 7.816066e-2 | 1.065758e-5 | 7.813802e-2 | 1.197970e-5 |
| 4.3 | v(2,3) | V | 6.806E-02 | 5.000000e-6 | 6.806182e-2 | 1.824577e-6 | 6.802460e-2 | 3.540291e-5 |
| 4.4 | v(2,3) | V | 6.141E-02 | 5.000000e-6 | 6.141719e-2 | 7.187693e-6 | 6.118319e-2 | 2.268102e-4 |
| 4.5 | v(2,3) | V | 5.657E-02 | 5.000000e-6 | 5.657616e-2 | 6.164000e-6 | 5.647787e-2 | 9.212522e-5 |
| 4.6 | v(2,3) | V | 5.281E-02 | 5.000000e-6 | 5.283506e-2 | 2.506328e-5 | 5.281138e-2 | 1.381057e-6 |
| 4.7 | v(2,3) | V | 4.981E-02 | 5.000000e-6 | 4.982954e-2 | 1.953661e-5 | 4.981924e-2 | 9.244360e-6 |
| 4.8 | v(2,3) | V | 4.734E-02 | 5.000000e-6 | 4.734715e-2 | 7.151433e-6 | 4.734103e-2 | 1.032583e-6 |
| 4.9 | v(2,3) | V | 4.525E-02 | 5.000000e-6 | 4.525362e-2 | 3.621487e-6 | 4.525004e-2 | 3.709119e-8 |
| 5 | v(2,3) | V | 4.346E-02 | 5.000000e-6 | 4.345892e-2 | 1.076454e-6 | 4.345673e-2 | 3.269718e-6 |

### dc-inverting-opamp

Source: [Lessons in Electric Circuits: Inverting opamp](https://www.ibiblio.org/kuphaldt/electricCircuits/Ref/REF_7.html), retrieved 2026-10-14.

- Original node numbers, polarity and ideal component values retained; names capitalized.
- Legacy print/plot cards replaced by native raw output; explicit .op added where the publication relies on implicit OP.
- No tolerance overrides; no model calibration. Published AC amplitude convention retained, not converted to RMS or peak.
- Fill omitted initial source DC value with sweep start; published .dc sweep is unchanged.

| Coordinate | Signal | Unit | Published simulated | ± rounding | spice-ts | TS abs error | ngspice-47 | ng abs error |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | v(3) | V | 0.000E+00 | 5.000000e-4 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 | 0.000000e+0 |
| 0.05 | v(3) | V | -1.394E-01 | 5.000000e-5 | -1.394063e-1 | 6.251043e-6 | -1.394063e-1 | 6.251043e-6 |
| 0.1 | v(3) | V | -2.788E-01 | 5.000000e-5 | -2.788125e-1 | 1.250209e-5 | -2.788125e-1 | 1.250209e-5 |
| 0.15 | v(3) | V | -4.182E-01 | 5.000000e-5 | -4.182188e-1 | 1.875313e-5 | -4.182188e-1 | 1.875313e-5 |
| 0.2 | v(3) | V | -5.576E-01 | 5.000000e-5 | -5.576250e-1 | 2.500417e-5 | -5.576250e-1 | 2.500417e-5 |
| 0.25 | v(3) | V | -6.970E-01 | 5.000000e-5 | -6.970313e-1 | 3.125521e-5 | -6.970313e-1 | 3.125521e-5 |
| 0.3 | v(3) | V | -8.364E-01 | 5.000000e-5 | -8.364375e-1 | 3.750626e-5 | -8.364375e-1 | 3.750626e-5 |
| 0.35 | v(3) | V | -9.758E-01 | 5.000000e-5 | -9.758438e-1 | 4.375730e-5 | -9.758438e-1 | 4.375730e-5 |
| 0.4 | v(3) | V | -1.115E+00 | 5.000000e-4 | -1.115250e+0 | 2.500083e-4 | -1.115250e+0 | 2.500083e-4 |
| 0.45 | v(3) | V | -1.255E+00 | 5.000000e-4 | -1.254656e+0 | 3.437406e-4 | -1.254656e+0 | 3.437406e-4 |
| 0.5 | v(3) | V | -1.394E+00 | 5.000000e-4 | -1.394063e+0 | 6.251043e-5 | -1.394063e+0 | 6.251043e-5 |
| 0.55 | v(3) | V | -1.533E+00 | 5.000000e-4 | -1.533469e+0 | 4.687615e-4 | -1.533469e+0 | 4.687615e-4 |
| 0.6 | v(3) | V | -1.673E+00 | 5.000000e-4 | -1.672875e+0 | 1.249875e-4 | -1.672875e+0 | 1.249875e-4 |
| 0.65 | v(3) | V | -1.812E+00 | 5.000000e-4 | -1.812281e+0 | 2.812636e-4 | -1.812281e+0 | 2.812636e-4 |
| 0.7 | v(3) | V | -1.952E+00 | 5.000000e-4 | -1.951688e+0 | 3.124854e-4 | -1.951688e+0 | 3.124854e-4 |
| 0.75 | v(3) | V | -2.091E+00 | 5.000000e-4 | -2.091094e+0 | 9.376564e-5 | -2.091094e+0 | 9.376564e-5 |
| 0.8 | v(3) | V | -2.231E+00 | 5.000000e-4 | -2.230500e+0 | 4.999833e-4 | -2.230500e+0 | 4.999833e-4 |
| 0.85 | v(3) | V | -2.370E+00 | 5.000000e-4 | -2.369906e+0 | 9.373228e-5 | -2.369906e+0 | 9.373228e-5 |
| 0.9 | v(3) | V | -2.509E+00 | 5.000000e-4 | -2.509313e+0 | 3.125188e-4 | -2.509313e+0 | 3.125188e-4 |
| 0.95 | v(3) | V | -2.649E+00 | 5.000000e-4 | -2.648719e+0 | 2.812302e-4 | -2.648719e+0 | 2.812302e-4 |
| 1 | v(3) | V | -2.788E+00 | 5.000000e-4 | -2.788125e+0 | 1.250209e-4 | -2.788125e+0 | 1.250209e-4 |
| 1.05 | v(3) | V | -2.928E+00 | 5.000000e-4 | -2.927531e+0 | 4.687281e-4 | -2.927531e+0 | 4.687281e-4 |
| 1.1 | v(3) | V | -3.067E+00 | 5.000000e-4 | -3.066938e+0 | 6.247706e-5 | -3.066938e+0 | 6.247706e-5 |
| 1.15 | v(3) | V | -3.206E+00 | 5.000000e-4 | -3.206344e+0 | 3.437740e-4 | -3.206344e+0 | 3.437740e-4 |
| 1.2 | v(3) | V | -3.346E+00 | 5.000000e-4 | -3.345750e+0 | 2.499750e-4 | -3.345750e+0 | 2.499750e-4 |
| 1.25 | v(3) | V | -3.485E+00 | 5.000000e-4 | -3.485156e+0 | 1.562761e-4 | -3.485156e+0 | 1.562761e-4 |
| 1.3 | v(3) | V | -3.625E+00 | 5.000000e-4 | -3.624563e+0 | 4.374729e-4 | -3.624563e+0 | 4.374729e-4 |
| 1.35 | v(3) | V | -3.764E+00 | 5.000000e-4 | -3.763969e+0 | 3.122185e-5 | -3.763969e+0 | 3.122185e-5 |
| 1.4 | v(3) | V | -3.903E+00 | 5.000000e-4 | -3.903375e+0 | 3.750292e-4 | -3.903375e+0 | 3.750292e-4 |
| 1.45 | v(3) | V | -4.043E+00 | 5.000000e-4 | -4.042781e+0 | 2.187198e-4 | -4.042781e+0 | 2.187198e-4 |
| 1.5 | v(3) | V | -4.182E+00 | 5.000000e-4 | -4.182188e+0 | 1.875313e-4 | -4.182188e+0 | 1.875313e-4 |
| 1.55 | v(3) | V | -4.322E+00 | 5.000000e-4 | -4.321594e+0 | 4.062177e-4 | -4.321594e+0 | 4.062177e-4 |
| 1.6 | v(3) | V | -4.461E+00 | 5.000000e-4 | -4.461000e+0 | 3.336375e-8 | -4.461000e+0 | 3.336375e-8 |
| 1.65 | v(3) | V | -4.600E+00 | 5.000000e-4 | -4.600406e+0 | 4.062844e-4 | -4.600406e+0 | 4.062844e-4 |
| 1.7 | v(3) | V | -4.740E+00 | 5.000000e-4 | -4.739813e+0 | 1.874646e-4 | -4.739813e+0 | 1.874646e-4 |
| 1.75 | v(3) | V | -4.879E+00 | 5.000000e-4 | -4.879219e+0 | 2.187865e-4 | -4.879219e+0 | 2.187865e-4 |
| 1.8 | v(3) | V | -5.019E+00 | 5.000000e-4 | -5.018625e+0 | 3.749625e-4 | -5.018625e+0 | 3.749625e-4 |
| 1.85 | v(3) | V | -5.158E+00 | 5.000000e-4 | -5.158031e+0 | 3.128858e-5 | -5.158031e+0 | 3.128858e-5 |
| 1.9 | v(3) | V | -5.297E+00 | 5.000000e-4 | -5.297438e+0 | 4.375396e-4 | -5.297438e+0 | 4.375396e-4 |
| 1.95 | v(3) | V | -5.437E+00 | 5.000000e-4 | -5.436844e+0 | 1.562093e-4 | -5.436844e+0 | 1.562093e-4 |
| 2 | v(3) | V | -5.576E+00 | 5.000000e-4 | -5.576250e+0 | 2.500417e-4 | -5.576250e+0 | 2.500417e-4 |
| 2.05 | v(3) | V | -5.716E+00 | 5.000000e-4 | -5.715656e+0 | 3.437073e-4 | -5.715656e+0 | 3.437073e-4 |
| 2.1 | v(3) | V | -5.855E+00 | 5.000000e-4 | -5.855063e+0 | 6.254379e-5 | -5.855063e+0 | 6.254379e-5 |
| 2.15 | v(3) | V | -5.994E+00 | 5.000000e-4 | -5.994469e+0 | 4.687948e-4 | -5.994469e+0 | 4.687948e-4 |
| 2.2 | v(3) | V | -6.134E+00 | 5.000000e-4 | -6.133875e+0 | 1.249541e-4 | -6.133875e+0 | 1.249541e-4 |
| 2.25 | v(3) | V | -6.273E+00 | 5.000000e-4 | -6.273281e+0 | 2.812969e-4 | -6.273281e+0 | 2.812969e-4 |
| 2.3 | v(3) | V | -6.413E+00 | 5.000000e-4 | -6.412688e+0 | 3.124520e-4 | -6.412688e+0 | 3.124520e-4 |
| 2.35 | v(3) | V | -6.552E+00 | 5.000000e-4 | -6.552094e+0 | 9.379900e-5 | -6.552094e+0 | 9.379900e-5 |
| 2.4 | v(3) | V | -6.692E+00 | 5.000000e-4 | -6.691500e+0 | 4.999500e-4 | -6.691500e+0 | 4.999500e-4 |
| 2.45 | v(3) | V | -6.831E+00 | 5.000000e-4 | -6.830906e+0 | 9.369891e-5 | -6.830906e+0 | 9.369891e-5 |
| 2.5 | v(3) | V | -6.970E+00 | 5.000000e-4 | -6.970313e+0 | 3.125521e-4 | -6.970313e+0 | 3.125521e-4 |
| 2.55 | v(3) | V | -7.110E+00 | 5.000000e-4 | -7.109719e+0 | 2.811968e-4 | -7.109719e+0 | 2.811968e-4 |
| 2.6 | v(3) | V | -7.249E+00 | 5.000000e-4 | -7.249125e+0 | 1.250542e-4 | -7.249125e+0 | 1.250542e-4 |
| 2.65 | v(3) | V | -7.389E+00 | 5.000000e-4 | -7.388531e+0 | 4.686947e-4 | -7.388531e+0 | 4.686947e-4 |
| 2.7 | v(3) | V | -7.528E+00 | 5.000000e-4 | -7.527938e+0 | 6.244370e-5 | -7.527938e+0 | 6.244370e-5 |
| 2.75 | v(3) | V | -7.667E+00 | 5.000000e-4 | -7.667344e+0 | 3.438073e-4 | -7.667344e+0 | 3.438073e-4 |
| 2.8 | v(3) | V | -7.807E+00 | 5.000000e-4 | -7.806750e+0 | 2.499416e-4 | -7.806750e+0 | 2.499416e-4 |
| 2.85 | v(3) | V | -7.946E+00 | 5.000000e-4 | -7.946156e+0 | 1.563094e-4 | -7.946156e+0 | 1.563094e-4 |
| 2.9 | v(3) | V | -8.086E+00 | 5.000000e-4 | -8.085563e+0 | 4.374395e-4 | -8.085563e+0 | 4.374395e-4 |
| 2.95 | v(3) | V | -8.225E+00 | 5.000000e-4 | -8.224969e+0 | 3.118849e-5 | -8.224969e+0 | 3.118849e-5 |
| 3 | v(3) | V | -8.364E+00 | 5.000000e-4 | -8.364375e+0 | 3.750626e-4 | -8.364375e+0 | 3.750626e-4 |
| 3.05 | v(3) | V | -8.504E+00 | 5.000000e-4 | -8.503781e+0 | 2.186864e-4 | -8.503781e+0 | 2.186864e-4 |
| 3.1 | v(3) | V | -8.643E+00 | 5.000000e-4 | -8.643188e+0 | 1.875646e-4 | -8.643188e+0 | 1.875646e-4 |
| 3.15 | v(3) | V | -8.783E+00 | 5.000000e-4 | -8.782594e+0 | 4.061843e-4 | -8.782594e+0 | 4.061843e-4 |
| 3.2 | v(3) | V | -8.922E+00 | 5.000000e-4 | -8.922000e+0 | 6.672748e-8 | -8.922000e+0 | 6.672748e-8 |
| 3.25 | v(3) | V | -9.061E+00 | 5.000000e-4 | -9.061406e+0 | 4.063178e-4 | -9.061406e+0 | 4.063178e-4 |
| 3.3 | v(3) | V | -9.201E+00 | 5.000000e-4 | -9.200813e+0 | 1.874312e-4 | -9.200813e+0 | 1.874312e-4 |
| 3.35 | v(3) | V | -9.340E+00 | 5.000000e-4 | -9.340219e+0 | 2.188199e-4 | -9.340219e+0 | 2.188199e-4 |
| 3.4 | v(3) | V | -9.480E+00 | 5.000000e-4 | -9.479625e+0 | 3.749291e-4 | -9.479625e+0 | 3.749291e-4 |
| 3.45 | v(3) | V | -9.619E+00 | 5.000000e-4 | -9.619031e+0 | 3.132194e-5 | -9.619031e+0 | 3.132194e-5 |
| 3.5 | v(3) | V | -9.758E+00 | 5.000000e-4 | -9.758438e+0 | 4.375730e-4 | -9.758438e+0 | 4.375730e-4 |

### dc-noninverting-opamp

Source: [Lessons in Electric Circuits: noninverting opamp](https://www.ibiblio.org/kuphaldt/electricCircuits/Ref/REF_7.html), retrieved 2026-10-14.

- Original node numbers, polarity and ideal component values retained; names capitalized.
- Legacy print/plot cards replaced by native raw output; explicit .op added where the publication relies on implicit OP.
- No tolerance overrides; no model calibration. Published AC amplitude convention retained, not converted to RMS or peak.

| Coordinate | Signal | Unit | Published simulated | ± rounding | spice-ts | TS abs error | ngspice-47 | ng abs error |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | v(1) | V | 5.0000 | 5.000000e-5 | 4.999985e+0 | 1.501497e-5 | 4.999985e+0 | 1.501497e-5 |
| 0 | v(2) | V | 5.0000 | 5.000000e-5 | 5.000000e+0 | 0.000000e+0 | 5.000000e+0 | 0.000000e+0 |
| 0 | v(3) | V | 15.0000 | 5.000000e-5 | 1.499995e+1 | 4.504491e-5 | 1.499995e+1 | 4.504435e-5 |

### dc-instrumentation-amplifier

Source: [Lessons in Electric Circuits: Instrumentation amplifier](https://www.ibiblio.org/kuphaldt/electricCircuits/Ref/REF_7.html), retrieved 2026-10-14.

- Original node numbers, polarity and ideal component values retained; names capitalized.
- Legacy print/plot cards replaced by native raw output; explicit .op added where the publication relies on implicit OP.
- No tolerance overrides; no model calibration. Published AC amplitude convention retained, not converted to RMS or peak.
- Fill omitted initial source DC value with sweep start; published .dc sweep is unchanged.

| Coordinate | Signal | Unit | Published simulated | ± rounding | spice-ts | TS abs error | ngspice-47 | ng abs error |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | v(9) | V | 1.500E+01 | 5.000000e-3 | 1.499992e+1 | 7.507479e-5 | 1.499992e+1 | 7.507446e-5 |
| 0 | v(3,6) | V | -1.500E+01 | 5.000000e-3 | -1.499995e+1 | 4.504491e-5 | -1.499995e+1 | 4.504399e-5 |
| 1 | v(9) | V | 1.200E+01 | 5.000000e-3 | 1.199994e+1 | 6.005983e-5 | 1.199994e+1 | 6.006031e-5 |
| 1 | v(3,6) | V | -1.200E+01 | 5.000000e-3 | -1.199996e+1 | 3.603593e-5 | -1.199996e+1 | 3.603558e-5 |
| 2 | v(9) | V | 9.000E+00 | 5.000000e-4 | 8.999955e+0 | 4.504487e-5 | 8.999955e+0 | 4.504479e-5 |
| 2 | v(3,6) | V | -9.000E+00 | 5.000000e-4 | -8.999973e+0 | 2.702695e-5 | -8.999973e+0 | 2.702641e-5 |
| 3 | v(9) | V | 6.000E+00 | 5.000000e-4 | 5.999970e+0 | 3.002992e-5 | 5.999970e+0 | 3.002882e-5 |
| 3 | v(3,6) | V | -6.000E+00 | 5.000000e-4 | -5.999982e+0 | 1.801796e-5 | -5.999982e+0 | 1.801657e-5 |
| 4 | v(9) | V | 3.000E+00 | 5.000000e-4 | 2.999985e+0 | 1.501496e-5 | 2.999985e+0 | 1.501423e-5 |
| 4 | v(3,6) | V | -3.000E+00 | 5.000000e-4 | -2.999991e+0 | 9.008982e-6 | -2.999991e+0 | 9.008063e-6 |
| 5 | v(9) | V | 9.955E-11 | 5.000000e-15 | 1.084200e-15 | 9.954892e-11 | 8.486722e-10 | 7.491222e-10 |
| 5 | v(3,6) | V | -9.956E-11 | 5.000000e-15 | -8.881784e-16 | 9.955911e-11 | -8.872902e-10 | 7.877302e-10 |
| 6 | v(9) | V | -3.000E+00 | 5.000000e-4 | -2.999985e+0 | 1.501496e-5 | -2.999985e+0 | 1.501772e-5 |
| 6 | v(3,6) | V | 3.000E+00 | 5.000000e-4 | 2.999991e+0 | 9.008982e-6 | 2.999991e+0 | 9.011612e-6 |
| 7 | v(9) | V | -6.000E+00 | 5.000000e-4 | -5.999970e+0 | 3.002992e-5 | -5.999970e+0 | 3.003071e-5 |
| 7 | v(3,6) | V | 6.000E+00 | 5.000000e-4 | 5.999982e+0 | 1.801796e-5 | 5.999982e+0 | 1.801879e-5 |
| 8 | v(9) | V | -9.000E+00 | 5.000000e-4 | -8.999955e+0 | 4.504487e-5 | -8.999955e+0 | 4.504552e-5 |
| 8 | v(3,6) | V | 9.000E+00 | 5.000000e-4 | 8.999973e+0 | 2.702695e-5 | 8.999973e+0 | 2.702774e-5 |
| 9 | v(9) | V | -1.200E+01 | 5.000000e-3 | -1.199994e+1 | 6.005983e-5 | -1.199994e+1 | 6.006139e-5 |
| 9 | v(3,6) | V | 1.200E+01 | 5.000000e-3 | 1.199996e+1 | 3.603593e-5 | 1.199996e+1 | 3.603757e-5 |
| 10 | v(9) | V | -1.500E+01 | 5.000000e-3 | -1.499992e+1 | 7.507479e-5 | -1.499992e+1 | 7.507729e-5 |
| 10 | v(3,6) | V | 1.500E+01 | 5.000000e-3 | 1.499995e+1 | 4.504491e-5 | 1.499995e+1 | 4.504741e-5 |

## Coverage boundary

This is a reproducible textbook baseline, not evidence of vendor-model, commercial-simulator, semiconductor I–V/C–V or bench-measurement parity. Vendor/paper and measured/plot-digitized expansion remains separate future work. No before/after simulator claim: production code is unchanged; this PR adds 20 reference circuits / 270 published observations where this corpus previously had none.

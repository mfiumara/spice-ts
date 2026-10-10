# Issue #380 classic noise parity receipt

Issue: https://github.com/mfiumara/spice-ts/issues/380

## Root cause

spice-ts already simulated both fixtures (`simulate()` returned a 41-point `NoiseResult`). The classic-corpus harness (`benchmarks/corpus/classic/report.ts`, also used by `benchmarks/aggregate-report.ts`) had no `.noise` mapping. As a result, `runNativeSpiceTs` reported `no spice-ts result for analyses: noise`. A second gap would have hidden totals even with a mapping. ngspice-47 writes two `.noise` plots, "Noise Spectral Density Curves" and "Integrated Noise", and both comparers matched only the first plot of each analysis type.

## Fix (general, no fixture or tolerance changes)

- `runNativeSpiceTs` maps any `.noise` result onto ngspice-47's plot and vector names:
  - Spectra plot "Noise Spectral Density Curves" on the frequency grid, containing `onoise_spectrum` and `inoise_spectrum` (densities in V/sqrt(Hz), or A/sqrt(Hz) for a current input).
  - Totals plot "Integrated Noise" with one point, containing `v(onoise_total)` and either `i(inoise_total)` or `v(inoise_total)`. As in ngspice, the `i(...)` form is used when the input source is a current source (`I...` card).
- A new `findMatchingAnalysis` helper pairs a spice-ts plot with the ngspice plot of the same type and plot name. If no plot name matches, it falls back to the first plot of that type, so single-plot analyses are unaffected. Both the classic report and the aggregate report use it.
- Completeness is now checked by missing analysis types rather than by plot count, because one `.noise` produces two plots.

## Identical-netlist results (ngspice-47 vs spice-ts, matched points)

Fixtures are unchanged. bjtnoise.cir has SHA-256 `183a30585cee976f2990857df941ca500aea2755a1e4ecf946c14699f09b36fc` and resnoise.cir has `241ea1ce167a449e91b1cf29904f5c9513338cff31c2c0beb72a845482048661`.

| Fixture | Vector | n | abs max | abs RMS | rel max | rel RMS |
|---|---|---:|---:|---:|---:|---:|
| resistor-noise | onoise_spectrum | 41 | 7.077e-16 | 7.077e-16 | 1.738e-7 | 1.738e-7 |
| resistor-noise | inoise_spectrum | 41 | 7.077e-19 | 7.077e-19 | 1.738e-7 | 1.738e-7 |
| resistor-noise | v(onoise_total) | 1 | 2.238e-13 | 2.238e-13 | 1.738e-7 | 1.738e-7 |
| resistor-noise | i(inoise_total) | 1 | 2.238e-16 | 2.238e-16 | 1.738e-7 | 1.738e-7 |
| bjt-noise | onoise_spectrum | 41 | 1.064e-7 | 1.064e-7 | **6.522e-1** | **6.522e-1** |
| bjt-noise | inoise_spectrum | 41 | 2.917e-10 | 2.917e-10 | **6.654e-1** | **6.654e-1** |
| bjt-noise | v(onoise_total) | 1 | 3.366e-5 | 3.366e-5 | **6.522e-1** | **6.522e-1** |
| bjt-noise | v(inoise_total) | 1 | 9.224e-8 | 9.224e-8 | **6.654e-1** | **6.654e-1** |

The full machine-readable receipt is in `report.json`.

## Published losses

1. **bjt-noise is a 65% loss.** The cause is not in the noise analysis. The fixture's card `q1 3 2 0 0 test` hits the parser's "historical grounded-substrate compatibility" path (`packages/core/src/parser/bjt-parser.ts`), which takes the substrate token `0` as the model name. `Circuit.compile()` then builds a default NPN and silently ignores `.model test npn kf=1e-20 af=1 bf=100 rb=10`. The RB thermal, base-shot-through-RB and KF/AF noise are therefore absent. Diagnostic only, not a fixture edit: rewriting the card to `q1 3 2 0 test` gives spice-ts `onoise_total` = 5.1629e-5 V vs ngspice-47 5.1604e-5 V (rel. 4.8e-4). ngspice gives identical numbers for both forms. Filed as https://github.com/mfiumara/spice-ts/issues/382 (six other corpus fixtures use the same card shape). This lane is not the place to fix it: the change touches parser intent and other fixtures' aggregate outcomes.
2. **Per-generator vectors are not compared.** With `pts_per_summary` set, ngspice-47 also emits per-device and per-generator vectors. For bjt-noise that is 10 spectra (`onoise_q1_rb`, `onoise_q1_ic`, ..., `onoise_rload_thermal`) and 20 totals. For resistor-noise it is 3 spectra and 6 totals. spice-ts's public `NoiseResult` exposes only the aggregate output and input densities and totals, so these 39 vectors are listed under `notComparedNgspiceVectors` in `report.json` and are not compared.

## Reproduce

    pnpm -C packages/core build
    pnpm exec tsx benchmarks/results/issue-380/compare.ts --output benchmarks/results/issue-380/report.json
    pnpm exec tsx --test benchmarks/corpus/classic/report.test.ts

Machine: darwin arm64 (Apple M5 Pro), Node v22, ngspice-47 (Homebrew).

# #774: integrated-noise totals normalised by their own ngspice value

`normalizedSignalErrors` normalises each compared signal by the ngspice peak of that signal. The
lookup used to return the first ngspice plot of the analysis type. ngspice-47 `.noise` writes two
`noise` plots, `Noise Spectral Density Curves` and then `Integrated Noise`, and
`v(inoise_total)`/`v(onoise_total)` exist only in the second. Their ngspice peak was read as 0, so
the error was divided by the 1e-4 V node-voltage floor instead of the integrated value.

Fix: `pairedReferenceSeries` (corpus-f/lib.ts) returns, per signal, the ngspice plot that
`compareExecutions` paired it with (`findMatchingAnalysis`: plot-name match, else first plot of
the type). This is a metric change only. No simulator change, no per-circuit tuning, and the
threshold (0.01) and floors are unchanged. Because the old lookup could only lower the peak
(max(peak, floor) with peak read as 0), the fix can only reduce an overstated error. It never
hides one.

## Before/after (ngspice-47, identical bytes)

`measure.ts` takes every corpus-f/corpus-g fixture that mentions `noise`, runs both engines once,
and scores the same two executions with both lookups. The delta is the metric change alone. Raw
output: `before-after.json`.

| Corpus | Fixture | Committed row | Signal | abs. error | before (peak 0, floor) | after (own ngspice value) | Outcome |
|---|---|---|---|---|---|---|---|
| corpus-g | Netlists/NOISE/cascodeBjtNOISE.cir | matched, 5.53e-7 | noise v(onoise_total) | 5.53e-11 | 5.53e-7 | 8.51e-8 (peak 6.50e-4) | matched → matched |
| corpus-f | examples/various/bjtnoise.cir | spice-ts-loss (stale, see below) | noise v(onoise_total) | 1.54e-10 | 1.54e-6 | 1.50e-7 (peak 1.03e-3) | matched → matched |

- corpus-g `multiplicity-factor/bjt_diffpair_noise_baseline.net`: unchanged at 3.32e-5. Its worst
  signal is a spectrum, and none of its 4 normalised errors changes.
- corpus-f `examples/noise/resdiv.cir`, `resdiv_gain.cir`, `bipolar_noise.cir`: not-compared
  before and after, because no common signal was scored.
- The remaining 12 noise fixtures fail in spice-ts (unsupported or failed), so no metric applies.
  Their first error lines are in `before-after.json`. corpus-g
  `Netlists/VANOISE/commonEmitterBjt_mextram.cir` (the #774 example, 0.285 → 1.7e-7 per the issue)
  is still a spice-ts loss on main until #767 (DTA) lands.

## Committed outcome tables

- corpus-g `outcomes.json`/`README.md`: one value changed, cascodeBjtNOISE worst 5.53e-7 → 8.51e-8,
  via `parity.ts --relabel`. The outcome is still matched and the totals are unchanged. A fresh
  `runFixture` run on this head reproduces the row exactly (matched, 8.51e-8,
  `noise v(onoise_total)`, 4 signals).
- corpus-f `outcomes.json` is not edited here. Since that table was generated, simulator changes
  on main have moved `bjtnoise.cir` (committed spice-ts-loss, now matched 1.51e-7) and
  `bipolar_noise.cir` (committed spice-ts-loss, now not-compared). Those are simulator deltas,
  not metric deltas. They belong in the corpus-f refresh lane, which will score them with this
  metric.

Reproduce: `pnpm build && spice-heavy pnpm exec tsx benchmarks/results/issue-774/measure.ts`.

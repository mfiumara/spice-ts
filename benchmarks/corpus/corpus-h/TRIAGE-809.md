# corpus-h triage for #809: tlines.spice and legacy_sources.spice

After #783 (KiCad `GND` reads as ground), two KiCad QA decks run in both engines and exceed the 1% corpus-h threshold. This note gives the root cause for each. No simulator change follows from it. Fixtures, metric and threshold are unchanged, and both rows stay published mismatches.

Measured on main `18419173`, Homebrew ngspice-47, macOS arm64. Decks are byte-identical to `manifest.json`. Receipts are in `triage-809.test.ts`, which runs in the root `pnpm test`.

## tlines.spice: worst 0.0453, `tran v(/z0_out)` (and `v(/rlgc_out)`)

Both lines are matched (Z0 = 50 ohm into 50 ohm, LTRA `l=1.25m c=500n` gives Z0 = 50 ohm and TD = 25 us), so each far end is exactly the PULSE source delayed by 25 us.

| Measurement (`benchmarks/corpus/corpus-f/triage-detail.ts --deck <fixture>`) | v(/z0_out) | v(/rlgc_out) |
|---|---|---|
| (a) published metric: ngspice default run interpolated onto spice-ts points | 0.0453 | 0.0453 |
| (b) same pair at ngspice's own points | 0.00402 | 0.00177 |
| (c) spice-ts default vs ngspice `--reference-tmax 10n` | 0.0025 | 0.00291 |
| (d) ngspice default vs the same reference (`--candidate ngspice`) | all 22 signals <= 0.00403 | |
| spice-ts vs the analytic delayed pulse, 1753 points | 1.6e-13 | 2.9e-3 |
| ngspice vs the analytic delayed pulse, 1126 points | 0.00403 | 0.00403 |

ngspice-47 writes v(/z0_out) = 0.954032 at 76.05 us and -0.002381 at 77.05 us. It has no point at the 77 us corner where the delayed falling edge ends. spice-ts has a point there with value 0 (exact). Interpolating ngspice linearly to 77 us gives 0.0454, which is the published error. The lossless T model and the delayed-edge breakpoints in spice-ts are correct. This is the reference-grid artefact from #592: the metric scores ngspice's coarse default output step as a spice-ts error.

> **Update (#791, see TRIAGE-791.md).** spice-ts's 77 us point came from stepping that is not ngspice-47's: a breakpoint at TD and node-voltage truncation on the T-line ports. With the lossless T ported from ngspice-47 tra/ (traload.c quadratic interpolation, TRAaccept/TRAtrunc), spice-ts writes ngspice's 1126 points. tlines.spice is now matched at 1.08e-13. The analytic error at spice-ts's own points is now ngspice's 0.00403 on both lines, and the receipt in `triage-809.test.ts` pins that.

The LTRA error of 2.9e-3 against the analytic answer is spice-ts's own. It is below the threshold and below ngspice's own 4.0e-3 at its points.

## legacy_sources.spice: worst 2.94, `tran v(/itrrandom)`

Per-signal errors under the published metric:

| Signal class | Signals | Worst |
|---|---|---|
| random (TRNOISE white, TRRANDOM gaussian) | v(/vtrnoise), i(v8), v(/itrnoise), v(/vtrrandom), i(v9), v(/itrrandom) | 1.1 to 2.9 per run, changes every ngspice run |
| deterministic, worst | v(/vsin), v(/isin), i(v7): `SIN(0 1 100meg 1n 1e10)` | 0.0175 |
| deterministic, next | v(/vsffm), v(/isffm), i(v6) | 0.0012 |
| deterministic, rest (pulse, pwl, exp, am, dc) | 15 signals | <= 4.7e-6 |

**Worst deterministic signal: v(/vsin) at 0.0175.** This is the #592 artefact again. The source is a 100 MHz sine damped by theta = 1e10, so it peaks at 0.0229 V about 0.09 ns after TD and is gone within about 0.5 ns. Both engines are exact at their own points: ngspice max error 2.6e-16 over 19506 points, spice-ts 0 over 3029 points. ngspice brackets spice-ts's 1.0286 ns point with 1.0215 ns and 1.0429 ns on a concave rise. Linear interpolation there is 4.0e-4 low, which is 0.0175 of the peak.

**Random sources cannot be compared sample by sample, even with seeding.** ngspice-47 diagnostics (deck variants only, never scored):

- Two `ngspice -b` runs of the unchanged deck give different v(/vtrrandom), v(/itrrandom), v(/vtrnoise) and v(/itrnoise). v(/vsin) is identical. That is why `parity.ts --check` gave 2.94 and 2.93 on the same commit (#809 comment).
- `set rndseed=7` or `option seed=7` in `.spiceinit` does not make any of them reproducible.
- `.options seed=7` in the deck makes TRRANDOM reproducible. TRNOISE white noise stays non-reproducible, because ngspice fills its Wallace pool from `srand(getpid())` at start-up (see the header of `packages/core/src/devices/transient-noise.ts`).
- With `.options seed=7`, spice-ts matches ngspice's TRRANDOM draws for a deck with a single V or I TRRANDOM source (worst 8.5e-10). With a V and an I TRRANDOM source on the same TS (this deck), the draws agree up to 200 ns. Then ngspice's I source keeps its old value, because of the isrcacct.c freeze that spice-ts deliberately does not reproduce (`transient-noise-source.test.ts`, "keeps drawing a new value every TS"). From that point the shared uniform stream is offset and both sources diverge.

Seeding both engines identically is therefore not a sufficient corpus-wide rule. It would also need a deck edit or a harness option that ngspice-47 does not honour from `.spiceinit`.

## Proposed harness rule for random sources (for the #655 decision, not implemented here)

This applies to every corpus (corpus-f simple-noise and rts-1, corpus-h legacy_sources) and never per circuit:

1. Classify a signal as stochastic structurally, not by inspecting errors. Run spice-ts twice on the identical deck with two different harness-level seeds (an API option, not a netlist edit). Any signal whose waveform changes is stochastic. spice-ts is deterministic for a given seed, so the classification is reproducible.
2. Exclude stochastic signals from the max-abs metric and publish them in a separate column, "stochastic, not compared sample by sample", listing the signals. A deck with deterministic signals is matched or mismatched on those alone. A deck whose signals are all stochastic is `not-compared`, never `matched`.
3. Optionally add a statistical comparison later (RMS, PSD slope, RTS level occupancy), with a threshold that is fixed corpus-wide.

Under this rule legacy_sources.spice would still be a published mismatch, at 0.0175 on v(/vsin) (the #592 artefact). The corpus-h outcome digest would be reproducible run to run. Until the owner decides #655, the deck stays a published mismatch with the random-source number.

## Before and after

No simulator change, so the corpus-h numbers do not change:

| Fixture | Before (main 18419173) | After (this branch) |
|---|---|---|
| tlines.spice | mismatch 0.0453 v(/z0_out) | mismatch 0.0453 v(/z0_out) |
| legacy_sources.spice | mismatch 1.97 to 2.94 random signal (varies per ngspice run); worst deterministic 0.0175 v(/vsin) | same |
